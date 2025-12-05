#!/usr/bin/env node

/**
 * Create pilotstack Icon
 * 
 * Generates a stylized "P" icon for the pilotstack desktop app.
 * Uses sharp to create the icon with proper transparency.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// pilotstack brand colors (neo-brutalist style)
const COLORS = {
  coral: '#ff6b6b',      // Primary brand color (bg)
  black: '#1a1a1a',      // Border/text color
  white: '#ffffff',      // For contrast
};

// SVG template for the pilotstack "P" icon
// A bold, rounded "P" on a coral background with neo-brutalist style
function createIconSVG(size) {
  const padding = Math.round(size * 0.08);
  const cornerRadius = Math.round(size * 0.15);
  const strokeWidth = Math.round(size * 0.03);
  
  // Letter positioning and sizing
  const letterSize = Math.round(size * 0.6);
  const letterX = Math.round(size * 0.32);
  const letterY = Math.round(size * 0.72);
  
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background with rounded corners -->
  <rect 
    x="${padding}" 
    y="${padding}" 
    width="${size - padding * 2}" 
    height="${size - padding * 2}" 
    rx="${cornerRadius}" 
    ry="${cornerRadius}" 
    fill="${COLORS.coral}"
    stroke="${COLORS.black}"
    stroke-width="${strokeWidth}"
  />
  
  <!-- Letter "P" -->
  <text 
    x="${letterX}" 
    y="${letterY}" 
    font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" 
    font-size="${letterSize}px" 
    font-weight="900" 
    fill="${COLORS.black}"
  >P</text>
  
  <!-- Small decorative element (like a play/record indicator) -->
  <circle 
    cx="${size * 0.75}" 
    cy="${size * 0.25}" 
    r="${size * 0.06}" 
    fill="${COLORS.white}"
    stroke="${COLORS.black}"
    stroke-width="${strokeWidth * 0.5}"
  />
</svg>
`.trim();
}

async function createIcon() {
  console.log('🎨 Creating pilotstack icon...\n');

  // Generate 512x512 icon
  const size = 512;
  const svg = createIconSVG(size);
  
  // Save SVG for reference
  const svgPath = path.join(ASSETS_DIR, 'icon.svg');
  fs.writeFileSync(svgPath, svg);
  console.log('  ✓ Created icon.svg');

  // Convert to PNG using sharp
  const pngPath512 = path.join(ASSETS_DIR, 'icon_512.png');
  await sharp(Buffer.from(svg))
    .resize(512, 512)
    .png()
    .toFile(pngPath512);
  console.log('  ✓ Created icon_512.png');

  // Also create icon.png (smaller version for tray, etc.)
  const pngPath = path.join(ASSETS_DIR, 'icon.png');
  await sharp(Buffer.from(svg))
    .resize(256, 256)
    .png()
    .toFile(pngPath);
  console.log('  ✓ Created icon.png (256x256)');

  // Create tray icon (16x16 for menu bar)
  const trayPath = path.join(ASSETS_DIR, 'icon_tray.png');
  await sharp(Buffer.from(svg))
    .resize(16, 16)
    .png()
    .toFile(trayPath);
  console.log('  ✓ Created icon_tray.png (16x16)');

  // Create various sizes for different platforms
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const iconsDir = path.join(ASSETS_DIR, 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  for (const s of sizes) {
    const outputPath = path.join(iconsDir, `icon_${s}x${s}.png`);
    await sharp(Buffer.from(createIconSVG(s)))
      .resize(s, s)
      .png()
      .toFile(outputPath);
    console.log(`  ✓ Created icon_${s}x${s}.png`);
  }

  console.log('\n✅ pilotstack icon created successfully!');
  console.log('\nNow run the full icon generation script:');
  console.log('  node scripts/generate-icons.js');
}

createIcon().catch((error) => {
  console.error('❌ Error creating icon:', error);
  process.exit(1);
});

