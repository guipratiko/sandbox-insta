/**
 * Service para gerenciar relatórios do Instagram
 */

import { pgPool } from '../config/databases';

export interface Report {
  id: string;
  instanceId: string;
  userId: string;
  interactionType: 'dm' | 'comment';
  commentId?: string;
  userIdInstagram: string;
  mediaId?: string;
  username?: string;
  interactionText: string;
  responseText?: string;
  responseStatus: 'pending' | 'sent' | 'failed';
  automationId?: string; // ID da automação que processou esta interação
  timestamp: number;
  createdAt: Date;
}

export interface CreateReportData {
  instanceId: string;
  userId: string;
  interactionType: 'dm' | 'comment';
  commentId?: string;
  userIdInstagram: string;
  mediaId?: string;
  username?: string;
  interactionText: string;
  responseText?: string;
  responseStatus?: 'pending' | 'sent' | 'failed';
  automationId?: string; // ID da automação que processou esta interação
  timestamp: number;
}

export interface GetReportsParams {
  userId: string;
  instanceId?: string;
  interactionType?: 'dm' | 'comment';
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export class ReportService {
  /**
   * Mapear row do banco para objeto Report
   */
  private static mapRowToReport(row: any): Report {
    return {
      id: row.id,
      instanceId: row.instance_id,
      userId: row.user_id,
      interactionType: row.interaction_type,
      commentId: row.comment_id,
      userIdInstagram: row.user_id_instagram,
      mediaId: row.media_id,
      username: row.username,
      interactionText: row.interaction_text,
      responseText: row.response_text,
      responseStatus: row.response_status,
      automationId: row.automation_id,
      timestamp: parseInt(row.timestamp),
      createdAt: row.created_at,
    };
  }

  /**
   * Criar novo relatório
   */
  static async create(data: CreateReportData): Promise<Report> {
    const query = `
      INSERT INTO instagram_reports (
        instance_id, user_id, interaction_type, comment_id,
        user_id_instagram, media_id, username, interaction_text,
        response_text, response_status, automation_id, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await pgPool.query(query, [
      data.instanceId,
      data.userId,
      data.interactionType,
      data.commentId || null,
      data.userIdInstagram,
      data.mediaId || null,
      data.username || null,
      data.interactionText,
      data.responseText || null,
      data.responseStatus || 'pending',
      data.automationId || null,
      data.timestamp,
    ]);

    return this.mapRowToReport(result.rows[0]);
  }

  /**
   * Obter relatórios com filtros e paginação
   */
  static async getReports(params: GetReportsParams): Promise<{
    reports: Report[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      userId,
      instanceId,
      interactionType,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = params;

    const offset = (page - 1) * limit;

    // Construir query com filtros
    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [userId];
    let paramIndex = 2;

    if (instanceId) {
      conditions.push(`instance_id = $${paramIndex++}`);
      values.push(instanceId);
    }

    if (interactionType) {
      conditions.push(`interaction_type = $${paramIndex++}`);
      values.push(interactionType);
    }

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      values.push(Math.floor(startDate.getTime() / 1000));
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      values.push(Math.floor(endDate.getTime() / 1000));
    }

    const whereClause = conditions.join(' AND ');

    // Query para contar total
    const countQuery = `SELECT COUNT(*) as total FROM instagram_reports WHERE ${whereClause}`;
    const countResult = await pgPool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Query para obter relatórios
    const query = `
      SELECT * FROM instagram_reports
      WHERE ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    values.push(limit, offset);
    const result = await pgPool.query(query, values);

    return {
      reports: result.rows.map((row) => this.mapRowToReport(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Obter estatísticas
   */
  static async getStatistics(
    userId: string,
    instanceId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    total: number;
    byType: { dm: number; comment: number };
    byStatus: { pending: number; sent: number; failed: number };
  }> {
    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [userId];
    let paramIndex = 2;

    if (instanceId) {
      conditions.push(`instance_id = $${paramIndex++}`);
      values.push(instanceId);
    }

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      values.push(Math.floor(startDate.getTime() / 1000));
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      values.push(Math.floor(endDate.getTime() / 1000));
    }

    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE interaction_type = 'dm') as dm_count,
        COUNT(*) FILTER (WHERE interaction_type = 'comment') as comment_count,
        COUNT(*) FILTER (WHERE response_status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE response_status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE response_status = 'failed') as failed_count
      FROM instagram_reports
      WHERE ${whereClause}
    `;

    const result = await pgPool.query(query, values);
    const row = result.rows[0];

    return {
      total: parseInt(row.total),
      byType: {
        dm: parseInt(row.dm_count),
        comment: parseInt(row.comment_count),
      },
      byStatus: {
        pending: parseInt(row.pending_count),
        sent: parseInt(row.sent_count),
        failed: parseInt(row.failed_count),
      },
    };
  }

  /**
   * Atualizar status da resposta
   */
  static async updateResponseStatus(
    id: string,
    responseStatus: 'pending' | 'sent' | 'failed',
    responseText?: string
  ): Promise<boolean> {
    const updates: string[] = [`response_status = $1`];
    const values: any[] = [responseStatus];

    if (responseText !== undefined) {
      updates.push(`response_text = $${values.length + 1}`);
      values.push(responseText);
    }

    values.push(id);

    const query = `
      UPDATE instagram_reports
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
    `;

    const result = await pgPool.query(query, values);
    return (result.rowCount || 0) > 0;
  }
}
