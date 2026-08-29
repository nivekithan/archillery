import { parsePatchFiles, type CodeViewItem } from "@pierre/diffs";
import {
  CodeView,
  type CodeViewHandle,
} from "@pierre/diffs/react";
import { type GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  ClipboardIcon,
  CodeIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitForkIcon,
} from "@phosphor-icons/react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatRelativeTime } from "@/lib/repository/format";
import { getRepositoryCommit } from "@/lib/repository/functions";

const codeViewOptions = {
  diffStyle: "split",
  hunkSeparators: "line-info",
  overflow: "scroll",
  stickyHeaders: true,
  theme: { dark: "pierre-dark", light: "pierre-light" },
  themeType: "light",
  layout: { gap: 0, paddingBottom: 0, paddingTop: 0 },
} as const;

const fileTreeStyle = {
  colorScheme: "light",
  "--trees-accent-override": "var(--accent)",
  "--trees-bg-muted-override": "var(--muted)",
  "--trees-bg-override": "var(--card)",
  "--trees-border-color-override": "var(--border)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-fg-override": "var(--card-foreground)",
  "--trees-font-family-override": "var(--font-sans)",
  "--trees-input-bg-override": "var(--background)",
  "--trees-selected-bg-override": "var(--secondary)",
} as CSSProperties;

export const Route = createFileRoute("/$username/$repo/commit/$commit")({
  loader: async ({ params }) => {
    const detail = await getRepositoryCommit({
      data: {
        commit: params.commit,
        repo: params.repo,
        username: params.username,
      },
    });
    return { ...detail, loadedAt: Date.now() };
  },
  head: ({ params }) => ({
    meta: [
      {
        title: `Commit ${params.commit.slice(0, 7)} · ${params.username}/${params.repo}`,
      },
    ],
  }),
  errorComponent: CommitError,
  component: CommitDetail,
});

