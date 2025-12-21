const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const streamifier = require('streamifier');
const cloudinary = require('../config/cloudinary');
const prisma = require('../db/db');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const { createPublisherMetricEntry } = require('../controllers/publisherMetricController');
const EmailService = require('../services/emailService');
const router = express.Router();

// Configure multer for file uploads - use memory storage for serverless compatibility
const upload = multer({ 
  storage: multer.memoryStorage(), // Use memory storage instead of disk storage for serverless
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, JPG, and PNG files are allowed!'));
    }
  }
});

// Create registration (no auth required) - only businessLicense is required
router.post('/', upload.fields([
  { name: 'documents[businessLicense]', maxCount: 1 }
]), async (req, res) => {
  try {
    const { personalInfo, businessInfo, oauthData } = req.body;
    
    // Process uploaded files and upload to Cloudinary
    const documents = {};
    if (req.files) {
      for (const key of Object.keys(req.files)) {
        const fieldName = key.replace('documents[', '').replace(']', '');
        const file = req.files[key][0];
        
        try {
          // Upload to Cloudinary using streamifier (for memory storage)
          const uploadPromise = new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'billboard-registrations',
                resource_type: 'auto',
                transformation: [
                  { quality: 'auto:good' },
                  { fetch_format: 'auto' }
                ]
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            streamifier.createReadStream(file.buffer).pipe(uploadStream);
          });
          
          const result = await uploadPromise;
          documents[fieldName] = result.secure_url;
        } catch (uploadError) {
          console.error(`Error uploading ${fieldName} to Cloudinary:`, uploadError);
          throw new Error(`Failed to upload ${fieldName}: ${uploadError.message}`);
        }
      }
    }

    // Validate required fields
    if (!personalInfo || !businessInfo) {
      return res.status(400).json({ error: 'Personal and business information are required' });
    }

    // Parse JSON strings if they come as strings
    const personalInfoObj = typeof personalInfo === 'string' ? JSON.parse(personalInfo) : personalInfo;
    const businessInfoObj = typeof businessInfo === 'string' ? JSON.parse(businessInfo) : businessInfo;
    const oauthDataObj = oauthData ? (typeof oauthData === 'string' ? JSON.parse(oauthData) : oauthData) : null;

    // Validate required personal info
    const requiredPersonalFields = ['firstName', 'lastName', 'email', 'phone'];
    for (const field of requiredPersonalFields) {
      if (!personalInfoObj[field]) {
        return res.status(400).json({ error: `Missing required personal info: ${field}` });
      }
    }

    // Validate required business info
    const requiredBusinessFields = ['companyName', 'businessType', 'address', 'city', 'state', 'pincode'];
    for (const field of requiredBusinessFields) {
      if (!businessInfoObj[field]) {
        return res.status(400).json({ error: `Missing required business info: ${field}` });
      }
    }

    // Validate required documents - only businessLicense is required
    if (!documents.businessLicense) {
      return res.status(400).json({ error: 'Missing required document: businessLicense' });
    }

    // Check if email already exists in registrations or users
    const existingRegistration = await prisma.registration.findFirst({
      where: {
        personalInfo: {
          path: ['email'],
          equals: personalInfoObj.email
        }
      }
    });

    const existingUser = await prisma.user.findUnique({
      where: { email: personalInfoObj.email }
    });

    const existingPublisher = await prisma.publisher.findUnique({
      where: { email: personalInfoObj.email }
    });

    if (existingRegistration || existingUser || existingPublisher) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password if provided
    let hashedPassword = null;
    if (personalInfoObj.password) {
      hashedPassword = await bcrypt.hash(personalInfoObj.password, 10);
    }

    // Insert registration
    const result = await prisma.registration.create({
      data: {
        personalInfo: personalInfoObj,
        businessInfo: businessInfoObj,
        documents: documents,
        password: hashedPassword,
        status: 'PENDING',
        googleId: oauthDataObj?.googleId || null,
        googlePicture: oauthDataObj?.googlePicture || null
      }
    });

    // Create notification: new registration submitted (superadmin)
    try {
      const registrationType = oauthDataObj?.isOAuth ? 'OAuth registration' : 'registration';
      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (recipient_role, type, title, message, entity_type, entity_id) VALUES ('superadmin', $1, $2, $3, $4, $5)",
        'REGISTRATION_SUBMITTED',
        `New publisher ${registrationType}`,
        `${personalInfoObj.firstName} ${personalInfoObj.lastName} submitted a ${registrationType}${oauthDataObj?.isOAuth ? ' via Google OAuth' : ''}`,
        'registration',
        String(result.id)
      );
    } catch (e) {
      console.warn('Failed to create registration submit notification:', e.message);
    }

    // Send email notification to superadmin asynchronously
    EmailService.notifyPublisherAccountCreated({
      ...personalInfoObj,
      ...businessInfoObj
    }).catch(emailError => {
      console.error('Error sending publisher account creation email notification:', emailError);
    });

    res.status(201).json({
      id: result.id,
      message: 'Registration submitted successfully'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to submit registration' });
  }
});

