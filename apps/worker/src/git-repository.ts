import { Archil, ArchilApiError, type Sandbox } from "disk";
import { DurableObject } from "cloudflare:workers";

const SANDBOX_IMAGE =
  "ghcr.io/nivekithan/archillery@sha256:89e36e1267b85a6285c945299f26f87cd442ded457475004124989730c791cfd";

export class GitRepository extends DurableObject<CloudflareBindings> {
  private static readonly MAX_TTL = 60 * 60 * 8;
  private static readonly SANDBOX_CACHE_TTL_MS = 10 * 60 * 1000;
  private static readonly SANDOX_ID_KEY = "SANDBOX_ID";
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

  async ensureSandboxIsCreated() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const currentSandboxId = this.getSandoxId();

      if (currentSandboxId) {
        const sandbnox = await this.getCachedArchilSandbox(currentSandboxId);

        if (sandbnox) {
          return;
        }
      }

      const sandox = await this.archil.sandboxes.create({
        baseImage: SANDBOX_IMAGE,
        vcpuCount: 2,
        memSizeMiB: 4096,
        maxTtlSeconds: GitRepository.MAX_TTL,
      });
      const sandboxId = sandox.id;
      this.setSandboxId(sandboxId);
      this.cacheArchilSandbox(sandox);
    });

    await this.ping();
    return;
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

    const sandboxId = this.getSandoxId();

    if (!sandboxId) {
      return;
    }

    const sandbox = await this.getArchilSandbox(sandboxId);

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

  private getSandoxId() {
    const sandboxId = this.ctx.storage.kv.get<string | null | undefined>(
      GitRepository.SANDOX_ID_KEY,
    );

    return sandboxId ?? null;
  }

  private setSandboxId(sandboxId: string) {
    return this.ctx.storage.kv.put(GitRepository.SANDOX_ID_KEY, sandboxId);
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
