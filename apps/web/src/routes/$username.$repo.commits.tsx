import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowsClockwiseIcon,
  ClipboardIcon,
  CodeIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitForkIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { formatRelativeTime } from "@/lib/repository/format";
import { getRepositoryCommits } from "@/lib/repository/functions";

export const Route = createFileRoute("/$username/$repo/commits")({
  loaderDeps: ({ search }) => ({ branch: search.branch }),
  loader: async ({ deps, params }) => {
    const repository = await getRepositoryCommits({
      data: {
        branch: deps.branch,
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
        title: `Commits · ${params.username}/${params.repo}`,
      },
    ],
  }),
  errorComponent: CommitsError,
  component: Commits,
});

function Commits() {
  const { repo, username } = Route.useParams();
  const navigate = Route.useNavigate();
  const { branch } = Route.useSearch();
  const { branches, commits, defaultBranch, loadedAt } = Route.useLoaderData();
  const currentBranch = branch ?? defaultBranch;
  const commitGroups = groupCommitsByDate(commits);

  function selectBranch(value: string | number | null) {
    if (typeof value !== "string") return;
    void navigate({
      search: {
        branch: value === defaultBranch ? undefined : value,
      },
    });
  }

  async function copyHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      toast.success("Commit hash copied");
    } catch {
      toast.error("Could not copy commit hash");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="border-b pb-4">
        <Combobox
          value={currentBranch}
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
      </div>

      {commits.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitCommitIcon />
            </EmptyMedia>
            <EmptyTitle>No commits yet</EmptyTitle>
            <EmptyDescription>
              This branch does not have any commits.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {commitGroups.map((group) => (
            <section key={group.date} className="group relative pl-8">
              <div className="absolute -bottom-6 left-2 top-2 border-l group-last:bottom-2" />
              <h3 className="relative mb-3 flex items-center text-sm text-muted-foreground">
                <span className="absolute -left-8 flex size-4 items-center justify-center bg-background">
                  <GitCommitIcon className="size-3" />
                </span>
                Commits on {group.label}
              </h3>
              <div className="overflow-hidden rounded-lg border bg-card">
                {group.commits.map((commit) => (
                  <article
                    key={commit.hash}
                    className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <Link
                        to="/$username/$repo"
                        params={{ repo, username }}
                        search={{
                          branch: undefined,
                          path: undefined,
                          ref: commit.hash,
                        }}
                        className="block truncate font-medium hover:text-accent hover:underline"
                      >
                        {commit.message}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="truncate">
                          <span className="font-medium text-foreground">
                            {commit.authorName}
                          </span>{" "}
                          committed{" "}
                          {formatRelativeTime(commit.committedAt, loadedAt)}
                        </span>
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <code className="px-2 text-xs text-muted-foreground">
                        {commit.shortHash}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Copy commit ${commit.shortHash}`}
                        onPress={() => copyHash(commit.hash)}
                      >
                        <ClipboardIcon />
                      </Button>
                      <Link
                        to="/$username/$repo"
                        params={{ repo, username }}
                        search={{
                          branch: undefined,
                          path: undefined,
                          ref: commit.hash,
                        }}
                        aria-label={`Browse files at commit ${commit.shortHash}`}
                        className="inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted"
                      >
                        <CodeIcon className="size-4" />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function CommitsError({ error }: { error: Error }) {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-12 sm:px-6">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitForkIcon />
          </EmptyMedia>
          <EmptyTitle>Commit history unavailable</EmptyTitle>
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

type Commit = Awaited<
  ReturnType<typeof getRepositoryCommits>
>["commits"][number];

function groupCommitsByDate(commits: Commit[]) {
  const groups = new Map<string, { label: string; commits: Commit[] }>();

  for (const commit of commits) {
    const committedAt = new Date(commit.committedAt);
    const date = committedAt.toISOString().slice(0, 10);
    const existing = groups.get(date);
    if (existing) {
      existing.commits.push(commit);
      continue;
    }
    groups.set(date, {
      label: committedAt.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
        year: "numeric",
      }),
      commits: [commit],
    });
  }

  return Array.from(groups, ([date, group]) => ({ date, ...group }));
}
