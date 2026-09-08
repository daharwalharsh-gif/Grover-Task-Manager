// Google Sheet ke tabs ko padh kar FMS khud bana do.
//
//   npm run fms:setup -- <sheet-url-ya-id> "Bright Print" "Brightdye" "Lycra"
//   npm run fms:setup -- <sheet-url> --all        (form/Holidays chhod kar baaki sab)
//   npm run fms:setup -- <sheet-url> ... --dry    (sirf dikhao, DB me kuch mat likho)
//
// Kyun: FMS Admin page se ek FMS banane me har step ke liye Planned/Actual
// column haath se chunne padte hain. Teen tab x 3-4 step = 30+ dropdown, aur
// ek bhi galat hua to tracking galat step dikhati hai. Sheet me ye jaankari
// pehle se likhi hai, isliye wahin se padh lete hain.
//
// Sheet ka dhaancha jo ye maanta hai (Grover ki FMS sheets isi tarah bani hain):
//   • header row wo hai jisme "Planned" aur "Actual" saath likhe hain
//   • har step ka block: Planned | Actual | Time Delay | Status | TAT
//   • step ka naam header row ke UPAR wali rows me usi column par hota hai
//     (row 1 par "Step1", row 2 par asli naam jaise "print"/"finish")
//
// DOBARA CHALANA SAFE HAI: wahi sheet+tab pehle se ho to uski steps dobara
// likhi jaati hain (config refresh), naya FMS nahi banta — isliye purane
// task/record kahin nahi jaate.
require('dotenv').config({ quiet: true });
const path = require('path');
const db = require(path.join(__dirname, '..', 'db'));
const { getSheetsClient } = require(path.join(__dirname, '..', '..', 'backend', 'lib', 'google'));
const { extractSpreadsheetId } = require(path.join(__dirname, '..', '..', 'backend', 'lib', 'google'));
const { idxToCol } = require(path.join(__dirname, '..', '..', 'backend', 'lib', 'sheet-cols'));

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const ALL = argv.includes('--all');
// --live: DB ke bajaye chalti hui app ke admin API se banao. Hostinger ka
// MySQL sirf server ke andar se milta hai (DB_HOST=127.0.0.1), isliye laptop
// se seedha likhna mumkin nahi — par app to HTTPS par khadi hai.
const LIVE = argv.includes('--live');
const rest = argv.filter(a => !a.startsWith('--'));
const SHEET = rest[0];
const TABS = rest.slice(1);

if (!SHEET) {
  console.error('  Sheet ka URL ya id do:');
  console.error('    npm run fms:setup -- "<sheet-url>" "Bright Print" "Brightdye" "Lycra"');
  process.exit(1);
}

// Jin tabs me FMS nahi hota — form ke jawab aur holiday list.
const SKIP_TAB = /(\bform\b|holiday)/i;

function detect(values) {
  // 1. header row = jisme Planned aur Actual dono hon
  let hRow = -1;
  for (let i = 0; i < Math.min(values.length, 30); i++) {
    const row = (values[i] || []).map(c => String(c || '').trim().toLowerCase());
    if (row.includes('planned') && row.includes('actual')) { hRow = i; break; }
  }
  if (hRow < 0) return { error: 'header row nahi mila (jisme "Planned" aur "Actual" ho)' };

  const headers = (values[hRow] || []).map(c => String(c || '').trim());

  // Naam kis row me hai: sheet me ek row par "Step1 / Step2 / Step3" likha
  // hota hai, aur asli naam (print, finish, dispatch) uske THEEK NEECHE.
  // Uske neeche ki rows Who / How / When hain — When me sirf TAT ke ank hote
  // hain, isliye "sabse neeche wali gair-khaali" wala tarika galat naam uthata
  // hai (yahi pehle ho raha tha: naam "1" aur "0.5" ban gaye the).
  let stepLabelRow = -1;
  for (let r = 0; r < hRow; r++) {
    const row = values[r] || [];
    const marks = row.filter(c => /^step\s*\d+$/i.test(String(c || '').trim())).length;
    if (marks >= 1) { stepLabelRow = r; break; }
  }
  const isJunkName = v => !v || /^[\d.,\s]+$/.test(v) || /^(google sheet|whatsapp|email|manual|form)$/i.test(v);

  // 2. har "Planned" ek step ka shuruaat; uske aage "Actual" hona chahiye
  const steps = [];
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase() !== 'planned') continue;
    if (String(headers[i + 1] || '').trim().toLowerCase() !== 'actual') continue;
    // 3. naam: pehle "StepN" wali row ke neeche wali line, warna upar ki rows
    //    me se pehla aisa jo sirf ank ya "Google sheet" jaisa label na ho.
    let name = '';
    if (stepLabelRow >= 0) {
      const v = String((values[stepLabelRow + 1] || [])[i] || '').trim();
      if (!isJunkName(v)) name = v;
    }
    if (!name) {
      for (let r = 0; r < hRow; r++) {
        const v = String((values[r] || [])[i] || '').trim();
        if (isJunkName(v) || /^step\s*\d+$/i.test(v)) continue;
        name = v; break;
      }
    }
    if (!name && stepLabelRow >= 0) {
      const v = String((values[stepLabelRow] || [])[i] || '').trim();
      if (v) name = v;   // aakhir me "Step1" hi sahi
    }
    steps.push({
      order: steps.length + 1,
      name: name || `Step ${steps.length + 1}`,
      planCol: idxToCol(i + 1),
      planName: headers[i],
      actualCol: idxToCol(i + 2),
      actualName: headers[i + 1],
    });
  }
  if (!steps.length) return { error: 'koi step nahi mila (Planned+Actual ka joda nahi dikha)' };

  // Ek hi naam do baar ho (jaise dono dispatch) to number laga do, warna
  // tracking ke step filter me dono ek hi lagte hain.
  const seen = {};
  steps.forEach(s => {
    const k = s.name.toLowerCase();
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] > 1) s.name = `${s.name} ${seen[k]}`;
  });

  return { headerRow: hRow + 1, steps, headers };
}

