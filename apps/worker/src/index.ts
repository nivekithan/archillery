import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import * as archil from "disk";
import z from "zod";

import { GitRepository } from "./git-repository";

export { GitRepository };

archil.configure({ apiKey: env.ARCHIL_API_KEY, region: env.ARCHIL_REGION });

const app = new Hono<{ Bindings: Cloudflare.Env }>();

const requireAuth = basicAuth({
  password: env.GIT_PASSWORD,
  username: env.GIT_USERNAME,
});

app.use((c, next) => {
  if (isPublicRead(c.req.raw)) return next();
  return requireAuth(c, next);
});

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
  await manageDisk.putObject(
    repoKey,
    JSON.stringify({ diskId: repoDisk.disk.id, token }),
  );
  await c.env.SANDBOX_QUEUE.send({ repo, username });

  return c.json({ ok: true });
});

app.delete("/api/repo", async (c) => {
  const body = await c.req.json();
  const { repo, username } = RepoNameSchema.parse(body);
  const repoKey = getRepoKey({ repo, username });

  const manageDisk = await archil.getDisk(c.env.ARCHIL_META_DISK);
  const repoDisk = await getRepoDisk({ manageDisk, repoKey });
  if (!repoDisk) return c.json({ ok: false }, 404);

  const repository = c.env.GIT_REPOSITORY.getByName(repoKey);
  const { sandboxId } = await repository.deleteRepository();
  const disk = await archil.getDisk(repoDisk.diskId);
  await disk.delete();
  await manageDisk.deleteObject(repoKey);

  console.info("Git repository deleted", {
    diskId: repoDisk.diskId,
    repoKey,
    sandboxId,
  });
  return c.json({ ok: true });
});

app.all("/api/*", () => new Response("NOT FOUND", { status: 404 }));

app.all("/:username/:repo", (c) => c.redirect(`${c.req.path}/`, 308));

app.all("/:username/:repo/*", async (c) => {
  const { repo, username } = RepoNameSchema.parse({
    repo: c.req.param("repo"),
    username: c.req.param("username"),
  });

  const repoKey = getRepoKey({ repo, username });
  console.info("Git request received", {
    method: c.req.method,
    path: c.req.path,
    repoKey,
  });

  const manageDisk = await archil.getDisk(c.env.ARCHIL_META_DISK);
  const repoDisk = await getRepoDisk({
    manageDisk,
    repoKey,
  });

  if (!repoDisk) {
    console.warn("Git repository disk not found", { repoKey });
    /**
     * Either we are unable to get the file or repo is not created
     */
    return new Response("NOT FOUND", { status: 404 });
  }

  const repository = c.env.GIT_REPOSITORY.getByName(repoKey);
  const gitHost = await repository.getGitHost({
    diskId: repoDisk.diskId,
    mountToken: repoDisk.token,
    // TODO: Figure out a way to create sepreate origin token for each repo
    originToken: c.env.GIT_PASSWORD,
    repoName: repo,
    repoUsername: username,
  });

  return proxyGitRequest(c.req.raw, gitHost, c.env.GIT_PASSWORD);
});

async function proxyGitRequest(
  request: Request,
  gitHost: string,
  originToken: string,
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("authorization", `Basic ${btoa(`origin:${originToken}`)}`);

  const url = new URL(request.url);
  url.protocol = "https:";
  url.hostname = gitHost;
  url.port = "";

  console.info("Proxying Git request", {
    gitHost,
    method: request.method,
    path: url.pathname,
  });

  const response = await fetch(
    new Request(url, {
      body: request.body,
      headers,
      method: request.method,
      redirect: "manual",
    }),
  );
  console.info("Git origin responded", {
    gitHost,
    method: request.method,
    path: url.pathname,
    status: response.status,
  });
  return response;
}

async function getRepoDisk({
  manageDisk,
  repoKey,
}: {
  manageDisk: archil.Disk;
  repoKey: string;
}) {
  try {
    const file = await manageDisk.getObject(repoKey);
    const credentials = JSON.parse(new TextDecoder().decode(file));

    return RepoDiskSchema.parse(credentials);
  } catch (error) {
    /**
     * Archil throws error when object is not present
     */
    console.warn("Failed to load repository disk metadata", {
      error,
      repoKey,
    });
    return null;
  }
}

function getRepoKey({ repo, username }: { repo: string; username: string }) {
  return `${username}-${repo}`;
}

function getDiskName({ repoKey }: { repoKey: string }) {
  return `git-remote-${repoKey}`;
}

function isPublicRead(request: Request) {
  const url = new URL(request.url);
  const service = url.searchParams.get("service");

  if (
    service === "git-receive-pack" ||
    url.pathname.endsWith("/git-receive-pack")
  ) {
    return false;
  }

  if (request.method === "POST") {
    return url.pathname.endsWith("/git-upload-pack");
  }

  return (
    (request.method === "GET" || request.method === "HEAD") &&
    !url.pathname.startsWith("/api/")
  );
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

const RepoDiskSchema = z.object({
  diskId: z.string(),
  token: z.string(),
});

const worker = {
  fetch: app.fetch,
  async queue(batch, workerEnv) {
    for (const message of batch.messages) {
      const { repo, username } = RepoNameSchema.parse(message.body);
      const repoKey = getRepoKey({ repo, username });
      console.info("Prewarming Git sandbox", { repoKey });

      const manageDisk = await archil.getDisk(workerEnv.ARCHIL_META_DISK);
      const repoDisk = await getRepoDisk({ manageDisk, repoKey });
      if (!repoDisk) {
        throw new Error(`Repository disk metadata not found for ${repoKey}`);
      }

      const repository = workerEnv.GIT_REPOSITORY.getByName(repoKey);
      await repository.getGitHost({
        diskId: repoDisk.diskId,
        mountToken: repoDisk.token,
        originToken: workerEnv.GIT_PASSWORD,
        repoName: repo,
        repoUsername: username,
      });
      console.info("Git sandbox prewarmed", { repoKey });
    }
  },
} satisfies ExportedHandler<CloudflareBindings, unknown>;

export default worker;
