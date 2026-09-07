# Grover Tex Prints Pvt Ltd — Task Manager

Node.js (Express) + MySQL 8 / MariaDB. Frontend static HTML/JS `frontend/` me,
API `backend/server.js` me, schema `data/migrations/mysql/` me.

## Local par chalana

```bash
npm install
cp .env.example .env        # phir .env me DB_* aur ADMIN_* bharo
npm run db:check            # DB se connection test
npm run db:setup            # = db:migrate + db:seed-admin
npm start                   # http://localhost:3000
```

Login: `.env` ka `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

| Script | Kaam |
|---|---|
| `npm run db:check` | Sirf connect karke version, tables, admins dikhata hai (kuch likhta nahi) |
| `npm run db:migrate` | `data/migrations/mysql/*.sql` order me chalata hai (dobara chalane par skip) |
| `npm run db:seed-admin` | `.env` ke ADMIN_EMAIL/PASSWORD se admin banata hai (ya password reset) |
| `npm run db:setup` | Upar dono ek saath |
| `npm run db:sql` | `hostinger-setup.sql` banata hai — phpMyAdmin me Import karo, tables + admin ban jaate hain (SSH nahi chahiye) |
| `npm run zip` | Hostinger upload ZIP (`Grover-Tex-Prints-Task-Manager.zip`) — `.env.hostinger` ke values ZIP ki `.env` me bhar deta hai |
| `npm run dev` | nodemon ke saath (auto-restart) |

Health: `GET /api/health` → app zinda; `GET /api/health?db=1` → DB bhi juda hai ya nahi.

## Hostinger par deploy

### 1. Database (hPanel → Websites → apni site → Databases → Management)
1. "Create new MySQL database" — naam, user, password do. Hostinger prefix
   lagata hai: `u123456789_grover` jaisa naam/user banta hai.
2. Wahi page "MySQL host" dikhata hai. App Hostinger par hi chal rahi ho to
   `DB_HOST=localhost` chalega; bahar se (laptop se) connect karna ho to
   **Remote MySQL** me apna IP add karo aur host me `srvNNNN.hstgr.io` wala daalo.
3. Hostinger shared hosting par **MariaDB** hota hai, MySQL 8 nahi — migrations
   dono par chalti hain (`002` version dekh kar khud adjust ho jaati hai).

### 2. Node.js app (hPanel → Websites → Node.js)
- Repo: `https://github.com/daharwalharsh-gif/Grover-Task-Manager.git`, branch `main`
- Node version: **20 ya upar** (`package.json` → `engines`)
- Build command: `npm install`
- Start command: `npm start`  (entry: `backend/server.js`)
- Environment variables: `.env.example` ki har line yahan bharo — kam se kam
  `DB_KIND, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, SESSION_SECRET,
  APP_URL, NODE_ENV=production`. `PORT` mat bharo — Hostinger khud deta hai.
- `.env` file repo me nahi jaati (gitignore). Agar hPanel me env vars ka option
  na ho to File Manager se app ke root me `.env` upload kar do — app use
  `backend/../.env` se khud padh leti hai.

### 3. Pehli baar schema + admin
**Aasan tareeka (phpMyAdmin):** hPanel → Databases → phpMyAdmin → database chuno → Import → ZIP wali `hostinger-setup.sql` → Go.

**Ya SSH/terminal se** (ya laptop se Remote MySQL whitelist karke):
```bash
npm run db:check
npm run db:setup
```
Phir `https://<domain>/api/health?db=1` khol kar dekho — `"connected": true`
aana chahiye. Login `ADMIN_EMAIL` / `ADMIN_PASSWORD` se.

### Alternate: DATABASE_URL
DB_* ki jagah ek line bhi chalti hai:
`DATABASE_URL=mysql://u123456789_grover:PASSWORD@srvNNNN.hstgr.io:3306/u123456789_grover`

## Security note
- `.env`, `credentials.json`, `*.sql` dumps kabhi commit nahi hote (`.gitignore`).
- `SESSION_SECRET` production me zaroor set karo (bina iske default `change-me` lagta hai):
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
