import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  getRepositoryMetadataFromWorker,
  getRepositoryTreeFromWorker,
} from './api'
import {
  RepositoryNameSchema,
  TreePathSchema,
  UsernameSchema,
} from './schemas'

const RepositoryInputSchema = z.object({
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
      defaultBranch: repository.defaultBranch,
      entries: tree.entries,
    }
  })
