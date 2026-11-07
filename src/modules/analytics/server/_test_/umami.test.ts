import { afterEach, expect, it, vi } from "vitest";
import { getUmamiStatistics } from "../umami";

const admin = { id: 1, role: "ADMIN" as const, authVersion: 1 };
const manager = { id: 2, role: "BOOKING_MANAGER" as const, authVersion: 1 };
const originalKey = process.env.UMAMI_API_KEY;
const originalUrl = process.env.UMAMI_API_URL;

afterEach(() => {
  if (originalKey === undefined) delete process.env.UMAMI_API_KEY; else process.env.UMAMI_API_KEY = originalKey;
  if (originalUrl === undefined) delete process.env.UMAMI_API_URL; else process.env.UMAMI_API_URL = originalUrl;
  vi.unstubAllGlobals();
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
