import { revalidatePath, revalidateTag } from "next/cache";
import { assertSameOrigin, isBlogAdmin } from "@/modules/content/server/blog-auth";
import { BlogConflict, publishBlogDraft } from "@/modules/content/server/blog-operations";
import { parseBlogId } from "@/modules/content/blog-ids";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!assertSameOrigin(request)) return new Response(null, { status: 403 });
    if (!(await isBlogAdmin(request))) return new Response(null, { status: 401 });
    const idText = (await params).id;
    const id = parseBlogId(idText);
    if (id === null) return new Response(null, { status: 404 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !Number.isSafeInteger((body as { version?: unknown }).version)) return Response.json({ error: "invalid_input" }, { status: 400 });
    const publication = await publishBlogDraft(id, (body as { version: number }).version);
    if (!publication) return new Response(null, { status: 404 });
    revalidatePath("/blog");
    revalidateTag("blog-publications", "max");
    revalidatePath(`/blog/${publication.slug}`);
    return Response.json(publication, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof BlogConflict) return Response.json({ error: "version_conflict", currentVersion: error.currentVersion }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof Error && error.message.startsWith("Invalid blog document:")) return Response.json({ error: "invalid_input", message: error.message }, { status: 400 });
    console.error("Blog publication failed", error);
    return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
