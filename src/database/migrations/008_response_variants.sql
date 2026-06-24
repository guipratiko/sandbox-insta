-- Até 3 variações de texto por canal (comentário / DM), sorteadas uniformemente.
ALTER TABLE instagram_automations
  ADD COLUMN IF NOT EXISTS comment_response_variants TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dm_response_variants TEXT[] NOT NULL DEFAULT '{}';

-- Comentário público (comment e comment_and_dm)
UPDATE instagram_automations
SET comment_response_variants = ARRAY[trim(response_text)]
WHERE cardinality(comment_response_variants) = 0
  AND type = 'comment'
  AND response_type IN ('comment', 'comment_and_dm')
  AND trim(coalesce(response_text, '')) <> '';

-- DM via comment_and_dm
UPDATE instagram_automations
SET dm_response_variants = ARRAY[trim(response_text_dm)]
WHERE cardinality(dm_response_variants) = 0
  AND response_type = 'comment_and_dm'
  AND trim(coalesce(response_text_dm, '')) <> '';

-- Comentário → DM (texto)
UPDATE instagram_automations
SET dm_response_variants = ARRAY[trim(response_text)]
WHERE cardinality(dm_response_variants) = 0
  AND type = 'comment'
  AND response_type = 'direct'
  AND trim(coalesce(response_text, '')) <> '';

-- Automação DM: primeira mensagem de texto da sequência (ou response_text legado)
UPDATE instagram_automations
SET dm_response_variants = ARRAY[
  COALESCE(
    NULLIF(trim(response_text), ''),
    NULLIF(trim(response_sequence->0->>'content'), '')
  )
]
WHERE cardinality(dm_response_variants) = 0
  AND type = 'dm'
  AND (
    trim(coalesce(response_text, '')) <> ''
    OR (response_sequence IS NOT NULL AND jsonb_array_length(response_sequence::jsonb) > 0)
  );
