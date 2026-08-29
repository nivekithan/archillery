import { BookOpenTextIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { MessageResponse } from "@/components/ai-elements/message";

type RepositoryReadmeProps = {
  branch?: string;
  contents: string;
  path: string;
  ref?: string;
  repo: string;
  username: string;
};

export function RepositoryReadme({
  branch,
  contents,
  path,
  ref,
  repo,
  username,
}: RepositoryReadmeProps) {
  const fileName = path.split("/").at(-1) ?? path;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex min-h-11 items-center border-b bg-muted/30 px-4 py-2 text-sm font-semibold">
        <Link
          className="flex items-center gap-2 hover:text-accent hover:underline"
          params={{ repo, username }}
          search={{ branch, path, ref }}
          to="/$username/$repo"
        >
          <BookOpenTextIcon className="size-4" />
          {fileName}
        </Link>
      </div>
      <MessageResponse
        className="px-5 py-6 sm:px-8 sm:py-8"
        mode="static"
      >
        {contents}
      </MessageResponse>
    </section>
  );
}
