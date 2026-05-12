const prisma = require('../db/db');
const logger = require('../config/logger');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDeveloperMode, setDeveloperMode } = require('../utils/developerMode');
const { generateAvailabilityForAllBillboards } = require('./availabilityController');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Get all superadmins (only accessible by superadmin role)
exports.getAllSuperAdmins = async (req, res) => {
  try {
    const MASTER_DEVELOPER_EMAIL = 'srinnivassh@gmail.com';
    if (req.user.email !== MASTER_DEVELOPER_EMAIL) {
      return res.status(403).json({ error: 'Unauthorized. Only the Master Developer can manage accounts.' });
    }

    const superadmins = await prisma.publisher.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        status: true,
        permissions: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.info('Superadmins fetched successfully');
    res.json({ superadmins });
  } catch (error) {
    logger.error('Error fetching superadmins:', error);
    res.status(500).json({ error: 'Failed to fetch superadmins' });
  }
};

// Get superadmin profile by ID
exports.getSuperAdminProfile = async (req, res) => {
  const { id } = req.params;

  try {
    const superadmin = await prisma.publisher.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        status: true,
        permissions: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!superadmin) {
      return res.status(404).json({ error: 'Superadmin not found' });
    }

    logger.info('Superadmin profile fetched successfully', { id });
    res.json({ superadmin });
  } catch (error) {
    logger.error('Error fetching superadmin profile:', error);
    res.status(500).json({ error: 'Failed to fetch superadmin profile' });
  }
};

// Create new superadmin (manager/support role)
exports.createSuperAdmin = async (req, res) => {
  const { email, password, fullName, phoneNumber, role = 'manager', permissions = {} } = req.body;

  const MASTER_DEVELOPER_EMAIL = 'srinnivassh@gmail.com';
  const currentUser = req.user;

  // Validate required fields
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Email, password, and full name are required' });
  }

  // Role creation restrictions
  const isMasterDeveloper = currentUser?.email === MASTER_DEVELOPER_EMAIL;
  
  if (!isMasterDeveloper) {
    if (role === 'superadmin' || role === 'developer') {
      return res.status(403).json({ error: 'Only the Master Developer can create superadmin or developer accounts' });
    }
  }

  try {
    // Check if email already exists
    const existingUser = await prisma.publisher.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create superadmin
    const superadmin = await prisma.publisher.create({
      data: {
        email,
        password: hashedPassword,
        fullName,
        phoneNumber,
        role,
        permissions,
        status: 'active'
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        status: true,
        permissions: true,
        createdAt: true
      }
    });

    logger.user('Superadmin created successfully', { email, role });
    res.status(201).json({ 
      message: 'Superadmin created successfully', 
      superadmin 
    });
  } catch (error) {
    logger.error('Error creating superadmin:', error);
    res.status(500).json({ error: 'Failed to create superadmin' });
  }
};

// Update superadmin profile
exports.updateSuperAdmin = async (req, res) => {
  const { id } = req.params;
  const { fullName, phoneNumber, role, status, permissions } = req.body;

  try {
    // Check if superadmin exists
    const existingSuperadmin = await prisma.publisher.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingSuperadmin) {
      return res.status(404).json({ error: 'Superadmin not found' });
    }

    // Prevent role change to superadmin/developer for non-master
    const MASTER_DEVELOPER_EMAIL = 'srinnivassh@gmail.com';
    const isMasterDeveloper = req.user?.email === MASTER_DEVELOPER_EMAIL;

    if (!isMasterDeveloper && (role === 'superadmin' || role === 'developer' || existingSuperadmin.role === 'superadmin' || existingSuperadmin.role === 'developer')) {
      return res.status(403).json({ error: 'Only the Master Developer can modify superadmin or developer accounts' });
    }

    // Update superadmin
    const updatedSuperadmin = await prisma.publisher.update({
      where: { id: parseInt(id) },
      data: {
        fullName,
        phoneNumber,
        role,
        status,
        permissions,
        updatedAt: new Date()
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        status: true,
        permissions: true,
        updatedAt: true
      }
    });

    logger.user('Superadmin updated successfully', { id, email: updatedSuperadmin.email });
    res.json({ 
      message: 'Superadmin updated successfully', 
      superadmin: updatedSuperadmin 
    });
  } catch (error) {
    logger.error('Error updating superadmin:', error);
    res.status(500).json({ error: 'Failed to update superadmin' });
  }
};

// Update superadmin password
exports.updateSuperAdminPassword = async (req, res) => {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  try {
    // Get superadmin with password
    const superadmin = await prisma.publisher.findUnique({
      where: { id: parseInt(id) }
    });

    if (!superadmin) {
      return res.status(404).json({ error: 'Superadmin not found' });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, superadmin.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.publisher.update({
      where: { id: parseInt(id) },
      data: {
        password: hashedNewPassword,
        updatedAt: new Date()
      }
    });

    logger.user('Superadmin password updated successfully', { id });
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Error updating superadmin password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
};

// Delete superadmin (soft delete by setting status to inactive)
exports.deleteSuperAdmin = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if superadmin exists
    const superadmin = await prisma.publisher.findUnique({
      where: { id: parseInt(id) }
    });

    if (!superadmin) {
      return res.status(404).json({ error: 'Superadmin not found' });
    }

    // Prevent deletion of superadmin/developer by non-master
    const MASTER_DEVELOPER_EMAIL = 'srinnivassh@gmail.com';
    const isMasterDeveloper = req.user?.email === MASTER_DEVELOPER_EMAIL;

    if (superadmin.role === 'superadmin' || superadmin.role === 'developer') {
      if (!isMasterDeveloper) {
        return res.status(403).json({ error: 'Only the Master Developer can delete superadmin or developer accounts' });
      }
    }

    // Soft delete by setting status to inactive
    await prisma.publisher.update({
      where: { id: parseInt(id) },
      data: {
        status: 'inactive',
        updatedAt: new Date()
      }
    });

    logger.user('Superadmin deleted successfully', { id, email: superadmin.email });
    res.json({ message: 'Superadmin deleted successfully' });
  } catch (error) {
    logger.error('Error deleting superadmin:', error);
    res.status(500).json({ error: 'Failed to delete superadmin' });
  }
};

