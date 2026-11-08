// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import CategoryManager from "../category-manager";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));

it("explains that a concurrently-used category cannot be deleted", async () => {
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Categories in use cannot be deleted." }), { status: 409, headers: { "content-type": "application/json" } })));
  render(<CategoryManager kind="blog" categories={[{ id: 1, name: "Guías", slug: "guias", usageCount: 0 }]} />);

  fireEvent.click(screen.getAllByRole("button", { name: /EliminarGuías/ })[0]);

  const alert = await screen.findByRole("alert");
  expect(alert.textContent?.toLowerCase()).toContain("no se puede eliminar");
  expect(alert.textContent).toContain("contenido asociado");
  expect(alert.textContent).not.toContain("slug");
});
