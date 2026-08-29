import { createServerOnlyFn } from "@tanstack/react-start";

import { createDiffsFile, fileOptions } from "./file";

export const preloadDiffsFile = createServerOnlyFn(
  async (name: string, contents: string) => {
    const { preloadFile } = await import("@pierre/diffs/ssr");
    const preloaded = await preloadFile({
      file: createDiffsFile(name, contents),
      options: fileOptions,
    });
    return preloaded.prerenderedHTML;
  },
);
