import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import * as archil from "disk";
import z from "zod";

archil.configure({ apiKey: env.ARCHIL_API_KEY, region: env.ARCHIL_REGION });

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
  const body = await c.req.json();
  const { repo, username } = RepoNameSchema.parse(body);

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
  const { repo, username } = RepoNameSchema.parse({
    repo: c.req.param("repo"),
    username: c.req.param("username"),
  });

  const repoKey = getRepoKey({ repo, username });
  const diskName = getDiskName({ repoKey });

  const manageDisk = await archil.getDisk(c.env.ARCHIL_META_DISK);
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
    startOptions: {
      envVars: {
        ARCHIL_DISK_NAME: diskName,
        ARCHIL_MOUNT_TOKEN: repoDiskToken,
        ARCHIL_REGION: c.env.ARCHIL_REGION,
      },
      enableInternet: true,
    },
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
  return `${username}-${repo}`;
}

function getDiskName({ repoKey }: { repoKey: string }) {
  return `git-remote-${repoKey}`;
}

const RepoNameSchema = z.object({
  username: z
    .string()
    .nonempty()
    .max(30)
    .regex(/^[A-Za-z0-9_]+$/),
  repo: z
    .string()
    .transform((value) => (value.endsWith(".git") ? value.slice(0, -4) : value))
    .pipe(
      z
        .string()
        .nonempty()
        .max(30)
        .regex(/^[A-Za-z0-9_-]+$/),
    ),
});

export default app;
