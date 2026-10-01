-- 3D Print: sheet me laal kiye hue steps tracking se hatao — PEACHING,
-- HEATSET STANTER, PRINTING 2 (Step5) aur WASHING. Bachte hain 5:
-- GREY OPEN → PRINTING → FINISH STANTER → FOLDING → DISPACH.
--
-- Sirf tab chalta hai jab 3D Print abhi bhi bilkul purane 9 step par ho
-- (@orig). FMS Admin se baad me kiya koi badlav ho, ya FMS hi na ho, to kuch
-- nahi badalta. Page khulne par admin ka browser bhi yahi kar chuka ho sakta
-- hai — tab bhi yahan kuch nahi hota.

SET @fid = (
  SELECT id FROM fms_sheets
  WHERE sheet_id = '1mrRRKT9oIfdDKC9kuhKZQ7LvY5rh30_jjUBZxodQhG8' AND sheet_name = '3D Print'
  ORDER BY id LIMIT 1
);
SET @sig = (
  SELECT GROUP_CONCAT(step_name ORDER BY step_order SEPARATOR '|')
  FROM fms_steps WHERE fms_id = @fid
);
SET @orig = (@sig = 'GREY OPEN|PEACHING|HEATSET STANTER|PRINTING|PRINTING 2|WASHING|FINISH STANTER|FOLDING|DISPACH');

DELETE d FROM fms_step_doers d JOIN fms_steps s ON s.id = d.step_id
WHERE s.fms_id = @fid AND @orig AND s.step_name IN ('PEACHING', 'HEATSET STANTER', 'PRINTING 2', 'WASHING');

DELETE e FROM fms_extra_rows e JOIN fms_steps s ON s.id = e.step_id
WHERE s.fms_id = @fid AND @orig AND s.step_name IN ('PEACHING', 'HEATSET STANTER', 'PRINTING 2', 'WASHING');

DELETE FROM fms_steps
WHERE fms_id = @fid AND @orig AND step_name IN ('PEACHING', 'HEATSET STANTER', 'PRINTING 2', 'WASHING');

UPDATE fms_steps SET step_order = CASE step_name
    WHEN 'GREY OPEN' THEN 1 WHEN 'PRINTING' THEN 2 WHEN 'FINISH STANTER' THEN 3
    WHEN 'FOLDING' THEN 4 WHEN 'DISPACH' THEN 5 ELSE step_order END
WHERE fms_id = @fid AND @orig;

UPDATE fms_sheets SET total_steps = 5 WHERE id = @fid AND @orig;
