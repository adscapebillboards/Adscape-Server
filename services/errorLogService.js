const prisma = require('../db/db');
const logger = require('../config/logger');
const fallbackErrorLogStore = require('./fallbackErrorLogStore');

const toStringOrNull = (v) => (v === undefined || v === null ? null : String(v));

const persistError = async ({
  level = 'error',
  message,
  stack = null,
  method = null,
  path = null,
  statusCode = null,
  userId = null,
  userEmail = null,
  meta = null,
}) => {
  const entry = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    level,
    message: toStringOrNull(message) || 'Unknown error',
    stack: stack ? String(stack) : null,
    method: method ? String(method) : null,
    path: path ? String(path) : null,
    statusCode: typeof statusCode === 'number' ? statusCode : statusCode ? Number(statusCode) : null,
    userId: userId != null ? String(userId) : null,
    userEmail: userEmail != null ? String(userEmail) : null,
    meta: meta ?? null,
  };

  try {
    await prisma.errorLog.create({
      data: {
        level: entry.level,
        message: entry.message,
        stack: entry.stack,
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode,
        userId: entry.userId,
        userEmail: entry.userEmail,
        meta: entry.meta,
      },
    });
    return { ok: true, source: 'db' };
  } catch (e) {
    logger.warn('Failed to persist error log (db); writing to fallback:', e?.code || e?.message || e);
    await fallbackErrorLogStore.append(entry);
    return { ok: false, source: 'file', error: e };
  }
};

module.exports = { persistError };

