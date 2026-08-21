import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const source = process.argv[2] || path.resolve('marwaazpn logo.png');
if (!fs.existsSync(source)) throw new Error(`Source logo not found at: ${source}`);

// Extract clean circular seal emblem by clearing the outer white square box
async function prepareCleanCircularSealBuffer(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const cx = width / 2;
  const cy = height / 2;

  // Outer green ring radius in original marwaazpn logo.png (645x644)
  const outerSealRadius = (Math.min(width, height) / 2) * 0.826;
  const newBuffer = Buffer.alloc(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > outerSealRadius) {
        newBuffer[idx] = 0;
        newBuffer[idx + 1] = 0;
        newBuffer[idx + 2] = 0;
        newBuffer[idx + 3] = 0;
      } else if (dist > outerSealRadius - 3) {
        const alphaFactor = (outerSealRadius - dist) / 3;
        const newAlpha = Math.round(a * Math.max(0, Math.min(1, alphaFactor)));
        newBuffer[idx] = r;
        newBuffer[idx + 1] = g;
        newBuffer[idx + 2] = b;
        newBuffer[idx + 3] = newAlpha;
      } else {
        newBuffer[idx] = r;
        newBuffer[idx + 1] = g;
        newBuffer[idx + 2] = b;
        newBuffer[idx + 3] = a;
      }
    }
  }

  return sharp(newBuffer, {
    raw: { width, height, channels: 4 },
  })
    .trim({ threshold: 5 })
    .png()
    .toBuffer();
}

const cleanSealPngBuffer = await prepareCleanCircularSealBuffer(source);

const squarePng = (size, padding = 0) => {
  const innerSize = size - padding * 2;
  return sharp(cleanSealPngBuffer)
    .resize(innerSize, innerSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 });
};

const androidDensities = [
  ['ldpi', 36],
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

const androidTasks = androidDensities.flatMap(([density, size]) => {
  const directory = path.resolve(`android/app/src/main/res/mipmap-${density}`);
  if (!fs.existsSync(directory)) return [];
  const padding = Math.max(2, Math.round(Number(size) * 0.05));
  return [
    squarePng(Number(size), padding).toFile(path.join(directory, 'ic_launcher.png')),
    squarePng(Number(size), padding).toFile(path.join(directory, 'ic_launcher_round.png')),
  ];
});

await Promise.all([
  squarePng(1024, 20).toFile(path.resolve('assets/icon-only.png')),
  squarePng(2732, 420).toFile(path.resolve('assets/splash.png')),
  squarePng(512, 10).toFile(path.resolve('build/icon.png')),
  squarePng(512, 10).toFile(path.resolve('public/icon.png')),
  squarePng(512, 10).toFile(path.resolve('src/app/icon.png')),
  ...androidTasks,
]);

// Convert the generated transparent PNG directly to Windows ICO format for Electron desktop shell
const convertToIco = pngToIco.default || pngToIco;
const icoBuffer = await convertToIco(path.resolve('build/icon.png'));
fs.writeFileSync(path.resolve('build/icon.ico'), icoBuffer);

console.log(`Successfully generated transparent desktop & app brand assets from: ${source}`);



