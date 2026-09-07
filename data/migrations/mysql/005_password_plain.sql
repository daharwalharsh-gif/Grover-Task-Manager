-- users.password_plain — padha ja sakne wala password.
--
-- KYUN: admin ko har user ka password saamne chahiye (naya banda joine kare
-- to use batana padta hai, aur bhoolne par dobara dekhna padta hai). Sirf
-- bcrypt hash rakhne par ye mumkin nahi tha — hash se wapas password nikalta
-- hi nahi.
--
-- DHYAN RAHE: login ab bhi `password` (bcrypt hash) se hi hota hai — wo
-- column jaisa tha waisa hai. `password_plain` sirf DEKHNE ke liye hai.
-- Iska matlab ye bhi hai ki database ka dump kisi ke haath lag gaya to saare
-- password khul jaate hain, isliye DB backup sambhaal kar rakhein aur
-- employees ko samjha dein ki yahan wahi password na rakhein jo bank/email
-- par lagta hai.
--
-- Band karna ho to env me STORE_PLAIN_PASSWORD=false — tab code is column me
-- kuch likhta hi nahi (column khali pada rehta hai, koi error nahi aata).
--
-- MySQL me `ADD COLUMN IF NOT EXISTS` nahi hota (MariaDB me hota hai), aur ye
-- file dono par chalti hai — isliye pehle information_schema se poochte hain.
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'users'
                 AND column_name = 'password_plain') = 0,
             'ALTER TABLE users ADD COLUMN password_plain varchar(255) DEFAULT NULL',
             'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
