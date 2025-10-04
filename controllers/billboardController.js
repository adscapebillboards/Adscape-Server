const prisma = require('./../db/db');
const logger = require('../config/logger');
const EmailService = require('../services/emailService');


// Helper to normalize billboard status to uppercase in API responses
const toApiBillboard = (billboard) => {
  if (!billboard) return billboard;
  return {
    ...billboard,
    status: (billboard.status || '').toString().toUpperCase(),
  };
};

// GET /states - Only states with approved billboards
exports.getStatesWithApprovedBillboards = async (req, res) => {
  try {
    const states = await prisma.billboard.findMany({
      where: {
        status: 'APPROVED',
      },
      distinct: ['state'], // Get unique states
      select: {
        state: true,
      },
    });

    const stateList = states.map((b) => b.state).filter(Boolean); // Remove null/undefined

    res.json(stateList);
  } catch (err) {
    console.error('Error fetching states with approved billboards:', err);
    res.status(500).send('Server Error');
  }
};

// controllers/billboardController.js

exports.getCitiesByState = async (req, res) => {
  const { state } = req.query;

  if (!state || typeof state !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid state parameter.' });
  }

  try {
    const cities = await prisma.billboard.findMany({
      where: {
        status: 'APPROVED',
        state: state,
        city: {
          not: null,
        },
      },
      distinct: ['city'],
      select: {
        city: true,
      },
    });

    const cityList = cities.map((b) => b.city).filter(Boolean);

    // Optional: Sort alphabetically
    cityList.sort((a, b) => a.localeCompare(b));

    res.json(cityList);
  } catch (error) {
    console.error('Error fetching cities for state:', state, error);
    res.status(500).json({ error: 'Server error while fetching cities.' });
  }
};




// Get all billboards with role-based filtering and approval status
exports.getAllBillboards = async (req, res) => {
  try {
    const user = req.user; // From getUserInfo middleware
    
    let whereClause = {};
    
    // Role-based filtering
    if (user.role === 'superadmin') {
      // Superadmin can see all billboards (including pending ones)
      whereClause = {};
    } else if (user.role === 'admin') {
      // Admin users can see their own billboards (including pending ones)
      whereClause = {
        userId: user.email
      };
    } else if (user.role === 'publisher') {
      // Publishers can only see their own billboards (including pending ones)
      whereClause = {
        userId: user.email
      };
    } else if (user.role === 'user') {
      // Users can only see their own billboards (including pending ones)
      whereClause = {
        userId: user.email
      };
    } else {
      // Default: users can only see their own billboards
      whereClause = {
        userId: user.email
      };
    }
    
    const billboards = await prisma.billboard.findMany({
      where: whereClause,
      orderBy: {
        id: 'desc'
      }
    });
    
    res.json(billboards.map(toApiBillboard));
  } catch (err) {
    logger.error('Error fetching billboards:', err);
    res.status(500).send('Server Error');
  }
};


