"use client";

import { useEffect, useRef } from "react";

/**
 * لایه‌های تزئینی پس‌زمینه:
 *  ۱) شبکهٔ محو (CSS)
 *  ۲) دو هالهٔ طلایی بلور شده (CSS)
 *  ۳) بوم «شبکهٔ ذرات» متحرک (این کامپوننت)
 *
 * روی موبایل تعداد ذرات کمتر است، هنگام مخفی بودن تب متوقف می‌شود و اگر کاربر
 * «کاهش حرکت» را فعال کرده باشد اصلاً اجرا نمی‌شود.
 */
export default function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;

    type Point = { x: number; y: number; vx: number; vy: number; r: number };
    let points: Point[] = [];

    const spawn = () => {
      const count = window.innerWidth < 720 ? 22 : window.innerWidth < 1200 ? 38 : 54;
      points = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.4 + 0.7,
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spawn();
    };

    const linkDistance = () => (window.innerWidth < 720 ? 110 : 150);

    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);
      const max = linkDistance();

      for (const p of points) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;
      }

      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist > max) continue;
          ctx.strokeStyle = `rgba(244, 183, 64, ${(1 - dist / max) * 0.3})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.stroke();
        }
      }

      for (const p of points) {
        ctx.fillStyle = "rgba(252, 215, 122, 0.75)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      frame = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        frame = requestAnimationFrame(draw);
      }
    };

    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <>
      <div className="fx-grid" aria-hidden="true" />
      <div className="fx-glow fx-glow--1" aria-hidden="true" />
      <div className="fx-glow fx-glow--2" aria-hidden="true" />
      <canvas ref={canvasRef} className="fx-canvas" aria-hidden="true" />
    </>
  );
}
