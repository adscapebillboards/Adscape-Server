const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const prisma = require('../db/db');
const logger = require('../config/logger');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Initialize Google OAuth client
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Verify Google OAuth token
async function verifyGoogleToken(token) {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      emailVerified: payload.email_verified
    };
  } catch (error) {
    console.error('Google token verification failed:', error);
    throw new Error('Invalid Google token');
  }
}

// Google OAuth Publisher Registration
router.post('/google/signup', async (req, res) => {
  const { googleToken } = req.body;

  console.log('Google Publisher Signup Request:', { googleToken: googleToken ? 'Present' : 'Missing' });

  if (!googleToken) {
    return res.status(400).json({ error: 'Google token is required' });
  }

  if (!GOOGLE_CLIENT_ID) {
    console.error('GOOGLE_CLIENT_ID not configured');
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }

  try {
    // Verify Google token
    const googleUser = await verifyGoogleToken(googleToken);
    console.log('Google User Verified:', { email: googleUser.email, name: googleUser.name });
    
    // Check if publisher already exists
    const existingPublisher = await prisma.publisher.findUnique({
      where: { email: googleUser.email }
    });

    if (existingPublisher) {
      return res.status(400).json({ error: 'Publisher already exists. Please sign in instead.' });
    }

    // Check if there's a pending registration for this email
    const existingRegistration = await prisma.registration.findFirst({
      where: {
        personalInfo: {
          path: ['email'],
          equals: googleUser.email
        }
      },
      orderBy: {
        submittedAt: 'desc'
      }
    });

    if (existingRegistration) {
      if (existingRegistration.status === 'PENDING') {
        return res.status(400).json({ 
          error: 'Registration already pending', 
          registrationId: existingRegistration.id,
          status: 'PENDING'
        });
      } else if (existingRegistration.status === 'APPROVED') {
        return res.status(400).json({ error: 'Registration already approved. Please sign in instead.' });
      } else if (existingRegistration.status === 'REJECTED') {
        return res.status(400).json({ 
          error: 'Registration was rejected', 
          rejectionReason: existingRegistration.rejectionReason 
        });
      }
    }

    // Create a new registration with Google OAuth data
    const personalInfo = {
      firstName: googleUser.name.split(' ')[0] || '',
      lastName: googleUser.name.split(' ').slice(1).join(' ') || '',
      email: googleUser.email,
      phone: '' // Will be filled later
    };

    const businessInfo = {
      companyName: '', // Will be filled later
      businessType: '', // Will be filled later
      address: '', // Will be filled later
      city: '', // Will be filled later
      state: '', // Will be filled later
      pincode: '' // Will be filled later
    };

    const registration = await prisma.registration.create({
      data: {
        personalInfo: personalInfo,
        businessInfo: businessInfo,
        documents: {}, // Empty for OAuth users
        password: null, // No password for OAuth users
        status: 'PENDING',
        googleId: googleUser.googleId,
        googlePicture: googleUser.picture
      }
    });

    // Create notification: new OAuth registration submitted (superadmin)
    try {
      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (recipient_role, type, title, message, entity_type, entity_id) VALUES ('superadmin', $1, $2, $3, $4, $5)",
        'REGISTRATION_SUBMITTED',
        'New OAuth publisher registration',
        `${googleUser.name} submitted a registration via Google OAuth`,
        'registration',
        String(registration.id)
      );
    } catch (e) {
      console.warn('Failed to create OAuth registration submit notification:', e.message);
    }

    console.log('OAuth Registration created successfully:', { id: registration.id, email: googleUser.email });
    res.status(201).json({
      id: registration.id,
      message: 'Registration submitted successfully via Google OAuth. Please wait for admin approval.',
      status: 'PENDING',
      requiresApproval: true
    });

  } catch (error) {
    console.error('Google Publisher Signup Error:', error);
    res.status(500).json({ error: 'Google publisher signup failed: ' + error.message });
  }
});

