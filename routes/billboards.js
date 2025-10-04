const express = require('express');
const router = express.Router();
const billboardController = require('../controllers/billboardController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

const controller = require('../controllers/billboardController');

// GET all and by ID - with role-based filtering
router.get('/', auth, controller.getAllBillboards);
router.get('/approved', controller.getApprovedBillboards); // Only approved billboards, now public
router.get('/pending', auth, roleAuth(['superadmin']), controller.getPendingBillboards); // Pending billboards (superadmin only)
router.get('/user', auth, controller.getUserBillboards);
router.get('/s', controller.getStatesFromBillboards);
router.get('/states', controller.getStatesWithApprovedBillboards);
router.get('/city', controller.getCitiesByState);

// Search billboards with fuzzy search (MUST come before /:id route)
router.get('/search', controller.searchBillboards);

// Get billboard by ID (MUST come after specific routes)
router.get('/:id', controller.getBillboardById); // Now public

// Get recent bookings for a specific billboard
router.get('/:id/bookings', auth, controller.getBillboardBookings);

// Get owner details for a specific billboard
router.get('/:id/owner', auth, controller.getBillboardOwner);

// POST new billboard with multiple image uploads
router.post('/', auth, upload.array('images'), controller.addBillboard);

// UPDATE billboard (optional: also support image uploads if needed)
router.put('/:id', auth, controller.updateBillboard);

// DELETE billboard
router.delete('/:id', auth, controller.deleteBillboard);

// Billboard approval/rejection (superadmin only)
router.put('/:id/approve', auth, roleAuth(['superadmin']), controller.approveBillboard);
router.put('/:id/reject', auth, roleAuth(['superadmin']), controller.rejectBillboard);
router.put('/:id/resubmit', auth, controller.resubmitBillboard);

module.exports = router;
