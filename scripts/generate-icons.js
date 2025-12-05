#!/usr/bin/env node

/**
 * Icon Generator for pilotstack Desktop
 * 
 * Generates platform-specific icon files from the source PNG.
 * 
 * Usage: node scripts/generate-icons.js
 * 
 * Requirements:
 * - sharp (npm install sharp)
 * - For .icns: npm install -g png2icons (optional, electron-builder handles this)
 * 
 * The script generates:
 * - icon.icns for macOS
 * - icon.ico for Windows  
 * - Various PNG sizes for Linux
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SOURCE_ICON = path.join(ASSETS_DIR, 'icon_512.png');

// Required sizes for different platforms
const ICON_SIZES = {
  // macOS iconset sizes
  macos: [16, 32, 64, 128, 256, 512, 1024],
  // Windows .ico sizes
  windows: [16, 24, 32, 48, 64, 128, 256],
  // Linux sizes
  linux: [16, 24, 32, 48, 64, 128, 256, 512],
};

async function generateIcons() {
  console.log('🎨 Generating icons from:', SOURCE_ICON);
  
  if (!fs.existsSync(SOURCE_ICON)) {
    console.error('❌ Source icon not found:', SOURCE_ICON);
    process.exit(1);
  }

  // Create icons directory if it doesn't exist
  const iconsDir = path.join(ASSETS_DIR, 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  // Generate PNG icons at various sizes
  console.log('\n📐 Generating PNG icons at various sizes...');
  
  const allSizes = [...new Set([
    ...ICON_SIZES.macos,
    ...ICON_SIZES.windows,
    ...ICON_SIZES.linux,
  ])].sort((a, b) => a - b);

  for (const size of allSizes) {
    const outputPath = path.join(iconsDir, `icon_${size}x${size}.png`);
    await sharp(SOURCE_ICON)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outputPath);
    console.log(`  ✓ Generated ${size}x${size}`);
  }

  // Generate @2x versions for macOS Retina
  console.log('\n📐 Generating @2x Retina icons...');
  const retinaSizes = [16, 32, 128, 256, 512];
  for (const size of retinaSizes) {
    const outputPath = path.join(iconsDir, `icon_${size}x${size}@2x.png`);
    await sharp(SOURCE_ICON)
      .resize(size * 2, size * 2, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outputPath);
    console.log(`  ✓ Generated ${size}x${size}@2x`);
  }

  // Create macOS .iconset directory structure
  console.log('\n🍎 Creating macOS iconset structure...');
  const iconsetDir = path.join(ASSETS_DIR, 'icon.iconset');
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }

  // macOS iconset naming convention
  const iconsetMappings = [
    { size: 16, name: 'icon_16x16.png' },
    { size: 32, name: 'icon_16x16@2x.png' },
    { size: 32, name: 'icon_32x32.png' },
    { size: 64, name: 'icon_32x32@2x.png' },
    { size: 128, name: 'icon_128x128.png' },
    { size: 256, name: 'icon_128x128@2x.png' },
    { size: 256, name: 'icon_256x256.png' },
    { size: 512, name: 'icon_256x256@2x.png' },
    { size: 512, name: 'icon_512x512.png' },
    { size: 1024, name: 'icon_512x512@2x.png' },
  ];

  for (const { size, name } of iconsetMappings) {
    const outputPath = path.join(iconsetDir, name);
    await sharp(SOURCE_ICON)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outputPath);
  }
  console.log('  ✓ Created icon.iconset directory');

  console.log('\n✅ Icon generation complete!');
  console.log('\nTo create .icns file on macOS, run:');
  console.log('  iconutil -c icns assets/icon.iconset -o assets/icon.icns');
  console.log('\nOr electron-builder will auto-generate it during build.');
}

generateIcons().catch((error) => {
  console.error('❌ Error generating icons:', error);
  process.exit(1);
});

