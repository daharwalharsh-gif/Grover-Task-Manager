// data/seed-users.json ki staff list se users bana do.
//
//   npm run db:seed-users              → .env wale database par (local)
//   npm run db:seed-users -- --live    → chalti hui app par, HTTPS API se
//                                        (Hostinger — jahan DB seedha nahi milta)
//   npm run db:seed-users -- --dry     → sirf dikhao, banao mat
//   npm run db:seed-users -- --update  → jo pehle se hain unka naam/phone/
//                                        department/staff_type bhi list jaisa
//                                        kar do (PASSWORD KABHI NAHI chhedta)
//
// DOBARA CHALANA SAFE HAI: jo email pehle se maujood hai wo chhod diya jaata
// hai — na password badalta hai, na naam/department. Isliye list me naya banda
// jodkar script phir se chala dena hi kaafi hai.
//
// --update tab chahiye jab list me kuch theek kiya ho (department badla, ya
// staff_type factory se office). Email se milaan hota hai, isliye KISI KA
// EMAIL badla ho to wo naya banda gina jaayega — purana haath se hataana
// padega.
//
// Password dono shakl me jaata hai: bcrypt hash (login isi se) aur padha ja
// sakne wala (admin DB me dekh sake) — lib/passwords.js wahi niyam.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIST = path.join(ROOT, 'data', 'seed-users.json');
const argv = process.argv.slice(2);
const LIVE = argv.includes('--live');
const DRY = argv.includes('--dry');
const UPDATE = argv.includes('--update');

function loadList() {
  const raw = JSON.parse(fs.readFileSync(LIST, 'utf8'));
  const d = raw.defaults || {};
  return raw.users.map(u => ({
    name: String(u.name || '').trim(),
    email: String(u.email || '').trim().toLowerCase(),
    password: u.password || d.password || '123456',
    role: u.role || d.role || 'user',
    phone: u.phone ? String(u.phone).trim() : null,
    department: u.department || '',
    week_off: u.week_off !== undefined ? u.week_off : (d.week_off || ''),
    extra_off: '',
    staff_type: u.staff_type || d.staff_type || 'office',
    sr: u.sr,
  }));
}

// Ek hi email do baar list me ho to DB tak jaane se pehle pakad lo — warna
// pehla ban jaata hai aur doosra "skipped" me chup-chaap chala jaata.
function findDuplicates(users) {
  const seen = new Map();
  const dups = [];
  for (const u of users) {
    if (seen.has(u.email)) dups.push(`${u.email} (sr ${seen.get(u.email)} aur ${u.sr})`);
    else seen.set(u.email, u.sr);
  }
  return dups;
}

function badEmails(users) {
  return users.filter(u => {
    const at = u.email.indexOf('@');
    return at < 1 || at !== u.email.lastIndexOf('@') || !u.email.slice(at).includes('.') || /\s/.test(u.email);
  }).map(u => `sr ${u.sr}: ${u.email || '(khali)'}`);
}

