import { answerWithRag } from "@/modules/rag/agent";
import { privateCheckoutJson } from "@/modules/checkout/private-response";
import { assertGuestAccountsAvailable, assertGuestSameOrigin, getGuestSession, GuestAccountsUnavailableError } from "@/modules/guests/server/auth";
import { reserveLoginAttempt } from "@/modules/auth/server/login-throttle";

const MAX_BODY_BYTES = 12_000;

async function readBoundedBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new RangeError();
  if (!request.body) throw new SyntaxError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function POST(request: Request) {
  try {
    assertGuestAccountsAvailable();
    if (!assertGuestSameOrigin(request)) return privateCheckoutJson({ error: "Invalid request." }, { status: 403 });
    const guest = await getGuestSession(request);
    if (!guest) return privateCheckoutJson({ error: "Your session has expired. Sign in again to continue." }, { status: 401 });
    let body: unknown;
    try { body = await readBoundedBody(request); }
    catch (error) { return privateCheckoutJson({ error: error instanceof RangeError ? "Request too large." : "Invalid request." }, { status: error instanceof RangeError ? 413 : 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return privateCheckoutJson({ error: "Invalid request." }, { status: 400 });
    const { question, history } = body as Record<string, unknown>;
    if (typeof question !== "string" || (history !== undefined && !Array.isArray(history))) return privateCheckoutJson({ error: "Invalid request." }, { status: 400 });

    const retryAfter = await reserveLoginAttempt(request, `rag-account:${guest.id}`);
    if (retryAfter) return privateCheckoutJson({ error: "Too many questions. Try again later." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    const result = await answerWithRag({ question, history: history as Array<{ role: "user" | "assistant"; content: string }> | undefined });
    return privateCheckoutJson(result);
  } catch (error) {
    if (error instanceof GuestAccountsUnavailableError) return privateCheckoutJson({ error: "Guest accounts are unavailable." }, { status: 503 });
    return privateCheckoutJson({ error: "I couldn't complete that question. Please try again." }, { status: 503 });
  }
}
