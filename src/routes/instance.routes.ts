import { Router } from 'express';
import { protect } from '../middleware/auth';
import * as instanceController from '../controllers/instanceController';
import * as crmMessagingController from '../controllers/crmMessagingController';

const router = Router();

// Rota pública para callback do OAuth (Instagram chama diretamente)
router.get('/oauth/callback', instanceController.handleOAuthCallback);

// Todas as outras rotas requerem autenticação
router.use(protect);

// Rotas de instâncias
router.post('/', instanceController.createInstance);
router.get('/', instanceController.getInstances);
// CRM OnlyFlow — antes de GET /:id para não colidir
router.post('/:id/crm/send-text', crmMessagingController.sendCrmText);
router.post('/:id/crm/send-attachment', crmMessagingController.sendCrmAttachment);
router.get('/:id', instanceController.getInstanceById);
router.put('/:id', instanceController.updateInstance);
router.delete('/:id', instanceController.deleteInstance);
router.get('/:id/oauth', instanceController.initiateOAuth);
router.post('/:id/refresh-token', instanceController.refreshToken);

export default router;
