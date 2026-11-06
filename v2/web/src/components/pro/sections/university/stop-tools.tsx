"use client";

import * as React from "react";
import QRCode from "qrcode";
import { X } from "lucide-react";
import { usePro } from "@/lib/pro/store";
import { dayLabel, pct, time } from "@/lib/pro/format";
import { QR_ROTATION_MS, checkinUrl, rotatingCode } from "@/lib/pro/university";
import type { UniWelcomeStop } from "@/lib/pro/university-types";
import { FixedPortal, Meter } from "../../kit";

/**
 * El QR y el cartel se imprimen o se proyectan sobre fondo claro: llevan
 * colores fijos de papel, no los del tema (en modo oscuro no se leería).
 */
const PAPER = "#ffffff";
const INK = "#121019";
const MUTED = "#5b5868";
const ACCENT = "#6d3df0";

/* ------------------------------------------------------------------ */
/* Pantalla de check-in para el proyector                              */
/* ------------------------------------------------------------------ */

export function ProjectorScreen({ stop, onClose }: { stop: UniWelcomeStop; onClose: () => void }) {
  const { data, demo, refresh } = usePro();
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const [qr, setQr] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const code = stop.code ?? stop.id.toUpperCase();
  const { token, msLeft } = rotatingCode(code, nowMs);
  // El contador lee la parada del almacén: así sube cuando llegan check-ins.
  const live = (data.uniWelcome as UniWelcomeStop[]).find((s) => s.id === stop.id) ?? stop;

  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // En un espacio real se piden los check-in nuevos cada 20 segundos.
  React.useEffect(() => {
    if (demo) return;
    const id = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(id);
  }, [demo, refresh]);

  React.useEffect(() => {
    let alive = true;
    QRCode.toDataURL(checkinUrl(data.space.slug, code, token), { margin: 1, width: 720, color: { dark: INK, light: PAPER } })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(""));
    return () => {
      alive = false;
    };
  }, [code, data.space.slug, token]);

  // Pantalla completa del navegador si lo permite; Escape cierra.
  React.useEffect(() => {
    const el = rootRef.current;
    el?.requestFullscreen?.().catch(() => undefined);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose]);

  const secondsLeft = Math.ceil(msLeft / 1000);

  return (
    <FixedPortal>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Check-in de ${stop.title}`}
        className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-bg-primary text-text-primary"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 sm:px-10 sm:pt-8">
          <p className="eyebrow">{stop.kind === "erasmus" ? "Pasaporte Erasmus · Erasmus passport" : "Pasaporte de bienvenida"}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar proyección"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-5 py-6 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-14">
          <div className="min-w-0">
            <h1 className="font-heading text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-6xl">{stop.title}</h1>
            {stop.titleEn ? <p className="mt-2 text-xl text-text-muted sm:text-2xl" lang="en">{stop.titleEn}</p> : null}
            <p className="mt-4 text-lg text-text-muted sm:text-xl">
              {dayLabel(stop.date)}, {time(stop.date)} · {stop.place}
            </p>
            <div className="mt-8 sm:mt-12">
              <p className="font-heading text-7xl font-extrabold tracking-[-0.04em] tabular sm:text-[9rem] sm:leading-none" aria-live="polite">
                {live.checkins.toLocaleString("es-ES")}
              </p>
              <p className="mt-1 text-lg text-text-muted">sellos en esta parada</p>
              <Meter value={live.checkins} max={live.capacity} className="mt-5 h-3 max-w-md" />
              <p className="mt-2 text-sm text-text-muted tabular">
                {pct(live.checkins, live.capacity)} % de {live.capacity.toLocaleString("es-ES")} plazas
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-full max-w-[520px] rounded-3xl bg-white p-5 shadow-float sm:p-7">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={`Código QR de check-in de ${stop.title}`} className="aspect-square w-full" />
              ) : (
                <div className="aspect-square w-full rounded-2xl skeleton-shimmer" />
              )}
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg-tertiary" aria-hidden>
                <div className="h-full rounded-full bg-violet transition-[width] duration-1000 ease-linear" style={{ width: `${(msLeft / QR_ROTATION_MS) * 100}%` }} />
              </div>
            </div>
            <p className="mt-4 text-center font-heading text-2xl font-bold">Escanea con Franky y suma el sello</p>
            {stop.kind === "erasmus" ? <p className="text-center text-lg text-text-muted" lang="en">Scan with Franky to get your stamp</p> : null}
            <p className="mt-1 text-sm text-text-muted tabular">El código cambia en {secondsLeft} s para que nadie lo comparta</p>
          </div>
        </div>
      </div>
    </FixedPortal>
  );
}

/* ------------------------------------------------------------------ */
/* Cartel A4 con QR                                                    */
/* ------------------------------------------------------------------ */

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, "")}…`;
    return kept;
  }
  return lines;
}

