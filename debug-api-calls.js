const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugApiCalls() {
  try {
    console.log('🔍 Debugging API calls and data flow...\n');
    
    // Get all campaigns with billboards
    const campaigns = await prisma.campaign.findMany({
      select: {
        id: true,
        status: true,
        billboards: true,
        updatedAt: true
      }
    });
    
    console.log(`📊 Found ${campaigns.length} campaigns:`);
    
    campaigns.forEach((campaign, index) => {
      console.log(`\n${index + 1}. Campaign ID: ${campaign.id}`);
      console.log(`   Status: ${campaign.status}`);
      console.log(`   Updated: ${campaign.updatedAt}`);
      
      if (campaign.billboards && Array.isArray(campaign.billboards)) {
        console.log(`   Billboards: ${campaign.billboards.length}`);
        
        campaign.billboards.forEach((billboard, bIndex) => {
          console.log(`     ${bIndex + 1}. Billboard ID: ${billboard.id}`);
          console.log(`        Status: "${billboard.status}" (type: ${typeof billboard.status})`);
          console.log(`        Expected: "APPROVED" (uppercase)`);
          console.log(`        Status Match: ${billboard.status === 'APPROVED' ? '✅ YES' : '❌ NO'}`);
          
          if (billboard.bookingDetails) {
            console.log(`        Start Date: ${billboard.bookingDetails.startDate}`);
            console.log(`        End Date: ${billboard.bookingDetails.endDate}`);
          }
          
          if (billboard.files) {
            console.log(`        Files: ${billboard.files.length} files`);
          }
          
          console.log(`        Screen ID: ${billboard.screen_id || 'MISSING'}`);
        });
      }
    });
    
    // Check for campaigns that should be approved but aren't
    console.log('\n🔍 Analyzing approval status...');
    
    campaigns.forEach(campaign => {
      if (campaign.billboards && Array.isArray(campaign.billboards)) {
        const totalBillboards = campaign.billboards.length;
        const approvedBillboards = campaign.billboards.filter(b => 
          b.status && b.status.toUpperCase() === 'APPROVED'
        ).length;
        
        console.log(`\n📋 Campaign ${campaign.id}:`);
        console.log(`   Current Status: ${campaign.status}`);
        console.log(`   Total Billboards: ${totalBillboards}`);
        console.log(`   Approved Billboards: ${approvedBillboards}`);
        console.log(`   All Approved: ${totalBillboards === approvedBillboards ? '✅ YES' : '❌ NO'}`);
        
        if (totalBillboards === approvedBillboards && campaign.status !== 'APPROVED') {
          console.log(`   ⚠️  ISSUE: All billboards approved but campaign status is ${campaign.status}`);
        }
        
        // Check individual billboard statuses
        campaign.billboards.forEach(billboard => {
          if (billboard.status && billboard.status.toUpperCase() !== 'APPROVED') {
            console.log(`   📍 Billboard ${billboard.id}: Status "${billboard.status}" (not APPROVED)`);
          }
        });
      }
    });
    
    // Check generated slots
    console.log('\n🎬 Checking generated slots...');
    const slots = await prisma.generatedSlot.findMany({
      select: {
        id: true,
        campaignId: true,
        billboardId: true,
        startDate: true,
        endDate: true
      }
    });
    
    console.log(`   Total slots: ${slots.length}`);
    if (slots.length > 0) {
      slots.forEach(slot => {
        console.log(`     Slot ${slot.id}: Campaign ${slot.campaignId}, Billboard ${slot.billboardId}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error debugging:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugApiCalls();
