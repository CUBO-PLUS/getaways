import { afterEach, expect, it, vi } from "vitest";
import { getBlogVisits, getUmamiStatistics } from "../umami";

const admin = { id: 1, role: "ADMIN" as const, authVersion: 1 };
const manager = { id: 2, role: "BOOKING_MANAGER" as const, authVersion: 1 };
const originalKey = process.env.UMAMI_API_KEY;
const originalUrl = process.env.UMAMI_API_URL;

afterEach(() => {
  if (originalKey === undefined) delete process.env.UMAMI_API_KEY; else process.env.UMAMI_API_KEY = originalKey;
  if (originalUrl === undefined) delete process.env.UMAMI_API_URL; else process.env.UMAMI_API_URL = originalUrl;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("requests cached 30-day visits for the article's public path and distinguishes unavailable from zero", async () => {
  process.env.UMAMI_API_KEY = "test-secret";
  process.env.UMAMI_API_URL = "http://umami:3000";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T15:30:00Z"));
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ visits: 0 })).mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  expect(await getBlogVisits(admin, "mi-articulo")).toBe(0);
  const [input, init] = fetch.mock.calls[0]!;
  const url = new URL(String(input));
  expect(url.searchParams.get("path")).toBe("/mi-articulo");
  expect(url.searchParams.get("hostname")).toBe("getaways.mauriciodmo.com");
  expect(Number(url.searchParams.get("endAt")) - Number(url.searchParams.get("startAt"))).toBe(30 * 86400000);
  expect(init?.next?.revalidate).toBe(7200);
  expect(await getBlogVisits(admin, "mi-articulo")).toBeNull();
  await expect(getBlogVisits(manager, "mi-articulo")).rejects.toThrow("forbidden");
});

it("requests the fixed site/host through the internal endpoint and returns numeric metrics including genuine zero", async () => {
  process.env.UMAMI_API_KEY = "test-secret";
  process.env.UMAMI_API_URL = "http://umami:3000";
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ visitors: 0, visits: 12, pageviews: 34 }));
  vi.stubGlobal("fetch", fetch);

  await expect(getUmamiStatistics(admin, 7)).resolves.toEqual({ available: true, data: { visitors: 0, visits: 12, pageviews: 34 } });
  const [input, init] = fetch.mock.calls[0]!;
  const url = new URL(String(input));
  expect(url.origin).toBe("http://umami:3000");
  expect(url.pathname).toBe("/api/websites/d8867140-793b-4409-9b42-e5d167109220/stats");
  expect(url.searchParams.get("hostname")).toBe("getaways.mauriciodmo.com");
  expect(init?.headers).toEqual({ Authorization: "Bearer test-secret" });
  expect(url.toString()).not.toContain("test-secret");
});

it("uses the same two-hour cache key for site traffic within each interval", async () => {
  process.env.UMAMI_API_KEY = "test-secret";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T14:01:00Z"));
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ visitors: 1, visits: 2, pageviews: 3 }));
  vi.stubGlobal("fetch", fetch);
  await getUmamiStatistics(admin, 7);
  vi.setSystemTime(new Date("2026-11-07T15:59:00Z"));
  await getUmamiStatistics(admin, 7);
  vi.setSystemTime(new Date("2026-11-07T16:00:00Z"));
  await getUmamiStatistics(admin, 7);
  expect(String(fetch.mock.calls[0]![0])).toBe(String(fetch.mock.calls[1]![0]));
  expect(String(fetch.mock.calls[1]![0])).not.toBe(String(fetch.mock.calls[2]![0]));
  expect(fetch.mock.calls[0]![1]).toMatchObject({ cache: "force-cache", next: { revalidate: 7200 } });
});

it.each([
  ["HTTP", async () => new Response("", { status: 503 })],
  ["network", async () => { throw new Error("offline"); }],
  ["malformed metrics", async () => Response.json({ visitors: "0", visits: 1, pageviews: 2 })],
] as const)("reports %s failures as unavailable rather than zero", async (_kind, implementation) => {
  process.env.UMAMI_API_KEY = "test-secret";
  vi.stubGlobal("fetch", vi.fn(implementation));
  await expect(getUmamiStatistics(admin, 30)).resolves.toEqual({ available: false, reason: "unavailable" });
});

it("does not call the network without a key and rejects booking managers before fetch", async () => {
  delete process.env.UMAMI_API_KEY;
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(getUmamiStatistics(admin, 30)).resolves.toEqual({ available: false, reason: "not_configured" });
  await expect(getUmamiStatistics(manager, 30)).rejects.toThrow("forbidden");
  expect(fetch).not.toHaveBeenCalled();
});
