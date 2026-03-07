import { Router } from 'express';
import { protect } from '../middleware/auth';
import * as instanceController from '../controllers/instanceController';

const router = Router();

// Rota pública para callback do OAuth (Instagram chama diretamente)
router.get('/oauth/callback', instanceController.handleOAuthCallback);

// Todas as outras rotas requerem autenticação
router.use(protect);

// Rotas de instâncias
router.post('/', instanceController.createInstance);
router.get('/', instanceController.getInstances);
router.get('/:id', instanceController.getInstanceById);
router.put('/:id', instanceController.updateInstance);
router.delete('/:id', instanceController.deleteInstance);
router.get('/:id/oauth', instanceController.initiateOAuth);
router.post('/:id/refresh-token', instanceController.refreshToken);

export default router;
