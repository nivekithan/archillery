import { File as DiffsFile } from "@pierre/diffs/react";
import { FileCodeIcon, FileIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { RepositoryCommitSummary } from "@/components/repository-commit-summary";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { createDiffsFile, fileOptions } from "@/lib/diffs/file";
import { formatSize } from "@/lib/repository/format";

type RepositoryFileProps = {
  branch?: string;
  contents: string;
  isBinary: boolean;
  latestCommit: {
    authorName: string;
    committedAt: string;
    hash: string;
    message: string;
    shortHash: string;
  };
  loadedAt: number;
  path?: string;
  prerenderedHTML?: string;
  ref?: string;
  repo: string;
  size: number;
  totalCommits: number;
  username: string;
};

export function RepositoryFile({
  branch,
  contents,
  isBinary,
  latestCommit,
  loadedAt,
  path,
  prerenderedHTML,
  ref,
  repo,
  size,
  totalCommits,
  username,
}: RepositoryFileProps) {
  const name = path ?? "";
  const file = useMemo(() => createDiffsFile(name, contents), [contents, name]);

  if (!path) {
    throw new Error("Repository returned a blob without a path");
  }
  const fileName = path.split("/").at(-1) ?? path;
  const isMarkdown = fileName.toLowerCase().endsWith(".md");
  const lineCount = contents
    ? contents.split(/\r\n|\r|\n/).length -
      (contents.endsWith("\n") || contents.endsWith("\r") ? 1 : 0)
    : 0;
  const fileMetadata = (
    <span className="text-xs text-muted-foreground">
      {lineCount} {lineCount === 1 ? "line" : "lines"}
      <span className="px-1.5" aria-hidden="true">
        ·
      </span>
      {formatSize(size)}
    </span>
  );
  const codeView = (
    <DiffsFile
      key={file.cacheKey}
      file={file}
      options={fileOptions}
      prerenderedHTML={prerenderedHTML}
    />
  );
  const fileViewer = (() => {
    if (isBinary) {
      return (
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
      );
    }

    if (isMarkdown) {
      return (
        <Tabs
          className="gap-0 overflow-hidden rounded-lg border bg-card"
          defaultSelectedKey="preview"
        >
          <div className="flex min-h-11 items-center gap-3 border-b bg-muted/30 px-3 py-2 text-sm">
            <TabsList>
              <TabsTrigger id="preview">Preview</TabsTrigger>
              <TabsTrigger id="code">Code</TabsTrigger>
            </TabsList>
            {fileMetadata}
          </div>
          <TabsContent id="preview">
            <MessageResponse
              className="mx-auto max-w-253 px-5 py-8 sm:px-8"
              mode="static"
            >
              {contents}
            </MessageResponse>
          </TabsContent>
          <TabsContent id="code">{codeView}</TabsContent>
        </Tabs>
      );
    }

    return (
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex min-h-11 items-center gap-3 border-b bg-muted/30 px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5 font-semibold">
            <FileCodeIcon className="size-4" />
            Code
          </span>
          {fileMetadata}
        </div>
        {codeView}
      </div>
    );
  })();

  return (
    <>
      <RepositoryCommitSummary
        branch={branch}
        className="rounded-lg border"
        latestCommit={latestCommit}
        loadedAt={loadedAt}
        ref={ref}
        repo={repo}
        totalCommits={totalCommits}
        username={username}
      />
      {fileViewer}
    </>
  );
}
