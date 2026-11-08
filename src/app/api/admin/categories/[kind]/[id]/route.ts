import { assertSameOrigin, getSession } from "@/modules/auth/server/auth";
import { parseCategoryId, parseCategoryKind } from "@/modules/categories/category-fields";
import { categoryFailure, deleteCategory, updateCategory } from "@/modules/categories/server/category-admin";
import { body, listingFailure, listingReply } from "@/modules/listings/server/listing-admin-http";

type Context = { params: Promise<{ kind: string; id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    if (!assertSameOrigin(request)) return listingReply(403, { error: "Origin not allowed" });
    const actor = await getSession(request);
    if (!actor) return listingReply(401, { error: "Session invalid" });
    const { kind: rawKind, id: rawId } = await context.params;
    const kind = parseCategoryKind(rawKind);
    const id = parseCategoryId(rawId);
    if (!kind || !id) return listingReply(404, { error: "Not found" });
    const data = await body(request);
    if (data instanceof Response) return data;
    return listingReply(200, { category: await updateCategory(actor, kind, id, data) });
  } catch (error) { return listingFailure(categoryFailure(error)); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    if (!assertSameOrigin(request)) return listingReply(403, { error: "Origin not allowed" });
    const actor = await getSession(request);
    if (!actor) return listingReply(401, { error: "Session invalid" });
    const { kind: rawKind, id: rawId } = await context.params;
    const kind = parseCategoryKind(rawKind);
    const id = parseCategoryId(rawId);
    if (!kind || !id) return listingReply(404, { error: "Not found" });
    await deleteCategory(actor, kind, id);
    return listingReply(200, { deleted: true });
  } catch (error) { return listingFailure(categoryFailure(error)); }
}
