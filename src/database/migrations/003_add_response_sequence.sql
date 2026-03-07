-- Migration: Adicionar campo response_sequence para sequências de mensagens
-- Permite enviar múltiplas mensagens (até 4) com delays configuráveis
-- Apenas para Direct Messages (comentários continuam usando response_text)

ALTER TABLE instagram_automations
ADD COLUMN IF NOT EXISTS response_sequence JSONB DEFAULT NULL;

COMMENT ON COLUMN instagram_automations.response_sequence IS 'Sequência de mensagens para DM: array de até 4 objetos com type (text/image/video/audio), content (texto ou URL), e delay (segundos). NULL para comentários ou automações antigas.';

-- Índice para queries que filtram por sequências
CREATE INDEX IF NOT EXISTS idx_instagram_automations_has_sequence 
ON instagram_automations((response_sequence IS NOT NULL)) 
WHERE response_sequence IS NOT NULL;
