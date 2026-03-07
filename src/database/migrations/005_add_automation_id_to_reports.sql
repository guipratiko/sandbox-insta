-- Migration: Adicionar campo automation_id na tabela instagram_reports
-- Este campo permite rastrear qual automação processou cada interação

-- Adicionar coluna automation_id (pode ser NULL para relatórios antigos)
ALTER TABLE instagram_reports
ADD COLUMN IF NOT EXISTS automation_id UUID;

-- Comentário na coluna
COMMENT ON COLUMN instagram_reports.automation_id IS 'ID da automação que processou esta interação (NULL para relatórios antigos)';

-- Criar índice para melhorar performance nas consultas de preventDuplicate
CREATE INDEX IF NOT EXISTS idx_instagram_reports_automation_user ON instagram_reports(automation_id, user_id_instagram, interaction_type);
