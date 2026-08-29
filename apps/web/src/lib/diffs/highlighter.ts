const warmed = new Map<string, Promise<boolean>>();

export function preloadCodeView(name?: string): Promise<boolean> {
  const key = name ?? "";
  let pending = warmed.get(key);

  if (!pending) {
    pending = warm(name);
    warmed.set(key, pending);
  }

  return pending;
}

async function warm(name?: string): Promise<boolean> {
  try {
    const diffs = await import("@pierre/diffs");

    await diffs.preloadHighlighter({
      themes: diffs.getThemes(),
      langs: name ? [diffs.getFiletypeFromFileName(name)] : [],
    });

    return true;
  } catch {
    return false;
  }
}
