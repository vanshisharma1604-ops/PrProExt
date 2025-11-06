#!/bin/bash

# Extension cleanup script for Light Copilot Premiere Pro Extension
# Extension ID: com.lightskiddo.ppro.panel
# Bundle ID: com.lightskiddo.ppro

set -e

echo "🧹 Cleaning up Light Copilot extension and all caches..."

# Extension installation directories
EXT_DIRS=(
    "$HOME/Library/Application Support/Adobe/CEP/extensions/com.lightskiddo.ppro"
    "$HOME/Library/Application Support/Adobe/CEP/extensions/com.lightskiddo.ppro.panel"
    "$HOME/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore/com.lightskiddo.ppro"
    "$HOME/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore/com.lightskiddo.ppro.panel"
)

# Cache directories
CACHE_DIRS=(
    "$HOME/Library/Application Support/Adobe/CEP/extensions/.debug"
    "$HOME/Library/Caches/com.adobe.cep"
    "$HOME/Library/Caches/Adobe"
    "$HOME/Library/Preferences/com.adobe.cep.*"
)

# Debug files
DEBUG_FILES=(
    "$HOME/Library/Application Support/Adobe/CEP/extensions/.debug"
)

# Remove extension directories
echo "📁 Removing extension directories..."
for dir in "${EXT_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "  Removing: $dir"
        rm -rf "$dir"
    else
        echo "  Not found: $dir"
    fi
done

# Remove cache directories
echo "🗑️  Removing cache directories..."
for dir in "${CACHE_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "  Removing: $dir"
        rm -rf "$dir"
    elif [ -f "$dir" ]; then
        echo "  Removing file: $dir"
        rm -f "$dir"
    else
        echo "  Not found: $dir"
    fi
done

# Remove debug files
echo "🐛 Removing debug files..."
for file in "${DEBUG_FILES[@]}"; do
    if [ -f "$file" ] || [ -d "$file" ]; then
        echo "  Removing: $file"
        rm -rf "$file"
    fi
done

# Remove any .debug files in the dist directory
if [ -f "dist/.debug" ]; then
    echo "  Removing dist/.debug"
    rm -f "dist/.debug"
fi

# Clear CEP preferences
echo "⚙️  Clearing CEP preferences..."
find "$HOME/Library/Preferences" -name "com.adobe.cep*" -type f 2>/dev/null | while read -r pref; do
    echo "  Removing: $pref"
    rm -f "$pref"
done

# Clear any extension-specific preferences
find "$HOME/Library/Preferences" -name "*lightskiddo*" -type f 2>/dev/null | while read -r pref; do
    echo "  Removing: $pref"
    rm -f "$pref"
done

# Clear browser cache (if CEP uses browser cache)
echo "🌐 Clearing browser-related caches..."
if [ -d "$HOME/Library/Caches/Google/Chrome" ]; then
    echo "  Note: Chrome cache found (may contain CEP data)"
fi

# Kill any running CEP processes (optional, commented out for safety)
# echo "🛑 Killing CEP processes..."
# pkill -f "CEP" 2>/dev/null || true

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Next steps:"
echo "1. Restart Premiere Pro"
echo "2. Reinstall the extension from the dist/ folder"
echo "3. The extension should now use localhost:4001"

