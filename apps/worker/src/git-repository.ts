import { Archil, ArchilApiError, type Sandbox } from "disk";
import { DurableObject } from "cloudflare:workers";
import z from "zod";

import { requestGitService } from "./git-service";

const SERVICE_READY_TIMEOUT_MS = 30_000;
const SERVICE_READY_POLL_INTERVAL_MS = 250;

const GitServiceSchema = z.object({
  hostname: z.string().nonempty(),
});

const SandboxStateSchema = z.object({
  sandboxId: z.string().nonempty(),
  hostname: z.string().nonempty(),
});

const CREATE_GIT_SERVICE_COMMAND = [
  "archil-sandbox services create",
  '--env ARCHIL_DISK_ID="$ARCHIL_DISK_ID"',
  '--env ARCHIL_MOUNT_TOKEN="$ARCHIL_MOUNT_TOKEN"',
  '--env ARCHIL_REGION="$ARCHIL_REGION"',
  '--env ORIGIN_TOKEN="$ORIGIN_TOKEN"',
  '--env REPO_NAME="$REPO_NAME"',
  '--env REPO_USERNAME="$REPO_USERNAME"',
  "--tcp-port 3000",
  "git -- /usr/local/bin/git-container-entrypoint",
].join(" ");

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
    console.info("Resolving Git sandbox", { diskId, repoName, repoUsername });
    const sandboxEnv = {
      ARCHIL_DISK_ID: diskId,
      ARCHIL_MOUNT_TOKEN: mountToken,
      ARCHIL_REGION: this.env.ARCHIL_REGION,
      ORIGIN_TOKEN: originToken,
      REPO_NAME: repoName,
      REPO_USERNAME: repoUsername,
    };

    const hostname = await this.ctx.blockConcurrencyWhile(async () => {
      const currentSandbox = this.getSandboxState();

      if (currentSandbox) {
        console.info("Found stored sandbox state", {
          hostname: currentSandbox.hostname,
          sandboxId: currentSandbox.sandboxId,
        });
        const sandbnox = await this.getCachedArchilSandbox(
          currentSandbox.sandboxId,
        );

        if (sandbnox) {
          console.info("Reusing Git sandbox", {
            hostname: currentSandbox.hostname,
            sandboxId: currentSandbox.sandboxId,
            status: sandbnox.status,
          });
          return currentSandbox.hostname;
        }

        console.warn("Stored Git sandbox no longer exists", {
          sandboxId: currentSandbox.sandboxId,
        });
      }

      console.info("Creating Git sandbox", { diskId, repoName, repoUsername });
      const sandox = await this.archil.sandboxes.create(
        {
          baseImage: this.env.ARCHIL_SANDBOX_IMAGE,
          vcpuCount: 2,
          memSizeMiB: 4096,
          maxTtlSeconds: GitRepository.MAX_TTL,
        },
        { wait: true },
      );
      console.info("Git sandbox created", {
        sandboxId: sandox.id,
        status: sandox.status,
      });

      const hostname = await this.createGitService(sandox, sandboxEnv);

      this.setSandboxState({ sandboxId: sandox.id, hostname });
      this.cacheArchilSandbox(sandox);
      console.info("Git sandbox is ready", {
        hostname,
        sandboxId: sandox.id,
      });
      return hostname;
    });

    await this.ping();
    return hostname;
  }

  async deleteRepository() {
    return this.ctx.blockConcurrencyWhile(async () => {
      const sandboxState = this.getSandboxState();
      const sandbox = sandboxState
        ? await this.getArchilSandbox(sandboxState.sandboxId)
        : null;

      if (sandbox) {
        if (
          sandbox.status !== "stopped" &&
          sandbox.status !== "exited" &&
          sandbox.status !== "failed"
        ) {
          await sandbox.stop();
        }
        await sandbox.delete();
      }

      this.cachedArchilSandbox = null;
      await this.ctx.storage.deleteAll();
      console.info("Git repository state deleted", {
        sandboxId: sandboxState?.sandboxId,
      });

      return { sandboxId: sandboxState?.sandboxId ?? null };
    });
  }

  private async createGitService(
    sandbox: Sandbox,
    env: Record<string, string>,
  ) {
    try {
      console.info("Creating Git network service", { sandboxId: sandbox.id });
      const service = await sandbox.exec(CREATE_GIT_SERVICE_COMMAND, { env });
      if (service.exitCode !== 0) {
        throw new Error(`Failed to create Git service: ${service.stderr}`);
      }

      const hostname = GitServiceSchema.parse(
        JSON.parse(service.stdout),
      ).hostname;
      await this.waitForGitService({
        gitHost: hostname,
        originToken: env.ORIGIN_TOKEN,
      });
      console.info("Git network service created", {
        hostname,
        sandboxId: sandbox.id,
      });
      return hostname;
    } catch (error) {
      console.error("Failed to create Git network service", {
        error,
        sandboxId: sandbox.id,
      });
      await this.cleanupIncompleteSandbox(sandbox);
      throw error;
    }
  }

  private async waitForGitService({
    gitHost,
    originToken,
  }: {
    gitHost: string;
    originToken: string;
  }) {
    const startedAt = Date.now();
    const readyDeadline = startedAt + SERVICE_READY_TIMEOUT_MS;
    let lastStatus: number | undefined;

    while (Date.now() < readyDeadline) {
      try {
        const response = await requestGitService({
          request: new Request("https://git-service/ping"),
          gitHost,
          originToken,
        });
        lastStatus = response.status;
        if (response.ok) {
          console.info("Git network service is ready", {
            gitHost,
            readyInMs: Date.now() - startedAt,
          });
          return;
        }
      } catch {
        lastStatus = undefined;
      }
      await scheduler.wait(SERVICE_READY_POLL_INTERVAL_MS);
    }

    throw new Error(
      `Git network service did not become ready (last status: ${lastStatus ?? "unreachable"})`,
    );
  }

  private async cleanupIncompleteSandbox(sandbox: Sandbox) {
    console.warn("Cleaning up incomplete sandbox", { sandboxId: sandbox.id });
    try {
      await sandbox.stop();
      console.info("Incomplete sandbox stopped", { sandboxId: sandbox.id });
    } catch (error) {
      console.error("Failed to stop incomplete sandbox", error);
    }

    try {
      await sandbox.delete();
      console.info("Incomplete sandbox deleted", { sandboxId: sandbox.id });
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
      console.info("Archil sandbox cache hit", { sandboxId });
      return cached.sandbox;
    }

    console.info("Archil sandbox cache miss", { sandboxId });
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

      console.warn("Archil sandbox not found", { sandboxId });
      return null;
    }
  }

  async alarm() {
    if (!this.isTimeoutReached()) {
      console.info("Ignoring Git sandbox alarm; repository is active");
      return;
    }

    const sandboxState = this.getSandboxState();

    if (!sandboxState) {
      console.info("Ignoring Git sandbox alarm; no sandbox is stored");
      return;
    }

    console.info("Checking idle Git sandbox", {
      sandboxId: sandboxState.sandboxId,
    });
    const sandbox = await this.getArchilSandbox(sandboxState.sandboxId);

    if (!sandbox) {
      this.cachedArchilSandbox = null;
      console.warn("Idle Git sandbox no longer exists", {
        sandboxId: sandboxState.sandboxId,
      });
      return;
    }

    if (!this.isTimeoutReached()) {
      console.info("Git sandbox became active during alarm", {
        sandboxId: sandbox.id,
      });
      return;
    }

    if (sandbox.status === "pending" || sandbox.status === "running") {
      console.info("Stopping idle Git sandbox", {
        sandboxId: sandbox.id,
        status: sandbox.status,
      });
      await sandbox.stop();
      console.info("Idle Git sandbox stopped", { sandboxId: sandbox.id });
      return;
    }

    console.info("Git sandbox is already inactive", {
      sandboxId: sandbox.id,
      status: sandbox.status,
    });
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
    const alarmAt = lastPing.getTime() + this.idleTimeoutMs;
    this.ctx.storage.kv.put(
      GitRepository.LAST_PING_KEY,
      lastPing.toISOString(),
    );
    await this.ctx.storage.setAlarm(alarmAt);
    console.info("Git sandbox idle deadline updated", {
      alarmAt: new Date(alarmAt).toISOString(),
    });
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
