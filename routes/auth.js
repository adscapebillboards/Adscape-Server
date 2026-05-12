const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../db/db'); // Prisma client
const router = express.Router();
const streamifier = require('streamifier');
const cloudinary = require('./../config/cloudinary'); // path to your cloudinary.js // your multer setup
const multer = require('multer');
const { OAuth2Client } = require('google-auth-library');
const JWT_SECRET = process.env.JWT_SECRET;
let GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
// Trim whitespace and remove quotes if present
if (GOOGLE_CLIENT_ID) {
  GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID.trim().replace(/^["']|["']$/g, '');
}
const upload = multer({ storage: multer.memoryStorage() });
const EmailService = require('../services/emailService');
const { isPublisherKycComplete } = require('../utils/publisherKyc');

// In-memory OTP store (email => { otp, expiresAt, verified })
const otpStore = new Map();

// Helper to clean expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of otpStore.entries()) {
    if (data.expiresAt < now) {
      otpStore.delete(email);
    }
  }
}, 60 * 1000);

// Debug: Log client ID to verify it's loaded correctly
console.log('🔑 Google Client ID loaded:', GOOGLE_CLIENT_ID ? `${GOOGLE_CLIENT_ID.substring(0, 20)}...` : 'NOT SET');

// Initialize Google OAuth client
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Verify Google OAuth token
async function verifyGoogleToken(token) {
  try {
    const allowedAudiences = [
      GOOGLE_CLIENT_ID,
      '566249475900-3inhmnhmeca6eanqt0rm63r2b4051bg6.apps.googleusercontent.com',
      '566249475900-sppum3clkdu06i8hma6usli7391vfaao.apps.googleusercontent.com',
      '184953752933-5k7uj0clahs4eh59v0g6tvcgcfotafuh.apps.googleusercontent.com'
    ];

    // Decode token to see audience without verification (for debugging)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        console.log('🔍 Token audience:', payload.aud);
        console.log('🔍 Expected audiences:', allowedAudiences);
        console.log('🔍 Match:', allowedAudiences.includes(payload.aud));
      }
    } catch (decodeError) {
      console.log('Could not decode token for debugging');
    }

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: allowedAudiences,
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
    console.error('Error details:', {
      message: error.message,
      expectedClientIds: [
        GOOGLE_CLIENT_ID,
        '566249475900-3inhmnhmeca6eanqt0rm63r2b4051bg6.apps.googleusercontent.com'
      ],
      errorName: error.name
    });
    throw new Error('Invalid Google token');
  }
}

// Google OAuth Sign Up
router.post('/google/signup', async (req, res) => {
  const { googleToken } = req.body;

  console.log('Google Signup Request:', { googleToken: googleToken ? 'Present' : 'Missing' });

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

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: googleUser.email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists. Please sign in instead.' });
    }

    // Create new user
    const user = await prisma.user.create({
      data: {
        email: googleUser.email,
        fullName: googleUser.name,
        googleId: googleUser.googleId,
        joindate: new Date(),
        status: 'active',
        totalbookings: 0,
        totalspent: '0',
        emailVerified: googleUser.emailVerified
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        joindate: true,
        status: true,
        totalbookings: true,
        totalspent: true
      }
    });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    console.log('User created successfully:', { id: user.id, email: user.email });
    res.json({ token, user });
  } catch (error) {
    console.error('Google Signup Error:', error);
    res.status(500).json({ error: 'Google signup failed: ' + error.message });
  }
});

// Google OAuth Sign In
router.post('/google/login', async (req, res) => {
  const { googleToken } = req.body;

  console.log('Google Login Request:', { googleToken: googleToken ? 'Present' : 'Missing' });

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

    // Find existing user
    const user = await prisma.user.findUnique({
      where: { email: googleUser.email }
    });

    if (!user) {
      return res.status(400).json({ error: 'User not found. Please sign up first.' });
    }

    // Update user's Google ID if not set
    if (!user.googleId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { googleId: googleUser.googleId }
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    console.log('User logged in successfully:', { id: user.id, email: user.email });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber
      }
    });
  } catch (error) {
    console.error('Google Login Error:', error);
    res.status(500).json({ error: 'Google login failed: ' + error.message });
  }
});

// OAuth Complete Profile
router.post('/oauth/complete-profile', async (req, res) => {
  const { email, fullName, phoneNumber, googleId, picture, joinDate, status } = req.body;

  console.log('OAuth Complete Profile Request:', {
    email,
    fullName,
    phoneNumber: phoneNumber ? 'Present' : 'Missing',
    password: 'Not required',
    googleId: googleId ? 'Present' : 'Missing'
  });

  if (!email || !fullName || !phoneNumber || !googleId) {
    return res.status(400).json({ error: 'email, fullName, phoneNumber and googleId are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists. Please sign in instead.' });
    }

    // Create new user with OAuth data (no password for Google accounts)
    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        phoneNumber,
        // password omitted for OAuth
        googleId,
        joindate: joinDate ? new Date(joinDate) : new Date(),
        status: status || 'active',
        totalbookings: 0,
        totalspent: '0',
        emailVerified: true // OAuth users have verified emails
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        joindate: true,
        status: true,
        totalbookings: true,
        totalspent: true
      }
    });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    console.log('OAuth user created successfully:', { id: user.id, email: user.email });
    res.json({ token, user });
  } catch (error) {
    console.error('OAuth Complete Profile Error:', error);
    res.status(500).json({ error: 'Failed to complete profile: ' + error.message });
  }
});

