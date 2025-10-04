# Prisma Setup Guide for Billboard Hub

## Overview
This guide covers the complete Prisma setup for the Billboard Hub application, including schema definition, client generation, and migration from raw SQL queries to Prisma ORM.

## 🗄️ Database Schema

### Core Models

#### 1. **User Management**
- **User**: Regular customers with full profile information
- **AdminUser**: Administrative users with elevated privileges
- **Publisher**: Billboard owners/publishers with specialized permissions

#### 2. **Billboard Management**
- **Billboard**: Digital billboard displays with location, pricing, and technical specifications
- **BusinessProfile**: Extended business information for users

#### 3. **Campaign Management**
- **Campaign**: Advertising campaigns with billboard assignments
- **CampaignBillboard**: Junction table for campaign-billboard relationships
- **CampaignFile**: File attachments for campaigns

#### 4. **Slot and Asset Management**
- **GeneratedSlot**: Time slots for ad display on billboards
- **AssetPlayLog**: Detailed logs of asset plays
- **AssetPlay**: Aggregated daily play counts

## 🔧 Setup Instructions

### 1. **Prisma Installation**
```bash
npm install prisma @prisma/client
npx prisma init
```

### 2. **Database Connection**
Create `lib/prisma.js`:
```javascript
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://avnadmin:AVNS_07USf4r803Jrdm6vAva@billboard-srinnivassh-7657.l.aivencloud.com:16921/defaultdb?sslmode=require"
    }
  }
});

module.exports = prisma;
```

### 3. **Generate Prisma Client**
```bash
npx prisma generate
```

### 4. **Database Migration** (Optional)
```bash
npx prisma db push
```

## 📊 Schema Relationships

### User Relationships
```
User (1) ←→ (N) Billboard
User (1) ←→ (N) Campaign
User (1) ←→ (1) BusinessProfile

Publisher (1) ←→ (N) Billboard
```

### Campaign Relationships
```
Campaign (1) ←→ (N) GeneratedSlot
Campaign (1) ←→ (N) CampaignBillboard
Campaign (1) ←→ (N) AssetPlayLog
Campaign (1) ←→ (N) AssetPlay

CampaignBillboard (1) ←→ (N) CampaignFile
```

### Billboard Relationships
```
Billboard (1) ←→ (N) GeneratedSlot
Billboard (1) ←→ (N) CampaignBillboard
```

## 🔄 Migration from Raw SQL to Prisma

### Before (Raw SQL)
```javascript
// Old way with raw SQL
const result = await pool.query(
  'SELECT * FROM billboards WHERE user_id = $1 ORDER BY id DESC',
  [userEmail]
);
```

### After (Prisma)
```javascript
// New way with Prisma
const billboards = await prisma.billboard.findMany({
  where: {
    OR: [
      { user: { email: userEmail } },
      { publisher: { email: userEmail } }
    ]
  },
  include: {
    user: { select: { id: true, email: true, fullName: true } },
    publisher: { select: { id: true, name: true, email: true } }
  },
  orderBy: { createdAt: 'desc' }
});
```

## 🚀 Example Controllers

### Billboard Controller with Prisma
```javascript
const prisma = require('../lib/prisma');
const logger = require('../config/logger');

const getAllBillboards = async (req, res) => {
  try {
    const billboards = await prisma.billboard.findMany({
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        publisher: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    logger.billboard('All billboards fetched', billboards.length);
    res.json(billboards);
  } catch (error) {
    logger.error('Error fetching billboards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
```

### Campaign Controller with Prisma
```javascript
const createCampaign = async (req, res) => {
  try {
    const { userName, billboards } = JSON.parse(req.body.data);
    const campaignId = uuidv4();

    const campaign = await prisma.campaign.create({
      data: {
        id: campaignId,
        userName,
        campaignName: "Auto Campaign",
        status: "PENDING",
        totalAmount: calculateTotalAmount(billboards),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        billboards: enrichedBillboards
      }
    });

    res.status(201).json({ message: 'Campaign created successfully', id: campaignId });
  } catch (err) {
    logger.error('Error creating campaign:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
```

## 📈 Benefits of Using Prisma

### 1. **Type Safety**
- Full TypeScript support
- Compile-time error checking
- IntelliSense and autocomplete

