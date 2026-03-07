import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createValidationError,
  handleControllerError,
} from '../utils/errorHelpers';
import { ReportService } from '../services/reportService';

/**
 * Listar relatórios
 */
export const getReports = async (
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
      interactionType,
      startDate,
      endDate,
      page = '1',
      limit = '50',
    } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const result = await ReportService.getReports({
      userId,
      instanceId: instanceId as string | undefined,
      interactionType: interactionType as 'dm' | 'comment' | undefined,
      startDate: start,
      endDate: end,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });

    res.status(200).json({
      status: 'success',
      data: result.reports,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar relatórios'));
  }
};

/**
 * Exportar relatórios (CSV)
 */
export const exportReports = async (
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
      interactionType,
      startDate,
      endDate,
    } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    // Obter todos os relatórios (sem paginação para exportação)
    const result = await ReportService.getReports({
      userId,
      instanceId: instanceId as string | undefined,
      interactionType: interactionType as 'dm' | 'comment' | undefined,
      startDate: start,
      endDate: end,
      page: 1,
      limit: 10000, // Limite alto para exportação
    });

    // Converter para CSV
    const headers = [
      'Data/Hora',
      'Tipo',
      'Username',
      'Texto da Interação',
      'Texto da Resposta',
      'Status',
    ];

    const rows = result.reports.map((report) => {
      const date = new Date(report.timestamp * 1000).toISOString();
      return [
        date,
        report.interactionType,
        report.username || '',
        report.interactionText,
        report.responseText || '',
        report.responseStatus,
      ].map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=instagram-reports-${Date.now()}.csv`);
    res.status(200).send(csv);
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao exportar relatórios'));
  }
};

/**
 * Obter estatísticas
 */
export const getStatistics = async (
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
      startDate,
      endDate,
    } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const stats = await ReportService.getStatistics(
      userId,
      instanceId as string | undefined,
      start,
      end
    );

    // Transformar os dados para o formato esperado pelo frontend
    const formattedStats = {
      totalInteractions: stats.total,
      totalDMs: stats.byType.dm,
      totalComments: stats.byType.comment,
      totalResponses: stats.byStatus.sent + stats.byStatus.failed + stats.byStatus.pending,
      successfulResponses: stats.byStatus.sent,
      failedResponses: stats.byStatus.failed,
      byType: stats.byType,
      byStatus: stats.byStatus,
    };

    res.status(200).json({
      status: 'success',
      data: formattedStats,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao buscar estatísticas'));
  }
};
