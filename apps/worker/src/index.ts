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
  const repoKey = getRepoKey({ repo, username });

  const manageDisk = await archil.getDisk(getDiskName({ repoKey }));
  const repoDiskToken = await getRepoDiskToken({
    manageDisk,
    repoKey,
  });

  if (!repoDiskToken) {
    /**
     * Either we are unable to get the file or repo is not created
     */
    return new Response("NOT FOUND", { status: 404 });
  }

  const container = getContainer(c.env.GIT_CONTAINER, repoKey);

  await container.startAndWaitForPorts({
    startOptions: { envVars: { ARCHIL_DISK_TOKEN: repoDiskToken } },
  });

  return container.fetch(c.req.raw);
});

async function getRepoDiskToken({
  manageDisk,
  repoKey,
}: {
  manageDisk: archil.Disk;
  repoKey: string;
}) {
  try {
    const file = await manageDisk.getObject(repoKey);
    const token = new TextDecoder().decode(file);

    return token;
  } catch (err) {
    /**
     * Archil throws error when object is not present
     */
    console.log(err);
    return null;
  }
}

function getRepoKey({ repo, username }: { repo: string; username: string }) {
  return `${repo}/${username}`;
}

function getDiskName({ repoKey }: { repoKey: string }) {
  return `git-remote-${repoKey}`;
}

export default app;
