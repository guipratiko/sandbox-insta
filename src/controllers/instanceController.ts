import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';
import { InstanceService, UpdateInstanceData } from '../services/instanceService';
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getInstagramAccountInfo,
} from '../services/metaAPIService';
import { META_CONFIG } from '../config/constants';
import { emitInstagramUpdate } from '../socket/socketClient';

interface CreateInstanceBody {
  // name removido - será preenchido com username após OAuth
}

interface UpdateInstanceBody {
  name?: string;
  status?: 'created' | 'connecting' | 'connected' | 'disconnected' | 'error';
}

/**
 * Criar nova instância Instagram
 */
export const createInstance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    // Criar instância sem nome - será preenchido com username após OAuth
    const instance = await InstanceService.create({
      userId,
    });

    res.status(201).json({
      status: 'success',
      data: {
        id: instance._id,
        instanceName: instance.instanceName,
        name: instance.name,
        status: instance.status,
        createdAt: instance.createdAt,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar instância'));
  }
};

/**
 * Listar instâncias do usuário
 */
export const getInstances = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const instances = await InstanceService.getByUserId(userId);

    res.status(200).json({
      status: 'success',
      data: instances.map((instance) => ({
        id: instance._id,
        instanceName: instance.instanceName,
        name: instance.name,
        username: instance.username,
        profilePictureUrl: instance.profilePictureUrl,
        status: instance.status,
        tokenExpiresAt: instance.tokenExpiresAt,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar instâncias'));
  }
};

/**
 * Obter instância por ID
 */
export const getInstanceById = async (
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

    const instance = await InstanceService.getById(id, userId);

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    res.status(200).json({
      status: 'success',
      data: {
        id: instance._id,
        instanceName: instance.instanceName,
        name: instance.name,
        username: instance.username,
        profilePictureUrl: instance.profilePictureUrl,
        pageName: instance.pageName,
        status: instance.status,
        tokenExpiresAt: instance.tokenExpiresAt,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar instância'));
  }
};

/**
 * Atualizar instância
 */
export const updateInstance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, status }: UpdateInstanceBody = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (name && name.trim().length < 3) {
      return next(createValidationError('Nome deve ter no mínimo 3 caracteres'));
    }

    const updateData: UpdateInstanceData = {};
    if (name) updateData.name = name.trim();
    if (status) {
      const validStatuses: Array<'created' | 'connecting' | 'connected' | 'disconnected' | 'error'> = [
        'created',
        'connecting',
        'connected',
        'disconnected',
        'error',
      ];
      if (validStatuses.includes(status as any)) {
        updateData.status = status as 'created' | 'connecting' | 'connected' | 'disconnected' | 'error';
      }
    }

    const instance = await InstanceService.update(id, userId, updateData);

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    res.status(200).json({
      status: 'success',
      data: {
        id: instance._id,
        instanceName: instance.instanceName,
        name: instance.name,
        status: instance.status,
        updatedAt: instance.updatedAt,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar instância'));
  }
};

/**
 * Deletar instância
 */
export const deleteInstance = async (
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

    const deleted = await InstanceService.delete(id, userId);

    if (!deleted) {
      return next(createNotFoundError('Instância'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Instância deletada com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar instância'));
  }
};

/**
 * Iniciar fluxo OAuth
 */
export const initiateOAuth = async (
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

    const instance = await InstanceService.getById(id, userId);

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Atualizar status para connecting
    await InstanceService.update(id, userId, { status: 'connecting' });

    // Construir URL de autorização
    const scopes = [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
    ];

    const authUrl = `https://www.instagram.com/oauth/authorize?` +
      `client_id=${META_CONFIG.APP_ID}` +
      `&redirect_uri=${encodeURIComponent(META_CONFIG.REDIRECT_URI)}` +
      `&scope=${scopes.join(',')}` +
      `&response_type=code` +
      `&state=${id}`; // Passar ID da instância no state

    res.status(200).json({
      status: 'success',
      data: {
        authUrl,
        instanceId: id,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao iniciar OAuth'));
  }
};

/**
 * Callback OAuth (rota pública - Instagram chama diretamente)
 */
export const handleOAuthCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    console.log('\n🔵 ============================================');
    console.log('🔵 CALLBACK OAUTH INICIADO');
    console.log('🔵 ============================================\n');

    // 1. Log dos query params recebidos
    console.log('📥 1. QUERY PARAMS RECEBIDOS:');
    console.log(JSON.stringify(req.query, null, 2));
    console.log('');

    const { code, state: instanceId, error } = req.query;

    if (error) {
      console.error('❌ Erro no OAuth:', error);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/gerenciador-conexoes?error=oauth_failed&tab=instagram`);
    }

    if (!code || !instanceId) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/gerenciador-conexoes?error=no_code&tab=instagram`);
    }

    // 2. Trocar código por token de curta duração
    console.log('🔄 2. TROCANDO CÓDIGO POR TOKEN DE CURTA DURAÇÃO...');
    const tokenData = await exchangeCodeForToken(code as string);
    console.log('📋 RESPOSTA COMPLETA DO exchangeCodeForToken:');
    console.log(JSON.stringify(tokenData, null, 2));
    console.log('');

    // 3. Trocar por long-lived token
    console.log('🔄 3. TROCANDO POR LONG-LIVED TOKEN...');
    const longLivedTokenData = await exchangeForLongLivedToken(tokenData.access_token);
    console.log('📋 RESPOSTA COMPLETA DO exchangeForLongLivedToken:');
    console.log(JSON.stringify(longLivedTokenData, null, 2));
    console.log('');

    // 4. Obter informações da conta
    console.log('🔄 4. OBTENDO INFORMAÇÕES DA CONTA INSTAGRAM...');
    const accountInfo = await getInstagramAccountInfo(longLivedTokenData.access_token);
    console.log('📋 RESPOSTA COMPLETA DO getInstagramAccountInfo:');
    console.log(JSON.stringify(accountInfo, null, 2));
    console.log('');

    // 5. Preparar dados para salvar
    console.log('🔄 5. PREPARANDO DADOS PARA SALVAR...');
    
    // O user_id do token exchange pode ser diferente do user_id do /me
    // O user_id do accountInfo é o ID real usado nos webhooks (entry.id)
    // Vamos usar o user_id do accountInfo como principal
    const webhookIds = [accountInfo.user_id, tokenData.user_id].filter((id, index, self) => 
      id && self.indexOf(id) === index // Remover duplicatas
    );

    // Calcular data de expiração (60 dias)
    const expiresIn = longLivedTokenData.expires_in || 5184000; // 60 dias em segundos
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    const dataToSave = {
      instagramAccountId: accountInfo.user_id || tokenData.user_id, // user_id do accountInfo é o ID real usado nos webhooks
      username: accountInfo.username,
      profilePictureUrl: accountInfo.profile_picture_url,
      accessToken: longLivedTokenData.access_token.substring(0, 20) + '...', // Log apenas início do token por segurança
      pageId: accountInfo.user_id || tokenData.user_id, // user_id do accountInfo é o ID real
      pageName: accountInfo.name || accountInfo.username,
      tokenExpiresAt: tokenExpiresAt.toISOString(),
      webhookIds, // Incluir ambos os IDs
      name: accountInfo.username, // Usar username como nome da instância
    };

    console.log('📋 DADOS QUE SERÃO SALVOS NA INSTÂNCIA:');
    console.log(JSON.stringify(dataToSave, null, 2));
    console.log('');

    // 6. Buscar instância
    console.log(`🔄 6. BUSCANDO INSTÂNCIA COM ID: ${instanceId}`);
    const instance = await InstanceService.getByIdOnly(instanceId as string);
    if (!instance) {
      console.error(`❌ Instância não encontrada com ID: ${instanceId}`);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/gerenciador-conexoes?error=instance_not_found&tab=instagram`);
    }
    console.log(`✅ Instância encontrada: ${instance.instanceName} (userId: ${instance.userId})`);
    console.log('');

    // 7. Conectar instância
    console.log('🔄 7. SALVANDO DADOS NA INSTÂNCIA...');
    await InstanceService.connectInstance(
      instance._id.toString(),
      instance.userId.toString(),
      {
        instagramAccountId: accountInfo.user_id || tokenData.user_id, // user_id do accountInfo é o ID real usado nos webhooks
        username: accountInfo.username,
        profilePictureUrl: accountInfo.profile_picture_url,
        accessToken: longLivedTokenData.access_token,
        pageId: accountInfo.user_id || tokenData.user_id, // user_id do accountInfo é o ID real
        pageName: accountInfo.name || accountInfo.username,
        tokenExpiresAt,
        webhookIds,
        name: accountInfo.username,
      }
    );
    console.log('✅ Dados salvos com sucesso!');
    console.log('');

    // 8. Emitir atualização via Socket.io
    console.log('🔄 8. EMITINDO ATUALIZAÇÃO VIA SOCKET.IO...');
    emitInstagramUpdate(instance.userId.toString(), {
      instanceId: instance._id.toString(),
      status: 'connected',
    });
    console.log('✅ Atualização emitida!');
    console.log('');

    console.log('🔵 ============================================');
    console.log('🔵 CALLBACK OAUTH CONCLUÍDO COM SUCESSO');
    console.log('🔵 ============================================');
    console.log(`✅ Conta Instagram conectada: @${accountInfo.username}`);
    console.log(`   Instagram Account ID salvo: ${accountInfo.user_id || tokenData.user_id}`);
    console.log(`   Webhook IDs configurados: [${webhookIds.join(', ')}]`);
    console.log('');

    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/gerenciador-conexoes?connected=success&tab=instagram`);
  } catch (error: unknown) {
    console.error('❌ Erro no callback OAuth:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/gerenciador-conexoes?error=${encodeURIComponent(errorMessage)}&tab=instagram`);
  }
};

/**
 * Renovar token de acesso
 */
export const refreshToken = async (
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

    const instance = await InstanceService.getById(id, userId);

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    // Importar service de refresh
    const { refreshInstanceToken } = await import('../services/tokenRefreshService');
    const success = await refreshInstanceToken(id);

    if (!success) {
      return next(handleControllerError(new Error('Erro ao renovar token'), 'Erro ao renovar token'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Token renovado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao renovar token'));
  }
};
