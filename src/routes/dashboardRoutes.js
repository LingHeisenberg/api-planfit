import { Router } from 'express';
import { getStats } from '../controllers/dashboardController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { allowRoles } from '../middlewares/roleMiddleware.js';

const router = Router();
router.get('/stats', protect, allowRoles('admin', 'coach'), getStats);

export default router;
