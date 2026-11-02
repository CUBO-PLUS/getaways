// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { expect, it, vi } from "vitest";
import { EditorFloatingPanel } from "../client/editor-floating-panel";

it("moves by keyboard and pointer, closes on Escape, and restores focus", async () => {
  const returnFocusRef = createRef<HTMLElement>();
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  returnFocusRef.current = trigger;
  const onClose = vi.fn();
  const { unmount } = render(<EditorFloatingPanel title="Imagen" onClose={onClose} returnFocusRef={returnFocusRef}>Opciones</EditorFloatingPanel>);

  const dialog = await screen.findByRole("dialog", { name: "Imagen" });
  const mover = screen.getByRole("button", { name: /Arrastra para mover/ });
  Object.defineProperty(mover, "setPointerCapture", { value: vi.fn() });
  fireEvent.keyDown(mover, { key: "ArrowLeft" });
  expect(dialog.style.left).toBeTruthy();
  expect(dialog.style.right).toBe("");

  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ left: 40, top: 50, right: 240, bottom: 250, width: 200, height: 200, x: 40, y: 50, toJSON: () => ({}) });
  fireEvent.pointerDown(mover, { button: 0, pointerId: 1, clientX: 45, clientY: 55 });
  fireEvent.pointerMove(mover, { pointerId: 1, clientX: 75, clientY: 85 });
  fireEvent.pointerUp(mover, { pointerId: 1 });
  expect(dialog.style.left).toBe("70px");
  expect(dialog.style.top).toBe("80px");

  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  unmount();
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  trigger.remove();
});
