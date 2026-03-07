import { Router } from 'express';
import { protect } from '../middleware/auth';
import * as automationController from '../controllers/automationController';

const router = Router();

// Todas as rotas requerem autenticação
router.use(protect);

// Rotas de automações (rotas estáticas antes de /:id para não capturar "clear-all-contacts" como id)
router.post('/', automationController.createAutomation);
router.get('/', automationController.getAutomations);
router.delete('/clear-all-contacts', automationController.clearAllAutomationContacts);
router.get('/:id', automationController.getAutomationById);
router.put('/:id', automationController.updateAutomation);
router.delete('/:id', automationController.deleteAutomation);
router.post('/:id/toggle', automationController.toggleAutomation);
router.delete('/:id/clear-contacts', automationController.clearAutomationContacts);

export default router;
