export function blogPostPath(publishedAt: string, slug: string): string {
  const d = new Date(publishedAt);
  const year = d.getUTCFullYear().toString();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `/${year}/${month}/${day}/${slug}`;
}

/** Reject malformed date URLs, including impossible calendar dates, before querying posts. */
export function isBlogDatePath(year: string, month: string, day: string): boolean {
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return false;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  );
}

export function blogUtcDayRange(year: string, month: string, day: string) {
  if (!isBlogDatePath(year, month, day)) return null;
  const start = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), endExclusive: end.toISOString() };
}
