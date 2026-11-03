import { redirect } from "next/navigation";
import { getSession } from "@/modules/auth/server/auth";
import BlogEditor from "@/modules/content/client/blog-editor";
export const dynamic = "force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}) {
 const actor=await getSession();
 if(!actor)redirect("/admin/login");
 if(actor.role!=="ADMIN" && actor.role!=="EDITOR")redirect("/admin");
 return <BlogEditor id={(await params).id} canPublish={actor.role==="ADMIN"}/>;
}
