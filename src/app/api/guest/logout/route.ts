import { privateCheckoutJson } from "@/modules/checkout/private-response";
import { assertGuestAccountsAvailable, assertGuestSameOrigin, guestSessionCookie, revokeGuestSession } from "@/modules/guests/server/auth";

export async function POST(request: Request) {
  try { assertGuestAccountsAvailable(); } catch { return privateCheckoutJson({ ok: false, error: "Not available." }, { status: 503 }); }
  if (!assertGuestSameOrigin(request)) return privateCheckoutJson({ ok: false, error: "Invalid request." }, { status: 403 });
  try { await revokeGuestSession(request); return privateCheckoutJson({ ok: true }, { headers: { "Set-Cookie": guestSessionCookie("", 0) } }); }
  catch { return privateCheckoutJson({ ok: false, error: "Unavailable." }, { status: 503 }); }
}
