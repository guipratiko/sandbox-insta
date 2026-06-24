/**
 * Endpoints internos para execução de workflows ManyFlow (MindClerky).
 */

import { Response, NextFunction } from 'express';
import { InstanceService } from '../services/instanceService';
import {
  sendDirectMessage,
  sendDirectMessageImage,
  sendDirectMessageVideo,
  sendDirectMessageAudio,
  sendDirectMessageQuickReplies,
} from '../services/metaAPIService';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';

type DmResponseType = 'text' | 'image' | 'image_caption' | 'video' | 'audio' | 'quick_replies';

export const sendWorkflowDm = async (
  req: { body?: Record<string, unknown> },
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body || {};
    const userId = body.userId != null ? String(body.userId) : '';
    const instanceId = body.instanceId != null ? String(body.instanceId) : '';
    const recipientId = body.recipientId != null ? String(body.recipientId) : '';
    const responseType = (body.responseType != null ? String(body.responseType) : 'text') as DmResponseType;
    const content = body.content != null ? String(body.content) : '';
    const mediaUrl = body.mediaUrl != null ? String(body.mediaUrl) : '';
    const caption = body.caption != null ? String(body.caption) : '';

    if (!userId || !instanceId || !recipientId) {
      return next(createValidationError('userId, instanceId e recipientId são obrigatórios'));
    }

    const instance = await InstanceService.getByIdWithToken(instanceId, userId);
    if (!instance?.accessToken) {
      return next(createNotFoundError('Instância'));
    }
    if (instance.status !== 'connected') {
      return next(createValidationError('Instância Instagram não está conectada'));
    }

    const pageId = instance.instagramAccountId;
    const token = instance.accessToken;

    switch (responseType) {
      case 'text':
        if (!content.trim()) {
          return next(createValidationError('Texto é obrigatório'));
        }
        await sendDirectMessage(token, recipientId.trim(), content.trim());
        break;
      case 'image':
        if (!mediaUrl.trim()) {
          return next(createValidationError('URL da imagem é obrigatória'));
        }
        if (!pageId) {
          return next(createValidationError('instagramAccountId ausente na instância'));
        }
        await sendDirectMessageImage(token, pageId, recipientId.trim(), mediaUrl.trim());
        break;
      case 'image_caption':
        if (!mediaUrl.trim()) {
          return next(createValidationError('URL da imagem é obrigatória'));
        }
        if (!pageId) {
          return next(createValidationError('instagramAccountId ausente na instância'));
        }
        await sendDirectMessageImage(token, pageId, recipientId.trim(), mediaUrl.trim());
        if (caption.trim()) {
          await sendDirectMessage(token, recipientId.trim(), caption.trim());
        }
        break;
      case 'video':
        if (!mediaUrl.trim()) {
          return next(createValidationError('URL do vídeo é obrigatória'));
        }
        if (!pageId) {
          return next(createValidationError('instagramAccountId ausente na instância'));
        }
        await sendDirectMessageVideo(token, pageId, recipientId.trim(), mediaUrl.trim());
        break;
      case 'audio':
        if (!mediaUrl.trim()) {
          return next(createValidationError('URL do áudio é obrigatória'));
        }
        if (!pageId) {
          return next(createValidationError('instagramAccountId ausente na instância'));
        }
        await sendDirectMessageAudio(token, pageId, recipientId.trim(), mediaUrl.trim());
        break;
      case 'quick_replies': {
        if (!content.trim()) {
          return next(createValidationError('Texto é obrigatório para Quick Replies'));
        }
        if (!pageId) {
          return next(createValidationError('instagramAccountId ausente na instância'));
        }
        const rawReplies = body.quickReplies;
        const quickReplies = Array.isArray(rawReplies)
          ? rawReplies
              .map((item) => {
                if (!item || typeof item !== 'object') return null;
                const row = item as Record<string, unknown>;
                const title = row.title != null ? String(row.title).trim() : '';
                if (!title) return null;
                const payload = row.payload != null ? String(row.payload).trim() : title;
                return { title, payload };
              })
              .filter((item): item is { title: string; payload: string } => item != null)
          : [];
        if (quickReplies.length === 0) {
          return next(createValidationError('Ao menos um Quick Reply é obrigatório'));
        }
        await sendDirectMessageQuickReplies(
          token,
          pageId,
          recipientId.trim(),
          content.trim(),
          quickReplies
        );
        break;
      }
      default:
        return next(createValidationError(`Tipo de resposta não suportado: ${responseType}`));
    }

    res.status(200).json({ status: 'success', message: 'DM enviada' });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar DM do workflow'));
  }
};
