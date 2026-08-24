import { Outlet, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RepositoryHeader } from "@/components/repository-header";
import { BranchNameSchema } from "@/lib/repository/schemas";

const RepositorySearchSchema = z.object({
  branch: BranchNameSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/$username/$repo")({
  validateSearch: RepositorySearchSchema,
  component: RepositoryLayout,
});

function RepositoryLayout() {
  const { repo, username } = Route.useParams();
  const { branch } = Route.useSearch();

  return (
    <div className="min-h-screen bg-background">
      <RepositoryHeader branch={branch} repo={repo} username={username} />
      <Outlet />
    </div>
  );
}
