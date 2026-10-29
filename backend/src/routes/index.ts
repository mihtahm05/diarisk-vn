import { Router } from 'express';
import { register, login, me, logout } from '../controllers/auth.controller';
import { getMe, updateMe, changePassword } from '../controllers/user.controller';
import {
  createPrediction,
  predictionHistory,
  predictionDetail,
  removePrediction,
  patientPredictionHistory,
} from '../controllers/prediction.controller';
import { createPatient, listPatients } from '../controllers/patient.controller';
import {
  upload,
  validateBatch,
  confirmBatch,
  listBatches,
  listTemplates,
  uploadTemplate,
  updateTemplate,
  downloadActiveTemplate,
} from '../controllers/batch.controller';
import { accounts, updateAccount, logs, exportLogs } from '../controllers/admin.controller';
import { exportReport } from '../controllers/report.controller';
import { auth, roles } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/auth/register', asyncHandler(register));
router.post('/auth/login', asyncHandler(login));
router.get('/auth/me', auth, asyncHandler(me));
router.post('/auth/logout', auth, asyncHandler(logout));

router.get('/users/me', auth, asyncHandler(getMe));
router.patch('/users/me', auth, asyncHandler(updateMe));
router.post('/users/me/password', auth, asyncHandler(changePassword));

router.post('/predictions', auth, roles('user', 'doctor'), asyncHandler(createPrediction));
router.get('/predictions', auth, roles('user', 'doctor'), asyncHandler(predictionHistory));
router.get('/predictions/:id', auth, roles('user', 'doctor'), asyncHandler(predictionDetail));
router.delete('/predictions/:id', auth, roles('doctor'), asyncHandler(removePrediction));

router.get('/patients', auth, roles('doctor'), asyncHandler(listPatients));
router.post('/patients', auth, roles('doctor'), asyncHandler(createPatient));
router.get('/patients/:id/predictions', auth, roles('doctor'), asyncHandler(patientPredictionHistory));

router.post('/batches/validate', auth, roles('doctor'), upload.single('file'), asyncHandler(validateBatch));
router.post('/batches/:id/confirm', auth, roles('doctor'), asyncHandler(confirmBatch));
router.get('/batches', auth, roles('doctor'), asyncHandler(listBatches));
router.get('/templates/active/download', auth, roles('doctor'), asyncHandler(downloadActiveTemplate));

router.post('/reports/export', auth, roles('doctor'), asyncHandler(exportReport));

router.get('/admin/accounts', auth, roles('admin'), asyncHandler(accounts));
router.patch('/admin/accounts/:id', auth, roles('admin'), asyncHandler(updateAccount));
router.get('/admin/templates', auth, roles('admin'), asyncHandler(listTemplates));
router.post('/admin/templates', auth, roles('admin'), upload.single('file'), asyncHandler(uploadTemplate));
router.patch('/admin/templates/:id', auth, roles('admin'), asyncHandler(updateTemplate));
router.get('/admin/logs', auth, roles('admin'), asyncHandler(logs));
router.post('/admin/logs/export', auth, roles('admin'), asyncHandler(exportLogs));
router.get('/logs', auth, roles('admin'), asyncHandler(logs));

export default router;
