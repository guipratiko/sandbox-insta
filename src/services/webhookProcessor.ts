/**
 * Processamento de webhooks Instagram/Meta (mensagens diretas e comentários).
 */

import { IInstagramInstance } from '../models/InstagramInstance';
import { InstanceService } from './instanceService';
import { AutomationService } from './automationService';
import {
  applyUserContactVariable,
  pickRandomVariant,
  resolveCommentVariants,
  resolveDmVariants,
} from '../utils/responseVariants';
import { ReportService } from './reportService';
import {
  sendDirectMessage,
  sendDirectMessageImage,
  sendDirectMessageVideo,
  sendDirectMessageAudio,
  replyToComment,
  sendDirectMessageByCommentId,
  getInstagramMessagingUserProfile,
} from './metaAPIService';
import { pgPool } from '../config/databases';
import { emitInstagramUpdate } from '../socket/socketClient';
import {
  syncInstagramInboundDmToCrm,
  scheduleInstagramCrmBackfill,
  formatIgContactDisplayName,
} from './crmSyncService';
import { buildInstagramCrmPayloadFromMessage } from '../utils/instagramDmPayload';
import { triggerInstagramWorkflows } from './mindclerkyTriggerService';

// ——— Tipos mínimos para eventos do webhook ———
interface DirectMessageEvent {
  sender?: { id: string };
  recipient?: { id: string };
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
    reply_to?: { story?: { url?: string; id?: string } };
  };
  timestamp?: number;
}

interface CommentChangeValue {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
}

/** Retorna a instância com accessToken para chamadas à API, ou null. */
async function getInstanceWithToken(
  instagramAccountId: string
): Promise<(IInstagramInstance & { accessToken: string }) | null> {
  const instance = await InstanceService.getByInstagramAccountId(instagramAccountId);
  if (!instance?.accessToken) return null;
  return instance as IInstagramInstance & { accessToken: string };
}

/** Verifica se já existe relatório para esta automação + usuário + tipo (preventDuplicate). */
async function wasAlreadyProcessed(
  automationId: string,
  userIdInstagram: string,
  interactionType: 'dm' | 'comment'
): Promise<boolean> {
  const { rows } = await pgPool.query<{ id: string }>(
    `SELECT id FROM instagram_reports
     WHERE automation_id = $1 AND user_id_instagram = $2 AND interaction_type = $3
     LIMIT 1`,
    [automationId, userIdInstagram, interactionType]
  );
  return rows.length > 0;
}

/**
 * Processar mensagem direta recebida
 */
