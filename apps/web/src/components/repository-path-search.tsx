import {
  FileIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import fuzzysort from "fuzzysort";
import { useContext, useDeferredValue, useMemo, useRef, useState } from "react";
import { ComboBoxStateContext } from "react-aria-components";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { getRepositoryPaths } from "@/lib/repository/functions";

type PathResult = {
  indexes: ReadonlyArray<number>;
  path: string;
  type: "blob" | "tree";
};

type PathTarget = {
  path: string;
  type: PathResult["type"];
};

type RepositoryPathSearchProps = {
  branch?: string;
  commit: string;
  ref?: string;
  repo: string;
  username: string;
};

export function RepositoryPathSearch({
  branch,
  commit,
  ref,
  repo,
  username,
}: RepositoryPathSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const pathsQuery = useQuery({
    queryKey: ["repository-paths", username, repo, commit],
    queryFn: () =>
      getRepositoryPaths({ data: { ref: commit, repo, username } }),
    select: ({ paths }) => {
      const targets: PathTarget[] = paths.map((encodedPath) => {
        const type: PathTarget["type"] = encodedPath.endsWith("/")
          ? "tree"
          : "blob";
        const path = type === "tree" ? encodedPath.slice(0, -1) : encodedPath;
        return { path, type };
      });
      return {
        index: fuzzysort.snapshot<PathTarget>(targets, { key: "path" }),
        rootEntries: targets
          .filter(({ path }) => !path.includes("/"))
          .map((entry) => ({ ...entry, indexes: [] })),
      };
    },
    enabled: typeof window !== "undefined",
    staleTime: Infinity,
  });

  const pathIndex = pathsQuery.data?.index;
  const normalizedQuery = query.trim();
  const deferredQuery = useDeferredValue(normalizedQuery);
  const results = useMemo<PathResult[]>(() => {
    if (!deferredQuery) return pathsQuery.data?.rootEntries ?? [];
    if (!pathIndex) return [];
    return fuzzysort
      .go(deferredQuery, pathIndex, { limit: 20, threshold: 0 })
      .map((result) => ({
        indexes: result.indexes,
        path: result.obj.path,
        type: result.obj.type,
      }));
  }, [deferredQuery, pathIndex, pathsQuery.data?.rootEntries]);

  function openResult(result: PathResult) {
    inputRef.current?.blur();
    setQuery("");
    void navigate({
      to: "/$username/$repo",
      params: { repo, username },
      search: { branch: ref ? undefined : branch, path: result.path, ref },
    });
  }

  const isLoading =
    pathsQuery.isPending ||
    (pathsQuery.isSuccess && !pathIndex) ||
    deferredQuery !== normalizedQuery;

  return (
    <Combobox<PathResult>
      allowsCustomValue
      allowsEmptyCollection
      defaultFilter={() => true}
      inputValue={query}
      menuTrigger="focus"
      value={null}
      onInputChange={setQuery}
      className="w-full sm:ml-auto sm:w-80"
    >
      <ComboboxInput
        ref={inputRef}
        aria-label="Search repository files"
        placeholder="Go to file"
        showTrigger={false}
        className="w-full"
      >
        <InputGroupAddon>
          <MagnifyingGlassIcon />
        </InputGroupAddon>
        {isLoading && (
          <InputGroupAddon align="inline-end">
            <SpinnerGapIcon className="animate-spin" />
          </InputGroupAddon>
        )}
      </ComboboxInput>
      <ComboboxContent className="max-h-[min(28rem,65vh)] min-w-72 sm:w-120">
        <ComboboxList
          items={results}
          renderEmptyState={() => (
            <ComboboxEmpty>
              {pathsQuery.isError
                ? "Could not load repository paths."
                : pathsQuery.isPending || !pathIndex
                  ? "Loading repository paths..."
                  : normalizedQuery.length === 0
                    ? "This repository is empty."
                    : "No matching paths found."}
            </ComboboxEmpty>
          )}
        >
          {(result) => (
            <RepositoryPathItem result={result} onAction={openResult} />
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function RepositoryPathItem({
  onAction,
  result,
}: {
  onAction: (result: PathResult) => void;
  result: PathResult;
}) {
  const state = useContext(ComboBoxStateContext);

  return (
    <ComboboxItem
      id={result.path}
      textValue={result.path}
      onAction={() => {
        state?.close();
        onAction(result);
      }}
    >
      {result.type === "tree" ? (
        <FolderIcon weight="fill" className="text-accent" />
      ) : (
        <FileIcon weight="fill" className="text-muted-foreground" />
      )}
      <span className="min-w-0 truncate">
        <HighlightedPath indexes={result.indexes} path={result.path} />
      </span>
    </ComboboxItem>
  );
}

function HighlightedPath({
  indexes,
  path,
}: {
  indexes: ReadonlyArray<number>;
  path: string;
}) {
  const matchedIndexes = new Set(indexes);
  let stringIndex = 0;
  return [...path].map((character) => {
    const index = stringIndex;
    stringIndex += character.length;
    const matched = matchedIndexes.has(index);
    return matched ? (
      <strong key={index} className="font-semibold text-foreground">
        {character}
      </strong>
    ) : (
      <span key={index} className="text-muted-foreground">
        {character}
      </span>
    );
  });
}
