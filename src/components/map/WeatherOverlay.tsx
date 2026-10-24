"use client";

import { useEffect, useRef } from "react";
import { FREE_MAP_CONFIG } from "./config";

/** Animated rain, snow or mud tint drawn over the map. Purely visual; clicks pass through. */
export default function WeatherOverlay({ weather }: { weather?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const { rainDrops, snowFlakes, rainSpeed, snowSpeed } = FREE_MAP_CONFIG.weather;
    const parts: { x: number; y: number; s: number }[] = [];
    let last = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== w || el.height !== h) [el.width, el.height] = [w, h];
      ctx.clearRect(0, 0, w, h);

      if (weather === "mud") {
        ctx.fillStyle = "rgba(120, 70, 40, 0.12)";
        ctx.fillRect(0, 0, w, h);
      } else if (weather === "wet" || weather === "snow") {
        const want = weather === "wet" ? rainDrops : snowFlakes;
        while (parts.length < want) parts.push({ x: Math.random() * w, y: Math.random() * h, s: 0.5 + Math.random() });
        parts.length = want;
        for (const p of parts) {
          if (weather === "wet") {
            p.y += rainSpeed * p.s * dt;
            p.x -= 120 * p.s * dt;
            ctx.strokeStyle = "rgba(120, 185, 240, 0.7)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 3, p.y - 14 * p.s);
            ctx.stroke();
          } else {
            p.y += snowSpeed * p.s * dt;
            p.x += Math.sin((p.y + p.s * 100) / 40) * 0.4;
            ctx.fillStyle = "rgba(225, 235, 245, 0.8)";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.2 + p.s * 1.3, 0, Math.PI * 2);
            ctx.fill();
          }
          if (p.y > h + 20) [p.y, p.x] = [-20, Math.random() * w];
          if (p.x < -20) p.x = w + 10;
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [weather]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}
    />
  );
}
