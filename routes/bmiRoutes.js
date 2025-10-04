const express = require('express');
const router = express.Router();
const bmiController = require('../controllers/bmiController');

// Store BMI data
router.post('/store', async (req, res) => {
  try {
    const { deviceId, height, weight, bmi, category, timestamp } = req.body;
    
    // Validate required fields
    if (!deviceId || !height || !weight || !bmi || !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deviceId, height, weight, bmi, category'
      });
    }
    
    const result = await bmiController.storeBMIData({
      deviceId,
      height: parseFloat(height),
      weight: parseFloat(weight),
      bmi: parseFloat(bmi),
      category,
      timestamp: timestamp || new Date().toISOString()
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error in BMI store route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get BMI data by device ID
router.get('/device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const result = await bmiController.getBMIDataByDevice(deviceId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error in BMI device route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get all BMI data with pagination
router.get('/all', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await bmiController.getAllBMIData(page, limit);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error in BMI all route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get BMI statistics
router.get('/statistics', async (req, res) => {
  try {
    const result = await bmiController.getBMIStatistics();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error in BMI statistics route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;

