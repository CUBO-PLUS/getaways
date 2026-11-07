"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Images, MapPin, Search, SlidersHorizontal, Tags, X, ZoomIn } from "lucide-react";
import { AMENITY_KEYS, type AmenityKey } from "@/modules/listings/listing-admin-fields";
import type { ListingStatus, StaffListingDetail } from "@/modules/listings/server/listing-admin";
import ListingDescriptionEditor from "./listing-description-editor";

type LibraryImage = { id: number; name: string; width: number; height: number; defaultAlt: string | null };
type GalleryItem = { mediaId: number; alt: string; decorative: boolean; roomGroup: string; name: string };
type Notice = { kind: "error" | "success"; text: string } | null;
type Section = "content" | "gallery" | "commercial" | "seo" | "status";

const AMENITY_LABELS: Record<AmenityKey, string> = {
  beachaccess: "Acceso a la playa", elevator: "Ascensor", oceanview: "Vista al mar", hammocks: "Hamacas", gym: "Gimnasio",
  firepit: "Fogata", swimmingpool: "Piscina", wifi: "WiFi", tv: "TV", hotwater: "Agua caliente", airconditioning: "Aire acondicionado",
};
const STATUS_LABELS: Record<ListingStatus, string> = { active: "A la venta", inactive: "Inactivo (no aparece en el sitio)", archived: "Archivado (retirado de la venta)" };

