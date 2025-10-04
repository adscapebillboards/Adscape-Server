const prisma = require('../db/db');
const logger = require('../config/logger');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Get all superadmins (only accessible by superadmin role)
exports.getAllSuperAdmins = async (req, res) => {
  try {
    const superadmins = await prisma.superAdmin.findMany({
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
    const superadmin = await prisma.superAdmin.findUnique({
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

  // Validate required fields
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Email, password, and full name are required' });
  }

  // Validate role (only superadmin can create managers/support)
  if (role === 'superadmin') {
    return res.status(403).json({ error: 'Cannot create superadmin accounts' });
  }

  try {
    // Check if email already exists
    const existingUser = await prisma.superAdmin.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create superadmin
    const superadmin = await prisma.superAdmin.create({
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
    const existingSuperadmin = await prisma.superAdmin.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingSuperadmin) {
      return res.status(404).json({ error: 'Superadmin not found' });
    }

    // Prevent role change to superadmin
    if (role === 'superadmin') {
      return res.status(403).json({ error: 'Cannot change role to superadmin' });
    }

    // Update superadmin
    const updatedSuperadmin = await prisma.superAdmin.update({
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
    const superadmin = await prisma.superAdmin.findUnique({
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
    await prisma.superAdmin.update({
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
    const superadmin = await prisma.superAdmin.findUnique({
      where: { id: parseInt(id) }
    });

    if (!superadmin) {
      return res.status(404).json({ error: 'Superadmin not found' });
    }

    // Prevent deletion of superadmin role
    if (superadmin.role === 'superadmin') {
      return res.status(403).json({ error: 'Cannot delete superadmin accounts' });
    }

    // Soft delete by setting status to inactive
    await prisma.superAdmin.update({
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
    const superadmin = await prisma.superAdmin.findUnique({
      where: { id: parseInt(id) }
    });

    if (!superadmin) {
      return res.status(404).json({ error: 'Superadmin not found' });
    }

    await prisma.superAdmin.update({
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
    const superadmin = await prisma.superAdmin.findUnique({
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
    const updatedProfile = await prisma.superAdmin.update({
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



































