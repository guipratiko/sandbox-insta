/**
 * Rotas públicas de privacidade do Instagram/Meta
 * Essas rotas são chamadas diretamente pelo Meta e não requerem autenticação
 */

import { Router } from 'express';
import * as privacyController from '../controllers/privacyController';

const router = Router();

// Endpoints públicos de privacidade (chamados pelo Meta)
router.post('/deauthorize', privacyController.deauthorize);
router.post('/delete-data', privacyController.deleteData);

export default router;
