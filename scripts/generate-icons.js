const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const inputFile = path.join(__dirname, '../android/app/src/main/res/drawable/tripper_logo.png');
const outputBase = path.join(__dirname, '../android/app/src/main/res');

async function generateIcons() {
  for (const [folder, size] of Object.entries(SIZES)) {
    const outputDir = path.join(outputBase, folder);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, {recursive: true});

    // Regular icon
    await sharp(inputFile)
      .resize(size, size, {fit: 'contain', background: {r: 15, g: 15, b: 26, alpha: 1}})
      .png()
      .toFile(path.join(outputDir, 'ic_launcher.png'));

    // Round icon
    await sharp(inputFile)
      .resize(size, size, {fit: 'contain', background: {r: 15, g: 15, b: 26, alpha: 1}})
      .png()
      .toFile(path.join(outputDir, 'ic_launcher_round.png'));

    console.log(`✅ Generated ${folder} (${size}x${size})`);
  }
  console.log('🎉 All icons generated!');
}

generateIcons().catch(console.error);