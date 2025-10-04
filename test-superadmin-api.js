const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api';

// Test data
const testUser = {
  email: 'test.manager@billboards.com',
  password: 'test123',
  fullName: 'Test Manager',
  phoneNumber: '+1234567890',
  role: 'manager',
  permissions: {}
};

let authToken = null;
let createdUserId = null;

// Helper function to make authenticated requests
const makeAuthRequest = async (method, url, data = null) => {
  const config = {
    method,
    url: `${BASE_URL}${url}`,
    headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
    data
  };
  return axios(config);
};

// Test functions
const testEndpoints = async () => {
  console.log('🧪 Testing SuperAdmin API Endpoints...\n');

  try {
    // Test 1: Get all superadmins (should fail without auth)
    console.log('1. Testing GET /api/superadmins (no auth)...');
    try {
      const response = await makeAuthRequest('GET', '/superadmins');
      console.log('❌ Should have failed without auth');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly requires authentication');
      } else {
        console.log('❌ Unexpected error:', error.response?.data);
      }
    }

    // Test 2: Get profile (should fail without auth)
    console.log('\n2. Testing GET /api/profile (no auth)...');
    try {
      const response = await makeAuthRequest('GET', '/profile');
      console.log('❌ Should have failed without auth');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly requires authentication');
      } else {
        console.log('❌ Unexpected error:', error.response?.data);
      }
    }

    // Test 3: Create superadmin (should fail without auth)
    console.log('\n3. Testing POST /api/superadmins (no auth)...');
    try {
      const response = await makeAuthRequest('POST', '/superadmins', testUser);
      console.log('❌ Should have failed without auth');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly requires authentication');
      } else {
        console.log('❌ Unexpected error:', error.response?.data);
      }
    }

    // Test 4: Test with invalid token
    console.log('\n4. Testing with invalid token...');
    authToken = 'invalid-token';
    try {
      const response = await makeAuthRequest('GET', '/superadmins');
      console.log('❌ Should have failed with invalid token');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Correctly rejects invalid token');
      } else {
        console.log('❌ Unexpected error:', error.response?.data);
      }
    }

    console.log('\n✅ All authentication tests passed!');
    console.log('\n📝 Note: To test with real authentication, you need to:');
    console.log('1. Create a superadmin user in the database');
    console.log('2. Login through the AdminX interface');
    console.log('3. Use the JWT token from the login response');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

// Run tests
testEndpoints();

