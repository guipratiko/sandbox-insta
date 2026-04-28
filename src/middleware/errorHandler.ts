import { Request, Response, NextFunction } from 'express';
import { SERVER_CONFIG } from '../config/constants';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  if (statusCode >= 500) {
    console.error('❌ [Instagram OnlyFlow] Erro:', err.message);
    console.error('   Stack:', err.stack);
  } else if (statusCode >= 400) {
    // 4xx (ex.: 403 janela de mensagens da Meta) não era logado — parecia que o pedido não chegava ao microserviço.
    console.warn(
      `⚠️ [Instagram OnlyFlow] ${req.method} ${req.originalUrl} → HTTP ${statusCode}: ${err.message}`
    );
  }

  res.status(statusCode).json({
    status,
    message: err.message || 'Erro interno do servidor',
    ...(SERVER_CONFIG.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error: AppError = new Error(`Rota não encontrada: ${req.originalUrl}`);
  error.statusCode = 404;
  error.status = 'not_found';
  next(error);
};