// Google OAuth Publisher Login
router.post('/google/login', async (req, res) => {
  const { googleToken } = req.body;

  console.log('Google Publisher Login Request:', { googleToken: googleToken ? 'Present' : 'Missing' });

  if (!googleToken) {
    return res.status(400).json({ error: 'Google token is required' });
  }

  if (!GOOGLE_CLIENT_ID) {
    console.error('GOOGLE_CLIENT_ID not configured');
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }

  try {
    // Verify Google token
    const googleUser = await verifyGoogleToken(googleToken);
    console.log('Google User Verified:', { email: googleUser.email, name: googleUser.name });
    
    // Find existing publisher
    const publisher = await prisma.publisher.findUnique({
      where: { email: googleUser.email }
    });

    if (!publisher) {
      // Check if there's a pending registration
      const pendingRegistration = await prisma.registration.findFirst({
        where: {
          personalInfo: {
            path: ['email'],
            equals: googleUser.email
          },
          status: 'PENDING'
        },
        orderBy: {
          submittedAt: 'desc'
        }
      });

      if (pendingRegistration) {
        return res.status(400).json({ 
          error: 'Account pending approval', 
          registrationId: pendingRegistration.id,
          status: 'PENDING',
          requiresApproval: true
        });
      }

      return res.status(400).json({ error: 'Publisher not found. Please sign up first.' });
    }

    // Allow partner role to bypass active check (partners are managed separately)
    if ((publisher.role || 'publisher') !== 'partner') {
      if (publisher.status !== 'active') {
        return res.status(403).json({ 
          error: 'Account not approved', 
          status: publisher.status || 'pending',
          message: 'Your account is pending approval. Please wait for admin approval before logging in.',
          requiresApproval: true,
          email: publisher.email
        });
      }
    }

    // Update publisher's Google ID if not set
    if (!publisher.googleId) {
      await prisma.publisher.update({
        where: { id: publisher.id },
        data: { googleId: googleUser.googleId }
      });
    }

    const role = publisher.role || 'publisher';
    let partnerRow = null;
    if (role === 'partner') {
      try {
        const partners = await prisma.$queryRaw`SELECT * FROM partners WHERE LOWER(email) = LOWER(${publisher.email}) LIMIT 1`;
        partnerRow = Array.isArray(partners) && partners.length > 0 ? partners[0] : null;
      } catch (e) {
        console.warn('Failed to fetch partner row for login', e);
      }
    }
    const token = jwt.sign({ id: publisher.id, email: publisher.email, role }, JWT_SECRET, { expiresIn: '30d' });
    
    console.log('Publisher logged in successfully:', { id: publisher.id, email: publisher.email });
    res.json({ 
      token, 
      user: { 
        id: publisher.id, 
        email: publisher.email, 
        name: publisher.name,
        phone: publisher.phone,
        location: publisher.location,
        role
      },
      partner: partnerRow ? {
        id: partnerRow.id,
        email: partnerRow.email,
        name: partnerRow.name,
        logo_url: partnerRow.logo_url,
        permissions: (() => { try { return JSON.parse(partnerRow.permissions_json || '[]'); } catch { return []; } })(),
        status: partnerRow.status
      } : undefined
    });
  } catch (error) {
    console.error('Google Publisher Login Error:', error);
    res.status(500).json({ error: 'Google publisher login failed: ' + error.message });
  }
});

