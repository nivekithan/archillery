import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";

export class GitContainer extends Container<Cloudflare.Env> {
  defaultPort = 8080;
  pingEndpoint = "localhost/ping";
  sleepAfter = "15m";
}

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.all("/api", () => new Response("NOT FOUND", { status: 404 }));
app.all("/api/*", () => new Response("NOT FOUND", { status: 404 }));

app.all(
  "/:username/:repo/*",
  basicAuth({
    username: env.GIT_USERNAME,
    password: env.GIT_PASSWORD,
  }),
  async (c) => {
    const username = c.req.param("username");
    const repo = c.req.param("repo");

    const repository = repo.endsWith(".git") ? repo.slice(0, -4) : repo;
    if (!repository) {
      return c.notFound();
    }

    const container = getContainer(
      c.env.GIT_CONTAINER,
      `${username}/${repository}`,
    );

    return container.fetch(c.req.raw);
  },
);

export default app;
