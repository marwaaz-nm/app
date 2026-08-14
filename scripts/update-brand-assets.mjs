import path from 'node:path';
import sharp from 'sharp';

const source = process.argv[2];
if (!source) throw new Error('Provide the uploaded PNG path.');

const squarePng = (size, padding = 0) => sharp(source)
  .flatten({ background: '#ffffff' })
  .resize(size - (padding * 2), size - (padding * 2), { fit: 'contain', background: '#ffffff' })
  .extend({ top: padding, bottom: padding, left: padding, right: padding, background: '#ffffff' })
  .png({ compressionLevel: 9 });

await Promise.all([
  squarePng(1024, 48).toFile(path.resolve('assets/icon-only.png')),
  squarePng(2732, 420).toFile(path.resolve('assets/splash.png')),
  squarePng(512, 20).toFile(path.resolve('build/icon.png')),
  squarePng(512, 20).toFile(path.resolve('public/icon.png')),
  squarePng(512, 20).toFile(path.resolve('src/app/icon.png')),
]);

console.log('Generated Marwaazpn PNG brand assets from:', source);
