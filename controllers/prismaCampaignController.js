const prisma = require('../lib/prisma');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');
const { generateSlots } = require('../utils/slotGenerator');
const { flattenGeneratedSlotRecords } = require('../utils/generatedSlotFormat');

// Create campaign with file upload
const createCampaign = async (req, res) => {
  try {
    const { userName, billboards } = JSON.parse(req.body.data);
    const uploadedFiles = req.files;
    logger.campaign('Campaign creation started', `User: ${userName}, Billboards: ${billboards.length}`);

    const campaignId = uuidv4();

    // Process billboards and upload files
    const enrichedBillboards = await Promise.all(billboards.map(async (billboard) => {
      const { id, location, city, pricePerDay, bookingDetails, owner, screen_id } = billboard;
      const { startDate, endDate } = bookingDetails;

      const fileUrls = [];

      const matchingFiles = uploadedFiles.filter(file =>
        file.originalname.startsWith(`${id}_`)
      );

      // Upload files to Cloudinary (you'll need to implement this)
      for (const file of matchingFiles) {
        try {
          // This would be your file upload logic
          // const url = await uploadToCloudinary(file.buffer);
          // fileUrls.push(url);
          logger.info(`File ${file.originalname} would be uploaded`);
        } catch (error) {
          logger.error(`Failed to upload file ${file.originalname}:`, error.message);
        }
      }

      return {
        id,
        location,
        city,
        pricePerDay,
        bookingDetails: {
          startDate,
          endDate
        },
        files: fileUrls,
        owner,
        screen_id,
        // Campaign-related information for each billboard
        userName: userName,
        status: "PENDING",
        createDate: (() => {
          const { getISTTimestamp } = require('../utils/timeUtils');
          return getISTTimestamp();
        })(),
        endDate: endDate,
        billboardCampaignId: `${campaignId}_${id}`, // Generate unique billboard campaign ID
        // Keep all existing billboard details
        ...billboard
      };
    }));

    const startDate = enrichedBillboards[0]?.bookingDetails.startDate;
    const endDate = enrichedBillboards[0]?.bookingDetails.endDate;

    // Calculate totalAmount
    const totalAmount = enrichedBillboards.reduce((sum, b) => {
      const days = (new Date(b.bookingDetails.endDate) - new Date(b.bookingDetails.startDate)) / (1000 * 60 * 60 * 24) + 1;
      return sum + (days * b.pricePerDay);
    }, 0);

    // Create campaign using Prisma
    const { parseDateAsUTC } = require('../utils/timeUtils');
    const campaign = await prisma.campaign.create({
      data: {
        id: campaignId,
        userName,
        campaignName: "Auto Campaign",
        status: "PENDING",
        totalAmount,
        startDate: parseDateAsUTC(startDate),
        endDate: parseDateAsUTC(endDate),
        billboards: enrichedBillboards
      }
    });

    logger.campaign('Campaign created successfully', `ID: ${campaignId}, User: ${userName}`);
    res.status(201).json({
      message: 'Campaign created successfully.',
      id: campaignId
    });

  } catch (err) {
    logger.error('Error creating campaign:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Get campaigns by user
const getCampaignsByUser = async (req, res) => {
  const { user } = req.query;
  logger.campaign('Fetching campaigns', `User: ${user}`);

  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        userName: user
      },
      include: {
        generatedSlots: {
          include: {
            billboard: {
              select: {
                id: true,
                location: true,
                city: true
              }
            }
          }
        },
        assetPlayLogs: {
          select: {
            playedAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.campaign('Campaigns fetched', `User: ${user}, Count: ${campaigns.length}`);
    res.json(campaigns);
  } catch (err) {
    logger.error('Error fetching campaigns:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Get all campaigns (admin)
const getAllCampaigns = async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        },
        generatedSlots: {
          include: {
            billboard: {
              select: {
                id: true,
                location: true,
                city: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.campaign('All campaigns fetched', `Count: ${campaigns.length}`);
    res.json(campaigns);
  } catch (err) {
    logger.error('Error fetching campaigns:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Get campaigns by user email (for billboard owners)
const getCampaignsByUserEmail = async (req, res) => {
  const { userEmail } = req.query;

  try {
    // Find campaigns where the user owns billboards that are part of the campaign
    const campaigns = await prisma.campaign.findMany({
      where: {
        generatedSlots: {
          some: {
            billboard: {
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
            }
          }
        }
      },
      include: {
        generatedSlots: {
          include: {
            billboard: {
              select: {
                id: true,
                location: true,
                city: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.campaign('User campaigns fetched (owner view)', `User: ${userEmail}, Count: ${campaigns.length}`);
    res.json(campaigns);
  } catch (err) {
    logger.error("Error fetching user campaigns:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Update campaign status
const updateCampaignStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status },
      include: {
        generatedSlots: {
          include: {
            billboard: {
              select: {
                id: true,
                location: true,
                city: true
              }
            }
          }
        }
      }
    });

    // Note: Slot generation is now only done after payment completion, not on approval
    // This ensures slots are only created when payment is confirmed
    if (status === 'APPROVED') {
      logger.campaign('Campaign approved', `Campaign ID: ${id}`);
      logger.info('⚠️  Slot generation will occur after payment completion, not on approval');
    }

    // Generate slots when payment is completed
    if (status === 'PAYMENT_COMPLETED') {
      logger.campaign('Payment completed, generating slots', `Campaign ID: ${id}`);

      try {
        // Fetch the campaign with billboards data
        const campaignWithBillboards = await prisma.campaign.findUnique({
          where: { id }
        });

        if (campaignWithBillboards) {
          await generateSlots(campaignWithBillboards);
          logger.campaign('Slots generated successfully after payment', `Campaign ID: ${id}`);
        } else {
          logger.error('Campaign not found for slot generation', `Campaign ID: ${id}`);
        }
      } catch (slotError) {
        logger.error('Error generating slots after payment:', slotError);
        // Don't fail the status update if slot generation fails
      }
    }

    logger.campaign('Campaign status updated', `Campaign ID: ${id}, Status: ${status}`);
    res.json({ message: 'Status updated', campaign });
  } catch (err) {
    logger.error('Error updating status:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Update individual billboard status within a campaign
const updateBillboardStatus = async (req, res) => {
  const { campaignId, billboardId } = req.params;
  const { status } = req.body;

  try {
    // Fetch the campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse billboards if it's a JSON string
    let billboards = campaign.billboards;
    if (typeof billboards === 'string') {
      try {
        billboards = JSON.parse(billboards);
      } catch (parseError) {
        logger.error('Error parsing billboards JSON:', parseError);
        return res.status(500).json({ error: 'Invalid billboards data' });
      }
    }

    // Find and update the specific billboard status
    const billboardIndex = billboards.findIndex(b => b.id === billboardId);
    if (billboardIndex === -1) {
      return res.status(404).json({ error: 'Billboard not found in campaign' });
    }

    // Update the billboard status
    billboards[billboardIndex].status = status;
    billboards[billboardIndex].updatedAt = new Date().toISOString();

    // Update the campaign with modified billboards
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { billboards }
    });

    // Note: Slot generation is now only done after payment completion, not on approval
    // This ensures slots are only created when payment is confirmed
    if (status === 'APPROVED') {
      logger.campaign('Billboard approved', `Campaign ID: ${campaignId}, Billboard ID: ${billboardId}`);
      logger.info('⚠️  Slot generation will occur after payment completion, not on approval');
    }

    logger.campaign('Billboard status updated', `Campaign ID: ${campaignId}, Billboard ID: ${billboardId}, Status: ${status}`);
    res.json({
      message: 'Billboard status updated successfully',
      campaign: updatedCampaign,
      updatedBillboard: billboards[billboardIndex]
    });
  } catch (err) {
    logger.error('Error updating billboard status:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Generate slots for a specific billboard
const generateSlotsForBillboard = async (campaignId, billboard) => {
  try {
    await generateSlots({
      id: String(campaignId),
      billboards: [billboard]
    });
    logger.info(`Slot generation completed for billboard ${billboard.id}`);
  } catch (error) {
    logger.error(`Error generating slots for billboard ${billboard.id}:`, error);
    throw error;
  }
};

// Get campaign with individual billboard statuses
const getCampaignWithBillboardStatuses = async (req, res) => {
  const { id } = req.params;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse billboards if it's a JSON string
    let billboards = campaign.billboards;
    if (typeof billboards === 'string') {
      try {
        billboards = JSON.parse(billboards);
      } catch (parseError) {
        logger.error('Error parsing billboards JSON:', parseError);
        return res.status(500).json({ error: 'Invalid billboards data' });
      }
    }

    // Get slot counts for each billboard
    const generatedSlotRecord = await prisma.generatedSlot.findUnique({
      where: { campaignId: String(id) }
    });
    const flatGeneratedSlots = flattenGeneratedSlotRecords(generatedSlotRecord ? [generatedSlotRecord] : []);
    const billboardsWithSlotCounts = await Promise.all(
      billboards.map(async (billboard) => {
        const slotCount = flatGeneratedSlots.filter(slot => String(slot.billboardId) === String(billboard.id)).length;

        return {
          ...billboard,
          slotCount,
          canGenerateSlots: billboard.status === 'APPROVED' && slotCount === 0
        };
      })
    );

    const campaignWithBillboardStatuses = {
      ...campaign,
      billboards: billboardsWithSlotCounts
    };

    logger.campaign('Campaign with billboard statuses fetched', `Campaign ID: ${id}`);
    res.json(campaignWithBillboardStatuses);
  } catch (err) {
    logger.error('Error fetching campaign with billboard statuses:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Update campaign name
const updateCampaignName = async (req, res) => {
  logger.info('Incoming body:', req.body);
  try {
    const { campaignId, campaignName } = req.body;
    logger.info('Received:', { campaignId, campaignName });

    if (!campaignId || !campaignName) {
      return res.status(400).json({ message: 'Campaign ID and name are required' });
    }

    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { campaignName }
    });

    logger.campaign('Campaign name updated', `Campaign ID: ${campaignId}, New name: ${campaignName}`);
    res.status(200).json({ message: 'Campaign name updated successfully', campaign });
  } catch (err) {
    logger.error('Update campaign name error:', err);
    res.status(500).json({ message: 'Failed to update campaign name' });
  }
};



// Get campaign metrics
const getCampaignMetrics = async (req, res) => {
  const { campaignId } = req.params;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        generatedSlots: {
          include: {
            billboard: {
              select: {
                id: true,
                location: true,
                city: true
              }
            }
          }
        },
        assetPlayLogs: {
          select: {
            playedAt: true
          }
        },
        assetPlays: {
          select: {
            playDate: true,
            playCount: true
          }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Calculate metrics
    const totalSlots = campaign.generatedSlots.length;
    const totalPlays = campaign.assetPlays.reduce((sum, play) => sum + play.playCount, 0);
    const totalPlayLogs = campaign.assetPlayLogs.length;

    const metrics = {
      campaignId,
      campaignName: campaign.campaignName,
      status: campaign.status,
      totalAmount: campaign.totalAmount,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      totalSlots,
      totalPlays,
      totalPlayLogs,
      billboards: campaign.generatedSlots.map(slot => slot.billboard)
    };

    logger.campaign('Campaign metrics fetched', `Campaign ID: ${campaignId}`);
    res.json(metrics);
  } catch (err) {
    logger.error('Error fetching campaign metrics:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createCampaign,
  getCampaignsByUser,
  getAllCampaigns,
  getCampaignsByUserEmail,
  updateCampaignStatus,
  updateBillboardStatus,
  generateSlotsForBillboard,
  getCampaignWithBillboardStatuses,
  updateCampaignName,
  getCampaignMetrics
}; 
