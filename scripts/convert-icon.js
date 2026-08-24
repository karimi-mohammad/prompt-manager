// convert-icon.js — Convert SVG to ICO using sharp
// Run: node scripts/convert-icon.js

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SVG_PATH = path.join(__dirname, '..', 'assets', 'icon.svg');
const ICO_PATH = path.join(__dirname, '..', 'assets', 'icon.ico');
const PNG_PATH = path.join(__dirname, '..', 'assets', 'icon.png');

async function convert() {
  const svgBuffer = fs.readFileSync(SVG_PATH);

  // Generate multiple sizes for ICO
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const png = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: png });
  }

  // Also save a 256px PNG for electron-builder
  const mainPng = await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toBuffer();
  fs.writeFileSync(PNG_PATH, mainPng);

  // Build ICO file
  // ICO format: header + directory entries + PNG data
  const numImages = pngBuffers.length;

  // ICO header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);       // Reserved
  header.writeUInt16LE(1, 2);       // Type: 1 = ICO
  header.writeUInt16LE(numImages, 4); // Number of images

  // Directory entries (16 bytes each)
  const dirSize = numImages * 16;
  const dir = Buffer.alloc(dirSize);
  let dataOffset = 6 + dirSize;

  for (let i = 0; i < numImages; i++) {
    const { size, buffer } = pngBuffers[i];
    const entryOffset = i * 16;

    dir.writeUInt8(size < 256 ? size : 0, entryOffset);      // Width
    dir.writeUInt8(size < 256 ? size : 0, entryOffset + 1);  // Height
    dir.writeUInt8(0, entryOffset + 2);    // Color palette
    dir.writeUInt8(0, entryOffset + 3);    // Reserved
    dir.writeUInt16LE(1, entryOffset + 4); // Color planes
    dir.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    dir.writeUInt32LE(buffer.length, entryOffset + 8);  // Data size
    dir.writeUInt32LE(dataOffset, entryOffset + 12); // Data offset

    dataOffset += buffer.length;
  }

  // Combine all
  const ico = Buffer.concat([header, dir, ...pngBuffers.map(b => b.buffer)]);
  fs.writeFileSync(ICO_PATH, ico);

  console.log(`✅ icon.ico created: ${ICO_PATH} (${(ico.length / 1024).toFixed(1)} KB)`);
  console.log(`✅ icon.png created: ${PNG_PATH}`);
}

convert().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
