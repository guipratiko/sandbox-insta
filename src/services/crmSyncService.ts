/**
 * Espelha DMs do Instagram nas tabelas unificadas do CRM (contacts / messages),
 * as mesmas usadas pelo OnlyFlow Backend — para o frontend carregar via /api/crm.
 */

import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pgPool } from '../config/databases';
import { getInstagramMessagingUserProfile } from './metaAPIService';
import { emitInstagramUpdate } from '../socket/socketClient';
import {
  buildInstagramCrmPayloadFromMessage,
  type IgWebhookMessage,
} from '../utils/instagramDmPayload';

const INSTAGRAM_JID_SUFFIX = '@instagram.dm';

export function instagramRemoteJid(senderId: string): string {
  return `${senderId}${INSTAGRAM_JID_SUFFIX}`;
}

/** IDs de mensagem do Meta podem exceder VARCHAR(255) em messages.message_id */
function normalizeCrmMessageId(instagramMid: string): string {
  if (instagramMid.length <= 255) return instagramMid;
  return `ig:${crypto.createHash('sha256').update(instagramMid).digest('hex')}`;
}

function toMessageDate(ts: number | undefined): Date {
  const t = ts ?? Math.floor(Date.now() / 1000);
  const ms = t > 1_000_000_000_000 ? t : t * 1000;
  return new Date(ms);
}

export type CrmSyncResult = { contactId: string; crmMessageUuid: string };

export interface InstagramCrmSyncParams {
  userId: string;
  instanceId: string;
  senderId: string;
  messageId: string;
  /** Conteúdo em `messages.content` (texto ou placeholder tipo [Imagem]). */
  text: string;
  /** Alinhado ao CRM WhatsApp: imageMessage, videoMessage, audioMessage, documentMessage, conversation. */
  messageType?: string;
  mediaUrl?: string | null;
  timestamp?: number;
  /** Nome amigável (User Profile API / Messaging). */
  contactDisplayName?: string | null;
  profilePictureUrl?: string | null;
  /**
   * Quando true, INSERT em messages não dispara triggers (usar só dentro de backfill + session_replica).
   * Fora do backfill deve ser false/omitido.
   */
  triggersSuppressed?: boolean;
}

/**
 * Monta o texto do card do CRM a partir da resposta da User Profile API (Messaging).
 * Ref: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile/
 */
