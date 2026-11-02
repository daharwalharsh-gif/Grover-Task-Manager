-- Checklist task par ek se zyada proof (max 5). Pehli file pehle ki tarah
-- checklist_tasks.proof_image me hi jaati hai (has_proof, 👁️, MIS sab waise
-- hi chalte hain); 2nd–5th file is table me. Task delete ho to uski files
-- bhi apne aap hat jaati hain (ON DELETE CASCADE) — har delete raaste me
-- alag se saaf karna nahi padta.

CREATE TABLE IF NOT EXISTS checklist_proof_files (
  id int NOT NULL AUTO_INCREMENT,
  task_id int NOT NULL,
  image longtext NOT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY checklist_proof_files_task (task_id),
  CONSTRAINT checklist_proof_files_task_fk FOREIGN KEY (task_id) REFERENCES checklist_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
