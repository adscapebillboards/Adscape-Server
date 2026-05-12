const prisma = require('../db/db');
const logger = require('../config/logger');

async function ensureDefaultAssetTable(prisma) {
  try {
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
  } catch (e) {
    logger.error('Error creating DefaultAsset table:', e);
  }
}

// GET /api/default-asset
exports.getDefaultAsset = async (req, res) => {
  try {
    await ensureDefaultAssetTable(prisma);
    
    const result = await prisma.$queryRawUnsafe(
      `SELECT * FROM "DefaultAsset" WHERE "isActive" = true ORDER BY "createdAt" DESC LIMIT 1`
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'No default asset found' });
    }
    
    res.json({ success: true, defaultAsset: result[0] });
  } catch (error) {
    logger.error('Get default asset error:', error);
    res.status(500).json({ error: 'Failed to get default asset', message: error?.message });
  }
};

// GET /api/default-asset/check-update
exports.checkDefaultAssetUpdate = async (req, res) => {
  try {
    const { lastUpdate } = req.query;
    
    await ensureDefaultAssetTable(prisma);
    
    let query = `SELECT id, "assetUrl", "assetName", "assetType", "duration", "isActive", "updatedAt" FROM "DefaultAsset" WHERE "isActive" = true ORDER BY "createdAt" DESC LIMIT 1`;
    let params = [];
    
    // If lastUpdate is provided, only return if there's an update
    if (lastUpdate) {
      query = `SELECT id, "assetUrl", "assetName", "assetType", "duration", "isActive", "updatedAt" FROM "DefaultAsset" WHERE "isActive" = true AND "updatedAt" > $1::timestamptz ORDER BY "createdAt" DESC LIMIT 1`;
      params = [lastUpdate];
    }
    
    const result = await prisma.$queryRawUnsafe(query, ...params);
    
    if (result.length === 0) {
      return res.json({ success: true, hasUpdate: false, message: 'No updates available' });
    }
    
    res.json({ 
      success: true, 
      hasUpdate: true, 
      defaultAsset: result[0],
      message: 'Update available'
    });
  } catch (error) {
    logger.error('Check default asset update error:', error);
    res.status(500).json({ error: 'Failed to check default asset update', message: error?.message });
  }
};

// POST /api/default-asset
exports.createDefaultAsset = async (req, res) => {
  try {
    const { assetUrl, assetName, assetType = 'image', duration = 10 } = req.body;
    if (!assetUrl) return res.status(400).json({ error: 'assetUrl is required' });

    await ensureDefaultAssetTable(prisma);
    
    // Deactivate previous active default assets
    await prisma.$executeRawUnsafe(`UPDATE "DefaultAsset" SET "isActive" = false WHERE "isActive" = true`);
    
    const result = await prisma.$executeRawUnsafe(
      `INSERT INTO "DefaultAsset" ("assetUrl", "assetName", "assetType", "duration", "isActive")
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      assetUrl, assetName, assetType, duration
    );
    
    // Update existing default slots
    await prisma.$executeRawUnsafe(
      `UPDATE "daily_slots" SET "asset_url" = $1 WHERE "campaign_id" IS NULL`,
      assetUrl
    );
    
    // Broadcast to connected players
    try {
      const io = req.app.get('io');
      if (io) {
        const { getPlaylistForScreen } = require('../utils/socketHelpers');
        const bbs = await prisma.$queryRawUnsafe(`SELECT screen_id FROM billboards WHERE screen_id IS NOT NULL`);
        for (const bb of bbs) {
          const { playlist, date } = await getPlaylistForScreen(bb.screen_id);
          io.to(`screen:${bb.screen_id}`).emit('playlist', { screenId: bb.screen_id, playlist, date });
        }
      }
    } catch(e) {
      logger.error('Failed to broadcast new default asset', e);
    }
    
    logger.info('Default asset created', { assetUrl, assetName });
    res.json({ success: true, defaultAsset: result[0] });
  } catch (error) {
    logger.error('Create default asset error:', error);
    res.status(500).json({ error: 'Failed to create default asset', message: error?.message });
  }
};

// PUT /api/default-asset/:id
exports.updateDefaultAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const { assetUrl, assetName, assetType, duration, isActive } = req.body;
    
    if (!id) return res.status(400).json({ error: 'Asset ID is required' });

    await ensureDefaultAssetTable(prisma);
    
    const updateFields = [];
    const values = [];
    let paramCount = 1;
    
    if (assetUrl !== undefined) {
      updateFields.push(`"assetUrl" = $${paramCount++}`);
      values.push(assetUrl);
    }
    if (assetName !== undefined) {
      updateFields.push(`"assetName" = $${paramCount++}`);
      values.push(assetName);
    }
    if (assetType !== undefined) {
      updateFields.push(`"assetType" = $${paramCount++}`);
      values.push(assetType);
    }
    if (duration !== undefined) {
      updateFields.push(`"duration" = $${paramCount++}`);
      values.push(duration);
    }
    if (isActive !== undefined) {
      updateFields.push(`"isActive" = $${paramCount++}`);
      values.push(isActive);
    }
    
    updateFields.push(`"updatedAt" = now()`);
    values.push(id);
    
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "DefaultAsset" 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      ...values
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Default asset not found' });
    }
    
    if (assetUrl) {
      // Update existing default slots
      await prisma.$executeRawUnsafe(
        `UPDATE "daily_slots" SET "asset_url" = $1 WHERE "campaign_id" IS NULL`,
        assetUrl
      );
      
      // Broadcast to connected players
      try {
        const io = req.app.get('io');
        if (io) {
          const { getPlaylistForScreen } = require('../utils/socketHelpers');
          const bbs = await prisma.$queryRawUnsafe(`SELECT screen_id FROM billboards WHERE screen_id IS NOT NULL`);
          for (const bb of bbs) {
            const { playlist, date } = await getPlaylistForScreen(bb.screen_id);
            io.to(`screen:${bb.screen_id}`).emit('playlist', { screenId: bb.screen_id, playlist, date });
          }
        }
      } catch(e) {
        logger.error('Failed to broadcast new default asset', e);
      }
    }
    
    logger.info('Default asset updated', { id, assetUrl });
    res.json({ success: true, defaultAsset: result[0] });
  } catch (error) {
    logger.error('Update default asset error:', error);
    res.status(500).json({ error: 'Failed to update default asset', message: error?.message });
  }
};

// DELETE /api/default-asset/:id
exports.deleteDefaultAsset = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) return res.status(400).json({ error: 'Asset ID is required' });

    await ensureDefaultAssetTable(prisma);
    
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM "DefaultAsset" WHERE id = $1 RETURNING *`,
      id
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Default asset not found' });
    }
    
    logger.info('Default asset deleted', { id });
    res.json({ success: true, message: 'Default asset deleted successfully' });
  } catch (error) {
    logger.error('Delete default asset error:', error);
    res.status(500).json({ error: 'Failed to delete default asset', message: error?.message });
  }
};