// OAuth Publisher Profile Completion
router.post('/oauth/complete-profile', async (req, res) => {
  // Handle FormData parsing
  let personalInfo, businessInfo, documents, oauthData;
  
  // Handle JSON data (simplified approach)
  ({ personalInfo, businessInfo, documents, oauthData } = req.body);

  console.log('OAuth Publisher Complete Profile Request:', { 
    email: personalInfo?.email, 
    companyName: businessInfo?.companyName,
    oauthData: oauthData ? 'Present' : 'Missing'
  });

  if (!personalInfo || !businessInfo || !oauthData) {
    return res.status(400).json({ error: 'Personal info, business info, and OAuth data are required' });
  }

  try {
    // Check if publisher already exists by email or googleId
    const existingPublisher = await prisma.publisher.findFirst({
      where: {
        OR: [
          { email: personalInfo.email },
          { googleId: oauthData.googleId }
        ]
      }
    });

    if (existingPublisher) {
      // If publisher exists, check if they're trying to complete profile again
      if (existingPublisher.email === personalInfo.email && existingPublisher.googleId === oauthData.googleId) {
        return res.status(400).json({ error: 'Publisher already exists. Please sign in instead.' });
      }
      // If email matches but googleId doesn't, or vice versa
      return res.status(400).json({ error: 'An account with this email or Google account already exists. Please sign in instead.' });
    }

    // Hash the password (only if provided - OAuth users may not have a password)
    // For OAuth users without password, use empty string (Prisma schema requires non-null String)
    const hashedPassword = personalInfo.password && personalInfo.password.trim() !== ''
      ? await bcrypt.hash(personalInfo.password, 10)
      : '';

    // Create new publisher with OAuth data
    // Use upsert to handle potential race conditions
    let publisher;
    try {
      publisher = await prisma.publisher.create({
        data: {
          name: `${personalInfo.firstName} ${personalInfo.lastName}`,
          email: personalInfo.email,
          phone: personalInfo.phone,
          password: hashedPassword,
          googleId: oauthData.googleId,
          companyName: businessInfo.companyName,
          businessType: businessInfo.businessType,
          address: businessInfo.address,
          city: businessInfo.city,
          state: businessInfo.state,
          pincode: businessInfo.pincode,
          website: businessInfo.website,
          businessInfo: {
            documents: documents
          },
          joinDate: new Date(),
          status: 'pending', // Set status as pending for approval
          totalBillboards: 0,
          revenue: '0',
          role: 'publisher'
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          companyName: true,
          businessType: true,
          city: true,
          state: true,
          joinDate: true,
          status: true,
          totalBillboards: true,
          revenue: true,
          role: true
        }
      });
    } catch (createError) {
      // Handle unique constraint errors
      if (createError.code === 'P2002') {
        // Check again if publisher was created by another request (race condition)
        const raceConditionCheck = await prisma.publisher.findFirst({
          where: {
            OR: [
              { email: personalInfo.email },
              { googleId: oauthData.googleId }
            ]
          }
        });
        
        if (raceConditionCheck) {
          return res.status(400).json({ error: 'Publisher already exists. Please sign in instead.' });
        }
        
        // If it's an ID conflict, this is a database sequence issue
        console.error('Database sequence issue - ID conflict:', createError);
        return res.status(500).json({ error: 'Database error. Please try again or contact support.' });
      }
      // Re-throw other errors
      throw createError;
    }

    // Create publisher metric entry
    await prisma.publisherMetric.create({
      data: {
        publisherId: publisher.id,
        totalBillboards: 0,
        totalBookings: 0,
        totalRevenue: 0,
        joinDate: new Date(),
        status: 'pending'
      }
    });

    // Create notification for superadmin
    try {
      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (recipient_role, type, title, message, entity_type, entity_id) VALUES ('superadmin', $1, $2, $3, $4, $5)",
        'PUBLISHER_REGISTRATION',
        'New Publisher Registration',
        `${publisher.name} (${publisher.email}) has completed their OAuth registration and is pending approval`,
        'publisher',
        String(publisher.id)
      );
    } catch (e) {
      console.warn('Failed to create publisher registration notification:', e.message);
    }

    console.log('OAuth publisher created successfully:', { id: publisher.id, email: publisher.email });
    res.json({ 
      message: 'Publisher profile completed successfully. Your account is pending approval.',
      publisher 
    });
  } catch (error) {
    console.error('OAuth Publisher Complete Profile Error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      const target = error.meta?.target || [];
      if (target.includes('email')) {
        return res.status(400).json({ error: 'An account with this email already exists. Please sign in instead.' });
      }
      if (target.includes('googleId')) {
        return res.status(400).json({ error: 'This Google account is already registered. Please sign in instead.' });
      }
      if (target.includes('id')) {
        // Database sequence issue - check if publisher was actually created
        const checkPublisher = await prisma.publisher.findFirst({
          where: {
            OR: [
              { email: personalInfo?.email },
              { googleId: oauthData?.googleId }
            ]
          }
        });
        
        if (checkPublisher) {
          return res.status(400).json({ error: 'Publisher already exists. Please sign in instead.' });
        }
        
        console.error('Database sequence sync issue detected. Publisher ID conflict.');
        return res.status(500).json({ 
          error: 'A database error occurred. Please try again in a moment. If the problem persists, contact support.' 
        });
      }
    }
    
    // Handle other errors
    const errorMessage = error.message || 'Unknown error occurred';
    res.status(500).json({ error: `Failed to complete publisher profile: ${errorMessage}` });
  }
});

