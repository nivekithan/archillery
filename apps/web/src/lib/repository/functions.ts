import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { preloadDiffsFile } from "@/lib/diffs/ssr";

import {
  getRepositoryCommitFromWorker,
  getRepositoryCommitsFromWorker,
  getRepositoryContentFromWorker,
  getRepositoryMetadataFromWorker,
  getRepositorySummaryFromWorker,
} from "./api";
import {
  BranchNameSchema,
  CommitHashSchema,
  RepositoryNameSchema,
  TreePathSchema,
  UsernameSchema,
} from "./schemas";

const RepositoryInputSchema = z.object({
  branch: BranchNameSchema.optional(),
  path: TreePathSchema.optional(),
  ref: CommitHashSchema.optional(),
  repo: RepositoryNameSchema,
  username: UsernameSchema,
});

export const getRepository = createServerFn({ method: "GET" })
  .validator(RepositoryInputSchema)
  .handler(async ({ data }) => {
    const [repository, summary, content] = await Promise.all([
      getRepositoryMetadataFromWorker(data),
      // TODO: Make it streaming promise
      getRepositorySummaryFromWorker(data),
      getRepositoryContentFromWorker(data),
    ]);
    const readme = getRepositoryReadme(data, content);
    const prerenderedHTML = await (async () => {
      if (content.type === "blob" && !content.isBinary && data.path) {
        return preloadDiffsFile(data.path, content.contents);
      }
      return undefined;
    })();

    return {
      branches: repository.branches,
      defaultBranch: repository.defaultBranch,
      ...summary,
      ...content,
      prerenderedHTML,
      readme,
    };
  });

async function getRepositoryReadme(
  data: z.infer<typeof RepositoryInputSchema>,
  content: Awaited<ReturnType<typeof getRepositoryContentFromWorker>>,
) {
  if (content.type !== "tree") {
    return undefined;
  }

  const readmeEntry = content.entries.find(
    (entry) =>
      entry.type === "blob" && entry.name.toLowerCase() === "readme.md",
  );
  if (!readmeEntry) {
    return undefined;
  }

  const readmeContent = await getRepositoryContentFromWorker({
    ...data,
    path: readmeEntry.path,
  });
  if (readmeContent.type !== "blob" || readmeContent.isBinary) {
    return undefined;
  }

  return {
    contents: readmeContent.contents,
    path: readmeEntry.path,
  };
}

const RepositoryCommitsInputSchema = z.object({
  branch: BranchNameSchema.optional(),
  ref: CommitHashSchema.optional(),
  repo: RepositoryNameSchema,
  username: UsernameSchema,
});

export const getRepositoryCommits = createServerFn({ method: "GET" })
  .validator(RepositoryCommitsInputSchema)
  .handler(async ({ data }) => {
    const [repository, commits] = await Promise.all([
      getRepositoryMetadataFromWorker(data),
      getRepositoryCommitsFromWorker(data),
    ]);

    return { ...repository, commits };
  });

const RepositoryCommitInputSchema = z.object({
  commit: CommitHashSchema,
  repo: RepositoryNameSchema,
  username: UsernameSchema,
});

export const getRepositoryCommit = createServerFn({ method: "GET" })
  .validator(RepositoryCommitInputSchema)
  .handler(async ({ data }) => {
    const [repository, detail] = await Promise.all([
      getRepositoryMetadataFromWorker(data),
      getRepositoryCommitFromWorker(data),
    ]);
    return { ...repository, ...detail };
  });
