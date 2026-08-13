"use client";

import { useEffect, useRef } from "react";

interface ConfettiProps {
  /** `burst` = one short pop on success, `celebrate` = winner screen. */
  intensity?: "burst" | "celebrate";
  colors?: string[];
}

const DEFAULT_COLORS = ["#b6f23c", "#a970ff", "#3d8bff", "#ff9838", "#ff5fa2", "#24d3e0"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
}

/** Canvas confetti — no dependency, cleans itself up, honours reduced motion. */
export function Confetti({ intensity = "burst", colors = DEFAULT_COLORS }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;
    const count = intensity === "celebrate" ? 140 : 70;

    const spawn = (): Particle => ({
      x: W() * (0.5 + (Math.random() - 0.5) * 0.7),
      y: intensity === "celebrate" ? -20 - Math.random() * H() * 0.4 : H() * 0.52,
      vx: (Math.random() - 0.5) * (intensity === "celebrate" ? 2.4 : 7),
      vy:
        intensity === "celebrate"
          ? 1.6 + Math.random() * 2.4
          : -6 - Math.random() * 7,
      size: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.32,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    });

    let particles: Particle[] = Array.from({ length: count }, spawn);
    let raf = 0;
    let running = true;
    const startedAt = performance.now();
    const duration = intensity === "celebrate" ? 6500 : 2200;

    const frame = () => {
      if (!running) return;
      const elapsed = performance.now() - startedAt;
      ctx.clearRect(0, 0, W(), H());

      particles.forEach((p) => {
        p.vy += 0.24;
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (elapsed > duration * 0.6) p.life -= 0.012;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      });

      particles = particles.filter((p) => p.life > 0 && p.y < H() + 60);

      // Celebration keeps a light drizzle going for its full duration.
      if (intensity === "celebrate" && elapsed < duration * 0.6 && Math.random() < 0.4) {
        particles.push(spawn());
      }

      if (particles.length > 0 && elapsed < duration) {
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [intensity, colors]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-50 size-full"
    />
  );
}
