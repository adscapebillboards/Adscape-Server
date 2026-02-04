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
let GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
let GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
let GOOGLE_CLIENT_ID_ANDROID = process.env.GOOGLE_CLIENT_ID_ANDROID;

// Trim whitespace and remove quotes if present (same as auth.js)
if (GOOGLE_CLIENT_ID) {
  GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID.trim().replace(/^["']|["']$/g, '');
}
if (GOOGLE_CLIENT_SECRET) {
  GOOGLE_CLIENT_SECRET = GOOGLE_CLIENT_SECRET.trim().replace(/^["']|["']$/g, '');
}
if (GOOGLE_CLIENT_ID_ANDROID) {
  GOOGLE_CLIENT_ID_ANDROID = GOOGLE_CLIENT_ID_ANDROID.trim().replace(/^["']|["']$/g, '');
}

// Support multiple client IDs (web, iOS/other mobile, Android app)
const GOOGLE_CLIENT_IDS = [
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_ID_ANDROID,
  '566249475900-jpqs3cjm0n1ikj56mgocsgm6lm2161u5.apps.googleusercontent.com',
].filter(Boolean);

// Initialize Google OAuth client (for id_token verification)
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
// Client with secret for code exchange (React Native OAuth flow)
const oauth2ClientWithSecret = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, undefined);

// Verify Google OAuth token
async function verifyGoogleToken(token) {
  try {
    // Try to verify with the primary client ID first
    let ticket;
    let payload;
    
    try {
      ticket = await client.verifyIdToken({
        idToken: token,
        audience: GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (primaryError) {
      // If primary fails, try with the React Native client ID
      console.log('Primary client ID verification failed, trying alternative client IDs...');
      
      // Try each client ID in the list
      for (const clientId of GOOGLE_CLIENT_IDS) {
        try {
          const altClient = new OAuth2Client(clientId);
          ticket = await altClient.verifyIdToken({
            idToken: token,
            audience: clientId,
          });
          payload = ticket.getPayload();
          console.log(`✅ Token verified with client ID: ${clientId.substring(0, 20)}...`);
          break;
        } catch (altError) {
          // Continue to next client ID
          continue;
        }
      }
      
      if (!payload) {
        throw new Error('Token verification failed with all client IDs');
      }
    }
    
    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      emailVerified: payload.email_verified
    };
  } catch (error) {
    console.error('Google token verification failed:', error);
    console.error('Error details:', error.message);
    throw new Error('Invalid Google token');
  }
}

// Base URL of this API (HTTPS, no trailing slash). Required for OAuth "Invalid Origin" fix.
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || '').trim().replace(/\/$/, '') || null;
// Optional: exact redirect URI for Google (must match Google Console exactly). If set, overrides PUBLIC_API_URL + path.
const OAUTH_REDIRECT_URI = (process.env.OAUTH_REDIRECT_URI || '').trim() || null;

// Start OAuth from server so the request origin is HTTPS (fixes "Invalid Origin: must end with public TLD")
router.get('/oauth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).send('OAuth not configured (set GOOGLE_CLIENT_ID).');
  }
  const callbackUri = OAUTH_REDIRECT_URI || (PUBLIC_API_URL ? `${PUBLIC_API_URL}/api/publishers/oauth/callback` : null);
  if (!callbackUri) {
    return res.status(500).send('OAuth not configured (set PUBLIC_API_URL or OAUTH_REDIRECT_URI).');
  }
  console.log('OAuth redirect_uri sent to Google (must match Google Console exactly):', callbackUri);
  const state = require('crypto').randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: callbackUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// Google redirects here (HTTPS origin). We store code by state and show a page with "Open app" link (no auto-redirect to avoid blank page).
const APP_SCHEME = 'adscapeadminrn://oauth';
const oauthPendingByState = new Map();
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

function cleanupExpiredOAuthState() {
  const now = Date.now();
  for (const [s, entry] of oauthPendingByState.entries()) {
    if (now - entry.createdAt > OAUTH_STATE_TTL_MS) oauthPendingByState.delete(s);
  }
}

router.get('/oauth/callback', (req, res) => {
  const { code, state, error } = req.query;
  if (state && code) {
    oauthPendingByState.set(state, { code, createdAt: Date.now() });
    cleanupExpiredOAuthState();
  }
  const params = {};
  if (error) params.error = error;
  else if (!code) params.error = 'no_code';
  else if (state) params.state = state;
  else {
    params.code = code;
    if (state) params.state = state;
  }
  const appUrl = params.state
    ? `${APP_SCHEME}?state=${encodeURIComponent(params.state)}`
    : `${APP_SCHEME}?${new URLSearchParams(params).toString()}`;
  const appUrlEscaped = appUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Return to app</title></head><body style="margin:0;padding:24px;font-family:system-ui,sans-serif;background:#f5f5f5;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;">' +
    '<div style="background:#fff;padding:32px;border-radius:12px;max-width:360px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.08);">' +
    '<p style="margin:0 0 24px;font-size:18px;color:#333;">Sign-in complete.</p>' +
    '<p style="margin:0 0 24px;font-size:14px;color:#666;">Tap the button below to return to the app.</p>' +
    `<a href="${appUrlEscaped}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;background:#1976d2;text-decoration:none;border-radius:8px;">Open app</a>` +
    '</div></body></html>'
  );
});

// App opens with adscapeadminrn://oauth?state=xxx and calls this to get the code, then exchanges it for id_token.
router.get('/oauth/result', (req, res) => {
  const { state } = req.query;
  if (!state) return res.status(400).json({ error: 'state required' });
  const entry = oauthPendingByState.get(state);
  oauthPendingByState.delete(state);
  if (!entry) return res.status(404).json({ error: 'state not found or expired' });
  res.json({ code: entry.code });
});

// Exchange OAuth authorization code for id_token (for React Native; client_secret must stay on server)
// When using server proxy flow, redirectUri is the server callback URL; optional body for backwards compat.
router.post('/oauth/exchange', async (req, res) => {
  const { code, redirectUri: bodyRedirectUri } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured');
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }
  const redirectUri = bodyRedirectUri || OAUTH_REDIRECT_URI || (PUBLIC_API_URL ? `${PUBLIC_API_URL}/api/publishers/oauth/callback` : null);
  if (!redirectUri) {
    return res.status(400).json({ error: 'redirect_uri required (set PUBLIC_API_URL or OAUTH_REDIRECT_URI or send redirectUri)' });
  }
  try {
    const { tokens } = await oauth2ClientWithSecret.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.id_token) {
      return res.status(400).json({ error: 'No ID token in Google response' });
    }
    res.json({ id_token: tokens.id_token });
  } catch (err) {
    console.error('OAuth code exchange error:', err);
    res.status(400).json({ error: 'Failed to exchange code: ' + (err.message || 'invalid code or redirect_uri') });
  }
});

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










