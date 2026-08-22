import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import * as archil from "disk";
import z from "zod";

export class GitContainer extends Container<Cloudflare.Env> {
  defaultPort = 3000;
  sleepAfter = "15m";
}

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.use(basicAuth({ password: env.GIT_PASSWORD, username: env.GIT_USERNAME }));

/**
 * Create a empty repo
 */
app.post("/api/repo", async (c) => {
  const { repo, username } = z
    .object({ username: z.string(), repo: z.string() })
    .parse(c.body);

  const repoKey = getRepoKey({ repo, username });

  const [manageDisk, repoDisk] = await Promise.all([
    archil.getDisk(c.env.ARCHIL_META_DISK),
    archil.createDisk({ name: getDiskName({ repoKey }) }),
  ]);

  const token = repoDisk.token;

  if (!token) throw new Error("Expected archil disk token to be returned");

  /**
   * Who needs a database when you have **DISK**
   */
  await manageDisk.putObject(repoKey, token);

  return c.json({ ok: true });
});

app.all("/api/*", () => new Response("NOT FOUND", { status: 404 }));

app.all("/:username/:repo/*", async (c) => {
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
});

function getRepoKey({ repo, username }: { repo: string; username: string }) {
  return `${repo}/${username}`;
}

function getDiskName({ repoKey }: { repoKey: string }) {
  return `git-remote-${repoKey}`;
}

export default app;
