import { FileIcon, FolderIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { RepositoryCommitSummary } from "@/components/repository-commit-summary";
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
import { formatSize } from "@/lib/repository/format";

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
      <RepositoryCommitSummary
        branch={branch}
        className="border-b"
        latestCommit={latestCommit}
        loadedAt={loadedAt}
        ref={ref}
        repo={repo}
        totalCommits={totalCommits}
        username={username}
      />
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
