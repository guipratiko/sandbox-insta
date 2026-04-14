/**
 * Normaliza DM do Instagram (webhook Meta) para o formato do CRM OnlyFlow (messages.content / message_type / media_url).
 * Anexos vêm como attachments[].type + payload.url (CDN lookaside.fbsbx.com).
 */

export interface IgWebhookAttachment {
  type?: string;
  payload?: { url?: string };
}

export interface IgWebhookMessage {
  text?: string;
  attachments?: IgWebhookAttachment[];
}

export type InstagramCrmMessagePayload = {
  content: string;
  messageType: string;
  mediaUrl: string | null;
};

export type BuildInstagramCrmPayloadOptions = {
  /** Username do remetente (sem @) — User Profile API; usado em story_mention. */
  senderUsername?: string | null;
};

const IG_TYPE_TO_CRM: Record<string, string> = {
  image: 'imageMessage',
  video: 'videoMessage',
  audio: 'audioMessage',
  file: 'documentMessage',
};

const CRM_PLACEHOLDER: Record<string, string> = {
  imageMessage: '[Imagem]',
  videoMessage: '[Vídeo]',
  audioMessage: '[Áudio]',
  documentMessage: '[Anexo]',
};

/**
 * Monta content / message_type / media_url a partir do webhook Meta.
 * `story_mention`: texto legível no CRM + pré-visualização da imagem do story quando há URL.
 */
export function buildInstagramCrmPayloadFromMessage(
  message: IgWebhookMessage | null | undefined,
  options?: BuildInstagramCrmPayloadOptions
): InstagramCrmMessagePayload {
  const text = (message?.text || '').trim();
  const attachments = message?.attachments || [];

  for (const att of attachments) {
    const rawType = String(att?.type || '').toLowerCase();
    if (rawType === 'story_mention') {
      const url = att?.payload?.url?.trim() || null;
      const u = options?.senderUsername?.trim();
      const handlePart = u
        ? u.startsWith('@')
          ? u
          : `@${u}`
        : 'Alguém';
      const line = `${handlePart} mencionou você`;
      return {
        content: line,
        messageType: url ? 'imageMessage' : 'conversation',
        mediaUrl: url,
      };
    }
  }

  let mediaUrl: string | null = null;
  let igType = '';

  for (const att of attachments) {
    const u = att?.payload?.url?.trim();
    if (u) {
      mediaUrl = u;
      igType = String(att?.type || '').toLowerCase();
      break;
    }
  }

  if (!mediaUrl) {
    return {
      content: text,
      messageType: 'conversation',
      mediaUrl: null,
    };
  }

  const messageType = IG_TYPE_TO_CRM[igType] || 'documentMessage';
  const placeholder = CRM_PLACEHOLDER[messageType] || '[Mídia]';
  const content = text || placeholder;

  return { content, messageType, mediaUrl };
}
