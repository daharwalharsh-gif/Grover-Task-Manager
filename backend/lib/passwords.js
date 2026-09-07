// ══════════════════════════════════════════════════════
// PASSWORDS
// ══════════════════════════════════════════════════════
// Password DO jagah likha jaata hai:
//   users.password        → bcrypt hash. LOGIN SIRF ISI SE HOTA HAI.
//   users.password_plain  → wahi password padhne layak shakl me, taaki admin
//                           phpMyAdmin/DB me dekh sake (employee ko batane ya
//                           bhoolne par).
//
// Dono hamesha SAATH me likhne chahiye. Ek jagah bhoolne par DB me purana
// plain aur naya hash pada rehta — aur admin galat password batata rehta.
// Isliye har likhne wali jagah yahi do function use karti hai:
//
//   hashPassword(pw)  → bcrypt hash (jo `password` column me jaata hai)
//   plainPassword(pw) → wahi pw, ya null agar feature band ho
//
// Band karna ho: env me STORE_PLAIN_PASSWORD=false. Tab plainPassword() null
// deta hai, column khaali padi rehti hai, aur login par koi asar nahi padta.
const bcrypt = require('bcryptjs');

// Default ON hai (client ne yahi maanga). 'false' likhne par hi band hota hai.
const STORE_PLAIN = String(process.env.STORE_PLAIN_PASSWORD || '').toLowerCase() !== 'false';

function hashPassword(pw) {
  return bcrypt.hashSync(String(pw), 10);
}

// varchar(255) hai — isse lamba password (aisa hota nahi, par bhejna mumkin
// hai) INSERT ko fail kar deta, isliye yahin kaat dete hain. Login par asar
// nahi padta kyunki wo hash se hota hai.
function plainPassword(pw) {
  if (!STORE_PLAIN) return null;
  return String(pw).slice(0, 255);
}

module.exports = { hashPassword, plainPassword, STORE_PLAIN };
