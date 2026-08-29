import { FileIcon, FolderIcon, GitCommitIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelativeTime, formatSize } from "@/lib/repository/format";

type RepositoryTreeProps = {
  branch?: string;
  entries: Array<{
    name: string;
    path: string;
    size?: number;
    type: string;
  }>;
  latestCommit: {
    authorName: string;
    committedAt: string;
    hash: string;
    message: string;
    shortHash: string;
  };
  loadedAt: number;
  path?: string;
  ref?: string;
  repo: string;
  totalCommits: number;
  username: string;
};

export function RepositoryTree({
  branch,
  entries,
  latestCommit,
  loadedAt,
  path,
  ref,
  repo,
  totalCommits,
  username,
}: RepositoryTreeProps) {
  if (entries.length === 0) {
    return (
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
    );
  }

  const parentPath = path?.split("/").slice(0, -1).join("/") || undefined;

  return (
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
                  <FolderIcon weight="fill" className="size-4 text-accent" />
                  ..
                </Link>
              </TableCell>
              <TableCell />
            </TableRow>
          )}
          {entries.map((entry) => (
            <TableRow key={entry.path} id={entry.path}>
              <TableCell className="font-medium">
                {entry.type === "tree" ? (
                  <Link
                    to="/$username/$repo"
                    params={{ repo, username }}
                    search={{ branch, path: entry.path, ref }}
                    className="flex items-center gap-3 hover:text-accent hover:underline"
                  >
                    <FolderIcon weight="fill" className="size-4 text-accent" />
                    {entry.name}
                  </Link>
                ) : entry.type === "blob" || entry.type === "symlink" ? (
                  <Link
                    to="/$username/$repo"
                    params={{ repo, username }}
                    search={{ branch, path: entry.path, ref }}
                    className="flex items-center gap-3 hover:text-accent hover:underline"
                  >
                    <FileIcon
                      weight="fill"
                      className="size-4 text-muted-foreground"
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
  );
}
