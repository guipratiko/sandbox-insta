/**
 * Aciona workflows ManyFlow (MindClerky) quando chega DM no Instagram.
 */

import axios from 'axios';

const BASE = (
  process.env.MINDLERKY_URL ||
  process.env.MINDCLERKY_API_URL ||
  'http://localhost:4333/api'
)
  .trim()
  .replace(/\/$/, '');

const API_BASE = BASE.endsWith('/api') ? BASE : `${BASE}/api`;
const KEY = (process.env.ONLYFLOW_INTERNAL_KEY || process.env.JWT_SECRET || '').trim();

export function getMindClerkyApiBase(): string {
  return API_BASE;
}

export interface TriggerInstagramWorkflowsParams {
  instanceId: string;
  userId: string;
  senderId: string;
  messageText: string;
  hasMedia: boolean;
  contactUsername?: string;
  contactName?: string;
}

export async function triggerInstagramWorkflows(
  params: TriggerInstagramWorkflowsParams
): Promise<number> {
  if (!KEY) {
    console.warn('[insta] ONLYFLOW_INTERNAL_KEY ausente — workflows ManyFlow ignorados.');
    return 0;
  }

  try {
    const res = await axios.post(
      `${API_BASE}/workflows/trigger-instagram`,
      params,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-onlyflow-internal-key': KEY,
        },
        timeout: 15_000,
      }
    );
    const count = res.data?.executedCount;
    return typeof count === 'number' ? count : 0;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        console.warn(
          `[insta] MindClerky indisponível em ${API_BASE}/workflows/trigger-instagram (${err.code}) — inicie o serviço na porta 4333 ou ajuste MINDLERKY_URL no .env do Insta-Clerky.`
        );
        return 0;
      }
      const status = err.response?.status;
      const body = err.response?.data;
      console.error(
        `[insta] Erro ao acionar MindClerky (${API_BASE}):`,
        status ? `HTTP ${status}` : err.message,
        body ? JSON.stringify(body) : ''
      );
    } else {
      console.error('[insta] Erro ao acionar MindClerky:', err);
    }
    return 0;
  }
}
