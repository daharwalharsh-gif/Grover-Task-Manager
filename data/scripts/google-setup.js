// credentials.json (Google service account) ko app ke laayak bana do.
//
//   npm run google:setup
//
// Kya karta hai:
//   1. credentials.json padhta hai aur jaanchta hai ki wo asli service-account
//      key hai (type, client_email, private_key) — placeholder chhoda ho to
//      wahin rok deta hai.
//   2. Usi ko base64 karke GOOGLE_CREDENTIALS_B64 ke roop me .env aur
//      .env.hostinger dono me likh deta hai.
//   3. Grover-Hostinger.env dobara banata hai, taaki hPanel me "Import .env"
//      se seedha chadh jaye.
//   4. Service account ka email chhaap deta hai — Google Sheet aur Drive
//      folder USI ke saath share karne hote hain, warna app ko 403 milta hai.
//
// KYUN base64 aur file dono nahi: Hostinger par deploy GitHub se hota hai aur
// credentials.json .gitignore me hai (honi bhi chahiye — usme private key hai),
// isliye wo file server tak pahunchti hi nahi. Env variable hi ek raasta hai.
// Base64 isliye ki JSON me quotes aur "\n" hote hain, jinhe hosting panel
// paste karte waqt tod deta hai.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CRED = path.join(ROOT, 'credentials.json');
const KEY = 'GOOGLE_CREDENTIALS_B64';

function fail(msg, ...extra) {
  console.error(`\n  ❌ ${msg}`);
  extra.forEach(l => console.error(`     ${l}`));
  process.exit(1);
}

// ── 1. Padho aur jaancho ─────────────────────────────
if (!fs.existsSync(CRED)) {
  fail('credentials.json nahi mili.',
       'Google Cloud Console se service-account key (JSON) download karke',
       'project folder me credentials.json ke naam se rakh do.');
}

let raw = fs.readFileSync(CRED, 'utf8');
// Kuch log file ko Notepad me kholkar save karte hain — UTF-8 BOM aage lag
// jaata hai aur JSON.parse pehle hi character par fail ho jaata hai.
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

let creds;
try {
  creds = JSON.parse(raw);
} catch (e) {
  fail(`credentials.json JSON ke roop me padhi nahi ja rahi: ${e.message}`,
       'Google se download ki hui file ka POORA content is file me hona chahiye',
       '(shuru { se aakhir } tak), beech me kuch aur nahi.');
}

if (creds._HOW_TO_USE || String(creds.client_email || '').includes('PASTE-YOUR-JSON-HERE')) {
  fail('credentials.json me abhi bhi placeholder hai.',
       'Google se download ki hui JSON file ka poora content copy karke',
       'is file me paste karo (jo abhi likha hai use hata do), phir dobara chalao.');
}

const missing = ['type', 'client_email', 'private_key', 'project_id'].filter(k => !creds[k]);
if (missing.length) fail(`credentials.json me ye field nahi hain: ${missing.join(', ')}`);
if (creds.type !== 'service_account') {
  fail(`type "${creds.type}" hai, "service_account" hona chahiye.`,
       'OAuth client ka JSON kaam nahi karega — Service Account wali key chahiye.');
}
if (!String(creds.private_key).includes('BEGIN PRIVATE KEY')) {
  fail('private_key adhoori lag rahi hai.',
       'Poori file dobara copy karo — private_key "-----BEGIN PRIVATE KEY-----" se shuru hoti hai.');
}

// ── 2. base64 ────────────────────────────────────────
// Jo object humne parse kiya wahi wapas likhte hain: isse BOM, extra spaces
// aur newline sab saaf ho jaate hain, aur server par bilkul wahi JSON pahunchta
// hai jo yahan jaancha gaya.
const b64 = Buffer.from(JSON.stringify(creds), 'utf8').toString('base64');

// ── 3. .env files me daalo ───────────────────────────
function upsertEnv(file, key, value) {
  let lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const re = new RegExp(`^${key}=`);
  const idx = lines.findIndex(l => re.test(l.trim()));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return idx >= 0 ? 'updated' : 'added';
}

const touched = [];
for (const f of ['.env', '.env.hostinger']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p) && f === '.env.hostinger') continue;
  touched.push(`${f} (${upsertEnv(p, KEY, b64)})`);
}

// ── 4. Hostinger import file dobara banao ────────────
let importFile = null;
try {
  require('child_process').execFileSync(process.execPath,
    [path.join(ROOT, 'data', 'scripts', 'make-env.js')], { cwd: ROOT, stdio: 'pipe' });
  importFile = path.join(ROOT, 'Grover-Hostinger.env');
} catch (e) {
  // .env.hostinger na ho to ye step chhod dete hain — baaki kaam ho chuka hai.
}

console.log(`\n  ✅ Google credentials taiyaar (${b64.length} chars base64)`);
console.log(`     project : ${creds.project_id}`);
console.log(`     account : ${creds.client_email}`);
console.log(`     likha   : ${touched.join(', ')}`);
if (importFile) console.log(`     import  : ${importFile}`);

console.log(`\n  AAGE KYA KARNA HAI`);
console.log(`  ─────────────────────────────────────────────────────`);
console.log(`  1. Apni Google Sheet kholo -> Share -> ye email daalo:`);
console.log(`\n       ${creds.client_email}\n`);
console.log(`     FMS ko sheet me likhna bhi hota hai, isliye "Editor" do.`);
console.log(`     Drive folder (GDRIVE_FMS_FOLDER_ID) bhi isi ke saath share karo.`);
console.log(`  2. Local par test: npm start  -> log me "✅ Google Auth pre-warmed" aana chahiye.`);
console.log(`  3. Hostinger par: hPanel -> Environment variables -> Import .env`);
console.log(`     -> Grover-Hostinger.env  -> phir Deployments -> Deploy (ya Restart).`);
console.log(`     (Sirf ek variable daalna ho to naam ${KEY} hai.)`);
console.log(`\n  Note: credentials.json git me nahi jaati, isliye server par ye`);
console.log(`  env variable hi kaam karta hai — file wahan pahunchti hi nahi.`);
