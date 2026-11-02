// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import BlogEditor from "../client/blog-editor";

vi.mock("next/navigation", () => {
  const router = { push: vi.fn(), replace: vi.fn() };
  return { useRouter: () => router };
});
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href as string} {...props}>{children}</a> }));

const content = (text: string, firstAlt = "Primera", secondAlt = "Segunda") => ({
  type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: `Antes ${text}` }] },
    { type: "image", attrs: { mediaId: "11", alt: firstAlt, decorative: false, caption: null } },
    { type: "paragraph", content: [{ type: "text", text: "Entre imágenes" }] },
    { type: "image", attrs: { mediaId: "12", alt: secondAlt, decorative: false, caption: null } },
    { type: "paragraph", content: [{ type: "text", text: "Después" }] },
  ],
});
const draft = (overrides: Record<string, unknown> = {}) => ({
  id: 4, slug: "articulo", title: "Artículo", excerpt: "Resumen", document: content("vecino"), documentSchemaVersion: 1,
  coverMediaId: null, coverAlt: null, seoTitle: null, seoDescription: null, version: 7, categories: [],
  publication: { publishedAt: "2025-01-01T00:00:00.000Z" }, firstPublishedAt: "2025-01-01T00:00:00.000Z", hasUnpublishedChanges: false,
  ...overrides,
});
const publishableDraft = (overrides: Record<string, unknown> = {}) => draft({ document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Contenido suficiente para publicar." }] }] }, ...overrides });
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const loadedFetch = (value = draft()) => vi.fn((input: RequestInfo | URL) => String(input).endsWith("categories") ? json([]) : json(value));
async function openEditor(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const rendered = render(<BlogEditor id="4" />);
  await screen.findByRole("textbox", { name: "Contenido del artículo" });
  return rendered;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("edits and removes the targeted image while keeping surrounding text and allowing keyboard image review", async () => {
  const fetchMock = loadedFetch(draft({ document: content("vecino", "Alt uno", "Alt dos") }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  const { unmount } = await openEditor(fetchMock);
  const editor = screen.getByRole("textbox", { name: "Contenido del artículo" });
  fireEvent.click(screen.getByRole("button", { name: /Revisar imágenes/ }));
  let panel = screen.getByRole("dialog", { name: "Revisar imágenes del artículo" });
  fireEvent.click(within(panel).getByRole("button", { name: /Imagen 1/ }));
  panel = await screen.findByRole("dialog", { name: "Editar imagen del artículo" });
  fireEvent.change(within(panel).getByLabelText(/Texto alternativo/), { target: { value: "Alt editado primero" } });
  fireEvent.change(within(panel).getByLabelText(/Pie de foto/), { target: { value: "Pie primero" } });
  expect(screen.getByRole("dialog", { name: "Editar imagen del artículo" })).toBeTruthy();

  fireEvent.click(within(panel).getByRole("button", { name: /Cerrar Editar imagen/ }));
  fireEvent.click(screen.getByRole("button", { name: /Revisar imágenes/ }));
  panel = screen.getByRole("dialog", { name: "Revisar imágenes del artículo" });
  fireEvent.click(within(panel).getByRole("button", { name: /Imagen 2/ }));
  panel = screen.getByRole("dialog", { name: "Editar imagen del artículo" });
  expect(within(panel).getByText(/archivo #12/)).toBeTruthy();
  expect((within(panel).getByLabelText(/Texto alternativo/) as HTMLTextAreaElement).value).toBe("Alt dos");
  fireEvent.click(within(panel).getByRole("button", { name: /Quitar esta imagen/ }));
  expect(within(editor).getAllByRole("img")).toHaveLength(1);
  expect(editor.textContent).toContain("Antes vecino");
  expect(editor.textContent).toContain("Entre imágenes");
  expect(editor.textContent).toContain("Después");

  fireEvent.click(screen.getByRole("button", { name: /Revisar imágenes/ }));
  panel = screen.getByRole("dialog", { name: "Revisar imágenes del artículo" });
  expect(within(panel).getByRole("button", { name: /Imagen 1.*Alt editado primero/ })).toBeTruthy();
  fireEvent.click(within(panel).getByRole("button", { name: /Imagen 1/ }));
  expect(screen.getByRole("dialog", { name: "Editar imagen del artículo" })).toBeTruthy();
  expect((within(screen.getByRole("dialog", { name: "Editar imagen del artículo" })).getByLabelText(/Pie de foto/) as HTMLInputElement).value).toBe("Pie primero");
  unmount();
});

it("keeps article history separate from loading and saving while supporting keyboard undo and redo", async () => {
  // jsdom has no Range geometry; ProseMirror scrolls to the restored selection on undo.
  const geometry = ["getClientRects", "getBoundingClientRect"].map(name => [name, Object.getOwnPropertyDescriptor(Range.prototype, name)] as const);
  for (const [name] of geometry) Object.defineProperty(Range.prototype, name, { configurable: true, value: () => name === "getClientRects" ? [new DOMRect()] : new DOMRect() });
  onTestFinished(() => {
    for (const [name, descriptor] of geometry) {
      if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
      else Reflect.deleteProperty(Range.prototype, name);
    }
  });
  const initial = publishableDraft();
  let savedVersion = initial.version;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => init?.method === "PUT"
    ? json({ version: ++savedVersion, hasUnpublishedChanges: true })
    : String(input).endsWith("categories") ? json([]) : json(initial));
  const { unmount } = await openEditor(fetchMock);
  const editor = screen.getByRole("textbox", { name: "Contenido del artículo" });
  const undo = screen.getByRole("button", { name: "Deshacer" }) as HTMLButtonElement;
  const redo = screen.getByRole("button", { name: "Rehacer" }) as HTMLButtonElement;

  await waitFor(() => expect(undo.disabled).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Insertar separador de secciones" }));
  expect(editor.querySelector("hr")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Guardar ahora" }));
  await screen.findByText("Borrador guardado");

  fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
  expect(editor.querySelector("hr")).toBeNull();
  expect(undo.disabled).toBe(true);
  expect(redo.disabled).toBe(false);
  expect((screen.getByRole("button", { name: "Guardar ahora" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Guardar ahora" }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2));
  const undoneSave = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")[1]?.[1];
  expect(JSON.parse(String(undoneSave?.body))).toMatchObject({ version: 8 });
  expect(JSON.parse(String(undoneSave?.body)).document.content).not.toContainEqual({ type: "horizontalRule" });

  fireEvent.keyDown(editor, { key: "z", ctrlKey: true, shiftKey: true });
  expect(editor.querySelector("hr")).toBeTruthy();
  fireEvent.click(undo);
  expect(editor.querySelector("hr")).toBeNull();
  unmount();
});

it("serializes saves, blocks publishing while dirty, publishes saved version, and preserves state on rejection", async () => {
  const initial = publishableDraft();
  let resolveFirst!: (response: Response) => void;
  let resolveSecond!: (response: Response) => void;
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("categories")) return json([]);
    if (init?.method === "PUT") {
      requests.push({ url, init });
      return new Promise<Response>(resolve => { if (requests.length === 1) resolveFirst = resolve; else resolveSecond = resolve; });
    }
    if (url.endsWith("/publish")) { requests.push({ url, init }); return json({ publication: initial.publication, hasUnpublishedChanges: false, firstPublishedAt: initial.firstPublishedAt }, 400); }
    return json(initial);
  });
  const { unmount } = await openEditor(fetchMock);
  fireEvent.change(screen.getByPlaceholderText("Escribe el título de tu artículo"), { target: { value: "Título uno" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar ahora" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  fireEvent.change(screen.getByPlaceholderText("Escribe el título de tu artículo"), { target: { value: "Título dos" } });
  expect((screen.getByRole("button", { name: "Actualizar publicación" }) as HTMLButtonElement).disabled).toBe(true);
  act(() => resolveFirst(new Response(JSON.stringify({ version: 8, hasUnpublishedChanges: true }), { status: 200 })));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(JSON.parse(String(requests[1].init?.body))).toMatchObject({ version: 8, title: "Título dos" });
  act(() => resolveSecond(new Response(JSON.stringify({ version: 9, hasUnpublishedChanges: true }), { status: 200 })));
  await waitFor(() => expect((screen.getByRole("button", { name: "Guardar ahora" }) as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Actualizar publicación" }));
  await screen.findByRole("alert");
  expect(JSON.parse(String(requests[2].init?.body))).toEqual({ version: 9 });
  expect((screen.getByRole("button", { name: "Actualizar publicación" }) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByPlaceholderText("Escribe el título de tu artículo") as HTMLInputElement).value).toBe("Título dos");
  expect(screen.getByText("Publicado · cambios guardados sin publicar")).toBeTruthy();
  unmount();
});

it("reconciles a lost publication response without discarding edits made while publishing", async () => {
  const initial = publishableDraft();
  let resolvePublish!: (response: Response) => void;
  let getCount = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("categories")) return json([]);
    if (url.endsWith("/publish")) return new Promise<Response>(resolve => { resolvePublish = resolve; });
    if (url === "/api/blog/admin/posts/4" && ++getCount === 2) return json({ ...initial, title: "Servidor viejo", version: 7, publication: { publishedAt: "2026-01-01T00:00:00.000Z" }, firstPublishedAt: "2025-01-01T00:00:00.000Z", hasUnpublishedChanges: true });
    return json(initial);
  });
  const { unmount } = await openEditor(fetchMock);
  fireEvent.click(screen.getByRole("button", { name: "Actualizar publicación" }));
  await waitFor(() => expect(resolvePublish).toBeTypeOf("function"));
  fireEvent.change(screen.getByPlaceholderText("Escribe el título de tu artículo"), { target: { value: "Edición durante la publicación" } });
  act(() => resolvePublish(new Response("", { status: 500 })));
  expect(await screen.findByText(/no se confirmó/i)).toBeTruthy();
  expect((screen.getByPlaceholderText("Escribe el título de tu artículo") as HTMLInputElement).value).toBe("Edición durante la publicación");
  expect(screen.getByText("Publicado · cambios locales sin publicar")).toBeTruthy();
  unmount();
});

it("keeps the editor mounted while switching to the protected full-page preview", async () => {
  const initial = draft({ coverMediaId: 21, coverAlt: "Portada original" });
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => init?.method === "PUT"
    ? json({ version: 8, hasUnpublishedChanges: true })
    : String(input).endsWith("categories")
    ? json([{ id: 3, name: "Cultura" }])
    : json(initial));
  const { unmount, container } = await openEditor(fetchMock);
  vi.stubGlobal("requestAnimationFrame", vi.fn(callback => { callback(0); return 0; }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect());
  const editor = screen.getByRole("textbox", { name: "Contenido del artículo" });
  expect(screen.getByRole("tablist", { name: "Opciones del artículo" })).toBeTruthy();
  const tabs = screen.getAllByRole("tab");
  expect(tabs).toHaveLength(4);
  expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  const excerpt = screen.getByLabelText(/^Resumen del artículo/) as HTMLTextAreaElement;
  expect(screen.getByLabelText("Dirección del artículo (slug)")).toBeTruthy();
  fireEvent.change(excerpt, { target: { value: "Resumen actualizado" } });
  fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "Categorías (0)" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  expect(screen.getByRole("tabpanel", { name: "Categorías (0)" })).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Cultura"));
  fireEvent.keyDown(screen.getByRole("tab", { name: "Categorías (1)" }), { key: "ArrowRight" });
  fireEvent.change(screen.getByLabelText(/Texto alternativo de la portada/), { target: { value: "Alt nuevo" } });
  fireEvent.keyDown(screen.getByRole("tab", { name: "Portada" }), { key: "End" });
  expect(screen.getByRole("tab", { name: "Buscadores \(SEO\)" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(screen.getByRole("tab", { name: "Buscadores (SEO)" }), { key: "Home" });
  expect(screen.getByRole("tab", { name: /Categorías \(1\)/ }).getAttribute("tabindex")).toBe("-1");
  expect(screen.getByLabelText(/^Resumen del artículo/)).toHaveProperty("value", "Resumen actualizado");
  expect(screen.getByLabelText("Dirección del artículo (slug)")).toBeTruthy();
  expect(container.querySelector("#cover-alt")).toHaveProperty("value", "Alt nuevo");
  editor.focus();
  fireEvent.click(screen.getByRole("button", { name: "Insertar separador de secciones" }));
  expect((screen.getByRole("button", { name: "Vista previa" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Guardar ahora" }));
  await waitFor(() => expect(screen.getByText("Borrador guardado")).toBeTruthy());
  const saveRequest = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
  const saved = JSON.parse(String(saveRequest?.[1]?.body));
  expect(saved).toMatchObject({ excerpt: "Resumen actualizado", coverAlt: "Alt nuevo", categoryIds: [3] });
  expect(saved.document.content).toContainEqual({ type: "horizontalRule" });
  const callsBeforePreview = fetchMock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));

  expect(screen.getByTitle("Vista previa del artículo: Artículo").getAttribute("src")).toBe("/admin/blog/4/preview");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("toolbar", { name: "Formato del texto" })).toBeNull();
  expect(container.querySelector("#excerpt")?.closest("[hidden]")).toBeTruthy();
  expect(container.querySelector('[aria-label="Contenido del artículo"]')).toBe(editor);
  fireEvent.click(screen.getByRole("button", { name: "Volver a editar" }));

  expect(container.querySelector('[aria-label="Contenido del artículo"]')).toBe(editor);
  expect(screen.getByLabelText(/^Resumen del artículo/)).toBeTruthy();
  expect(fetchMock.mock.calls).toHaveLength(callsBeforePreview);
  unmount();
});

it("publishes a draft, preserves its first publication and slug through confirmed withdrawal", async () => {
  const publishedAt = "2026-04-03T12:30:00.000Z";
  const firstPublication = { postId: 4, slug: "articulo", publishedAt, title: "Artículo" };
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>((input) => {
    const url = String(input);
    if (url.endsWith("categories")) return json([]);
    if (url.endsWith("/publish")) return json({ publication: firstPublication, firstPublishedAt: publishedAt, hasUnpublishedChanges: false });
    if (url.endsWith("/unpublish")) return json({ publication: null, firstPublishedAt: publishedAt, hasUnpublishedChanges: false });
    return json(publishableDraft({ publication: null, firstPublishedAt: null }));
  });
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal("confirm", confirm);
  const { unmount } = await openEditor(fetchMock);

  fireEvent.click(screen.getByRole("button", { name: "Publicar artículo" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/publish"))).toBe(true));
  const publishRequest = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/publish"));
  expect(JSON.parse(String(publishRequest?.[1]?.body))).toEqual({ version: 7 });
  expect(screen.getByRole("button", { name: "Actualizar publicación" })).toBeTruthy();
  expect(screen.getByText("Publicado · versión guardada al día")).toBeTruthy();

  expect((screen.getByLabelText("Dirección del artículo (slug)") as HTMLInputElement).disabled).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: /Retirar del sitio público/ }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/unpublish"))).toBe(false);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: /Retirar del sitio público/ }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/unpublish"))).toBe(true));
  const unpublishRequest = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/unpublish"));
  expect(JSON.parse(String(unpublishRequest?.[1]?.body))).toEqual({ version: 7 });
  expect(screen.getByRole("button", { name: "Publicar artículo" })).toBeTruthy();
  expect((screen.getByPlaceholderText("Escribe el título de tu artículo") as HTMLInputElement).value).toBe("Artículo");
  expect(screen.getByText("Borrador · no publicado")).toBeTruthy();
  expect((screen.getByLabelText("Dirección del artículo (slug)") as HTMLInputElement).disabled).toBe(true);
  unmount();
});
