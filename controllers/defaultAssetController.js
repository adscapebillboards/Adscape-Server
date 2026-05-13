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
    const defaultAsset = await prisma.defaultAsset.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' }
    });
    
    if (!defaultAsset) {
      return res.status(404).json({ error: 'No default asset found' });
    }
    
    res.json({ success: true, defaultAsset });
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

    // Deactivate previous active default assets
    await prisma.defaultAsset.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    });
    
    // Create new default asset
    const defaultAsset = await prisma.defaultAsset.create({
      data: {
        assetUrl,
        assetName,
        assetType,
        duration,
        isActive: true
      }
    });
    
    // We don't perform a generic updateMany on DailySlot here anymore.
    // Instead, we broadcast the update to all connected players.
    // The reconciliation logic in socketHelpers.getPlaylistForScreen will fix the DB on-the-fly 
    // while correctly respecting billboard-specific defaults for each screen.
    
    // Broadcast to connected players
    try {
      const io = req.app.get('io');
      if (io) {
        const { getPlaylistForScreen } = require('../utils/socketHelpers');
        const billboards = await prisma.billboard.findMany({
          where: { screen_id: { not: null } },
          select: { screen_id: true }
        });
        
        for (const bb of billboards) {
          const { playlist, date } = await getPlaylistForScreen(bb.screen_id);
          io.to(`screen:${bb.screen_id}`).emit('playlist', { screenId: bb.screen_id, playlist, date });
        }
      }
    } catch(e) {
      logger.error('Failed to broadcast new default asset', e);
    }
    
    logger.info('Default asset created', { assetUrl, assetName });
    res.json({ success: true, defaultAsset });
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

    const defaultAsset = await prisma.defaultAsset.update({
      where: { id: parseInt(id) },
      data: {
        ...(assetUrl !== undefined ? { assetUrl } : {}),
        ...(assetName !== undefined ? { assetName } : {}),
        ...(assetType !== undefined ? { assetType } : {}),
        ...(duration !== undefined ? { duration: parseInt(duration) } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        updatedAt: new Date()
      }
    });
    
    if (assetUrl) {
      // Rely on reconciliation via broadcast instead of dangerous updateMany
      
      // Broadcast to connected players
      try {
        const io = req.app.get('io');
        if (io) {
          const { getPlaylistForScreen } = require('../utils/socketHelpers');
          const billboards = await prisma.billboard.findMany({
            where: { screen_id: { not: null } },
            select: { screen_id: true }
          });
          for (const bb of billboards) {
            const { playlist, date } = await getPlaylistForScreen(bb.screen_id);
            io.to(`screen:${bb.screen_id}`).emit('playlist', { screenId: bb.screen_id, playlist, date });
          }
        }
      } catch(e) {
        logger.error('Failed to broadcast updated default asset', e);
      }
    }
    
    logger.info('Default asset updated', { id, assetUrl });
    res.json({ success: true, defaultAsset });
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

// POST /api/default-asset/overwrite-all
exports.overwriteAllBillboardsWithGlobalDefault = async (req, res) => {
  try {
    const globalDefault = await prisma.defaultAsset.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' }
    });

    if (!globalDefault) {
      return res.status(404).json({ error: 'No global default asset configured' });
    }

    // Set all billboards to use these specific values
    const result = await prisma.billboard.updateMany({
      data: {
        defaultAssetUrl: globalDefault.assetUrl,
        defaultAssetType: globalDefault.assetType,
        defaultAssetDuration: globalDefault.duration
      }
    });

    // Broadcast to all players
    try {
      const io = req.app.get('io');
      if (io) {
        const { getPlaylistForScreen } = require('../utils/socketHelpers');
        const billboards = await prisma.billboard.findMany({
          where: { screen_id: { not: null } },
          select: { screen_id: true }
        });
        for (const bb of billboards) {
          const { playlist, date } = await getPlaylistForScreen(bb.screen_id);
          io.to(`screen:${bb.screen_id}`).emit('playlist', { screenId: bb.screen_id, playlist, date });
        }
      }
    } catch(e) {
      logger.error('Failed to broadcast after global overwrite', e);
    }

    res.json({ success: true, message: `Successfully overwrote defaults for ${result.count} billboards` });
  } catch (error) {
    logger.error('Overwrite all billboards error:', error);
    res.status(500).json({ error: 'Failed to overwrite billboards' });
  }
};
