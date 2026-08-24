import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowsClockwiseIcon,
  BookBookmarkIcon,
  ClipboardIcon,
  CodeIcon,
  FileIcon,
  FolderIcon,
  GitBranchIcon,
  GitForkIcon,
  LockKeyOpenIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
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
import { getRepository } from "@/lib/repository/functions";
import { BranchNameSchema, TreePathSchema } from "@/lib/repository/schemas";

const RepositorySearchSchema = z.object({
  branch: BranchNameSchema.optional().catch(undefined),
  path: TreePathSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/$username/$repo")({
  validateSearch: RepositorySearchSchema,
  loaderDeps: ({ search }) => ({ branch: search.branch, path: search.path }),
  loader: async ({ deps, params }) => {
    const repository = await getRepository({
      data: {
        branch: deps.branch,
        path: deps.path,
        repo: params.repo,
        username: params.username,
      },
    });
    return {
      ...repository,
      selectedBranch: deps.branch ?? repository.defaultBranch,
    };
  },
  head: ({ loaderData, params }) => ({
    meta: [
      {
        title: `${params.username}/${params.repo} - ${loaderData?.selectedBranch ?? "Repository"}`,
      },
    ],
  }),
  errorComponent: RepositoryError,
  component: Repository,
});

function Repository() {
  const { repo, username } = Route.useParams();
  const navigate = Route.useNavigate();
  const { branch, path } = Route.useSearch();
  const repository = Route.useLoaderData();
  const { branches, defaultBranch, selectedBranch } = repository;
  const pathSegments = path?.split("/") ?? [];
  const parentPath = pathSegments.slice(0, -1).join("/") || undefined;

  async function copyCloneUrl() {
    const cloneUrl = new URL(
      `/${username}/${repo}.git`,
      window.location.origin,
    );
    try {
      await navigator.clipboard.writeText(cloneUrl.href);
      toast.success("Clone URL copied");
    } catch {
      toast.error("Could not copy clone URL");
    }
  }

  function selectBranch(value: string | number | null) {
    if (typeof value !== "string" || value === selectedBranch) return;
    void navigate({
      search: {
        branch: value === defaultBranch ? undefined : value,
        path,
      },
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <section className="repository-header border-b">
        <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <h1 className="flex min-w-0 items-center gap-2 text-lg">
              <BookBookmarkIcon
                weight="fill"
                className="size-5 shrink-0 text-muted-foreground"
              />
              <span className="truncate">
                <span className="font-normal text-muted-foreground">
                  {username}
                </span>
                <span className="text-muted-foreground"> / </span>
                <span className="font-semibold">{repo}</span>
              </span>
              <Badge variant="outline" className="hidden sm:inline-flex">
                <LockKeyOpenIcon data-icon="inline-start" />
                Public
              </Badge>
            </h1>

            <Button variant="secondary" onPress={copyCloneUrl}>
              <ClipboardIcon data-icon="inline-start" />
              Copy clone URL
            </Button>
          </div>

          <nav aria-label="Repository" className="mt-4 flex">
            <span className="flex items-center gap-2 border-b-2 border-accent px-3 py-2 text-sm font-semibold">
              <CodeIcon className="size-4" />
              Code
            </span>
          </nav>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Combobox
            value={selectedBranch}
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
                    search={{ branch, path: undefined }}
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
                        search={{ branch, path: segmentPath }}
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
                The directory <span className="font-medium">{path}</span> does
                not exist on branch{' '}
                <span className="font-medium">{selectedBranch}</span>.
              </EmptyDescription>
            </EmptyHeader>
            <Button
              variant="outline"
              onPress={() =>
                navigate({
                  search: { branch, path: undefined },
                })
              }
            >
              View branch root
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
                        search={{ branch, path: parentPath }}
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
                          search={{ branch, path: entry.path }}
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
    </div>
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

function formatSize(size?: number) {
  if (size === undefined) return "-";
  if (size < 1_000) return `${size} B`;
  if (size < 1_000_000) return `${(size / 1_000).toFixed(1)} KB`;
  return `${(size / 1_000_000).toFixed(1)} MB`;
}
