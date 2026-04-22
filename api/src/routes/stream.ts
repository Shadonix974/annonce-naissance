import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { bus } from "../lib/event-bus.js";
import { requireAccessToken } from "../middleware/require-access-token.js";

const app = new Hono();

app.get("/", requireAccessToken, (c) =>
  streamSSE(c, async (stream) => {
    const unsub = bus.onGift((e) =>
      stream.writeSSE({ event: e.type, data: JSON.stringify(e) }),
    );
    const hb = setInterval(() => stream.writeSSE({ event: "ping", data: "" }), 30_000);

    const abort = c.req.raw.signal;
    await new Promise<void>((resolve) => {
      const stop = () => { clearInterval(hb); unsub(); resolve(); };
      if (abort.aborted) stop(); else abort.addEventListener("abort", stop, { once: true });
    });
  }),
);

export default app;
