import { Router } from 'express';
import {
  createUser,
  deleteUser,
  getUser,
  listClients,
  listUsers,
  updateUser,
} from '../controllers/userController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { allowRoles } from '../middlewares/roleMiddleware.js';

const router = Router();
router.use(protect);
router.get('/clients/list', allowRoles('admin', 'coach'), listClients);
router.get('/', allowRoles('admin', 'coach'), listUsers);
router.post('/', allowRoles('admin', 'coach'), createUser);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.delete('/:id', allowRoles('admin', 'coach'), deleteUser);

export default router;
