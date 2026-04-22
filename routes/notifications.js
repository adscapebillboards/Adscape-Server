const express = require('express');
const router = express.Router();
const prisma = require('../db/db');
const { isSuperAdminRole } = require('../utils/roles');
const auth = require('../middleware/auth');

// List notifications for current user; superadmin can see all or filter by unread
router.get('/', auth, async (req, res) => {
  try {
    const { onlyUnread } = req.query;
    const user = req.user;

    const where = {};

    if (!isSuperAdminRole(user.role)) {
      where.OR = [
        { recipient_email: user.email },
        { recipient_role: user.role }
      ];
    }

    if (onlyUnread === 'true') {
      where.is_read = false;
    }

    const rows = await prisma.notifications.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        recipient_email: true,
        recipient_role: true,
        type: true,
        title: true,
        message: true,
        entity_type: true,
        entity_id: true,
        is_read: true,
        created_at: true
      }
    });

    res.json({ notifications: rows });
  } catch (e) {
    console.error('Error listing notifications:', e);
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

// Mark as read
router.post('/:id/read', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const where = { id };

    if (!isSuperAdminRole(user.role)) {
      where.OR = [
        { recipient_email: user.email },
        { recipient_role: user.role }
      ];
    }

    const result = await prisma.notifications.updateMany({
      where,
      data: { is_read: true }
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error marking notification read:', e);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

module.exports = router;











