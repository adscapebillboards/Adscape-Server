const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Use DATABASE_URL from env, or build from PG* variables
let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL && process.env.PGHOST) {
  const ssl = process.env.PGSSLMODE || 'require';
  DATABASE_URL = `postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=${ssl}`;
}

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGPORT/PGDATABASE required');
  throw new Error('Missing database configuration');
}

process.env.DATABASE_URL = DATABASE_URL;

// Prisma singleton (needed for serverless / Vercel)
const globalForPrisma = global;
if (!globalForPrisma.prisma) {
  const url = new URL(DATABASE_URL);

  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
  const defaultConnectionLimit = isServerless ? 2 : 10;
  const defaultPoolTimeout = isServerless ? 10 : 20;
  const limit = parseInt(process.env.DB_CONNECTION_LIMIT || String(defaultConnectionLimit), 10);
  const poolTimeout = parseInt(process.env.DB_POOL_TIMEOUT || String(defaultPoolTimeout), 10);
  const connectTimeout = parseInt(process.env.DB_CONNECT_TIMEOUT || '10', 10);

  url.searchParams.set('connection_limit', String(limit));
  url.searchParams.set('pool_timeout', String(poolTimeout));
  url.searchParams.set('connect_timeout', String(connectTimeout));
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');

  globalForPrisma.prisma = new PrismaClient({
    datasources: { db: { url: url.toString() } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // Gracefully release all connections when the process exits (SIGTERM, SIGINT, nodemon restart).
  // Without this, RDS holds connections open in TIME_WAIT for ~4 minutes after each restart,
  // quickly exhausting the available slots.
  const disconnect = () => {
    globalForPrisma.prisma.$disconnect().catch(() => { });
  };
  process.once('beforeExit', disconnect);
  process.once('SIGINT', () => { disconnect(); process.exit(0); });
  process.once('SIGTERM', () => { disconnect(); process.exit(0); });

  // Optional connection status logging for debugging. Disabled by default so it
  // does not compete with live traffic for a small connection pool.
  const logInterval = parseInt(process.env.DB_STATUS_LOG_INTERVAL_MS || '0', 10);
  if (!isServerless && logInterval > 0) {
    const safeUrl = `${url.protocol}//${url.hostname}:${url.port}${url.pathname}`;
    const logStatus = async () => {
      try {
        const start = Date.now();
        await globalForPrisma.prisma.$queryRaw`SELECT 1`;
        const ms = Date.now() - start;
        // console.log(`🔗 [DB] ${safeUrl} | ✅ Connected | ${ms}ms`);
      } catch (err) {
        console.error(`🔗 [DB] ${safeUrl} | ❌ Error:`, err.message);
      }
    };
    logStatus(); // immediate first log
    const interval = setInterval(logStatus, logInterval);
    if (typeof interval.unref === 'function') interval.unref();
  }
}

module.exports = globalForPrisma.prisma;