export function formatIgContactDisplayName(profile: {
  name?: string;
  username?: string;
} | null | undefined): string | undefined {
  if (!profile) return undefined;
  const parts: string[] = [];
  if (profile.name?.trim()) parts.push(profile.name.trim());
  const u = profile.username?.trim();
  if (u) parts.push(u.startsWith('@') ? u : `@${u}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

async function getFirstColumnId(client: PoolClient, userId: string): Promise<string | null> {
  const colRes = await client.query<{ id: string }>(
    `SELECT id FROM crm_columns WHERE user_id = $1 ORDER BY order_index ASC LIMIT 1`,
    [userId]
  );
  return colRes.rows[0]?.id ?? null;
}

/**
 * Núcleo do sync (pode reutilizar o mesmo cliente em transação).
 */
export async function syncInstagramInboundDmToCrmWithClient(
  client: PoolClient,
  params: InstagramCrmSyncParams
): Promise<CrmSyncResult | null> {
  const {
    userId,
    instanceId,
    senderId,
    messageId,
    text,
    messageType = 'conversation',
    mediaUrl = null,
    timestamp,
    contactDisplayName,
    profilePictureUrl,
    triggersSuppressed = false,
  } = params;

  const remoteJid = instagramRemoteJid(senderId);
  const crmMessageId = normalizeCrmMessageId(messageId);
  const ts = toMessageDate(timestamp);
  const fallbackName = `Instagram ${senderId}`;
  const insertName = (contactDisplayName?.trim() || fallbackName).slice(0, 255);

  const columnId = await getFirstColumnId(client, userId);
  if (!columnId) {
    console.warn(
      '[CRM sync IG] Sem colunas CRM (crm_columns). Abra o CRM no OnlyFlow uma vez para criar o Kanban.'
    );
    return null;
  }

  const pic =
    profilePictureUrl && profilePictureUrl.trim() !== '' ? profilePictureUrl.trim() : null;

  let contactId: string;
  const existingContact = await client.query<{ id: string }>(
    `SELECT id FROM contacts WHERE user_id = $1 AND instance_id = $2 AND remote_jid = $3`,
    [userId, instanceId, remoteJid]
  );

  if (existingContact.rows.length > 0) {
    contactId = existingContact.rows[0].id;
    if (contactDisplayName != null || profilePictureUrl != null) {
      await client.query(
        `UPDATE contacts SET
          name = CASE WHEN $1::text IS NOT NULL AND TRIM($1::text) <> '' THEN TRIM($1::text) ELSE name END,
          profile_picture = CASE WHEN $2::text IS NOT NULL AND TRIM($2::text) <> '' THEN TRIM($2::text) ELSE profile_picture END,
          updated_at = NOW()
         WHERE id = $3::uuid`,
        [contactDisplayName ?? null, profilePictureUrl ?? null, contactId]
      );
    }
  } else {
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO contacts (user_id, instance_id, remote_jid, phone, name, profile_picture, column_id, unread_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
         RETURNING id`,
        [userId, instanceId, remoteJid, senderId, insertName, pic, columnId]
      );
      contactId = ins.rows[0].id;
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
      if (code !== '23505') {
        throw err;
      }
      const again = await client.query<{ id: string }>(
        `SELECT id FROM contacts WHERE user_id = $1 AND instance_id = $2 AND remote_jid = $3`,
        [userId, instanceId, remoteJid]
      );
      if (again.rows.length === 0) {
        throw err;
      }
      contactId = again.rows[0].id;
      if (contactDisplayName != null || profilePictureUrl != null) {
        await client.query(
          `UPDATE contacts SET
            name = CASE WHEN $1::text IS NOT NULL AND TRIM($1::text) <> '' THEN TRIM($1::text) ELSE name END,
            profile_picture = CASE WHEN $2::text IS NOT NULL AND TRIM($2::text) <> '' THEN TRIM($2::text) ELSE profile_picture END,
            updated_at = NOW()
           WHERE id = $3::uuid`,
          [contactDisplayName ?? null, profilePictureUrl ?? null, contactId]
        );
      }
    }
  }

  const msgExists = await client.query<{ id: string }>(
    `SELECT id FROM messages WHERE message_id = $1 AND instance_id = $2`,
    [crmMessageId, instanceId]
  );
  const content = text || '';
  const media = mediaUrl && String(mediaUrl).trim() !== '' ? String(mediaUrl).trim() : null;
  const msgType = media ? messageType : 'conversation';

  if (msgExists.rows.length === 0) {
    const readFlag = triggersSuppressed;
    try {
      await client.query(
        `INSERT INTO messages (
          user_id, instance_id, contact_id, remote_jid, message_id, from_me, message_type, content, media_url, timestamp, read
        ) VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, $10)`,
        [
          userId,
          instanceId,
          contactId,
          remoteJid,
          crmMessageId,
          msgType,
          content,
          media,
          ts,
          readFlag,
        ]
      );
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
      if (code !== '23505') {
        throw err;
      }
    }
  }

  const ex = await client.query<{ id: string }>(
    `SELECT id FROM messages WHERE message_id = $1 AND instance_id = $2`,
    [crmMessageId, instanceId]
  );
  const crmMessageUuid = ex.rows[0]?.id;
  if (!crmMessageUuid) {
    return null;
  }

  return { contactId, crmMessageUuid };
}

export async function syncInstagramInboundDmToCrm(
  params: InstagramCrmSyncParams
): Promise<CrmSyncResult | null> {
  const client = await pgPool.connect();
  try {
    return await syncInstagramInboundDmToCrmWithClient(client, params);
  } catch (e) {
    console.error('[CRM sync IG] Falha ao espelhar DM no CRM (contacts/messages):', e);
    return null;
  } finally {
    client.release();
  }
}

