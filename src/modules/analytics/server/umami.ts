import "server-only";
import type { Session } from "@/modules/auth/server/auth";
import { UMAMI_ORIGIN, UMAMI_TRACKED_HOST, UMAMI_WEBSITE_ID } from "@/shared/analytics/umami";
import type { AdminStatisticsPeriod } from "@/shared/utils/admin-period";
import { adminStatisticsRange } from "@/shared/utils/admin-period";

export type UmamiStatistics = { visitors: number; visits: number; pageviews: number };
export type UmamiStatisticsResult = { available: true; data: UmamiStatistics } | { available: false; reason: "not_configured" | "unavailable" };

export async function getUmamiStatistics(actor: Session, period: AdminStatisticsPeriod): Promise<UmamiStatisticsResult> {
  if (actor.role !== "ADMIN" && actor.role !== "EDITOR") throw new Error("forbidden");
  const token = process.env.UMAMI_API_KEY;
  if (!token) return { available: false, reason: "not_configured" };
  const { startAt, endAt } = adminStatisticsRange(period);
  let base: URL;
  try {
    base = new URL(process.env.UMAMI_API_URL || UMAMI_ORIGIN);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error();
  } catch {
    return { available: false, reason: "unavailable" };
  }
  const url = new URL(`/api/websites/${UMAMI_WEBSITE_ID}/stats`, base);
  url.search = new URLSearchParams({ startAt: String(startAt.getTime()), endAt: String(endAt.getTime()), hostname: UMAMI_TRACKED_HOST }).toString();
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000), redirect: "error", next: { revalidate: 60 } });
    if (!response.ok) return { available: false, reason: "unavailable" };
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") return { available: false, reason: "unavailable" };
    const body = value as Record<string, unknown>;
    const metrics = [body.visitors, body.visits, body.pageviews];
    if (!metrics.every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return { available: false, reason: "unavailable" };
    return { available: true, data: { visitors: metrics[0] as number, visits: metrics[1] as number, pageviews: metrics[2] as number } };
  } catch {
    return { available: false, reason: "unavailable" };
  }
}
