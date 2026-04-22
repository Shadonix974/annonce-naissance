import { Client } from "minio";
import { env } from "../env.js";

const url = new URL(env.MINIO_ENDPOINT);

export const minio = new Client({
  endPoint: url.hostname,
  port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
  useSSL: url.protocol === "https:",
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export const BUCKET = env.MINIO_BUCKET;

export function objectKey(photoId: string, size: "thumb" | "medium" | "full", ext: "avif" | "webp" | "jpg"): string {
  return `photos/${photoId}/${size}.${ext}`;
}

export async function ensureBucket(): Promise<void> {
  if (!(await minio.bucketExists(BUCKET))) await minio.makeBucket(BUCKET);
}

export async function putBuffer(key: string, buf: Buffer, contentType: string): Promise<void> {
  await minio.putObject(BUCKET, key, buf, buf.length, { "Content-Type": contentType });
}

export function getReadStream(key: string): Promise<NodeJS.ReadableStream> {
  return minio.getObject(BUCKET, key);
}

export async function removePrefix(prefix: string): Promise<void> {
  const objects: string[] = [];
  for await (const o of minio.listObjects(BUCKET, prefix, true)) {
    if (o.name) objects.push(o.name);
  }
  if (objects.length) await minio.removeObjects(BUCKET, objects);
}
