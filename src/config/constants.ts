/**
 * Configurações centralizadas do microserviço Instagram (OnlyFlow)
 */

import dotenv from 'dotenv';

dotenv.config();

// Server
export const SERVER_CONFIG = {
  PORT: parseInt(process.env.PORT || '4335', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
};

/** URL do frontend (redirects OAuth e erros) */
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/** Status possíveis de uma instância Instagram */
export const INSTANCE_STATUSES = [
  'created',
  'connecting',
  'connected',
  'disconnected',
  'error',
] as const;
export type InstanceStatus = (typeof INSTANCE_STATUSES)[number];

// JWT Configuration (mesmo secret do backend principal)
export const JWT_CONFIG = {
  SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  EXPIRE: process.env.JWT_EXPIRE || '7d',
};

// PostgreSQL Configuration (mesmo banco do backend principal)
export const POSTGRES_CONFIG = {
  URI: process.env.POSTGRES_URI || 'postgres://user:password@localhost:5432/clerky_db',
};

// MongoDB Configuration (mesmo banco do backend principal)
export const MONGODB_CONFIG = {
  URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/clerky',
};

// Socket.io Configuration (backend principal)
export const SOCKET_CONFIG = {
  URL: (process.env.BACKEND_SOCKET_URL || process.env.SOCKET_URL || 'http://localhost:4331')
    .trim()
    .replace(/\/$/, ''),
};

// Meta/Instagram API
export const META_CONFIG = {
  GRAPH_VERSION: process.env.META_GRAPH_VERSION || 'v24.0',
  APP_ID: process.env.META_APP_ID || '',
  APP_SECRET: process.env.META_APP_SECRET || '',
  REDIRECT_URI:
    process.env.META_REDIRECT_URI ||
    'https://back.onlyflow.com.br/api/instagram/instances/oauth/callback',
  VERIFY_TOKEN: process.env.META_VERIFY_TOKEN || 'Tokenf7j4hd723fG5o2wle',
  BASE_URL: process.env.META_BASE_URL || 'https://graph.instagram.com',
  API_BASE_URL: process.env.META_API_BASE_URL || 'https://api.instagram.com',
  /** Base da Graph API do Facebook (Page subscribed_apps, me/accounts) */
  FACEBOOK_GRAPH_BASE: 'https://graph.facebook.com',
  /** Campos para inscrição em webhooks (Page/Instagram) */
  SUBSCRIBED_FIELDS: 'feed,comments,messages',
  /** Scopes OAuth Instagram */
  OAUTH_SCOPES: [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
  ] as const,
};
