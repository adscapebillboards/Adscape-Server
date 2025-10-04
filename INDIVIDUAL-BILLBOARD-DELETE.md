# Individual Billboard Deletion Implementation

## Overview
This implementation allows users to delete individual billboards from campaigns while keeping the campaign intact, rather than deleting the entire campaign.

## Changes Made

### 1. Backend Implementation

#### Added Delete Billboard Function (`server/controllers/campaignApiController.js`)
- **Function**: `deleteBillboardFromCampaign`
- **Purpose**: Removes a specific billboard from a campaign
- **Features**:
  - Validates campaign and billboard exist
  - Removes billboard from campaign's billboards array
  - Recalculates campaign total amount
  - Cleans up related data (slots, play logs, plays)
  - Updates campaign with new billboards array

#### Added Delete Billboard Route (`server/routes/campaignApi.js`)
- **Route**: `DELETE /api/campaigns/:campaignId/billboards/:billboardId`
- **Controller**: `deleteBillboardFromCampaign`
- **Access**: Available to admin users

### 2. Frontend Implementation

#### Updated Delete Handler (`AdminX/src/pages/adminX/Bookings.tsx`)
- **Smart Detection**: Automatically detects if deleting campaign or billboard
- **Dynamic API Calls**: Uses appropriate endpoint based on context
- **Contextual Messages**: Shows different success messages for billboard vs campaign deletion

#### Enhanced Delete Dialog (`AdminX/src/components/adminX/bookings/DeleteBookingDialog.tsx`)
- **Dynamic Titles**: "Remove Billboard?" vs "Delete Campaign?"
- **Contextual Descriptions**: Different messages for billboard vs campaign deletion
- **Dynamic Button Text**: "Remove" vs "Delete"

## API Endpoints

### DELETE /api/campaigns/:campaignId/billboards/:billboardId

#### Request
```http
DELETE /api/campaigns/{campaignId}/billboards/{billboardId}
```

#### Response
**Success (200)**
```json
{
  "message": "Billboard deleted from campaign successfully",
  "campaignId": "uuid-string",
  "billboardId": "billboard-id",
  "remainingBillboards": 2,
  "newTotalAmount": 24000
}
```

**Error (404)**
```json
{
  "error": "Campaign not found"
}
```

**Error (404)**
```json
{
  "error": "Billboard not found in campaign"
}
```

## Data Processing Logic

### Billboard Removal Process
1. **Validation**: Check if campaign and billboard exist
2. **Array Update**: Remove billboard from campaign's billboards array
3. **Total Recalculation**: Calculate new total amount from remaining billboards
4. **Data Cleanup**: Delete related data for the specific billboard
5. **Campaign Update**: Update campaign with new billboards array and total

### Data Cleanup
```javascript
// Delete generated slots for this specific billboard
await tx.generatedSlot.deleteMany({
  where: { 
    campaignId: campaignId,
    billboardId: billboardId
  }
});

// Delete asset play logs for this billboard's assets
await tx.assetPlayLog.deleteMany({
  where: { 
    campaignId: campaignId,
    assetUrl: { in: billboardToDelete.files }
  }
});

// Delete asset plays for this billboard's assets
await tx.assetPlay.deleteMany({
  where: { 
    campaignId: campaignId,
    assetUrl: { in: billboardToDelete.files }
  }
});
```

## Frontend Integration

### Smart Delete Detection
The frontend automatically detects the context:

```javascript
// Check if we're deleting an individual billboard or the entire campaign
if (selectedBooking.billboardId) {
  // Delete individual billboard
  deleteUrl = `/api/campaigns/${selectedBooking.campaignId}/billboards/${selectedBooking.billboardId}`;
  successMessage = `Billboard "${selectedBooking.billboardLocation}" has been removed from the campaign`;
} else {
  // Delete entire campaign
  deleteUrl = `/api/campaigns/${selectedBooking.campaignId}`;
  successMessage = `Campaign "${selectedBooking.campaignName}" has been deleted successfully`;
}
```

### User Experience
1. **Campaign Row Delete**: Deletes entire campaign
2. **Billboard Row Delete**: Removes only that billboard from campaign
3. **Contextual Dialogs**: Different messages and confirmations
4. **Immediate Feedback**: Success messages and data refresh

## Benefits

### For Users
- **Granular Control**: Remove specific billboards without losing entire campaign
- **Flexibility**: Modify campaigns by removing underperforming billboards
- **Cost Management**: Remove expensive billboards to reduce campaign cost
- **Risk Reduction**: Avoid accidental deletion of entire campaigns

### For System
- **Data Integrity**: Proper cleanup of related data
- **Consistency**: Campaign totals are recalculated automatically
- **Audit Trail**: All deletions are logged for tracking
- **Performance**: Efficient database operations using transactions

## Usage Scenarios

### Scenario 1: Remove Underperforming Billboard
- User notices a billboard isn't performing well
- Clicks delete on that specific billboard row
- Billboard is removed, campaign continues with remaining billboards
- Campaign total is recalculated

### Scenario 2: Budget Adjustment
- User needs to reduce campaign cost
- Removes the most expensive billboard
- Campaign continues with reduced budget
- All related data is cleaned up

### Scenario 3: Location Change
- User wants to change campaign focus
- Removes billboards from specific locations
- Campaign adapts to new location strategy

## Error Handling

### Backend Errors
- **Campaign Not Found**: Returns 404 with clear message
- **Billboard Not Found**: Returns 404 if billboard doesn't exist in campaign
- **Invalid Data**: Returns 500 for malformed billboards data
- **Transaction Failures**: Automatic rollback of all changes

### Frontend Errors
- **Network Errors**: Shows user-friendly error message
- **API Errors**: Displays specific error from server
- **Validation Errors**: Prevents invalid deletion attempts

## Testing

### Manual Testing Steps
1. **Navigate to Bookings page** in AdminX
2. **Expand a campaign** with multiple billboards
3. **Click delete** on a specific billboard row
4. **Confirm removal** in dialog
5. **Verify billboard is removed** from campaign
6. **Check campaign total** is recalculated
7. **Verify related data** is cleaned up

### Expected Results
- Billboard disappears from expanded campaign view
- Campaign total amount is updated
- Success message shows "Billboard Removed"
- Campaign continues with remaining billboards
- No orphaned data in database

## Future Enhancements

1. **Bulk Billboard Removal**: Remove multiple billboards at once
2. **Replacement Options**: Suggest alternative billboards when removing
3. **Impact Analysis**: Show cost and reach impact before removal
4. **Undo Functionality**: Allow restoring recently removed billboards
5. **Scheduling**: Schedule billboard removal for future dates



