// Reactivate superadmin
exports.reactivateSuperAdmin = async (req, res) => {
  const { id } = req.params;

  try {
    const superadmin = await prisma.publisher.findUnique({
      where: { id: parseInt(id) }
    });

    if (!superadmin) {
      return res.status(404).json({ error: 'Superadmin not found' });
    }

    await prisma.publisher.update({
      where: { id: parseInt(id) },
      data: {
        status: 'active',
        updatedAt: new Date()
      }
    });

    logger.user('Superadmin reactivated successfully', { id, email: superadmin.email });
    res.json({ message: 'Superadmin reactivated successfully' });
  } catch (error) {
    logger.error('Error reactivating superadmin:', error);
    res.status(500).json({ error: 'Failed to reactivate superadmin' });
  }
};

// Get current user profile (for settings page)
exports.getCurrentUserProfile = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    const superadmin = await prisma.publisher.findUnique({
      where: { id: parseInt(userId) },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        status: true,
        permissions: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!superadmin) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json({ profile: superadmin });
  } catch (error) {
    logger.error('Error fetching current user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

// Update current user profile
exports.updateCurrentUserProfile = async (req, res) => {
  const userId = req.user?.id;
  const { fullName, phoneNumber } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    const updatedProfile = await prisma.publisher.update({
      where: { id: parseInt(userId) },
      data: {
        fullName,
        phoneNumber,
        updatedAt: new Date()
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        status: true,
        permissions: true,
        updatedAt: true
      }
    });

    logger.user('User profile updated successfully', { id: userId });
    res.json({ 
      message: 'Profile updated successfully', 
      profile: updatedProfile 
    });
  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

exports.getDeveloperMode = async (req, res) => {
  try {
    const enabled = await getDeveloperMode();
    res.json({ developerMode: enabled });
  } catch (error) {
    logger.error('Error fetching developer mode:', error);
    res.status(500).json({ error: 'Failed to fetch developer mode' });
  }
};

exports.updateDeveloperMode = async (req, res) => {
  try {
    const enabled = Boolean(req.body?.developerMode);
    await setDeveloperMode(enabled);

    logger.user('Developer mode updated', {
      actorId: req.user?.id,
      developerMode: enabled
    });

    res.json({
      message: 'Developer mode updated successfully',
      developerMode: enabled
    });
  } catch (error) {
    logger.error('Error updating developer mode:', error);
    res.status(500).json({ error: 'Failed to update developer mode' });
  }
};

exports.clearCampaignsAndSlots = async (req, res) => {
  try {
    const MASTER_DEVELOPER_EMAIL = 'srinnivassh@gmail.com';
    const isMasterDeveloper = req.user?.email === MASTER_DEVELOPER_EMAIL;

    // Additional restriction: maybe only Master Developer or explicit developer role.
    if (!isMasterDeveloper && req.user?.role !== 'developer') {
      return res.status(403).json({ error: 'Unauthorized to perform system reset' });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete generated slots and asset play logs
      await tx.generatedSlot.deleteMany();
      await tx.assetPlayLog.deleteMany();
      await tx.assetPlay.deleteMany();
      
      // 2. Delete daily schedules and slots
      await tx.dailySlot.deleteMany();
      await tx.dailySchedule.deleteMany();
      
      // 3. Delete billboard bookings
      await tx.billboard_bookings.deleteMany();
      
      // 4. Delete campaigns
      await tx.campaign.deleteMany();

      // 5. Delete billboard availability details (to cleanly rebuild them)
      await tx.billboardAvailability.deleteMany();
      await tx.slot_availability.deleteMany();
    });

    // 6. Regenerate availability for all billboards using the central controller
    // This will rebuild `billboardAvailability`, `slot_availability`, and `billboard.slotAvailability` JSON
    try {
      await generateAvailabilityForAllBillboards(3); // Reset for 3 months
      logger.info('Billboard slot availability regenerated successfully.');
    } catch (availabilityErr) {
      logger.error('Error regenerating billboard availability during reset:', availabilityErr);
    }

    // 7. Push new empty playlist to all connected Android players
    try {
      const io = req.app.get('io');
      if (io) {
        const { getPlaylistForScreen } = require('../utils/socketHelpers');
        const billboards = await prisma.billboard.findMany({ select: { screen_id: true } });
        for (const bb of billboards) {
          if (bb.screen_id) {
            const { playlist, assets, date } = await getPlaylistForScreen(bb.screen_id);
            io.to(`screen:${bb.screen_id}`).emit('playlist', { screenId: bb.screen_id, playlist, date });
            io.to(`screen:${bb.screen_id}`).emit('assets', { screenId: bb.screen_id, assets });
          }
        }
        logger.info('Broadcasted new playlist to all connected screens.');
      }
    } catch (socketErr) {
      logger.error('Error broadcasting playlist reset to screens:', socketErr);
    }

    logger.info('System reset: all campaigns and slots cleared', { user: req.user?.email });
    res.json({ message: 'All campaigns and slots have been cleared successfully.' });
  } catch (error) {
    logger.error('Error clearing campaigns and slots:', error);
    res.status(500).json({ error: 'Failed to clear campaigns and slots' });
  }
};



































