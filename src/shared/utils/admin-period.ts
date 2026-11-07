export const ADMIN_STATISTICS_PERIODS = [7, 30, 90] as const;
export type AdminStatisticsPeriod = typeof ADMIN_STATISTICS_PERIODS[number];

export function parseAdminStatisticsPeriod(value: unknown): AdminStatisticsPeriod {
  const period = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (ADMIN_STATISTICS_PERIODS.includes(period as AdminStatisticsPeriod)) return period as AdminStatisticsPeriod;
  return 30;
}

const zone = "America/El_Salvador";
function localDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function adminStatisticsRange(period: AdminStatisticsPeriod, now = new Date()) {
  const endAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const [year, month, day] = localDate(endAt).split("-").map(Number);
  const startLocal = new Date(Date.UTC(year, month - 1, day - (period - 1)));
  const startDate = `${startLocal.getUTCFullYear()}-${String(startLocal.getUTCMonth() + 1).padStart(2, "0")}-${String(startLocal.getUTCDate()).padStart(2, "0")}`;
  const endDate = localDate(endAt);
  return { startDate, endDate, startAt: new Date(`${startDate}T00:00:00-06:00`), endAt };
}
