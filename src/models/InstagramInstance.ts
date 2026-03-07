import mongoose, { Document, Schema } from 'mongoose';
import { generateInstanceToken } from '../utils/tokenGenerator';
import { generateInstanceName } from '../utils/tokenGenerator';

export interface IInstagramInstance extends Document {
  instanceName: string; // Nome interno gerado automaticamente
  name: string; // Nome escolhido pelo usuário (apenas para exibição)
  userId: mongoose.Types.ObjectId;
  token?: string; // Token para autenticação de webhooks externos
  instagramAccountId?: string; // ID da conta no Instagram (preenchido após OAuth)
  username?: string; // Username do Instagram (preenchido após OAuth)
  profilePictureUrl?: string; // URL da foto de perfil do Instagram (preenchido após OAuth)
  accessToken?: string; // Token de acesso long-lived (preenchido após OAuth)
  pageId?: string; // ID da página associada (preenchido após OAuth)
  pageName?: string; // Nome da página (preenchido após OAuth)
  tokenExpiresAt?: Date; // Data de expiração do token (preenchido após OAuth)
  status: 'created' | 'connecting' | 'connected' | 'disconnected' | 'error';
  webhookIds: string[]; // IDs alternativos para webhooks
  createdAt: Date;
  updatedAt: Date;
}

const InstagramInstanceSchema: Schema = new Schema(
  {
    instanceName: {
      type: String,
      required: [true, 'Nome da instância é obrigatório'],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: false, // Será preenchido com username após OAuth
      trim: true,
      default: '', // Valor padrão vazio
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Usuário é obrigatório'],
    },
    token: {
      type: String,
      required: true,
      unique: true,
      default: () => generateInstanceToken(),
    },
    instagramAccountId: {
      type: String,
      required: false, // Preenchido apenas após conexão OAuth
      trim: true,
    },
    username: {
      type: String,
      required: false, // Preenchido apenas após conexão OAuth
      trim: true,
    },
    profilePictureUrl: {
      type: String,
      required: false, // Preenchido apenas após conexão OAuth
      trim: true,
    },
    accessToken: {
      type: String,
      required: false, // Preenchido apenas após conexão OAuth
      select: false, // Não retornar token por padrão
    },
    pageId: {
      type: String,
      required: false, // Preenchido apenas após conexão OAuth
      trim: true,
    },
    pageName: {
      type: String,
      required: false, // Preenchido apenas após conexão OAuth
      trim: true,
    },
    tokenExpiresAt: {
      type: Date,
      required: false, // Preenchido apenas após conexão OAuth
    },
    status: {
      type: String,
      enum: ['created', 'connecting', 'connected', 'disconnected', 'error'],
      default: 'created',
    },
    webhookIds: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Hook pre-save para garantir que o token seja sempre gerado
InstagramInstanceSchema.pre('save', async function (next) {
  // Se não tiver token, gerar um novo
  if (!this.token || this.token === '') {
    let newToken = generateInstanceToken();
    // Garantir que o token seja único
    const InstagramInstanceModel = this.constructor as typeof InstagramInstance;
    let existingInstance = await InstagramInstanceModel.findOne({ token: newToken });
    while (existingInstance) {
      newToken = generateInstanceToken();
      existingInstance = await InstagramInstanceModel.findOne({ token: newToken });
    }
    this.token = newToken;
  }

  // Se não tiver instanceName, gerar um novo
  if (!this.instanceName || this.instanceName === '') {
    let newInstanceName = generateInstanceName();
    // Garantir que o instanceName seja único
    const InstagramInstanceModel = this.constructor as typeof InstagramInstance;
    let existingInstance = await InstagramInstanceModel.findOne({ instanceName: newInstanceName });
    while (existingInstance) {
      newInstanceName = generateInstanceName();
      existingInstance = await InstagramInstanceModel.findOne({ instanceName: newInstanceName });
    }
    this.instanceName = newInstanceName;
  }

  next();
});

// Índices para melhor performance
InstagramInstanceSchema.index({ userId: 1 });
InstagramInstanceSchema.index({ instagramAccountId: 1 });
InstagramInstanceSchema.index({ status: 1 });
// token e instanceName já têm índices únicos criados automaticamente pelo unique: true

const InstagramInstance = mongoose.model<IInstagramInstance>('InstagramInstance', InstagramInstanceSchema);

export default InstagramInstance;
