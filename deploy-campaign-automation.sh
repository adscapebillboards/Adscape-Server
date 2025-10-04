#!/bin/bash

# Campaign Approval Automation Deployment Script
# This script helps deploy and test the new automated campaign approval system

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_MIGRATION_FILE="supabase/migrations/20250408000000_campaign_approval_automation.sql"
TEST_SCRIPT="test-campaign-approval-automation.js"
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"

echo -e "${BLUE}🚀 Campaign Approval Automation Deployment Script${NC}\n"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the server directory"
    exit 1
fi

# Check if required files exist
if [ ! -f "$DB_MIGRATION_FILE" ]; then
    print_error "Database migration file not found: $DB_MIGRATION_FILE"
    exit 1
fi

if [ ! -f "$TEST_SCRIPT" ]; then
    print_error "Test script not found: $TEST_SCRIPT"
    exit 1
fi

print_info "Starting deployment process..."

# Step 1: Create backup directory
print_info "Creating backup directory..."
mkdir -p "$BACKUP_DIR"
print_status "Backup directory created: $BACKUP_DIR"

# Step 2: Check database connection
print_info "Checking database connection..."
if command -v psql &> /dev/null; then
    # Try to connect to database (adjust connection string as needed)
    if psql -h localhost -U postgres -d billboardhub -c "SELECT 1;" &> /dev/null; then
        print_status "Database connection successful"
    else
        print_warning "Could not connect to database with psql. Please ensure your database is running and accessible."
    fi
else
    print_warning "psql not found. Please ensure PostgreSQL client tools are installed."
fi

# Step 3: Install dependencies if needed
print_info "Checking dependencies..."
if [ ! -d "node_modules" ]; then
    print_info "Installing dependencies..."
    npm install
    print_status "Dependencies installed"
else
    print_status "Dependencies already installed"
fi

# Step 4: Run database migration
print_info "Applying database migration..."
print_warning "This will modify your database schema. Make sure you have a backup!"

read -p "Do you want to continue with the database migration? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Running database migration..."
    
    # Check if we can connect to the database through the application
    if node -e "
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        
        prisma.\$connect()
            .then(() => {
                console.log('Database connection successful');
                return prisma.\$disconnect();
            })
            .catch(err => {
                console.error('Database connection failed:', err.message);
                process.exit(1);
            });
    " 2>/dev/null; then
        print_status "Database connection verified through Prisma"
    else
        print_error "Cannot connect to database through Prisma. Please check your database configuration."
        exit 1
    fi
    
    # For now, we'll just show the migration content
    # In a real deployment, you would run this against your database
    print_info "Migration file contents:"
    echo "----------------------------------------"
    head -20 "$DB_MIGRATION_FILE"
    echo "..."
    echo "----------------------------------------"
    
    print_warning "Please manually apply the migration file: $DB_MIGRATION_FILE"
    print_info "You can copy and paste the SQL commands into your database client"
    
else
    print_warning "Database migration skipped"
fi

# Step 5: Test the system
print_info "Testing the automation system..."
if [ -f "$TEST_SCRIPT" ]; then
    print_info "Test script found. You can run it manually with:"
    echo "  node $TEST_SCRIPT"
    
    read -p "Do you want to run the test now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Running test script..."
        if node "$TEST_SCRIPT"; then
            print_status "Test completed successfully"
        else
            print_error "Test failed. Please check the output above for errors."
        fi
    else
        print_info "Test skipped. You can run it later with: node $TEST_SCRIPT"
    fi
else
    print_error "Test script not found"
fi

# Step 6: Verification steps
print_info "Deployment verification steps:"
echo "1. Check that database triggers are created:"
echo "   SELECT * FROM information_schema.triggers WHERE trigger_name LIKE '%campaign%';"
echo ""
echo "2. Verify functions exist:"
echo "   SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE '%campaign%';"
echo ""
echo "3. Test with a sample campaign:"
echo "   - Create a campaign with multiple billboards"
echo "   - Approve billboards one by one"
echo "   - Verify campaign status updates automatically"
echo "   - Check that slots are generated"
echo "   - Confirm user metrics are updated"

# Step 7: Cleanup and final status
print_info "Deployment process completed!"
print_status "Files created/modified:"
echo "  - $DB_MIGRATION_FILE (Database migration)"
echo "  - $TEST_SCRIPT (Test script)"
echo "  - CAMPAIGN-APPROVAL-AUTOMATION.md (Documentation)"
echo "  - Enhanced campaignApiController.js (API controller)"

print_info "Next steps:"
echo "1. Apply the database migration manually"
echo "2. Test the system with the test script"
echo "3. Deploy the updated controller to production"
echo "4. Monitor the system for any issues"

print_status "Deployment script completed successfully! 🎉"

# Optional: Create a quick reference file
cat > "deployment-notes.txt" << EOF
Campaign Approval Automation - Deployment Notes
===============================================

Deployment Date: $(date)
Migration File: $DB_MIGRATION_FILE
Test Script: $TEST_SCRIPT

Database Changes:
- New triggers for automatic campaign status updates
- New functions for slot generation and user metrics
- New indexes for performance optimization

API Changes:
- Enhanced validation in updateBillboardStatus
- Better error handling and logging
- Automatic trigger verification

Testing:
- Run: node $TEST_SCRIPT
- Verify database triggers are working
- Test complete approval workflow

Documentation:
- See CAMPAIGN-APPROVAL-AUTOMATION.md for full details
- Troubleshooting guide included

Support:
- Check database logs for trigger execution
- Monitor API responses for validation errors
- Verify slot generation in generated_slots table
EOF

print_status "Deployment notes saved to: deployment-notes.txt"
