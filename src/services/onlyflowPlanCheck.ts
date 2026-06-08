import axios from 'axios';

const BASE = (process.env.ONLYFLOW_API_BASE_URL || '').trim().replace(/\/$/, '');
const KEY = (process.env.ONLYFLOW_INTERNAL_KEY || process.env.JWT_SECRET || '').trim();
const CACHE_MS = 60_000;
const cache = new Map<string, { ok: boolean; until: number }>();

export async function canUserRunAutomations(userId: string): Promise<boolean> {
  const id = String(userId || '').trim();
  if (!id) return false;
  if (!BASE || !KEY) {
    console.warn('[insta] ONLYFLOW_API_BASE_URL ou ONLYFLOW_INTERNAL_KEY ausente — bloqueando automação.');
    return false;
  }
  const hit = cache.get(id);
  if (hit && hit.until > Date.now()) return hit.ok;
  try {
    const res = await axios.get<{ data?: { canRunAutomations?: boolean } }>(
      `${BASE}/api/internal/users/${encodeURIComponent(id)}/automation-eligible`,
      { headers: { 'x-onlyflow-internal-key': KEY }, timeout: 10_000 }
    );
    const ok = res.data?.data?.canRunAutomations === true;
    cache.set(id, { ok, until: Date.now() + CACHE_MS });
    return ok;
  } catch (err) {
    console.warn('[insta] Falha ao verificar plano:', err instanceof Error ? err.message : err);
    cache.set(id, { ok: false, until: Date.now() + 15_000 });
    return false;
  }
}
