import { Hono } from "hono";
import { serveStatic } from "hono/bun";

const app = new Hono();

app.use("/*", serveStatic({ root: "./static" }));
app.get("/", serveStatic({ path: "./static/index.html" }));

export default app;
