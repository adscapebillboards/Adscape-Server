const express = require('express');
const prisma = require('./../db/db');
const logger = require('../config/logger');

const router = express.Router();

// Get all customers with complete information
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        companyName: true,
        registrationNumber: true,
        address: true,
        gstDocumentUrl: true,
        panDocumentUrl: true,
        totalbookings: true,
        lastbooking: true,
        totalspent: true,
        status: true,
        joindate: true
      },
      orderBy: {
        id: 'desc'
      }
    });

    // Format the data for the frontend
    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.fullName || 'Unknown',
      fullName: user.fullName || 'Unknown',
      email: user.email,
      phone: user.phoneNumber || 'Not provided',
      location: user.address || 'Not provided',
      companyName: user.companyName || 'Not provided',
      totalBookings: user.totalbookings || 0,
      lastBooking: user.lastbooking ? new Date(user.lastbooking).toLocaleDateString() : 'No bookings',
      totalSpent: user.totalspent ? `₹${parseInt(user.totalspent).toLocaleString()}` : '₹0',
      status: user.status === 'active' ? 'Active' : 'Inactive',
      joinDate: user.joindate ? new Date(user.joindate).toLocaleDateString() : 'Unknown',
      registrationNumber: user.registrationNumber,
      gstDocumentUrl: user.gstDocumentUrl,
      panDocumentUrl: user.panDocumentUrl
    }));

    logger.info('Customers fetched', `Count: ${formattedUsers.length}`);
    res.json(formattedUsers);
  } catch (err) {
    logger.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customer data' });
  }
});

// Get customer details with bookings and assets
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get customer basic info
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        companyName: true,
        registrationNumber: true,
        address: true,
        gstDocumentUrl: true,
        panDocumentUrl: true,
        totalbookings: true,
        lastbooking: true,
        totalspent: true,
        status: true,
        joindate: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get customer's campaigns (bookings)
    const campaigns = await prisma.campaign.findMany({
      where: { userName: user.email },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Extract booking information from campaigns
    const bookings = campaigns.map(campaign => {
      let billboards = campaign.billboards;
      if (typeof billboards === 'string') {
        try {
          billboards = JSON.parse(billboards);
        } catch (parseError) {
          billboards = [];
        }
      }

      return {
        id: campaign.id,
        campaignName: campaign.campaignName || 'Auto Campaign',
        status: campaign.status,
        totalAmount: campaign.totalAmount,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        billboardCount: Array.isArray(billboards) ? billboards.length : 0,
        createdAt: campaign.createdAt
      };
    });

    // Get customer's assets from campaigns
    const assets = [];
    campaigns.forEach(campaign => {
      let billboards = campaign.billboards;
      if (typeof billboards === 'string') {
        try {
          billboards = JSON.parse(billboards);
        } catch (parseError) {
          billboards = [];
        }
      }

      if (Array.isArray(billboards)) {
        billboards.forEach(billboard => {
          if (billboard.files && Array.isArray(billboard.files)) {
            billboard.files.forEach(file => {
              assets.push({
                id: `${campaign.id}_${billboard.id}_${file}`,
                name: file.split('/').pop() || 'Unknown',
                url: file,
                campaignId: campaign.id,
                campaignName: campaign.campaignName || 'Auto Campaign',
                type: file.includes('.mp4') || file.includes('.mov') ? 'Video' : 'Image',
                size: 'Unknown' // File size not stored in database
              });
            });
          }
        });
      }
    });

    // Format customer data
    const customerDetails = {
      id: user.id,
      name: user.fullName || 'Unknown',
      fullName: user.fullName || 'Unknown',
      email: user.email,
      phone: user.phoneNumber || 'Not provided',
      location: user.address || 'Not provided',
      companyName: user.companyName || 'Not provided',
      totalBookings: user.totalbookings || 0,
      lastBooking: user.lastbooking ? new Date(user.lastbooking).toLocaleDateString() : 'No bookings',
      totalSpent: user.totalspent ? `₹${parseInt(user.totalspent).toLocaleString()}` : '₹0',
      status: user.status === 'active' ? 'Active' : 'Inactive',
      joinDate: user.joindate ? new Date(user.joindate).toLocaleDateString() : 'Unknown',
      registrationNumber: user.registrationNumber,
      gstDocumentUrl: user.gstDocumentUrl,
      panDocumentUrl: user.panDocumentUrl,
      bookings: bookings,
      assets: assets
    };

    logger.info('Customer details fetched', `Customer ID: ${id}, Bookings: ${bookings.length}, Assets: ${assets.length}`);
    res.json(customerDetails);
  } catch (err) {
    logger.error('Error fetching customer details:', err);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
});

module.exports = router;