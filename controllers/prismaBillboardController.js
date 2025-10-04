const prisma = require('../lib/prisma');
const logger = require('../config/logger');

// Get all billboards
const getAllBillboards = async (req, res) => {
  try {
    const billboards = await prisma.billboard.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        },
        publisher: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.billboard('All billboards fetched', billboards.length);
    res.json(billboards);
  } catch (error) {
    logger.error('Error fetching billboards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get billboard by ID
const getBillboardById = async (req, res) => {
  const { id } = req.params;

  try {
    const billboard = await prisma.billboard.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        },
        publisher: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        generatedSlots: {
          include: {
            campaign: {
              select: {
                id: true,
                campaignName: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!billboard) {
      return res.status(404).json({ error: 'Billboard not found' });
    }

    logger.billboard('Billboard fetched by ID', `ID: ${id}`);
    res.json(billboard);
  } catch (error) {
    logger.error('Error fetching billboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add new billboard
const addBillboard = async (req, res) => {
  const {
    id, location, city, state, type, orientation, dailyViewership,
    pricePerDay, available, width, height, unit, category,
    images, latitude, longitude, userId, adDuration, openingTime, closingTime, 
    maxAdvertisers, autoBrightness, resolution, description, name, reasons
  } = req.body;

  try {
    const billboard = await prisma.billboard.create({
      data: {
        id,
        location,
        city,
        state,
        type,
        orientation,
        dailyViewership,
        pricePerDay,
        available,
        width,
        height,
        unit,
        category,
        images,
        latitude,
        longitude,
        userId,
        adDuration,
        openingTime,
        closingTime,
        maxAdvertisers,
        description,
        resolution,
        name,
        autoBrightness,
        reason: reasons
      }
    });

    logger.billboard('Billboard created', `ID: ${billboard.id}, Location: ${location}`);
    res.status(201).json({ message: 'Billboard added successfully', billboard });
  } catch (error) {
    logger.error('Error creating billboard:', error);
    res.status(500).json({ error: 'Failed to create billboard' });
  }
};

// Get billboards by user
const getBillboardsByUser = async (req, res) => {
  const { userEmail } = req.query;

  try {
    const billboards = await prisma.billboard.findMany({
      where: {
        OR: [
          {
            user: {
              email: userEmail
            }
          },
          {
            publisher: {
              email: userEmail
            }
          }
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        },
        publisher: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.billboard('User billboards fetched', `User: ${userEmail}, Count: ${billboards.length}`);
    res.json(billboards);
  } catch (error) {
    logger.error('Error fetching user billboards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update billboard status
const updateBillboardStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const billboard = await prisma.billboard.update({
      where: { id },
      data: { status },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      }
    });

    logger.billboard('Billboard status updated', `ID: ${id}, Status: ${status}`);
    res.json({ message: 'Status updated successfully', billboard });
  } catch (error) {
    logger.error('Error updating billboard status:', error);
    res.status(500).json({ error: 'Failed to update billboard status' });
  }
};

// Get distinct states
const getStates = async (req, res) => {
  try {
    const states = await prisma.billboard.findMany({
      select: {
        state: true
      },
      distinct: ['state'],
      orderBy: {
        state: 'asc'
      }
    });

    const stateList = states.map(item => item.state);
    logger.billboard('States fetched', stateList.length);
    res.json(stateList);
  } catch (error) {
    logger.error('Error fetching states:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get cities by state
const getCitiesByState = async (req, res) => {
  const { state } = req.params;

  try {
    const cities = await prisma.billboard.findMany({
      where: { state },
      select: {
        city: true
      },
      distinct: ['city'],
      orderBy: {
        city: 'asc'
      }
    });

    const cityList = cities.map(item => item.city);
    logger.billboard('Cities fetched by state', `State: ${state}, Count: ${cityList.length}`);
    res.json(cityList);
  } catch (error) {
    logger.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Check availability
const checkAvailability = async (req, res) => {
  const { city, state } = req.query;

  try {
    let whereClause = {};

    if (city) {
      whereClause.city = city;
    } else if (state) {
      whereClause.state = state;
    }

    const count = await prisma.billboard.count({
      where: whereClause
    });

    const isAvailable = count > 0;
    logger.billboard('Availability checked', `City: ${city}, State: ${state}, Available: ${isAvailable}`);
    res.json({ available: isAvailable, count });
  } catch (error) {
    logger.error('Error checking availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAllBillboards,
  getBillboardById,
  addBillboard,
  getBillboardsByUser,
  updateBillboardStatus,
  getStates,
  getCitiesByState,
  checkAvailability
}; 