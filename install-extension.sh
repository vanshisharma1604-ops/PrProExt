#!/bin/bash

# Install/Link extension for Premiere Pro development
# This creates a symlink from the CEP extensions folder to your dist folder

set -e

EXTENSION_ID="com.lightskiddo.ppro.panel"
DIST_DIR="$(cd "$(dirname "$0")" && pwd)/dist"
CEP_EXTENSIONS_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
EXTENSION_INSTALL_DIR="$CEP_EXTENSIONS_DIR/$EXTENSION_ID"

echo "🔧 Installing Light Copilot extension for Premiere Pro..."
echo ""

# Create CEP extensions directory if it doesn't exist
if [ ! -d "$CEP_EXTENSIONS_DIR" ]; then
    echo "📁 Creating CEP extensions directory..."
    mkdir -p "$CEP_EXTENSIONS_DIR"
fi

# Check if dist directory exists
if [ ! -d "$DIST_DIR" ]; then
    echo "❌ Error: dist/ directory not found!"
    echo "   Run 'npm run build' first."
    exit 1
fi

# Check if .debug file exists
if [ ! -f "$DIST_DIR/.debug" ]; then
    echo "❌ Error: .debug file not found in dist/"
    echo "   Run 'npm run build' first."
    exit 1
fi

# Remove existing installation (if it exists)
if [ -e "$EXTENSION_INSTALL_DIR" ]; then
    echo "🗑️  Removing existing installation..."
    rm -rf "$EXTENSION_INSTALL_DIR"
fi

# Create symlink to dist folder
echo "🔗 Creating symlink from CEP extensions to dist folder..."
ln -s "$DIST_DIR" "$EXTENSION_INSTALL_DIR"

if [ -L "$EXTENSION_INSTALL_DIR" ]; then
    echo "✅ Extension symlinked successfully!"
    echo ""
    echo "Installation details:"
    echo "  Source: $DIST_DIR"
    echo "  Link:   $EXTENSION_INSTALL_DIR"
    echo ""
    echo "Next steps:"
    echo "1. Restart Premiere Pro completely"
    echo "2. Go to Window > Extensions > Light Copilot"
    echo "3. The extension should now appear!"
else
    echo "❌ Failed to create symlink"
    exit 1
fi

