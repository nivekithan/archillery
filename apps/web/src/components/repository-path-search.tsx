import {
  FileIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useHotkey, useHotkeys } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import fuzzysort from "fuzzysort";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Popover } from "@/components/ui/popover";
import { getRepositoryPaths } from "@/lib/repository/functions";

type PathResult = {
  id: string;
  indexes: ReadonlyArray<number>;
  path: string;
  type: "blob" | "tree";
};

type PathTarget = {
  id: string;
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
  const listboxRef = useRef<HTMLDivElement>(null);
  const pointerPositionRef = useRef<{ x: number; y: number }>(null);
  const listboxId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
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
        return { id: path, path, type };
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
  const results = useMemo<PathResult[]>(() => {
    if (!debouncedQuery) return pathsQuery.data?.rootEntries ?? [];
    if (!pathIndex) return [];
    return fuzzysort
      .go(debouncedQuery, pathIndex, { limit: 20, threshold: 0 })
      .map((result) => ({
        id: result.obj.id,
        indexes: result.indexes,
        path: result.obj.path,
        type: result.obj.type,
      }));
  }, [debouncedQuery, pathIndex, pathsQuery.data?.rootEntries]);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedQuery(normalizedQuery),
      150,
    );
    return () => window.clearTimeout(timeout);
  }, [normalizedQuery]);

  function openResult(result: PathResult) {
    setIsOpen(false);
    setQuery("");
    inputRef.current?.blur();
    void navigate({
      to: "/$username/$repo",
      params: { repo, username },
      search: { branch: ref ? undefined : branch, path: result.path, ref },
    });
  }

  const isLoading =
    pathsQuery.isPending ||
    (pathsQuery.isSuccess && !pathIndex) ||
    debouncedQuery !== normalizedQuery;

  useEffect(() => {
    if (!isOpen) return;
    listboxRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen, results]);

  useHotkey("T", () => inputRef.current?.focus(), {
    ignoreInputs: true,
    preventDefault: true,
  });

  useHotkeys(
    [
      {
        hotkey: "Escape",
        callback: () => {
          setIsOpen(false);
          inputRef.current?.blur();
        },
      },
      {
        hotkey: "ArrowDown",
        callback: () => {
          setIsOpen(true);
          if (results.length === 0) return;
          setActiveIndex((index) => (index + 1) % results.length);
        },
      },
      {
        hotkey: "ArrowUp",
        callback: () => {
          setIsOpen(true);
          if (results.length === 0) return;
          setActiveIndex(
            (index) => (index - 1 + results.length) % results.length,
          );
        },
      },
      {
        hotkey: "Home",
        callback: () => setActiveIndex(0),
        options: { enabled: isOpen && results.length > 0 },
      },
      {
        hotkey: "End",
        callback: () => setActiveIndex(results.length - 1),
        options: { enabled: isOpen && results.length > 0 },
      },
      {
        hotkey: "Enter",
        callback: () =>
          openResult(results[Math.min(activeIndex, results.length - 1)]),
        options: { enabled: isOpen && results.length > 0 },
      },
    ],
    {
      target: inputRef,
      ignoreInputs: false,
      preventDefault: true,
    },
  );

  return (
    <div className="relative w-full sm:ml-auto sm:w-80">
      <InputGroup>
        <InputGroupAddon>
          <MagnifyingGlassIcon />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          role="combobox"
          aria-activedescendant={
            isOpen && results.length > 0
              ? `${listboxId}-option-${Math.min(activeIndex, results.length - 1)}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-label="Search repository files"
          autoComplete="off"
          placeholder="Go to file"
          spellCheck={false}
          type="search"
          value={query}
          onBlur={() => setIsOpen(false)}
          onChange={(event) => {
            setActiveIndex(0);
            setIsOpen(true);
            setQuery(event.target.value);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {isLoading ? (
          <InputGroupAddon align="inline-end">
            <SpinnerGapIcon className="animate-spin" />
          </InputGroupAddon>
        ) : (
          <InputGroupAddon align="inline-end">
            <Kbd>T</Kbd>
          </InputGroupAddon>
        )}
      </InputGroup>
      <Popover
        isOpen={isOpen}
        isNonModal
        placement="bottom end"
        trigger="MenuTrigger"
        triggerRef={inputRef}
        onOpenChange={setIsOpen}
        className="w-(--trigger-width) min-w-72 overflow-hidden p-0 data-exiting:hidden data-exiting:animate-none sm:w-120"
      >
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label="Repository paths"
          className="max-h-[min(28rem,65vh)] overflow-y-auto p-1"
          onMouseDown={(event) => event.preventDefault()}
        >
          {results.length > 0 ? (
            results.map((result, index) => (
              <button
                id={`${listboxId}-option-${index}`}
                key={result.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-option-index={index}
                tabIndex={-1}
                className="flex w-full cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm outline-none aria-selected:bg-muted aria-selected:text-foreground"
                onClick={() => openResult(result)}
                onPointerMove={(event) => {
                  const pointerPosition = pointerPositionRef.current;
                  if (
                    pointerPosition?.x === event.clientX &&
                    pointerPosition.y === event.clientY
                  ) {
                    return;
                  }
                  pointerPositionRef.current = {
                    x: event.clientX,
                    y: event.clientY,
                  };
                  setActiveIndex(index);
                }}
              >
                {result.type === "tree" ? (
                  <FolderIcon weight="fill" className="text-accent" />
                ) : (
                  <FileIcon weight="fill" className="text-muted-foreground" />
                )}
                <span className="min-w-0 truncate">
                  <HighlightedPath
                    indexes={result.indexes}
                    path={result.path}
                  />
                </span>
              </button>
            ))
          ) : (
            <div className="py-2 text-center text-sm text-muted-foreground">
              {pathsQuery.isError
                ? "Could not load repository paths."
                : pathsQuery.isPending || !pathIndex
                  ? "Loading repository paths..."
                  : normalizedQuery.length === 0
                    ? "This repository is empty."
                    : "No matching paths found."}
            </div>
          )}
        </div>
      </Popover>
    </div>
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
