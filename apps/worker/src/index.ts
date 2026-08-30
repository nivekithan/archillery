import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { createMiddleware } from "hono/factory";
import * as archil from "disk";
import z from "zod";

import { GitRepository } from "./git-repository";
import { requestGitGateway } from "./git-gateway";

export { GitRepository };

archil.configure({ apiKey: env.ARCHIL_API_KEY, region: env.ARCHIL_REGION });

type AppBindings = Cloudflare.Env & {
  GIT_GATEWAY_URL?: string;
};
type AppEnv = { Bindings: AppBindings };

const workerEnv: AppBindings = env;
const app = new Hono<AppEnv>();

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
  if (workerEnv.GIT_GATEWAY_URL) {
    return c.json(
      { error: "repository creation is disabled in local gateway mode" },
      501,
    );
  }

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

app.delete("/api/repositories/:username/:repo", requireAuth, async (c) => {
  const { repo, username } = RepoNameSchema.parse(c.req.param());
  if (workerEnv.GIT_GATEWAY_URL) {
    return c.json(
      { error: "repository deletion is disabled in local gateway mode" },
      501,
    );
  }

  const repoKey = getRepoKey({ repo, username });

  const manageDisk = await archil.getDisk(c.env.ARCHIL_META_DISK);
  const repoDisk = await getRepoDisk({ manageDisk, repoKey });
  if (!repoDisk) return c.json({ error: "repository not found" }, 404);

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

app.get("/api/repositories/:username/:repo", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/repository",
    metaDiskId: c.env.ARCHIL_META_DISK,
    originToken: c.env.GIT_PASSWORD,
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.get("/api/repositories/:username/:repo/content", (c) =>
	proxyGitMetadataServiceRequest({
		apiPath: "/api/v1/content",
		metaDiskId: c.env.ARCHIL_META_DISK,
		originToken: c.env.GIT_PASSWORD,
		repositories: c.env.GIT_REPOSITORY,
		repositoryParams: RepoNameSchema.parse(c.req.param()),
		request: c.req.raw,
	}),
);

app.get("/api/repositories/:username/:repo/paths", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/paths",
    metaDiskId: c.env.ARCHIL_META_DISK,
    originToken: c.env.GIT_PASSWORD,
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.get("/api/repositories/:username/:repo/commits", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/commits",
    metaDiskId: c.env.ARCHIL_META_DISK,
    originToken: c.env.GIT_PASSWORD,
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.get("/api/repositories/:username/:repo/commit", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/commit",
    metaDiskId: c.env.ARCHIL_META_DISK,
    originToken: c.env.GIT_PASSWORD,
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.get("/api/repositories/:username/:repo/summary", (c) =>
  proxyGitMetadataServiceRequest({
    apiPath: "/api/v1/summary",
    metaDiskId: c.env.ARCHIL_META_DISK,
    originToken: c.env.GIT_PASSWORD,
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

app.all("/api/*", requireAuth, (c) =>
  c.json({ error: "not found" }, 404),
);

app.get(
  "/:username/:repo/info/refs",
  gitSmartHttpAuth,
  (c) =>
    proxyGitSmartHttpRequest({
      metaDiskId: c.env.ARCHIL_META_DISK,
      originToken: c.env.GIT_PASSWORD,
      repositories: c.env.GIT_REPOSITORY,
      repositoryParams: RepoNameSchema.parse(c.req.param()),
      request: c.req.raw,
    }),
);
app.post("/:username/:repo/git-upload-pack", gitSmartHttpAuth, (c) =>
  proxyGitSmartHttpRequest({
    metaDiskId: c.env.ARCHIL_META_DISK,
    originToken: c.env.GIT_PASSWORD,
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);
app.post("/:username/:repo/git-receive-pack", gitSmartHttpAuth, (c) =>
  proxyGitSmartHttpRequest({
    metaDiskId: c.env.ARCHIL_META_DISK,
    originToken: c.env.GIT_PASSWORD,
    repositories: c.env.GIT_REPOSITORY,
    repositoryParams: RepoNameSchema.parse(c.req.param()),
    request: c.req.raw,
  }),
);

async function proxyGitSmartHttpRequest({
  metaDiskId,
  originToken,
  repositories,
  repositoryParams,
  request,
}: RepositoryRequestOptions) {
  const origin = await getRepositoryOrigin({
    metaDiskId,
    originToken,
    repositories,
    repositoryParams,
    request,
  });
  if (!origin) {
    return Response.json({ error: "repository not found" }, { status: 404 });
  }

  return requestGitGateway({
    request,
    gitGatewayUrl: origin.gitGatewayUrl,
    originToken,
  });
}

async function proxyGitMetadataServiceRequest({
  apiPath,
  metaDiskId,
  originToken,
  repositories,
  repositoryParams,
  request,
}: RepositoryRequestOptions & { apiPath: string }) {
  const origin = await getRepositoryOrigin({
    metaDiskId,
    originToken,
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
    request: new Request(requestUrl, {
      headers: request.headers,
      method: request.method,
    }),
    gitGatewayUrl: origin.gitGatewayUrl,
    originToken,
  });
}

async function getRepositoryOrigin({
  metaDiskId,
  originToken,
  repositories,
  repositoryParams: { repo, username },
  request,
}: RepositoryRequestOptions) {
  if (workerEnv.GIT_GATEWAY_URL) {
    return { gitGatewayUrl: workerEnv.GIT_GATEWAY_URL };
  }

  const repoKey = getRepoKey({ repo, username });
  const requestUrl = new URL(request.url);
  console.info("Git request received", {
    method: request.method,
    path: requestUrl.pathname,
    repoKey,
  });

  const manageDisk = await archil.getDisk(metaDiskId);
  const repoDisk = await getRepoDisk({
    manageDisk,
    repoKey,
  });

  if (!repoDisk) {
    console.warn("Git repository disk not found", { repoKey });
    return null;
  }

  const repository = repositories.getByName(repoKey);
  const gitGatewayHost = await repository.getGitGatewayHost({
    diskId: repoDisk.diskId,
    mountToken: repoDisk.token,
    // TODO: Figure out a way to create a separate origin token for each repo
    originToken,
    repoName: repo,
    repoUsername: username,
  });

  return { gitGatewayUrl: `https://${gitGatewayHost}` };
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
    if (error instanceof archil.ArchilS3Error && error.status === 404) {
      console.warn("Repository disk metadata not found", { repoKey });
      return null;
    }

    console.warn("Failed to load repository disk metadata", {
      error,
      repoKey,
    });
    throw error;
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

type RepositoryParams = z.infer<typeof RepoNameSchema>;

type RepositoryRequestOptions = {
  metaDiskId: string;
  originToken: string;
  repositories: Cloudflare.Env["GIT_REPOSITORY"];
  repositoryParams: RepositoryParams;
  request: Request;
};

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
      await repository.getGitGatewayHost({
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
