import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const source = process.argv[2] || path.resolve('marwaazpn logo.png');
if (!fs.existsSync(source)) throw new Error(`Source logo not found at: ${source}`);

// Use the original logo file as-is without modifying pixels, adding shapes, or filtering
const squarePng = (size, padding = 0) => {
  const innerSize = size - padding * 2;
  return sharp(source)
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

// Convert the generated PNG directly to Windows ICO format for Electron desktop shell
const convertToIco = pngToIco.default || pngToIco;
const icoBuffer = await convertToIco(path.resolve('build/icon.png'));
fs.writeFileSync(path.resolve('build/icon.ico'), icoBuffer);

console.log(`Successfully generated desktop & app brand assets directly from: ${source}`);


