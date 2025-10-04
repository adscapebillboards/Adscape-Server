@echo off
REM Campaign Approval Automation Deployment Script for Windows
REM This script helps deploy and test the new automated campaign approval system

setlocal enabledelayedexpansion

echo 🚀 Campaign Approval Automation Deployment Script
echo.

REM Configuration
set DB_MIGRATION_FILE=supabase\migrations\20250408000000_campaign_approval_automation.sql
set TEST_SCRIPT=test-campaign-approval-automation.js
set BACKUP_DIR=backups\%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Please run this script from the server directory
    pause
    exit /b 1
)

REM Check if required files exist
if not exist "%DB_MIGRATION_FILE%" (
    echo ❌ Database migration file not found: %DB_MIGRATION_FILE%
    pause
    exit /b 1
)

if not exist "%TEST_SCRIPT%" (
    echo ❌ Test script not found: %TEST_SCRIPT%
    pause
    exit /b 1
)

echo ℹ️  Starting deployment process...

REM Step 1: Create backup directory
echo ℹ️  Creating backup directory...
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
echo ✅ Backup directory created: %BACKUP_DIR%

REM Step 2: Check dependencies
echo ℹ️  Checking dependencies...
if not exist "node_modules" (
    echo ℹ️  Installing dependencies...
    npm install
    if !errorlevel! neq 0 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed
) else (
    echo ✅ Dependencies already installed
)

REM Step 3: Database migration
echo ℹ️  Applying database migration...
echo ⚠️  This will modify your database schema. Make sure you have a backup!
echo.
set /p CONTINUE="Do you want to continue with the database migration? (y/N): "
if /i "!CONTINUE!"=="y" (
    echo ℹ️  Running database migration...
    
    REM Check database connection through Prisma
    node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.$connect().then(() => { console.log('Database connection successful'); return prisma.$disconnect(); }).catch(err => { console.error('Database connection failed:', err.message); process.exit(1); });" 2>nul
    if !errorlevel! equ 0 (
        echo ✅ Database connection verified through Prisma
    ) else (
        echo ❌ Cannot connect to database through Prisma. Please check your database configuration.
        pause
        exit /b 1
    )
    
    echo ℹ️  Migration file contents:
    echo ----------------------------------------
    type "%DB_MIGRATION_FILE%" | findstr /n "^" | findstr "^1:" >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "tokens=1,2 delims=:" %%a in ('type "%DB_MIGRATION_FILE%" | findstr /n "^" | findstr "^[1-20]:"') do (
            echo %%b
        )
    )
    echo ...
    echo ----------------------------------------
    
    echo ⚠️  Please manually apply the migration file: %DB_MIGRATION_FILE%
    echo ℹ️  You can copy and paste the SQL commands into your database client
    
) else (
    echo ⚠️  Database migration skipped
)

REM Step 4: Test the system
echo ℹ️  Testing the automation system...
if exist "%TEST_SCRIPT%" (
    echo ℹ️  Test script found. You can run it manually with:
    echo   node %TEST_SCRIPT%
    echo.
    set /p RUN_TEST="Do you want to run the test now? (y/N): "
    if /i "!RUN_TEST!"=="y" (
        echo ℹ️  Running test script...
        node "%TEST_SCRIPT%"
        if !errorlevel! equ 0 (
            echo ✅ Test completed successfully
        ) else (
            echo ❌ Test failed. Please check the output above for errors.
        )
    ) else (
        echo ℹ️  Test skipped. You can run it later with: node %TEST_SCRIPT%
    )
) else (
    echo ❌ Test script not found
)

REM Step 5: Verification steps
echo.
echo ℹ️  Deployment verification steps:
echo 1. Check that database triggers are created:
echo    SELECT * FROM information_schema.triggers WHERE trigger_name LIKE '%%campaign%%';
echo.
echo 2. Verify functions exist:
echo    SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE '%%campaign%%';
echo.
echo 3. Test with a sample campaign:
echo    - Create a campaign with multiple billboards
echo    - Approve billboards one by one
echo    - Verify campaign status updates automatically
echo    - Check that slots are generated
echo    - Confirm user metrics are updated

REM Step 6: Final status
echo.
echo ℹ️  Deployment process completed!
echo ✅ Files created/modified:
echo   - %DB_MIGRATION_FILE% (Database migration)
echo   - %TEST_SCRIPT% (Test script)
echo   - CAMPAIGN-APPROVAL-AUTOMATION.md (Documentation)
echo   - Enhanced campaignApiController.js (API controller)
echo.
echo ℹ️  Next steps:
echo 1. Apply the database migration manually
echo 2. Test the system with the test script
echo 3. Deploy the updated controller to production
echo 4. Monitor the system for any issues
echo.
echo ✅ Deployment script completed successfully! 🎉

REM Create deployment notes
echo.
echo ℹ️  Creating deployment notes...
(
echo Campaign Approval Automation - Deployment Notes
echo ===============================================
echo.
echo Deployment Date: %date% %time%
echo Migration File: %DB_MIGRATION_FILE%
echo Test Script: %TEST_SCRIPT%
echo.
echo Database Changes:
echo - New triggers for automatic campaign status updates
echo - New functions for slot generation and user metrics
echo - New indexes for performance optimization
echo.
echo API Changes:
echo - Enhanced validation in updateBillboardStatus
echo - Better error handling and logging
echo - Automatic trigger verification
echo.
echo Testing:
echo - Run: node %TEST_SCRIPT%
echo - Verify database triggers are working
echo - Test complete approval workflow
echo.
echo Documentation:
echo - See CAMPAIGN-APPROVAL-AUTOMATION.md for full details
echo - Troubleshooting guide included
echo.
echo Support:
echo - Check database logs for trigger execution
echo - Monitor API responses for validation errors
echo - Verify slot generation in generated_slots table
) > "deployment-notes.txt"

echo ✅ Deployment notes saved to: deployment-notes.txt
echo.
pause