// routes/billboards.js or similar
exports.getStatesFromBillboards = async (req, res) => {
  try {
    const states = await prisma.billboard.findMany({
      select: {
        state: true
      },
      distinct: ['state'],
      orderBy: {
        state: 'asc'
      }
    });
    res.json(states.map(row => row.state));
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};


// Get by ID
exports.getBillboardById = async (req, res) => {
  const { id } = req.params;
  try {
    const billboard = await prisma.billboard.findUnique({ where: { id } });
    if (!billboard) return res.status(404).send('Not found');

    // If not authenticated, only allow approved billboards (case-insensitive)
    if (!req.user && (billboard.status || '').toString().toUpperCase() !== 'APPROVED') {
      return res.status(404).send('Not found');
    }

    res.json(toApiBillboard(billboard));
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// Get approved billboards only (for client pages)
exports.getApprovedBillboards = async (req, res) => {
  try {
    let whereClause = { status: 'APPROVED' };

    // If user is authenticated, apply role-based filtering
    if (req.user) {
      const user = req.user;
      if (user.role === 'superadmin') {
        whereClause = { status: 'APPROVED' };
      } else if (user.role === 'publisher') {
        whereClause = { userId: user.email, status: 'APPROVED' };
      } else if (user.role === 'user') {
        whereClause = { userId: user.email, status: 'APPROVED' };
      } else {
        whereClause = { userId: user.email, status: 'APPROVED' };
      }
    }
    // If not authenticated, just return all approved billboards

    const billboards = await prisma.billboard.findMany({
      where: whereClause,
      orderBy: { id: 'desc' }
    });

    res.json(billboards.map(toApiBillboard));
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// Add new billboard (status: pending by default)
exports.addBillboard = async (req, res) => {
  console.log('Request body:', req.body); // 👀
  const {
    id, location, city, state, type, orientation, dailyViewership,
    pricePerDay, available, width, height, unit, category,
    images, latitude, longitude, userId, adDuration,opening_time,closing_time, max_advertisers, maxAdvertiseDuration, auto_brightness, resolution, description,name,reasons
  } = req.body;

  try {
    // Convert string values to appropriate types
    const billboard = await prisma.billboard.create({
      data: {
        id,
        location,
        city,
        state,
        type,
        orientation,
        dailyViewership: dailyViewership ? parseInt(dailyViewership) : null,
        pricePerDay: pricePerDay ? parseInt(pricePerDay) : null,
        available: available !== undefined ? Boolean(available) : true,
        width: width ? parseInt(width) : null,
        height: height ? parseInt(height) : null,
        unit,
        category,
        images: Array.isArray(images) ? images : [],
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        userId: userId || req.user.email, // Use authenticated user's email if not provided
        adDuration: adDuration || null, // Store adDuration directly
        openingTime: opening_time || null,
        closingTime: closing_time || null,
        maxAdvertisers: max_advertisers ? parseInt(max_advertisers) : null,
        maxAdvertiseDuration: maxAdvertiseDuration ? parseInt(maxAdvertiseDuration) : null,
        description,
        resolution,
        name,
        autoBrightness: auto_brightness !== undefined ? Boolean(auto_brightness) : false,
        reason: Array.isArray(reasons) ? reasons : [],
        status: 'PENDING' // Set status as pending for approval
      }
    });

    logger.billboard('Billboard created (pending approval)', `ID: ${billboard.id}, User: ${billboard.userId}`, { status: 'PENDING' });
    res.status(201).json({ 
      message: '✅ Billboard added successfully and waiting for approval',
      billboard: {
        id: billboard.id,
        status: 'PENDING',
        message: 'Your billboard is pending approval. You will be notified once it is reviewed.'
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Insert Error');
  }
};


// Update
exports.updateBillboard = async (req, res) => {
  const id = req.params.id;
  const {
    location, city, state, type, orientation, dailyViewership,
    pricePerDay, available, size, images, latitude, longitude, maxAdvertiseDuration, adDuration
  } = req.body;

  try {
    // Handle size object if provided
    const width = size?.width || req.body.width;
    const height = size?.height || req.body.height;
    const unit = size?.unit || req.body.unit;
    const category = size?.category || req.body.category;

    await prisma.billboard.update({
      where: { id },
      data: {
        location,
        city,
        state,
        type,
        orientation,
        dailyViewership: dailyViewership ? parseInt(dailyViewership) : null,
        pricePerDay: pricePerDay ? parseInt(pricePerDay) : null,
        available: available !== undefined ? Boolean(available) : true,
        width: width ? parseInt(width) : null,
        height: height ? parseInt(height) : null,
        unit,
        category,
        images: Array.isArray(images) ? images : [],
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        adDuration: adDuration || null,
        maxAdvertiseDuration: maxAdvertiseDuration ? parseInt(maxAdvertiseDuration) : null
      }
    });

    res.send('✅ Billboard updated');
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).send('Update Error');
  }
};

// Delete
exports.deleteBillboard = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.billboard.delete({
      where: { id }
    });
    res.send('✅ Billboard deleted');
  } catch (err) {
    res.status(500).send('Delete Error');
  }
};

// Approve billboard (superadmin only)
exports.approveBillboard = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Check if user is superadmin
    if (user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Only superadmin can approve billboards.' });
    }

    const billboard = await prisma.billboard.findUnique({
      where: { id }
    });

    if (!billboard) {
      return res.status(404).json({ error: 'Billboard not found' });
    }

    if ((billboard.status || '').toUpperCase() === 'APPROVED') {
      return res.status(400).json({ error: 'Billboard is already approved' });
    }

    if ((billboard.status || '').toUpperCase() === 'REJECTED') {
      return res.status(400).json({ error: 'Cannot approve a rejected billboard' });
    }

    const updatedBillboard = await prisma.billboard.update({
      where: { id },
      data: {
        status: 'APPROVED',
        rejectionReason: null // Clear any previous rejection reason
      }
    });

    // Create notification for owner and superadmin
    try {
      await prisma.$executeRawUnsafe(
        'INSERT INTO notifications (recipient_email, recipient_role, type, title, message, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        billboard.userId,
        'publisher',
        'BILLBOARD_APPROVED',
        'Billboard approved',
        `Your billboard ${updatedBillboard.name || updatedBillboard.location || updatedBillboard.id} has been approved`,
        'billboard',
        String(updatedBillboard.id)
      );
      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (recipient_role, type, title, message, entity_type, entity_id) VALUES ('superadmin', $1, $2, $3, $4, $5)",
        'BILLBOARD_APPROVED',
        'Billboard approved',
        `Billboard ${updatedBillboard.name || updatedBillboard.location || updatedBillboard.id} approved`,
        'billboard',
        String(updatedBillboard.id)
      );
    } catch (e) {
      logger.warn('Failed to create approval notifications:', e.message);
    }

    // Send email notification to billboard owner asynchronously
    EmailService.notifyBillboardApproved({
      id: `BILLBOARD_${id}`,
      userName: billboard.userId,
      campaignName: 'Billboard Verification',
      status: 'APPROVED'
    }, updatedBillboard).catch(emailError => {
      logger.error('Error sending billboard approval email notification:', emailError);
    });

    logger.billboard('Billboard approved', `ID: ${id}, User: ${billboard.userId}`, { approvedBy: user.email });
    res.json({
      message: '✅ Billboard approved successfully',
      billboard: {
        id: updatedBillboard.id,
        status: 'APPROVED',
        location: updatedBillboard.location,
        city: updatedBillboard.city
      }
    });

  } catch (error) {
    logger.error('Error approving billboard:', error);
    res.status(500).json({ error: 'Failed to approve billboard' });
  }
};

// Reject billboard (superadmin only)
exports.rejectBillboard = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const user = req.user;

    // Check if user is superadmin
    if (user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Only superadmin can reject billboards.' });
    }

    if (!rejectionReason || rejectionReason.trim() === '') {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const billboard = await prisma.billboard.findUnique({
      where: { id }
    });

    if (!billboard) {
      return res.status(404).json({ error: 'Billboard not found' });
    }

    if ((billboard.status || '').toUpperCase() === 'REJECTED') {
      return res.status(400).json({ error: 'Billboard is already rejected' });
    }

    if ((billboard.status || '').toUpperCase() === 'APPROVED') {
      return res.status(400).json({ error: 'Cannot reject an approved billboard' });
    }

    const updatedBillboard = await prisma.billboard.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim()
      }
    });

    // Create notification for owner and superadmin
    try {
      await prisma.$executeRawUnsafe(
        'INSERT INTO notifications (recipient_email, recipient_role, type, title, message, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        billboard.userId,
        'publisher',
        'BILLBOARD_REJECTED',
        'Billboard rejected',
        `Your billboard ${updatedBillboard.name || updatedBillboard.location || updatedBillboard.id} has been rejected. Reason: ${rejectionReason}`,
        'billboard',
        String(updatedBillboard.id)
      );
      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (recipient_role, type, title, message, entity_type, entity_id) VALUES ('superadmin', $1, $2, $3, $4, $5)",
        'BILLBOARD_REJECTED',
        'Billboard rejected',
        `Billboard ${updatedBillboard.name || updatedBillboard.location || updatedBillboard.id} rejected`,
        'billboard',
        String(updatedBillboard.id)
      );
    } catch (e) {
      logger.warn('Failed to create rejection notifications:', e.message);
    }

    // Send email notification to billboard owner asynchronously
    EmailService.notifyBillboardRejected({
      id: `BILLBOARD_${id}`,
      userName: billboard.userId,
      campaignName: 'Billboard Verification',
      status: 'REJECTED'
    }, updatedBillboard, rejectionReason).catch(emailError => {
      logger.error('Error sending billboard rejection email notification:', emailError);
    });

    logger.billboard('Billboard rejected', `ID: ${id}, User: ${billboard.userId}`, { 
      rejectedBy: user.email, 
      reason: rejectionReason 
    });
    
    res.json({
      message: '❌ Billboard rejected successfully',
      billboard: {
        id: updatedBillboard.id,
        status: 'REJECTED',
        rejectionReason: updatedBillboard.rejectionReason,
        location: updatedBillboard.location,
        city: updatedBillboard.city
      }
    });

  } catch (error) {
    logger.error('Error rejecting billboard:', error);
    res.status(500).json({ error: 'Failed to reject billboard' });
  }
};