// Send OTP
router.post('/send-otp', async (req, res) => {
  const { email, purpose } = req.body; // purpose could be 'signup' or 'reset-password'
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    if (purpose === 'reset-password') {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(404).json({ error: 'User with this email not found' });
      }
    } else if (purpose === 'signup') {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists. Please sign in.' });
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store in map
    otpStore.set(email, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
      verified: false
    });

    const emailPurpose = purpose === 'signup' ? 'verify your account' : 'reset your password';
    await EmailService.notifyOTP(email, otp, emailPurpose);

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP Error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const storedData = otpStore.get(email);
  
  if (!storedData) {
    return res.status(400).json({ error: 'No OTP requested or OTP has expired' });
  }
  
  if (Date.now() > storedData.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ error: 'OTP has expired' });
  }
  
  if (storedData.otp !== otp) {
    return res.status(400).json({ error: 'Invalid OTP code' });
  }
  
  // Mark as verified but don't delete yet, it will be needed for signup/password reset
  storedData.verified = true;
  res.json({ message: 'OTP verified successfully' });
});

// Reset Password
router.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Email and new password are required' });
  }

  const storedData = otpStore.get(email);
  
  if (!storedData || !storedData.verified) {
    return res.status(403).json({ error: 'Email not verified. Please verify OTP first.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword }
    });
    
    // Clear the OTP store for this user
    otpStore.delete(email);
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset Error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Sign up
router.post('/signup', async (req, res) => {
  const { email, password, fullName, phoneNumber } = req.body; // ✅ add phoneNumber here

  console.log('Received data:', { email, password, fullName, phoneNumber }); // Log the received data



  try {
    // Check if the email was verified using OTP
    const storedData = otpStore.get(email);
    if (!storedData || !storedData.verified) {
      return res.status(403).json({ error: 'Email not verified. Please verify OTP before signing up.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName,
        phoneNumber,
        joindate: new Date(),
        status: 'active',
        totalbookings: 0,
        totalspent: '0'
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        joindate: true,
        status: true,
        totalbookings: true,
        totalspent: true
      }
    });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    console.log('JWT_SECRET:', JWT_SECRET);
    
    // Clear OTP after successful signup
    otpStore.delete(email);

    res.json({ token, user });
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Sign in
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });
    console.log('JWT_SECRET:', JWT_SECRET); // Check if the secret is being loaded correctly

    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, phoneNumber: user.phoneNumber } });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Publisher login
router.post('/publishers/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const publisher = await prisma.publisher.findUnique({
      where: { email }
    });

    if (!publisher) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, publisher.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    // Check if publisher status is active
    if (publisher.status !== 'active') {
      return res.status(403).json({
        error: 'Account not approved',
        status: publisher.status || 'pending',
        message: 'Your account is pending approval. Please wait for admin approval before logging in.'
      });
    }

    const token = jwt.sign({ id: publisher.id, email: publisher.email, role: publisher.role || 'publisher' }, JWT_SECRET, { expiresIn: '30d' });
    const kycCompleted = isPublisherKycComplete(publisher);

    res.json({
      token,
      user: {
        id: publisher.id,
        email: publisher.email,
        name: publisher.name || publisher.fullName,
        phone: publisher.phone || publisher.phoneNumber,
        location: publisher.location,
        role: publisher.role || 'publisher',
        permissions: publisher.permissions || {},
        kycCompleted,
        kycRequired: !kycCompleted
      }
    });
  } catch (err) {
    console.error('Publisher Login Error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});


// Add to auth.js route file
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        joindate: true,
        status: true,
        totalbookings: true,
        totalspent: true,
        lastbooking: true
      }
    });
    res.json({ user });
  } catch (err) {
    console.error('Fetch user error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user profile
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const updateData = {};

    // Only allow updating specific fields
    if (req.body.phoneNumber !== undefined) {
      updateData.phoneNumber = req.body.phoneNumber;
    }
    if (req.body.fullName !== undefined) {
      updateData.fullName = req.body.fullName;
    }
    if (req.body.location !== undefined) {
      // Handle location if needed
      updateData.location = req.body.location;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        joindate: true,
        status: true,
        totalbookings: true,
        totalspent: true,
        lastbooking: true
      }
    });

    console.log('User profile updated:', { id: user.id, phoneNumber: user.phoneNumber });
    res.json({ user });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});


// Get all users
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        fullName,
        phoneNumber,
        googleId,
        joindate: joinDate ? new Date(joinDate) : undefined,
        status: status || undefined
      },
      create: {
        email,
        fullName,
        phoneNumber,
        googleId,
        joindate: joinDate ? new Date(joinDate) : new Date(),
        status: status || 'active',
        totalbookings: 0,
        totalspent: '0',
        emailVerified: true
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        joindate: true,
        status: true,
        totalbookings: true,
        totalspent: true
      }
    });

    res.json({ users });
  } catch (err) {
    console.error('Get Users Error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});



module.exports = router;
