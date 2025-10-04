const prisma = require('../db/db');
const logger = require('../config/logger');

async function ensurePlayerScreenTable(prisma) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PlayerScreen" (
        id text PRIMARY KEY DEFAULT gen_random_uuid(),
        "machineId" text UNIQUE NOT NULL,
        "screenId" text UNIQUE NOT NULL,
        resolution text,
        os text,
        "appVersion" text,
        "ipAddress" text,
        "lastActive" timestamptz DEFAULT now(),
        "statinfo" text DEFAULT 'active',
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now()
      );
    `);
    
    // Add new columns if they don't exist (for existing tables)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PlayerScreen" 
      ADD COLUMN IF NOT EXISTS id text DEFAULT gen_random_uuid();
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PlayerScreen" 
      ADD COLUMN IF NOT EXISTS "lastActive" timestamptz DEFAULT now();
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PlayerScreen" 
      ADD COLUMN IF NOT EXISTS "statinfo" text DEFAULT 'active';
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PlayerScreen" 
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();
    `);
    // Backward-compat: some triggers may reference snake_case updated_at
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PlayerScreen"
      ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
    `);
  } catch (e) {
    // Ignore
  }
}

// POST /api/players/register
// Body: { machineId, screenId?, resolution?, os?, appVersion?, ipAddress? }
exports.registerPlayer = async (req, res) => {
  try {
    const { machineId, screenId, resolution, os, appVersion, ipAddress } = req.body || {};
    if (!machineId) return res.status(400).json({ error: 'machineId is required' });

    const data = {
      machineId: String(machineId),
      screenId: screenId ? String(screenId) : String(machineId),
      resolution: resolution || null,
      os: os || null,
      appVersion: appVersion || null,
      ipAddress: ipAddress || req.ip || null,
    };

    await ensurePlayerScreenTable(prisma);
    // Ensure screenId uniqueness by removing conflicting rows
    await prisma.$executeRawUnsafe(
      `DELETE FROM "PlayerScreen" WHERE "screenId" = $1 AND "machineId" <> $2`,
      data.screenId,
      data.machineId
    );
    // Upsert using SQL to avoid Prisma client model dependency
    const result = await prisma.$executeRawUnsafe(
      `INSERT INTO "PlayerScreen" (id,"machineId","screenId",resolution,os,"appVersion","ipAddress","lastActive","statinfo")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,now(),'active')
       ON CONFLICT ("machineId") DO UPDATE SET
         "screenId"=EXCLUDED."screenId",
         resolution=EXCLUDED.resolution,
         os=EXCLUDED.os,
         "appVersion"=EXCLUDED."appVersion",
         "ipAddress"=EXCLUDED."ipAddress",
         "lastActive"=now(),
         "statinfo"='active',
         "updatedAt"=now(),
         "updated_at"=now()
      `,
      data.machineId,
      data.screenId,
      data.resolution,
      data.os,
      data.appVersion,
      data.ipAddress
    );
    logger.info('Player registered/updated', data.machineId);
    res.json({ success: true, machineId: data.machineId, screenId: data.screenId });
  } catch (error) {
    logger.error('Player register error:', error);
    res.status(500).json({ error: 'Registration failed', message: error?.message });
  }
};

// Function to check and update player status based on last active time
exports.updatePlayerStatus = async (req, res) => {
  try {
    const { machineId } = req.body;
    if (!machineId) return res.status(400).json({ error: 'machineId is required' });

    await ensurePlayerScreenTable(prisma);
    
    // Update lastActive and check if player should be marked as inactive
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "PlayerScreen" 
       SET "lastActive" = now(),
           "statinfo" = CASE 
             WHEN "lastActive" < now() - interval '32 hours' THEN 'inactive'
             ELSE 'active'
           END,
           "updatedAt" = now(),
           "updated_at" = now()
       WHERE "machineId" = $1
       RETURNING "statinfo", "lastActive"`,
      machineId
    );
    
    logger.info('Player status updated', { machineId, result });
    res.json({ success: true, machineId, status: result });
  } catch (error) {
    logger.error('Player status update error:', error);
    res.status(500).json({ error: 'Status update failed', message: error?.message });
  }
};

// Function to get player status
exports.getPlayerStatus = async (req, res) => {
  try {
    const { machineId } = req.params;
    if (!machineId) return res.status(400).json({ error: 'machineId is required' });

    await ensurePlayerScreenTable(prisma);
    
    const result = await prisma.$queryRawUnsafe(
      `SELECT "machineId", "screenId", "lastActive", "statinfo", "createdAt", "updatedAt"
       FROM "PlayerScreen" 
       WHERE "machineId" = $1`,
      machineId
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    res.json({ success: true, player: result[0] });
  } catch (error) {
    logger.error('Get player status error:', error);
    res.status(500).json({ error: 'Failed to get player status', message: error?.message });
  }
};

// Function to get all players status
exports.getAllPlayersStatus = async (req, res) => {
  try {
    await ensurePlayerScreenTable(prisma);
    
    const result = await prisma.$queryRawUnsafe(
      `SELECT "machineId", "screenId", "lastActive", "statinfo", "createdAt", "updatedAt"
       FROM "PlayerScreen" 
       ORDER BY "lastActive" DESC`
    );
    
    res.json({ success: true, players: result });
  } catch (error) {
    logger.error('Get all players status error:', error);
    res.status(500).json({ error: 'Failed to get players status', message: error?.message });
  }
};

// Function to get player screen data by billboard ID (screenId)
exports.getPlayerScreenByBillboardId = async (req, res) => {
  try {
    const { billboardId } = req.params;
    if (!billboardId) return res.status(400).json({ error: 'billboardId is required' });

    await ensurePlayerScreenTable(prisma);
    
    const result = await prisma.$queryRawUnsafe(
      `SELECT "machineId", "screenId", "lastActive", "statinfo", "createdAt", "updatedAt", 
              resolution, os, "appVersion", "ipAddress"
       FROM "PlayerScreen" 
       WHERE "screenId" = $1
       ORDER BY "lastActive" DESC
       LIMIT 1`,
      billboardId
    );
    
    if (result.length === 0) {
      return res.json({ success: true, playerScreen: null, message: 'No player screen data found for this billboard' });
    }
    
    res.json({ success: true, playerScreen: result[0] });
  } catch (error) {
    logger.error('Get player screen by billboard ID error:', error);
    res.status(500).json({ error: 'Failed to get player screen data', message: error?.message });
  }
};



