const express = require('express');
const router = express.Router();
const prisma = require('../db/db');
const auth = require('../middleware/auth');

// List notifications for current user; superadmin can see all or filter by unread
router.get('/', auth, async (req, res) => {
  try {
    const { onlyUnread } = req.query;
    const user = req.user;

    let where = '1=1';
    const params = [];

    if (user.role === 'superadmin') {
      // show all notifications for superadmin
    } else {
      where += ' AND (recipient_email = $1 OR recipient_role = $2)';
      params.push(user.email);
      params.push(user.role);
    }

    if (onlyUnread === 'true') {
      where += ' AND is_read = FALSE';
    }

    const rows = await prisma.$queryRawUnsafe(`
      SELECT id, recipient_email, recipient_role, type, title, message, entity_type, entity_id, is_read, created_at
      FROM notifications
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT 50
    `, ...params);

    res.json({ notifications: rows });
  } catch (e) {
    console.error('Error listing notifications:', e);
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

// Mark as read
router.post('/:id/read', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.$executeRawUnsafe('UPDATE notifications SET is_read = TRUE WHERE id = $1', Number(id));
    res.json({ success: true });
  } catch (e) {
    console.error('Error marking notification read:', e);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

module.exports = router;











