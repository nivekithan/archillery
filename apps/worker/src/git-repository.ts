import { Archil } from "disk";
import { DurableObject } from "cloudflare:workers";

export const REPO_DISK_ID_HEADER = "x-git-disk-id";
export const REPO_DISK_TOKEN_HEADER = "x-git-disk-token";
export const REPO_NAME_HEADER = "x-git-repo-name";
export const REPO_USERNAME_HEADER = "x-git-repo-username";

const ACTIVE_LEASE_PREFIX = "active:";
const SANDBOX_IMAGE =
  "ghcr.io/nivekithan/archillery@sha256:89e36e1267b85a6285c945299f26f87cd442ded457475004124989730c791cfd";

export class GitRepository extends DurableObject<CloudflareBindings> {
  private static readonly MAX_TTL = 60 * 60 * 8;
  private static readonly SANDOX_ID_KEY = "";

  private readonly archil: Archil;
  private readonly idleTimeoutMs: number;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);
    this.archil = new Archil({
      apiKey: env.ARCHIL_API_KEY,
      region: env.ARCHIL_REGION,
    });
    this.idleTimeoutMs = env.GIT_IDLE_TIMEOUT_SECONDS;
  }

  async ensureSandboxIsRunning() {
    const id = this.ctx.id;
    const sandox = await this.archil.sandboxes.create(
      {
        baseImage: SANDBOX_IMAGE,
        name: id.toString(),
        vcpuCount: 2,
        memSizeMiB: 4096,
        maxTtlSeconds: GitRepository.MAX_TTL,
      },
      {
        wait: true,
      },
    );
    const sandboxId = sandox.id;
    this.ctx.storage.kv.put(GitRepository.SANDOX_ID_KEY, sandboxId);
  }
}
