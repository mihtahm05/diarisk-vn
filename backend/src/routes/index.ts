import { Router } from 'express';
import { register, login, me, logout } from '../controllers/auth.controller';
import { getMe, updateMe, changePassword } from '../controllers/user.controller';
import {
  createPrediction,
  predictionHistory,
  predictionDetail,
  removePrediction,
  removePredictions,
  patientPredictionHistory,
} from '../controllers/prediction.controller';
import { dashboardMetrics } from '../controllers/dashboard.controller';
import { createPatient, generatePatientCode, listPatients } from '../controllers/patient.controller';
import {
  upload,
  validateBatch,
  confirmBatch,
  listBatches,
  batchDetail,
  deleteBatch,
  listTemplates,
  uploadTemplate,
  updateTemplate,
  downloadActiveTemplate,
} from '../controllers/batch.controller';
import { accounts, updateAccount, deleteAccount, logs, exportLogs } from '../controllers/admin.controller';
import { exportPredictionPdf, exportReport } from '../controllers/report.controller';
import { avatarUpload, deleteMyAvatar, uploadMyAvatar } from '../controllers/avatar.controller';
import { requestPasswordReset, resetPassword } from '../controllers/passwordReset.controller';
import { auth, roles } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/dashboard/metrics', auth, roles('user', 'doctor', 'admin'), asyncHandler(dashboardMetrics));

router.post('/auth/register', asyncHandler(register));
router.post('/auth/login', asyncHandler(login));
router.post('/auth/forgot-password', asyncHandler(requestPasswordReset));
router.post('/auth/reset-password', asyncHandler(resetPassword));
router.get('/auth/me', auth, asyncHandler(me));
router.post('/auth/logout', auth, asyncHandler(logout));

router.get('/users/me', auth, asyncHandler(getMe));
router.patch('/users/me', auth, asyncHandler(updateMe));
router.post('/users/me/password', auth, asyncHandler(changePassword));
router.post('/users/me/avatar', auth, avatarUpload.single('avatar'), asyncHandler(uploadMyAvatar));
router.delete('/users/me/avatar', auth, asyncHandler(deleteMyAvatar));

router.post('/predictions', auth, roles('user', 'doctor'), asyncHandler(createPrediction));
router.get('/predictions', auth, roles('user', 'doctor'), asyncHandler(predictionHistory));
router.get('/predictions/:id/pdf', auth, roles('user', 'doctor'), asyncHandler(exportPredictionPdf));
router.get('/predictions/:id', auth, roles('user', 'doctor'), asyncHandler(predictionDetail));
router.delete('/predictions/:id', auth, roles('user', 'doctor'), asyncHandler(removePrediction));
router.post('/predictions/bulk-delete', auth, roles('doctor'), asyncHandler(removePredictions));

router.get('/patients', auth, roles('doctor'), asyncHandler(listPatients));
router.get('/patients/code', auth, roles('doctor'), asyncHandler(generatePatientCode));
router.post('/patients', auth, roles('doctor'), asyncHandler(createPatient));
router.get('/patients/:id/predictions', auth, roles('doctor'), asyncHandler(patientPredictionHistory));

router.post('/batches/validate', auth, roles('doctor'), upload.single('file'), asyncHandler(validateBatch));
router.post('/batches/:id/confirm', auth, roles('doctor'), asyncHandler(confirmBatch));
router.get('/batches', auth, roles('doctor'), asyncHandler(listBatches));
router.get('/batches/:id', auth, roles('doctor'), asyncHandler(batchDetail));
router.delete('/batches/:id', auth, roles('doctor'), asyncHandler(deleteBatch));
router.get('/templates/active/download', auth, roles('doctor'), asyncHandler(downloadActiveTemplate));

router.post('/reports/export', auth, roles('doctor'), asyncHandler(exportReport));

router.get('/admin/accounts', auth, roles('admin'), asyncHandler(accounts));
router.patch('/admin/accounts/:id', auth, roles('admin'), asyncHandler(updateAccount));
router.delete('/admin/accounts/:id', auth, roles('admin'), asyncHandler(deleteAccount));
router.get('/admin/templates', auth, roles('admin'), asyncHandler(listTemplates));
router.post('/admin/templates', auth, roles('admin'), upload.single('file'), asyncHandler(uploadTemplate));
router.patch('/admin/templates/:id', auth, roles('admin'), asyncHandler(updateTemplate));
router.get('/admin/logs', auth, roles('admin'), asyncHandler(logs));
router.post('/admin/logs/export', auth, roles('admin'), asyncHandler(exportLogs));
router.get('/logs', auth, roles('admin'), asyncHandler(logs));

export default router;
