-- Migration: Adicionar suporte para resposta "Comentário e DM"
-- Permite responder um comentário e depois enviar DM usando sendDirectMessageByCommentId

-- Adicionar coluna response_text_dm (texto da DM quando responseType = 'comment_and_dm')
ALTER TABLE instagram_automations
ADD COLUMN IF NOT EXISTS response_text_dm TEXT;

-- Comentário na coluna
COMMENT ON COLUMN instagram_automations.response_text_dm IS 'Texto da DM quando response_type é "comment_and_dm"';

-- Atualizar o CHECK constraint de response_type para incluir 'comment_and_dm'
-- Primeiro, remover o constraint antigo
ALTER TABLE instagram_automations
DROP CONSTRAINT IF EXISTS instagram_automations_response_type_check;

-- Adicionar novo constraint com 'comment_and_dm'
ALTER TABLE instagram_automations
ADD CONSTRAINT instagram_automations_response_type_check 
CHECK (response_type IN ('direct', 'comment', 'comment_and_dm'));