export const processDirectMessage = async (
  instance: IInstagramInstance,
  event: DirectMessageEvent
): Promise<void> => {
  try {
    const senderId = event.sender?.id;
    const message = event.message;

    if (!senderId || !message || !message.mid) {
      console.warn('⚠️ Mensagem inválida no webhook:', event);
      return;
    }

    const recipientId = event.recipient?.id;
    const isBusinessSender =
      Boolean(instance.instagramAccountId) && senderId === instance.instagramAccountId;
    const isEcho = message.is_echo === true;

    /** Perfil do interlocutor no CRM: inbound = remetente; eco (enviado pelo app) = destinatário (cliente). */
    let peerProfile: { name?: string; username?: string; profile_pic?: string } | null = null;
    const igTokenEarly = (instance as { accessToken?: string }).accessToken;
    if (!isBusinessSender && igTokenEarly) {
      peerProfile = await getInstagramMessagingUserProfile(igTokenEarly, senderId);
    } else if (isBusinessSender && isEcho && recipientId && igTokenEarly) {
      peerProfile = await getInstagramMessagingUserProfile(igTokenEarly, recipientId);
    }

    const igCrm = buildInstagramCrmPayloadFromMessage(message, {
      senderUsername: peerProfile?.username ?? null,
    });
    const messageTextForAutomation = (message.text || '').trim();
    const storedSummaryText = igCrm.content;
    const messageId = message.mid;
    const timestamp = event.timestamp ?? Math.floor(Date.now() / 1000);
    const instanceId = instance._id.toString();
    const userId = instance.userId.toString();
    const reportUsername = peerProfile?.username?.trim() || senderId;

    // Salvar mensagem no banco
    await pgPool.query(
      `INSERT INTO instagram_messages (
        instance_id, user_id, sender_id, recipient_id,
        message_id, text, timestamp, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (message_id, instance_id) DO NOTHING`,
      [
        instanceId,
        userId,
        senderId,
        event.recipient?.id || instance.instagramAccountId || '',
        messageId,
        storedSummaryText,
        timestamp,
        JSON.stringify(event),
      ]
    );

    let crmSync: Awaited<ReturnType<typeof syncInstagramInboundDmToCrm>> = null;
    if (!isBusinessSender) {
      const displayName = formatIgContactDisplayName(peerProfile);
      crmSync = await syncInstagramInboundDmToCrm({
        userId,
        instanceId,
        senderId,
        messageId,
        text: igCrm.content,
        messageType: igCrm.messageType,
        mediaUrl: igCrm.mediaUrl,
        timestamp,
        contactDisplayName: displayName,
        profilePictureUrl: peerProfile?.profile_pic ?? null,
      });
    } else if (isEcho && recipientId) {
      /** Eco: sender = página IG, recipient = cliente — espelhar no chat do contacto como outbound. */
      const displayName = formatIgContactDisplayName(peerProfile);
      crmSync = await syncInstagramInboundDmToCrm({
        userId,
        instanceId,
        senderId: recipientId,
        messageId,
        text: igCrm.content,
        messageType: igCrm.messageType,
        mediaUrl: igCrm.mediaUrl,
        timestamp,
        contactDisplayName: displayName,
        profilePictureUrl: peerProfile?.profile_pic ?? null,
        fromMe: true,
      });
    }

    if (isBusinessSender) {
      if (isEcho && recipientId) {
        console.log(
          `📤 Eco DM (enviado pela conta) espelhado no CRM para o contacto ${recipientId} (mid: ${messageId})`
        );
        emitInstagramUpdate(userId, {
          type: 'message',
          instanceId,
          messageId,
          contactId: crmSync?.contactId,
          crmMessageUuid: crmSync?.crmMessageUuid,
        });
      } else {
        console.log(`⚠️ Ignorando mensagem enviada pela própria conta (senderId: ${senderId})`);
      }
      return;
    }

    const { canUserRunAutomations } = await import('./onlyflowPlanCheck');
    if (!(await canUserRunAutomations(String(instance.userId)))) {
      return;
    }

    const hasMedia = Boolean(
      (message.attachments && message.attachments.length > 0) ||
        message.reply_to?.story ||
        igCrm.mediaUrl
    );

    const workflowExecutedCount = await triggerInstagramWorkflows({
      instanceId,
      userId,
      senderId,
      messageText: storedSummaryText,
      hasMedia,
      contactUsername: peerProfile?.username ?? undefined,
      contactName: formatIgContactDisplayName(peerProfile) ?? undefined,
    });

    if (workflowExecutedCount > 0) {
      console.log(
        `✅ ${workflowExecutedCount} workflow(s) ManyFlow executado(s) para DM ${messageId} — automação simples ignorada`
      );
      emitInstagramUpdate(userId, {
        type: 'message',
        instanceId,
        messageId,
        contactId: crmSync?.contactId,
        crmMessageUuid: crmSync?.crmMessageUuid,
      });
      return;
    }

    // Buscar automações ativas para DM (só texto legenda; mídia pura não dispara por palavra-chave)
    const automation = await AutomationService.findMatchingAutomation(
      instanceId,
      'dm',
      messageTextForAutomation
    );

    if (automation) {
      if (automation.preventDuplicate && (await wasAlreadyProcessed(automation.id, senderId, 'dm'))) {
        return;
      }
      if (!instance.instagramAccountId) {
        console.error('[Webhook] Instância sem instagramAccountId');
        return;
      }
      const instanceWithToken = await getInstanceWithToken(instance.instagramAccountId);
      if (!instanceWithToken) {
        console.error('[Webhook] Instância não encontrada ou sem token');
        return;
      }

      // Executar automação
      try {
        let allResponses: string[] = [];

        const dmVariants = resolveDmVariants(automation);
        if (dmVariants.length > 0) {
          const picked = applyUserContactVariable(pickRandomVariant(dmVariants), null);
          await sendDirectMessage(instanceWithToken.accessToken, senderId, picked);
          allResponses.push(`DM: ${picked}`);
        } else if (automation.responseType === 'direct' && automation.responseSequence) {
          // Processar sequência de mensagens para DM
          for (let i = 0; i < automation.responseSequence.length; i++) {
            const item = automation.responseSequence[i];
            
            // Aplicar delay antes de enviar esta mensagem
            if (item.delay > 0) {
              console.log(`⏳ Aplicando delay de ${item.delay} segundos antes da mensagem ${i + 1}...`);
              await new Promise((resolve) => setTimeout(resolve, item.delay * 1000));
            }

            // Enviar mensagem baseada no tipo
            const pageId = instance.instagramAccountId || instanceWithToken.instagramAccountId;
            if (!pageId) {
              throw new Error('Instagram Account ID não encontrado');
            }

            switch (item.type) {
              case 'text':
                await sendDirectMessage(
                  instanceWithToken.accessToken,
                  senderId,
                  item.content
                );
                allResponses.push(`Texto: ${item.content}`);
                break;
              case 'image':
                await sendDirectMessageImage(
                  instanceWithToken.accessToken,
                  pageId,
                  senderId,
                  item.content
                );
                allResponses.push(`Imagem: ${item.content}`);
                break;
              case 'video':
                await sendDirectMessageVideo(
                  instanceWithToken.accessToken,
                  pageId,
                  senderId,
                  item.content
                );
                allResponses.push(`Vídeo: ${item.content}`);
                break;
              case 'audio':
                await sendDirectMessageAudio(
                  instanceWithToken.accessToken,
                  pageId,
                  senderId,
                  item.content
                );
                allResponses.push(`Áudio: ${item.content}`);
                break;
            }
          }
        } else if (automation.responseType === 'direct' && automation.responseText && automation.responseText.trim().length > 0) {
          // Fallback para automações antigas (apenas texto)
          await sendDirectMessage(
            instanceWithToken.accessToken,
            senderId,
            automation.responseText.trim()
          );
          allResponses.push(automation.responseText);
        } else {
          console.error(`❌ Automação ${automation.id} não tem sequência de mensagens nem texto configurado`);
          throw new Error('Automação de DM não tem sequência de mensagens nem texto configurado');
        }

        // Criar relatório
        await ReportService.create({
          instanceId,
          userId,
          interactionType: 'dm',
          userIdInstagram: senderId,
          username: reportUsername,
          interactionText: storedSummaryText,
          responseText: allResponses.join(' | '),
          responseStatus: 'sent',
          automationId: automation.id,
          timestamp,
        });

        // Marcar mensagem como respondida
        await pgPool.query(
          `UPDATE instagram_messages SET replied = TRUE WHERE message_id = $1 AND instance_id = $2`,
          [messageId, instanceId]
        );

        console.log(`✅ Automação executada para mensagem ${messageId}`);
      } catch (error) {
        console.error(`❌ Erro ao executar automação:`, error);

        // Criar relatório com status failed
        const failedResponseText = automation.responseSequence
          ? automation.responseSequence.map((item) => `${item.type}: ${item.content}`).join(' | ')
          : automation.responseText || 'Erro ao processar';
        
        await ReportService.create({
          instanceId,
          userId,
          interactionType: 'dm',
          userIdInstagram: senderId,
          username: reportUsername,
          interactionText: storedSummaryText,
          responseText: failedResponseText,
          responseStatus: 'failed',
          automationId: automation.id,
          timestamp,
        });
      }
    }

    // Emitir atualização via Socket.io (backend re-emite new-message / contact-updated ao CRM)
    emitInstagramUpdate(userId, {
      type: 'message',
      instanceId,
      messageId,
      contactId: crmSync?.contactId,
      crmMessageUuid: crmSync?.crmMessageUuid,
    });
  } catch (error) {
    console.error('❌ Erro ao processar mensagem direta:', error);
  }
};

