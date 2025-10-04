#!/usr/bin/env node

/**
 * Test Script: Campaign Approval Automation
 * 
 * This script tests the complete workflow:
 * 1. Creating a test campaign with multiple billboards
 * 2. Approving billboards one by one
 * 3. Verifying campaign status updates
 * 4. Checking slot generation
 * 5. Validating user metric updates
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test configuration
const TEST_CONFIG = {
  campaignName: 'Test Automation Campaign',
  userEmail: 'test@example.com',
  billboardCount: 3,
  maxSlotsPerDay: 8
};

// Helper function to create test user
async function createTestUser() {
  try {
    const user = await prisma.user.upsert({
      where: { email: TEST_CONFIG.userEmail },
      update: {},
      create: {
        email: TEST_CONFIG.userEmail,
        name: 'Test User',
        status: 'active',
        totalbookings: 0,
        totalspent: '0'
      }
    });
    
    console.log('✅ Test user created/updated:', user.email);
    return user;
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    throw error;
  }
}

// Helper function to create test billboards
async function createTestBillboards() {
  const billboards = [];
  
  for (let i = 0; i < TEST_CONFIG.billboardCount; i++) {
    const billboard = {
      id: `test-billboard-${i + 1}`,
      location: `Test Location ${i + 1}`,
      city: `Test City ${i + 1}`,
      state: 'Test State',
      type: 'LED',
      width: 10,
      height: 5,
      unit: 'feet',
      size_category: 'Medium',
      orientation: 'landscape',
      daily_viewership: 1000,
      price_per_day: 100,
      available: true,
      images: [`https://example.com/image${i + 1}.jpg`],
      coordinates: { lat: 40.7128, lng: -74.0060 },
      screen_id: `screen-${i + 1}`,
      status: 'PENDING',
      totalPrice: 700, // 7 days * $100
      bookingDetails: {
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
        files: [`https://example.com/asset${i + 1}.mp4`]
      },
      files: [`https://example.com/asset${i + 1}.mp4`]
    };
    
    billboards.push(billboard);
  }
  
  console.log(`✅ Created ${billboards.length} test billboards`);
  return billboards;
}

// Helper function to create test campaign
async function createTestCampaign(user, billboards) {
  try {
    const totalAmount = billboards.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    
    const campaign = await prisma.campaign.create({
      data: {
        id: 'test-campaign-automation',
        campaignName: TEST_CONFIG.campaignName,
        userName: user.email,
        owner: user.email,
        status: 'pending',
        totalAmount: totalAmount,
        billboards: billboards,
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    
    console.log('✅ Test campaign created:', campaign.id);
    console.log(`   Status: ${campaign.status}`);
    console.log(`   Total Amount: $${campaign.totalAmount}`);
    console.log(`   Billboards: ${billboards.length}`);
    
    return campaign;
  } catch (error) {
    console.error('❌ Error creating test campaign:', error);
    throw error;
  }
}

// Helper function to approve billboards one by one
async function approveBillboardsSequentially(campaignId, billboards) {
  console.log('\n🔄 Starting sequential billboard approval...');
  
  for (let i = 0; i < billboards.length; i++) {
    const billboard = billboards[i];
    console.log(`\n📋 Approving billboard ${i + 1}/${billboards.length}: ${billboard.id}`);
    
    try {
      // Update billboard status to APPROVED
      const updatedBillboards = billboards.map((b, index) => {
        if (index === i) {
          return { ...b, status: 'APPROVED', updatedAt: new Date().toISOString() };
        }
        return b;
      });
      
      // Update campaign with new billboard statuses
      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: { billboards: updatedBillboards }
      });
      
      // Check campaign status after update
      const campaignAfterUpdate = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true, billboards: true }
      });
      
      const approvedCount = updatedBillboards.filter(b => b.status === 'APPROVED').length;
      const totalCount = updatedBillboards.length;
      
      console.log(`   ✅ Billboard ${billboard.id} approved`);
      console.log(`   📊 Campaign status: ${campaignAfterUpdate.status}`);
      console.log(`   📈 Approved: ${approvedCount}/${totalCount}`);
      
      // Wait a moment for database triggers to execute
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if campaign status was automatically updated
      const finalCampaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true }
      });
      
      if (finalCampaign.status === 'APPROVED') {
        console.log(`   🎉 Campaign automatically approved after ${approvedCount} billboards!`);
        break; // All billboards are now approved
      }
      
      // Update local billboards array for next iteration
      billboards = updatedBillboards;
      
    } catch (error) {
      console.error(`   ❌ Error approving billboard ${billboard.id}:`, error);
      throw error;
    }
  }
}

// Helper function to verify slot generation
async function verifySlotGeneration(campaignId, billboards) {
  console.log('\n🔍 Verifying slot generation...');
  
  try {
    const slots = await prisma.generatedSlot.findMany({
      where: { campaignId: campaignId }
    });
    
    console.log(`   📊 Total slots generated: ${slots.length}`);
    
    // Group slots by billboard
    const slotsByBillboard = {};
    slots.forEach(slot => {
      if (!slotsByBillboard[slot.billboardId]) {
        slotsByBillboard[slot.billboardId] = [];
      }
      slotsByBillboard[slot.billboardId].push(slot);
    });
    
    // Verify slots for each approved billboard
    for (const billboard of billboards) {
      if (billboard.status === 'APPROVED') {
        const billboardSlots = slotsByBillboard[billboard.id] || [];
        const expectedDays = Math.ceil(
          (new Date(billboard.bookingDetails.endDate) - new Date(billboard.bookingDetails.startDate)) / (1000 * 60 * 60 * 24)
        ) + 1;
        const expectedSlots = expectedDays * TEST_CONFIG.maxSlotsPerDay;
        
        console.log(`   📍 Billboard ${billboard.id}:`);
        console.log(`      Generated: ${billboardSlots.length} slots`);
        console.log(`      Expected: ${expectedSlots} slots (${expectedDays} days × ${TEST_CONFIG.maxSlotsPerDay} slots/day)`);
        
        if (billboardSlots.length === expectedSlots) {
          console.log(`      ✅ Slot generation successful`);
        } else {
          console.log(`      ⚠️  Slot generation incomplete`);
        }
      }
    }
    
    return slots;
  } catch (error) {
    console.error('   ❌ Error verifying slot generation:', error);
    throw error;
  }
}

// Helper function to verify user metrics
async function verifyUserMetrics(userEmail) {
  console.log('\n👤 Verifying user metrics...');
  
  try {
    const user = await prisma.user.findUnique({
      where: { email: userEmail }
    });
    
    if (!user) {
      console.log('   ❌ User not found');
      return;
    }
    
    console.log(`   📊 User: ${user.email}`);
    console.log(`   📈 Total Bookings: ${user.totalbookings}`);
    console.log(`   💰 Total Spent: $${user.totalspent}`);
    console.log(`   📅 Last Booking: ${user.lastbooking}`);
    console.log(`   🟢 Status: ${user.status}`);
    
    // Verify metrics were updated
    if (user.totalbookings > 0 && parseFloat(user.totalspent) > 0) {
      console.log('   ✅ User metrics updated successfully');
    } else {
      console.log('   ⚠️  User metrics may not have been updated');
    }
    
    return user;
  } catch (error) {
    console.error('   ❌ Error verifying user metrics:', error);
    throw error;
  }
}

// Helper function to clean up test data
async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    // Delete generated slots
    const deletedSlots = await prisma.generatedSlot.deleteMany({
      where: { campaignId: 'test-campaign-automation' }
    });
    console.log(`   🗑️  Deleted ${deletedSlots.count} generated slots`);
    
    // Delete test campaign
    const deletedCampaign = await prisma.campaign.delete({
      where: { id: 'test-campaign-automation' }
    });
    console.log(`   🗑️  Deleted test campaign: ${deletedCampaign.id}`);
    
    // Reset user metrics
    await prisma.user.update({
      where: { email: TEST_CONFIG.userEmail },
      data: {
        totalbookings: 0,
        totalspent: '0',
        lastbooking: null
      }
    });
    console.log(`   🔄 Reset user metrics for: ${TEST_CONFIG.userEmail}`);
    
    console.log('   ✅ Cleanup completed');
  } catch (error) {
    console.error('   ❌ Error during cleanup:', error);
  }
}

// Main test function
async function runAutomationTest() {
  console.log('🚀 Starting Campaign Approval Automation Test\n');
  
  try {
    // Step 1: Create test user
    const user = await createTestUser();
    
    // Step 2: Create test billboards
    const billboards = await createTestBillboards();
    
    // Step 3: Create test campaign
    const campaign = await createTestCampaign(user, billboards);
    
    // Step 4: Approve billboards sequentially
    await approveBillboardsSequentially(campaign.id, billboards);
    
    // Step 5: Verify slot generation
    const slots = await verifySlotGeneration(campaign.id, billboards);
    
    // Step 6: Verify user metrics
    const updatedUser = await verifyUserMetrics(user.email);
    
    // Step 7: Final verification
    console.log('\n🎯 Final Verification:');
    const finalCampaign = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: { status: true, billboards: true }
    });
    
    console.log(`   📋 Campaign Status: ${finalCampaign.status}`);
    console.log(`   📊 Total Billboards: ${finalCampaign.billboards.length}`);
    console.log(`   ✅ Approved Billboards: ${finalCampaign.billboards.filter(b => b.status === 'APPROVED').length}`);
    console.log(`   🎬 Generated Slots: ${slots.length}`);
    
    if (finalCampaign.status === 'APPROVED' && slots.length > 0) {
      console.log('\n🎉 SUCCESS: Campaign approval automation is working correctly!');
    } else {
      console.log('\n⚠️  WARNING: Some aspects of the automation may not be working as expected');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    // Cleanup test data
    await cleanupTestData();
    
    // Close database connection
    await prisma.$disconnect();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  runAutomationTest().catch(console.error);
}

module.exports = {
  runAutomationTest,
  createTestUser,
  createTestBillboards,
  createTestCampaign,
  approveBillboardsSequentially,
  verifySlotGeneration,
  verifyUserMetrics,
  cleanupTestData
};
