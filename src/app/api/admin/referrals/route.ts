import { createAdminReferralCode } from "@/modules/referrals/referral-admin";
import { authorize, ok, readBody, reply } from "@/modules/users/server/http";

export async function POST(request: Request) {
  try {
    const actor = await authorize(request, true);
    if (actor instanceof Response) return actor;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const result = await createAdminReferralCode(actor, body.code);
    if (!result.created) return reply(409, "Ese código de referido ya existe.");
    return ok({ code: result.code, active: result.active }, 201);
  } catch (error) {
    return error instanceof RangeError
      ? reply(400, "Usa entre 4 y 24 letras, números o guiones.")
      : reply(503, "No se pudo crear el código. Inténtalo de nuevo.");
  }
}
