/**
 * Envio de DMs pelo CRM OnlyFlow (texto e mídia via URL pública).
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { InstanceService } from '../services/instanceService';
import {
  sendDirectMessage,
  sendDirectMessageImage,
  sendDirectMessageVideo,
  sendDirectMessageAudio,
} from '../services/metaAPIService';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';

function extractMetaMessageId(data: unknown): string {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.message_id === 'string') return d.message_id;
    if (d.message_id != null) return String(d.message_id);
    if (d.messageId != null) return String(d.messageId);
  }
  return `ig_out_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const sendCrmText = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id: instanceId } = req.params;
    const { recipientId, text } = req.body as { recipientId?: string; text?: string };

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }
    if (!recipientId?.trim()) {
      return next(createValidationError('recipientId é obrigatório'));
    }
    if (!text?.trim()) {
      return next(createValidationError('Texto é obrigatório'));
    }

    const instance = await InstanceService.getByIdWithToken(instanceId, userId);
    if (!instance?.accessToken) {
      return next(createNotFoundError('Instância'));
    }
    if (instance.status !== 'connected') {
      return next(createValidationError('Conecte a instância do Instagram antes de enviar mensagens'));
    }

    const data = await sendDirectMessage(
      instance.accessToken,
      recipientId.trim(),
      text.trim()
    );
    const messageId = extractMetaMessageId(data);

    res.status(200).json({
      status: 'success',
      data: { messageId },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar mensagem Instagram'));
  }
};

export const sendCrmAttachment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id: instanceId } = req.params;
    const { recipientId, mediaUrl, attachmentType } = req.body as {
      recipientId?: string;
      mediaUrl?: string;
      attachmentType?: string;
    };

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }
    if (!recipientId?.trim()) {
      return next(createValidationError('recipientId é obrigatório'));
    }
    if (!mediaUrl?.trim()) {
      return next(createValidationError('mediaUrl é obrigatório'));
    }
    const type = (attachmentType || '').toLowerCase().trim();
    if (!['image', 'video', 'audio'].includes(type)) {
      return next(createValidationError('attachmentType deve ser image, video ou audio'));
    }

    const instance = await InstanceService.getByIdWithToken(instanceId, userId);
    if (!instance?.accessToken) {
      return next(createNotFoundError('Instância'));
    }
    if (instance.status !== 'connected') {
      return next(createValidationError('Conecte a instância do Instagram antes de enviar mensagens'));
    }

    const pageId = (instance.pageId || instance.instagramAccountId || '').trim();
    if (!pageId) {
      return next(createValidationError('Conta Instagram não configurada'));
    }

    const token = instance.accessToken;
    const rid = recipientId.trim();
    const url = mediaUrl.trim();

    let data: unknown;
    if (type === 'image') {
      data = await sendDirectMessageImage(token, pageId, rid, url);
    } else if (type === 'video') {
      data = await sendDirectMessageVideo(token, pageId, rid, url);
    } else {
      data = await sendDirectMessageAudio(token, pageId, rid, url);
    }

    const messageId = extractMetaMessageId(data);

    res.status(200).json({
      status: 'success',
      data: { messageId },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao enviar mídia Instagram'));
  }
};
