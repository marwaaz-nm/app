import path from 'node:path';
import sharp from 'sharp';

const source = process.argv[2];
if (!source) throw new Error('Provide the uploaded PNG path.');

// Trim only the plain white canvas touching the edges. White details inside the
// official seal remain intact, while the generated icon canvas stays transparent.
const squarePng = (size, padding = 0) => {
  const innerSize = size - (padding * 2);
  const circularMask = Buffer.from(
    `<svg width="${innerSize}" height="${innerSize}"><circle cx="${innerSize / 2}" cy="${innerSize / 2}" r="${innerSize / 2}" fill="white"/></svg>`,
  );

  return sharp(source)
    .trim({ background: '#ffffff', threshold: 10 })
    .resize(innerSize, innerSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .composite([{ input: circularMask, blend: 'dest-in' }])
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 });
};

const androidIcons = [
  ['ldpi', 36],
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
].flatMap(([density, size]) => {
  const directory = path.resolve(`android/app/src/main/res/mipmap-${density}`);
  const padding = Math.max(2, Math.round(Number(size) * 0.05));
  return [
    squarePng(Number(size), padding).toFile(path.join(directory, 'ic_launcher.png')),
    squarePng(Number(size), padding).toFile(path.join(directory, 'ic_launcher_round.png')),
  ];
});

await Promise.all([
  squarePng(1024, 48).toFile(path.resolve('assets/icon-only.png')),
  squarePng(2732, 420).toFile(path.resolve('assets/splash.png')),
  squarePng(512, 20).toFile(path.resolve('build/icon.png')),
  squarePng(512, 20).toFile(path.resolve('public/icon.png')),
  squarePng(512, 20).toFile(path.resolve('src/app/icon.png')),
  ...androidIcons,
]);

console.log('Generated Marwaazpn PNG brand assets from:', source);
