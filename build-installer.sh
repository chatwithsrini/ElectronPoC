#!/bin/bash

# ================================================================
# Custom Installer Build Script
# ================================================================
# This script builds the Electron application with custom installer
# Usage: ./build-installer.sh
# ================================================================

echo "=========================================="
echo "Electron POC - Custom Installer Builder"
echo "=========================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "⚠ node_modules not found. Running npm install..."
    npm install
    if [ $? -ne 0 ]; then
        echo "✗ npm install failed!"
        exit 1
    fi
    echo "✓ Dependencies installed"
    echo ""
fi

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf release/
rm -rf dist/
echo "✓ Cleaned"
echo ""

# Build styles
echo "🎨 Building styles..."
npm run build:styles
if [ $? -ne 0 ]; then
    echo "✗ Style build failed!"
    exit 1
fi
echo "✓ Styles built"
echo ""

# Build application
echo "⚙️  Building application with Vite..."
npm run build
if [ $? -ne 0 ]; then
    echo "✗ Application build failed!"
    exit 1
fi
echo "✓ Application built"
echo ""

# Build installer
echo "📦 Building custom installer..."
echo "   This may take a few minutes..."
npm run dist:win:x64
if [ $? -ne 0 ]; then
    echo "✗ Installer build failed!"
    exit 1
fi
echo "✓ Installer built successfully"
echo ""

# Check output
echo "=========================================="
echo "Build Complete!"
echo "=========================================="
if [ -d "release" ]; then
    echo ""
    echo "📁 Output files:"
    ls -lh release/*.exe 2>/dev/null || echo "   No .exe files found"
    echo ""
    echo "Installer location:"
    find release -name "*.exe" -type f 2>/dev/null | while read file; do
        echo "   → $file"
    done
    echo ""
else
    echo "⚠ Warning: release directory not found"
fi

echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo "1. Test the installer on a Windows machine"
echo "2. Try different test scenarios (see CUSTOM_INSTALLER_README.md)"
echo "3. Verify requirements validation works"
echo ""
echo "To test:"
echo "  - Run the installer on Windows 10+ (should succeed)"
echo "  - Test on older Windows or low-spec VM (should fail)"
echo ""
echo "For more information, see CUSTOM_INSTALLER_README.md"
echo ""
