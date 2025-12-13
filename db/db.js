const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Construct DATABASE_URL from individual PostgreSQL environment variables
let DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Check if all required PostgreSQL variables are present
  const requiredVars = ['PGUSER', 'PGPASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required database environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\n⚠️  Please set either DATABASE_URL or all PostgreSQL variables in your .env file');
    throw new Error(`Missing database configuration: ${missingVars.join(', ')}`);
  }
  
  // Construct DATABASE_URL from individual variables
  // Azure PostgreSQL requires SSL with specific parameters
  const sslMode = process.env.PGSSLMODE || 'require';
  const sslParams = process.env.PGHOST?.includes('azure.com') || process.env.PGHOST?.includes('database.azure.com')
    ? 'sslmode=require&sslcert=&sslkey=&sslrootcert=&sslcertmode=allow'
    : `sslmode=${sslMode}`;
  
  DATABASE_URL = `postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(process.env.PGPASSWORD)}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?${sslParams}`;
  console.log('📝 Constructed DATABASE_URL from individual PostgreSQL variables');
}

// Set the constructed DATABASE_URL as an environment variable for Prisma
process.env.DATABASE_URL = DATABASE_URL;

// Log connection info (without password)
if (DATABASE_URL) {
  const urlObj = new URL(DATABASE_URL);
  console.log(`🔗 Database: ${urlObj.protocol}//${urlObj.hostname}:${urlObj.port}${urlObj.pathname}`);
}

// Typed global to store Prisma instance
const globalForPrisma = global;

if (!globalForPrisma.prisma) {
  // Azure PostgreSQL connection configuration
  const isAzure = DATABASE_URL.includes('azure.com') || DATABASE_URL.includes('database.azure.com');
  
  // Enhance DATABASE_URL for Azure with connection timeout and pool settings
  let enhancedDatabaseUrl = DATABASE_URL;
  if (isAzure) {
    const url = new URL(DATABASE_URL);
    // Add connection pool and timeout parameters for Azure
    url.searchParams.set('connect_timeout', '10');
    url.searchParams.set('pool_timeout', '10');
    url.searchParams.set('statement_timeout', '30000');
    // Ensure SSL is properly configured
    if (!url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'require');
    }
    enhancedDatabaseUrl = url.toString();
    console.log('☁️  Azure PostgreSQL detected');
    console.log('⚠️  Make sure your IP is added to Azure firewall rules');
    console.log('🔗 Enhanced connection URL with timeout settings');
  }
  
  globalForPrisma.prisma = new PrismaClient({
    datasources: {
      db: { url: enhancedDatabaseUrl },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
  
  // Add connection error handling
  globalForPrisma.prisma.$on('error', (e) => {
    console.error('❌ Prisma Client Error:', e);
  });
}

const prisma = globalForPrisma.prisma;

module.exports = prisma;