function cssFont(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

/**
 * Dibuja el cartel A4 (1240 x 1754 px, 150 ppp) en el navegador y devuelve el
 * PNG. El QR del cartel es fijo: el que cambia cada 30 s es el del proyector.
 */
export async function renderPoster(stop: UniWelcomeStop, spaceName: string, slug: string): Promise<string> {
  const W = 1240;
  const H = 1754;
  const M = 110;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sin canvas");

  const heading = cssFont("--font-heading", "system-ui, sans-serif");
  const body = cssFont("--font-body", "system-ui, sans-serif");
  await document.fonts?.ready;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";

  const code = stop.code ?? stop.id.toUpperCase();
  const erasmus = stop.kind === "erasmus";

  ctx.fillStyle = ACCENT;
  ctx.font = `600 30px ${body}`;
  ctx.fillText(erasmus ? "PASAPORTE ERASMUS · ERASMUS PASSPORT" : "PASAPORTE DE BIENVENIDA", M, 150);

  ctx.fillStyle = INK;
  ctx.font = `800 88px ${heading}`;
  let y = 215;
  for (const line of wrap(ctx, stop.title, W - 2 * M, 3)) {
    ctx.fillText(line, M, y);
    y += 100;
  }
  if (stop.titleEn) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 42px ${body}`;
    for (const line of wrap(ctx, stop.titleEn, W - 2 * M, 2)) {
      ctx.fillText(line, M, y + 6);
      y += 54;
    }
  }

  ctx.fillStyle = INK;
  ctx.font = `600 44px ${body}`;
  const when = `${dayLabel(stop.date)}, ${time(stop.date)}`;
  ctx.fillText(when.charAt(0).toUpperCase() + when.slice(1), M, y + 36);
  ctx.fillStyle = MUTED;
  ctx.font = `400 42px ${body}`;
  ctx.fillText(stop.place, M, y + 94);

  const qrSize = 660;
  const qrTop = Math.max(y + 190, 700);
  const qrUrl = await QRCode.toDataURL(checkinUrl(slug, code), { margin: 1, width: qrSize, color: { dark: INK, light: PAPER } });
  const img = new Image();
  img.src = qrUrl;
  await img.decode();
  ctx.drawImage(img, (W - qrSize) / 2, qrTop, qrSize, qrSize);

  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `800 50px ${heading}`;
  ctx.fillText("Escanea con Franky y suma el sello", W / 2, qrTop + qrSize + 40);
  if (erasmus) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 36px ${body}`;
    ctx.fillText("Scan with Franky to get your stamp", W / 2, qrTop + qrSize + 104);
  }
  ctx.fillStyle = MUTED;
  ctx.font = `600 32px ui-monospace, monospace`;
  ctx.fillText(code, W / 2, qrTop + qrSize + (erasmus ? 160 : 112));

  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `600 30px ${body}`;
  ctx.fillText(spaceName, M, H - 150);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 30px ${heading}`;
  ctx.textAlign = "right";
  ctx.fillText("franky.es", W - M, H - 150);

  return canvas.toDataURL("image/png");
}

/** Abre el cartel en una hoja aparte y lanza la impresión (o guardar como PDF). */
export function printPoster(png: string, title: string) {
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return false;
  const doc = win.document;
  doc.title = title;
  const style = doc.createElement("style");
  style.textContent = "@page{size:A4;margin:0}html,body{margin:0}img{width:100%;height:auto;display:block}";
  doc.head.appendChild(style);
  const img = doc.createElement("img");
  img.alt = title;
  img.src = png;
  img.onload = () => {
    win.focus();
    win.print();
  };
  doc.body.appendChild(img);
  return true;
}
