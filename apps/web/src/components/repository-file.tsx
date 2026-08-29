import { File as DiffsFile } from "@pierre/diffs/react";
import { FileCodeIcon, FileIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { createDiffsFile, fileOptions } from "@/lib/diffs/file";
import { formatRelativeTime, formatSize } from "@/lib/repository/format";

type RepositoryFileProps = {
  contents: string;
  isBinary: boolean;
  latestCommit: {
    authorName: string;
    committedAt: string;
    message: string;
    shortHash: string;
  };
  loadedAt: number;
  path?: string;
  prerenderedHTML?: string;
  size: number;
};

export function RepositoryFile({
  contents,
  isBinary,
  latestCommit,
  loadedAt,
  path,
  prerenderedHTML,
  size,
}: RepositoryFileProps) {
  const name = path ?? "";
  const file = useMemo(() => createDiffsFile(name, contents), [contents, name]);

  if (!path) {
    throw new Error("Repository returned a blob without a path");
  }
  const fileName = path.split("/").at(-1) ?? path;
  const lineCount = contents
    ? contents.split(/\r\n|\r|\n/).length -
      (contents.endsWith("\n") || contents.endsWith("\r") ? 1 : 0)
    : 0;

  return (
    <>
      <div className="flex min-h-11 flex-col gap-2 rounded-lg border bg-card px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-semibold">
            {latestCommit.authorName}
          </span>
          <span className="truncate text-muted-foreground">
            {latestCommit.message}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <code>{latestCommit.shortHash}</code>
          <span aria-hidden="true">·</span>
          <span>{formatRelativeTime(latestCommit.committedAt, loadedAt)}</span>
        </div>
      </div>

      {isBinary ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileIcon weight="fill" className="size-5" />
            </EmptyMedia>
            <EmptyTitle>Binary file</EmptyTitle>
            <EmptyDescription>
              {fileName} is {formatSize(size)} and cannot be displayed as text.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex min-h-11 items-center gap-3 border-b bg-muted/30 px-3 py-2 text-sm">
            <span className="flex items-center gap-1.5 font-semibold">
              <FileCodeIcon className="size-4" />
              Code
            </span>
            <span className="text-xs text-muted-foreground">
              {lineCount} {lineCount === 1 ? "line" : "lines"}
              <span className="px-1.5" aria-hidden="true">
                ·
              </span>
              {formatSize(size)}
            </span>
          </div>
          <DiffsFile
            key={file.cacheKey}
            file={file}
            options={fileOptions}
            prerenderedHTML={prerenderedHTML}
          />
        </div>
      )}
    </>
  );
}