/**
 * Processar comentário recebido
 */
export const processComment = async (
  instance: IInstagramInstance,
  change: { field?: string; value?: CommentChangeValue }
): Promise<void> => {
  try {
    const value = change.value;

    if (!value || !value.id || !value.text) {
      console.warn('⚠️ Comentário inválido no webhook:', change);
      return;
    }

    const commentId = value.id;
    const postId = value.media?.id || '';
    const fromUserId = value.from?.id || '';
    const fromUsername = value.from?.username || '';
    const text = value.text;
    const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp
    const instanceId = instance._id.toString();
    const userId = instance.userId.toString();

    // Salvar comentário no banco
    await pgPool.query(
      `INSERT INTO instagram_comments (
        instance_id, user_id, comment_id, post_id, media_id,
        from_user_id, from_username, text, timestamp, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (comment_id) DO NOTHING`,
      [
        instanceId,
        userId,
        commentId,
        postId,
        value.media?.id || null,
        fromUserId,
        fromUsername,
        text,
        timestamp,
        JSON.stringify(change),
      ]
    );

    // Verificar se não é comentário da própria conta
    if (fromUserId === instance.instagramAccountId) {
      console.log(`⚠️ Ignorando comentário da própria conta (fromUserId: ${fromUserId})`);
      return;
    }

    const { canUserRunAutomations: canRunComment } = await import('./onlyflowPlanCheck');
    if (!(await canRunComment(userId))) {
      return;
    }

    // Buscar automações ativas para comentários
    const automation = await AutomationService.findMatchingAutomation(
      instanceId,
      'comment',
      text,
      postId
    );

    if (automation) {
      if (
        automation.preventDuplicate &&
        (await wasAlreadyProcessed(automation.id, fromUserId, 'comment'))
      ) {
        return;
      }
      if (!instance.instagramAccountId) {
        console.error('[Webhook] Instância sem instagramAccountId');
        return;
      }
      const instanceWithToken = await getInstanceWithToken(instance.instagramAccountId);
      if (!instanceWithToken) {
        console.error('[Webhook] Instância não encontrada ou sem token');
        return;
      }

      // Executar automação com delay se configurado
      try {
        // Aplicar delay global antes de enviar a resposta
        if (automation.delaySeconds > 0) {
          console.log(`⏳ Aplicando delay de ${automation.delaySeconds} segundos antes de enviar resposta...`);
          await new Promise((resolve) => setTimeout(resolve, automation.delaySeconds * 1000));
        }

        let allResponses: string[] = [];

        if (automation.responseType === 'comment') {
          const commentVariants = resolveCommentVariants(automation);
          let responseText = applyUserContactVariable(
            pickRandomVariant(commentVariants),
            fromUsername
          );

          if (!responseText || responseText.trim().length === 0) {
            console.error(`❌ Automação ${automation.id} não tem texto de resposta configurado`);
            throw new Error('Texto da resposta está vazio. Configure o texto da resposta na automação.');
          }

          await replyToComment(
            instanceWithToken.accessToken,
            commentId,
            responseText
          );
          allResponses.push(`Comentário: ${responseText}`);
        } else if (automation.responseType === 'direct') {
          const pageId = instance.instagramAccountId || instanceWithToken.instagramAccountId;
          if (!pageId) {
            throw new Error('Instagram Account ID não encontrado');
          }

          const dmVariants = resolveDmVariants(automation);
          let responseText = applyUserContactVariable(
            pickRandomVariant(dmVariants),
            fromUsername
          );

          if (!responseText || responseText.trim().length === 0) {
            console.error(`❌ Automação ${automation.id} não tem texto de resposta configurado`);
            throw new Error('Texto da resposta está vazio. Configure o texto da resposta na automação.');
          }

          // Usar a nova função que envia DM via comment_id
          await sendDirectMessageByCommentId(
            instanceWithToken.accessToken,
            pageId,
            commentId,
            responseText
          );
          allResponses.push(`DM: ${responseText}`);
        } else if (automation.responseType === 'comment_and_dm') {
          // Primeiro responder o comentário, depois enviar DM
          const pageId = instance.instagramAccountId || instanceWithToken.instagramAccountId;
          if (!pageId) {
            throw new Error('Instagram Account ID não encontrado');
          }

          const commentVariants = resolveCommentVariants(automation);
          let commentResponseText = applyUserContactVariable(
            pickRandomVariant(commentVariants),
            fromUsername
          );

          if (!commentResponseText || commentResponseText.trim().length === 0) {
            console.error(`❌ Automação ${automation.id} não tem texto de resposta do comentário configurado`);
            throw new Error('Texto da resposta do comentário está vazio.');
          }

          await replyToComment(
            instanceWithToken.accessToken,
            commentId,
            commentResponseText
          );
          allResponses.push(`Comentário: ${commentResponseText}`);

          const dmVariants = resolveDmVariants(automation);
          let dmResponseText = applyUserContactVariable(
            pickRandomVariant(dmVariants),
            fromUsername
          );

          if (!dmResponseText || dmResponseText.trim().length === 0) {
            console.error(`❌ Automação ${automation.id} não tem texto de resposta da DM configurado`);
            throw new Error('Texto da resposta da DM está vazio.');
          }

          await sendDirectMessageByCommentId(
            instanceWithToken.accessToken,
            pageId,
            commentId,
            dmResponseText
          );
          allResponses.push(`DM: ${dmResponseText}`);
        }

        // Criar relatório
        await ReportService.create({
          instanceId,
          userId,
          interactionType: 'comment',
          commentId,
          userIdInstagram: fromUserId,
          mediaId: postId,
          username: fromUsername, // Para comentários, usar username real
          interactionText: text,
          responseText: allResponses.join(' | '),
          responseStatus: 'sent',
          automationId: automation.id,
          timestamp,
        });

        // Marcar comentário como respondido
        await pgPool.query(
          `UPDATE instagram_comments 
           SET replied = TRUE, reply_text = $1 
           WHERE comment_id = $2`,
          [automation.responseText, commentId]
        );

        console.log(`✅ Automação executada para comentário ${commentId}`);
      } catch (error) {
        console.error(`❌ Erro ao executar automação:`, error);

        // Criar relatório com status failed
        const failedResponseText = automation.responseText || 'Erro ao processar';
        await ReportService.create({
          instanceId,
          userId,
          interactionType: 'comment',
          commentId,
          userIdInstagram: fromUserId,
          mediaId: postId,
          username: fromUsername, // Para comentários, usar username real
          interactionText: text,
          responseText: failedResponseText,
          responseStatus: 'failed',
          automationId: automation.id,
          timestamp,
        });
      }
    }

    // Emitir atualização via Socket.io
    emitInstagramUpdate(userId, {
      type: 'comment',
      instanceId,
      commentId,
    });
  } catch (error) {
    console.error('❌ Erro ao processar comentário:', error);
  }
};

