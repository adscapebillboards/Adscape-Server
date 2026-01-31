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
  const limit = isServerless ? 3 : 10;
  url.searchParams.set('connection_limit', String(limit));
  url.searchParams.set('pool_timeout', '10');
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');

  globalForPrisma.prisma = new PrismaClient({
    datasources: { db: { url: url.toString() } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

module.exports = globalForPrisma.prisma;
