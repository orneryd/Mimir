#!/bin/bash

# Configure Open WebUI to show only specific models
# This must be run AFTER creating an admin account in Open WebUI

echo "🔧 Configuring Open WebUI Model Whitelist..."
echo ""

# Models to whitelist
MODELS="gpt-4.1,gpt-4o,gpt-5-mini"

echo "📋 Models to whitelist: $MODELS"
echo ""
echo "⚠️  IMPORTANT: This requires manual configuration in Open WebUI"
echo ""
echo "Steps to limit models in Open WebUI:"
echo ""
echo "1. Open http://localhost:3000"
echo "2. Log in as admin (first user you created)"
echo "3. Click your profile icon → Settings"
echo "4. Go to 'Admin Panel' → 'Settings' → 'Connections'"
echo "5. Under 'OpenAI API', find 'Model Whitelist'"
echo "6. Enter these models (comma-separated):"
echo "   gpt-4.1,gpt-4o,gpt-5-mini"
echo "7. Click 'Save'"
echo ""
echo "Alternative: Hide unwanted models individually"
echo "1. Go to 'Admin Panel' → 'Models'"
echo "2. For each model you DON'T want, click the eye icon to hide it"
echo "3. Keep visible: gpt-4.1, gpt-4o, gpt-5-mini"
echo ""
echo "✅ After configuration, only the whitelisted models will appear in the dropdown"
