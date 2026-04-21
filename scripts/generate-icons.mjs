import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import png2icons from 'png2icons';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgIcon = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2D3142" />
      <stop offset="100%" stop-color="#1B1D28" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00C9FF" />
      <stop offset="100%" stop-color="#92FE9D" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#bg)" />
  <!-- Code Brackets -->
  <path d="M 350 400 L 250 512 L 350 624" fill="none" stroke="white" stroke-width="60" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
  <path d="M 674 400 L 774 512 L 674 624" fill="none" stroke="white" stroke-width="60" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
  <!-- stylized "A" -->
  <path d="M 512 280 L 380 740 M 512 280 L 644 740 M 430 580 L 594 580" fill="none" stroke="url(#accent)" stroke-width="80" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function buildIcons() {
  const iconDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(iconDir)) {
    fs.mkdirSync(iconDir, { recursive: true });
  }

  const svgPath = path.join(iconDir, 'icon.svg');
  const pngPath = path.join(iconDir, 'icon.png');
  const icnsPath = path.join(iconDir, 'icon.icns');
  const icoPath = path.join(iconDir, 'icon.ico');

  fs.writeFileSync(svgPath, svgIcon);
  console.log('Created SVG icon.');

  // Render SVG to PNG 1024x1024
  const pngBuffer = await sharp(Buffer.from(svgIcon))
    .resize(1024, 1024)
    .png()
    .toBuffer();

  fs.writeFileSync(pngPath, pngBuffer);
  console.log('Created PNG icon (1024x1024).');

  // Convert to ICNS
  const icnsBuffer = png2icons.createICNS(pngBuffer, png2icons.BICUBIC2, 0);
  if (icnsBuffer) {
    fs.writeFileSync(icnsPath, icnsBuffer);
    console.log('Created ICNS icon (macOS).');
  }

  // Convert to ICO
  const icoBuffer = png2icons.createICO(pngBuffer, png2icons.BICUBIC2, 0, false, true);
  if (icoBuffer) {
    fs.writeFileSync(icoPath, icoBuffer);
    console.log('Created ICO icon (Windows).');
  }
  
  // Create smaller pngs for linux/web
  const sizes = [512, 256, 128, 64, 32];
  for (const size of sizes) {
    await sharp(pngBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconDir, \`icon-\${size}x\${size}.png\`));
    console.log(\`Created PNG icon (\${size}x\${size}).\`);
  }
}

buildIcons().catch(err => console.error(err));