export function formatRelativeTime(value: string, now: number) {
  const seconds = (new Date(value).getTime() - now) / 1_000;
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const ranges = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ] as const;

  let amount = seconds;
  for (const [threshold, unit] of ranges) {
    if (Math.abs(amount) < threshold) {
      return formatter.format(Math.round(amount), unit);
    }
    amount /= threshold;
  }
}

export function formatSize(size?: number) {
  if (size === undefined) return "-";
  if (size < 1_000) return `${size} B`;
  if (size < 1_000_000) return `${(size / 1_000).toFixed(1)} KB`;
  return `${(size / 1_000_000).toFixed(1)} MB`;
}
