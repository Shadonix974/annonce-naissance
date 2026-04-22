import { Readable } from "node:stream";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { NotFoundError } from "../lib/errors.js";
import { getReadStream, objectKey } from "../lib/minio.js";
import { requireAccessToken } from "../middleware/require-access-token.js";

const CONTENT_TYPES = {
  avif: "image/avif",
  webp: "image/webp",
  jpg:  "image/jpeg",
} as const;

type Ext = keyof typeof CONTENT_TYPES;
type Size = "thumb" | "medium" | "full";

const app = new Hono();

app.get("/:id/:file", requireAccessToken, async (c) => {
  const id = c.req.param("id");
  const parts = c.req.param("file").split(".");
  const sizeStr = parts[0];
  const ext = parts[1];
  if (!sizeStr || !["thumb", "medium", "full"].includes(sizeStr)) throw new NotFoundError();
  if (!ext || !(ext in CONTENT_TYPES)) throw new NotFoundError();

  let nodeStream: NodeJS.ReadableStream;
  try {
    nodeStream = await getReadStream(objectKey(id, sizeStr as Size, ext as Ext));
  } catch {
    throw new NotFoundError();
  }

  c.header("Content-Type", CONTENT_TYPES[ext as Ext]);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return stream(c, async (s) => {
    const webStream = Readable.toWeb(nodeStream as Readable) as unknown as ReadableStream<Uint8Array>;
    await s.pipe(webStream);
  });
});

export default app;
