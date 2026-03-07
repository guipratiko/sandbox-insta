/**
 * Service para renovação automática de tokens do Instagram
 */

import { refreshLongLivedToken } from './metaAPIService';
import { InstanceService } from './instanceService';
import InstagramInstance from '../models/InstagramInstance';

/**
 * Renovar token de uma instância específica
 */
export const refreshInstanceToken = async (instanceId: string): Promise<boolean> => {
  try {
    const instance = await InstagramInstance.findById(instanceId).select('+accessToken');

    if (!instance || !instance.accessToken || !instance.tokenExpiresAt) {
      console.error(`❌ Instância ${instanceId} não encontrada ou sem token/tokenExpiresAt`);
      return false;
    }

    // Verificar se o token está próximo de expirar (7 dias antes)
    const daysUntilExpiry = Math.floor(
      (instance.tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry > 7) {
      console.log(`✅ Token da instância ${instanceId} ainda válido por ${daysUntilExpiry} dias`);
      return true;
    }

    console.log(`🔄 Renovando token da instância ${instanceId}...`);

    // Renovar token
    const tokenData = await refreshLongLivedToken(instance.accessToken);

    // Calcular nova data de expiração (60 dias a partir de agora)
    const expiresIn = tokenData.expires_in || 5184000; // 60 dias em segundos
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Atualizar instância
    await InstanceService.updateAccessToken(instanceId, tokenData.access_token, newExpiresAt);

    console.log(`✅ Token da instância ${instanceId} renovado com sucesso`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao renovar token da instância ${instanceId}:`, error);
    return false;
  }
};

/**
 * Renovar tokens de todas as instâncias que estão próximas de expirar
 */
export const refreshAllExpiringTokens = async (): Promise<void> => {
  try {
    const instances = await InstagramInstance.find({
      status: 'connected',
      tokenExpiresAt: {
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expira em 7 dias ou menos
      },
    }).select('+accessToken');

    console.log(`🔄 Encontradas ${instances.length} instâncias com tokens próximos de expirar`);

    for (const instance of instances) {
      await refreshInstanceToken(instance._id.toString());
      // Aguardar um pouco entre renovações para evitar rate limit
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`✅ Processo de renovação de tokens concluído`);
  } catch (error) {
    console.error('❌ Erro ao renovar tokens:', error);
  }
};

/**
 * Iniciar scheduler para renovação automática de tokens
 * Executa diariamente às 3h da manhã
 */
export const startTokenRefreshScheduler = (): void => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(3, 0, 0, 0); // 3h da manhã

  const msUntilTomorrow = tomorrow.getTime() - now.getTime();

  console.log(`⏰ Scheduler de renovação de tokens iniciado. Próxima execução: ${tomorrow.toISOString()}`);

  // Agendar primeira execução
  setTimeout(() => {
    refreshAllExpiringTokens();

    // Agendar execuções diárias
    setInterval(() => {
      refreshAllExpiringTokens();
    }, 24 * 60 * 60 * 1000); // 24 horas
  }, msUntilTomorrow);
};
