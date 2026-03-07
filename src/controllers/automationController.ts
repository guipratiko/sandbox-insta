import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';
import { AutomationService, ResponseSequenceItem } from '../services/automationService';
import { pgPool } from '../config/databases';

interface CreateAutomationBody {
  instanceId: string;
  name: string;
  type: 'dm' | 'comment';
  triggerType: 'keyword' | 'all';
  keywords?: string[];
  responseText: string;
  responseType: 'direct' | 'comment' | 'comment_and_dm';
  responseTextDM?: string; // Texto da DM quando responseType = 'comment_and_dm'
  responseSequence?: ResponseSequenceItem[];
  delaySeconds?: number;
  preventDuplicate?: boolean;
  isActive?: boolean;
}

interface UpdateAutomationBody {
  name?: string;
  triggerType?: 'keyword' | 'all';
  keywords?: string[];
  responseText?: string;
  responseType?: 'direct' | 'comment' | 'comment_and_dm';
  responseTextDM?: string; // Texto da DM quando responseType = 'comment_and_dm'
  responseSequence?: ResponseSequenceItem[];
  delaySeconds?: number;
  preventDuplicate?: boolean;
  isActive?: boolean;
}

/**
 * Validar URL de mídia
 */
function validateMediaUrl(url: string, type: 'image' | 'video' | 'audio'): boolean {
  if (!url.startsWith('https://')) {
    return false;
  }

  const urlLower = url.toLowerCase();
  const validExtensions: Record<string, string[]> = {
    image: ['jpg', 'jpeg', 'png'],
    video: ['mp4', 'ogg', 'avi', 'mov', 'webm'],
    audio: ['aac', 'm4a', 'wav', 'mp4', 'mp3'],
  };

  const extensions = validExtensions[type] || [];
  return extensions.some((ext) => urlLower.endsWith(`.${ext}`));
}

/**
 * Validar sequência de resposta
 */
function validateResponseSequence(sequence: ResponseSequenceItem[]): string | null {
  if (sequence.length === 0) {
    return 'Sequência não pode estar vazia';
  }

  if (sequence.length > 4) {
    return 'Sequência pode ter no máximo 4 mensagens';
  }

  for (let i = 0; i < sequence.length; i++) {
    const item = sequence[i];
    
    if (!['text', 'image', 'video', 'audio'].includes(item.type)) {
      return `Tipo inválido na mensagem ${i + 1}: ${item.type}`;
    }

    if (!item.content || item.content.trim().length === 0) {
      return `Conteúdo não pode estar vazio na mensagem ${i + 1}`;
    }

    if (item.delay < 0 || !Number.isInteger(item.delay)) {
      return `Delay deve ser um número inteiro não negativo na mensagem ${i + 1}`;
    }

    // Validar URL para tipos de mídia
    if (item.type !== 'text') {
      if (!validateMediaUrl(item.content, item.type)) {
        return `URL inválida na mensagem ${i + 1}. Deve ser HTTPS e ter extensão válida para ${item.type}`;
      }
    }
  }

  return null;
}

/**
 * Criar nova automação
 */
