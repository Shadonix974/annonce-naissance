import { encode as encodeBlurhash } from "blurhash";
import sharp, { type Sharp } from "sharp";

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

// Produce a canonical original: EXIF-rotated, metadata-stripped, JPEG q95.
// Recrop will always read from this normalised form.
export async function normaliseOriginal(input: Buffer): Promise<Buffer> {
  return sharp(input).rotate().jpeg({ quality: 95 }).toBuffer();
}

// Generate the 9 variants + blurhash from a pre-rotated sharp instance.
// The caller is responsible for calling .rotate() and/or .extract() beforehand.
export async function generateVariants(base: Sharp): Promise<ProcessedPhoto> {
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

  const bh = await base.clone()
    .resize({ width: 32, withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurhash = encodeBlurhash(new Uint8ClampedArray(bh.data), bh.info.width, bh.info.height, 4, 3);

  return { width: meta.width, height: meta.height, blurhash, variants };
}

// Upload entry-point: rotate on EXIF and generate the 9 variants + blurhash.
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  return generateVariants(sharp(input).rotate());
}
