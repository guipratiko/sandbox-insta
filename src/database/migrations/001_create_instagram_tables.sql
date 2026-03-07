-- Migration: Criar tabelas do Instagram (mensagens, comentários, automações, relatórios)
-- Este arquivo cria toda a estrutura base do sistema Insta-Clerky

-- Habilitar extensão UUID (se ainda não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABELA: instagram_messages
-- Armazena mensagens diretas recebidas/enviadas
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  sender_id VARCHAR(255) NOT NULL, -- ID do remetente no Instagram
  recipient_id VARCHAR(255) NOT NULL, -- ID do destinatário
  message_id VARCHAR(255) NOT NULL, -- ID único da mensagem
  text TEXT, -- Conteúdo da mensagem
  timestamp BIGINT NOT NULL, -- Unix timestamp
  replied BOOLEAN DEFAULT FALSE, -- Se foi respondida
  raw_data JSONB, -- Dados completos do webhook
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, instance_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_messages_instance_id ON instagram_messages(instance_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_user_id ON instagram_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_sender_id ON instagram_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_timestamp ON instagram_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_replied ON instagram_messages(replied);

-- ============================================
-- TABELA: instagram_comments
-- Armazena comentários em posts
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  comment_id VARCHAR(255) NOT NULL UNIQUE, -- ID único do comentário
  post_id VARCHAR(255) NOT NULL, -- ID do post
  media_id VARCHAR(255), -- ID da mídia
  from_user_id VARCHAR(255) NOT NULL, -- ID do usuário que comentou
  from_username VARCHAR(255), -- Username do usuário que comentou
  text TEXT NOT NULL, -- Texto do comentário
  timestamp BIGINT NOT NULL, -- Unix timestamp
  replied BOOLEAN DEFAULT FALSE, -- Se foi respondido
  reply_text TEXT, -- Texto da resposta se houver
  raw_data JSONB, -- Dados completos do webhook
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_instagram_comments_instance_id ON instagram_comments(instance_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_user_id ON instagram_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_post_id ON instagram_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_from_user_id ON instagram_comments(from_user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_timestamp ON instagram_comments(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_replied ON instagram_comments(replied);

-- ============================================
-- TABELA: instagram_automations
-- Armazena configurações de automações
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  name VARCHAR(255) NOT NULL, -- Nome da automação
  type VARCHAR(20) NOT NULL CHECK (type IN ('dm', 'comment')), -- Tipo: mensagem direta ou comentário
  trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('keyword', 'all')), -- Tipo de trigger
  keywords TEXT[], -- Array de palavras-chave (NULL se trigger_type = 'all')
  response_text TEXT NOT NULL, -- Texto da resposta
  response_type VARCHAR(20) NOT NULL CHECK (response_type IN ('direct', 'comment')), -- Tipo de resposta: DM ou comentário
  is_active BOOLEAN DEFAULT TRUE, -- Se está ativa
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_instagram_automations_user_id ON instagram_automations(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_automations_instance_id ON instagram_automations(instance_id);
CREATE INDEX IF NOT EXISTS idx_instagram_automations_is_active ON instagram_automations(is_active);
CREATE INDEX IF NOT EXISTS idx_instagram_automations_type ON instagram_automations(type);
CREATE INDEX IF NOT EXISTS idx_instagram_automations_user_instance_active ON instagram_automations(user_id, instance_id, is_active);

-- ============================================
-- TABELA: instagram_reports
-- Armazena relatórios de todas as interações
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  user_id VARCHAR(24) NOT NULL, -- ObjectId do MongoDB
  interaction_type VARCHAR(20) NOT NULL CHECK (interaction_type IN ('dm', 'comment')), -- Tipo de interação
  comment_id VARCHAR(255), -- ID do comentário se aplicável
  user_id_instagram VARCHAR(255) NOT NULL, -- ID do usuário no Instagram
  media_id VARCHAR(255), -- ID da mídia se aplicável
  username VARCHAR(255), -- Username do usuário
  interaction_text TEXT NOT NULL, -- Texto da interação
  response_text TEXT, -- Texto da resposta
  response_status VARCHAR(20) DEFAULT 'pending' CHECK (response_status IN ('pending', 'sent', 'failed')), -- Status da resposta
  timestamp BIGINT NOT NULL, -- Unix timestamp
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_instagram_reports_instance_id ON instagram_reports(instance_id);
CREATE INDEX IF NOT EXISTS idx_instagram_reports_user_id ON instagram_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_reports_interaction_type ON instagram_reports(interaction_type);
CREATE INDEX IF NOT EXISTS idx_instagram_reports_timestamp ON instagram_reports(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_reports_response_status ON instagram_reports(response_status);
CREATE INDEX IF NOT EXISTS idx_instagram_reports_user_instance ON instagram_reports(user_id, instance_id);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_instagram_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_instagram_messages_updated_at ON instagram_messages;
CREATE TRIGGER trigger_update_instagram_messages_updated_at
BEFORE UPDATE ON instagram_messages
FOR EACH ROW
EXECUTE FUNCTION update_instagram_messages_updated_at();

CREATE OR REPLACE FUNCTION update_instagram_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_instagram_comments_updated_at ON instagram_comments;
CREATE TRIGGER trigger_update_instagram_comments_updated_at
BEFORE UPDATE ON instagram_comments
FOR EACH ROW
EXECUTE FUNCTION update_instagram_comments_updated_at();

CREATE OR REPLACE FUNCTION update_instagram_automations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_instagram_automations_updated_at ON instagram_automations;
CREATE TRIGGER trigger_update_instagram_automations_updated_at
BEFORE UPDATE ON instagram_automations
FOR EACH ROW
EXECUTE FUNCTION update_instagram_automations_updated_at();
