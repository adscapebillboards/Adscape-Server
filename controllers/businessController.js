const prisma = require('../db/db');
const logger = require('../config/logger');

// Update business profile
const updateBusinessProfile = async (req, res) => {
  logger.info('Request body:', req.body);
  logger.info('User from token:', req.user);
  logger.info('Email from token:', req.body.email);

  const { companyName, registrationNumber, address, gstDocument, panDocument } = req.body;

  try {
    // Upload GST Document
    let gstDocumentUrl = gstDocument;

    // Upload PAN Document
    let panDocumentUrl = panDocument;

    // Update user profile in the database
    await prisma.user.update({
      where: {
        email: req.body.email
      },
      data: {
        companyName,
        registrationNumber,
        address,
        gstDocumentUrl,
        panDocumentUrl
      }
    });

    logger.user('Business profile updated', req.body.email);
    res.json({ message: 'Business profile updated successfully' });
  } catch (err) {
    logger.error('Update Business Profile Error:', err);
    res.status(500).json({ error: 'Failed to update business profile' });
  }
};

// Get business profile
const getBusinessProfile = async (req, res) => {
  try {
    const { id } = req.user;

    const profile = await prisma.user.findUnique({
      where: { id },
      select: {
        companyName: true,
        registrationNumber: true,
        address: true,
        gstDocumentUrl: true,
        panDocumentUrl: true
      }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Business profile not found' });
    }

    const response = {
      companyName: profile.companyName,
      registrationNumber: profile.registrationNumber,
      address: profile.address,
      gstDocument: profile.gstDocumentUrl,
      panDocument: profile.panDocumentUrl,
    };

    logger.user('Business profile fetched', id);
    res.json(response);
  } catch (error) {
    logger.error('Fetch Business Profile Error:', error);
    res.status(500).json({ error: 'Failed to fetch business profile' });
  }
};

module.exports = {
  updateBusinessProfile,
  getBusinessProfile
}; 