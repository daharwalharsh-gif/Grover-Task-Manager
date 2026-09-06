// Database connection ka test — Hostinger (ya kisi bhi MySQL/MariaDB) ke
// credentials .env me bharne ke baad sabse pehle yahi chalao:
//
//   npm run db:check
//
// Ye sirf connect karke server ka version, database ka naam, tables ki ginti
// aur (agar users table hai to) admin users dikhata hai. Kuch likhta nahi.
// Fail hone par seedha bataata hai ki galti kahan hai — host galat hai, IP
// whitelist nahi hai (Hostinger "Remote MySQL"), ya password galat hai.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const url = (process.env.DATABASE_URL || '').trim();
const cfg = url
  ? { uri: url }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'task_manager',
    };
const shown = url
  ? url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@')
  : `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`;

(async () => {
  console.log(`  Connecting: ${shown}`);
  let c;
  try {
    c = await mysql.createConnection({ ...cfg, connectTimeout: 10000 });
  } catch (e) {
    console.error(`\n  ❌ Connect nahi hua: ${e.code || ''} ${e.message}`);
    if (e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
      console.error('     • DB_HOST / DB_PORT dobara dekho (Hostinger hPanel → Databases → "MySQL host").');
      console.error('     • Bahar se connect kar rahe ho (localhost se Hostinger DB) to hPanel →');
      console.error('       Databases → Remote MySQL me apna IP (ya %) add karna zaroori hai.');
    } else if (e.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('     • DB_USER / DB_PASSWORD galat hai. Hostinger par user "u123456789_xxx" jaisa hota hai.');
    } else if (e.code === 'ER_BAD_DB_ERROR') {
      console.error('     • DB_NAME galat hai. Hostinger par naam "u123456789_xxx" jaisa hota hai.');
    }
    process.exit(1);
  }

  const [[v]] = await c.query('SELECT VERSION() AS v, DATABASE() AS db, @@character_set_database AS cs');
  const [[t]] = await c.query(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()');
  const flavour = /MariaDB/i.test(v.v) ? 'MariaDB' : 'MySQL';
  console.log(`  ✅ Connected — ${flavour} ${v.v}`);
  console.log(`     database: ${v.db}   charset: ${v.cs}   tables: ${t.n}`);

  if (Number(t.n) === 0) {
    console.log('\n  Database khaali hai. Ab chalao:  npm run db:migrate  →  npm run db:seed-admin');
  } else {
    try {
      const [admins] = await c.query("SELECT id, name, email FROM users WHERE role='admin' ORDER BY id");
      console.log(`     admins: ${admins.length ? admins.map(a => `${a.email} (id ${a.id})`).join(', ') : 'koi nahi — npm run db:seed-admin chalao'}`);
    } catch (e) {
      console.log('     users table nahi mili — npm run db:migrate chalao');
    }
  }
  await c.end();
})().catch(e => { console.error('db:check failed:', e.message); process.exit(1); });
