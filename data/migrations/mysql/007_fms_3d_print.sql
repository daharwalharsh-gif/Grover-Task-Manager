-- FMS Tracking me "3D Print" (FMS - Grover Tex sheet → tab "3D Print",
-- header row 6, 9 steps). Boot par auto-setup ise ek baar chala deta hai.
-- Pehle se ho (phpMyAdmin se import kiya ho) to kuch nahi badalta.

INSERT INTO fms_sheets (fms_name, sheet_name, sheet_id, header_row, total_steps)
SELECT '3D Print', '3D Print', '1mrRRKT9oIfdDKC9kuhKZQ7LvY5rh30_jjUBZxodQhG8', 6, 9
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM fms_sheets
  WHERE sheet_id = '1mrRRKT9oIfdDKC9kuhKZQ7LvY5rh30_jjUBZxodQhG8' AND sheet_name = '3D Print'
);

SET @fid = (
  SELECT id FROM fms_sheets
  WHERE sheet_id = '1mrRRKT9oIfdDKC9kuhKZQ7LvY5rh30_jjUBZxodQhG8' AND sheet_name = '3D Print'
  ORDER BY id LIMIT 1
);

INSERT INTO fms_steps (fms_id, step_order, step_name, plan_col, plan_col_name, actual_col, actual_col_name)
SELECT @fid, s.step_order, s.step_name, s.plan_col, 'Planned', s.actual_col, 'Actual'
FROM (
  SELECT 1 AS step_order, 'GREY OPEN' AS step_name, 'K' AS plan_col, 'L' AS actual_col
  UNION ALL SELECT 2, 'PEACHING',        'O',  'P'
  UNION ALL SELECT 3, 'HEATSET STANTER', 'S',  'T'
  UNION ALL SELECT 4, 'PRINTING',        'Y',  'Z'
  UNION ALL SELECT 5, 'PRINTING 2',      'AD', 'AE'
  UNION ALL SELECT 6, 'WASHING',         'AI', 'AJ'
  UNION ALL SELECT 7, 'FINISH STANTER',  'AO', 'AP'
  UNION ALL SELECT 8, 'FOLDING',         'AT', 'AU'
  UNION ALL SELECT 9, 'DISPACH',         'AZ', 'BA'
) s
WHERE @fid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM fms_steps WHERE fms_id = @fid);
