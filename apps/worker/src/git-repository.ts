import { Archil, ArchilApiError, type Sandbox } from "disk";
import { DurableObject } from "cloudflare:workers";
import z from "zod";

const GitServiceSchema = z.object({
  hostname: z.string().nonempty(),
});

const SandboxStateSchema = z.object({
  sandboxId: z.string().nonempty(),
  hostname: z.string().nonempty(),
});

export class GitRepository extends DurableObject<CloudflareBindings> {
  private static readonly MAX_TTL = 60 * 60 * 8;
  private static readonly SANDBOX_CACHE_TTL_MS = 10 * 60 * 1000;
  private static readonly SANDBOX_STATE_KEY = "SANDBOX_STATE";
  private static readonly LAST_PING_KEY = "LAST_PING";

  private readonly archil: Archil;
  private readonly idleTimeoutMs: number;
  private cachedArchilSandbox: { sandbox: Sandbox; expiresAt: number } | null;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);
    this.archil = new Archil({
      apiKey: env.ARCHIL_API_KEY,
      region: env.ARCHIL_REGION,
    });
    this.idleTimeoutMs = env.GIT_IDLE_TIMEOUT_SECONDS * 1000;
    this.cachedArchilSandbox = null;
  }

  async getGitHost({
    diskId,
    mountToken,
    originToken,
    repoName,
    repoUsername,
  }: {
    diskId: string;
    mountToken: string;
    originToken: string;
    repoName: string;
    repoUsername: string;
  }) {
    const hostname = await this.ctx.blockConcurrencyWhile(async () => {
      const currentSandbox = this.getSandboxState();

      if (currentSandbox) {
        const sandbnox = await this.getCachedArchilSandbox(
          currentSandbox.sandboxId,
        );

        if (sandbnox) {
          return currentSandbox.hostname;
        }
      }

      const sandox = await this.archil.sandboxes.create(
        {
          baseImage: this.env.ARCHIL_SANDBOX_IMAGE,
          env: {
            ARCHIL_DISK_ID: diskId,
            ARCHIL_MOUNT_TOKEN: mountToken,
            ARCHIL_REGION: this.env.ARCHIL_REGION,
            ORIGIN_TOKEN: originToken,
            REPO_NAME: repoName,
            REPO_USERNAME: repoUsername,
          },
          vcpuCount: 2,
          memSizeMiB: 4096,
          maxTtlSeconds: GitRepository.MAX_TTL,
        },
        { wait: true },
      );

      const hostname = await this.createGitService(sandox);

      this.setSandboxState({ sandboxId: sandox.id, hostname });
      this.cacheArchilSandbox(sandox);
      return hostname;
    });

    await this.ping();
    return hostname;
  }

  private async createGitService(sandbox: Sandbox) {
    try {
      const service = await sandbox.exec(
        "archil-sandbox services create git --tcp-port 3000 -- /usr/local/bin/git-container-entrypoint",
      );
      if (service.exitCode !== 0) {
        throw new Error(`Failed to create Git service: ${service.stderr}`);
      }

      return GitServiceSchema.parse(JSON.parse(service.stdout)).hostname;
    } catch (error) {
      await this.cleanupIncompleteSandbox(sandbox);
      throw error;
    }
  }

  private async cleanupIncompleteSandbox(sandbox: Sandbox) {
    try {
      await sandbox.stop();
    } catch (error) {
      console.error("Failed to stop incomplete sandbox", error);
    }

    try {
      await sandbox.delete();
    } catch (error) {
      console.error("Failed to delete incomplete sandbox", error);
    }
  }

  private async getCachedArchilSandbox(sandboxId: string) {
    const cached = this.cachedArchilSandbox;
    if (
      cached &&
      cached.sandbox.id === sandboxId &&
      cached.expiresAt > Date.now()
    ) {
      return cached.sandbox;
    }

    const sandbox = await this.getArchilSandbox(sandboxId);
    if (sandbox) {
      this.cacheArchilSandbox(sandbox);
    } else {
      this.cachedArchilSandbox = null;
    }

    return sandbox;
  }

  private cacheArchilSandbox(sandbox: Sandbox) {
    this.cachedArchilSandbox = {
      sandbox,
      expiresAt: Date.now() + GitRepository.SANDBOX_CACHE_TTL_MS,
    };
  }

  private async getArchilSandbox(sandboxId: string) {
    try {
      const res = await this.archil.sandboxes.get(sandboxId);
      return res;
    } catch (error) {
      if (!(error instanceof ArchilApiError) || error.status !== 404) {
        throw error;
      }

      return null;
    }
  }

  async alarm() {
    if (!this.isTimeoutReached()) {
      return;
    }

    const sandboxState = this.getSandboxState();

    if (!sandboxState) {
      return;
    }

    const sandbox = await this.getArchilSandbox(sandboxState.sandboxId);

    if (!sandbox) {
      this.cachedArchilSandbox = null;
      return;
    }

    if (!this.isTimeoutReached()) {
      return;
    }

    if (sandbox.status === "pending" || sandbox.status === "running") {
      await sandbox.stop();
      return;
    }

    return;
  }

  private getSandboxState() {
    const state = this.ctx.storage.kv.get<string | null | undefined>(
      GitRepository.SANDBOX_STATE_KEY,
    );

    return state ? SandboxStateSchema.parse(JSON.parse(state)) : null;
  }

  private setSandboxState(state: z.infer<typeof SandboxStateSchema>) {
    return this.ctx.storage.kv.put(
      GitRepository.SANDBOX_STATE_KEY,
      JSON.stringify(state),
    );
  }

  private async ping() {
    const lastPing = new Date();
    this.ctx.storage.kv.put(
      GitRepository.LAST_PING_KEY,
      lastPing.toISOString(),
    );
    await this.ctx.storage.setAlarm(lastPing.getTime() + this.idleTimeoutMs);
  }

  private getLastPing() {
    const ping =
      this.ctx.storage.kv.get<string | undefined | null>(
        GitRepository.LAST_PING_KEY,
      ) ?? new Date().toISOString();

    return new Date(ping);
  }

  private isTimeoutReached() {
    const lastPing = this.getLastPing();
    const now = new Date();

    const isTimeoutReached =
      lastPing.getTime() + this.idleTimeoutMs <= now.getTime();

    return isTimeoutReached;
  }
}
