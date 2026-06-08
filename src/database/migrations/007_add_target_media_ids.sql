-- Automações de comentário exigem postagens alvo específicas (multi-select).
ALTER TABLE instagram_automations
  ADD COLUMN IF NOT EXISTS target_media_ids TEXT[] NOT NULL DEFAULT '{}';

-- Remove automações de comentário antigas (sem escopo de postagem).
DELETE FROM instagram_reports
WHERE automation_id IN (SELECT id FROM instagram_automations WHERE type = 'comment');

DELETE FROM instagram_automations WHERE type = 'comment';
