const prisma = require('../db/db');
const logger = require('../config/logger');

/**
 * Cascade screen_id changes to all related tables:
 * 1. GeneratedSlot (screenId array)
 * 2. DailySchedule (screenId field)
 * 
 * @param {string} billboardId - The ID of the billboard being updated
 * @param {string|null} oldScreenId - The previous screen ID
 * @param {string|null} newScreenId - The new screen ID
 */
async function cascadeScreenIdUpdate(billboardId, oldScreenId, newScreenId, tx = null) {
    if (oldScreenId === newScreenId) return;
    
    const db = tx || prisma;
    logger.billboard('Cascading screen_id update', `Billboard: ${billboardId}, ${oldScreenId || 'NULL'} -> ${newScreenId || 'NULL'}`);
    
    const operation = async (dbClient) => {
        // 1. Update GeneratedSlot records
        const records = await dbClient.generatedSlot.findMany({
            where: {
                billboardIds: { has: billboardId }
            }
        });
        
        logger.info(`Updating ${records.length} GeneratedSlot records for billboard ${billboardId}`);
        
        for (const record of records) {
            const index = record.billboardIds.indexOf(billboardId);
            if (index !== -1) {
                const updatedScreenIds = [...record.screenId];
                if (index < updatedScreenIds.length) {
                    updatedScreenIds[index] = newScreenId || ''; 
                    
                    await dbClient.generatedSlot.update({
                        where: { id: record.id },
                        data: { screenId: updatedScreenIds }
                    });
                }
            }
        }
        
        // 2. Update DailySchedule records
        if (oldScreenId && newScreenId) {
            const schedules = await dbClient.dailySchedule.findMany({
                where: { screenId: oldScreenId }
            });
            
            logger.info(`Moving ${schedules.length} DailySchedule records from ${oldScreenId} to ${newScreenId}`);
            
            for (const schedule of schedules) {
                const existingNew = await dbClient.dailySchedule.findUnique({
                    where: {
                        screenId_scheduleDate: {
                            screenId: newScreenId,
                            scheduleDate: schedule.scheduleDate
                        }
                    }
                });
                
                if (!existingNew) {
                    await dbClient.dailySchedule.update({
                        where: { id: schedule.id },
                        data: { screenId: newScreenId }
                    });
                }
            }
        }
    };

    try {
        if (tx) {
            await operation(tx);
        } else {
            await prisma.$transaction(async (t) => {
                await operation(t);
            });
        }
        logger.billboard('Cascade screen_id update completed successfully', `Billboard: ${billboardId}`);
    } catch (error) {
        logger.error(`Failed to cascade screen_id update for billboard ${billboardId}:`, error);
        throw error;
    }
}

module.exports = { cascadeScreenIdUpdate };
