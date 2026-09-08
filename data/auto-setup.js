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
// MySQL/MariaDB me GET_LOCK ka naam POORE SERVER par ek hota hai, database ke
// hisaab se nahi. Isliye naam me database ka naam bhi jodte hain — warna ek hi
// server par do app (jaise staging aur live) ek doosre ka boot rok deti hain.
// 64 char ki seema hai, isliye lamba naam kaat dete hain.
const LOCK_PREFIX = 'grover_tm_setup:';
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
  const [existing] = await conn.query(
    'SELECT id, password, password_plain FROM users WHERE email = ? LIMIT 1', [email]);

  if (existing.length) {
    // Admin pehle se hai — password NAHI badalte (warna har restart par
    // session_version badhta aur sab logout ho jaate).
    //
    // Ek cheez phir bhi theek karni hai: jo account password_plain wale
    // feature se PEHLE bana tha, uska ye column khaali pada hai. Us par
    // admin ko DB me sirf bcrypt hash dikhta hai aur lagta hai feature
    // chal hi nahi raha. Bharne se pehle bcrypt se milaan kar lete hain —
    // agar .env ka ADMIN_PASSWORD asli password nahi hai to kuch nahi
    // likhte, warna DB galat password dikhane lagta jo iska ulta hi hai.
    const row = existing[0];
    const plainOff = String(process.env.STORE_PLAIN_PASSWORD || '').toLowerCase() === 'false';
    if (!plainOff && !row.password_plain && bcrypt.compareSync(password, row.password)) {
      await conn.query('UPDATE users SET password_plain = ? WHERE id = ?',
        [String(password).slice(0, 255), row.id]);
      log(`  ✅ Admin ka password ab DB me padha ja sakta hai: ${email}`);
    }
    return false;
  }

  // password_plain: admin ko DB me padha ja sakne wala password chahiye.
  // Column 005 migration me banta hai; STORE_PLAIN_PASSWORD=false ho to null.
  const hash = bcrypt.hashSync(password, 10);
  const plain = String(process.env.STORE_PLAIN_PASSWORD || '').toLowerCase() === 'false'
    ? null : String(password).slice(0, 255);
  const [r] = await conn.query(
    'INSERT INTO users (name, email, password, password_plain, role, department, staff_type) VALUES (?,?,?,?,?,?,?)',
    [name, email, hash, plain, 'admin', 'Management', 'office']);
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

  // Boot ke waqt DB kabhi-kabhi thodi der leta hai (shared hosting par MySQL
  // aur app ek saath uthte hain; ek baar yahan ETIMEDOUT aaya tha jabki DB
  // theek tha). Ek connect fail hone par poora schema setup agle restart tak
  // ruk jaata, isliye do baar koshish karte hain.
  let conn, lastErr;
  for (let attempt = 1; attempt <= 2 && !conn; attempt++) {
    try {
      conn = await mysql.createConnection(connConfig());
    } catch (e) {
      lastErr = e;
      if (attempt < 2) {
        logger.log(`  ⏳ Auto-setup: DB abhi taiyaar nahi (${e.code || e.message}) — 5 second me dobara`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  if (!conn) {
    logger.error(`  ❌ Auto-setup: database se connect nahi hua — ${lastErr.code || ''} ${lastErr.message}`);
    logger.error('     Env vars (DB_HOST/DB_NAME/DB_USER/DB_PASSWORD) dekho.');
    return { connected: false };
  }

  let locked = false;
  let lockName = LOCK_PREFIX;
  try {
    const [[dbRow]] = await conn.query('SELECT DATABASE() AS d');
    lockName = (LOCK_PREFIX + (dbRow.d || 'default')).slice(0, 64);
    const [[l]] = await conn.query('SELECT GET_LOCK(?, ?) AS ok', [lockName, LOCK_WAIT_SEC]);
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
    if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    await conn.end().catch(() => {});
  }
}

module.exports = { autoSetup };
