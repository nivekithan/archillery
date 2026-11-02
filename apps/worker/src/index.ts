import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { createMiddleware } from "hono/factory";
import * as archil from "disk";
import z from "zod";

import { requestGitGateway } from "./git-gateway";

archil.configure({ apiKey: env.ARCHIL_API_KEY, region: env.ARCHIL_REGION });

type AppEnv = { Bindings: Cloudflare.Env };
const app = new Hono<AppEnv>();

type RepositoryOrigin = {
  fetch: (request: Request) => Promise<Response>;
};

const requireAuth = basicAuth({
  password: env.GIT_PASSWORD,
  username: env.GIT_USERNAME,
});

const gitSmartHttpAuth = createMiddleware<AppEnv>((c, next) => {
  const isWrite =
    c.req.query("service") === "git-receive-pack" ||
    c.req.path.endsWith("/git-receive-pack");

  return isWrite ? requireAuth(c, next) : next();
});

app.post("/api/repositories", requireAuth, async (c) => {
  const body = await c.req.json();
  const { repo, username } = RepoNameSchema.parse(body);

  const repoKey = getRepoKey({ repo, username });

  const repoDisk = await archil.createDisk({ name: getDiskName({ repoKey }) });

  const token = repoDisk.token;

  if (!token) throw new Error("Expected archil disk token to be returned");

  const repository = c.env.GIT_REPOSITORY.getByName(repoKey);
  await repository.initializeRepository({
    diskId: repoDisk.disk.id,
    mountToken: token,
    repoName: repo,
    repoUsername: username,
  });
  await c.env.SANDBOX_QUEUE.send({ repo, username });

  return c.json({ ok: true });
});

app.post("/api/repositories/:username/:repo/disable", requireAuth, async (c) => {
  const { repo, username } = RepoNameSchema.parse(c.req.param());
  const repository = c.env.GIT_REPOSITORY.getByName(
    getRepoKey({ repo, username }),
  );
  return c.json(await repository.disableRepository());
});

app.delete("/api/repositories/:username/:repo", requireAuth, async (c) => {
  const { repo, username } = RepoNameSchema.parse(c.req.param());

  const repoKey = getRepoKey({ repo, username });

  const repository = c.env.GIT_REPOSITORY.getByName(repoKey);
  const config = await repository.getRepositoryConfig();
  if (!config) return c.json({ error: "repository not found" }, 404);

  const { sandboxId } = await repository.deleteRepository();
  const disk = await archil.getDisk(config.diskId);
  await disk.delete();

  console.info("Git repository deleted", {
    diskId: config.diskId,
    repoKey,
    sandboxId,
  });
  return c.json({ ok: true });
});

app.get("/api/repositories/:username/:repo", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/repository",
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.get("/api/repositories/:username/:repo/content", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/content",
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.get("/api/repositories/:username/:repo/paths", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/paths",
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.get("/api/repositories/:username/:repo/commits", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/commits",
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.get("/api/repositories/:username/:repo/commit", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/commit",
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.get("/api/repositories/:username/:repo/summary", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/summary",
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.all("/api/*", requireAuth, (c) => c.json({ error: "not found" }, 404));

app.get("/:username/:repo/info/refs", gitSmartHttpAuth, (c) =>
  proxyGitSmartHttpRequest({
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);
app.post("/:username/:repo/git-upload-pack", gitSmartHttpAuth, (c) =>
  proxyGitSmartHttpRequest({
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);
app.post("/:username/:repo/git-receive-pack", gitSmartHttpAuth, (c) =>
  proxyGitSmartHttpRequest({
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

async function proxyGitSmartHttpRequest({
  repositories,
  repositoryParams,
  request,
}: RepositoryRequestOptions) {
  const origin = await getRepositoryOrigin({
    repositories,
    repositoryParams,
    request,
  });
  if (!origin) {
    return Response.json({ error: "repository not found" }, { status: 404 });
  }

  return requestGitGateway({
    gatewayFetch: origin.fetch,
    request,
  });
}

async function proxyGitMetadataServiceRequest({
  apiPath,
  repositories,
  repositoryParams,
  request,
}: RepositoryRequestOptions & { apiPath: string }) {
  const origin = await getRepositoryOrigin({
    repositories,
    repositoryParams,
    request,
  });
  if (!origin) {
    return Response.json({ error: "repository not found" }, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  requestUrl.pathname = apiPath;
  return requestGitGateway({
    gatewayFetch: origin.fetch,
    request: new Request(requestUrl, {
      headers: request.headers,
      method: request.method,
    }),
  });
}

async function getRepositoryOrigin({
  repositories,
  repositoryParams: { repo, username },
  request,
}: RepositoryRequestOptions): Promise<RepositoryOrigin | null> {
  const repoKey = getRepoKey({ repo, username });
  const requestUrl = new URL(request.url);
  console.info("Git request received", {
    method: request.method,
    path: requestUrl.pathname,
    repoKey,
  });

  const repository = repositories.getByName(repoKey);
  if (!(await repository.getRepositoryConfig())) return null;

  return {
    fetch: (request) => repository.fetch(request),
  };
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

type RepositoryParams = z.infer<typeof RepoNameSchema>;

type RepositoryRequestOptions = {
  repositories: Cloudflare.Env["GIT_REPOSITORY"];
  repositoryParams: RepositoryParams;
  request: Request;
};

const worker = {
  fetch: app.fetch,
  async queue(batch, workerEnv) {
    for (const message of batch.messages) {
      const { repo, username } = RepoNameSchema.parse(message.body);
      const repoKey = getRepoKey({ repo, username });
      console.info("Prewarming Git sandbox", { repoKey });

      const repository = workerEnv.GIT_REPOSITORY.getByName(repoKey);
      if (!(await repository.prewarm())) {
        throw new Error(`Repository configuration not found for ${repoKey}`);
      }
      console.info("Git sandbox prewarmed", { repoKey });
    }
  },
} satisfies ExportedHandler<CloudflareBindings, unknown>;

export { RepositoryContainer } from "./git-repository";
export default worker;
