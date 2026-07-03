import { Router } from 'express';
import {
  addDay,
  addDayExercise,
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  listUserPlans,
  registerDownload,
  removeDayExercise,
  updatePlan,
} from '../controllers/planController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { allowRoles } from '../middlewares/roleMiddleware.js';

const router = Router();
router.use(protect);
router.get('/', listPlans);
router.post('/', allowRoles('admin', 'coach'), createPlan);
router.get('/user/:userId', listUserPlans);
router.post('/days/:dayId/exercises', allowRoles('admin', 'coach'), addDayExercise);
router.delete('/days/exercises/:id', allowRoles('admin', 'coach'), removeDayExercise);
router.get('/:id', getPlan);
router.put('/:id', allowRoles('admin', 'coach'), updatePlan);
router.delete('/:id', allowRoles('admin', 'coach'), deletePlan);
router.post('/:planId/days', allowRoles('admin', 'coach'), addDay);
router.post('/:planId/download', registerDownload);

export default router;
