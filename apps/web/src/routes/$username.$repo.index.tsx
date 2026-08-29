import { Await, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowsClockwiseIcon,
  FolderIcon,
  GitForkIcon,
} from "@phosphor-icons/react";
import { z } from "zod";

import { RepositoryFile } from "@/components/repository-file";
import { RepositoryPathNavigation } from "@/components/repository-path-navigation";
import { RepositoryReadme } from "@/components/repository-readme";
import { RepositoryTree } from "@/components/repository-tree";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getRepository } from "@/lib/repository/functions";
import { TreePathSchema } from "@/lib/repository/schemas";

const RepositorySearchSchema = z.object({
  path: TreePathSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/$username/$repo/")({
  validateSearch: RepositorySearchSchema,
  loaderDeps: ({ search }) => ({
    branch: search.branch,
    path: search.path,
    ref: search.ref,
  }),
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ deps, params }) => {
      const repository = await getRepository({
        data: {
          branch: deps.ref ? undefined : deps.branch,
          path: deps.path,
          ref: deps.ref,
          repo: params.repo,
          username: params.username,
        },
      });
      return {
        ...repository,
        loadedAt: Date.now(),
      };
    },
  },

  head: ({ params }) => ({
    meta: [
      {
        title: `${params.username}/${params.repo}`,
      },
    ],
  }),
  errorComponent: RepositoryError,
  component: Repository,
});

function Repository() {
  const { repo, username } = Route.useParams();
  const navigate = Route.useNavigate();
  const { branch, path, ref } = Route.useSearch();
  const repository = Route.useLoaderData();
  const { branches, defaultBranch, latestCommit, loadedAt, totalCommits } =
    repository;

  function selectBranch(value: string | number | null) {
    if (typeof value !== "string" || value === ref) {
      return;
    }
    void navigate({
      search: {
        branch: value === defaultBranch ? undefined : value,
        path,
        ref: undefined,
      },
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-6 sm:px-6">
      <RepositoryPathNavigation
        branch={branch}
        branches={branches}
        defaultBranch={defaultBranch}
        onBranchChange={selectBranch}
        path={path}
        ref={ref}
        repo={repo}
        username={username}
      />

      {repository.type === "path-not-found" ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon weight="fill" className="size-5 text-accent" />
            </EmptyMedia>
            <EmptyTitle>Directory not found</EmptyTitle>
            <EmptyDescription>
              The directory <span className="font-medium">{path}</span> does not
              exist on branch{" "}
              <span className="font-medium">{branch ?? defaultBranch}</span>.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            onPress={() =>
              navigate({ search: { branch, path: undefined, ref } })
            }
          >
            View branch root
          </Button>
        </Empty>
      ) : repository.type === "blob" ? (
        <RepositoryFile
          key={path}
          branch={branch}
          contents={repository.contents}
          isBinary={repository.isBinary}
          latestCommit={latestCommit}
          loadedAt={loadedAt}
          path={path}
          prerenderedHTML={repository.prerenderedHTML}
          ref={ref}
          repo={repo}
          size={repository.size}
          totalCommits={totalCommits}
          username={username}
        />
      ) : (
        <>
          <RepositoryTree
            branch={branch}
            entries={repository.entries}
            latestCommit={latestCommit}
            loadedAt={loadedAt}
            path={path}
            ref={ref}
            repo={repo}
            totalCommits={totalCommits}
            username={username}
          />
          <Await fallback={null} promise={repository.readme}>
            {(readme) =>
              readme ? (
                <RepositoryReadme
                  branch={branch}
                  contents={readme.contents}
                  path={readme.path}
                  ref={ref}
                  repo={repo}
                  username={username}
                />
              ) : null
            }
          </Await>
        </>
      )}
    </main>
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
