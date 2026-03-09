/**
 * Formata instâncias Instagram para respostas da API (evita duplicação de campos).
 */

import { IInstagramInstance } from '../models/InstagramInstance';

export interface InstanceResponse {
  id: string;
  instanceName: string;
  name: string;
  username?: string;
  profilePictureUrl?: string;
  pageName?: string;
  status: string;
  tokenExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstanceListItemResponse extends InstanceResponse {}

export function formatInstance(instance: IInstagramInstance): InstanceResponse {
  return {
    id: instance._id.toString(),
    instanceName: instance.instanceName,
    name: instance.name ?? '',
    username: instance.username,
    profilePictureUrl: instance.profilePictureUrl,
    pageName: instance.pageName,
    status: instance.status,
    tokenExpiresAt: instance.tokenExpiresAt,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
  };
}

export function formatInstanceList(instances: IInstagramInstance[]): InstanceListItemResponse[] {
  return instances.map(formatInstance);
}