// ── Live app ka admin session ──────────────────────
async function liveLogin() {
  const base = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  const email = (process.env.ADMIN_EMAIL || '').trim();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!base) throw new Error('APP_URL .env me chahiye (--live ke liye)');
  const r = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`Admin login fail (${r.status}) — ADMIN_EMAIL/ADMIN_PASSWORD dekho`);
  const cookie = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; ');
  const { token } = await r.json();
  return { base, headers: { 'Content-Type': 'application/json', Cookie: cookie, Authorization: `Bearer ${token}` } };
}

let live = null;   // --live ka admin session (pehli zarurat par banta hai)

(async () => {
  const spreadsheetId = extractSpreadsheetId(SHEET);
  const api = await getSheetsClient(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const meta = await api.spreadsheets.get({ spreadsheetId });
  const title = meta.data.properties.title;
  const allTabs = meta.data.sheets.map(s => s.properties.title);
  console.log(`  Sheet: ${title}`);

  let tabs = TABS.length ? TABS : (ALL ? allTabs.filter(t => !SKIP_TAB.test(t)) : []);
  if (!tabs.length) {
    console.error(`\n  Kaun se tab? Ye maujood hain:\n    ${allTabs.join('\n    ')}`);
    console.error('\n  Naam likho, ya --all lagao (form/holiday apne aap chhut jaate hain).');
    process.exit(1);
  }
  const unknown = tabs.filter(t => !allTabs.includes(t));
  if (unknown.length) { console.error(`\n  ❌ Ye tab sheet me nahi hain: ${unknown.join(', ')}`); process.exit(1); }

  for (const tab of tabs) {
    const q = /^[A-Za-z0-9_]+$/.test(tab) ? tab : `'${tab.replace(/'/g, "''")}'`;
    const values = (await api.spreadsheets.values.get({ spreadsheetId, range: q })).data.values || [];
    const d = detect(values);
    if (d.error) { console.log(`\n  ⚠️  ${tab}: ${d.error} — chhod diya`); continue; }

    console.log(`\n  ${tab}  (header row ${d.headerRow}, ${d.steps.length} steps, ${values.length - d.headerRow} records)`);
    d.steps.forEach(s => console.log(`     ${s.order}. ${s.name.padEnd(18)} planned=${s.planCol}  actual=${s.actualCol}`));
    if (DRY) continue;

    if (LIVE) {
      const api = live || (live = await liveLogin());
      const body = {
        fmsName: tab, sheetName: tab, sheetId: spreadsheetId,
        headerRow: d.headerRow, totalSteps: d.steps.length,
        steps: d.steps.map(s => ({
          stepName: s.name, planCol: s.planCol, actualCol: s.actualCol,
          extraInput: 'no', extraCol: '', showCols: [],
          delayReasonCol: '', doerNameCol: '', doers: [],
        })),
      };
      const listR = await fetch(`${api.base}/api/fms`, { headers: api.headers });
      const list = await listR.json();
      const existing = (Array.isArray(list) ? list : (list.fms || []))
        .find(f => f.sheet_id === spreadsheetId && f.sheet_name === tab);
      const r = existing
        ? await fetch(`${api.base}/api/fms/${existing.id}`, { method: 'PUT', headers: api.headers, body: JSON.stringify(body) })
        : await fetch(`${api.base}/api/fms`, { method: 'POST', headers: api.headers, body: JSON.stringify(body) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out.error) console.log(`     ❌ live par fail: ${out.error || r.status}`);
      else console.log(`     ${existing ? '♻️  live par refresh (id ' + existing.id + ')' : '✅ live par bana (id ' + out.id + ')'}`);
      continue;
    }

    const [ex] = await db.query('SELECT id FROM fms_sheets WHERE sheet_id=? AND sheet_name=?', [spreadsheetId, tab]);
    let fmsId;
    if (ex.length) {
      fmsId = ex[0].id;
      await db.query('UPDATE fms_sheets SET fms_name=?, header_row=?, total_steps=? WHERE id=?',
        [tab, d.headerRow, d.steps.length, fmsId]);
      await db.query('DELETE FROM fms_steps WHERE fms_id=?', [fmsId]);
      console.log(`     ♻️  pehle se tha (id ${fmsId}) — steps refresh kar diye`);
    } else {
      const [r] = await db.query(
        'INSERT INTO fms_sheets (fms_name, sheet_name, sheet_id, header_row, total_steps) VALUES (?,?,?,?,?)',
        [tab, tab, spreadsheetId, d.headerRow, d.steps.length]);
      fmsId = r.insertId;
      console.log(`     ✅ naya FMS bana (id ${fmsId})`);
    }
    for (const s of d.steps) {
      await db.query(
        `INSERT INTO fms_steps (fms_id, step_order, step_name, plan_col, plan_col_name, actual_col, actual_col_name)
         VALUES (?,?,?,?,?,?,?)`,
        [fmsId, s.order, s.name, s.planCol, s.planName, s.actualCol, s.actualName]);
    }
  }

  if (DRY) console.log('\n  (--dry tha — DB me kuch nahi likha)');
  await db.end();
})().catch(e => {
  console.error('\n  fms:setup fail:', e.message);
  if (e.code === 403) console.error('  Sheet service account ke saath share karo (Editor).');
  process.exit(1);
});
