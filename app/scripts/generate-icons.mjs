// Generates PWA icons from one SVG source. Run automatically before every build.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

const glyph = (scale) => {
  const s = 512 * scale;
  const o = (512 - s) / 2;
  const k = s / 64;
  return `<g transform="translate(${o} ${o}) scale(${k})">
    <rect x="14" y="17" width="36" height="24" rx="4" fill="none" stroke="#fff" stroke-width="4"/>
    <path d="M25 48h14M32 41v7" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <circle cx="32" cy="29" r="4" fill="#fff"/>
  </g>`;
};
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14b8a6"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs>`;

// "any" icon: rounded square. Maskable/Apple: full-bleed background, glyph inside the safe zone.
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}<rect width="512" height="512" rx="128" fill="url(#g)"/>${glyph(1)}</svg>`;
const fullBleed = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}<rect width="512" height="512" fill="url(#g)"/>${glyph(scale)}</svg>`;

writeFileSync(new URL('icon.svg', out), rounded);
const jobs = [
  [rounded, 192, 'icon-192.png'],
  [rounded, 512, 'icon-512.png'],
  [fullBleed(0.72), 512, 'maskable-512.png'],
  [fullBleed(0.82), 180, 'apple-touch-icon.png']
];
for (const [svg, size, name] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL(name, out)));
}
console.log(`icons: ${jobs.length + 1} files written`);
