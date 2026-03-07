/**
 * Service para gerenciar automações do Instagram
 */

import { pgPool } from '../config/databases';
import { parseJsonbField } from '../utils/dbHelpers';

export interface ResponseSequenceItem {
  type: 'text' | 'image' | 'video' | 'audio';
  content: string; // texto ou URL da mídia
  delay: number; // delay em segundos antes de enviar esta mensagem
}

export interface Automation {
  id: string;
  userId: string;
  instanceId: string;
  name: string;
  type: 'dm' | 'comment';
  triggerType: 'keyword' | 'all';
  keywords: string[];
  responseText: string; // Para comentários (sempre texto)
  responseType: 'direct' | 'comment' | 'comment_and_dm';
  responseTextDM?: string; // Texto da DM quando responseType = 'comment_and_dm'
  responseSequence?: ResponseSequenceItem[]; // Para DM (sequência de mensagens)
  delaySeconds: number; // Delay global (deprecated, usar delay em cada item da sequência)
  preventDuplicate: boolean; // Evitar que o mesmo contato entre novamente no mesmo fluxo
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAutomationData {
  userId: string;
  instanceId: string;
  name: string;
  type: 'dm' | 'comment';
  triggerType: 'keyword' | 'all';
  keywords?: string[];
  responseText: string; // Obrigatório para comentários
  responseType: 'direct' | 'comment' | 'comment_and_dm';
  responseTextDM?: string; // Texto da DM quando responseType = 'comment_and_dm'
  responseSequence?: ResponseSequenceItem[]; // Obrigatório para DM quando responseType === 'direct'
  delaySeconds?: number;
  preventDuplicate?: boolean; // Padrão: true
  isActive?: boolean;
}

export interface UpdateAutomationData {
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

export class AutomationService {
  /**
   * Mapear row do banco para objeto Automation
   */
  private static mapRowToAutomation(row: any): Automation {
    const responseSequence = row.response_sequence
      ? parseJsonbField<ResponseSequenceItem[]>(row.response_sequence, [])
      : undefined;

    return {
      id: row.id,
      userId: row.user_id,
      instanceId: row.instance_id,
      name: row.name,
      type: row.type,
      triggerType: row.trigger_type,
      keywords: parseJsonbField<string[]>(row.keywords, []),
      responseText: row.response_text,
      responseType: row.response_type,
      responseTextDM: row.response_text_dm || undefined,
      responseSequence: responseSequence && responseSequence.length > 0 ? responseSequence : undefined,
      delaySeconds: row.delay_seconds || 0,
      preventDuplicate: row.prevent_duplicate !== undefined ? row.prevent_duplicate : true,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Criar nova automação
   */
  static async create(data: CreateAutomationData): Promise<Automation> {
    // Validação adicional: garantir que keywords não está vazio quando triggerType é 'keyword'
    if (data.triggerType === 'keyword') {
      if (!data.keywords || data.keywords.length === 0) {
        throw new Error('Palavras-chave são obrigatórias quando trigger_type é "keyword"');
      }
      
      // Filtrar palavras-chave vazias
      const validKeywords = data.keywords.filter((keyword) => keyword && keyword.trim().length > 0);
      if (validKeywords.length === 0) {
        throw new Error('As palavras-chave não podem estar vazias');
      }
      
      // Atualizar data.keywords com apenas palavras-chave válidas
      data.keywords = validKeywords.map((k) => k.trim());
    }

    const query = `
      INSERT INTO instagram_automations (
        user_id, instance_id, name, type, trigger_type,
        keywords, response_text, response_type, response_text_dm, response_sequence, delay_seconds, prevent_duplicate, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const result = await pgPool.query(query, [
      data.userId,
      data.instanceId,
      data.name,
      data.type,
      data.triggerType,
      data.triggerType === 'keyword' ? data.keywords : null,
      data.responseText,
      data.responseType,
      data.responseTextDM || null,
      data.responseSequence ? JSON.stringify(data.responseSequence) : null,
      data.delaySeconds !== undefined ? Math.max(0, Math.floor(data.delaySeconds)) : 0,
      data.preventDuplicate !== undefined ? data.preventDuplicate : true,
      data.isActive !== undefined ? data.isActive : true,
    ]);

    return this.mapRowToAutomation(result.rows[0]);
  }

  /**
   * Obter todas as automações de um usuário
   */
  static async getByUserId(userId: string, instanceId?: string): Promise<Automation[]> {
    let query = `
      SELECT * FROM instagram_automations
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (instanceId) {
      query += ` AND instance_id = $2`;
      params.push(instanceId);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pgPool.query(query, params);
    return result.rows.map((row) => this.mapRowToAutomation(row));
  }

  /**
   * Obter automações ativas para uma instância
   */
  static async getActiveByInstance(instanceId: string): Promise<Automation[]> {
    const query = `
      SELECT * FROM instagram_automations
      WHERE instance_id = $1 AND is_active = TRUE
      ORDER BY created_at DESC
    `;

    const result = await pgPool.query(query, [instanceId]);
    return result.rows.map((row) => this.mapRowToAutomation(row));
  }

  /**
   * Obter automação por ID
   */
  static async getById(id: string, userId: string): Promise<Automation | null> {
    const query = `
      SELECT * FROM instagram_automations
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [id, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAutomation(result.rows[0]);
  }

  /**
   * Atualizar automação
   */
  static async update(
    id: string,
    userId: string,
    data: UpdateAutomationData
  ): Promise<Automation | null> {
    // Buscar automação atual para validar triggerType
    const currentAutomation = await this.getById(id, userId);
    if (!currentAutomation) {
      return null;
    }

    // Determinar o triggerType final (novo ou atual)
    const finalTriggerType = data.triggerType !== undefined ? data.triggerType : currentAutomation.triggerType;

    // Validação: garantir que keywords não está vazio quando triggerType é 'keyword'
    if (finalTriggerType === 'keyword') {
      if (data.keywords !== undefined) {
        if (data.keywords.length === 0) {
          throw new Error('Palavras-chave são obrigatórias quando trigger_type é "keyword"');
        }
        
        // Filtrar palavras-chave vazias
        const validKeywords = data.keywords.filter((keyword) => keyword && keyword.trim().length > 0);
        if (validKeywords.length === 0) {
          throw new Error('As palavras-chave não podem estar vazias');
        }
        
        // Atualizar data.keywords com apenas palavras-chave válidas
        data.keywords = validKeywords.map((k) => k.trim());
      } else if (data.triggerType === 'keyword' && currentAutomation.triggerType !== 'keyword') {
        // Se está mudando de 'all' para 'keyword' mas não forneceu keywords
        throw new Error('É necessário informar palavras-chave ao mudar o tipo de trigger para "keyword"');
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.triggerType !== undefined) {
      updates.push(`trigger_type = $${paramIndex++}`);
      values.push(data.triggerType);
    }

    if (data.keywords !== undefined) {
      updates.push(`keywords = $${paramIndex++}`);
      // Passar array diretamente - o driver pg converte automaticamente para TEXT[]
      values.push(finalTriggerType === 'keyword' ? data.keywords : null);
    }

    if (data.responseText !== undefined) {
      updates.push(`response_text = $${paramIndex++}`);
      values.push(data.responseText);
    }

    if (data.responseType !== undefined) {
      updates.push(`response_type = $${paramIndex++}`);
      values.push(data.responseType);
    }

    if (data.responseTextDM !== undefined) {
      updates.push(`response_text_dm = $${paramIndex++}`);
      values.push(data.responseTextDM || null);
    }

    if (data.responseSequence !== undefined) {
      updates.push(`response_sequence = $${paramIndex++}`);
      values.push(data.responseSequence ? JSON.stringify(data.responseSequence) : null);
    }

    if (data.delaySeconds !== undefined) {
      updates.push(`delay_seconds = $${paramIndex++}`);
      values.push(Math.max(0, Math.floor(data.delaySeconds)));
    }

    if (data.preventDuplicate !== undefined) {
      updates.push(`prevent_duplicate = $${paramIndex++}`);
      values.push(data.preventDuplicate);
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }

    if (updates.length === 0) {
      return this.getById(id, userId);
    }

    values.push(id, userId);
    const query = `
      UPDATE instagram_automations
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await pgPool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAutomation(result.rows[0]);
  }

  /**
   * Deletar automação
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM instagram_automations
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [id, userId]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Verificar se uma mensagem/comentário corresponde a alguma automação
   */
  static async findMatchingAutomation(
    instanceId: string,
    type: 'dm' | 'comment',
    text: string
  ): Promise<Automation | null> {
    const automations = await this.getActiveByInstance(instanceId);
    const relevantAutomations = automations.filter((auto) => auto.type === type);

    for (const automation of relevantAutomations) {
      if (automation.triggerType === 'all') {
        return automation;
      }

      if (automation.triggerType === 'keyword') {
        const lowerText = text.toLowerCase();
        const hasKeyword = automation.keywords.some((keyword) =>
          lowerText.includes(keyword.toLowerCase())
        );

        if (hasKeyword) {
          return automation;
        }
      }
    }

    return null;
  }
}
