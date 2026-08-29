import { hashContents } from "@/lib/utils";

export const fileOptions = {
  disableFileHeader: true,
  overflow: "scroll",
  themeType: "light",
} as const;

export function createDiffsFile(name: string, contents: string) {
  return {
    name,
    contents,
    cacheKey: `${name}:${contents.length}:${hashContents(contents)}`,
  };
}
