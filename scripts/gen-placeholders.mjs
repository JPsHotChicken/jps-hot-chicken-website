// Generates lightweight, brand-styled placeholder images as compressed WebP.
// These are PLACEHOLDERS — replace public/images/*.webp with real photography
// before launch (keep the same filenames/dimensions and they'll just work).
//
// Run: node scripts/gen-placeholders.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "images");

const images = [
  { file: "hero.webp", w: 1600, h: 900, title: "Nashville-Style", subtitle: "Hot Chicken, Fried to Order" },
  { file: "sandwich.webp", w: 1000, h: 1000, title: "The Classic", subtitle: "Sandwich" },
  { file: "tenders.webp", w: 1000, h: 1000, title: "Hand-Breaded", subtitle: "Tenders" },
  { file: "plate.webp", w: 1000, h: 1000, title: "Quarter Bird", subtitle: "Plate" },
  { file: "interior.webp", w: 1200, h: 900, title: "The Spot", subtitle: "Counter & Booths" },
  { file: "kitchen.webp", w: 1200, h: 900, title: "From the Fryer", subtitle: "Made Fresh Daily" },
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;");

function svg({ w, h, title, subtitle }) {
  const titleSize = Math.round(w / 14);
  const subSize = Math.round(w / 22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#191512"/>
      <stop offset="55%" stop-color="#3a1410"/>
      <stop offset="100%" stop-color="#c0291f"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <g opacity="0.07" fill="#ffffff">
    ${Array.from({ length: 7 }, (_, i) => `<rect x="${(i * w) / 6 - 40}" y="-20" width="14" height="${h + 40}" transform="rotate(18 ${(i * w) / 6} ${h / 2})"/>`).join("")}
  </g>
  <text x="${w / 2}" y="${h / 2 - titleSize * 0.5}" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${subSize * 0.62}" font-weight="700" letter-spacing="6" text-anchor="middle" opacity="0.7">JP&apos;S HOT CHICKEN</text>
  <text x="${w / 2}" y="${h / 2 + titleSize * 0.35}" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="800" text-anchor="middle">${esc(title)}</text>
  <text x="${w / 2}" y="${h / 2 + titleSize * 1.25}" fill="#ff8a7a" font-family="Arial, Helvetica, sans-serif" font-size="${subSize}" font-weight="700" text-anchor="middle">${esc(subtitle)}</text>
  <rect x="${w / 2 - 50}" y="${h / 2 + titleSize * 1.7}" width="100" height="6" rx="3" fill="#ff5a4d"/>
</svg>`;
}

await Promise.all(
  images.map(async (img) => {
    const buf = Buffer.from(svg(img));
    await sharp(buf).webp({ quality: 72 }).toFile(join(outDir, img.file));
    console.log(`✓ ${img.file} (${img.w}x${img.h})`);
  }),
);
console.log("Done.");
