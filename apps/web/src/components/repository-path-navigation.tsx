import { GitBranchIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { RepositoryPathSearch } from "@/components/repository-path-search";

type RepositoryPathNavigationProps = {
  branch?: string;
  branches: string[];
  commit: string;
  defaultBranch: string;
  onBranchChange: (value: string | number | null) => void;
  path?: string;
  ref?: string;
  repo: string;
  username: string;
};

export function RepositoryPathNavigation({
  branch,
  branches,
  commit,
  defaultBranch,
  onBranchChange,
  path,
  ref,
  repo,
  username,
}: RepositoryPathNavigationProps) {
  const pathSegments = path?.split("/") ?? [];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Combobox
        value={ref ?? branch ?? defaultBranch}
        onChange={onBranchChange}
        allowsEmptyCollection
        menuTrigger="focus"
      >
        <ComboboxInput
          aria-label="Branch"
          placeholder="Find a branch"
          className="w-fit min-w-28 max-w-64 **:data-[slot=input-group-control]:w-auto **:data-[slot=input-group-control]:field-sizing-content"
        >
          <InputGroupAddon>
            <GitBranchIcon />
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxContent className="w-72">
          <ComboboxList
            renderEmptyState={() => (
              <ComboboxEmpty>No branches found.</ComboboxEmpty>
            )}
          >
            {ref && (
              <ComboboxItem
                id={ref}
                textValue={ref.slice(0, 7)}
                className="hidden"
              />
            )}
            {branches.map((item) => (
              <ComboboxItem key={item} id={item} textValue={item}>
                <span className="truncate">{item}</span>
                {item === defaultBranch && (
                  <Badge variant="outline" className="ml-auto">
                    default
                  </Badge>
                )}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="text-base">
          <BreadcrumbItem>
            {pathSegments.length === 0 ? (
              <BreadcrumbPage className="font-semibold">/</BreadcrumbPage>
            ) : (
              <Link
                to="/$username/$repo"
                params={{ repo, username }}
                search={{ branch, path: undefined, ref }}
                className="font-semibold transition-colors hover:text-foreground"
              >
                /
              </Link>
            )}
          </BreadcrumbItem>
          {pathSegments.map((segment, index) => {
            const segmentPath = pathSegments.slice(0, index + 1).join("/");
            const isCurrent = index === pathSegments.length - 1;

            return (
              <BreadcrumbItem key={segmentPath}>
                {isCurrent ? (
                  <BreadcrumbPage className="font-semibold">
                    {segment}
                  </BreadcrumbPage>
                ) : (
                  <Link
                    to="/$username/$repo"
                    params={{ repo, username }}
                    search={{ branch, path: segmentPath, ref }}
                    className="transition-colors hover:text-foreground"
                  >
                    {segment}
                  </Link>
                )}
              </BreadcrumbItem>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <RepositoryPathSearch
        branch={branch}
        commit={commit}
        ref={ref}
        repo={repo}
        username={username}
      />
    </div>
  );
}
