"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Building } from "../lib/city/layout";
import { createRenderer } from "../lib/city/render";
import type { RenderState } from "../lib/city/render";

const SWEEP_PERIOD = 45000;
const SWEEP_LENGTH = 6500;
/** ~2s time constant — growth reads as breathing, never as a reward */
const GROWTH_TC = 2000;

export function City({
  buildings,
  camX,
  scale,
  intro,
  focus,
  matches,
  onHover,
  onOpen,
  onPan,
}: {
  buildings: Building[];
  camX: number;
  scale: number;
  /** page sets this true once; the city then draws itself in */
  intro: boolean;
  focus: string | null;
  matches: Set<string> | null;
  onHover: (file: string | null, x: number, y: number) => void;
  onOpen: (file: string) => void;
  /** pan in world units (drag) */
  onPan: (dxWorld: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null);
  const stateRef = useRef<{ buildings: Building[]; camX: number; scale: number; focus: string | null; matches: Set<string> | null }>({
    buildings,
    camX,
    scale,
    focus,
    matches,
  });
  const displayH = useRef(new Map<string, number>());
  const introStartRef = useRef<number | null>(null);
  const introDoneRef = useRef(false);
  const sweepStartRef = useRef<number>(-1);
  const hoverRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const dragRef = useRef<{ x: number; moved: boolean; t: number } | null>(null);

  useEffect(() => {
    stateRef.current = { buildings, camX, scale, focus, matches };
  }, [buildings, camX, scale, focus, matches]);

  const buildState = useCallback((now: number): { state: RenderState; animating: boolean } => {
    const { buildings: bs, camX: cx, scale: sc, focus: fc, matches: mt } = stateRef.current;
    let animating = false;

    // intro progress
    let introP = 1;
    if (introStartRef.current !== null && !introDoneRef.current) {
      introP = Math.min(1, (now - introStartRef.current) / 1300);
      if (introP >= 1) introDoneRef.current = true;
      else animating = true;
    } else if (introStartRef.current === null) {
      introP = 0;
    }

    // growth easing toward target heights; the generous dt cap keeps easing
    // converging even when rAF is throttled to sparse frames
    const dt = Math.min(600, now - lastFrameRef.current);
    lastFrameRef.current = now;
    const k = 1 - Math.exp(-dt / GROWTH_TC);
    const eased: Building[] = bs.map((b) => {
      let current = displayH.current.get(b.file);
      if (current === undefined) {
        current = introDoneRef.current ? 0 : b.h;
        displayH.current.set(b.file, current);
      }
      if (Math.abs(b.h - current) > 0.15) {
        current += (b.h - current) * k;
        displayH.current.set(b.file, current);
        animating = true;
      } else if (current !== b.h) {
        current = b.h;
        displayH.current.set(b.file, current);
      }
      return current === b.h ? b : { ...b, h: current };
    });

    // sweep
    let sweep = -1;
    if (sweepStartRef.current >= 0) {
      const p = (now - sweepStartRef.current) / SWEEP_LENGTH;
      if (p >= 1) sweepStartRef.current = -1;
      else {
        sweep = p * 1.15 - 0.075;
        animating = true;
      }
    }

    return {
      state: {
        buildings: eased,
        camera: { x: cx, scale: sc },
        sweep,
        intro: introP,
        focus: fc,
        matches: mt,
        hover: hoverRef.current,
      },
      animating,
    };
  }, []);

  const loop = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const step = (now: number) => {
      const { state, animating } = buildState(now);
      renderer.draw(state);
      // rAF self-throttles in hidden tabs, so keep scheduling while animated;
      // only a truly still city stops the loop completely.
      if (animating) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(step);
  }, [buildState]);

  const drawOnce = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const { state, animating } = buildState(performance.now());
    renderer.draw(state);
    if (animating) loop(); // something is still moving — hand off to the loop
  }, [buildState, loop]);

  /* renderer lifecycle */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    rendererRef.current = createRenderer(canvas);
    lastFrameRef.current = performance.now();
    const observer = new ResizeObserver(() => drawOnce());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rendererRef.current = null;
    };
  }, [drawOnce]);

  /* intro trigger */
  useEffect(() => {
    if (!intro || introStartRef.current !== null) return;
    introStartRef.current = performance.now();
    loop();
  }, [intro, loop]);

  /* sweep scheduler — a survey passes every 45s */
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      sweepStartRef.current = performance.now();
      loop();
    }, SWEEP_PERIOD);
    const onVisible = () => {
      if (!document.hidden) loop(); // resume anything that froze while hidden
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loop]);

  /* redraw (and possibly re-animate) when data or camera changes */
  useEffect(() => {
    if (!introStartRef.current) return;
    loop();
  }, [buildings, camX, scale, focus, matches, loop]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) return;
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;

      const drag = dragRef.current;
      if (drag) {
        const dx = event.clientX - drag.x;
        if (Math.abs(dx) > 3) drag.moved = true;
        if (drag.moved) {
          dragRef.current = { ...drag, x: event.clientX };
          onPan(-dx / stateRef.current.scale);
        }
        return;
      }

      const { state } = buildState(performance.now());
      const hit = renderer.hitTest(px, py, state);
      if (hit !== hoverRef.current) {
        hoverRef.current = hit;
        onHover(hit, event.clientX, event.clientY);
        drawOnce();
      } else if (hit) {
        onHover(hit, event.clientX, event.clientY);
      }
    },
    [buildState, drawOnce, onHover, onPan],
  );

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, moved: false, t: Date.now() };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || drag.moved) return;
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) return;
      const rect = canvas.getBoundingClientRect();
      const { state } = buildState(performance.now());
      const hit = renderer.hitTest(event.clientX - rect.left, event.clientY - rect.top, state);
      if (hit && !hit.startsWith("demo/")) onOpen(hit);
    },
    [buildState, onOpen],
  );

  const onPointerLeave = useCallback(() => {
    dragRef.current = null;
    if (hoverRef.current !== null) {
      hoverRef.current = null;
      onHover(null, 0, 0);
      drawOnce();
    }
  }, [drawOnce, onHover]);

  return (
    <canvas
      ref={canvasRef}
      className="city-canvas"
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      aria-label="Your city of notes"
      role="img"
    />
  );
}
