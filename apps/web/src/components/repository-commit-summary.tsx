import { GitCommitIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/repository/format";

type RepositoryCommitSummaryProps = {
  branch?: string;
  className?: string;
  latestCommit: {
    authorName: string;
    committedAt: string;
    hash: string;
    message: string;
    shortHash: string;
  };
  loadedAt: number;
  ref?: string;
  repo: string;
  totalCommits: number;
  username: string;
};

export function RepositoryCommitSummary({
  branch,
  className,
  latestCommit,
  loadedAt,
  ref,
  repo,
  totalCommits,
  username,
}: RepositoryCommitSummaryProps) {
  return (
    <div
      className={cn(
        "flex min-h-11 flex-col gap-2 bg-muted/30 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-semibold">
          {latestCommit.authorName}
        </span>
        <Link
          to="/$username/$repo"
          params={{ repo, username }}
          search={{ branch: undefined, path: undefined, ref: latestCommit.hash }}
          className="truncate text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          {latestCommit.message}
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <code>{latestCommit.shortHash}</code>
        <span aria-hidden="true">·</span>
        <span>{formatRelativeTime(latestCommit.committedAt, loadedAt)}</span>
        <Link
          to="/$username/$repo/commits"
          params={{ repo, username }}
          search={{ branch: ref ? undefined : branch, ref }}
          className="ml-2 flex items-center gap-1.5 font-medium text-foreground transition-colors hover:underline"
        >
          <GitCommitIcon className="size-4" />
          {totalCommits} {totalCommits === 1 ? "Commit" : "Commits"}
        </Link>
      </div>
    </div>
  );
}
