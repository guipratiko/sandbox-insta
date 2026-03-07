import { Router } from 'express';
import * as webhookController from '../controllers/webhookController';

const router = Router();

// Webhook não requer autenticação (usa verify token)
// URL única e estável para o Meta Developers
router.get('/instagram', webhookController.verifyWebhook);
router.post('/instagram', webhookController.handleWebhook);

export default router;
