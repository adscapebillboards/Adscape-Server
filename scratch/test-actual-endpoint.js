const express = require('express');
const prisma = require('../db/db');

// Let's mock a request and response
async function simulateRoute(query, email) {
  let jsonResponse = null;
  let statusSet = null;

  const req = {
    user: { email: email, role: 'publisher' },
    query: query
  };

  const res = {
    status: function(code) {
      statusSet = code;
      return this;
    },
    json: function(data) {
      jsonResponse = data;
      return this;
    }
  };

  // Let's extract the handler function from publisherDashboard.js
  const publisherDashboardRouter = require('../routes/publisherDashboard');
  
  // Find the GET /publisher-revenue-series route handler
  const route = publisherDashboardRouter.stack.find(
    r => r.route && r.route.path === '/publisher-revenue-series'
  );

  if (!route) {
    console.error('Route /publisher-revenue-series not found!');
    return;
  }

  // Get the last middleware in the stack (which is the actual handler)
  const handler = route.route.stack[route.route.stack.length - 1].handle;

  console.log(`Running handler for query:`, query);
  try {
    await handler(req, res);
    console.log('Status code:', statusSet || 200);
    console.log('JSON Response length/keys:', jsonResponse ? Object.keys(jsonResponse) : 'null');
    if (jsonResponse && jsonResponse.error) {
      console.error('API Error:', jsonResponse.error);
    } else if (jsonResponse) {
      console.log('API Period:', jsonResponse.period);
      console.log('API Data count:', jsonResponse.data?.length);
      console.log('Sample Data:', jsonResponse.data?.slice(0, 3));
    }
  } catch (error) {
    console.error('Exception thrown in handler:', error);
  }
}

async function run() {
  try {
    const pub = await prisma.publisher.findFirst();
    if (!pub) {
      console.log('No publishers in database.');
      return;
    }
    
    // Test 1: Month
    await simulateRoute({ period: 'month' }, pub.email);
    console.log('--------------------------------------------------');
    
    // Test 2: Custom
    await simulateRoute({ period: 'custom', startDate: '2026-04-30', endDate: '2026-05-20' }, pub.email);

  } catch (err) {
    console.error('Run failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