// Get publisher status by email
router.get('/status/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const publisher = await prisma.publisher.findUnique({
      where: { email: decodeURIComponent(email) },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        joinDate: true
      }
    });

    if (!publisher) {
      return res.status(404).json({ 
        error: 'Publisher not found',
        status: 'UNKNOWN'
      });
    }

    // Map publisher status to expected format
    let mappedStatus = 'UNKNOWN';
    switch (publisher.status?.toLowerCase()) {
      case 'pending':
        mappedStatus = 'PENDING';
        break;
      case 'active':
      case 'approved':
        mappedStatus = 'APPROVED';
        break;
      case 'rejected':
      case 'inactive':
        mappedStatus = 'REJECTED';
        break;
      default:
        mappedStatus = 'UNKNOWN';
    }

    res.json({
      status: mappedStatus,
      publisher: {
        id: publisher.id,
        email: publisher.email,
        name: publisher.name,
        joinDate: publisher.joinDate
      }
    });
  } catch (error) {
    console.error('Error checking publisher status:', error);
    res.status(500).json({ error: 'Failed to check publisher status' });
  }
});

// GET all publishers with complete information
router.get('/', auth, async (req, res) => {
  try {
    const publishers = await prisma.publisher.findMany({
      where: { NOT: { role: 'partner' } },
      orderBy: { id: 'desc' }
    });

    // Format the data for the frontend
    const formattedPublishers = publishers.map(publisher => ({
      id: publisher.id,
      name: publisher.name || 'Unknown',
      email: publisher.email,
      phone: publisher.phone || 'Not provided',
      location: publisher.location || 'Not provided',
      totalBillboards: publisher.totalBillboards || 0,
      revenue: publisher.revenue || '₹0',
      status: publisher.status === 'active' ? 'Active' : publisher.status === 'inactive' ? 'Inactive' : 'Pending',
      joinDate: publisher.joinDate ? new Date(publisher.joinDate).toLocaleDateString() : 'Unknown',
      address: publisher.address,
      businessType: publisher.businessType,
      city: publisher.city,
      companyName: publisher.companyName,
      pincode: publisher.pincode,
      state: publisher.state,
      website: publisher.website,
      role: publisher.role
    }));
    
    logger.info('Publishers fetched', `Count: ${formattedPublishers.length}`);
    res.json({ publishers: formattedPublishers });
  } catch (error) {
    logger.error('Error fetching publishers:', error);
    res.status(500).json({ error: 'Failed to fetch publishers' });
  }
});