export const createAutomation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const {
      instanceId,
      name,
      type,
      triggerType,
      keywords,
      responseText,
      responseType,
      responseTextDM,
      responseSequence,
      delaySeconds,
      preventDuplicate,
      isActive,
    }: CreateAutomationBody = req.body;

    // Validações básicas
    if (!instanceId || !name || !type || !triggerType || !responseType) {
      return next(createValidationError('Todos os campos obrigatórios devem ser preenchidos'));
    }

    // Debug: log dos dados recebidos
    console.log('📋 Dados recebidos na criação de automação:', {
      type,
      responseType,
      hasResponseSequence: !!responseSequence,
      responseSequenceLength: responseSequence?.length || 0,
      hasResponseText: !!responseText,
      responseTextLength: responseText?.length || 0,
    });

    // Validações específicas por tipo de interação e tipo de resposta
    if (type === 'comment') {
      // Automação para comentários
      if (responseType === 'comment') {
        // Responder no comentário: precisa de texto (não pode usar sequência)
        if (!responseText || responseText.trim().length === 0) {
          return next(createValidationError('Texto da resposta é obrigatório para comentários'));
        }
        if (responseSequence && responseSequence.length > 0) {
          return next(createValidationError('Comentários não suportam sequência de mensagens. Use apenas texto.'));
        }
      } else if (responseType === 'direct') {
        // Responder via DM quando recebe comentário: pode usar sequência OU texto
        // Verificar se responseSequence existe e tem itens
        const hasSequence = responseSequence && Array.isArray(responseSequence) && responseSequence.length > 0;
        
        if (hasSequence) {
          // Se tem sequência, validar a sequência
          const sequenceError = validateResponseSequence(responseSequence);
          if (sequenceError) {
            return next(createValidationError(sequenceError));
          }
          // Se tem sequência, não deve ter responseText
          if (responseText && responseText.trim().length > 0) {
            return next(createValidationError('Ao usar sequência de mensagens, não informe texto simples. Use apenas a sequência.'));
          }
        } else {
          // Se não tem sequência, precisa de texto
          if (!responseText || responseText.trim().length === 0) {
            return next(createValidationError('É necessário informar texto da resposta ou sequência de mensagens para enviar DM quando recebe comentário'));
          }
        }
      } else if (responseType === 'comment_and_dm') {
        // Responder comentário e depois enviar DM: precisa de ambos os textos
        if (!responseText || responseText.trim().length === 0) {
          return next(createValidationError('Texto da resposta do comentário é obrigatório quando o tipo de resposta é "Comentário e DM"'));
        }
        if (!responseTextDM || responseTextDM.trim().length === 0) {
          return next(createValidationError('Texto da DM é obrigatório quando o tipo de resposta é "Comentário e DM"'));
        }
        if (responseSequence && responseSequence.length > 0) {
          return next(createValidationError('Tipo de resposta "Comentário e DM" não suporta sequência de mensagens. Use apenas texto.'));
        }
      }
    } else if (type === 'dm') {
      // Automação para Direct Messages
      if (responseType === 'direct') {
        // DM: sequência obrigatória
        if (!responseSequence || responseSequence.length === 0) {
          return next(createValidationError('Sequência de mensagens é obrigatória para Direct Messages'));
        }
        const sequenceError = validateResponseSequence(responseSequence);
        if (sequenceError) {
          return next(createValidationError(sequenceError));
        }
        // DM não deve ter responseText quando tem sequência
        if (responseText && responseText.trim().length > 0) {
          return next(createValidationError('Direct Messages com sequência não devem ter responseText. Use a sequência de mensagens.'));
        }
      }
    }

    if (name.trim().length < 3) {
      return next(createValidationError('Nome deve ter no mínimo 3 caracteres'));
    }

    // Validação rigorosa para palavras-chave quando triggerType é 'keyword'
    if (triggerType === 'keyword') {
      if (!keywords || keywords.length === 0) {
        return next(createValidationError('É necessário informar pelo menos uma palavra-chave quando o tipo de trigger é "Palavra-chave"'));
    }

      // Verificar se todas as palavras-chave não estão vazias após trim
      const validKeywords = keywords.filter((keyword) => keyword && keyword.trim().length > 0);
      if (validKeywords.length === 0) {
        return next(createValidationError('As palavras-chave não podem estar vazias. Informe pelo menos uma palavra-chave válida'));
      }
      
      // Atualizar keywords para remover strings vazias
      keywords.splice(0, keywords.length, ...validKeywords.map((k) => k.trim()));
    }

    // Validação do delay
    if (delaySeconds !== undefined && (delaySeconds < 0 || !Number.isInteger(delaySeconds))) {
      return next(createValidationError('Delay deve ser um número inteiro não negativo (em segundos)'));
    }

    // Determinar responseText baseado no tipo de interação e tipo de resposta
    let finalResponseText = '';
    if (type === 'comment') {
      // Para comentários
      if (responseType === 'comment') {
        // Responder no comentário: sempre precisa de texto
        finalResponseText = (responseText || '').trim();
      } else if (responseType === 'direct') {
        // Responder via DM quando recebe comentário: texto OU sequência
        if (responseSequence && responseSequence.length > 0) {
          // Se tem sequência, não salva texto
          finalResponseText = '';
        } else {
          // Se não tem sequência, salva texto
          finalResponseText = (responseText || '').trim();
        }
      } else if (responseType === 'comment_and_dm') {
        // Responder comentário e depois enviar DM: precisa do texto do comentário
        finalResponseText = (responseText || '').trim();
      }
    } else if (type === 'dm') {
      // Para DM, responseText só é usado se não houver sequência (caso legado)
      finalResponseText = responseSequence && responseSequence.length > 0 ? '' : (responseText || '').trim();
    }

    const automation = await AutomationService.create({
      userId,
      instanceId,
      name: name.trim(),
      type,
      triggerType,
      keywords: triggerType === 'keyword' ? keywords : undefined,
      responseText: finalResponseText,
      responseType,
      responseTextDM: responseTextDM,
      responseSequence: (type === 'dm' && responseType === 'direct') || (type === 'comment' && responseType === 'direct' && responseSequence && responseSequence.length > 0) ? responseSequence : undefined,
      delaySeconds: delaySeconds !== undefined ? delaySeconds : 0,
      preventDuplicate: preventDuplicate !== undefined ? preventDuplicate : true,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      status: 'success',
      data: automation,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar automação'));
  }
};

