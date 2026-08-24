import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowsClockwiseIcon,
  FileIcon,
  FolderIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitForkIcon,
} from "@phosphor-icons/react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InputGroupAddon } from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelativeTime, formatSize } from "@/lib/repository/format";
import { getRepository } from "@/lib/repository/functions";
import { CommitHashSchema, TreePathSchema } from "@/lib/repository/schemas";

const RepositorySearchSchema = z.object({
  path: TreePathSchema.optional().catch(undefined),
  ref: CommitHashSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/$username/$repo/")({
  validateSearch: RepositorySearchSchema,
  loaderDeps: ({ search }) => ({
    branch: search.branch,
    path: search.path,
    ref: search.ref,
  }),
  loader: async ({ deps, params }) => {
    const repository = await getRepository({
      data: {
        branch: deps.ref ? undefined : deps.branch,
        path: deps.path,
        ref: deps.ref,
        repo: params.repo,
        username: params.username,
      },
    });
    return {
      ...repository,
      loadedAt: Date.now(),
    };
  },
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.username}/${params.repo}`,
      },
    ],
  }),
  errorComponent: RepositoryError,
  component: Repository,
});

function Repository() {
  const { repo, username } = Route.useParams();
  const navigate = Route.useNavigate();
  const { branch, path, ref } = Route.useSearch();
  const repository = Route.useLoaderData();
  const { branches, defaultBranch, latestCommit, loadedAt, totalCommits } =
    repository;
  const currentBranch = branch ?? defaultBranch;
  const pathSegments = path?.split("/") ?? [];
  const parentPath = pathSegments.slice(0, -1).join("/") || undefined;

  function selectBranch(value: string | number | null) {
    if (typeof value !== "string" || value === ref) {
      return;
    }
    void navigate({
      search: {
        branch: value === defaultBranch ? undefined : value,
        path,
        ref: undefined,
      },
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Combobox
          value={ref ?? branch ?? defaultBranch}
          onChange={selectBranch}
          allowsEmptyCollection
          menuTrigger="focus"
        >
          <ComboboxInput
            aria-label="Branch"
            placeholder="Find a branch"
            className="w-fit min-w-28 max-w-64 **:data-[slot=input-group-control]:w-auto **:data-[slot=input-group-control]:field-sizing-content"
          >
            <InputGroupAddon>
              <GitBranchIcon />
            </InputGroupAddon>
          </ComboboxInput>
          <ComboboxContent className="w-72">
            <ComboboxList
              renderEmptyState={() => (
                <ComboboxEmpty>No branches found.</ComboboxEmpty>
              )}
            >
              {ref && (
                <ComboboxItem
                  id={ref}
                  textValue={ref.slice(0, 7)}
                  className="hidden"
                />
              )}
              {branches.map((item) => (
                <ComboboxItem key={item} id={item} textValue={item}>
                  <span className="truncate">{item}</span>
                  {item === defaultBranch && (
                    <Badge variant="outline" className="ml-auto">
                      default
                    </Badge>
                  )}
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="text-base">
            <BreadcrumbItem>
              {pathSegments.length === 0 ? (
                <BreadcrumbPage className="font-semibold">/</BreadcrumbPage>
              ) : (
                <Link
                  to="/$username/$repo"
                  params={{ repo, username }}
                  search={{ branch, path: undefined, ref }}
                  className="font-semibold transition-colors hover:text-foreground"
                >
                  /
                </Link>
              )}
            </BreadcrumbItem>
            {pathSegments.map((segment, index) => {
              const segmentPath = pathSegments.slice(0, index + 1).join("/");
              const isCurrent = index === pathSegments.length - 1;

              return (
                <BreadcrumbItem key={segmentPath}>
                  {isCurrent ? (
                    <BreadcrumbPage className="font-semibold">
                      {segment}
                    </BreadcrumbPage>
                  ) : (
                    <Link
                      to="/$username/$repo"
                      params={{ repo, username }}
                      search={{ branch, path: segmentPath, ref }}
                      className="transition-colors hover:text-foreground"
                    >
                      {segment}
                    </Link>
                  )}
                </BreadcrumbItem>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {repository.status === "directory-not-found" ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon weight="fill" className="size-5 text-accent" />
            </EmptyMedia>
            <EmptyTitle>Directory not found</EmptyTitle>
            <EmptyDescription>
              The directory <span className="font-medium">{path}</span> does not
              exist at{" "}
              <span className="font-medium">
                {ref ? `commit ${ref.slice(0, 7)}` : `branch ${currentBranch}`}
              </span>
              .
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            onPress={() =>
              navigate({
                search: { branch, path: undefined, ref },
              })
            }
          >
            View repository root
          </Button>
        </Empty>
      ) : repository.entries.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon weight="fill" className="size-5 text-accent" />
            </EmptyMedia>
            <EmptyTitle>This directory is empty</EmptyTitle>
            <EmptyDescription>
              There are no files or directories at this path.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex min-h-11 flex-col gap-2 border-b bg-muted/30 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 font-semibold">
                {latestCommit.authorName}
              </span>
              <Link
                to="/$username/$repo"
                params={{ repo, username }}
                search={{
                  branch: undefined,
                  path: undefined,
                  ref: latestCommit.hash,
                }}
                className="truncate text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                {latestCommit.message}
              </Link>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <code>{latestCommit.shortHash}</code>
              <span aria-hidden="true">·</span>
              <span>
                {formatRelativeTime(latestCommit.committedAt, loadedAt)}
              </span>
              <Link
                to="/$username/$repo/commits"
                params={{ repo, username }}
                search={{ branch }}
                className="ml-2 flex items-center gap-1.5 font-medium text-foreground transition-colors hover:underline"
              >
                <GitCommitIcon className="size-4" />
                {totalCommits} {totalCommits === 1 ? "Commit" : "Commits"}
              </Link>
            </div>
          </div>
          <Table aria-label={`Files in ${path || repo}`}>
            <TableHeader className="sr-only">
              <TableHead isRowHeader>Name</TableHead>
              <TableHead>Size</TableHead>
            </TableHeader>
            <TableBody>
              {path && (
                <TableRow id="parent-directory">
                  <TableCell className="font-medium">
                    <Link
                      to="/$username/$repo"
                      params={{ repo, username }}
                      search={{ branch, path: parentPath, ref }}
                      className="flex items-center gap-3 hover:text-accent hover:underline"
                    >
                      <FolderIcon
                        weight="fill"
                        className="size-4 text-accent"
                      />
                      ..
                    </Link>
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
              {repository.entries.map((entry) => (
                <TableRow key={entry.path} id={entry.path}>
                  <TableCell className="font-medium">
                    {entry.type === "tree" ? (
                      <Link
                        to="/$username/$repo"
                        params={{ repo, username }}
                        search={{ branch, path: entry.path, ref }}
                        className="flex items-center gap-3 hover:text-accent hover:underline"
                      >
                        <FolderIcon
                          weight="fill"
                          className="size-4 text-accent"
                        />
                        {entry.name}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-3">
                        <FileIcon
                          weight="fill"
                          className="size-4 text-muted-foreground"
                        />
                        {entry.name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="w-28 text-right font-mono text-xs text-muted-foreground">
                    {formatSize(entry.size)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}

function RepositoryError({ error }: { error: Error }) {
  const router = useRouter();

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
          <ArrowsClockwiseIcon data-icon="inline-start" />
          Try again
        </Button>
      </Empty>
    </main>
  );
}
