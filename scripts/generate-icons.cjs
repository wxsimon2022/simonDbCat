const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const svgPath = path.join(__dirname, '..', 'src', 'assets', 'logo.svg');
const assetsDir = path.join(__dirname, '..', 'build');
const srcAssetsDir = path.join(__dirname, '..', 'src', 'assets');

// Ensure build directory exists
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

async function generate() {
  const svgBuffer = fs.readFileSync(svgPath);

  const sizes = [
    { name: 'icon-16.png', size: 16 },
    { name: 'icon-32.png', size: 32 },
    { name: 'icon-48.png', size: 48 },
    { name: 'icon-64.png', size: 64 },
    { name: 'icon-128.png', size: 128 },
    { name: 'icon-256.png', size: 256 },
    { name: 'icon-512.png', size: 512 },
    { name: 'icon.png', size: 1024 },        // Main app icon (macOS/electron-builder)
    { name: 'hero.png', size: 128 },          // Web app topbar icon
  ];

  for (const { name, size } of sizes) {
    const outPath = name === 'hero.png'
      ? path.join(srcAssetsDir, name)
      : path.join(assetsDir, name);

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outPath);

    console.log(`✓ ${name} (${size}x${size}) -> ${path.relative(path.join(__dirname,'..'), outPath)}`);
  }

  // Also create a 1024x1024 PNG as the primary icon in the project root
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(__dirname, '..', 'build', 'icon.png'));

  console.log('✓ All icons generated successfully');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
