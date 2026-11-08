import { assertSameOrigin, getSession } from "@/modules/auth/server/auth";
import { parseCategoryKind } from "@/modules/categories/category-fields";
import { categoryFailure, createCategory, listCategories } from "@/modules/categories/server/category-admin";
import { body, listingFailure, listingReply } from "@/modules/listings/server/listing-admin-http";

type Context = { params: Promise<{ kind: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await getSession(request);
    if (!actor) return listingReply(401, { error: "Session invalid" });
    const kind = parseCategoryKind((await context.params).kind);
    if (!kind) return listingReply(404, { error: "Not found" });
    return listingReply(200, { categories: await listCategories(actor, kind) });
  } catch (error) { return listingFailure(categoryFailure(error)); }
}

export async function POST(request: Request, context: Context) {
  try {
    if (!assertSameOrigin(request)) return listingReply(403, { error: "Origin not allowed" });
    const actor = await getSession(request);
    if (!actor) return listingReply(401, { error: "Session invalid" });
    const kind = parseCategoryKind((await context.params).kind);
    if (!kind) return listingReply(404, { error: "Not found" });
    const data = await body(request);
    if (data instanceof Response) return data;
    const category = await createCategory(actor, kind, data);
    return listingReply(201, { category });
  } catch (error) { return listingFailure(categoryFailure(error)); }
}