// Form text <-> stored units. Invalid text becomes undefined so the form can say so before sending.
const fromCents = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
const toCents = (text: string) => (text.trim() === "" ? null : /^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text.trim()) * 100) : undefined);
const fromBasisPoints = (points: number | null) => (points === null ? "" : String(points / 100));
const toBasisPoints = toCents;
const fromCount = (value: number | null) => (value === null ? "" : String(value));
const toCount = (text: string) => (text.trim() === "" ? null : /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined);
const fromSeconds = (seconds: number | null) =>
  seconds === null ? "" : `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
const toSeconds = (text: string) => {
  if (!text) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 : undefined;
};

function NoticeText({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <p role={notice.kind === "error" ? "alert" : "status"} className={notice.kind === "error" ? "text-red-700" : "text-green-800"}>{notice.text}</p>;
}

export default function ListingEditor({ listing, library, admin }: { listing: StaffListingDetail; library: LibraryImage[]; admin: boolean }) {
  const router = useRouter();
  const [version, setVersion] = useState(listing.version);
  const [status, setStatus] = useState(listing.status);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notices, setNotices] = useState<Record<Section, Notice>>({ content: null, gallery: null, commercial: null, seo: null, status: null });
  const [activeTab, setActiveTab] = useState<Section>("content");
  const [preview, setPreview] = useState<GalleryItem | null>(null);
  const tabs = [
    { id: "content", label: "Contenido", icon: MapPin },
    { id: "gallery", label: "Galería", icon: Images },
    { id: "commercial", label: "Tarifas y capacidad", icon: SlidersHorizontal },
    { id: "seo", label: "SEO", icon: Search },
    ...(admin ? [{ id: "status", label: "Publicación", icon: Tags } as const] : []),
  ] as const;

  const content = listing.content;
  const [title, setTitle] = useState(content.title);
  const [description, setDescription] = useState(content.description);
  const [seoTitle, setSeoTitle] = useState(content.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(content.seoDescription ?? "");
  const [location, setLocation] = useState(content.location ?? "");
  const [building, setBuilding] = useState(content.building ?? "");
  const [bedrooms, setBedrooms] = useState(fromCount(content.bedrooms));
  const [bathrooms, setBathrooms] = useState(fromCount(content.bathrooms));
  const [parking, setParking] = useState(fromCount(content.parking));
  const [videoUrl, setVideoUrl] = useState(content.videoUrl ?? "");
  const [amenities, setAmenities] = useState<Set<AmenityKey>>(new Set(content.amenities));
  const [categoryIds, setCategoryIds] = useState<Set<number>>(new Set(content.categoryIds));
  const [coverMediaId, setCoverMediaId] = useState<number | null>(content.coverMediaId);
  const [gallery, setGallery] = useState<GalleryItem[]>(content.gallery.map((item) => ({
    mediaId: item.mediaId, alt: item.decorative ? "" : item.alt, decorative: item.decorative, roomGroup: item.roomGroup ?? "", name: item.name,
  })));
  const [pick, setPick] = useState("");
  const [uploading, setUploading] = useState(false);

  const c = listing.commercial;
  const [price, setPrice] = useState(fromCents(c.pricePerNightCents));
  const [cleaning, setCleaning] = useState(fromCents(c.cleaningFeeCents));
  const [extraGuest, setExtraGuest] = useState(fromCents(c.extraGuestFeeCents));
  const [petFee, setPetFee] = useState(fromCents(c.petFeeCents));
  const [iva, setIva] = useState(fromBasisPoints(c.ivaBasisPoints));
  const [tourism, setTourism] = useState(fromBasisPoints(c.tourismBasisPoints));
  const [maxGuests, setMaxGuests] = useState(fromCount(c.maxGuests));
  const [baseGuests, setBaseGuests] = useState(fromCount(c.baseGuests));
  const [petsAllowed, setPetsAllowed] = useState(c.petsAllowed === null ? "" : c.petsAllowed ? "yes" : "no");
  const [minStay, setMinStay] = useState(fromCount(c.minStayNights));
  const [checkIn, setCheckIn] = useState(fromSeconds(c.checkInSeconds));
  const [checkOut, setCheckOut] = useState(fromSeconds(c.checkOutSeconds));

  const notify = (section: Section, notice: Notice) => setNotices((current) => ({ ...current, [section]: notice }));

  /** Sends one operation; keeps every local edit on failure. Returns the parsed body on success. */
  async function send(section: Section, path: string, method: "PATCH" | "DELETE", payload: object): Promise<Record<string, unknown> | null> {
    setNotices({ content: null, gallery: null, commercial: null, seo: null, status: null });
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/listings/${listing.id}${path}`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (response.status === 409) setConflict(true);
      if (response.status === 401) {
        notify(section, { kind: "error", text: "Tu sesión terminó. Inicia sesión en otra pestaña y vuelve a guardar: tus cambios siguen aquí." });
        return null;
      }
      if (!response.ok) {
        notify(section, { kind: "error", text: typeof result?.error === "string" ? result.error : "No se pudo guardar. Tus cambios siguen aquí." });
        return null;
      }
      if (typeof result?.version === "number") setVersion(result.version);
      return result ?? {};
    } catch {
      notify(section, { kind: "error", text: "No se pudo conectar. Tus cambios siguen aquí; inténtalo de nuevo." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (description.length > 200_000) {
      notify("content", { kind: "error", text: "La descripción supera el máximo de 200.000 caracteres. Acorta el contenido antes de guardar." });
      return;
    }
    const counts = { bedrooms: toCount(bedrooms), bathrooms: toCount(bathrooms), parking: toCount(parking) };
    if (Object.values(counts).some((value) => value === undefined)) {
      notify("content", { kind: "error", text: "Dormitorios, baños y estacionamientos deben ser números enteros." });
      return;
    }
    const result = await send("content", "/content", "PATCH", {
      version, title, description, location: location.trim() || null, building: building.trim() || null, ...counts,
      videoUrl: videoUrl.trim() || null, amenities: [...amenities], categoryIds: [...categoryIds],
    });
    if (result) notify("content", { kind: "success", text: status === "active" ? "Guardado. Los cambios ya se ven en el sitio público." : "Guardado." });
  }

  async function saveGallery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await send("gallery", "/content", "PATCH", {
      version, coverMediaId,
      gallery: gallery.map((item) => ({ mediaId: item.mediaId, alt: item.decorative ? "" : item.alt, decorative: item.decorative, roomGroup: item.roomGroup.trim() || null })),
    });
    if (result) notify("gallery", { kind: "success", text: "Galería y portada guardadas." });
  }

  async function saveSeo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await send("seo", "/content", "PATCH", { version, seoTitle: seoTitle.trim() || null, seoDescription: seoDescription.trim() || null });
    if (result) notify("seo", { kind: "success", text: "SEO guardado. Se aplicará en la ficha pública del hospedaje." });
  }

  function changeTabWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(tabs[next].id);
    document.getElementById(`listing-tab-${tabs[next].id}`)?.focus();
  }

  async function saveCommercial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = {
      pricePerNightCents: toCents(price), cleaningFeeCents: toCents(cleaning), extraGuestFeeCents: toCents(extraGuest), petFeeCents: toCents(petFee),
      ivaBasisPoints: toBasisPoints(iva), tourismBasisPoints: toBasisPoints(tourism), maxGuests: toCount(maxGuests), baseGuests: toCount(baseGuests),
      petsAllowed: petsAllowed === "" ? null : petsAllowed === "yes", minStayNights: toCount(minStay),
      checkInSeconds: toSeconds(checkIn), checkOutSeconds: toSeconds(checkOut),
    };
    if (Object.values(values).some((value) => value === undefined)) {
      notify("commercial", { kind: "error", text: "Revisa los valores: importes con hasta dos decimales, porcentajes con hasta dos decimales y cantidades enteras." });
      return;
    }
    const result = await send("commercial", "/commercial", "PATCH", { version, ...values });
    if (result) notify("commercial", { kind: "success", text: "Guardado. Las reservas existentes conservan su precio y condiciones; las nuevas usan estos valores." });
  }

  async function changeStatus(action: "activate" | "deactivate" | "archive" | "restore") {
    let confirmed: boolean | undefined;
    if (action === "archive") {
      confirmed = window.confirm(`¿Archivar «${title}»? Se retira de la venta y deja de aparecer en el sitio. Sus reservas y recibos se conservan, y los pagos ya abiertos se siguen procesando.`);
      if (!confirmed) return;
    }
    const result = await send("status", "/status", "PATCH", confirmed === undefined ? { version, action } : { version, action, confirmed });
    if (result && typeof result.status === "string") {
      setStatus(result.status as ListingStatus);
      notify("status", { kind: "success", text: `Estado: ${STATUS_LABELS[result.status as ListingStatus]}.` });
    }
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar definitivamente «${title}»? Esta acción no se puede deshacer. Las imágenes se quedan en la biblioteca.`)) return;
    const result = await send("status", "", "DELETE", { version, confirmed: true });
    if (result) router.push("/admin/listings");
  }

  function move(index: number, offset: number) {
    setGallery((items) => {
      const target = index + offset;
      if (target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  const updateItem = (index: number, change: Partial<GalleryItem>) =>
    setGallery((items) => items.map((item, position) => (position === index ? { ...item, ...change } : item)));

  function addImage(image: { id: number; name: string; defaultAlt?: string | null }) {
    setGallery((items) => (items.some((item) => item.mediaId === image.id) ? items
      : [...items, { mediaId: image.id, alt: image.defaultAlt ?? "", decorative: false, roomGroup: "", name: image.name }]));
    if (coverMediaId === null) setCoverMediaId(image.id);
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    notify("gallery", null);
    try {
      const form = new FormData();
      form.set("file", file);
      // The shared media upload (ADMIN and EDITOR): same byte, size and dimension checks as the blog.
      const response = await fetch("/api/blog/media", { method: "POST", body: form });
      const result = await response.json().catch(() => null) as { id?: number } | null;
      if (!response.ok || typeof result?.id !== "number") {
        notify("gallery", { kind: "error", text: response.status === 415 ? "Usa una imagen JPEG, PNG o WebP válida." : response.status === 413 ? "La imagen supera 10 MB." : "No se pudo subir la imagen." });
        return;
      }
      addImage({ id: result.id, name: file.name });
      notify("gallery", { kind: "success", text: "Imagen subida. Escribe su texto alternativo y guarda para añadirla a la ficha." });
    } catch {
      notify("gallery", { kind: "error", text: "No se pudo conectar para subir la imagen." });
    } finally {
      setUploading(false);
    }
  }

  const available = library.filter((image) => !gallery.some((item) => item.mediaId === image.id));
  const input = "mt-2 block min-h-11 min-w-0 w-full rounded-lg border border-[rgba(7,36,86,.16)] bg-white px-3 py-2 font-body text-[14px] text-[#394342] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0277bd] disabled:bg-[#f4f5f2]";
  const primaryButton = "min-h-11 justify-self-start rounded-full bg-[#394342] px-5 font-body text-[14px] font-medium text-white disabled:cursor-wait disabled:opacity-50";
  const secondaryButton = "min-h-11 rounded-full border border-slate-300 px-4 font-body text-[14px] text-[#394342] hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="mt-5 grid min-w-0 gap-5 font-body text-[14px] text-[#394342] [&_label]:min-w-0 [&_label]:font-body [&_label]:text-[14px] [&_label]:text-[#394342] [&_button]:font-body [&_button]:text-[14px] [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-[#0277bd] [&_legend]:font-heading [&_legend]:text-[16px] [&_legend]:font-medium [&_legend]:text-[#394342] [&_input[type=checkbox]]:size-4 [&_input[type=checkbox]]:accent-[#394342] [&_input[type=radio]]:size-4 [&_input[type=radio]]:accent-[#394342]">
      <header className="rounded-2xl border border-[rgba(7,36,86,.075)] bg-white p-5 shadow-[0_5px_30px_rgba(7,36,86,.045)] sm:p-7">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[.14em] text-[#687371]">Administración · Hospedaje #{listing.id}</p>
        <h1 className="m-0 font-heading text-[30px] font-medium leading-tight text-[#394342] sm:text-[36px]">{title || "Hospedaje sin título"}</h1>
        <p className="mb-0 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[#596260]"><span className={`rounded-full px-3 py-1 text-[12px] font-medium ${status === "active" ? "bg-[#eaf3eb] text-[#356b40]" : status === "archived" ? "bg-[#f0efed] text-[#686d6a]" : "bg-[#fff4df] text-[#795a1d]"}`}>{STATUS_LABELS[status]}</span><span className="font-mono text-[12px]">/listing/{listing.slug}</span>
          {status === "active" && <a className="font-body text-[14px] font-medium text-[#394342] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#0277bd]" href={`/listing/${listing.slug}`} target="_blank" rel="noreferrer">Ver ficha pública</a>}</p>
        {conflict && (
          <p role="alert" className="mt-3 border border-red-700 p-3">
            Otra persona guardó cambios en este hospedaje. Tus cambios siguen en esta página; cópialos si los necesitas y{" "}
            <button type="button" className="underline" onClick={() => window.location.reload()}>recarga la versión actual</button>.
          </p>
        )}
      </header>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-[rgba(7,36,86,.075)] bg-white shadow-[0_5px_30px_rgba(7,36,86,.045)]" aria-label="Editor del hospedaje">
        <div className="relative overflow-x-auto border-b border-slate-200">
          <div role="tablist" aria-label="Secciones del hospedaje" className="flex min-w-max sm:min-w-0">
            {tabs.map(({ id, label, icon: Icon }, index) => <button
              key={id} type="button" role="tab" id={`listing-tab-${id}`} aria-controls={`listing-panel-${id}`}
              aria-selected={activeTab === id} tabIndex={activeTab === id ? 0 : -1}
              onClick={() => setActiveTab(id)} onKeyDown={event => changeTabWithKeyboard(event, index)}
              className={`inline-flex min-h-14 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-none border-r border-b-[3px] border-r-slate-200 px-5 font-body text-sm font-medium last:border-r-0 focus-visible:-outline-offset-4 ${activeTab === id ? "border-b-[#394342] bg-[#edf2ee] text-[#394342]" : "border-b-transparent bg-[#f8f9f7] text-[#596260] hover:bg-[#eef1ed]"}`}
            ><Icon size={16} aria-hidden /><span>{label}{id === "gallery" ? ` (${gallery.length})` : ""}</span></button>)}
          </div>
        </div>
      <div role="tabpanel" id="listing-panel-content" aria-labelledby="listing-tab-content" hidden={activeTab !== "content"} tabIndex={0}>
      <form method="post" onSubmit={saveContent} className="grid gap-5 p-5 sm:p-7" aria-labelledby="content-heading">
        <div><p className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.12em] text-[#687371]"><MapPin size={14} aria-hidden="true" />Ficha del alojamiento</p><h2 id="content-heading" className="m-0 font-heading text-[22px] font-medium text-[#394342]">Contenido descriptivo</h2></div>
        <label>Título<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className={input} /></label>
        <div><p className="m-0 mb-2 text-sm font-medium text-[#394342]">Descripción</p><ListingDescriptionEditor initialContent={content.description} onChange={setDescription} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Ubicación<input maxLength={120} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="El Zonte, La Libertad" className={input} /></label>
          <label>Edificio o comunidad<input maxLength={120} value={building} onChange={(event) => setBuilding(event.target.value)} className={input} /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>Dormitorios<input inputMode="numeric" value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} className={input} /></label>
          <label>Baños<input inputMode="numeric" value={bathrooms} onChange={(event) => setBathrooms(event.target.value)} className={input} /></label>
          <label>Estacionamientos<input inputMode="numeric" value={parking} onChange={(event) => setParking(event.target.value)} className={input} /></label>
        </div>
        <label>Vídeo de YouTube<input type="url" maxLength={500} value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" className={input} /></label>
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend>Comodidades</legend>
          <div className="grid gap-1 sm:grid-cols-3">
            {AMENITY_KEYS.map((key) => (
              <label key={key} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={amenities.has(key)} onChange={(event) => setAmenities((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(key); else next.delete(key);
                  return next;
                })} />
                {AMENITY_LABELS[key]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend><span className="flex items-center gap-2"><Tags size={15} aria-hidden="true" />Categorías</span></legend>
          {listing.categories.map((category) => (
            <label key={category.id} className="mr-4 inline-flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={categoryIds.has(category.id)} onChange={(event) => setCategoryIds((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(category.id); else next.delete(category.id);
                return next;
              })} />
              {category.name}
            </label>
          ))}
        </fieldset>

        <NoticeText notice={notices.content} />
        <button disabled={busy} className={primaryButton}>{busy ? "Guardando…" : "Guardar contenido"}</button>
      </form>
      </div>

      <div role="tabpanel" id="listing-panel-gallery" aria-labelledby="listing-tab-gallery" hidden={activeTab !== "gallery"} tabIndex={0}>
      <form method="post" onSubmit={saveGallery} className="grid min-w-0 gap-5 p-5 sm:p-7" aria-labelledby="gallery-heading">
        <div><h2 id="gallery-heading" className="m-0 font-heading text-[22px] font-medium text-[#394342]">Galería y portada</h2><p className="m-0 mt-2 text-sm leading-6">Haz clic en una imagen para revisarla en tamaño grande. Usa las flechas para cambiar su orden.</p></div>
        <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3 sm:p-4">
          <legend><span className="flex items-center gap-2"><Images size={15} aria-hidden="true" />Galería y portada</span></legend>
          <p className="text-sm">Cada imagen necesita un texto alternativo informativo o marcarse como decorativa. Quitar una imagen de la galería no la borra de la biblioteca.</p>
          <ol className="m-0 mt-3 grid list-none gap-4 p-0">
            {gallery.map((item, index) => (
            <li key={item.mediaId} className="grid min-w-0 gap-3 rounded-xl border border-[rgba(7,36,86,.075)] bg-slate-50/50 p-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                <button type="button" aria-label={`Ampliar imagen ${index + 1}: ${item.name || `Imagen ${item.mediaId}`}`} aria-haspopup="dialog" className="group relative self-start overflow-hidden rounded-lg bg-slate-100" onClick={() => setPreview(item)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private admin preview served by the media route */}
                  <img src={`/api/media/${item.mediaId}`} alt="" className="h-32 w-full object-cover sm:w-30" loading="lazy" />
                  <span className="absolute bottom-1 right-1 flex size-8 items-center justify-center rounded-full bg-white/95 text-[#394342] shadow-sm"><ZoomIn aria-hidden className="size-4" /></span>
                </button>
                <div className="grid min-w-0 gap-2">
                  <p className="m-0 break-all text-sm">{index + 1}. {item.name || `Imagen ${item.mediaId}`}</p>
                  <label>Texto alternativo
                    <input maxLength={500} value={item.alt} disabled={item.decorative} onChange={(event) => updateItem(index, { alt: event.target.value })} className={input} />
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={item.decorative} onChange={(event) => updateItem(index, { decorative: event.target.checked, alt: event.target.checked ? "" : item.alt })} />
                    Decorativa (no transmite información)
                  </label>
                  <label>Habitación o grupo (opcional)
                    <input maxLength={80} value={item.roomGroup} onChange={(event) => updateItem(index, { roomGroup: event.target.value })} placeholder="Dormitorio principal" className={input} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="cover" checked={coverMediaId === item.mediaId} onChange={() => setCoverMediaId(item.mediaId)} />
                      Portada
                    </label>
                    <button type="button" className={`${secondaryButton} inline-flex items-center gap-2`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden />Subir<span className="sr-only"> imagen {index + 1}</span></button>
                    <button type="button" className={`${secondaryButton} inline-flex items-center gap-2`} disabled={index === gallery.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden />Bajar<span className="sr-only"> imagen {index + 1}</span></button>
                    <button type="button" className={secondaryButton} onClick={() => {
                      setGallery((items) => items.filter((_, position) => position !== index));
                      if (coverMediaId === item.mediaId) setCoverMediaId(null);
                    }}>Quitar de la galería<span className="sr-only"> imagen {index + 1}</span></button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {gallery.length === 0 && <p>La galería está vacía.</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>Añadir desde la biblioteca
              <span className="flex min-w-0 items-end gap-2">
                <select value={pick} onChange={(event) => setPick(event.target.value)} className={input}>
                  <option value="">Elige una imagen…</option>
                  {available.map((image) => <option key={image.id} value={image.id}>{image.name} ({image.width}×{image.height})</option>)}
                </select>
                <button type="button" className={secondaryButton} disabled={!pick} onClick={() => {
                  const image = library.find((candidate) => candidate.id === Number(pick));
                  if (image) addImage(image);
                  setPick("");
                }}>Añadir</button>
              </span>
            </label>
            <label>Subir imagen nueva (JPEG, PNG o WebP, hasta 10 MB)
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} className={input} />
            </label>
          </div>
        </fieldset>
        <NoticeText notice={notices.gallery} />
        <button disabled={busy || uploading} className={primaryButton}>{busy ? "Guardando…" : "Guardar galería"}</button>
      </form>
      </div>

      <div role="tabpanel" id="listing-panel-commercial" aria-labelledby="listing-tab-commercial" hidden={activeTab !== "commercial"} tabIndex={0}>
      <section aria-labelledby="commercial-heading" className="p-5 sm:p-7">
        <p className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.12em] text-[#687371]"><SlidersHorizontal size={14} aria-hidden="true" />Gestión comercial</p><h2 id="commercial-heading" className="m-0 font-heading text-[22px] font-medium text-[#394342]">Precios y condiciones</h2>
        {admin ? (
          <form onSubmit={saveCommercial} className="mt-4 grid gap-4">
            <p className="text-sm">Los cambios solo afectan a reservas nuevas: las existentes conservan la tarifa, cargos, impuestos y condiciones con que se crearon.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>Precio por noche (USD)<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className={input} /></label>
              <label>Limpieza (USD)<input inputMode="decimal" value={cleaning} onChange={(event) => setCleaning(event.target.value)} className={input} /></label>
              <label>Cargo por huésped extra, por noche (USD)<input inputMode="decimal" value={extraGuest} onChange={(event) => setExtraGuest(event.target.value)} className={input} /></label>
              <label>Cargo por mascota, por estancia (USD)<input inputMode="decimal" value={petFee} onChange={(event) => setPetFee(event.target.value)} className={input} /></label>
              <label>IVA (%)<input inputMode="decimal" value={iva} onChange={(event) => setIva(event.target.value)} className={input} /></label>
              <label>Impuesto de turismo (%)<input inputMode="decimal" value={tourism} onChange={(event) => setTourism(event.target.value)} className={input} /></label>
              <label>Capacidad máxima (huéspedes)<input inputMode="numeric" value={maxGuests} onChange={(event) => setMaxGuests(event.target.value)} className={input} /></label>
              <label>Huéspedes incluidos en el precio<input inputMode="numeric" value={baseGuests} onChange={(event) => setBaseGuests(event.target.value)} className={input} /></label>
              <label>Mascotas
                <select value={petsAllowed} onChange={(event) => setPetsAllowed(event.target.value)} className={input}>
                  <option value="">Sin definir</option>
                  <option value="yes">Permitidas</option>
                  <option value="no">No permitidas</option>
                </select>
              </label>
              <label>Estancia mínima (noches)<input inputMode="numeric" value={minStay} onChange={(event) => setMinStay(event.target.value)} className={input} /></label>
              <label>Hora de entrada<input type="time" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className={input} /></label>
              <label>Hora de salida<input type="time" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className={input} /></label>
            </div>
            <NoticeText notice={notices.commercial} />
            <button disabled={busy} className={primaryButton}>{busy ? "Guardando…" : "Guardar precios y condiciones"}</button>
          </form>
        ) : (
          <div className="mt-3">
            <p className="text-sm">Solo un administrador puede cambiar estos valores.</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt>Precio por noche</dt><dd>{price ? `USD ${price}` : "Sin definir"}</dd>
              <dt>Capacidad máxima</dt><dd>{maxGuests || "Sin definir"}</dd>
              <dt>Estancia mínima</dt><dd>{minStay ? `${minStay} noches` : "Sin definir"}</dd>
            </dl>
          </div>
        )}
      </section>
      </div>

      <div role="tabpanel" id="listing-panel-seo" aria-labelledby="listing-tab-seo" hidden={activeTab !== "seo"} tabIndex={0}>
        <form method="post" onSubmit={saveSeo} aria-labelledby="seo-heading" className="grid gap-5 p-5 sm:p-7">
          <div><h2 id="seo-heading" className="m-0 font-heading text-[22px] font-medium text-[#394342]">Visibilidad en buscadores</h2><p className="m-0 mt-2 text-sm leading-6">Opcional, como en el blog. Si dejas los campos vacíos, se usan el título del hospedaje y su descripción automática.</p></div>
          <label>Título en buscadores<input maxLength={200} value={seoTitle} placeholder={title} onChange={event => setSeoTitle(event.target.value)} className={input} /><span className="mt-1 block text-xs text-slate-500">{seoTitle.length}/200 caracteres · Recomendado: alrededor de 60.</span></label>
          <label>Descripción en buscadores<textarea rows={4} maxLength={500} value={seoDescription} onChange={event => setSeoDescription(event.target.value)} className={input} /><span className="mt-1 block text-xs text-slate-500">{seoDescription.length}/500 caracteres · Recomendado: entre 140 y 160.</span></label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Vista previa orientativa en buscadores"><p className="m-0 break-all text-xs text-slate-500">Getaways El Salvador · /listing/{listing.slug}</p><p className="m-0 mt-2 break-words font-heading text-lg text-[#0277bd]">{seoTitle.trim() || title}</p><p className="m-0 mt-1 break-words text-sm leading-6">{seoDescription.trim() || "Se usará la descripción automática de ubicación, capacidad y características del hospedaje."}</p></div>
          <NoticeText notice={notices.seo} />
          <button disabled={busy} className={primaryButton}>{busy ? "Guardando…" : "Guardar SEO"}</button>
        </form>
      </div>

      {admin && (
        <div role="tabpanel" id="listing-panel-status" aria-labelledby="listing-tab-status" hidden={activeTab !== "status"} tabIndex={0}>
        <section aria-labelledby="status-heading" className="grid gap-3 p-5 sm:p-7">
          <p className="mb-0 text-[11px] font-medium uppercase tracking-[.12em] text-[#687371]">Visibilidad y conservación</p><h2 id="status-heading" className="m-0 font-heading text-[22px] font-medium text-[#394342]">Publicación y ciclo de vida</h2>
          <p>Estado actual: <strong>{STATUS_LABELS[status]}</strong>.</p>
          <div className="flex flex-wrap gap-3">
            {status === "inactive" && <button type="button" disabled={busy} className={primaryButton} onClick={() => void changeStatus("activate")}>Poner a la venta</button>}
            {status === "active" && <button type="button" disabled={busy} className={secondaryButton} onClick={() => void changeStatus("deactivate")}>Retirar de la venta</button>}
            {status !== "archived" && <button type="button" disabled={busy} className={secondaryButton} onClick={() => void changeStatus("archive")}>Archivar…</button>}
            {status === "archived" && <button type="button" disabled={busy} className={secondaryButton} onClick={() => void changeStatus("restore")}>Restaurar (queda inactivo)</button>}
          </div>
          <p className="text-sm">Desactivar o archivar quita el hospedaje del sitio y de las reservas nuevas. No cancela estancias ya pagadas ni borra su historial.</p>
          <div className="mt-3 border-t pt-3">
            {listing.bookings ? (
              <p className="text-sm">Este hospedaje tiene {listing.bookings} {listing.bookings === 1 ? "reserva" : "reservas"}, así que no puede eliminarse: archívalo para conservar su historial.</p>
            ) : (
              <button type="button" disabled={busy} className="min-h-11 rounded-full border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50" onClick={() => void remove()}>Eliminar definitivamente…</button>
            )}
          </div>
          <NoticeText notice={notices.status} />
        </section>
        </div>
      )}
        <p className="m-0 border-t border-slate-200 bg-[#f8f9f7] px-5 py-3 text-xs leading-5 text-slate-500 sm:px-7">Cada pestaña se guarda por separado. Cambiar de pestaña conserva tus ediciones.</p>
      </section>
      {preview && <GalleryPreview image={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function GalleryPreview({ image, onClose }: { image: GalleryItem; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
      element?.close();
    };
  }, []);

  return <dialog ref={dialog} aria-labelledby="gallery-preview-heading" onClose={event => { if (!event.currentTarget.open) onClose(); }} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="fixed inset-0 m-auto max-h-[92dvh] w-[min(72rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-2xl bg-white p-0 text-[#394342] shadow-2xl backdrop:bg-black/75">
    <div>
      <header className="flex items-center justify-between gap-4 p-4"><h2 id="gallery-preview-heading" className="m-0 min-w-0 break-words font-heading text-base font-medium">{image.name || `Imagen ${image.mediaId}`}</h2><button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Cerrar vista ampliada" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[#394342] focus-visible:outline-2 focus-visible:outline-[#0277bd]"><X aria-hidden className="size-5" /></button></header>
      {/* eslint-disable-next-line @next/next/no-img-element -- full private gallery image, no public optimizer */}
      <img src={`/api/media/${image.mediaId}`} alt={image.alt || image.name || "Vista ampliada del hospedaje"} className="block max-h-[72dvh] w-full bg-slate-950 object-contain" />
      <p className="m-0 px-4 py-3 font-body text-xs leading-5 text-slate-500">Pulsa Escape o cierra la ventana para volver a la galería.</p>
    </div>
  </dialog>;
}
