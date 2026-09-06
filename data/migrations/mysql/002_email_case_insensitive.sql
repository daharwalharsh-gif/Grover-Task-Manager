-- Email ko case ke lihaaz se ek maano.
--
-- MySQL ka utf8mb4_general_ci collation waise hi case-insensitive hai, isliye
-- `WHERE email = 'rajesh@gmail.com'` "Rajesh@Gmail.com" wale row se bhi match
-- kar jaata hai — aur upar wali UNIQUE (email) bhi dono ko ek hi maanti hai.
-- Yaani yahan wo dikkat hai hi nahi jo Postgres par thi.
--
-- Phir bhi index Postgres wali file ke barabar rakha hai, taaki dono database
-- par schema ek jaisa rahe aur LOWER(email) wale lookups (code sab jagah wahi
-- karta hai) index use kar sakein. MySQL 8.0.13+ me functional index ke liye
-- expression ke ird-gird DOHRE brackets zaroori hain.
--
-- HOSTINGER NOTE: Hostinger ki shared/web hosting par MySQL nahi, MariaDB
-- chalta hai — aur MariaDB me functional index `((LOWER(email)))` hai hi nahi
-- (syntax error deta hai). Wahan ye index waise bhi bekaar hai (collation
-- pehle se case-insensitive hai), isliye server ka version dekh kar sirf
-- asli MySQL 8+ par banate hain; MariaDB / purane MySQL par `DO 0` chal
-- jaata hai aur migration aage badh jaati hai.
SET @is_mysql8 := (VERSION() NOT LIKE '%MariaDB%'
                   AND CAST(SUBSTRING_INDEX(VERSION(), '.', 1) AS UNSIGNED) >= 8);
SET @s := IF(@is_mysql8,
             'CREATE UNIQUE INDEX users_email_lower_uq ON users ((LOWER(email)))',
             'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
