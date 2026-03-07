import { Router } from 'express';
import { protect } from '../middleware/auth';
import * as reportController from '../controllers/reportController';

const router = Router();

// Todas as rotas requerem autenticação
router.use(protect);

// Rotas de relatórios
router.get('/', reportController.getReports);
router.get('/export', reportController.exportReports);
router.get('/stats', reportController.getStatistics);

export default router;
