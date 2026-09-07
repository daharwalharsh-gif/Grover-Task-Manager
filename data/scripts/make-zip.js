// Hostinger par seedha upload karne layak ZIP banao.
//
//   npm run zip                 → project folder me Grover-Tex-Prints-Task-Manager.zip
//                                 (VS Code me dikhti hai) + Desktop par copy
//   npm run zip -- --out D:\x   → sirf us folder me
//
// Har baar chalane par taaza code se nayi ZIP banti hai (purani overwrite).
// Andar kya jaata hai:
//   backend/ data/ frontend/ brand.json package.json package-lock.json README.md
//   .env            ← PRODUCTION TEMPLATE (local wali .env NAHI jaati). Sirf
//                     Hostinger ke DB/APP values bharne hain. SESSION_SECRET
//                     har ZIP me naya random ban jaata hai.
//   .env.example, HOSTINGER-SETUP.txt (step-by-step guide)
// Bahar kya rehta hai:
//   node_modules (Hostinger `npm install` khud karta hai — Windows ke native
//   binaries Linux par waise bhi nahi chalte), .git, local .env, Vercel ki
//   files, credentials.json, dumps, dist/.
//
// Koi dependency nahi — ZIP format zlib se yahin likha hai, isliye ye Windows
// / Mac / Linux sab par ek jaisa chalta hai (PowerShell Compress-Archive
// backslash wale naam banata hai jo Linux par toot jaate hain).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const ZIP_NAME = 'Grover-Tex-Prints-Task-Manager.zip';

// ── CLI ──────────────────────────────────────────────
const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const CUSTOM_OUT = outIdx >= 0 && argv[outIdx + 1] ? path.resolve(argv[outIdx + 1]) : null;
const OUT_DIR = CUSTOM_OUT || ROOT;
const OUT = path.join(OUT_DIR, ZIP_NAME);
// Default me Desktop (project ka parent folder) par bhi ek copy — upload ke
// liye wahan se uthana aasan hai. --out diya ho to sirf wahi.
const DESKTOP_COPY = CUSTOM_OUT ? null : path.join(path.resolve(ROOT, '..'), ZIP_NAME);

// ── Kya jaata hai, kya nahi ──────────────────────────
const INCLUDE_TOP = ['backend', 'data', 'frontend', 'brand.json', 'package.json', 'package-lock.json', 'README.md', '.env.example'];
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', '.vercel']);
const EXCLUDE_FILES = new Set(['.env', '.env.local', 'credentials.json', '.DS_Store', 'Thumbs.db', 'apps_script_proof_upload.gs', 'make-zip.js']);
function excluded(rel, name) {
  if (EXCLUDE_DIRS.has(name) || EXCLUDE_FILES.has(name)) return true;
  // DB dumps nahi, migrations haan
  if (name.endsWith('.sql') && !rel.replace(/\\/g, '/').startsWith('data/migrations/')) return true;
  if (name.endsWith('.zip')) return true;
  return false;
}

function walk(abs, rel, out) {
  const st = fs.statSync(abs);
  const name = path.basename(abs);
  if (excluded(rel, name)) return;
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(abs).sort()) walk(path.join(abs, e), rel ? `${rel}/${e}` : e, out);
  } else {
    out.push({ name: rel.replace(/\\/g, '/'), data: fs.readFileSync(abs), mtime: st.mtime });
  }
}

// ── Production .env template ─────────────────────────
// .env.example ko base banao; SESSION_SECRET random; ADMIN_* local .env se
// (wo user ki apni choice hai) taaki seed-admin seedha chal jaye.
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
function buildProdEnv() {
  const local = readEnv(path.join(ROOT, '.env'));
  // .env.hostinger (gitignored) me Hostinger ke ASLI DB values rakho — wo
  // yahan sab par upar aa jaate hain, aur ZIP ki .env seedha chalne layak
  // banti hai (kuch bharna nahi padta).
  const host = readEnv(path.join(ROOT, '.env.hostinger'));
  const secret = crypto.randomBytes(32).toString('hex');
  const overrides = {
    DB_KIND: 'mysql',
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    NODE_ENV: 'production',
    PORT: '',
    SESSION_SECRET: secret,
    DB_POOL_MAX: '5',
    WA_SCHEDULER_ENABLED: 'false',
    ADMIN_NAME: local.ADMIN_NAME || 'Admin',
    ADMIN_EMAIL: local.ADMIN_EMAIL || '',
    ADMIN_PASSWORD: local.ADMIN_PASSWORD || '',
    ...host,
    // PORT Hostinger khud deta hai; SESSION_SECRET hamesha fresh random
    PORT: '',
    SESSION_SECRET: host.SESSION_SECRET || secret,
  };
  const hostFilled = !!(host.DB_NAME && host.DB_USER && host.DB_PASSWORD);
  const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8').split(/\r?\n/);
  const lines = example.map((line) => {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) return line;
    return `${m[1]}=${Object.prototype.hasOwnProperty.call(overrides, m[1]) ? overrides[m[1]] : m[2]}`;
  });
  const banner = [
    '# ══════════════════════════════════════════════════════════',
    '#  HOSTINGER PRODUCTION CONFIG',
    hostFilled
      ? `#  DB values .env.hostinger se bhare hue hain (${host.DB_NAME}). Kuch`
      : '#  Sirf ye 4 lines bharni hain:',
    hostFilled
      ? '#  badalna ho to sirf APP_URL (https://aapka-domain.com) dekh lo.'
      : '#    DB_NAME, DB_USER, DB_PASSWORD  (hPanel → Databases → Management)',
    hostFilled ? '#' : '#    APP_URL                        (https://aapka-domain.com)',
    '#  DB_HOST=127.0.0.1 (Hostinger ka MySQL host) — app Hostinger par hi chalti hai.',
    '#  SESSION_SECRET pehle se random bhara hai — badalne ki zarurat nahi.',
    `#  (ZIP bani: ${new Date().toISOString()})`,
    '# ══════════════════════════════════════════════════════════',
    '',
  ];
  return banner.concat(lines).join('\n');
}

