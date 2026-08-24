import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  getRepositoryMetadataFromWorker,
  getRepositoryTreeFromWorker,
} from './api'
import {
  BranchNameSchema,
  RepositoryNameSchema,
  TreePathSchema,
  UsernameSchema,
} from './schemas'

const RepositoryInputSchema = z.object({
  branch: BranchNameSchema.optional(),
  path: TreePathSchema.optional(),
  repo: RepositoryNameSchema,
  username: UsernameSchema,
})

export const getRepository = createServerFn({ method: 'GET' })
  .validator(RepositoryInputSchema)
  .handler(async ({ data }) => {
    const [repository, tree] = await Promise.all([
      getRepositoryMetadataFromWorker(data),
      getRepositoryTreeFromWorker(data),
    ])

    return {
      branches: repository.branches,
      defaultBranch: repository.defaultBranch,
      entries: tree.entries,
      selectedBranch: data.branch ?? repository.defaultBranch,
    }
  })
