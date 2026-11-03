"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Logout() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/logout", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo confirmar el cierre en todos los dispositivos. Vuelve a iniciar sesión para intentarlo de nuevo.");
      router.replace("/admin/login");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cerrar la sesión.");
      setBusy(false);
    }
  }

  return <div className="mt-8">
    <button type="button" disabled={busy} onClick={logout} className="rounded-full border border-current px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2">Cerrar todas mis sesiones</button>
    {error && <p role="alert" className="mt-2">{error}</p>}
  </div>;
}
