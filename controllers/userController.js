// controllers/userController.js
const prisma = require('./../db/db');
const logger = require('../config/logger');
const { createPublisherMetricEntry } = require('./publisherMetricController');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret'; // set via .env in real apps

exports.loginPublisher = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  try {
    const user = await prisma.publisher.findUnique({
      where: { email }
    });

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: '7d',
    });

    logger.user('Login successful', user.email);
    res.json({ message: 'Login successful', token, user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      location: user.location,
      status: user.status,
      totalBillboards: user.totalBillboards ?? 0,
      revenue: user.revenue ?? '₹0',
      joinDate: user.joinDate,
      role: user.role
    }});
  } catch (err) {
    logger.error('Error logging in:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};


exports.createPublisher = async (req, res) => {
  const {
    name,
    email,
    phone,
    location,
    joinDate,
    password
  } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: 'Name, email, phone, and password are required' });
  }

  try {
    // Check if email already exists
    const existingPublisher = await prisma.publisher.findUnique({
      where: { email }
    });

    if (existingPublisher) {
      return res.status(409).json({ error: 'A publisher with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10); // 10 salt rounds

    // Validate and set joinDate - default to current date if not provided or invalid
    let validJoinDate;
    if (joinDate) {
      const parsedDate = new Date(joinDate);
      if (isNaN(parsedDate.getTime())) {
        // Invalid date, use current date
        logger.warn('Invalid joinDate provided, using current date:', joinDate);
        validJoinDate = new Date();
      } else {
        validJoinDate = parsedDate;
      }
    } else {
      // No joinDate provided, use current date
      validJoinDate = new Date();
    }

    const publisher = await prisma.publisher.create({
      data: {
        name,
        email,
        phone,
        location,
        joinDate: validJoinDate,
        password: hashedPassword
      }
    });

    // Automatically create PublisherMetric entry
    try {
      await createPublisherMetricEntry(publisher.id, {
        totalBillboards: 0,
        joinDate: validJoinDate,
        status: 'active'
      });
      logger.info('PublisherMetric entry created automatically for publisher:', publisher.id);
    } catch (metricError) {
      logger.error('Error creating PublisherMetric entry:', metricError);
      // Continue with the response even if metric creation fails
    }

    logger.user('Publisher created', email);
    res.status(201).json({ message: 'Publisher created', publisher });
  } catch (err) {
    logger.error('Error creating publisher:', err);
    
    // Handle Prisma unique constraint errors
    if (err.code === 'P2002') {
      const field = err.meta?.target?.[0] || 'field';
      return res.status(409).json({ 
        error: `A publisher with this ${field} already exists` 
      });
    }
    
    res.status(500).json({ error: 'Failed to create publisher' });
  }
};




exports.getAllPublishers = async (req, res) => {
  try {
    const publishers = await prisma.publisher.findMany({
      orderBy: {
        id: 'desc'
      }
    });

    const formattedPublishers = publishers.map(p => ({
      id: p.id.toString(),
      name: p.name,
      email: p.email,
      phone: p.phone,
      location: p.location,
      joinDate: p.joinDate, // ISO string
      status: p.status,
      totalBillboards: p.totalBillboards ?? 0,
      revenue: p.revenue ?? '₹0',
      // Additional fields for comprehensive display
      password: p.password,
      role: p.role,
      address: p.address,
      businessInfo: p.businessInfo,
      businessType: p.businessType,
      city: p.city,
      companyName: p.companyName,
      pincode: p.pincode,
      state: p.state,
      website: p.website,
      googleId: p.googleId,
    }));

    res.json({ publishers: formattedPublishers });
  } catch (err) {
    console.error('Error fetching publishers:', err);
    res.status(500).json({ error: 'Failed to fetch publishers' });
  }
};
