const express = require('express');
const router = express.Router();
const prisma = require('../db/db');
const logger = require('../config/logger');

// Helper to safely parse images field which may be JSON, array, or a single URL string
function normalizeImages(images) {
  try {
    if (!images) return [];
    if (Array.isArray(images)) return images;
    if (typeof images === 'string') {
      const trimmed = images.trim();
      // If looks like a single URL, return as array
      if (/^https?:\/\//i.test(trimmed)) return [trimmed];
      // Try JSON parse (could be JSON array or stringified array)
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'string') return [/^https?:\/\//i.test(parsed) ? parsed : String(parsed)];
      return [];
    }
    return [];
  } catch {
    return [];
  }
}

// Get billboards list (public)
router.get('/billboards', async (req, res) => {
  try {
    const billboards = await prisma.billboard.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Transform the data to match frontend expectations
    const transformedBillboards = billboards.map(billboard => ({
      ...billboard,
      status: (billboard.status || '').toString().toUpperCase(),
      images: normalizeImages(billboard.images),
      pricePerDay: billboard.pricePerDay ? billboard.pricePerDay.toString() : '0',
      dailyViewership: billboard.dailyViewership ? billboard.dailyViewership.toString() : '0',
      width: billboard.width || 0,
      height: billboard.height || 0,
      latitude: billboard.latitude || 0,
      longitude: billboard.longitude || 0,
      available: billboard.available !== false // Default to true if not set
    }));
    
    logger.billboard('Billboards list fetched', transformedBillboards.length, 'billboards');
    res.json(transformedBillboards);
  } catch (err) {
    logger.error('Error fetching billboards list:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get billboard by id (public)
router.get('/billboards/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const b = await prisma.billboard.findUnique({ where: { id: String(id) } });
    if (!b) return res.status(404).json({ error: 'Not found' });
    const mapped = {
      ...b,
      status: (b.status || '').toString().toUpperCase(),
      images: normalizeImages(b.images),
      pricePerDay: b.pricePerDay ? b.pricePerDay.toString() : '0',
      dailyViewership: b.dailyViewership ? b.dailyViewership.toString() : '0',
      width: b.width || b.size_width || 0,
      height: b.height || b.size_height || 0,
      unit: b.unit || b.size_unit || 'feet',
    };
    res.json(mapped);
  } catch (err) {
    logger.error('Error fetching billboard by id:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search billboards (public)
router.get('/billboards/search', async (req, res) => {
  try {
    const { city, q, limit = 20 } = req.query;
    const where = {
      status: 'APPROVED', // Only search approved billboards
      available: true // Only available billboards
    };
    if (city) where.city = { equals: String(city), mode: 'insensitive' };
    if (q) where.OR = [
      { name: { contains: String(q), mode: 'insensitive' } },
      { location: { contains: String(q), mode: 'insensitive' } },
      { city: { contains: String(q), mode: 'insensitive' } },
      { state: { contains: String(q), mode: 'insensitive' } },
    ];
    const billboards = await prisma.billboard.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit) || 20,
    });
    const transformed = billboards.map(b => ({
      ...b,
      status: (b.status || '').toString().toUpperCase(),
      images: normalizeImages(b.images),
      pricePerDay: b.pricePerDay ? b.pricePerDay.toString() : '0',
      dailyViewership: b.dailyViewership ? b.dailyViewership.toString() : '0',
      width: b.width || 0,
      height: b.height || 0,
      latitude: b.latitude || 0,
      longitude: b.longitude || 0,
      available: b.available !== false
    }));
    res.json({ success: true, billboards: transformed });
  } catch (err) {
    logger.error('Error searching billboards:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 