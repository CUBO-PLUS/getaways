"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/atoms/ui/button";
import { Input } from "@/components/atoms/ui/input";
import { Label } from "@/components/atoms/ui/label";
import PhoneNumberField from "@/components/molecules/PhoneNumberField";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/account";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/account";
    if (/^\/listing\/[^/]+\/?$/.test(url.pathname)) return url.pathname + url.search;
    if (url.pathname === "/account") return "/account";
    if (url.pathname === "/assistant" && !url.search) return "/assistant";
    if (url.pathname === "/checkout" && /^\?session_id=[A-Za-z0-9_-]+$/.test(url.search)) return url.pathname + url.search;
  } catch { /* invalid URL */ }
  return "/account";
}

export default function GuestAuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const notice = params.get("notice") === "login-required";
  const login = mode === "login";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    if (!login) {
      const password = String(data.get("password") ?? "");
      if (password.length < 12 || new TextEncoder().encode(password).length > 72) { setError("Use at least 12 characters and at most 72 UTF-8 bytes."); setBusy(false); return; }
      // Same rule as the server; a clear message instead of its generic "Invalid account details."
      if (phone && (phone.length > 32 || !/^\+?[0-9 ()-]{6,}$/.test(phone))) { setError("Check the phone number, or leave it empty."); setBusy(false); return; }
    }
    try {
      const response = await fetch(`/api/guest/${login ? "login" : "register"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        // The phone widget is controlled, so its value is added here; leaving it empty is allowed.
        body: JSON.stringify(login ? Object.fromEntries(data) : { ...Object.fromEntries(data), ...(phone ? { phone } : {}) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) { setError(result?.error ?? "Could not sign in. Please try again."); return; }
      router.replace(safeReturnTo(params.get("returnTo")));
      router.refresh();
    } catch { setError("Connection problem. Please try again."); }
    finally { setBusy(false); }
  }

  return <section className="mx-auto max-w-lg">
    <h1 className="font-heading text-3xl text-heading">{login ? "Sign in" : "Create your account"}</h1>
    <p className="mt-2 text-body-text">Use your account to manage your stays and payments.</p>
    {notice && <p className="mt-4 rounded-lg bg-accent/10 p-3 text-sm text-heading" role="status">Sign in to continue your reservation. Your dates will remain on the listing.</p>}
    <noscript><p>Enable JavaScript to sign in or create a guest account.</p></noscript>
    <form method="post" action={`/api/guest/${login ? "login" : "register"}`} onSubmit={submit} className="mt-6 grid gap-4 rounded-lg border border-border bg-background p-6">
      {!login && <div className="grid gap-1.5 text-sm font-semibold"><Label htmlFor="name">Name</Label><Input id="name" name="name" autoComplete="name" required maxLength={120} /></div>}
      <div className="grid gap-1.5 text-sm font-semibold"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
      {!login && <div className="grid gap-1.5 text-sm font-semibold"><Label htmlFor="phone">Phone <span className="font-normal text-muted-text">(optional)</span></Label><PhoneNumberField id="phone" value={phone} onChange={setPhone} /></div>}
      <div className="grid gap-1.5 text-sm font-semibold"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete={login ? "current-password" : "new-password"} required minLength={login ? undefined : 12} maxLength={72} /></div>
      {!login && <p className="m-0 text-xs text-muted-text">At least 12 characters; at most 72 UTF-8 bytes. Password recovery is not available yet.</p>}
      {error && <p role="alert" className="m-0 text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? "Please wait…" : login ? "Sign in" : "Create account"}</Button>
    </form>
    <p className="mt-5 text-sm text-body-text">{login ? <>New here? <Link href={`/account/register${params.get("returnTo") ? `?returnTo=${encodeURIComponent(params.get("returnTo")!)}` : ""}`}>Create an account</Link></> : <>Already have an account? <Link href={`/account/login${params.get("returnTo") ? `?returnTo=${encodeURIComponent(params.get("returnTo")!)}` : ""}`}>Sign in</Link></>}</p>
    {process.env.NODE_ENV !== "production" && <p className="mt-4 text-xs text-muted-text">Local environment only: checkout/payment status shown in your account is not production payment certification. Mock payments are not real payments.</p>}
  </section>;
}

export function GuestLogoutButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/guest/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) { setError("Could not sign out. Try again."); return; }
      router.replace("/"); router.refresh();
    } catch { setError("Connection problem. Please try again."); }
    finally { setBusy(false); }
  }
  return <span><button type="button" onClick={() => void logout()} disabled={busy} className="rounded-full border border-border px-5 py-2 text-sm">{busy ? "Signing out…" : "Sign out"}</button>{error && <span role="alert" className="ml-2 text-sm text-red-700">{error}</span>}</span>;
}