// Get pending billboards (superadmin only)
exports.getPendingBillboards = async (req, res) => {
  try {
    const user = req.user;

    // Check if user is superadmin
    if (user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Only superadmin can view pending billboards.' });
    }

    const pendingBillboards = await prisma.billboard.findMany({
      where: {
        status: 'PENDING'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.billboard('Pending billboards fetched', pendingBillboards.length, 'billboards', { fetchedBy: user.email });
    res.json(pendingBillboards.map(toApiBillboard));

  } catch (error) {
    logger.error('Error fetching pending billboards:', error);
    res.status(500).json({ error: 'Failed to fetch pending billboards' });
  }
};

exports.getUserBillboards = async (req, res) => {
  try {
    const user = req.user; // From getUserInfo middleware
    
    let whereClause = {};
    
    // Role-based filtering
    if (user.role === 'superadmin') {
      // Superadmin can see all billboards
      whereClause = {};
    } else {
      // Publishers and users can only see their own billboards
      whereClause = {
        userId: user.email
      };
    }
    
    const billboards = await prisma.billboard.findMany({
      where: whereClause,
      orderBy: {
        id: 'desc'
      }
    });

    logger.billboard(`User billboards fetched for ${user.role}`, billboards.length, 'billboards', { user: user.email, role: user.role });
    res.json(billboards);
  } catch (error) {
    logger.error('Error fetching user billboards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Resubmit billboard for approval (superadmin or billboard owner)
exports.resubmitBillboard = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const billboard = await prisma.billboard.findUnique({
      where: { id: id }
    });

    if (!billboard) {
      return res.status(404).json({ error: 'Billboard not found' });
    }

    // Check if user is superadmin or the billboard owner
    if (user.role !== 'superadmin' && billboard.userId !== user.email) {
      return res.status(403).json({ error: 'Access denied. Only superadmin or billboard owner can resubmit billboards.' });
    }

    if ((billboard.status || '').toUpperCase() !== 'REJECTED') {
      return res.status(400).json({ error: 'Only rejected billboards can be resubmitted' });
    }

    // Update billboard status to pending and clear rejection reason
    const updatedBillboard = await prisma.billboard.update({
      where: { id: id },
      data: {
        status: 'PENDING',
        rejectionReason: null,
        updatedAt: new Date()
      }
    });

    // Notify superadmin of resubmission
    try {
      await prisma.$executeRawUnsafe(
        "INSERT INTO notifications (recipient_role, type, title, message, entity_type, entity_id) VALUES ('superadmin', $1, $2, $3, $4, $5)",
        'BILLBOARD_RESUBMITTED',
        'Billboard resubmitted',
        `Billboard ${updatedBillboard.name || updatedBillboard.location || updatedBillboard.id} resubmitted for review`,
        'billboard',
        String(updatedBillboard.id)
      );
    } catch (e) {
      logger.warn('Failed to create resubmission notification:', e.message);
    }

    logger.billboard('Billboard resubmitted', `ID: ${id}, User: ${billboard.userId}`, { 
      resubmittedBy: user.email,
      userRole: user.role
    });
    
    res.json({
      message: '🔄 Billboard resubmitted successfully',
      billboard: {
        id: updatedBillboard.id,
        status: 'PENDING',
        location: updatedBillboard.location,
        city: updatedBillboard.city
      }
    });

  } catch (error) {
    logger.error('Error resubmitting billboard:', error);
    res.status(500).json({ error: 'Failed to resubmit billboard' });
  }
};

// Search billboards with fuzzy search
// Get recent bookings for a specific billboard
exports.getBillboardBookings = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    
    // Get all campaigns and filter for those containing this billboard
    const allCampaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit) * 2 // Get more to account for filtering
    });
    
    // Filter campaigns that include this billboard
    const campaigns = allCampaigns.filter(campaign => {
      let billboards = campaign.billboards;
      if (typeof billboards === 'string') {
        try {
          billboards = JSON.parse(billboards);
        } catch (parseError) {
          return false;
        }
      }
      return Array.isArray(billboards) && billboards.some(b => b.id === id);
    }).slice(0, parseInt(limit));
    
    // Extract booking details
    const bookings = [];
    campaigns.forEach(campaign => {
      let billboards = campaign.billboards;
      if (typeof billboards === 'string') {
        try {
          billboards = JSON.parse(billboards);
        } catch (parseError) {
          return;
        }
      }
      
      const billboardData = billboards.find(b => b.id === id);
      if (billboardData) {
        bookings.push({
          id: `${campaign.id}_${id}`,
          campaignId: campaign.id,
          campaignName: campaign.campaignName || 'Auto Campaign',
          client: campaign.userName,
          startDate: billboardData.bookingDetails?.startDate || billboardData.startDate,
          endDate: billboardData.bookingDetails?.endDate || billboardData.endDate,
          status: billboardData.status || 'PENDING',
          totalPrice: billboardData.totalPrice || 0,
          createdAt: campaign.createdAt
        });
      }
    });
    
    logger.billboard('Billboard bookings fetched', `Billboard ID: ${id}, Count: ${bookings.length}`);
    res.json({ 
      success: true, 
      count: bookings.length, 
      bookings: bookings 
    });
    
  } catch (error) {
    logger.error('Error fetching billboard bookings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch billboard bookings',
      details: error.message 
    });
  }
};

