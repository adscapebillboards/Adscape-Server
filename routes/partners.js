const express = require('express');
const router = express.Router();
const prisma = require('../db/db');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

// Ensure table exists (id TEXT primary key to avoid uuid extension dependency)
const ensureTable = async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS partners (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        logo_url TEXT,
        permissions_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  } catch (e) {
    logger.error('Failed to ensure partners table', e);
  }
};
ensureTable();

// GET /api/partners
router.get('/', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`SELECT * FROM partners ORDER BY created_at DESC`;
    const partners = rows.map(r => ({
      ...r,
      permissions: (() => { try { return JSON.parse(r.permissions_json || '[]'); } catch { return []; } })(),
    }));
    res.json({ partners });
  } catch (e) {
    logger.error('Failed to list partners', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/partners
router.post('/', async (req, res) => {
  try {
    const { email, name, logoUrl, permissions = [], status = 'active' } = req.body || {};
    if (!email || !name) return res.status(400).json({ error: 'email and name are required' });
    const id = uuidv4();
    const permissionsJson = JSON.stringify(Array.isArray(permissions) ? permissions : []);
    const rows = await prisma.$queryRaw`
      INSERT INTO partners (id, email, name, logo_url, permissions_json, status)
      VALUES (${id}, ${email}, ${name}, ${logoUrl || null}, ${permissionsJson}, ${status})
      RETURNING *
    `;
    const row = rows[0];
    try {
      await prisma.publisher.updateMany({
        where: { email: email },
        data: { role: 'partner', status: 'inactive' }
      });
    } catch (u) {
      logger.warn('Promote: failed to update publisher role/status', u);
    }
    res.status(201).json({ partner: { ...row, permissions: JSON.parse(row.permissions_json || '[]') } });
  } catch (e) {
    logger.error('Failed to create partner', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/partners/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, logoUrl, permissions, status } = req.body || {};
    const existing = await prisma.$queryRaw`SELECT * FROM partners WHERE id = ${id}`;
    if (!existing || existing.length === 0) return res.status(404).json({ error: 'Partner not found' });
    const current = existing[0];
    const next = {
      email: email ?? current.email,
      name: name ?? current.name,
      logo_url: logoUrl ?? current.logo_url,
      permissions_json: permissions !== undefined ? JSON.stringify(Array.isArray(permissions) ? permissions : []) : current.permissions_json,
      status: status ?? current.status,
    };
    const rows = await prisma.$queryRaw`
      UPDATE partners
      SET email = ${next.email}, name = ${next.name}, logo_url = ${next.logo_url}, permissions_json = ${next.permissions_json}, status = ${next.status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    const row = rows[0];
    res.json({ partner: { ...row, permissions: JSON.parse(row.permissions_json || '[]') } });
  } catch (e) {
    logger.error('Failed to update partner', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/partners/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.$executeRaw`DELETE FROM partners WHERE id = ${id}`;
    res.json({ success: true });
  } catch (e) {
    logger.error('Failed to delete partner', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;



