"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
type Post={id:number;title:string;slug:string;publication:unknown|null};
export default function BlogAdmin() {
 const [posts,setPosts]=useState<Post[]>([]),[error,setError]=useState("");const router=useRouter();
 useEffect(()=>{fetch("/api/blog/admin/posts").then(async r=>{if(r.status===401){router.replace("/admin/blog/login");return null;}if(!r.ok)throw Error("No se pudo cargar el listado.");return r.json();}).then(data=>{if(data)setPosts(data);}).catch(e=>setError(e.message));},[router]);
 async function create(){const r=await fetch("/api/blog/admin/posts",{method:"POST"});if(!r.ok){setError("No se pudo crear el borrador.");return;}const p=await r.json();router.push(`/admin/blog/${p.id}`);}
 async function logout(){await fetch("/api/blog/admin/logout",{method:"POST"});router.replace("/admin/blog/login");}
 return <main className="min-h-screen bg-[#f4f5f2] p-6 md:p-12"><header className="mx-auto flex max-w-5xl items-start justify-between"><div><p className="text-xs uppercase tracking-[.22em] text-[#6c776c]">Mesa editorial</p><h1 className="mt-3 text-4xl">Artículos</h1></div><button onClick={logout} className="rounded border px-4 py-2">Cerrar sesión</button></header><section className="mx-auto mt-10 max-w-5xl rounded-2xl bg-white p-6 shadow-sm"><div className="flex justify-between"><h2 className="m-0 text-xl">Borradores y publicaciones</h2><button onClick={create} className="rounded bg-[#394342] px-4 py-2 text-white">Nuevo artículo</button></div>{error&&<p role="alert" className="mt-4 text-red-800">{error}</p>}<ul className="mt-5 divide-y">{posts.map(p=><li key={p.id} className="flex items-center justify-between py-4"><div><p className="m-0 font-medium">{p.title||"Sin título"}</p><p className="m-0 mt-1 text-sm text-gray-500">{p.publication?"Publicado":"Borrador"} · {p.slug}</p></div><Link className="rounded border px-4 py-2" href={`/admin/blog/${p.id}`}>Editar</Link></li>)}</ul>{!posts.length&&!error&&<p className="mt-5">Aún no hay artículos. Crea uno para empezar.</p>}</section></main>;
}
