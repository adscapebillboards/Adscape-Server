const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const asset = await prisma.defaultAsset.findFirst({ where: { isActive: true } });
    console.log('Global Default Asset:', asset);
    const billboard = await prisma.billboard.findFirst();
    console.log('Sample Billboard Defaults:', {
      defaultAssetUrl: billboard?.defaultAssetUrl,
      slot10Enabled: billboard?.slot10Enabled,
      slot10AssetUrl: billboard?.slot10AssetUrl
    });
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

check();
