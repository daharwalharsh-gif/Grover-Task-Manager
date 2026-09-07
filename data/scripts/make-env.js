// Hostinger hPanel → Environment variables → "Import .env" ke liye file banao.
//
//   npm run env:hostinger   → Grover-Hostinger.env (project folder + Desktop)
//
// Values .env.hostinger (gitignored) se aati hain. Sirf KEY=VALUE lines —
// koi comment nahi, koi khaali value nahi (khaali PORT= Hostinger ka apna
// PORT overwrite kar deta, isliye PORT yahan kabhi nahi jaata).
// SESSION_SECRET: .env.hostinger me ho to wahi, warna ek baar random banake
// .env.hostinger me likh diya jaata hai — taaki har import par wahi rahe aur
// purane logins na tootein.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, '.env.hostinger');
const NAME = 'Grover-Hostinger.env';

function readEnv(file) {
  const m = {};
  if (!fs.existsSync(file)) return m;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) m[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return m;
}

const h = readEnv(SRC);
if (!h.DB_NAME || !h.DB_USER || !h.DB_PASSWORD) {
  console.error('  .env.hostinger me DB_NAME / DB_USER / DB_PASSWORD chahiye.');
  process.exit(1);
}
if (!h.SESSION_SECRET) {
  h.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(SRC, `SESSION_SECRET=${h.SESSION_SECRET}\n`);
}

const ORDER = [
  'DB_KIND', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_POOL_MAX',
  'NODE_ENV', 'SESSION_SECRET', 'APP_URL',
  'ADMIN_NAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD',
  'WA_SCHEDULER_ENABLED',
  // optional — sirf tab jaate hain jab .env.hostinger me bhare hon
  'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_NAME',
  'APPS_SCRIPT_UPLOAD_URL', 'APPS_SCRIPT_SECRET', 'GDRIVE_VIDEO_FOLDER_ID', 'GDRIVE_FMS_FOLDER_ID',
  'GOOGLE_CREDENTIALS_B64',
  'WAUMFY_API_KEY', 'WAUMFY_TRIGGER_URL', 'WAUMFY_DOC_TRIGGER_URL', 'WAUMFY_IMAGE_TRIGGER_URL',
];
const defaults = { DB_KIND: 'mysql', DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_POOL_MAX: '5', NODE_ENV: 'production', WA_SCHEDULER_ENABLED: 'false' };

const lines = [];
for (const k of ORDER) {
  const v = h[k] !== undefined && h[k] !== '' ? h[k] : defaults[k];
  if (v === undefined || v === '') continue;
  lines.push(`${k}=${v}`);
}
const body = lines.join('\n') + '\n';
const outs = [path.join(ROOT, NAME), path.join(path.resolve(ROOT, '..'), NAME)];
for (const o of outs) fs.writeFileSync(o, body);
console.log(`  ✅ ${lines.length} variables → ${outs[0]}`);
console.log(`     Copy → ${outs[1]}`);
console.log('     hPanel → Environment variables → Import .env → ye file → phir app Restart');
