-- Migration: Adicionar campo delay (em segundos) para automações
-- Permite configurar um delay programável antes de enviar respostas automáticas

ALTER TABLE instagram_automations
ADD COLUMN IF NOT EXISTS delay_seconds INTEGER DEFAULT 0 CHECK (delay_seconds >= 0);

COMMENT ON COLUMN instagram_automations.delay_seconds IS 'Delay em segundos antes de enviar a resposta automática (0 = sem delay)';