// Get owner details for a specific billboard
exports.getBillboardOwner = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the billboard first
    const billboard = await prisma.billboard.findUnique({
      where: { id }
    });
    
    if (!billboard) {
      return res.status(404).json({ 
        error: 'Billboard not found' 
      });
    }
    
    if (!billboard.userId) {
      return res.status(404).json({ 
        error: 'Billboard owner not found' 
      });
    }
    
    // Try to find the owner in publishers table first
    let owner = await prisma.publisher.findUnique({
      where: { email: billboard.userId }
    });
    
    // If not found in publishers, try users table
    if (!owner) {
      owner = await prisma.user.findUnique({
        where: { email: billboard.userId }
      });
    }
    
    if (!owner) {
      return res.status(404).json({ 
        error: 'Owner not found' 
      });
    }
    
    // Format owner details
    const ownerDetails = {
      id: owner.id,
      name: owner.name || owner.fullName || 'Unknown',
      email: owner.email,
      phone: owner.phone || owner.phoneNumber || 'Not provided',
      location: owner.location || owner.address || 'Not provided',
      companyName: owner.companyName || 'Not provided',
      joinDate: owner.joinDate || owner.joindate,
      status: owner.status || 'active',
      totalBillboards: owner.totalBillboards || 0,
      revenue: owner.revenue || owner.totalspent || '₹0'
    };
    
    logger.billboard('Billboard owner fetched', `Billboard ID: ${id}, Owner: ${ownerDetails.email}`);
    res.json({ 
      success: true, 
      owner: ownerDetails 
    });
    
  } catch (error) {
    logger.error('Error fetching billboard owner:', error);
    res.status(500).json({ 
      error: 'Failed to fetch billboard owner',
      details: error.message 
    });
  }
};

