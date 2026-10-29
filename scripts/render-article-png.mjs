import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = process.env.SSLOPE_SHARP_MODULE ? (await import(process.env.SSLOPE_SHARP_MODULE)).default : createRequire(path.join(root, 'research-app/package.json'))('sharp');
const output = path.join(root, 'public/article');
await mkdir(output, { recursive: true });
for (const [number, archived] of [[1, 3], [2, 4], [3, 5]]) {
  const svg = await readFile(path.join(root, `artifacts/manuscript-review-2026-09-29/figuras/Figura_${archived}.svg`));
  // Render vectors at the requested density; do not enlarge a raster PNG.
  const source = svg.toString('utf8'), tag = source.match(/<svg\b[^>]*>/)[0];
  const width = Number(tag.match(/\bwidth="([\d.]+)pt"/)[1]), height = Number(tag.match(/\bheight="([\d.]+)pt"/)[1]);
  const pixels = tag.replace(/\bwidth="[^"]+"/, `width="${Math.round(width * 600 / 72)}px"`).replace(/\bheight="[^"]+"/, `height="${Math.round(height * 600 / 72)}px"`);
  const renderSource = Buffer.from(source.replace(tag, pixels));
  const { data, info } = await sharp(renderSource, { density: 72 }).png().withMetadata({ density: 600 }).toBuffer({ resolveWithObject: true });
  await writeFile(path.join(output, `figura-${number}.svg`), svg);
  await writeFile(path.join(output, `figura-${number}.png`), data);
  console.log(`Figura ${number}: ${info.width} × ${info.height} px, 600 dpi`);
}