### 2. **Query Optimization**
- Automatic query optimization
- Connection pooling
- Prepared statements

### 3. **Developer Experience**
- Intuitive API
- Rich query capabilities
- Built-in migrations

### 4. **Data Integrity**
- Foreign key constraints
- Cascade operations
- Transaction support

## 🔍 Advanced Queries

### Complex Relationships
```javascript
// Get campaigns with all related data
const campaigns = await prisma.campaign.findMany({
  include: {
    user: { select: { email: true, fullName: true } },
    generatedSlots: {
      include: {
        billboard: { select: { location: true, city: true } }
      }
    },
    assetPlayLogs: { select: { playedAt: true } }
  }
});
```

### Aggregations
```javascript
// Get total plays per campaign
const playStats = await prisma.assetPlay.groupBy({
  by: ['campaignId'],
  _sum: { playCount: true },
  _count: { playDate: true }
});
```

### Transactions
```javascript
// Atomic operations
const result = await prisma.$transaction(async (tx) => {
  const campaign = await tx.campaign.create({
    data: campaignData
  });
  
  const slots = await tx.generatedSlot.createMany({
    data: slotsData.map(slot => ({ ...slot, campaignId: campaign.id }))
  });
  
  return { campaign, slots };
});
```

## 🛠️ Available Controllers

### Prisma-Based Controllers
1. **`controllers/prismaBillboardController.js`**
   - `getAllBillboards()` - Fetch all billboards with relations
   - `getBillboardById()` - Get specific billboard with details
   - `addBillboard()` - Create new billboard
   - `getBillboardsByUser()` - Get user's billboards
   - `updateBillboardStatus()` - Update billboard status
   - `getStates()` - Get distinct states
   - `getCitiesByState()` - Get cities by state
   - `checkAvailability()` - Check location availability

2. **`controllers/prismaCampaignController.js`**
   - `createCampaign()` - Create campaign with file upload
   - `getCampaignsByUser()` - Get user's campaigns
   - `getAllCampaigns()` - Get all campaigns (admin)
   - `getCampaignsByUserEmail()` - Get campaigns by owner
   - `updateCampaignStatus()` - Update campaign status
   - `updateCampaignName()` - Update campaign name
   - `getCampaignMetrics()` - Get campaign analytics

## 🔧 Environment Setup

### Required Environment Variables
```bash
# Database
DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"

# JWT
JWT_SECRET=your_jwt_secret_here

# Logging
ENABLE_LOGGING=true
LOG_LEVEL=INFO

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Email
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

## 📝 Migration Checklist

### Phase 1: Setup
- [x] Install Prisma dependencies
- [x] Initialize Prisma
- [x] Create schema file
- [x] Generate Prisma client
- [x] Create Prisma client configuration

### Phase 2: Controllers
- [x] Create Prisma-based billboard controller
- [x] Create Prisma-based campaign controller
- [x] Update existing controllers to use Prisma
- [x] Test all endpoints

### Phase 3: Optimization
- [ ] Add database indexes
- [ ] Implement connection pooling
- [ ] Add query optimization
- [ ] Performance testing

### Phase 4: Production
- [ ] Database migration
- [ ] Environment configuration
- [ ] Monitoring setup
- [ ] Backup strategy

## 🚨 Important Notes

### 1. **Database Compatibility**
- Ensure your PostgreSQL version supports all Prisma features
- Check for any custom functions or triggers that need migration

### 2. **Performance Considerations**
- Use `select` to limit returned fields
- Implement pagination for large datasets
- Consider database indexes for frequently queried fields

### 3. **Error Handling**
- Prisma provides detailed error messages
- Implement proper error handling for database operations
- Use transactions for complex operations

### 4. **Security**
- Never expose database credentials in client-side code
- Use environment variables for sensitive data
- Implement proper input validation

## 📚 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Client API Reference](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)
- [Database Schema Design](https://www.prisma.io/docs/concepts/components/prisma-schema)
- [Migration Guide](https://www.prisma.io/docs/guides/migrate-to-prisma)

## 🎯 Next Steps

1. **Test the new Prisma controllers** with your existing frontend
2. **Gradually migrate** other controllers to use Prisma
3. **Add database indexes** for better performance
4. **Implement caching** for frequently accessed data
5. **Set up monitoring** for database performance
6. **Create automated tests** for all Prisma operations 