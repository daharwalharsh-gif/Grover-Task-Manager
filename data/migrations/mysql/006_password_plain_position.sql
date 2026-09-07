-- password_plain ko `password` ke theek baad le aao.
--
-- KYUN: 005 me column ALTER TABLE se juda tha, aur MySQL naya column hamesha
-- SABSE AAKHIR me lagata hai. users table me 25+ column hain, isliye
-- phpMyAdmin me wo itni door chala jaata hai ki dikhta hi nahi — dikhta hai
-- sirf `password` (bcrypt hash), aur dekhne wale ko lagta hai password padha
-- hi nahi ja sakta. Ab dono column bagal-bagal aayenge.
--
-- Sirf jagah badal rahi hai — na data jaata hai, na koi query tootati hai
-- (har jagah column ka NAAM likha hai, position nahi).
--
-- MODIFY ... AFTER MySQL aur MariaDB dono me chalta hai. Column na ho (koi
-- 005 se pehle wala database) to pehle bana dete hain, warna MODIFY girta.
SET @has := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'users'
                AND column_name = 'password_plain');
SET @s := IF(@has = 0,
             'ALTER TABLE users ADD COLUMN password_plain varchar(255) DEFAULT NULL AFTER password',
             'ALTER TABLE users MODIFY COLUMN password_plain varchar(255) DEFAULT NULL AFTER password');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
