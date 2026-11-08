import { privateCheckoutJson } from "@/modules/checkout/private-response";
import { assertGuestAccountsAvailable, assertGuestSameOrigin, guestSessionCookie } from "@/modules/guests/server/auth";
import { loginGuest } from "@/modules/guests/server/accounts";

export async function POST(request: Request) {
  try { assertGuestAccountsAvailable(); } catch { return privateCheckoutJson({ ok: false, error: "Not available." }, { status: 503 }); }
  if (!assertGuestSameOrigin(request)) return privateCheckoutJson({ ok: false, error: "Invalid request." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return privateCheckoutJson({ ok: false, error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !["email", "password"].every((key) => typeof (body as Record<string, unknown>)[key] === "string")) return privateCheckoutJson({ ok: false, error: "Invalid request." }, { status: 400 });
  try {
    const { email, password } = body as { email: string; password: string };
    const result = await loginGuest(email, password);
    if (!result.token) return privateCheckoutJson({ ok: false, error: "Invalid email or password." }, { status: 401 });
    return privateCheckoutJson({ ok: true }, { headers: { "Set-Cookie": guestSessionCookie(result.token) } });
  } catch { return privateCheckoutJson({ ok: false, error: "Unavailable." }, { status: 503 }); }
}
