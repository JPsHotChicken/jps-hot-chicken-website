// One-off: compress the food showcase images. The originals were multi-MB raw
// PNG/JPG (44MB total) which made the Next image optimizer slow and blocked page
// load. This resizes to a web-appropriate max dimension and re-encodes to WebP,
// then removes the now-unused originals. Re-run safely (idempotent).
import sharp from "sharp";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = join(__dirname, "..", "public", "images", "food");
const dirs = ["entree", "sides", "dippingSauce", "drinks"];
const MAX = 700;

let before = 0;
let after = 0;

for (const d of dirs) {
  const dir = join(base, d);
  for (const file of readdirSync(dir)) {
    if (!/\.(png|jpe?g|webp)$/i.test(file)) continue;
    const src = join(dir, file);
    const out = join(dir, basename(file, extname(file)) + ".webp");
    before += statSync(src).size;

    const buf = await sharp(src)
      .resize(MAX, MAX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, alphaQuality: 90 })
      .toBuffer();

    // Remove the original first (so a .png/.jpg source doesn't linger), then write the .webp.
    if (src !== out) unlinkSync(src);
    await sharp(buf).toFile(out);
    after += statSync(out).size;
    console.log(`${file} -> ${basename(out)}  ${Math.round(statSync(out).size / 1024)}KB`);
  }
}

console.log(
  `\nTotal: ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(2)}MB`,
);
