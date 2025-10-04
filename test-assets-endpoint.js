const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testAssetsEndpoint() {
    try {
        console.log('Testing assets endpoint...');
        
        // Check if there are any campaigns
        const campaigns = await prisma.campaign.findMany({
            include: {
                billboards: true
            }
        });
        
        console.log(`Found ${campaigns.length} campaigns:`);
        campaigns.forEach(campaign => {
            console.log(`- Campaign ${campaign.id}: ${campaign.name} (${campaign.billboards.length} billboards)`);
        });
        
        // Check if there are any generated slots
        const slots = await prisma.generatedSlot.findMany({
            take: 10
        });
        
        console.log(`\nFound ${slots.length} generated slots (showing first 10):`);
        slots.forEach(slot => {
            console.log(`- Slot ${slot.id}: screenId=${slot.screenId}, assetUrl=${slot.assetUrl}, slotNumber=${slot.slotNumber}`);
        });
        
        // Test the assets endpoint for a specific screen
        const testScreenId = '12345678'; // Use a test screen ID
        console.log(`\nTesting assets endpoint for screenId: ${testScreenId}`);
        
        const today = new Date().toISOString().slice(0, 10);
        const assetsForScreen = await prisma.generatedSlot.findMany({
            where: {
                screenId: testScreenId,
                startDate: {
                    gte: new Date(`${today}T00:00:00Z`),
                    lt: new Date(`${today}T23:59:59Z`)
                }
            },
            orderBy: {
                slotNumber: 'asc'
            }
        });
        
        console.log(`Found ${assetsForScreen.length} assets for screen ${testScreenId} today:`);
        assetsForScreen.forEach(asset => {
            console.log(`- Asset: ${asset.assetUrl} (slot: ${asset.slotNumber})`);
        });
        
        // If no assets found, let's create a test campaign and slots
        if (assetsForScreen.length === 0) {
            console.log('\nNo assets found. Creating test campaign and slots...');
            
            // Create a test campaign
            const testCampaign = await prisma.campaign.create({
                data: {
                    name: 'Test Campaign',
                    status: 'APPROVED',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
                    totalBudget: 1000,
                    dailyBudget: 100,
                    billboards: {
                        create: [
                            {
                                name: 'Test Billboard 1',
                                location: 'Test Location',
                                assetUrl: 'https://picsum.photos/800/600',
                                slotNumber: 1,
                                duration: 10
                            },
                            {
                                name: 'Test Billboard 2', 
                                location: 'Test Location 2',
                                assetUrl: 'https://picsum.photos/800/600?random=2',
                                slotNumber: 2,
                                duration: 10
                            }
                        ]
                    }
                }
            });
            
            console.log(`Created test campaign: ${testCampaign.id}`);
            
            // Generate slots for today
            const billboards = await prisma.billboard.findMany({
                where: { campaignId: testCampaign.id }
            });
            
            for (const billboard of billboards) {
                await prisma.generatedSlot.create({
                    data: {
                        screenId: testScreenId,
                        campaignId: testCampaign.id,
                        billboardId: billboard.id,
                        assetUrl: billboard.assetUrl,
                        slotNumber: billboard.slotNumber,
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
                        duration: billboard.duration || 10
                    }
                });
            }
            
            console.log(`Generated slots for screen ${testScreenId}`);
            
            // Check again
            const newAssets = await prisma.generatedSlot.findMany({
                where: {
                    screenId: testScreenId,
                    startDate: {
                        gte: new Date(`${today}T00:00:00Z`),
                        lt: new Date(`${today}T23:59:59Z`)
                    }
                }
            });
            
            console.log(`Now found ${newAssets.length} assets for screen ${testScreenId}:`);
            newAssets.forEach(asset => {
                console.log(`- Asset: ${asset.assetUrl} (slot: ${asset.slotNumber})`);
            });
        }
        
    } catch (error) {
        console.error('Error testing assets endpoint:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testAssetsEndpoint();