function CommitDetail() {
  const { repo, username } = Route.useParams();
  const { branch } = Route.useSearch();
  const {
    commit,
    defaultBranch,
    loadedAt,
    parents,
    patch,
  } = Route.useLoaderData();
  const codeViewRef = useRef<CodeViewHandle<undefined>>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedPath, setSelectedPath] = useState<string>();
  const fileDiffs = useMemo(
    () =>
      parsePatchFiles(patch, commit.hash, true).flatMap(
        (parsed) => parsed.files,
      ),
    [commit.hash, patch],
  );
  const items = useMemo<CodeViewItem[]>(
    () =>
      fileDiffs.map((fileDiff) => ({
        id: fileDiff.name,
        type: "diff",
        fileDiff,
        collapsed: collapsedPaths.has(fileDiff.name),
        // Repaint an off-screen diff after CodeView primes it for scrolling.
        version:
          (fileDiff.name === selectedPath ? 1 : 0) +
          (collapsedPaths.has(fileDiff.name) ? 2 : 0),
      })),
    [collapsedPaths, fileDiffs, selectedPath],
  );
  const paths = useMemo(
    () => fileDiffs.map((fileDiff) => fileDiff.name),
    [fileDiffs],
  );
  const gitStatus = useMemo<GitStatusEntry[]>(
    () =>
      fileDiffs.map((fileDiff) => ({
        path: fileDiff.name,
        status:
          fileDiff.type === "new"
            ? "added"
            : fileDiff.type === "deleted"
              ? "deleted"
              : fileDiff.type.startsWith("rename")
                ? "renamed"
                : "modified",
      })),
    [fileDiffs],
  );
  const { model } = useFileTree({
    flattenEmptyDirectories: false,
    gitStatus,
    icons: { colored: false, set: "complete" },
    initialExpansion: "open",
    onSelectionChange(selectedPaths) {
      const selectedPath = selectedPaths.at(-1);
      if (selectedPath) {
        setSelectedPath(selectedPath);
      }
    },
    paths,
  });
  const stats = fileDiffs.reduce(
    (totals, fileDiff) => {
      for (const hunk of fileDiff.hunks) {
        totals.additions += hunk.additionLines;
        totals.deletions += hunk.deletionLines;
      }
      return totals;
    },
    { additions: 0, deletions: 0 },
  );

  useEffect(() => {
    model.resetPaths(paths);
    model.setGitStatus(gitStatus);
  }, [gitStatus, model, paths]);

  useEffect(() => {
    if (!selectedPath) return;
    codeViewRef.current?.scrollTo({
      type: "item",
      id: selectedPath,
      align: "start",
      behavior: "smooth-auto",
    });
  }, [selectedPath]);

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(commit.hash);
      toast.success("Commit hash copied");
    } catch {
      toast.error("Could not copy commit hash");
    }
  }

  function toggleDiff(path: string) {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6">
      <header>
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-col gap-2 border-b px-4 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <h1 className="truncate font-mono text-sm font-normal">
                {commit.message}
              </h1>
              <p className="shrink-0 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {commit.authorName}
                </span>{" "}
                committed {formatRelativeTime(commit.committedAt, loadedAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <span>commit</span>
                <code className="text-foreground">{commit.shortHash}</code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Copy commit ${commit.shortHash}`}
                  onPress={copyHash}
                >
                  <ClipboardIcon />
                </Button>
              </div>
              <Link
                to="/$username/$repo"
                params={{ repo, username }}
                search={{ branch: undefined, path: undefined, ref: commit.hash }}
                className={buttonVariants({ size: "sm", variant: "ghost" })}
              >
                <CodeIcon data-icon="inline-start" />
                Browse files
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-4 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <GitBranchIcon data-icon="inline-start" />
                {branch ?? defaultBranch}
              </Badge>
              {parents.length > 0 ? (
                <span>
                  {parents.length} {parents.length === 1 ? "parent" : "parents"}{" "}
                  {parents.map((parent, index) => (
                    <span key={parent}>
                      {index > 0 && ", "}
                      <Link
                        to="/$username/$repo/commit/$commit"
                        params={{ commit: parent, repo, username }}
                        search={{ branch }}
                        className="font-mono text-foreground hover:underline"
                      >
                        {parent.slice(0, 7)}
                      </Link>
                    </span>
                  ))}
                </span>
              ) : (
                <span>Root commit</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3 text-sm font-medium text-foreground">
              <span>
              {fileDiffs.length} {fileDiffs.length === 1 ? "file" : "files"} changed
              </span>
              <span className="text-emerald-600">+{stats.additions}</span>
              <span className="text-red-600">-{stats.deletions}</span>
            </div>
          </div>
        </section>
      </header>

      {items.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitCommitIcon />
            </EmptyMedia>
            <EmptyTitle>No file changes</EmptyTitle>
            <EmptyDescription>
              This commit does not contain a first-parent file diff.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid min-h-144 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="h-64 overflow-hidden rounded-lg border bg-card lg:sticky lg:top-4 lg:h-[70vh] lg:min-h-144">
            <FileTree
              model={model}
              header={
                <div className="mb-2 flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
                  <GitForkIcon className="size-4" />
                  Files changed
                </div>
              }
              className="block h-full"
              style={fileTreeStyle}
            />
          </aside>
          <CodeView
            ref={codeViewRef}
            items={items}
            options={codeViewOptions}
            renderHeaderPrefix={(item) => (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${item.collapsed ? "Expand" : "Collapse"} ${item.id}`}
                onPress={() => toggleDiff(item.id)}
              >
                {item.collapsed ? <CaretRightIcon /> : <CaretDownIcon />}
              </Button>
            )}
            className="commit-code-view h-[70vh] min-h-144 overflow-auto rounded-lg border bg-card"
          />
        </div>
      )}
    </main>
  );
}

function CommitError({ error }: { error: Error }) {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-12 sm:px-6">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitForkIcon />
          </EmptyMedia>
          <EmptyTitle>Commit unavailable</EmptyTitle>
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
