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

  // Keep connection limit very low — RDS free/small tier has few available slots.
  // Repeated server restarts during dev leave zombie connections; a low cap prevents exhaustion.
  // Serverless (Vercel/Lambda): 2 connections max. Local dev: 2 connections max.
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
  const limit = 2;
  url.searchParams.set('connection_limit', String(limit));
  url.searchParams.set('pool_timeout', '5');  // fail fast instead of queueing
  url.searchParams.set('connect_timeout', '10');
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

  // Log connection status periodically (skip in serverless - no long-running process)
  const logInterval = parseInt(process.env.DB_STATUS_LOG_INTERVAL_MS || '5000', 10);
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
    setInterval(logStatus, logInterval);
  }
}

module.exports = globalForPrisma.prisma;
