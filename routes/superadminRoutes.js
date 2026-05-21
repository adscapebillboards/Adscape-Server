const express = require('express');
const router = express.Router();
const superadminController = require('../controllers/superadminController');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

// Get all superadmins (only superadmin role)
router.get('/superadmins', auth, roleAuth(['superadmin']), superadminController.getAllSuperAdmins);

// Get superadmin profile by ID
router.get('/superadmins/:id', auth, roleAuth(['superadmin']), superadminController.getSuperAdminProfile);

// Create new superadmin (only superadmin role)
router.post('/superadmins', auth, roleAuth(['superadmin']), superadminController.createSuperAdmin);

// Update superadmin profile
router.put('/superadmins/:id', auth, roleAuth(['superadmin']), superadminController.updateSuperAdmin);

// Update superadmin password
router.put('/superadmins/:id/password', auth, superadminController.updateSuperAdminPassword);

// Delete superadmin (soft delete)
router.delete('/superadmins/:id', auth, roleAuth(['superadmin']), superadminController.deleteSuperAdmin);

// Reactivate superadmin
router.put('/superadmins/:id/reactivate', auth, roleAuth(['superadmin']), superadminController.reactivateSuperAdmin);

// Get current user profile (for settings page)
router.get('/profile', auth, superadminController.getCurrentUserProfile);

// Update current user profile
router.put('/profile', auth, superadminController.updateCurrentUserProfile);

// Global developer mode toggle (developer role only)
router.get('/superadmin-settings/developer-mode', auth, roleAuth(['developer']), superadminController.getDeveloperMode);
router.put('/superadmin-settings/developer-mode', auth, roleAuth(['developer']), superadminController.updateDeveloperMode);

// Global test mode toggle (developer role only for modifications, any auth for read)
router.get('/superadmin-settings/test-mode', auth, superadminController.getTestMode);
router.put('/superadmin-settings/test-mode', auth, roleAuth(['developer']), superadminController.updateTestMode);

// Clear campaigns and generated slots
router.delete('/superadmin-settings/clear-campaigns-slots', auth, roleAuth(['developer']), superadminController.clearCampaignsAndSlots);

module.exports = router;



































