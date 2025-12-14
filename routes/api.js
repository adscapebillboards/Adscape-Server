const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const logger = require('../config/logger');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const upload = multer({ storage: multer.memoryStorage() });

// Basic API endpoints
router.get('/data', (req, res) => {
  let counter = 0;
  counter++;
  logger.api('GET', '/api/data', 'Counter:', counter);
  res.json({ message: 'Here is some data', counter });
});

router.post('/update', (req, res) => {
  const payload = req.body;
  logger.api('POST', '/api/update', 'Received data:', payload);
  res.json({ status: 'success', received: payload });
});

// User billboards
router.get('/userbillboards', async (req, res) => {
  const { userEmail } = req.query;

  try {
    const result = await pool.query(
      'SELECT * FROM billboards WHERE user_id = $1 ORDER BY id DESC',
      [userEmail]
    );

    logger.billboard('User billboards fetched', `User: ${userEmail}, Count: ${result.rows.length}`);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching billboards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Campaign creation with file upload
router.post('/create-campaign', upload.array('files'), async (req, res) => {
  try {
    const { userName, billboards } = JSON.parse(req.body.data);
    const uploadedFiles = req.files;
    logger.campaign('Campaign creation started', `User: ${userName}, Billboards: ${billboards.length}`);

    const campaignId = uuidv4();

    const enrichedBillboards = await Promise.all(billboards.map(async (billboard) => {
      const { id, location, city, pricePerDay, bookingDetails, owner, screen_id } = billboard;
      const { startDate, endDate } = bookingDetails;

      // Calculate total price for this billboard
      const days = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
      const totalPrice = days * pricePerDay;

      const fileUrls = [];

      const matchingFiles = uploadedFiles.filter(file =>
        file.originalname.startsWith(`${id}_`)
      );

      const streamUpload = (fileBuffer) => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { resource_type: 'image' },
            (error, result) => {
              if (error) return reject(error);
              resolve(result.secure_url);
            }
          );
          stream.end(fileBuffer);
        });
      };

      for (const file of matchingFiles) {
        try {
          const url = await streamUpload(file.buffer);
          fileUrls.push(url);
        } catch (error) {
          logger.error(`Failed to upload file ${file.originalname}:`, error.message);
        }
      }

      return {
        id,
        location,
        city,
        pricePerDay,
        totalPrice, // Add total price for this billboard
        bookingDetails: {
          startDate,
          endDate
        },
        files: fileUrls,
        owner,
        screen_id,
        // Campaign-related information for each billboard
        userName: userName,
        status: "PENDING",
        createDate: new Date().toISOString(),
        endDate: endDate,
        billboardCampaignId: `${campaignId}_${id}`, // Generate unique billboard campaign ID
        // Keep all existing billboard details
        ...billboard
      };
    }));

    const startDate = enrichedBillboards[0]?.bookingDetails.startDate;
    const endDate = enrichedBillboards[0]?.bookingDetails.endDate;

    // Calculate totalAmount
    const totalAmount = enrichedBillboards.reduce((sum, b) => {
      const days = (new Date(b.bookingDetails.endDate) - new Date(b.bookingDetails.startDate)) / (1000 * 60 * 60 * 24) + 1;
      return sum + (days * b.pricePerDay);
    }, 0);

    await pool.query(
      `INSERT INTO campaigns (id, user_name, campaign_name, status, total_amount, start_date, end_date, billboards)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        campaignId,
        userName,
        "Auto Campaign",
        "pending",
        totalAmount,
        startDate,
        endDate,
        JSON.stringify(enrichedBillboards)
      ]
    );

    logger.campaign('Campaign created successfully', `ID: ${campaignId}, User: ${userName}`);
    res.status(201).json({ 
      message: 'Campaign created successfully.',
      id: campaignId
    });

  } catch (err) {
    logger.error('Error creating campaign:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get campaigns by user
router.get('/campaigns', async (req, res) => {
  const { user } = req.query;
  logger.campaign('Fetching campaigns', `User: ${user}`);
  
  try {
    const result = await pool.query(
      'SELECT * FROM campaigns WHERE user_name = $1 ORDER BY created_at DESC',
      [user]
    );
    logger.campaign('Campaigns fetched', `User: ${user}, Count: ${result.rows.length}`);
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching campaigns:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get all campaigns (admin)
router.get('/campaignsu', async (req, res) => {
  try {
    const partnerEmail = req.header('X-Partner-Email');
    let result;
    if (partnerEmail) {
      result = await pool.query(`
        SELECT 
          c.*
        FROM campaigns c
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements(c.billboards::jsonb) AS elem
          JOIN billboards b ON b.id::text = elem->>'id'
          WHERE LOWER(b.user_id) = LOWER($1)
        )
        ORDER BY c.created_at DESC
      `, [partnerEmail]);
    } else {
      result = await pool.query(
        'SELECT * FROM campaigns ORDER BY created_at DESC'
      );
    }
    logger.campaign('All campaigns fetched', `Count: ${result.rows.length}`);
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching campaigns:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get campaigns by user email (for billboard owners)
router.get('/campaignsuz', async (req, res) => {
  const { userEmail } = req.query;

  try {
    const result = await pool.query(`
      SELECT 
        c.*
      FROM campaigns c
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(c.billboards::jsonb) AS elem
        JOIN billboards b ON b.id::text = elem->>'id'
        WHERE b.user_id = $1
      )
      ORDER BY c.created_at DESC
    `, [userEmail]);

    logger.campaign('User campaigns fetched (owner view)', `User: ${userEmail}, Count: ${result.rows.length}`);
    res.json(result.rows);
  } catch (err) {
    logger.error("Error fetching user campaigns:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update campaign status - REMOVED: This route is now handled by campaignApi.js
// The proper implementation with PAYMENT_COMPLETED -> SCHEDULED logic is in campaignApiController.js
// router.put('/campaigns/:id/status', ...) - MOVED TO campaignApi.js

// Update campaign name
router.put('/update-campaign-name', async (req, res) => {
  logger.info('Incoming body:', req.body);
  try {
    const { campaignId, campaignName } = req.body;
    logger.info('Received:', { campaignId, campaignName });

    if (!campaignId || !campaignName) {
      return res.status(400).json({ message: 'Campaign ID and name are required' });
    }

    const result = await pool.query(
      'UPDATE campaigns SET campaign_name = $1 WHERE id = $2 RETURNING *',
      [campaignName, campaignId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    logger.campaign('Campaign name updated', `Campaign ID: ${campaignId}, New name: ${campaignName}`);
    res.status(200).json({ message: 'Campaign name updated successfully', campaign: result.rows[0] });
  } catch (err) {
    logger.error('Update campaign name error:', err);
    res.status(500).json({ message: 'Failed to update campaign name' });
  }
});

// Get billboards list
router.get('/billboards', async (req, res) => {
  try {
    const partnerEmail = req.header('X-Partner-Email');
    let result;
    if (partnerEmail) {
      result = await pool.query(
        `SELECT 
          id, name, location, city, state, type, orientation, 
          daily_viewership as "dailyViewership", price_per_day as "pricePerDay", 
          available, width, height, unit, category, images, 
          latitude, longitude, user_id as "userId", ad_duration as "adDuration",
          opening_time as "openingTime", closing_time as "closingTime", 
          max_advertisers as "maxAdvertisers", max_advertise_duration as "maxAdvertiseDuration",
          auto_brightness as "autoBrightness", resolution, description, 
          status, created_at as "createdAt", updated_at as "updatedAt",
          rejection_reason as "rejectionReason"
        FROM billboards 
        WHERE LOWER(user_id) = LOWER($1)
        ORDER BY created_at DESC`,
        [partnerEmail]
      );
    } else {
      result = await pool.query(`
        SELECT 
          id, name, location, city, state, type, orientation, 
          daily_viewership as "dailyViewership", price_per_day as "pricePerDay", 
          available, width, height, unit, category, images, 
          latitude, longitude, user_id as "userId", ad_duration as "adDuration",
          opening_time as "openingTime", closing_time as "ClosingTime", 
          max_advertisers as "maxAdvertisers", max_advertise_duration as "maxAdvertiseDuration",
          auto_brightness as "autoBrightness", resolution, description, 
          status, created_at as "createdAt", updated_at as "updatedAt",
          rejection_reason as "rejectionReason"
        FROM billboards 
        ORDER BY created_at DESC
      `);
    }
    
    // Transform the data to match frontend expectations
    const transformedBillboards = result.rows.map(billboard => ({
      ...billboard,
      status: (billboard.status || '').toString().toUpperCase(),
      images: billboard.images ? JSON.parse(billboard.images) : [],
      pricePerDay: billboard.pricePerDay ? billboard.pricePerDay.toString() : '0',
      dailyViewership: billboard.dailyViewership ? billboard.dailyViewership.toString() : '0',
      width: billboard.width || 0,
      height: billboard.height || 0,
      latitude: billboard.latitude || 0,
      longitude: billboard.longitude || 0,
      available: billboard.available !== false // Default to true if not set
    }));
    
    logger.billboard('Billboards list fetched', transformedBillboards.length, 'billboards');
    res.json(transformedBillboards);
  } catch (err) {
    logger.error('Error fetching billboards list:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create admin user
router.post("/users", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    const result = await pool.query(
      "INSERT INTO admin_user (email, password) VALUES ($1, $2) RETURNING *",
      [email, password]
    );
    logger.user('Admin user created', email);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error("Error adding user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Email sending
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'srinnivassh@gmail.com',
    pass: 'jjcg edwl picz rrqw',
  },
});

router.post('/send-email', (req, res) => {
  const { name, email, phone, company, message } = req.body;

  const mailOptions = {
    from: `"${name}" <${email}>`,
    to: 'sabharishhari@gmail.com',
    subject: 'New Contact Form Submission',
    html: `
      <h3>Contact Details</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Company:</strong> ${company}</p>
      <p><strong>Message:</strong> ${message}</p>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error('Error sending email:', error);
      res.status(500).json({ success: false, message: 'Failed to send email' });
    } else {
      logger.info('Email sent:', info.response);
      res.status(200).json({ success: true, message: 'Email sent successfully' });
    }
  });
});

module.exports = router; 