const prisma = require('./db/db');

async function createDefaultAsset() {
  try {
    // Create default asset table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DefaultAsset" (
        id SERIAL PRIMARY KEY,
        "assetUrl" text NOT NULL,
        "assetName" text,
        "assetType" text DEFAULT 'image',
        "duration" integer DEFAULT 10,
        "isActive" boolean DEFAULT true,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now()
      );
    `);

    // Insert a sample default asset
    const result = await prisma.$executeRawUnsafe(`
      INSERT INTO "DefaultAsset" ("assetUrl", "assetName", "assetType", "duration", "isActive")
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
      RETURNING *`,
      'https://via.placeholder.com/1920x1080/000000/FFFFFF?text=Default+Asset',
      'Default Billboard Asset',
      'image',
      15,
      true
    );

    console.log('Default asset created successfully');
    console.log('Result:', result);
  } catch (error) {
    console.error('Error creating default asset:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createDefaultAsset();








