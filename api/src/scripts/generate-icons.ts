import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const webIcons = resolve(here, "../../../web/icons");
const webRoot = resolve(here, "../../../web");

await mkdir(webIcons, { recursive: true });

const ICON_SVG = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1a2340"/>
  <circle cx="256" cy="256" r="96" fill="#c9a66b"/>
</svg>`);

for (const size of [192, 512]) {
  const buf = await sharp(ICON_SVG).resize(size, size).png().toBuffer();
  await writeFile(join(webIcons, `icon-${size}.png`), buf);
}

await writeFile(
  join(webIcons, "apple-touch-icon.png"),
  await sharp(ICON_SVG).resize(180, 180).png().toBuffer(),
);

// OG image 1200×630 placeholder
const OG_SVG = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1a2340"/>
  <circle cx="600" cy="315" r="110" fill="#c9a66b"/>
</svg>`);
await writeFile(join(webRoot, "og.png"), await sharp(OG_SVG).png().toBuffer());

// eslint-disable-next-line no-console
console.log("icons generated at", webIcons, "and", join(webRoot, "og.png"));
