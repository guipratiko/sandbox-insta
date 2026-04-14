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
  /** Resposta a um story no chat (Meta envia `reply_to.story` com URL da mídia). */
  reply_to?: {
    story?: { url?: string; id?: string };
  };
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
 * - `story_mention` (attachment): menção no story.
 * - `reply_to.story`: utilizador respondeu / “repost” do teu story no DM (imagem em `url`).
 */
export function buildInstagramCrmPayloadFromMessage(
  message: IgWebhookMessage | null | undefined,
  options?: BuildInstagramCrmPayloadOptions
): InstagramCrmMessagePayload {
  const text = (message?.text || '').trim();
  const attachments = message?.attachments || [];

  const storyReply = message?.reply_to?.story;
  if (storyReply && (storyReply.url?.trim() || storyReply.id)) {
    const url = storyReply.url?.trim() || null;
    const u = options?.senderUsername?.trim();
    const handlePart = u
      ? u.startsWith('@')
        ? u
        : `@${u}`
      : null;
    const line = handlePart
      ? `${handlePart} repostou seu story`
      : 'Repost pelo usuário';
    return {
      content: line,
      messageType: url ? 'imageMessage' : 'conversation',
      mediaUrl: url,
    };
  }

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