const SETUP_TXT = `GROVER TEX PRINTS — TASK MANAGER  |  HOSTINGER SETUP
=====================================================

1) DATABASE (hPanel → Websites → apni site → Databases → Management)
   - "Create new MySQL database": naam, user, password do.
     Hostinger prefix lagata hai: u123456789_grover jaisa.
   - Wahi 3 cheezein .env me bharo: DB_NAME, DB_USER, DB_PASSWORD
   - DB_HOST=127.0.0.1 rehne do (Hostinger yahi host dikhata hai).

2) FILES
   - Ye ZIP hPanel File Manager se app ke folder me upload karke Extract karo
     (files seedhe folder ke root me aani chahiye — package.json wahin dikhe).
   - .env file kholo aur upar wali values + APP_URL bharo.
     (Sirf .env; baaki kuch chhedne ki zarurat nahi.)

3) NODE.JS APP (hPanel → Websites → Node.js)
   - Node version: 20 ya upar
   - Build command:  npm install
   - Start command:  npm start
   - Entry file:     backend/server.js
   - PORT env mat bharo — Hostinger khud deta hai.

4) PEHLI BAAR: TABLES + ADMIN  (do me se koi EK tareeka)
   A) phpMyAdmin (sabse aasan, SSH nahi chahiye):
      hPanel → Databases → phpMyAdmin → apna database chuno → Import →
      is ZIP ki hostinger-setup.sql → Go.  (29 tables + admin ban jaata hai)
   B) SSH / terminal me app folder me jaakar:
        npm run db:check      (connection test)
        npm run db:setup      (tables banao + admin banao)
   Admin login = .env ke ADMIN_EMAIL / ADMIN_PASSWORD.
   Login ke baad Profile se password badal lo.

5) CHECK
   https://<domain>/api/health?db=1  →  "connected": true aana chahiye.

UPDATE KAISE KAREIN
   Laptop par:  npm run zip   →  Desktop par nayi ZIP.
   Hostinger par purani files ke upar extract karo (.env ko overwrite mat
   karo — nayi ZIP ki .env sirf template hai). Phir Node.js app Restart.
   Agar nayi migrations aayi hain to ek baar:  npm run db:migrate
`;

// ── ZIP writer (deflate) ─────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}
function writeZip(entries, outFile) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const comp = zlib.deflateRawSync(e.data, { level: 9 });
    const useDeflate = comp.length < e.data.length;
    const body = useDeflate ? comp : e.data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(e.data);
    const { time, date } = dosDateTime(e.mtime);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);        // version needed
    lh.writeUInt16LE(0x0800, 6);    // flags: UTF-8 names
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    parts.push(lh, name, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(0x031e, 4);    // made by: UNIX, v3.0 (permissions ke liye)
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);        // extra
    ch.writeUInt16LE(0, 32);        // comment
    ch.writeUInt16LE(0, 34);        // disk
    ch.writeUInt16LE(0, 36);        // internal attrs
    ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);

    offset += lh.length + name.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  fs.writeFileSync(outFile, Buffer.concat([...parts, cdBuf, eocd]));
}

// ── Main ─────────────────────────────────────────────
(function main() {
  const entries = [];
  for (const top of INCLUDE_TOP) {
    const abs = path.join(ROOT, top);
    if (!fs.existsSync(abs)) { console.warn(`  ⚠️  ${top} nahi mila — skip`); continue; }
    walk(abs, top, entries);
  }
  const now = new Date();
  entries.push({ name: '.env', data: Buffer.from(buildProdEnv(), 'utf8'), mtime: now });
  entries.push({ name: 'HOSTINGER-SETUP.txt', data: Buffer.from(SETUP_TXT, 'utf8'), mtime: now });
  // phpMyAdmin import wali SQL — SSH na ho to tables isi se banti hain
  const { buildSetupSql } = require('./make-setup-sql');
  entries.push({ name: 'hostinger-setup.sql', data: Buffer.from(buildSetupSql().sql, 'utf8'), mtime: now });

  // Safety: local secrets kabhi na jaayein
  const bad = entries.filter(e => /(^|\/)(credentials\.json|\.env\.local)$/.test(e.name) || e.name.includes('node_modules/'));
  if (bad.length) throw new Error('Ye files ZIP me nahi jaani chahiye: ' + bad.map(b => b.name).join(', '));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeZip(entries, OUT);
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`  ✅ ${entries.length} files → ${OUT}  (${kb} KB)`);
  if (DESKTOP_COPY) { fs.copyFileSync(OUT, DESKTOP_COPY); console.log(`     Copy      → ${DESKTOP_COPY}`); }
  console.log('     Andar: .env (Hostinger template) + HOSTINGER-SETUP.txt');
  console.log('     Upload → Extract → .env me DB_NAME/DB_USER/DB_PASSWORD/APP_URL bharo → npm run db:setup');
})();
