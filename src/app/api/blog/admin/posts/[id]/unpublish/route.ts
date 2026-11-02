import { revalidatePath, revalidateTag } from "next/cache";
import { assertSameOrigin, isBlogAdmin } from "@/modules/content/server/blog-auth";
import { BlogConflict, unpublishBlogDraft } from "@/modules/content/server/blog-operations";
import { parseBlogId } from "@/modules/content/blog-ids";
import { blogPostPath } from "@/modules/content/paths";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!assertSameOrigin(request)) return new Response(null, { status: 403 });
    if (!(await isBlogAdmin(request))) return new Response(null, { status: 401 });
    const idText = (await params).id;
    const id = parseBlogId(idText);
    if (id === null) return new Response(null, { status: 404 });
    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: "invalid_input" }, { status: 400 }); }
    if (!body || typeof body !== "object" || !Number.isSafeInteger((body as { version?: unknown }).version)) return Response.json({ error: "invalid_input" }, { status: 400 });
    const result = await unpublishBlogDraft(id, (body as { version: number }).version);
    if (!result) return new Response(null, { status: 404 });
    if (result.publishedAt) revalidatePath(blogPostPath(result.publishedAt.toString(), result.slug));
    revalidatePath("/blog");
    revalidateTag("blog-publications", "max");
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof BlogConflict) return Response.json({ error: "version_conflict", currentVersion: error.currentVersion }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    if (error instanceof TypeError) return Response.json({ error: "invalid_input" }, { status: 400 });
    console.error("Blog unpublish failed", error);
    return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