// Get all registrations (admin only)
router.get('/', auth, async (req, res) => {
  try {
    // Check if user is superadmin or publisher
    if (req.user?.role !== 'superadmin' && req.user?.role !== 'publisher') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await prisma.registration.findMany({
      orderBy: {
        submittedAt: 'desc'
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

// Get registration by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await prisma.registration.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!result) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching registration:', error);
    res.status(500).json({ error: 'Failed to fetch registration' });
  }
});

// Approve registration
router.put('/:id/approve', auth, async (req, res) => {
  try {
    // Check if user is superadmin (only superadmin can approve registrations)
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get registration
    const registration = await prisma.registration.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    if ((registration.status || '').toUpperCase() !== 'PENDING') {
      return res.status(400).json({ error: 'Registration is not pending' });
    }

    // Update registration status
    await prisma.registration.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'APPROVED' }
    });

    // Create user account
    const personalInfo = registration.personalInfo;
    const businessInfo = registration.businessInfo;

    // Use the stored password or generate a random one
    const password = registration.password || Math.random().toString(36).slice(-8);

    // Create comprehensive publisher account with all business details
    const userResult = await prisma.publisher.create({
      data: {
        email: personalInfo.email,
        password: password, // Password is already hashed if stored
        name: `${personalInfo.firstName} ${personalInfo.lastName}`,
        phone: personalInfo.phone,
        location: `${businessInfo.city}, ${businessInfo.state}`,
        status: 'active',
        joinDate: new Date(),
        totalBillboards: 0, // Start with 0 billboards
        revenue: '₹0', // Start with 0 revenue
        role: 'publisher', // Set role as publisher
        // Store all business information
        companyName: businessInfo.companyName,
        businessType: businessInfo.businessType,
        address: businessInfo.address,
        city: businessInfo.city,
        state: businessInfo.state,
        pincode: businessInfo.pincode,
        website: businessInfo.website || null,
        // Store comprehensive business info as JSON for additional details
        businessInfo: {
          personalInfo: {
            firstName: personalInfo.firstName,
            lastName: personalInfo.lastName
          },
          businessInfo: businessInfo,
          documents: registration.documents,
          registrationId: registration.id,
          approvedAt: new Date().toISOString()
        }
      }
    });

    // Automatically create PublisherMetric entry
    try {
      await createPublisherMetricEntry(userResult.id, {
        totalBillboards: 0,
        joinDate: new Date(),
        status: 'active'
      });
      console.log('PublisherMetric entry created automatically for publisher:', userResult.id);
    } catch (metricError) {
      console.error('Error creating PublisherMetric entry:', metricError);
      // Continue with the response even if metric creation fails
    }

    // Create notifications: to publisher and superadmin
    try {
      await prisma.$executeRawUnsafe(
        'INSERT INTO notifications (recipient_email, recipient_role, type, title, message, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        personalInfo.email,
        'publisher',
        'REGISTRATION_APPROVED',
        'Registration approved',
        'Your registration has been approved and your account created',
        'registration',
        String(registration.id)
      );
      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (recipient_role, type, title, message, entity_type, entity_id) VALUES ('superadmin', $1, $2, $3, $4, $5)",
        'REGISTRATION_APPROVED',
        'Registration approved',
        `${personalInfo.firstName} ${personalInfo.lastName} approved as publisher`,
        'registration',
        String(registration.id)
      );
    } catch (e) {
      console.warn('Failed to create registration approval notifications:', e.message);
    }

    console.log('Publisher created successfully with comprehensive business details:', {
      id: userResult.id,
      email: personalInfo.email,
      name: `${personalInfo.firstName} ${personalInfo.lastName}`,
      phone: personalInfo.phone,
      companyName: businessInfo.companyName,
      businessType: businessInfo.businessType,
      address: businessInfo.address,
      city: businessInfo.city,
      state: businessInfo.state,
      pincode: businessInfo.pincode,
      website: businessInfo.website,
      totalBillboards: 0,
      revenue: '₹0',
      status: 'active',
      role: 'publisher'
    });

    res.json({
      message: 'Registration approved and publisher account created successfully',
      publisher: {
        id: userResult.id,
        email: userResult.email,
        name: userResult.name,
        companyName: userResult.companyName,
        businessType: userResult.businessType,
        phone: userResult.phone,
        location: userResult.location,
        status: userResult.status,
        totalBillboards: userResult.totalBillboards,
        revenue: userResult.revenue,
        role: userResult.role
      }
    });

  } catch (error) {
    console.error('Error approving registration:', error);
    res.status(500).json({ error: 'Failed to approve registration' });
  }
});