/**
 * Listar automações do usuário
 */
export const getAutomations = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId } = req.query;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const automations = await AutomationService.getByUserId(
      userId,
      instanceId as string | undefined
    );

    res.status(200).json({
      status: 'success',
      data: automations,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar automações'));
  }
};

/**
 * Obter automação por ID
 */
export const getAutomationById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const automation = await AutomationService.getById(id, userId);

    if (!automation) {
      return next(createNotFoundError('Automação'));
    }

    res.status(200).json({
      status: 'success',
      data: automation,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar automação'));
  }
};

/**
 * Atualizar automação
 */
export const updateAutomation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const {
      name,
      triggerType,
      keywords,
      responseText,
      responseType,
      responseTextDM,
      responseSequence,
      delaySeconds,
      preventDuplicate,
      isActive,
    }: UpdateAutomationBody = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (name && name.trim().length < 3) {
      return next(createValidationError('Nome deve ter no mínimo 3 caracteres'));
    }

    // Buscar automação atual para verificar o triggerType atual
    const currentAutomation = await AutomationService.getById(id, userId);
    if (!currentAutomation) {
      return next(createNotFoundError('Automação'));
    }

    // Determinar responseType final e type (type não pode ser alterado)
    const finalResponseType = responseType || currentAutomation.responseType;
    const finalType = currentAutomation.type; // type não pode ser alterado

    // Validações específicas por tipo de interação e tipo de resposta
    if (finalType === 'comment') {
      // Automação para comentários
      if (finalResponseType === 'comment') {
        // Responder no comentário: precisa de texto (não pode usar sequência)
        if (responseText !== undefined && responseText.trim().length === 0) {
          return next(createValidationError('Texto da resposta não pode estar vazio para comentários'));
    }
        if (responseSequence !== undefined && responseSequence.length > 0) {
          return next(createValidationError('Comentários não suportam sequência de mensagens. Use apenas texto.'));
        }
      } else if (finalResponseType === 'comment_and_dm') {
        // Responder comentário e depois enviar DM: precisa de ambos os textos
        if (responseText !== undefined && responseText.trim().length === 0) {
          return next(createValidationError('Texto da resposta do comentário não pode estar vazio quando o tipo de resposta é "Comentário e DM"'));
        }
        if (responseTextDM !== undefined && responseTextDM.trim().length === 0) {
          return next(createValidationError('Texto da DM não pode estar vazio quando o tipo de resposta é "Comentário e DM"'));
        }
        if (responseSequence !== undefined && responseSequence.length > 0) {
          return next(createValidationError('Tipo de resposta "Comentário e DM" não suporta sequência de mensagens. Use apenas texto.'));
        }
      } else if (finalResponseType === 'direct') {
        // Responder via DM quando recebe comentário: pode usar sequência OU texto
        if (responseSequence !== undefined && responseSequence.length > 0) {
          // Se tem sequência, validar a sequência
          const sequenceError = validateResponseSequence(responseSequence);
          if (sequenceError) {
            return next(createValidationError(sequenceError));
          }
          // Se tem sequência, não deve ter responseText
          if (responseText !== undefined && responseText.trim().length > 0) {
            return next(createValidationError('Ao usar sequência de mensagens, não informe texto simples. Use apenas a sequência.'));
          }
        } else {
          // Se não tem sequência, precisa de texto
          if (responseText !== undefined && responseText.trim().length === 0) {
            return next(createValidationError('É necessário informar texto da resposta ou sequência de mensagens para enviar DM quando recebe comentário'));
          }
        }
      }
    } else if (finalType === 'dm') {
      // Automação para Direct Messages
      if (finalResponseType === 'direct') {
        // DM: sequência obrigatória se estiver atualizando
        if (responseSequence !== undefined) {
          if (responseSequence.length === 0) {
            return next(createValidationError('Sequência de mensagens não pode estar vazia para Direct Messages'));
          }
          const sequenceError = validateResponseSequence(responseSequence);
          if (sequenceError) {
            return next(createValidationError(sequenceError));
          }
        } else if (responseType === 'direct' && currentAutomation.responseType === 'comment') {
          // Mudando de comment para direct - sequência obrigatória
          return next(createValidationError('Ao mudar para Direct Messages, é necessário fornecer uma sequência de mensagens'));
        }
        // DM não deve ter responseText quando tem sequência
        if (responseText !== undefined && responseText.trim().length > 0 && 
            (responseSequence !== undefined || currentAutomation.responseSequence)) {
          return next(createValidationError('Direct Messages com sequência não devem ter responseText. Use a sequência de mensagens.'));
        }
      }
    }

    // Validação rigorosa para palavras-chave quando triggerType é 'keyword'
    const finalTriggerType = triggerType || currentAutomation.triggerType;
    if (finalTriggerType === 'keyword') {
      // Se está mudando para 'keyword' ou já é 'keyword' e está atualizando keywords
      if (triggerType === 'keyword' || (triggerType === undefined && currentAutomation.triggerType === 'keyword')) {
        // Se keywords foi fornecido, validar
        if (keywords !== undefined) {
          if (keywords.length === 0) {
            return next(createValidationError('É necessário informar pelo menos uma palavra-chave quando o tipo de trigger é "Palavra-chave"'));
          }
          
          // Verificar se todas as palavras-chave não estão vazias após trim
          const validKeywords = keywords.filter((keyword) => keyword && keyword.trim().length > 0);
          if (validKeywords.length === 0) {
            return next(createValidationError('As palavras-chave não podem estar vazias. Informe pelo menos uma palavra-chave válida'));
          }
          
          // Atualizar keywords para remover strings vazias
          keywords.splice(0, keywords.length, ...validKeywords.map((k) => k.trim()));
        } else if (triggerType === 'keyword' && currentAutomation.triggerType !== 'keyword') {
          // Se está mudando de 'all' para 'keyword' mas não forneceu keywords
          return next(createValidationError('É necessário informar pelo menos uma palavra-chave ao mudar o tipo de trigger para "Palavra-chave"'));
        }
      }
    }

    // Validação do delay
    if (delaySeconds !== undefined && (delaySeconds < 0 || !Number.isInteger(delaySeconds))) {
      return next(createValidationError('Delay deve ser um número inteiro não negativo (em segundos)'));
    }

    const updateData: UpdateAutomationBody = {};
    if (name) updateData.name = name.trim();
    if (triggerType) updateData.triggerType = triggerType;
    if (keywords !== undefined) updateData.keywords = keywords;
    if (responseType) updateData.responseType = responseType;
    
    // Atualizar responseText baseado no tipo de interação e tipo de resposta
    if (responseText !== undefined) {
      if (finalType === 'comment') {
        // Para comentários
        if (finalResponseType === 'comment') {
          // Responder no comentário: sempre precisa de texto
          updateData.responseText = responseText.trim();
        } else if (finalResponseType === 'direct') {
          // Responder via DM quando recebe comentário: texto OU sequência
          if (responseSequence !== undefined && responseSequence.length > 0) {
            // Se tem sequência, não salva texto
            updateData.responseText = '';
          } else {
            // Se não tem sequência, salva texto
            updateData.responseText = responseText.trim();
          }
        } else if (finalResponseType === 'comment_and_dm') {
          // Responder comentário e DM: precisa do texto do comentário
          updateData.responseText = responseText.trim();
        } else if (finalResponseType === 'comment_and_dm') {
          // Responder comentário e DM: precisa de texto do comentário
          updateData.responseText = responseText.trim();
        }
      } else if (finalType === 'dm') {
        // Para DM, responseText só é usado se não houver sequência (caso legado)
        if (responseSequence !== undefined || currentAutomation.responseSequence) {
          updateData.responseText = ''; // Limpar se tem sequência
        } else {
          updateData.responseText = responseText.trim();
        }
      }
    }
    
    // Atualizar responseTextDM quando responseType = 'comment_and_dm'
    if (responseTextDM !== undefined && finalResponseType === 'comment_and_dm') {
      updateData.responseTextDM = responseTextDM.trim();
    }
    
    // Atualizar responseSequence
    if (responseSequence !== undefined) {
      if ((finalType === 'dm' && finalResponseType === 'direct') || 
          (finalType === 'comment' && finalResponseType === 'direct' && responseSequence.length > 0)) {
        updateData.responseSequence = responseSequence;
      } else {
        updateData.responseSequence = undefined; // Limpar se não é válido
      }
    }
    
    if (delaySeconds !== undefined) updateData.delaySeconds = delaySeconds;
    if (preventDuplicate !== undefined) updateData.preventDuplicate = preventDuplicate;
    if (isActive !== undefined) updateData.isActive = isActive;

    const automation = await AutomationService.update(id, userId, updateData);

    if (!automation) {
      return next(createNotFoundError('Automação'));
    }

    res.status(200).json({
      status: 'success',
      data: automation,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar automação'));
  }
};

