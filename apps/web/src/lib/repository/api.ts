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

const ContentResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tree"),
    entries: TreeResponseSchema.shape.entries,
  }),
  z.object({
    type: z.literal("blob"),
    contents: z.string(),
    isBinary: z.boolean(),
    size: z.number().int().nonnegative(),
  }),
]);

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

const CommitDetailResponseSchema = z.object({
  commit: CommitSchema,
  parents: z.array(z.string()),
  patch: z.string(),
});

const RepositorySummaryResponseSchema = z.object({
  latestCommit: CommitSchema,
  totalCommits: z.number().int().nonnegative(),
});

const RepositoryPathsResponseSchema = z.object({
  commit: z.string(),
  paths: z.array(z.string()),
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

export const getRepositoryContentFromWorker = createServerOnlyFn(
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
    const contentUrl = new URL("https://git-worker");
    contentUrl.pathname = `/api/repositories/${username}/${repo}/content`;
    if (branch) contentUrl.searchParams.set("branch", branch);
    if (path) contentUrl.searchParams.set("path", path);
    if (ref) contentUrl.searchParams.set("ref", ref);

    try {
      const response = await env.GIT_WORKER.fetch(contentUrl);
      const content = ContentResponseSchema.safeParse(
        await readWorkerJson(response),
      );
      if (!content.success) {
        throw new Error("Repository service returned an invalid response");
      }

      return content.data;
    } catch (error) {
      if (
        path &&
        error instanceof Error &&
        error.message === "path not found"
      ) {
        return { type: "path-not-found" as const };
      }
      throw error;
    }
  },
);

export const getRepositoryCommitsFromWorker = createServerOnlyFn(
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
    const commitsUrl = new URL("https://git-worker");
    commitsUrl.pathname = `/api/repositories/${username}/${repo}/commits`;
    if (branch) commitsUrl.searchParams.set("branch", branch);
    if (ref) commitsUrl.searchParams.set("ref", ref);

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

export const getRepositoryCommitFromWorker = createServerOnlyFn(
  async ({
    commit,
    repo,
    username,
  }: {
    commit: string;
    repo: string;
    username: string;
  }) => {
    const commitUrl = new URL("https://git-worker");
    commitUrl.pathname = `/api/repositories/${username}/${repo}/commit`;
    commitUrl.searchParams.set("ref", commit);

    const response = await env.GIT_WORKER.fetch(commitUrl);
    const detail = CommitDetailResponseSchema.safeParse(
      await readWorkerJson(response),
    );
    if (!detail.success) {
      throw new Error("Repository service returned an invalid response");
    }

    return detail.data;
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

export const getRepositoryPathsFromWorker = createServerOnlyFn(
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
    const pathsUrl = new URL("https://git-worker");
    pathsUrl.pathname = `/api/repositories/${username}/${repo}/paths`;
    if (branch) pathsUrl.searchParams.set("branch", branch);
    if (ref) pathsUrl.searchParams.set("ref", ref);

    const response = await env.GIT_WORKER.fetch(pathsUrl);
    const paths = RepositoryPathsResponseSchema.safeParse(
      await readWorkerJson(response),
    );
    if (!paths.success) {
      throw new Error("Repository service returned an invalid response");
    }
    return paths.data;
  },
);
