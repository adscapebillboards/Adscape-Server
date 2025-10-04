const express = require('express');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const EmailService = require('../services/emailService');
const router = express.Router();

// Get current email notification settings (superadmin only)
router.get('/settings', auth, roleAuth(['superadmin']), (req, res) => {
  try {
    const config = EmailService.getConfig();
    res.json({
      success: true,
      config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email settings'
    });
  }
});

// Enable/disable email notifications globally (superadmin only)
router.put('/settings/enable', auth, roleAuth(['superadmin']), (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean value'
      });
    }

    const result = EmailService.setEnabled(enabled);
    
    res.json({
      success: true,
      message: `Email notifications ${enabled ? 'enabled' : 'disabled'} successfully`,
      enabled: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update email settings'
    });
  }
});

// Enable/disable specific notification types (superadmin only)
router.put('/settings/notifications/:type', auth, roleAuth(['superadmin']), (req, res) => {
  try {
    const { type } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean value'
      });
    }

    const result = EmailService.setNotificationEnabled(type, enabled);
    
    if (result === false && !EmailService.getConfig().notifications[type]) {
      return res.status(400).json({
        success: false,
        error: `Unknown notification type: ${type}`
      });
    }

    res.json({
      success: true,
      message: `${type} notifications ${enabled ? 'enabled' : 'disabled'} successfully`,
      enabled: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update notification settings'
    });
  }
});

// Test email functionality (superadmin only)
router.post('/test', auth, roleAuth(['superadmin']), async (req, res) => {
  try {
    const { email, template } = req.body;
    
    if (!email || !template) {
      return res.status(400).json({
        success: false,
        error: 'email and template are required'
      });
    }

    // Test data for different templates
    const testData = {
      campaignCreated: {
        id: 'TEST_CAMPAIGN_001',
        userName: 'test@example.com',
        campaignName: 'Test Campaign',
        status: 'PENDING',
        totalAmount: 1000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        billboards: []
      },
      billboardApproved: {
        id: 'TEST_CAMPAIGN_001',
        userName: 'test@example.com',
        campaignName: 'Test Campaign',
        status: 'APPROVED'
      },
      billboardRejected: {
        id: 'TEST_CAMPAIGN_001',
        userName: 'test@example.com',
        campaignName: 'Test Campaign',
        status: 'REJECTED'
      },
      publisherAccountCreated: {
        companyName: 'Test Company',
        businessType: 'Corporation',
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        phone: '+1234567890',
        address: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        pincode: '12345'
      },
      billboardVerificationRequest: {
        id: 'TEST_BILLBOARD_001',
        location: 'Test Location',
        city: 'Test City',
        state: 'Test State',
        userId: 'test@example.com',
        pricePerDay: 100
      }
    };

    if (!testData[template]) {
      return res.status(400).json({
        success: false,
        error: `Unknown template: ${template}. Available templates: ${Object.keys(testData).join(', ')}`
      });
    }

    const result = await EmailService.sendEmail(email, template, testData[template]);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send test email',
        details: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to send test email',
      details: error.message
    });
  }
});

module.exports = router;

