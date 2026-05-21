const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Use DATABASE_URL from env, or build from PG* variables
let DATABASE_URL = process.env.DATABASE_URL;

// Strip surrounding quotes if present (common .env authoring mistake)
if (DATABASE_URL) {
  DATABASE_URL = DATABASE_URL.trim().replace(/^["']|["']$/g, '');
}

if (!DATABASE_URL && process.env.PGHOST) {
  const ssl = process.env.PGSSLMODE || 'require';
  DATABASE_URL = `postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=${ssl}`;
}

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGPORT/PGDATABASE required');
  throw new Error('Missing database configuration');
}

process.env.DATABASE_URL = DATABASE_URL;

// ─── PRODUCTION-GRADE SINGLETON ────────────────────────────────────────────
// Only create one PrismaClient per process. On nodemon/PM2 hot-reload a new
// process is spawned anyway, so globalForPrisma is always fresh.
const globalForPrisma = global;

if (!globalForPrisma.prisma) {
  const url = new URL(DATABASE_URL);

  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);

  // Conservative pool limits:
  //   • 5 connections per process is plenty for a Node event-loop server.
  //   • AWS RDS free tier (db.t3.micro) allows ~80 total connections.
  //   • At 5 per process you can safely run 15+ parallel server instances.
  const defaultConnectionLimit = isServerless ? 2 : 5;
  const defaultPoolTimeout     = isServerless ? 10 : 15;
  const defaultConnectTimeout  = 8;

  const limit          = parseInt(process.env.DB_CONNECTION_LIMIT || String(defaultConnectionLimit), 10);
  const poolTimeout    = parseInt(process.env.DB_POOL_TIMEOUT    || String(defaultPoolTimeout), 10);
  const connectTimeout = parseInt(process.env.DB_CONNECT_TIMEOUT || String(defaultConnectTimeout), 10);

  url.searchParams.set('connection_limit', String(limit));
  url.searchParams.set('pool_timeout',     String(poolTimeout));
  url.searchParams.set('connect_timeout',  String(connectTimeout));
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');

  const safeUrl = `${url.protocol}//${url.hostname}:${url.port}${url.pathname}`;
  console.log(`🔌 [DB] Initializing Prisma (${isServerless ? 'serverless' : 'server'})`);
  console.log(`🔌 [DB] Target: ${safeUrl}`);
  console.log(`🔌 [DB] Pool: connection_limit=${limit}  pool_timeout=${poolTimeout}s  connect_timeout=${connectTimeout}s`);

  globalForPrisma.prisma = new PrismaClient({
    datasources: { db: { url: url.toString() } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // ── Graceful connection release ─────────────────────────────────────────
  // Prisma keeps idle connections open until the pool_timeout expires.
  // Calling $disconnect() immediately on any exit signal tells the PostgreSQL
  // server to close those sessions right away, freeing RDS slots instantly.
  const doDisconnect = () => {
    try { globalForPrisma.prisma.$disconnect().catch(() => {}); } catch (_) {}
  };

  process.once('beforeExit', doDisconnect);
  process.once('exit',       doDisconnect);
  process.once('SIGINT',  () => { doDisconnect(); process.exit(0); });
  process.once('SIGTERM', () => { doDisconnect(); process.exit(0); });
  process.once('SIGUSR2', () => { doDisconnect(); process.kill(process.pid, 'SIGUSR2'); }); // nodemon restart
}

module.exports = globalForPrisma.prisma;