/** Compara contagens para saber se falta espelhar histórico do instagram_messages. */
export async function needsInstagramCrmBackfill(
  instanceId: string,
  businessInstagramAccountId: string | undefined
): Promise<boolean> {
  const biz = (businessInstagramAccountId || '').trim();
  const igRes = await pgPool.query<{ c: string }>(
    biz
      ? `SELECT COUNT(*)::text AS c FROM instagram_messages WHERE instance_id = $1 AND sender_id <> $2`
      : `SELECT COUNT(*)::text AS c FROM instagram_messages WHERE instance_id = $1`,
    biz ? [instanceId, biz] : [instanceId]
  );
  const crmRes = await pgPool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM messages m
     INNER JOIN contacts c ON c.id = m.contact_id
     WHERE m.instance_id = $1 AND c.remote_jid LIKE '%' || $2`,
    [instanceId, INSTAGRAM_JID_SUFFIX]
  );
  const ig = parseInt(igRes.rows[0]?.c || '0', 10);
  const crm = parseInt(crmRes.rows[0]?.c || '0', 10);
  return ig > crm;
}

const backfillInProgress = new Set<string>();

export type IInstanceForCrmBackfill = {
  _id: { toString(): string };
  userId: { toString(): string };
  instagramAccountId?: string;
  accessToken?: string;
};

/**
 * Importa mensagens antigas de instagram_messages para contacts/messages (idempotente).
 * Usa session_replication_role=replica para não disparar incremento de não lidas em histórico.
 */
export async function backfillInstagramHistoryToCrm(instance: IInstanceForCrmBackfill): Promise<void> {
  const instanceId = instance._id.toString();
  const userId = instance.userId.toString();
  const businessId = (instance.instagramAccountId || '').trim();

  let q = `
    SELECT message_id, sender_id, text, timestamp, raw_data
    FROM instagram_messages
    WHERE instance_id = $1
  `;
  const params: string[] = [instanceId];
  if (businessId) {
    q += ` AND sender_id <> $2`;
    params.push(businessId);
  }
  q += ` ORDER BY timestamp ASC`;

  const { rows } = await pgPool.query<{
    message_id: string;
    sender_id: string;
    text: string | null;
    timestamp: string | number;
    raw_data: unknown;
  }>(q, params);

  if (rows.length === 0) {
    return;
  }

  const uniqueSenders = [...new Set(rows.map((r) => r.sender_id))];
  const profileBySender = new Map<
    string,
    { name?: string; username?: string; profile_pic?: string }
  >();

  const token = instance.accessToken;
  if (token) {
    for (const sid of uniqueSenders) {
      try {
        const p = await getInstagramMessagingUserProfile(token, sid);
        if (p) profileBySender.set(sid, p);
      } catch {
        /* log dentro do getter */
      }
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL session_replication_role = 'replica'");

    for (const row of rows) {
      const ts =
        typeof row.timestamp === 'string'
          ? parseInt(row.timestamp, 10)
          : Number(row.timestamp);
      const prof = profileBySender.get(row.sender_id);
      const display = formatIgContactDisplayName(prof);

      let text = row.text || '';
      let messageType: string | undefined;
      let mediaUrl: string | null | undefined;
      try {
        const raw = row.raw_data;
        const obj =
          typeof raw === 'string'
            ? (JSON.parse(raw) as { message?: { text?: string; attachments?: unknown[] } })
            : (raw as { message?: { text?: string; attachments?: unknown[] } });
        const m = obj?.message;
        if (m && typeof m === 'object') {
          const b = buildInstagramCrmPayloadFromMessage(m as IgWebhookMessage);
          text = b.content;
          messageType = b.messageType;
          mediaUrl = b.mediaUrl;
        }
      } catch {
        /* manter coluna text */
      }

      await syncInstagramInboundDmToCrmWithClient(client, {
        userId,
        instanceId,
        senderId: row.sender_id,
        messageId: row.message_id,
        text,
        messageType,
        mediaUrl: mediaUrl ?? null,
        timestamp: ts,
        contactDisplayName: display,
        profilePictureUrl: prof?.profile_pic ?? null,
        triggersSuppressed: true,
      });
    }

    await client.query(
      `UPDATE contacts c SET
        last_message = x.lm,
        last_message_at = x.lma,
        updated_at = NOW()
       FROM (
         SELECT DISTINCT ON (m.contact_id)
           m.contact_id,
           LEFT(m.content, 100) AS lm,
           m.timestamp AS lma
         FROM messages m
         INNER JOIN contacts ct ON ct.id = m.contact_id AND ct.remote_jid LIKE '%' || $2
         WHERE m.instance_id = $1
         ORDER BY m.contact_id, m.timestamp DESC
       ) x
       WHERE c.id = x.contact_id`,
      [instanceId, INSTAGRAM_JID_SUFFIX]
    );

    await client.query('COMMIT');
    console.log(
      `[CRM backfill IG] Instância ${instanceId}: ${rows.length} mensagem(ns) sincronizadas para o CRM.`
    );
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[CRM backfill IG] Falha:', e);
    throw e;
  } finally {
    client.release();
  }
}

export function scheduleInstagramCrmBackfill(instance: IInstanceForCrmBackfill): void {
  const id = instance._id.toString();
  if (backfillInProgress.has(id)) {
    return;
  }

  void (async () => {
    const biz = instance.instagramAccountId;
    let needed = true;
    try {
      needed = await needsInstagramCrmBackfill(id, biz);
    } catch (e) {
      console.warn('[CRM backfill IG] Falha ao checar necessidade:', e);
    }
    if (!needed) {
      return;
    }

    backfillInProgress.add(id);
    try {
      await backfillInstagramHistoryToCrm(instance);
      emitInstagramUpdate(instance.userId.toString(), {
        type: 'backfill',
        instanceId: id,
      });
    } catch {
      /* já logado */
    } finally {
      backfillInProgress.delete(id);
    }
  })();
}
