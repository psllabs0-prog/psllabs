/**
 * Regenerates the PSL logo derivatives from the approved source artwork
 * (public/branding/psl-logo-source.png: cyan DNA + "PSL" on black).
 *
 *   npx tsx scripts/generate-brand-assets.ts
 *
 * Every derivative is a uniform scale of the tightly cropped artwork; nothing
 * is stretched or redrawn. Transparent variants un-premultiply the black
 * background so anti-aliased edges keep the original cyan.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "public/branding/psl-logo-source.png");
const OUT = join(ROOT, "public/branding");
const APP = join(ROOT, "app");

/** Pixels at or below this max-channel value are treated as background. */
const BG_THRESHOLD = 8;
/** Source-pixel margin kept around the artwork so edge anti-aliasing survives. */
const CROP_MARGIN = 4;
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
/** The artwork is one flat colour, so a 256-colour palette is visually lossless. */
const PNG_OPTIONS = {
  compressionLevel: 9,
  palette: true,
  quality: 100,
  colours: 256,
} as const;

type Rgba = { data: Buffer; width: number; height: number };

async function loadTransparentCrop(): Promise<Rgba> {
  const { data, info } = await sharp(SOURCE)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let solid = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const m = Math.max(data[i], data[i + 1], data[i + 2]);
      if (m > BG_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (m > solid) solid = m;
    }
  }
  if (maxX < 0) throw new Error("No artwork found in source image");

  const left = Math.max(0, minX - CROP_MARGIN);
  const top = Math.max(0, minY - CROP_MARGIN);
  const cropW = Math.min(width, maxX + CROP_MARGIN + 1) - left;
  const cropH = Math.min(height, maxY + CROP_MARGIN + 1) - top;

  const out = Buffer.alloc(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const i = ((y + top) * width + (x + left)) * 3;
      const o = (y * cropW + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const m = Math.max(r, g, b);
      if (m <= 2) continue;
      const a = Math.min(1, m / solid);
      out[o] = Math.min(255, Math.round(r / a));
      out[o + 1] = Math.min(255, Math.round(g / a));
      out[o + 2] = Math.min(255, Math.round(b / a));
      out[o + 3] = Math.round(a * 255);
    }
  }
  return { data: out, width: cropW, height: cropH };
}

function rawImage(img: Rgba) {
  return sharp(img.data, {
    raw: { width: img.width, height: img.height, channels: 4 },
  });
}

async function scaledLogo(img: Rgba, width: number): Promise<Buffer> {
  return rawImage(img)
    .resize({ width, kernel: sharp.kernel.lanczos3 })
    .png(PNG_OPTIONS)
    .toBuffer();
}

/** Logo centred on a black canvas, scaled to `logoWidth` (aspect preserved). */
async function onBlack(
  img: Rgba,
  canvasW: number,
  canvasH: number,
  logoWidth: number,
): Promise<Buffer> {
  const logo = await scaledLogo(img, logoWidth);
  const { height: logoH = 0 } = await sharp(logo).metadata();
  return sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: BLACK },
  })
    .composite([
      {
        input: logo,
        left: Math.round((canvasW - logoWidth) / 2),
        top: Math.round((canvasH - logoH) / 2),
      },
    ])
    .flatten({ background: BLACK })
    .png(PNG_OPTIONS)
    .toBuffer();
}

/** Square icon: the full lockup with `padRatio` of the side as horizontal margin. */
function squareIcon(img: Rgba, size: number, padRatio: number) {
  const pad = Math.max(1, Math.round(size * padRatio));
  return onBlack(img, size, size, size - pad * 2);
}

/** ICO container holding PNG-encoded entries (supported by all current browsers). */
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  images.forEach(({ size, png }, n) => {
    const e = n * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, e);
    entries.writeUInt8(size >= 256 ? 0 : size, e + 1);
    entries.writeUInt8(0, e + 2);
    entries.writeUInt8(0, e + 3);
    entries.writeUInt16LE(1, e + 4);
    entries.writeUInt16LE(32, e + 6);
    entries.writeUInt32LE(png.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, entries, ...images.map((i) => i.png)]);
}

async function main() {
  const art = await loadTransparentCrop();
  console.log(`artwork crop: ${art.width}x${art.height}`);

  await rawImage(art)
    .png(PNG_OPTIONS)
    .toFile(join(OUT, "psl-logo.png"));

  // Website lockup: 3x the largest on-site display height (48px).
  const webHeight = 144;
  const webWidth = Math.round((art.width * webHeight) / art.height);
  await writeFile(join(OUT, "psl-logo-web.png"), await scaledLogo(art, webWidth));
  console.log(`psl-logo-web.png: ${webWidth}x${webHeight}`);

  // Social preview: logo width < 630 so it survives square centre crops.
  await writeFile(join(OUT, "psl-og.png"), await onBlack(art, 1200, 630, 600));

  await writeFile(join(OUT, "psl-icon-192.png"), await squareIcon(art, 192, 0.08));
  await writeFile(join(OUT, "psl-icon-512.png"), await squareIcon(art, 512, 0.08));
  await writeFile(join(APP, "apple-icon.png"), await squareIcon(art, 180, 0.08));

  // ICO decoders (including Next's) require 32-bit RGBA PNG entries.
  const ico = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      png: await sharp(await squareIcon(art, size, 0.03))
        .ensureAlpha()
        .png({ compressionLevel: 9, palette: false })
        .toBuffer(),
    })),
  );
  await writeFile(join(APP, "favicon.ico"), buildIco(ico));
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
