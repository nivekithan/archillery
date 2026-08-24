import { env } from 'cloudflare:workers'
import { createServerOnlyFn } from '@tanstack/react-start'
import { z } from 'zod'

import { readWorkerJson } from '../worker-api'

const RepositoryResponseSchema = z.object({
  defaultBranch: z.string(),
})

const TreeResponseSchema = z.object({
  entries: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      type: z.string(),
      size: z.number().optional(),
    }),
  ),
})

export const getRepositoryMetadataFromWorker = createServerOnlyFn(
  async ({ repo, username }: { repo: string; username: string }) => {
    const repositoryUrl = new URL('https://git-worker')
    repositoryUrl.pathname = `/api/repositories/${username}/${repo}`

    const response = await env.GIT_WORKER.fetch(repositoryUrl)
    const repository = RepositoryResponseSchema.safeParse(
      await readWorkerJson(response),
    )
    if (!repository.success) {
      throw new Error('Repository service returned an invalid response')
    }

    return repository.data
  },
)

export const getRepositoryTreeFromWorker = createServerOnlyFn(
  async ({
    path,
    repo,
    username,
  }: {
    path?: string
    repo: string
    username: string
  }) => {
    const treeUrl = new URL('https://git-worker')
    treeUrl.pathname = `/api/repositories/${username}/${repo}/tree`
    if (path) treeUrl.searchParams.set('path', path)

    const response = await env.GIT_WORKER.fetch(treeUrl)
    const tree = TreeResponseSchema.safeParse(await readWorkerJson(response))
    if (!tree.success) {
      throw new Error('Repository service returned an invalid response')
    }

    return tree.data
  },
)