exports.searchBillboards = async (req, res) => {
  try {
    const { q, type, city, state, limit = 20 } = req.query;
    
    if (!q && !type && !city && !state) {
      return res.status(400).json({ 
        error: 'At least one search parameter is required (q, type, city, or state)' 
      });
    }

    let whereClause = {
      status: 'APPROVED', // Only search approved billboards
      available: true // Only available billboards
    };

    // Build search conditions
    if (q) {
      // Fuzzy search across multiple fields
      whereClause.OR = [
        {
          name: {
            contains: q,
            mode: 'insensitive' // Case-insensitive search
          }
        },
        {
          location: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          city: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          state: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          description: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          type: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          category: {
            contains: q,
            mode: 'insensitive'
          }
        }
      ];
    }

    // Filter by specific fields if provided
    if (type) {
      whereClause.type = {
        contains: type,
        mode: 'insensitive'
      };
    }

    if (city) {
      whereClause.city = {
        contains: city,
        mode: 'insensitive'
      };
    }

    if (state) {
      whereClause.state = {
        contains: state,
        mode: 'insensitive'
      };
    }

    const billboards = await prisma.billboard.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        location: true,
        city: true,
        state: true,
        type: true,
        orientation: true,
        dailyViewership: true,
        pricePerDay: true,
        size_width: true,
        size_height: true,
        size_unit: true,
        images: true,
        latitude: true,
        longitude: true,
        description: true,
        category: true,
        resolution: true,
        createdAt: true
      },
      orderBy: [
        {
          // Prioritize exact matches
          name: 'asc'
        },
        {
          // Then by daily viewership (higher first)
          dailyViewership: 'desc'
        },
        {
          // Finally by creation date (newer first)
          createdAt: 'desc'
        }
      ],
      take: parseInt(limit)
    });

    // Calculate relevance scores for better ranking
    const scoredBillboards = billboards.map(billboard => {
      let score = 0;
      const searchTerm = q ? q.toLowerCase() : '';
      
      if (searchTerm) {
        // Exact matches get highest score
        if (billboard.name?.toLowerCase() === searchTerm) score += 100;
        if (billboard.city?.toLowerCase() === searchTerm) score += 80;
        if (billboard.state?.toLowerCase() === searchTerm) score += 60;
        
        // Partial matches get medium score
        if (billboard.name?.toLowerCase().includes(searchTerm)) score += 50;
        if (billboard.location?.toLowerCase().includes(searchTerm)) score += 40;
        if (billboard.city?.toLowerCase().includes(searchTerm)) score += 30;
        if (billboard.state?.toLowerCase().includes(searchTerm)) score += 20;
        
        // Description matches get lower score
        if (billboard.description?.toLowerCase().includes(searchTerm)) score += 10;
      }
      
      return {
        ...billboard,
        relevanceScore: score
      };
    });

    // Sort by relevance score (highest first)
    scoredBillboards.sort((a, b) => b.relevanceScore - a.relevanceScore);

    logger.info('Billboard search completed', { 
      query: q, 
      type, 
      city, 
      state, 
      results: scoredBillboards.length 
    });

    res.json({
      success: true,
      count: scoredBillboards.length,
      billboards: scoredBillboards,
      searchParams: { q, type, city, state, limit }
    });

  } catch (error) {
    logger.error('Error searching billboards:', error);
    res.status(500).json({ 
      error: 'Failed to search billboards',
      details: error.message 
    });
  }
};