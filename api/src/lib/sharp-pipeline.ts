import { encode as encodeBlurhash } from "blurhash";
import sharp from "sharp";

export type VariantSize = "thumb" | "medium" | "full";
export type VariantFormat = "avif" | "webp" | "jpg";

export const SIZES: Record<VariantSize, number> = { thumb: 400, medium: 1200, full: 2000 };

export interface Variant {
  size: VariantSize;
  format: VariantFormat;
  buffer: Buffer;
  contentType: string;
}

export interface ProcessedPhoto {
  width: number;
  height: number;
  blurhash: string;
  variants: Variant[];
}

export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  // rotate() applies EXIF orientation ; default sharp behaviour strips metadata.
  const base = sharp(input).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("invalid image: no dimensions");

  const variants: Variant[] = [];

  const sizeList: Array<[VariantSize, number]> = [["thumb", 400], ["medium", 1200], ["full", 2000]];
  for (const [size, width] of sizeList) {
    const [avif, webp, jpg] = await Promise.all([
      base.clone().resize({ width, withoutEnlargement: true }).avif({ quality: 50 }).toBuffer(),
      base.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
      base.clone().resize({ width, withoutEnlargement: true }).jpeg({ quality: 82, progressive: true }).toBuffer(),
    ]);
    variants.push({ size, format: "avif", buffer: avif, contentType: "image/avif" });
    variants.push({ size, format: "webp", buffer: webp, contentType: "image/webp" });
    variants.push({ size, format: "jpg",  buffer: jpg,  contentType: "image/jpeg" });
  }

  // Blurhash from a tiny raw RGBA
  const bh = await base.clone()
    .resize({ width: 32, withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurhash = encodeBlurhash(new Uint8ClampedArray(bh.data), bh.info.width, bh.info.height, 4, 3);

  return { width: meta.width, height: meta.height, blurhash, variants };
}