/** Payload do webhook Meta (Instagram). */
interface InstagramWebhookBody {
  object?: string;
  entry?: Array<{
    id: string;
    messaging?: DirectMessageEvent[];
    changes?: Array<{ field?: string; value?: CommentChangeValue }>;
  }>;
}

/**
 * Processar webhook completo. A instância é identificada por entry.id (ID da conta Instagram).
 */
export const processWebhook = async (body: InstagramWebhookBody): Promise<void> => {
  try {
    if (body.object !== 'instagram') {
      return;
    }

    for (const entry of body.entry || []) {
      const recipientId = entry.id; // ID da conta Instagram que recebeu o evento

      if (!recipientId) {
        console.warn('⚠️ Entry sem ID:', entry);
        continue;
      }

      console.log(`🔍 Buscando instância para recipient ID: ${recipientId}`);

      // Buscar instância pelo instagramAccountId ou webhookIds
      let instance = await InstanceService.getByInstagramAccountId(recipientId);

      if (!instance && entry.messaging?.length) {
        const firstMessage = entry.messaging[0];
        const messageRecipientId = firstMessage?.recipient?.id;
        
        if (messageRecipientId && messageRecipientId !== recipientId) {
          console.log(`🔍 Tentando buscar pelo recipient.id do evento: ${messageRecipientId}`);
          instance = await InstanceService.getByInstagramAccountId(messageRecipientId);
        }
      }

      if (!instance) {
        console.error(`❌ Instância não encontrada para Instagram Account ID: ${recipientId}`);
        console.error(`📋 Entry completo:`, JSON.stringify(entry, null, 2));
        // Log adicional para debug - listar todas as instâncias conectadas
        console.error(`💡 Dica: Verifique se o instagramAccountId salvo corresponde ao ID do webhook`);
        continue;
      }

      const instanceId = instance._id.toString();
      const userId = instance.userId.toString();

      console.log(`✅ Instância encontrada: ${instance.name} (${instance.instanceName})`);

      if (entry.messaging) {
        for (const ev of entry.messaging) {
          const echo = ev.message?.is_echo === true;
          /** Eco: sender = página, recipient = cliente — não substituir recipient por entry.id. */
          await processDirectMessage(instance, {
            ...ev,
            recipient: echo && ev.recipient?.id ? ev.recipient : { id: recipientId },
          });
        }
      }

      // Processar comentários
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'comments') {
            await processComment(instance, change);
          }
        }
      }

      // Histórico em instagram_messages que ainda não está em contacts/messages do CRM
      scheduleInstagramCrmBackfill(instance);
    }
  } catch (error) {
    console.error('❌ Erro ao processar webhook:', error);
    throw error;
  }
};
