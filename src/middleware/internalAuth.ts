import { Request, Response, NextFunction } from 'express';

const INTERNAL_KEY = (process.env.ONLYFLOW_INTERNAL_KEY || process.env.JWT_SECRET || '').trim();

/** Rotas internas (MindClerky ↔ Insta-Clerky). */
export function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (!INTERNAL_KEY) {
    res.status(503).json({ status: 'error', message: 'ONLYFLOW_INTERNAL_KEY não configurada.' });
    return;
  }
  const provided = String(req.headers['x-onlyflow-internal-key'] || '').trim();
  if (provided !== INTERNAL_KEY) {
    res.status(403).json({ status: 'error', message: 'Chave interna inválida.' });
    return;
  }
  next();
}
