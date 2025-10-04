const db = require('../db/db');

// Store BMI data in database
const storeBMIData = async (bmiData) => {
  try {
    const { deviceId, height, weight, bmi, category, timestamp } = bmiData;
    
    const query = `
      INSERT INTO bmi_data (device_id, height, weight, bmi, category, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [deviceId, height, weight, bmi, category, timestamp];
    const result = await db.query(query, values);
    
    console.log('BMI data stored successfully:', result.rows[0]);
    return { success: true, data: result.rows[0] };
  } catch (error) {
    console.error('Error storing BMI data:', error);
    return { success: false, error: error.message };
  }
};

// Get BMI data by device ID
const getBMIDataByDevice = async (deviceId) => {
  try {
    const query = `
      SELECT * FROM bmi_data 
      WHERE device_id = $1 
      ORDER BY timestamp DESC 
      LIMIT 10
    `;
    
    const result = await db.query(query, [deviceId]);
    return { success: true, data: result.rows };
  } catch (error) {
    console.error('Error fetching BMI data:', error);
    return { success: false, error: error.message };
  }
};

// Get all BMI data with pagination
const getAllBMIData = async (page = 1, limit = 50) => {
  try {
    const offset = (page - 1) * limit;
    
    const query = `
      SELECT * FROM bmi_data 
      ORDER BY timestamp DESC 
      LIMIT $1 OFFSET $2
    `;
    
    const countQuery = 'SELECT COUNT(*) FROM bmi_data';
    
    const [dataResult, countResult] = await Promise.all([
      db.query(query, [limit, offset]),
      db.query(countQuery)
    ]);
    
    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    
    return {
      success: true,
      data: {
        bmiData: dataResult.rows,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit
        }
      }
    };
  } catch (error) {
    console.error('Error fetching all BMI data:', error);
    return { success: false, error: error.message };
  }
};

// Get BMI statistics
const getBMIStatistics = async () => {
  try {
    const query = `
      SELECT 
        category,
        COUNT(*) as count,
        AVG(bmi) as avg_bmi,
        MIN(bmi) as min_bmi,
        MAX(bmi) as max_bmi
      FROM bmi_data 
      GROUP BY category
      ORDER BY category
    `;
    
    const result = await db.query(query);
    return { success: true, data: result.rows };
  } catch (error) {
    console.error('Error fetching BMI statistics:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  storeBMIData,
  getBMIDataByDevice,
  getAllBMIData,
  getBMIStatistics
};

