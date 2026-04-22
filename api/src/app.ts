import { Hono } from "hono";
import { requestLogger } from "./lib/logger.js";
import { onError } from "./middleware/error-handler.js";
import adminLogin from "./routes/admin/login.js";
import stateRoute from "./routes/state.js";

export const app = new Hono();
app.use("*", requestLogger);
app.onError(onError);
app.get("/healthz", (c) => c.json({ ok: true }));
app.route("/api/admin", adminLogin);
app.route("/api/state", stateRoute);
