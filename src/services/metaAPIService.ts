/**
 * Integração com Meta/Instagram Graph API (Instagram + Facebook Graph quando necessário).
 */

import axios, { AxiosError } from 'axios';
import { META_CONFIG } from '../config/constants';

export interface MetaAPIResponse {
  statusCode: number;
  data: unknown;
}

function toMetaError(err: unknown, context: string): Error {
  if (axios.isAxiosError(err)) {
    const status = (err as AxiosError).response?.status;
    const data = (err as AxiosError).response?.data;
    return new Error(`${context}: ${status} - ${JSON.stringify(data)}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Fazer requisição para Meta Graph API
 */
export const requestMetaAPI = async (
  method: string,
  path: string,
  accessToken: string,
  body?: unknown
): Promise<MetaAPIResponse> => {
  const baseUrl = META_CONFIG.BASE_URL;
  const version = META_CONFIG.GRAPH_VERSION;
  const url = `${baseUrl}/${version}${path}`;

  try {
    const config: {
      method: string;
      url: string;
      headers: Record<string, string>;
      params?: Record<string, string>;
      data?: unknown;
    } = {
      method,
      url,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (method === 'GET' && body) {
      config.params = body as Record<string, string>;
    } else if (body) {
      config.data = body;
    }

    const response = await axios(config);
    return { statusCode: response.status, data: response.data };
  } catch (error) {
    throw toMetaError(error, 'Meta API');
  }
};

/**
 * Trocar código de autorização por access token de curta duração
 */
export const exchangeCodeForToken = async (code: string): Promise<{
  access_token: string;
  user_id: string;
}> => {
  const apiBaseUrl = META_CONFIG.API_BASE_URL;
  const url = `${apiBaseUrl}/oauth/access_token`;

  // Validar que as configurações estão presentes
  if (!META_CONFIG.APP_ID || !META_CONFIG.APP_SECRET) {
    throw new Error('META_APP_ID e META_APP_SECRET devem estar configurados');
  }

  try {
    // Usar URLSearchParams para enviar como form data no body
    const formData = new URLSearchParams({
        client_id: META_CONFIG.APP_ID,
        client_secret: META_CONFIG.APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: META_CONFIG.REDIRECT_URI,
        code,
    });

    const response = await axios.post(url, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.data;
  } catch (error) {
    throw toMetaError(error, 'OAuth');
  }
};

/**
 * Trocar token de curta duração por long-lived token
 * Doc: GET https://graph.instagram.com/access_token (sem versão no path)
 */
export const exchangeForLongLivedToken = async (shortLivedToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> => {
  const baseUrl = META_CONFIG.BASE_URL;
  const url = `${baseUrl}/access_token`;

  try {
    const response = await axios.get(url, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: META_CONFIG.APP_SECRET,
        access_token: shortLivedToken,
      },
    });

    return response.data;
  } catch (error) {
    throw toMetaError(error, 'Token Exchange');
  }
};

/**
 * Obter informações da conta Instagram
 */
export const getInstagramAccountInfo = async (accessToken: string): Promise<{
  user_id: string;
  username: string;
  account_type: string;
  name?: string;
  profile_picture_url?: string;
}> => {
  const response = await requestMetaAPI('GET', '/me', accessToken, {
    fields: 'user_id,username,account_type,name,profile_picture_url',
  });

  return response.data as {
    user_id: string;
    username: string;
    account_type: string;
    name?: string;
    profile_picture_url?: string;
  };
};

/**
 * Perfil do remetente em DMs (Instagram-scoped ID do webhook → nome, @username, foto).
 * Requer token IG da conta profissional + consentimento após a pessoa enviar mensagem.
 * Ref: User Profile API (Messaging)
 */
export const getInstagramMessagingUserProfile = async (
  accessToken: string,
  instagramScopedUserId: string
): Promise<{ name?: string; username?: string; profile_pic?: string } | null> => {
  try {
    const id = String(instagramScopedUserId).trim();
    if (!id) return null;
    const response = await requestMetaAPI('GET', `/${encodeURIComponent(id)}`, accessToken, {
      fields: 'name,username,profile_pic',
    });
    return response.data as { name?: string; username?: string; profile_pic?: string };
  } catch (error) {
    console.warn(
      '[Meta API] Perfil do remetente (IG Messaging):',
      error instanceof Error ? error.message : error
    );
    return null;
  }
};

/**
 * Renovar long-lived token
 */
export const refreshLongLivedToken = async (accessToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> => {
  const base = META_CONFIG.FACEBOOK_GRAPH_BASE;
  const version = META_CONFIG.GRAPH_VERSION;
  const url = `${base}/${version}/oauth/access_token`;

  try {
    const response = await axios.get(url, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: META_CONFIG.APP_ID,
        client_secret: META_CONFIG.APP_SECRET,
        fb_exchange_token: accessToken,
      },
    });

    return response.data;
  } catch (error) {
    throw toMetaError(error, 'Token Refresh');
  }
};

/**
 * Enviar mensagem direta
 */
export const sendDirectMessage = async (
  accessToken: string,
  recipientId: string,
  message: string
): Promise<unknown> => {
  const response = await requestMetaAPI('POST', '/me/messages', accessToken, {
    recipient: { id: recipientId },
    message: { text: message },
  });

  return response.data;
};

/**
 * Responder comentário
 */
export const replyToComment = async (
  accessToken: string,
  commentId: string,
  message: string
): Promise<unknown> => {
  const response = await requestMetaAPI('POST', `/${commentId}/replies`, accessToken, {
    message,
  });

  return response.data;
};

/**
 * Enviar mensagem direta via comment_id (quando recebe comentário e responde via DM)
 */
export const sendDirectMessageByCommentId = async (
  accessToken: string,
  pageId: string,
  commentId: string,
  message: string
): Promise<unknown> => {
  const response = await requestMetaAPI('POST', `/${pageId}/messages`, accessToken, {
    recipient: { comment_id: commentId },
    message: { text: message },
  });

  return response.data;
};

/** Enviar mensagem direta com anexo (imagem, vídeo ou áudio). */
function sendDirectMessageAttachment(
  accessToken: string,
  pageId: string,
  recipientId: string,
  attachmentType: 'image' | 'video' | 'audio',
  mediaUrl: string
): Promise<unknown> {
  return requestMetaAPI('POST', `/${pageId}/messages`, accessToken, {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: attachmentType,
        payload: { url: mediaUrl },
      },
    },
  }).then((r) => r.data);
}

export const sendDirectMessageImage = (
  accessToken: string,
  pageId: string,
  recipientId: string,
  imageUrl: string
) => sendDirectMessageAttachment(accessToken, pageId, recipientId, 'image', imageUrl);

export const sendDirectMessageVideo = (
  accessToken: string,
  pageId: string,
  recipientId: string,
  videoUrl: string
) => sendDirectMessageAttachment(accessToken, pageId, recipientId, 'video', videoUrl);

export const sendDirectMessageAudio = (
  accessToken: string,
  pageId: string,
  recipientId: string,
  audioUrl: string
) => sendDirectMessageAttachment(accessToken, pageId, recipientId, 'audio', audioUrl);

/**
 * Page do Facebook ligada ao IG + token de Page (necessário para subscribed_apps em graph.facebook.com).
 * Ref: https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/
 */
export const getLinkedFacebookPageForInstagram = async (
  accessToken: string,
  instagramAccountId: string
): Promise<{ pageId: string; pageAccessToken: string } | null> => {
  try {
    const base = META_CONFIG.FACEBOOK_GRAPH_BASE;
    const version = META_CONFIG.GRAPH_VERSION;
    const url = `${base}/${version}/me/accounts`;
    const igId = String(instagramAccountId);
    const { data } = await axios.get<{
      data?: Array<{
        id: string;
        access_token?: string;
        instagram_business_account?: { id: string };
      }>;
    }>(url, {
      params: {
        fields: 'id,access_token,instagram_business_account{id}',
        access_token: accessToken,
      },
      timeout: 10000,
    });
    const pages = data?.data;
    if (!Array.isArray(pages)) return null;
    const page = pages.find(
      (p) => String(p.instagram_business_account?.id || '') === igId
    );
    if (!page?.id || !page.access_token) return null;
    return { pageId: page.id, pageAccessToken: page.access_token };
  } catch {
    return null;
  }
};

/**
 * Inscrição em webhooks no Instagram Graph (fluxo Instagram Login).
 * O token de usuário IG não deve ir como Bearer aqui — use access_token na query (evita OAuth 190).
 * Ref: https://developers.facebook.com/docs/instagram-api/guides/webhooks#enable-subscriptions
 */
export const subscribeInstagramSubscribedApps = async (
  instagramUserId: string,
  accessToken: string,
  subscribedFields: string = 'comments,messages'
): Promise<void> => {
  const baseUrl = META_CONFIG.BASE_URL;
  const version = META_CONFIG.GRAPH_VERSION;
  const id = String(instagramUserId).trim();
  const url = `${baseUrl}/${version}/${id}/subscribed_apps`;
  await axios.post(url, null, {
    params: {
      access_token: accessToken,
      subscribed_fields: subscribedFields,
    },
    timeout: 15000,
  });
};

/**
 * Inscreve o app na Page/perfil para receber webhooks (comments, messages, etc.).
 * Ref: https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-instagram/
 */
export const subscribePageToApp = async (
  pageIdOrIgUserId: string,
  accessToken: string,
  subscribedFields: string = META_CONFIG.SUBSCRIBED_FIELDS
): Promise<boolean> => {
  try {
    const base = META_CONFIG.FACEBOOK_GRAPH_BASE;
    const version = META_CONFIG.GRAPH_VERSION;
    const url = `${base}/${version}/${pageIdOrIgUserId}/subscribed_apps`;
    await axios.post(
      url,
      {},
      {
        params: {
          access_token: accessToken,
          subscribed_fields: subscribedFields,
        },
        timeout: 15000,
      }
    );
    return true;
  } catch (err) {
    throw toMetaError(err, 'subscribed_apps');
  }
};
