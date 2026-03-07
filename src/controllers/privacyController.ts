/**
 * Controller para endpoints de privacidade do Instagram/Meta
 */

import { Request, Response, NextFunction } from 'express';
import { handleControllerError } from '../utils/errorHelpers';
import { handleDeauthorization, handleDataDeletion } from '../services/privacyService';

/**
 * POST /api/instagram/privacy/deauthorize
 * Endpoint público chamado pelo Meta quando um usuário desautoriza o app
 */
export const deauthorize = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Log para debug
    console.log('📥 [Deauthorize] Content-Type:', req.headers['content-type']);
    console.log('📥 [Deauthorize] Body recebido:', JSON.stringify(req.body, null, 2));
    console.log('📥 [Deauthorize] Body keys:', Object.keys(req.body || {}));

    // O Meta pode enviar signed_request com hífen ou underscore
    const signed_request = req.body.signed_request || req.body['signed-request'];

    if (!signed_request) {
      console.error('❌ [Deauthorize] signed_request não encontrado no body');
      res.status(400).json({
        status: 'error',
        message: 'signed_request é obrigatório',
      });
      return;
    }

    console.log('📨 Requisição de desautorização recebida do Meta');

    const result = await handleDeauthorization(signed_request);

    if (result.success) {
      // O Meta espera 200 OK mesmo se a instância não for encontrada
      res.status(200).json({
        status: 'success',
        message: result.message,
        instanceId: result.instanceId,
      });
    } else {
      // Mesmo com erro, retornar 200 para evitar retentativas do Meta
      // Mas logar o erro para investigação
      console.error('❌ Erro ao processar desautorização:', result.message);
      res.status(200).json({
        status: 'error',
        message: result.message,
      });
    }
  } catch (error: unknown) {
    console.error('❌ Erro inesperado ao processar desautorização:', error);
    // Sempre retornar 200 OK para o Meta
    res.status(200).json({
      status: 'error',
      message: 'Erro ao processar desautorização',
    });
  }
};

/**
 * POST /api/instagram/privacy/delete-data
 * Endpoint público chamado pelo Meta quando um usuário solicita exclusão de dados
 */
export const deleteData = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // O Meta pode enviar signed_request com hífen ou underscore
    const signed_request = req.body.signed_request || req.body['signed-request'];

    if (!signed_request) {
      res.status(400).json({
        status: 'error',
        message: 'signed_request é obrigatório',
      });
      return;
    }

    console.log('📨 Requisição de exclusão de dados recebida do Meta');

    const result = await handleDataDeletion(signed_request);

    if (result.success) {
      // O Meta espera 200 OK com confirmation_code
      res.status(200).json({
        status: 'success',
        message: result.message,
        deletion_request_id: result.deletionRequestId,
        confirmation_code: result.deletionRequestId || 'deletion_complete',
      });
    } else {
      // Mesmo com erro, retornar 200 para evitar retentativas do Meta
      console.error('❌ Erro ao processar exclusão de dados:', result.message);
      res.status(200).json({
        status: 'error',
        message: result.message,
        confirmation_code: result.deletionRequestId || 'error',
      });
    }
  } catch (error: unknown) {
    console.error('❌ Erro inesperado ao processar exclusão de dados:', error);
    // Sempre retornar 200 OK para o Meta
    res.status(200).json({
      status: 'error',
      message: 'Erro ao processar exclusão de dados',
      confirmation_code: 'error',
    });
  }
};