// Reject registration
router.put('/:id/reject', auth, async (req, res) => {
  try {
    // Check if user is superadmin
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { rejectionReason } = req.body;

    if (!rejectionReason || rejectionReason.trim() === '') {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    // Get registration
    const registration = await prisma.registration.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    if ((registration.status || '').toUpperCase() !== 'PENDING') {
      return res.status(400).json({ error: 'Registration is not pending' });
    }

    // Update registration status
    await prisma.registration.update({
      where: { id: parseInt(req.params.id) },
      data: { 
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim()
      }
    });

    // Create notifications
    try {
      const personalInfo = registration.personalInfo;
      await prisma.$executeRawUnsafe(
        'INSERT INTO notifications (recipient_email, recipient_role, type, title, message, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        personalInfo.email,
        'publisher',
        'REGISTRATION_REJECTED',
        'Registration rejected',
        `Your registration has been rejected. Reason: ${rejectionReason}`,
        'registration',
        String(registration.id)
      );
      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (recipient_role, type, title, message, entity_type, entity_id) VALUES ('superadmin', $1, $2, $3, $4, $5)",
        'REGISTRATION_REJECTED',
        'Registration rejected',
        `${personalInfo.firstName} ${personalInfo.lastName} registration rejected`,
        'registration',
        String(registration.id)
      );
    } catch (e) {
      console.warn('Failed to create registration rejection notifications:', e.message);
    }

    res.json({ message: 'Registration rejected successfully' });

  } catch (error) {
    console.error('Error rejecting registration:', error);
    res.status(500).json({ error: 'Failed to reject registration' });
  }
});

// Get registration status by email (for login page - no auth required)
router.get('/status/:email', async (req, res) => {
  try {
    const result = await prisma.registration.findFirst({
      where: {
        personalInfo: {
          path: ['email'],
          equals: req.params.email
        }
      },
      orderBy: {
        submittedAt: 'desc'
      }
    });

    if (!result) {
      return res.status(404).json({ error: 'No registration found for this email' });
    }

    res.json({
      id: result.id,
      status: result.status,
      rejectionReason: result.rejectionReason,
      submittedAt: result.submittedAt
    });

  } catch (error) {
    console.error('Error fetching registration status:', error);
    res.status(500).json({ error: 'Failed to fetch registration status' });
  }
});

module.exports = router; 