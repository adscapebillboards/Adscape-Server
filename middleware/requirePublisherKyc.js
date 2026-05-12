const prisma = require('../db/db');
const logger = require('../config/logger');
const { isPublisherKycComplete } = require('../utils/publisherKyc');

module.exports = async function requirePublisherKyc(req, res, next) {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'publisher') return next();

    const publisherId = Number(req.user?.id);
    if (!publisherId) return res.status(401).json({ error: 'Authentication required' });

    const publisher = await prisma.publisher.findUnique({
      where: { id: publisherId },
      select: { id: true, businessInfo: true, permissions: true },
    });

    if (!publisher) return res.status(401).json({ error: 'Authentication required' });

    if (!isPublisherKycComplete(publisher)) {
      return res.status(403).json({
        error: 'KYC_REQUIRED',
        message: 'Please finish your KYC (Step 2) before adding screens.',
      });
    }

    return next();
  } catch (err) {
    logger.error('requirePublisherKyc failed:', err);
    return res.status(500).json({ error: 'Authorization error' });
  }
};