// ── Direct DB (local / SSH) ──────────────────────────
async function seedViaDb(users) {
  const db = require('../db');
  const { hashPassword, plainPassword } = require('../../backend/lib/passwords');
  let added = 0, skipped = 0, updated = 0;
  for (const u of users) {
    const [ex] = await db.query('SELECT id FROM users WHERE LOWER(email)=LOWER(?)', [u.email]);
    if (ex.length && UPDATE) {
      // password aur session_version ko haath nahi lagate — sirf profile.
      await db.query(
        'UPDATE users SET name=?,role=?,phone=?,department=?,week_off=?,staff_type=? WHERE id=?',
        [u.name, u.role, u.phone, u.department, u.week_off, u.staff_type, ex[0].id]);
      console.log(`  ♻️  ${u.email} (update)`);
      updated++; continue;
    }
    if (ex.length) { console.log(`  ⏭️  ${u.email} (pehle se hai)`); skipped++; continue; }
    const [r] = await db.query(
      `INSERT INTO users (name,email,password,password_plain,role,phone,department,week_off,extra_off,staff_type)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [u.name, u.email, hashPassword(u.password), plainPassword(u.password), u.role,
       u.phone, u.department, u.week_off, u.extra_off, u.staff_type]);
    console.log(`  ✅ ${u.name} — ${u.email} (id ${r.insertId})`);
    added++;
  }
  await db.end();
  return { added, skipped, updated };
}

// ── Live app (HTTPS) ─────────────────────────────────
// Hostinger par DB bahar se nahi milta, par app to chal rahi hai — to usi ke
// admin API se banate hain. Wahi validation lagti hai jo UI se banane par.
async function seedViaApi(users) {
  const base = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  const email = (process.env.ADMIN_EMAIL || '').trim();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!base) throw new Error('APP_URL .env me chahiye (--live ke liye)');
  if (!email || !password) throw new Error('ADMIN_EMAIL / ADMIN_PASSWORD .env me chahiye');

  const login = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`Admin login fail (${login.status}) — ADMIN_EMAIL/PASSWORD dekho`);
  const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : [])
    .map(c => c.split(';')[0]).join('; ');
  const { token } = await login.json();
  const headers = { 'Content-Type': 'application/json', Cookie: cookie, Authorization: `Bearer ${token}` };

  // --update ke liye maujooda users ki id chahiye (email -> id).
  let byEmail = new Map();
  if (UPDATE) {
    const lr = await fetch(`${base}/api/users`, { headers });
    const list = await lr.json();
    byEmail = new Map(list.map(x => [String(x.email).toLowerCase(), x.id]));
  }

  let added = 0, skipped = 0, failed = 0, updated = 0;
  for (const u of users) {
    const existingId = byEmail.get(u.email);
    if (existingId && UPDATE) {
      // password field bheja hi nahi ja raha — route bina password wala
      // UPDATE chalata hai, isliye kisi ka login nahi tootta.
      const r = await fetch(`${base}/api/users/${existingId}`, {
        method: 'PUT', headers,
        body: JSON.stringify({
          name: u.name, email: u.email, role: u.role, view_only: 0,
          phone: u.phone, department: u.department,
          week_off: u.week_off, extra_off: u.extra_off, staff_type: u.staff_type,
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (r.ok && b.success) { console.log(`  ♻️  ${u.email} (update)`); updated++; }
      else { console.log(`  ❌ ${u.email} — ${b.error || r.status}`); failed++; }
      continue;
    }
    const r = await fetch(`${base}/api/users`, { method: 'POST', headers, body: JSON.stringify(u) });
    const body = await r.json().catch(() => ({}));
    if (r.ok && body.success) { console.log(`  ✅ ${u.name} — ${u.email}`); added++; }
    else if (/already exists/i.test(body.error || '')) { console.log(`  ⏭️  ${u.email} (pehle se hai)`); skipped++; }
    else { console.log(`  ❌ ${u.email} — ${body.error || r.status}`); failed++; }
  }
  return { added, skipped, failed, updated };
}

(async () => {
  const users = loadList();
  const dups = findDuplicates(users);
  const bad = badEmails(users);
  if (dups.length) { console.error('  ❌ List me ek hi email do baar hai:\n     ' + dups.join('\n     ')); process.exit(1); }
  if (bad.length) { console.error('  ❌ Ye email theek nahi lagte:\n     ' + bad.join('\n     ')); process.exit(1); }

  console.log(`  ${users.length} users — password "${users[0].password}", role "${users[0].role}", Sunday off`);
  console.log(`  Target: ${LIVE ? (process.env.APP_URL || '(APP_URL nahi hai)') : 'local database (.env)'}\n`);
  if (DRY) { users.forEach(u => console.log(`  · ${String(u.sr).padStart(2)} ${u.name.padEnd(16)} ${u.email.padEnd(42)} ${u.department}`)); return; }

  const res = LIVE ? await seedViaApi(users) : await seedViaDb(users);
  console.log(`\n  Bane: ${res.added}   Update: ${res.updated || 0}   Pehle se the: ${res.skipped}${res.failed ? `   Fail: ${res.failed}` : ''}`);
})().catch(e => { console.error('seed-users fail:', e.message); process.exit(1); });
