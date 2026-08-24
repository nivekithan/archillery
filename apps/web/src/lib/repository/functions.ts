import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  getRepositoryCommitsFromWorker,
  getRepositoryMetadataFromWorker,
  getRepositorySummaryFromWorker,
  getRepositoryTreeFromWorker,
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
    const [repository, summary, tree] = await Promise.all([
      getRepositoryMetadataFromWorker(data),
      // TODO: Make it streaming promise
      getRepositorySummaryFromWorker(data),
      getRepositoryTreeFromWorker(data),
    ]);

    return {
      branches: repository.branches,
      defaultBranch: repository.defaultBranch,
      ...summary,
      ...tree,
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
