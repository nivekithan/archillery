import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
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

    return {
      branches: repository.branches,
      defaultBranch: repository.defaultBranch,
      ...summary,
      ...content,
    };
  });

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
