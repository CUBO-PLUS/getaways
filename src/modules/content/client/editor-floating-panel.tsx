"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function EditorFloatingPanel({ title, onClose, children, returnFocusRef }: Props) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    const target = returnFocusRef?.current;
    return () => {
      requestAnimationFrame(() => {
        if (target?.isConnected && document.activeElement === document.body) target.focus();
      });
    };
  }, [returnFocusRef]);

  useEffect(() => {
    if (!mounted) return;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mounted]);

  useEffect(() => {
    if (!position) return;
    const clamp = () => setPosition(current => current ? ({
      x: Math.max(0, Math.min(current.x, window.innerWidth - (panelRef.current?.offsetWidth ?? 0))),
      y: Math.max(0, Math.min(current.y, window.innerHeight - (panelRef.current?.offsetHeight ?? 0))),
    }) : null);
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [position]);

  function moveTo(x: number, y: number) {
    const panel = panelRef.current;
    if (!panel) return;
    setPosition({
      x: Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth)),
      y: Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight)),
    });
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = panelRef.current!.getBoundingClientRect();
    setPosition({ x: rect.left, y: rect.top });
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent<HTMLButtonElement>) {
    const active = dragRef.current;
    if (active?.pointerId === event.pointerId) moveTo(event.clientX - active.offsetX, event.clientY - active.offsetY);
  }

  if (!mounted) return null;
  return createPortal(
    <section
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}
      className="fixed z-50 flex max-h-[min(80vh,40rem)] w-[min(28rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-[#d8ded8] bg-white text-[#394342] shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-[#394342]"
      style={position ? { left: position.x, top: position.y } : { right: "1rem", bottom: "1rem" }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[#e5e9e5] bg-[#f8f9f7] px-4 py-3">
        <button
          type="button"
          aria-label={`${title}. Arrastra para mover; usa las flechas para mover el panel.`}
          onPointerDown={startDrag}
          onPointerMove={drag}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
          onKeyDown={event => {
            const offsets: Record<string, [number, number]> = { ArrowUp: [0, -16], ArrowDown: [0, 16], ArrowLeft: [-16, 0], ArrowRight: [16, 0] };
            const offset = offsets[event.key];
            if (!offset) return;
            event.preventDefault();
            const rect = panelRef.current!.getBoundingClientRect();
            moveTo((position?.x ?? rect.left) + offset[0], (position?.y ?? rect.top) + offset[1]);
          }}
          className="min-w-0 flex-1 cursor-move touch-none select-none text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#394342]"
        >
          <span id={titleId}>{title}</span>
          <span className="block text-xs font-normal text-slate-500">Arrastra aquí para mover · o usa las flechas</span>
        </button>
        <button type="button" onClick={onClose} aria-label={`Cerrar ${title}`} className="rounded px-2 py-1 text-lg leading-none hover:bg-[#e9ede8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#394342]">×</button>
      </header>
      <div className="min-h-0 overflow-y-auto p-4">{children}</div>
    </section>,
    document.body,
  );
}
