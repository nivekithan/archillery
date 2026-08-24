import { env } from "cloudflare:workers";
import { createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";

import { readWorkerJson } from "../worker-api";

const RepositoryResponseSchema = z.object({
  branches: z.array(z.string()),
  defaultBranch: z.string(),
});

const TreeResponseSchema = z.object({
  entries: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      type: z.string(),
      size: z.number().optional(),
    }),
  ),
});

const CommitSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  message: z.string(),
  authorName: z.string(),
  authorEmail: z.string(),
  committedAt: z.iso.datetime({ offset: true }),
});

const CommitsResponseSchema = z.object({
  commits: z.array(CommitSchema),
});

const RepositorySummaryResponseSchema = z.object({
  latestCommit: CommitSchema,
  totalCommits: z.number().int().nonnegative(),
});

export const getRepositoryMetadataFromWorker = createServerOnlyFn(
  async ({ repo, username }: { repo: string; username: string }) => {
    const repositoryUrl = new URL("https://git-worker");
    repositoryUrl.pathname = `/api/repositories/${username}/${repo}`;

    const response = await env.GIT_WORKER.fetch(repositoryUrl);
    const repository = RepositoryResponseSchema.safeParse(
      await readWorkerJson(response),
    );
    if (!repository.success) {
      throw new Error("Repository service returned an invalid response");
    }

    return repository.data;
  },
);

export const getRepositoryTreeFromWorker = createServerOnlyFn(
  async ({
    branch,
    path,
    ref,
    repo,
    username,
  }: {
    branch?: string;
    path?: string;
    ref?: string;
    repo: string;
    username: string;
  }) => {
    const treeUrl = new URL("https://git-worker");
    treeUrl.pathname = `/api/repositories/${username}/${repo}/tree`;
    if (branch) treeUrl.searchParams.set("branch", branch);
    if (path) treeUrl.searchParams.set("path", path);
    if (ref) treeUrl.searchParams.set("ref", ref);

    try {
      const response = await env.GIT_WORKER.fetch(treeUrl);
      const tree = TreeResponseSchema.safeParse(await readWorkerJson(response));
      if (!tree.success) {
        throw new Error("Repository service returned an invalid response");
      }

      return {
        status: "success" as const,
        entries: tree.data.entries,
      };
    } catch (error) {
      if (
        path &&
        error instanceof Error &&
        error.message === "directory not found"
      ) {
        return { status: "directory-not-found" as const };
      }
      throw error;
    }
  },
);

export const getRepositoryCommitsFromWorker = createServerOnlyFn(
  async ({
    branch,
    repo,
    username,
  }: {
    branch?: string;
    repo: string;
    username: string;
  }) => {
    const commitsUrl = new URL("https://git-worker");
    commitsUrl.pathname = `/api/repositories/${username}/${repo}/commits`;
    if (branch) commitsUrl.searchParams.set("branch", branch);

    const response = await env.GIT_WORKER.fetch(commitsUrl);
    const commits = CommitsResponseSchema.safeParse(
      await readWorkerJson(response),
    );
    if (!commits.success) {
      throw new Error("Repository service returned an invalid response");
    }

    return commits.data.commits;
  },
);

export const getRepositorySummaryFromWorker = createServerOnlyFn(
  async ({
    branch,
    ref,
    repo,
    username,
  }: {
    branch?: string;
    ref?: string;
    repo: string;
    username: string;
  }) => {
    const summaryUrl = new URL("https://git-worker");
    summaryUrl.pathname = `/api/repositories/${username}/${repo}/summary`;
    if (branch) summaryUrl.searchParams.set("branch", branch);
    if (ref) summaryUrl.searchParams.set("ref", ref);

    const response = await env.GIT_WORKER.fetch(summaryUrl);
    const summary = RepositorySummaryResponseSchema.safeParse(
      await readWorkerJson(response),
    );
    if (!summary.success) {
      throw new Error("Repository service returned an invalid response");
    }

    return summary.data;
  },
);
