// phpMyAdmin me import karne layak EK SQL file banao — poora schema + admin.
//
//   npm run db:sql        → hostinger-setup.sql (project folder me)
//
// Kab kaam aata hai: jab laptop se Hostinger DB tak seedha connect nahi ho
// paata (Remote MySQL whitelist nahi hai) aur SSH bhi nahi hai. Tab hPanel →
// Databases → phpMyAdmin → Import me ye file de do — saari tables ban jaati
// hain, schema_migrations me charo migrations darj ho jaati hain (taaki baad
// me `npm run db:migrate` unhe dobara na chalaye), aur pehla admin ban jaata
// hai (password bcrypt hash hokar, seed-admin.js jaisa).
//
// Admin ka email/password .env.hostinger se (na ho to .env se) aata hai.
// File me plaintext password NAHI jaata, sirf hash.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const ROOT = path.resolve(__dirname, '..', '..');
const MIG_DIR = path.join(ROOT, 'data', 'migrations', 'mysql');

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
function sqlStr(s) { return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`; }

function buildSetupSql() {
  const env = { ...readEnv(path.join(ROOT, '.env')), ...readEnv(path.join(ROOT, '.env.hostinger')) };
  const files = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();
  const out = [];
  out.push('-- ══════════════════════════════════════════════════════════');
  out.push('--  Grover Tex Prints — Task Manager  |  Hostinger DB setup');
  out.push(`--  Bani: ${new Date().toISOString()}`);
  out.push('--  phpMyAdmin → apna database chuno → Import → ye file → Go');
  out.push('--  (Khaali database par chalao. Dobara chalane par "table exists"');
  out.push('--   error aayega — tab kuch karne ki zarurat nahi, sab pehle se hai.)');
  out.push('-- ══════════════════════════════════════════════════════════');
  out.push('SET NAMES utf8mb4;');
  out.push("SET time_zone = '+05:30';");
  out.push('');
  for (const f of files) {
    out.push(`-- ───────── ${f} ─────────`);
    out.push(fs.readFileSync(path.join(MIG_DIR, f), 'utf8').trim());
    out.push('');
  }
  out.push('-- ───────── migration log (migrate.js isi table ko dekhta hai) ─────────');
  out.push(`CREATE TABLE IF NOT EXISTS schema_migrations (
  filename varchar(255) NOT NULL,
  applied_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  out.push(`INSERT IGNORE INTO schema_migrations (filename) VALUES ${files.map(f => `(${sqlStr(f)})`).join(', ')};`);
  out.push('');

  const email = (env.ADMIN_EMAIL || '').trim();
  const password = env.ADMIN_PASSWORD || '';
  const name = (env.ADMIN_NAME || '').trim() || 'Admin';
  if (email && password) {
    const hash = bcrypt.hashSync(password, 10);
    out.push(`-- ───────── pehla admin: ${email} (password bcrypt hash me) ─────────`);
    out.push(`INSERT INTO users (name, email, password, role, department, staff_type)
VALUES (${sqlStr(name)}, ${sqlStr(email)}, ${sqlStr(hash)}, 'admin', 'Management', 'office')
ON DUPLICATE KEY UPDATE password = VALUES(password), role = 'admin', session_version = session_version + 1;`);
  } else {
    out.push('-- ADMIN_EMAIL / ADMIN_PASSWORD .env.hostinger me nahi the — admin baad me `npm run db:seed-admin` se banao.');
  }
  out.push('');
  return { sql: out.join('\n'), files, email };
}

module.exports = { buildSetupSql };

if (require.main === module) {
  const { sql, files, email } = buildSetupSql();
  const OUT = path.join(ROOT, 'hostinger-setup.sql');
  fs.writeFileSync(OUT, sql);
  console.log(`  ✅ ${OUT}`);
  console.log(`     migrations: ${files.join(', ')}`);
  console.log(`     admin: ${email || '(nahi)'}`);
  console.log('     phpMyAdmin → database chuno → Import → ye file → Go');
}
