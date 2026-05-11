#!/bin/bash

# Railway Production Migration Script
# This script runs the database migration on your Railway MySQL instance

echo "🚀 Charles Schwab - Railway Production Migration"
echo "================================================"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found!"
    echo ""
    echo "Please install Railway CLI first:"
    echo "npm install -g @railway/cli"
    echo ""
    echo "Then login and link your project:"
    echo "railway login"
    echo "railway link"
    exit 1
fi

# Check if we're in a Railway project
if [ ! -f "railway.json" ] && [ ! -d ".railway" ]; then
    echo "⚠️  Not in a Railway project directory"
    echo ""
    echo "Please run 'railway link' first to connect to your Railway project"
    echo ""
fi

echo "📋 Migration Steps:"
echo "1. Connect to Railway MySQL database"
echo "2. Run ALTER migrations (add missing columns)"
echo "3. Run CREATE migrations (add missing tables)"
echo "4. Verify platform_accounts table structure"
echo ""

# Option 1: Use Railway CLI to get environment and run migration
echo "🔄 Running migration via Railway CLI..."
echo ""

# Run the migration using Railway's environment
railway run node migrate-production.js

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Migration completed successfully!"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Add production platform accounts:"
    echo "   railway run node add-production-accounts.js"
    echo ""
    echo "2. Or manually add accounts via admin panel"
    echo ""
    echo "3. Test the deposit flow with real account details"
    echo ""
else
    echo ""
    echo "❌ Migration failed!"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "1. Check Railway project is linked: railway status"
    echo "2. Verify MySQL service is running: railway ps"
    echo "3. Check database connection: railway connect mysql"
    echo ""
fi