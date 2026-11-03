// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Login from "@/modules/auth/client/login";
import BlogLogin from "@/modules/content/client/blog-login";
import PasswordForm from "@/modules/users/client/password-form";
import UsersPanel from "@/modules/users/client/users-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function expectSafeForm(form: HTMLFormElement | null, action: string) {
  expect(form).not.toBeNull();
  expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
  expect(form?.getAttribute("action")).toBe(action);
}

it("renders credential forms with safe native submission before hydration", () => {
  for (const [element, action] of [
    [<Login key="login" />, "/api/admin/login"],
    [<BlogLogin key="blog-login" />, "/api/blog/admin/login"],
    [<PasswordForm key="password" />, "/api/admin/account/password"],
    [<UsersPanel key="users" currentUserId={1} />, "/api/admin/users"],
  ] as const) {
    const document = new DOMParser().parseFromString(renderToString(element), "text/html");
    expectSafeForm(document.querySelector("form"), action);
  }
});

it("keeps user edit and password reset forms safe for native submission", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [
    { id: 2, name: "Editora", email: "editora@example.com", role: "EDITOR", active: true },
  ] }));
  render(<UsersPanel currentUserId={1} />);
  fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  expectSafeForm(screen.getByRole("button", { name: "Guardar cambios" }).closest("form"), "/api/admin/users/2");
  fireEvent.click(screen.getByRole("button", { name: "Restablecer contraseña" }));
  expectSafeForm(screen.getByRole("button", { name: "Restablecer" }).closest("form"), "/api/admin/users/2/reset-password");
});
