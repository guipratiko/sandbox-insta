-- Migration: Adicionar campo prevent_duplicate na tabela instagram_automations
-- Este campo permite evitar que o mesmo contato entre novamente no mesmo fluxo de automação

-- Adicionar coluna prevent_duplicate (padrão: TRUE)
ALTER TABLE instagram_automations
ADD COLUMN IF NOT EXISTS prevent_duplicate BOOLEAN DEFAULT TRUE;

-- Comentário na coluna
COMMENT ON COLUMN instagram_automations.prevent_duplicate IS 'Se TRUE, evita que o mesmo contato entre novamente no mesmo fluxo de automação';
