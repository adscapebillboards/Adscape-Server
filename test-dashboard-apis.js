const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api';

// Test admin dashboard stats
async function testAdminDashboardStats() {
  try {
    console.log('Testing admin dashboard stats...');
    const response = await axios.get(`${BASE_URL}/admin-dashboard-stats`);
    console.log('✅ Admin dashboard stats:', {
      totalBillboards: response.data.totalBillboards,
      totalPublishers: response.data.totalPublishers,
      totalBookings: response.data.totalBookings,
      totalRevenue: response.data.totalRevenue,
      billboardStatus: response.data.billboardStatus
    });
  } catch (error) {
    console.error('❌ Admin dashboard stats error:', error.response?.data || error.message);
  }
}

// Test admin revenue series
async function testAdminRevenueSeries() {
  try {
    console.log('Testing admin revenue series...');
    const response = await axios.get(`${BASE_URL}/admin-revenue-series?period=month`);
    console.log('✅ Admin revenue series:', response.data);
  } catch (error) {
    console.error('❌ Admin revenue series error:', error.response?.data || error.message);
  }
}

// Test admin top performers
async function testAdminTopPerformers() {
  try {
    console.log('Testing admin top performers...');
    const response = await axios.get(`${BASE_URL}/admin-top-performers`);
    console.log('✅ Admin top performers:', response.data);
  } catch (error) {
    console.error('❌ Admin top performers error:', error.response?.data || error.message);
  }
}

// Test publisher dashboard stats (requires authentication)
async function testPublisherDashboardStats() {
  try {
    console.log('Testing publisher dashboard stats...');
    // This will fail without proper authentication, but we can see the endpoint exists
    const response = await axios.get(`${BASE_URL}/publisher-dashboard-stats`);
    console.log('✅ Publisher dashboard stats:', response.data);
  } catch (error) {
    console.error('❌ Publisher dashboard stats error (expected without auth):', error.response?.status);
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Testing Dashboard APIs...\n');
  
  await testAdminDashboardStats();
  console.log('');
  
  await testAdminRevenueSeries();
  console.log('');
  
  await testAdminTopPerformers();
  console.log('');
  
  await testPublisherDashboardStats();
  console.log('');
  
  console.log('✅ Dashboard API tests completed!');
}

runTests().catch(console.error);
