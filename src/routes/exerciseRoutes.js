import { Router } from 'express';
import {
  createExercise,
  deleteExercise,
  getExercise,
  listExercises,
  updateExercise,
} from '../controllers/exerciseController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { allowRoles } from '../middlewares/roleMiddleware.js';

const router = Router();
router.use(protect);
router.get('/', listExercises);
router.get('/:id', getExercise);
router.post('/', allowRoles('admin', 'coach'), createExercise);
router.put('/:id', allowRoles('admin', 'coach'), updateExercise);
router.delete('/:id', allowRoles('admin', 'coach'), deleteExercise);

export default router;