/**
 * Deletar automação
 */
export const deleteAutomation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const deleted = await AutomationService.delete(id, userId);

    if (!deleted) {
      return next(createNotFoundError('Automação'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Automação deletada com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar automação'));
  }
};

/**
 * Ativar/Desativar automação
 */
export const toggleAutomation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const automation = await AutomationService.getById(id, userId);

    if (!automation) {
      return next(createNotFoundError('Automação'));
    }

    const updated = await AutomationService.update(id, userId, {
      isActive: !automation.isActive,
    });

    if (!updated) {
      return next(createNotFoundError('Automação'));
    }

    res.status(200).json({
      status: 'success',
      data: updated,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao alternar automação'));
  }
};

/**
 * Limpar contatos processados de uma automação específica
 */
export const clearAutomationContacts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Verificar se a automação existe e pertence ao usuário
    const automation = await AutomationService.getById(id, userId);
    if (!automation) {
      return next(createNotFoundError('Automação'));
    }

    // Deletar relatórios desta automação específica
    const result = await pgPool.query(
      `DELETE FROM instagram_reports 
       WHERE automation_id = $1 AND user_id = $2`,
      [id, userId]
    );

    res.status(200).json({
      status: 'success',
      message: 'Contatos da automação limpos com sucesso',
      deletedCount: result.rowCount || 0,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao limpar contatos da automação'));
  }
};

/**
 * Limpar contatos processados de todas as automações de uma instância
 */
export const clearAllAutomationContacts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { instanceId } = req.query;
    console.log('[clearAllAutomationContacts] userId:', userId, 'instanceId:', instanceId);

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!instanceId || typeof instanceId !== 'string') {
      return next(createValidationError('instanceId é obrigatório'));
    }

    // Verificar se a instância pertence ao usuário (através das automações)
    const automations = await AutomationService.getByUserId(userId, instanceId);
    if (automations.length === 0) {
      return next(createValidationError('Nenhuma automação encontrada para esta instância'));
    }

    // Deletar relatórios de todas as automações desta instância
    const automationIds = automations.map((a) => a.id);
    const result = await pgPool.query(
      `DELETE FROM instagram_reports 
       WHERE automation_id = ANY($1) AND user_id = $2`,
      [automationIds, userId]
    );

    res.status(200).json({
      status: 'success',
      message: 'Contatos de todas as automações limpos com sucesso',
      deletedCount: result.rowCount || 0,
    });
  } catch (error: unknown) {
    console.error('[clearAllAutomationContacts] Erro:', error);
    return next(handleControllerError(error, 'Erro ao limpar contatos de todas as automações'));
  }
};
