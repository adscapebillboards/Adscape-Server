const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Construct DATABASE_URL from individual PostgreSQL environment variables
const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=require`;

// Set the constructed DATABASE_URL as an environment variable for Prisma
process.env.DATABASE_URL = DATABASE_URL;

// Typed global to store Prisma instance
const globalForPrisma = global;

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({
    datasources: {
      db: { url: DATABASE_URL },
    },
  });
}

const prisma = globalForPrisma.prisma;

module.exports = prisma;