// GET publisher by ID with detailed information
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const publisher = await prisma.publisher.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!publisher) {
      return res.status(404).json({ error: 'Publisher not found' });
    }

    // Get publisher's billboards
    const billboards = await prisma.billboard.findMany({
      where: { userId: publisher.email },
      orderBy: { createdAt: 'desc' }
    });

    // Get publisher's campaigns (for payment history)
    const campaigns = await prisma.campaign.findMany({
      where: { userName: publisher.email },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Extract payment information from campaigns
    const payments = campaigns.map(campaign => ({
      id: campaign.id,
      name: `${campaign.campaignName || 'Campaign'} - ${new Date(campaign.createdAt).toLocaleDateString()}`,
      date: new Date(campaign.createdAt).toLocaleDateString(),
      amount: campaign.totalAmount || '0',
      status: campaign.status,
      billboardCount: Array.isArray(campaign.billboards) ? campaign.billboards.length : 0
    }));

    // Format billboards data
    const formattedBillboards = billboards.map(billboard => ({
      id: billboard.id,
      name: billboard.name || 'Unnamed Billboard',
      location: billboard.location || 'Location not specified',
      type: billboard.type || 'Unknown',
      status: billboard.status || 'Unknown',
      pricePerDay: billboard.pricePerDay || 0,
      width: billboard.width || billboard.size_width || 0,
      height: billboard.height || billboard.size_height || 0,
      latitude: billboard.latitude,
      longitude: billboard.longitude,
      createdAt: billboard.createdAt
    }));

    // Format publisher data
    const publisherDetails = {
      id: publisher.id,
      name: publisher.name || 'Unknown',
      email: publisher.email,
      phone: publisher.phone || 'Not provided',
      location: publisher.location || 'Not provided',
      totalBillboards: publisher.totalBillboards || billboards.length,
      revenue: publisher.revenue || '₹0',
      status: publisher.status === 'active' ? 'Active' : publisher.status === 'inactive' ? 'Inactive' : 'Pending',
      joinDate: publisher.joinDate ? new Date(publisher.joinDate).toLocaleDateString() : 'Unknown',
      address: publisher.address,
      businessType: publisher.businessType,
      city: publisher.city,
      companyName: publisher.companyName,
      pincode: publisher.pincode,
      state: publisher.state,
      website: publisher.website,
      role: publisher.role,
      billboards: formattedBillboards,
      payments: payments
    };
    
    logger.info('Publisher details fetched', `Publisher ID: ${id}, Billboards: ${billboards.length}, Payments: ${payments.length}`);
    res.json({ publisher: publisherDetails });
  } catch (error) {
    logger.error('Error fetching publisher:', error);
    res.status(500).json({ error: 'Failed to fetch publisher' });
  }
});

// POST new publisher
router.post('/', auth, roleAuth(['superadmin']), async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      location,
      revenue,
      totalBillboards,
      status,
      password,
      address,
      businessType,
      city,
      companyName,
      pincode,
      state,
      website
    } = req.body;

    const publisher = await prisma.publisher.create({
      data: {
        name,
        email,
        phone,
        location,
        revenue,
        totalBillboards: totalBillboards ? parseInt(totalBillboards) : 0,
        status: status || 'active',
        password: password || '',
        address,
        businessType,
        city,
        companyName,
        pincode,
        state,
        website,
        joinDate: new Date()
      }
    });

    res.json({ publisher });
  } catch (error) {
    console.error('Error creating publisher:', error);
    res.status(500).json({ error: 'Failed to create publisher' });
  }
});

// PUT update publisher
router.put('/:id', auth, roleAuth(['superadmin']), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.password;
    
    const publisher = await prisma.publisher.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({ publisher });
  } catch (error) {
    console.error('Error updating publisher:', error);
    res.status(500).json({ error: 'Failed to update publisher' });
  }
});

// DELETE publisher (soft delete by setting status to inactive)
router.delete('/:id', auth, roleAuth(['superadmin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const publisher = await prisma.publisher.update({
      where: { id: parseInt(id) },
      data: { status: 'inactive' }
    });

    res.json({ message: 'Publisher deactivated successfully', publisher });
  } catch (error) {
    console.error('Error deactivating publisher:', error);
    res.status(500).json({ error: 'Failed to deactivate publisher' });
  }
});

module.exports = router;










