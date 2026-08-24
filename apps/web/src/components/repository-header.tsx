import { Link } from "@tanstack/react-router";
import {
  BookBookmarkIcon,
  ClipboardIcon,
  CodeIcon,
  LockKeyOpenIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type RepositoryHeaderProps = {
  branch?: string;
  ref?: string;
  repo: string;
  username: string;
};

export function RepositoryHeader({
  branch,
  ref,
  repo,
  username,
}: RepositoryHeaderProps) {
  async function copyCloneUrl() {
    const cloneUrl = new URL(`/${username}/${repo}.git`, window.location.origin);
    try {
      await navigator.clipboard.writeText(cloneUrl.href);
      toast.success("Clone URL copied");
    } catch {
      toast.error("Could not copy clone URL");
    }
  }

  return (
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

        <nav aria-label="Repository" className="mt-4 flex gap-1">
          <Link
            to="/$username/$repo"
            params={{ repo, username }}
            search={{ branch: ref ? undefined : branch, path: undefined, ref }}
            activeOptions={{ exact: true, includeSearch: false }}
            className="flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-accent data-[status=active]:font-semibold data-[status=active]:text-foreground"
          >
            <CodeIcon className="size-4" />
            Code
          </Link>
        </nav>
      </div>
    </section>
  );
}
