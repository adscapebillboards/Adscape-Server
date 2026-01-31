const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createPublisher() {
  try {
    // Default publisher credentials
    const email = 'publisher@adscape.com';
    const password = 'publisher123';
    const name = 'Test Publisher';
    const phone = '9876543210';
    const location = 'Chennai';

    // Check if publisher already exists
    const existingPublisher = await prisma.publisher.findUnique({
      where: { email }
    });

    if (existingPublisher) {
      console.log('⚠️  Publisher already exists!');
      console.log('Email:', existingPublisher.email);
      console.log('Name:', existingPublisher.name);
      console.log('Status:', existingPublisher.status);
      console.log('\nTo create a new publisher, use a different email or delete the existing one.');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create publisher
    const publisher = await prisma.publisher.create({
      data: {
        name,
        email,
        phone,
        location,
        password: hashedPassword,
        role: 'publisher', // or null for regular publisher
        status: 'active',
        joinDate: new Date()
      }
    });

    // Create PublisherMetric entry
    try {
      await prisma.publisherMetric.create({
        data: {
          publisherId: publisher.id,
          totalBillboards: 0,
          totalBookings: 0,
          totalRevenue: 0,
          joinDate: new Date(),
          status: 'active'
        }
      });
      console.log('✅ PublisherMetric entry created');
    } catch (metricError) {
      console.warn('⚠️  Could not create PublisherMetric entry:', metricError.message);
    }

    console.log('✅ Publisher account created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:', publisher.email);
    console.log('🔑 Password:', password);
    console.log('👤 Name:', publisher.name);
    console.log('📱 Phone:', publisher.phone);
    console.log('📍 Location:', publisher.location);
    console.log('🎭 Role:', publisher.role || 'publisher');
    console.log('✅ Status:', publisher.status);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 You can now use these credentials to log in as a publisher.');

  } catch (error) {
    console.error('❌ Error creating publisher:', error);
    if (error.code === 'P2002') {
      console.error('⚠️  A publisher with this email already exists.');
      console.error('💡 Try using a different email address.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createPublisher();
