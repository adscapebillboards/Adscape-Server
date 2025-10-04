const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Verify user statistics update
async function verifyUserStats() {
  try {
    console.log('🔍 Verifying User Statistics Update...\n');

    const userEmail = 'srinnivassh@gmail.com';
    
    // 1. Get user data
    console.log(`1. Getting user: ${userEmail}`);
    const user = await prisma.user.findUnique({
      where: { email: userEmail }
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log(`   User ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Total Bookings: ${user.totalbookings}`);
    console.log(`   Last Booking: ${user.lastbooking}`);
    console.log(`   Total Spent: ${user.totalspent}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Join Date: ${user.joindate}`);

    // 2. Check campaign data
    console.log('\n2. Checking campaign data...');
    const campaigns = await prisma.campaign.findMany({
      where: { userName: userEmail }
    });

    console.log(`   Total campaigns: ${campaigns.length}`);
    campaigns.forEach((campaign, index) => {
      console.log(`   Campaign ${index + 1}:`);
      console.log(`     ID: ${campaign.id}`);
      console.log(`     Status: ${campaign.status}`);
      console.log(`     Total Amount: ${campaign.totalAmount}`);
      console.log(`     Created: ${campaign.createdAt}`);
    });

    // 3. Check generated slots
    console.log('\n3. Checking generated slots...');
    
    // Get all campaigns for the user first
    const userCampaignIds = campaigns.map(c => c.id);
    const totalSlots = await prisma.generatedSlot.count({
      where: {
        campaignId: {
          in: userCampaignIds
        }
      }
    });

    console.log(`   Total slots across all campaigns: ${totalSlots}`);

    // 4. Summary
    console.log('\n📊 Summary:');
    console.log(`   User has ${user.totalbookings || 0} total bookings`);
    console.log(`   User has ${campaigns.length} campaigns`);
    console.log(`   User has ${totalSlots} generated slots`);
    
    if (user.totalbookings > 0) {
      console.log('   ✅ User statistics updated successfully!');
    } else {
      console.log('   ⚠️  User statistics may not be updated');
    }

    console.log('\n🎯 Verification completed!');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the verification
if (require.main === module) {
  verifyUserStats();
}

module.exports = { verifyUserStats };


// Verify user statistics update
async function verifyUserStats() {
  try {
    console.log('🔍 Verifying User Statistics Update...\n');

    const userEmail = 'srinnivassh@gmail.com';
    
    // 1. Get user data
    console.log(`1. Getting user: ${userEmail}`);
    const user = await prisma.user.findUnique({
      where: { email: userEmail }
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log(`   User ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Total Bookings: ${user.totalbookings}`);
    console.log(`   Last Booking: ${user.lastbooking}`);
    console.log(`   Total Spent: ${user.totalspent}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Join Date: ${user.joindate}`);

    // 2. Check campaign data
    console.log('\n2. Checking campaign data...');
    const campaigns = await prisma.campaign.findMany({
      where: { userName: userEmail }
    });

    console.log(`   Total campaigns: ${campaigns.length}`);
    campaigns.forEach((campaign, index) => {
      console.log(`   Campaign ${index + 1}:`);
      console.log(`     ID: ${campaign.id}`);
      console.log(`     Status: ${campaign.status}`);
      console.log(`     Total Amount: ${campaign.totalAmount}`);
      console.log(`     Created: ${campaign.createdAt}`);
    });

    // 3. Check generated slots
    console.log('\n3. Checking generated slots...');
    
    // Get all campaigns for the user first
    const userCampaignIds = campaigns.map(c => c.id);
    const totalSlots = await prisma.generatedSlot.count({
      where: {
        campaignId: {
          in: userCampaignIds
        }
      }
    });

    console.log(`   Total slots across all campaigns: ${totalSlots}`);

    // 4. Summary
    console.log('\n📊 Summary:');
    console.log(`   User has ${user.totalbookings || 0} total bookings`);
    console.log(`   User has ${campaigns.length} campaigns`);
    console.log(`   User has ${totalSlots} generated slots`);
    
    if (user.totalbookings > 0) {
      console.log('   ✅ User statistics updated successfully!');
    } else {
      console.log('   ⚠️  User statistics may not be updated');
    }

    console.log('\n🎯 Verification completed!');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the verification
if (require.main === module) {
  verifyUserStats();
}

module.exports = { verifyUserStats };


