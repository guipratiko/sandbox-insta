import { Router } from 'express';
import { requireInternalKey } from '../middleware/internalAuth';
import { sendWorkflowDm } from '../controllers/workflowInternalController';

const router = Router();

router.use(requireInternalKey);
router.post('/send-dm', sendWorkflowDm);

export default router;
