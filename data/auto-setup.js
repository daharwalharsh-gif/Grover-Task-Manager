// ══════════════════════════════════════════════════════
// AUTO SETUP — boot par database ko chalne layak bana deta hai
// ══════════════════════════════════════════════════════
// Kya karta hai (har boot par, is kram me):
//   1. migrations/mysql/*.sql me se jo abhi tak nahi lagi, wo laga deta hai
//      (schema_migrations me darj hoti hain, isliye dobara nahi chalti)
//   2. ADMIN_EMAIL wala user nahi hai to pehla admin bana deta hai
//
// Kyun: Hostinger jaise shared hosting par SSH nahi hota, aur phpMyAdmin se
// SQL import karna har deploy par dohrana padta. Ab naya code deploy hote hi
// database khud sahi shakl me aa jaata hai.
//
// SURAKSHA (jaan-boojh kar rakhi gayi hain):
//   • Kabhi crash nahi karta — fail ho to sirf log, app chalti rehti hai.
//     Aadhi table ke saath bhi login page/health khulna chahiye taaki pata to
//     chale ki dikkat kya hai.
//   • Ek hi baar chalti hai: MySQL/MariaDB ka advisory lock (GET_LOCK) lagta
//     hai, isliye do instance ek saath boot hon to bhi migrations do baar
//     nahi chalti.
//   • Maujooda admin ko HAATH NAHI LAGATA. Password reset karta to har
//     restart par session_version badhta aur saare log-in tootte. Password
//     badalna ho to `npm run db:seed-admin` hai.
//   • Serverless (Vercel) par server.js ise bulata hi nahi — wahan har
//     request ek naya process hai.
//   • Band karna ho to env me AUTO_SETUP=false.
//
// Apna connection banata hai (pool ka nahi) kyunki .sql files me kai
// statement ek saath hote hain — uske liye multipleStatements chahiye, jo
// app ke normal pool par jaan-boojh kar band hai.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const MIG_DIR = path.join(__dirname, 'migrations', 'mysql');
const LOCK_NAME = 'grover_tm_auto_setup';
const LOCK_WAIT_SEC = 30;

function connConfig() {
  const base = {
    multipleStatements: true,
    charset: 'utf8mb4_general_ci',
    connectTimeout: 15000,
  };
  const url = (process.env.DATABASE_URL || '').trim();
  if (url) return { uri: url, ...base };
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'task_manager',
    ...base,
  };
}

async function applyMigrations(conn, log) {
  if (!fs.existsSync(MIG_DIR)) {
    log('  ⚠️  migrations folder nahi mila — schema skip');
    return 0;
  }
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename varchar(255) NOT NULL,
    applied_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (filename)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [rows] = await conn.query('SELECT filename FROM schema_migrations');
  const done = new Set(rows.map(r => r.filename));
  const files = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();

  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
    try {
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [f]);
      log(`  ✅ migration lagi: ${f}`);
      applied++;
    } catch (e) {
      // MySQL/MariaDB me DDL rollback nahi hota — is file ka kuch hissa lag
      // chuka ho sakta hai. Isliye ise "lagi hui" darj NAHI karte, aur aage
      // ki files bhi nahi chalate (wo isi ke upar bani hain).
      log(`  ❌ migration fail: ${f} — ${e.code || ''} ${e.message}`);
      log('     Database khaali karke dobara deploy karo, ya phpMyAdmin se');
      log('     hostinger-setup.sql import kar do.');
      throw e;
    }
  }
  return applied;
}

async function seedAdmin(conn, log) {
  const email = (process.env.ADMIN_EMAIL || '').trim();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = (process.env.ADMIN_NAME || '').trim() || 'Admin';
  if (!email || !password) {
    log('  ⏭️  ADMIN_EMAIL / ADMIN_PASSWORD nahi hain — admin seed skip');
    return false;
  }
  // Pehle se hai to kuch mat karo. (Password badalna ho to db:seed-admin.)
  const [existing] = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) return false;

  const hash = bcrypt.hashSync(password, 10);
  const [r] = await conn.query(
    'INSERT INTO users (name, email, password, role, department, staff_type) VALUES (?,?,?,?,?,?)',
    [name, email, hash, 'admin', 'Management', 'office']);
  log(`  ✅ Pehla admin bana: ${email} (id ${r.insertId})`);
  if (password.length < 8) log('  ⚠️  Admin password chhota hai — login karke badal lo.');
  return true;
}

async function autoSetup(logger = console) {
  const log = (m) => logger.log(m);
  if (String(process.env.AUTO_SETUP || '').toLowerCase() === 'false') {
    log('  ⏭️  AUTO_SETUP=false — schema setup skip');
    return { skipped: true };
  }

  let conn;
  try {
    conn = await mysql.createConnection(connConfig());
  } catch (e) {
    logger.error(`  ❌ Auto-setup: database se connect nahi hua — ${e.code || ''} ${e.message}`);
    logger.error('     Env vars (DB_HOST/DB_NAME/DB_USER/DB_PASSWORD) dekho.');
    return { connected: false };
  }

  let locked = false;
  try {
    const [[l]] = await conn.query('SELECT GET_LOCK(?, ?) AS ok', [LOCK_NAME, LOCK_WAIT_SEC]);
    locked = l && Number(l.ok) === 1;
    if (!locked) {
      log('  ⏭️  Auto-setup: doosra instance pehle se chala raha hai — skip');
      return { skipped: true };
    }
    const applied = await applyMigrations(conn, log);
    const seeded = await seedAdmin(conn, log);
    const [[t]] = await conn.query(
      'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()');
    if (applied) log(`  ✅ Schema taiyaar — ${Number(t.n)} tables`);
    return { applied, seeded, tables: Number(t.n) };
  } catch (e) {
    logger.error(`  ❌ Auto-setup ruk gaya: ${e.code || ''} ${e.message}`);
    return { failed: true };
  } finally {
    if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
    await conn.end().catch(() => {});
  }
}

module.exports = { autoSetup };
