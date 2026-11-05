import { privateCheckoutJson } from "@/modules/checkout/private-response";
import { assertGuestAccountsAvailable, assertGuestSameOrigin, guestSessionCookie } from "@/modules/guests/server/auth";
import { registerGuest } from "@/modules/guests/server/accounts";

export async function POST(request: Request) {
  try { assertGuestAccountsAvailable(); } catch { return privateCheckoutJson({ ok: false, error: "Not available." }, { status: 503 }); }
  if (!assertGuestSameOrigin(request)) return privateCheckoutJson({ ok: false, error: "Invalid request." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return privateCheckoutJson({ ok: false, error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !["name", "email", "password"].every((key) => typeof (body as Record<string, unknown>)[key] === "string")) return privateCheckoutJson({ ok: false, error: "Invalid request." }, { status: 400 });
  try {
    const { name, email, password } = body as { name: string; email: string; password: string };
    const result = await registerGuest(request, name, email, password);
    if (result.error === "validation") return privateCheckoutJson({ ok: false, error: "Invalid account details." }, { status: 400 });
    if (result.error === "duplicate") return privateCheckoutJson({ ok: false, error: "An account could not be created with these details." }, { status: 409 });
    if (result.error === "throttled") return privateCheckoutJson({ ok: false, error: "Too many attempts." }, { status: 429, headers: { "Retry-After": String(result.retryAfter) } });
    if (!result.token) return privateCheckoutJson({ ok: false, error: "Unavailable." }, { status: 503 });
    return privateCheckoutJson({ ok: true }, { headers: { "Set-Cookie": guestSessionCookie(result.token) } });
  } catch { return privateCheckoutJson({ ok: false, error: "Unavailable." }, { status: 503 }); }
}
