const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Manual script to generate slots for approved billboards
async function manualSlotGeneration() {
  try {
    console.log('🔧 Manually Generating Slots...\n');

    const campaignId = '438f4d6e-7b1a-40b1-8432-0231ec1b5f55';

    // 1. Get the campaign
    console.log(`1. Getting campaign: ${campaignId}`);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      console.log('❌ Campaign not found');
      return;
    }

    console.log(`   Status: ${campaign.status}`);
    console.log(`   User: ${campaign.userName}`);

    // 2. Parse billboards
    let billboards = campaign.billboards;
    if (typeof billboards === 'string') {
      try {
        billboards = JSON.parse(billboards);
      } catch (error) {
        console.log(`❌ Error parsing billboards: ${error.message}`);
        return;
      }
    }

    console.log(`   Billboards: ${billboards.length}`);

    // 3. Find approved billboards and generate slots
    for (const billboard of billboards) {
      if (billboard.status?.toUpperCase() === 'APPROVED') {
        console.log(`\n2. Processing approved billboard: ${billboard.id}`);
        console.log(`   Status: ${billboard.status}`);
        console.log(`   Has bookingDetails: ${!!billboard.bookingDetails}`);
        console.log(`   Has files: ${!!billboard.files}`);

        if (billboard.bookingDetails) {
          console.log(`   Start Date: ${billboard.bookingDetails.startDate}`);
          console.log(`   End Date: ${billboard.bookingDetails.endDate}`);
        }

        if (billboard.files) {
          console.log(`   Files count: ${billboard.files.length}`);
          console.log(`   First file: ${billboard.files[0]}`);
        }

        // Check if slots already exist
        const existingSlots = await prisma.generatedSlot.count({
          where: {
            billboardId: billboard.id,
            campaignId: campaignId
          }
        });

        console.log(`   Existing slots: ${existingSlots}`);

        if (existingSlots === 0) {
          console.log(`   ✅ Generating slots for this billboard...`);

          // Check if we have required data
          if (!billboard.bookingDetails || !billboard.bookingDetails.startDate || !billboard.bookingDetails.endDate) {
            console.log(`   ❌ Missing booking details, skipping slot generation`);
            continue;
          }

          if (!billboard.files || billboard.files.length === 0) {
            console.log(`   ❌ Missing asset files, skipping slot generation`);
            continue;
          }

          // Generate slots
          try {
            let start = new Date(billboard.bookingDetails.startDate);
            const end = new Date(billboard.bookingDetails.endDate);

            // DEV OVERRIDE: Always generate slots starting from TODAY so players have immediate content
            const todayIST = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
            const [tm, td, ty] = todayIST.split('/');
            const todayUTC = new Date(`${ty}-${tm}-${td}T00:00:00.000Z`);

            if (todayUTC < start) {
              console.log(`   [DEV OVERRIDE] Shifting campaign start date backward to TODAY (${ty}-${tm}-${td}) for immediate playback`);
              start = todayUTC;
            }
            const assetUrl = billboard.files[0];
            let screen_id = billboard.screen_id || billboard.screenId;
            if (!screen_id && billboard.id) {
              const dbBillboard = await prisma.billboard.findUnique({ where: { id: billboard.id }, select: { screen_id: true } });
              screen_id = dbBillboard?.screen_id || null;
            }

            console.log(`   Generating slots from ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`);

            let totalSlotsGenerated = 0;

            // Generate slots for each day in the booking period
            for (
              let current = new Date(start);
              current <= end;
              current.setDate(current.getDate() + 1)
            ) {
              const dateStr = current.toISOString().slice(0, 10);

              // Check if we already have slots for this date
              const existingSlotsForDate = await prisma.generatedSlot.count({
                where: {
                  billboardId: billboard.id,
                  campaignId: campaignId,
                  startDate: {
                    gte: new Date(`${dateStr}T00:00:00Z`),
                    lt: new Date(`${dateStr}T23:59:59Z`)
                  }
                }
              });

              // Generate up to 8 slots per day
              const slotsToGenerate = Math.min(8 - existingSlotsForDate, 8);

              for (let i = 0; i < slotsToGenerate; i++) {
                const slotNumber = existingSlotsForDate + i + 1;
                const slotStart = new Date(`${dateStr}T00:00:00Z`);
                const slotEnd = new Date(`${dateStr}T23:59:59Z`);

                await prisma.generatedSlot.create({
                  data: {
                    campaignId,
                    billboardId: billboard.id,
                    assetUrl,
                    startDate: slotStart,
                    endDate: slotEnd,
                    duration: 1,
                    slotNumber,
                    screenId: screen_id
                  }
                });

                totalSlotsGenerated++;
                console.log(`     Created slot #${slotNumber} for ${dateStr}`);
              }
            }

            console.log(`   ✅ Successfully generated ${totalSlotsGenerated} slots`);

          } catch (slotError) {
            console.log(`   ❌ Error generating slots: ${slotError.message}`);
          }

        } else {
          console.log(`   ⚠️  Slots already exist for this billboard`);
        }
      }
    }

    // 4. Update user statistics
    console.log('\n3. Updating user statistics...');
    try {
      // Get the billboard total price for the approved billboard
      let billboardTotalPrice = 0;
      for (const billboard of billboards) {
        if (billboard.status?.toUpperCase() === 'APPROVED') {
          billboardTotalPrice = billboard.totalPrice || 0;
          break;
        }
      }

      console.log(`   Billboard total price: ${billboardTotalPrice}`);

      // Find the user by email
      const user = await prisma.user.findUnique({
        where: { email: campaign.userName }
      });

      if (user) {
        // Calculate new totals
        const currentTotalSpent = parseFloat(user.totalspent || '0');
        const newTotalSpent = currentTotalSpent + parseFloat(billboardTotalPrice || 0);
        const currentTotalBookings = user.totalbookings || 0;
        const newTotalBookings = currentTotalBookings + 1;

        // Update user statistics
        await prisma.user.update({
          where: { id: user.id },
          data: {
            totalbookings: newTotalBookings,
            lastbooking: new Date(),
            totalspent: newTotalSpent.toString(),
            status: 'active'
          }
        });

        console.log(`   ✅ User statistics updated for ${user.email}`);
        console.log(`   New total bookings: ${newTotalBookings}`);
        console.log(`   New total spent: ${newTotalSpent}`);
      } else {
        console.log(`   ⚠️  User not found: ${campaign.userName}`);
      }

    } catch (error) {
      console.log(`   ❌ Error updating user statistics: ${error.message}`);
    }

    // 5. Final verification
    console.log('\n4. Final verification...');
    const finalSlotCount = await prisma.generatedSlot.count({
      where: { campaignId: campaignId }
    });
    console.log(`   Total slots in database: ${finalSlotCount}`);

    const finalCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true }
    });
    console.log(`   Final campaign status: ${finalCampaign?.status}`);

    console.log('\n🎯 Manual slot generation completed!');

  } catch (error) {  } finally { await prisma.\(); } } if (require.main === module) { manualSlotGeneration(); } module.exports = { manualSlotGeneration };
