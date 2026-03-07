/**
 * Service para gerenciar instâncias do Instagram
 */

import InstagramInstance, { IInstagramInstance } from '../models/InstagramInstance';
import { generateInstanceName } from '../utils/tokenGenerator';

export interface CreateInstanceData {
  userId: string;
  // name removido - será preenchido com username após OAuth
}

export interface UpdateInstanceData {
  name?: string;
  status?: 'created' | 'connecting' | 'connected' | 'disconnected' | 'error';
}

export class InstanceService {
  /**
   * Criar nova instância
   */
  static async create(data: CreateInstanceData): Promise<IInstagramInstance> {
    // Gerar nome único para a instância
    let instanceName = generateInstanceName();
    let existingInstance = await InstagramInstance.findOne({ instanceName });
    while (existingInstance) {
      instanceName = generateInstanceName();
      existingInstance = await InstagramInstance.findOne({ instanceName });
    }

    const instance = await InstagramInstance.create({
      instanceName,
      // name não é obrigatório - será preenchido com username após OAuth
      userId: data.userId,
      status: 'created',
    });

    return instance;
  }

  /**
   * Obter todas as instâncias de um usuário
   */
  static async getByUserId(userId: string): Promise<IInstagramInstance[]> {
    return InstagramInstance.find({ userId }).sort({ createdAt: -1 });
  }

  /**
   * Obter instância por ID
   */
  static async getById(id: string, userId: string): Promise<IInstagramInstance | null> {
    return InstagramInstance.findOne({ _id: id, userId });
  }

  /**
   * Obter instância por ID apenas (usado no callback OAuth)
   */
  static async getByIdOnly(id: string): Promise<IInstagramInstance | null> {
    return InstagramInstance.findById(id);
  }

  /**
   * Obter instância por instanceName
   */
  static async getByInstanceName(instanceName: string): Promise<IInstagramInstance | null> {
    return InstagramInstance.findOne({ instanceName });
  }

  /**
   * Obter instância por Instagram Account ID
   */
  static async getByInstagramAccountId(
    instagramAccountId: string
  ): Promise<IInstagramInstance | null> {
    return InstagramInstance.findOne({
      $or: [
        { instagramAccountId },
        { webhookIds: instagramAccountId },
      ],
    }).select('+accessToken'); // Incluir accessToken
  }

  /**
   * Atualizar instância
   */
  static async update(
    id: string,
    userId: string,
    data: UpdateInstanceData
  ): Promise<IInstagramInstance | null> {
    const instance = await InstagramInstance.findOneAndUpdate(
      { _id: id, userId },
      { $set: data },
      { new: true }
    );

    return instance;
  }

  /**
   * Conectar instância (após OAuth)
   */
  static async connectInstance(
    id: string,
    userId: string,
    data: {
      instagramAccountId: string;
      username: string;
      profilePictureUrl?: string;
      accessToken: string;
      pageId: string;
      pageName: string;
      tokenExpiresAt: Date;
      webhookIds?: string[];
      name?: string; // Nome da instância (geralmente o username)
    }
  ): Promise<IInstagramInstance | null> {
    const instance = await InstagramInstance.findOneAndUpdate(
      { _id: id, userId },
      {
        $set: {
          ...data,
          status: 'connected',
        },
      },
      { new: true }
    );

    return instance;
  }

  /**
   * Deletar instância
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const result = await InstagramInstance.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }

  /**
   * Atualizar token de acesso
   */
  static async updateAccessToken(
    id: string,
    accessToken: string,
    tokenExpiresAt: Date
  ): Promise<IInstagramInstance | null> {
    const instance = await InstagramInstance.findByIdAndUpdate(
      id,
      {
        $set: {
          accessToken,
          tokenExpiresAt,
        },
      },
      { new: true }
    );

    return instance;
  }
}
