import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { requireAccessToken } from "../middleware/require-access-token.js";

const { tweaks, photos, gifts, timelineEvents } = schema;

const app = new Hono();

app.get("/", requireAccessToken, async (c) => {
  const [tweaksRows, photosRows, giftsRows, timelineRows] = await Promise.all([
    db.select().from(tweaks),
    db.select().from(photos).orderBy(asc(photos.section), asc(photos.position)),
    db.select().from(gifts).orderBy(asc(gifts.position)),
    db.select().from(timelineEvents).orderBy(asc(timelineEvents.position)),
  ]);

  const tweaksDict: Record<string, string> = {};
  for (const t of tweaksRows) tweaksDict[t.key] = t.value;

  return c.json({
    tweaks: tweaksDict,
    photos: photosRows,
    gifts: giftsRows,
    timeline: timelineRows,
  });
});

export default app;
