import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import {
  FileIcon,
  FolderIcon,
  GitBranchIcon,
  GitForkIcon,
  RefreshCwIcon,
} from 'lucide-react'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getRepository } from '@/lib/repository/functions'
import { TreePathSchema } from '@/lib/repository/schemas'

const RepositorySearchSchema = z.object({
  path: TreePathSchema.optional().catch(undefined),
})

export const Route = createFileRoute('/$username/$repo')({
  validateSearch: RepositorySearchSchema,
  loaderDeps: ({ search }) => ({ path: search.path }),
  loader: ({ deps, params }) =>
    getRepository({
      data: {
        path: deps.path,
        repo: params.repo,
        username: params.username,
      },
    }),
  head: ({ loaderData, params }) => ({
    meta: [
      {
        title: `${params.username}/${params.repo} - ${loaderData?.defaultBranch ?? 'Repository'}`,
      },
    ],
  }),
  errorComponent: RepositoryError,
  component: Repository,
})

function Repository() {
  const { repo, username } = Route.useParams()
  const { path } = Route.useSearch()
  const { defaultBranch, entries } = Route.useLoaderData()
  const pathSegments = path?.split('/') ?? []

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-6 border-b pb-6">
        <Link to="/" className="flex w-fit items-center gap-2 text-sm font-medium">
          <GitForkIcon className="size-4" />
          Git Cloudflare
        </Link>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{username}</p>
            <h1 className="truncate font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {repo}
            </h1>
          </div>
          <Badge variant="secondary">
            <GitBranchIcon data-icon="inline-start" />
            {defaultBranch}
          </Badge>
        </div>
      </header>

      <section className="flex flex-col gap-4 py-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {pathSegments.length === 0 ? (
                <BreadcrumbPage>{repo}</BreadcrumbPage>
              ) : (
                <Link
                  to="/$username/$repo"
                  params={{ repo, username }}
                  search={{ path: undefined }}
                  className="transition-colors hover:text-foreground"
                >
                  {repo}
                </Link>
              )}
            </BreadcrumbItem>
            {pathSegments.map((segment, index) => {
              const segmentPath = pathSegments.slice(0, index + 1).join('/')
              const isCurrent = index === pathSegments.length - 1

              return (
                <BreadcrumbItem key={segmentPath}>
                  {isCurrent ? (
                    <BreadcrumbPage>{segment}</BreadcrumbPage>
                  ) : (
                    <Link
                      to="/$username/$repo"
                      params={{ repo, username }}
                      search={{ path: segmentPath }}
                      className="transition-colors hover:text-foreground"
                    >
                      {segment}
                    </Link>
                  )}
                </BreadcrumbItem>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>

        {entries.length === 0 ? (
          <Empty className="min-h-72 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderIcon />
              </EmptyMedia>
              <EmptyTitle>This directory is empty</EmptyTitle>
              <EmptyDescription>
                There are no files or directories at this path.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table aria-label={`Files in ${path || repo}`}>
              <TableHeader>
                <TableHead isRowHeader>Name</TableHead>
                <TableHead className="w-28 text-right">Size</TableHead>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.path}>
                    <TableCell className="font-medium">
                      {entry.type === 'tree' ? (
                        <Link
                          to="/$username/$repo"
                          params={{ repo, username }}
                          search={{ path: entry.path }}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <FolderIcon className="size-4 text-muted-foreground" />
                          {entry.name}
                        </Link>
                      ) : (
                        <span className="flex items-center gap-2">
                          <FileIcon className="size-4 text-muted-foreground" />
                          {entry.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatSize(entry.size)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  )
}

function RepositoryError({ error }: { error: Error }) {
  const router = useRouter()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-12 sm:px-6">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitForkIcon />
          </EmptyMedia>
          <EmptyTitle>Repository unavailable</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onPress={() => router.invalidate()}>
          <RefreshCwIcon data-icon="inline-start" />
          Try again
        </Button>
      </Empty>
    </main>
  )
}

function formatSize(size?: number) {
  if (size === undefined) return '-'
  if (size < 1_000) return `${size} B`
  if (size < 1_000_000) return `${(size / 1_000).toFixed(1)} KB`
  return `${(size / 1_000_000).toFixed(1)} MB`
}
