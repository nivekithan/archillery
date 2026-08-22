import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.all(
  "/:username/:repo",
  basicAuth({ username: env.GIT_USERNAME, password: env.GIT_PASSWORD }),
  async () => {
    // Implement the proxy
    return new Response("NOT_FOUND", { status: 404 });
  },
);

export default app;
