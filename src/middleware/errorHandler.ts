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
    console.error('❌ [Insta-Clerky] Erro:', err.message);
    console.error('   Stack:', err.stack);
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
