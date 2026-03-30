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
  getLinkedFacebookPageForInstagram,
  subscribeInstagramSubscribedApps,
  subscribePageToApp,
} from '../services/metaAPIService';
import { META_CONFIG, FRONTEND_URL, INSTANCE_STATUSES } from '../config/constants';
import { emitInstagramInstanceUpdated, emitInstagramUpdate } from '../socket/socketClient';
import { formatInstance, formatInstanceList } from '../utils/instanceFormatters';

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
      data: formatInstance(instance),
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
      data: formatInstanceList(instances),
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
      data: formatInstance(instance),
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
    if (status && INSTANCE_STATUSES.includes(status as typeof INSTANCE_STATUSES[number])) {
      updateData.status = status as UpdateInstanceData['status'];
    }

    const instance = await InstanceService.update(id, userId, updateData);

    if (!instance) {
      return next(createNotFoundError('Instância'));
    }

    if (updateData.status) {
      try {
        emitInstagramInstanceUpdated(userId, id, updateData.status);
      } catch {
        /* socket opcional */
      }
    }

    res.status(200).json({
      status: 'success',
      data: formatInstance(instance),
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

    try {
      emitInstagramInstanceUpdated(userId, id, 'deleted');
    } catch {
      /* socket opcional */
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

    await InstanceService.update(id, userId, { status: 'connecting' });

    const authUrl =
      `https://www.instagram.com/oauth/authorize?` +
      `client_id=${META_CONFIG.APP_ID}` +
      `&redirect_uri=${encodeURIComponent(META_CONFIG.REDIRECT_URI)}` +
      `&scope=${META_CONFIG.OAUTH_SCOPES.join(',')}` +
      `&response_type=code` +
      `&state=${id}`;

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
    const { code, state: instanceId, error } = req.query;

    const redirectBase = `${FRONTEND_URL}/gerenciador-conexoes`;
    if (error) {
      console.error('[Instagram OAuth] Erro:', error);
      return res.redirect(`${redirectBase}?error=oauth_failed&tab=instagram`);
    }

    if (!code || !instanceId) {
      return res.redirect(`${redirectBase}?error=no_code&tab=instagram`);
    }

    const tokenData = await exchangeCodeForToken(code as string);
    const longLivedTokenData = await exchangeForLongLivedToken(tokenData.access_token);
    const accountInfo = await getInstagramAccountInfo(longLivedTokenData.access_token);

    const igAccountId = accountInfo.user_id || tokenData.user_id;
    const webhookIds = [accountInfo.user_id, tokenData.user_id].filter(
      (id, index, self) => id && self.indexOf(id) === index
    );
    const expiresIn = longLivedTokenData.expires_in ?? 5184000;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    const instance = await InstanceService.getByIdOnly(instanceId as string);
    if (!instance) {
      console.error('[Instagram OAuth] Instância não encontrada:', instanceId);
      return res.redirect(`${redirectBase}?error=instance_not_found&tab=instagram`);
    }

    await InstanceService.connectInstance(
      instance._id.toString(),
      instance.userId.toString(),
      {
        instagramAccountId: igAccountId,
        username: accountInfo.username,
        profilePictureUrl: accountInfo.profile_picture_url,
        accessToken: longLivedTokenData.access_token,
        pageId: igAccountId,
        pageName: accountInfo.name || accountInfo.username,
        tokenExpiresAt,
        webhookIds,
        name: accountInfo.username,
      }
    );

    try {
      const linked = await getLinkedFacebookPageForInstagram(
        longLivedTokenData.access_token,
        String(igAccountId)
      );
      let subscribedOk = false;
      if (linked) {
        try {
          await subscribePageToApp(
            linked.pageId,
            linked.pageAccessToken,
            META_CONFIG.SUBSCRIBED_FIELDS
          );
          console.log('[Instagram OAuth] subscribed_apps ok (Page + page token)', {
            pageId: linked.pageId,
          });
          subscribedOk = true;
        } catch (pageErr) {
          console.warn(
            '[Instagram OAuth] subscribed_apps na Page falhou, tentando Instagram Graph:',
            pageErr instanceof Error ? pageErr.message : pageErr
          );
        }
      }
      if (!subscribedOk) {
        await subscribeInstagramSubscribedApps(
          String(igAccountId),
          longLivedTokenData.access_token
        );
        console.log('[Instagram OAuth] subscribed_apps ok (Instagram Graph + access_token query)', {
          igUserId: String(igAccountId),
        });
      }
    } catch (subErr) {
      console.warn(
        '[Instagram OAuth] subscribed_apps:',
        subErr instanceof Error ? subErr.message : subErr
      );
    }

    emitInstagramUpdate(instance.userId.toString(), {
      instanceId: instance._id.toString(),
      status: 'connected',
    });
    try {
      emitInstagramInstanceUpdated(
        instance.userId.toString(),
        instance._id.toString(),
        'connected'
      );
    } catch {
      /* socket opcional */
    }

    console.log('[Instagram OAuth] Conectado:', accountInfo.username, 'instance:', instance.instanceName);
    return res.redirect(`${redirectBase}?connected=success&tab=instagram`);
  } catch (error: unknown) {
    console.error('[Instagram OAuth] Erro:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return res.redirect(`${FRONTEND_URL}/gerenciador-conexoes?error=${encodeURIComponent(msg)}&tab=instagram`);
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
