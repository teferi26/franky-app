"use client";

import * as React from "react";
import QRCode from "qrcode";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { CommunityActivity } from "@/lib/pro/community-types";
import {
  POSTER_COLORS,
  activityPosterHtml,
  posterFacts,
  type PosterFacts,
} from "@/lib/pro/community-poster";
import { Drawer } from "../../kit";
import { downloadDataUrl, fileSlug, openPrintable } from "./files";

/**
 * Cartel y story de una actividad, con el QR que abre la asociación en Franky.
 * La story se dibuja en un canvas de 1080 x 1920 (el tamaño de Instagram) con
 * la tipografía de la web; el cartel es una página A4 para imprimir.
 */

const W = 1080;
const H = 1920;
const M = 96;
const C = POSTER_COLORS;

/** Familia tipográfica real de una clase de la web (Next le pone otro nombre a Outfit). */
function fontFamily(className: string): string {
  const probe = document.createElement("span");
  probe.className = className;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily || "sans-serif";
  probe.remove();
  return family;
}

/** Parte un texto en líneas que caben en `width`, hasta `max` líneas. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === max) break;
  }
  if (lines.length < max && line) lines.push(line);
  if (lines.length === max && words.join(" ") !== lines.join(" ")) {
    let last = lines[max - 1];
    while (last && ctx.measureText(`${last}...`).width > width) last = last.slice(0, -1);
    lines[max - 1] = `${last.trimEnd()}...`;
  }
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Dibuja la story y devuelve un PNG en data URL. */
async function drawStory(opts: {
  facts: PosterFacts;
  spaceName: string;
  url: string;
}): Promise<string> {
  const { facts, spaceName, url } = opts;
  if (document.fonts?.ready) await document.fonts.ready;
  const heading = fontFamily("font-heading");
  const body = fontFamily("font-sans");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");

  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  // Cabecera: nombre de la asociación y barra de acento.
  ctx.fillStyle = C.muted;
  ctx.font = `700 34px ${body}`;
  ctx.fillText(spaceName.toUpperCase().split("").join(String.fromCharCode(8202)), M, 170);
  ctx.fillStyle = C.accent;
  ctx.fillRect(M, 228, 132, 14);

  // Título grande, hasta cinco líneas.
  let y = 370;
  ctx.fillStyle = C.ink;
  ctx.font = `800 104px ${heading}`;
  for (const line of wrap(ctx, facts.title, W - M * 2, 5)) {
    ctx.fillText(line, M, y);
    y += 112;
  }

  if (facts.blurb) {
    y += 16;
    ctx.fillStyle = C.muted;
    ctx.font = `400 40px ${body}`;
    for (const line of wrap(ctx, facts.blurb, W - M * 2, 3)) {
      ctx.fillText(line, M, y);
      y += 54;
    }
  }

  // Datos: cuándo, dónde, entrada y créditos.
  y += 40;
  const rows: [string, string][] = [
    ["CUÁNDO", `${facts.day}, ${facts.hour}`],
    ["DÓNDE", facts.place],
    ["ENTRADA", facts.price],
    ...(facts.credits ? ([["CRÉDITOS", facts.credits]] as [string, string][]) : []),
  ];
  for (const [label, value] of rows) {
    if (y > 1330) break;
    ctx.fillStyle = C.line;
    ctx.fillRect(M, y, W - M * 2, 2);
    ctx.fillStyle = C.muted;
    ctx.font = `700 26px ${body}`;
    ctx.fillText(label, M, y + 46);
    ctx.fillStyle = C.ink;
    ctx.font = `700 46px ${heading}`;
    const lines = wrap(ctx, value, W - M * 2, 2);
    lines.forEach((line, i) => ctx.fillText(line, M, y + 104 + i * 54));
    y += 128 + (lines.length - 1) * 54;
  }

  // QR y llamada a la acción abajo.
  const qrSize = 380;
  const qrY = H - M - qrSize - (facts.council ? 70 : 0);
  const qr = await loadImage(
    await QRCode.toDataURL(url, {
      margin: 0,
      width: qrSize * 2,
      color: { dark: C.ink, light: C.paper },
    }),
  );
  ctx.drawImage(qr, M, qrY, qrSize, qrSize);
  const textX = M + qrSize + 48;
  const textW = W - textX - M;
  ctx.fillStyle = C.ink;
  ctx.font = `800 54px ${heading}`;
  let ty = qrY + 70;
  for (const line of wrap(ctx, "Apúntate en Franky", textW, 2)) {
    ctx.fillText(line, textX, ty);
    ty += 62;
  }
  ctx.fillStyle = C.muted;
  ctx.font = `400 32px ${body}`;
  ty += 12;
  for (const line of wrap(ctx, "Escanea el código con la cámara del móvil", textW, 3)) {
    ctx.fillText(line, textX, ty);
    ty += 42;
  }
  ctx.fillStyle = C.ink;
  ctx.font = `700 30px ${body}`;
  for (const line of wrap(ctx, url.replace(/^https?:\/\//, ""), textW, 2)) {
    ctx.fillText(line, textX, ty + 20);
    ty += 38;
  }

  if (facts.council) {
    ctx.fillStyle = C.line;
    ctx.fillRect(M, H - M - 40, W - M * 2, 2);
    ctx.fillStyle = C.muted;
    ctx.font = `400 28px ${body}`;
    ctx.fillText(wrap(ctx, facts.council, W - M * 2, 1)[0] ?? "", M, H - M + 8);
  }

  return canvas.toDataURL("image/png");
}

export function PosterDrawer({
  activity,
  open,
  onClose,
}: {
  activity: CommunityActivity;
  open: boolean;
  onClose: () => void;
}) {
  const { data } = usePro();
  const toast = useToast();
  const url = `https://franky.es/n/${data.space.slug}`;
  const facts = posterFacts(activity, { campus: data.space.campus });
  const [story, setStory] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const key = JSON.stringify(facts);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    setStory(null);
    setFailed(false);
    drawStory({ facts, spaceName: data.space.name, url })
      .then((png) => alive && setStory(png))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // `key` resume los textos: se redibuja solo si cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, data.space.name, url]);

  const downloadStory = () => {
    if (!story) return;
    downloadDataUrl(story, `story-${fileSlug(activity.title)}.png`);
    toast.success("Story descargada", "Súbela a Instagram tal cual: el QR se lee desde otra pantalla.");
  };

  const printPoster = async () => {
    let qrSvg: string | undefined;
    try {
      qrSvg = await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: C.ink, light: C.paper } });
    } catch {
      qrSvg = undefined;
    }
    const html = activityPosterHtml({
      spaceName: data.space.name,
      activity,
      url,
      campus: data.space.campus,
      qrSvg,
    });
    const opened = openPrintable(html, `cartel-${activity.title}`);
    toast.success(
      "Cartel listo",
      opened ? "Imprímelo o guárdalo en PDF desde la pestaña nueva." : "Se ha descargado para abrirlo e imprimirlo.",
    );
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Cartel y story"
      description="Con el QR para apuntarse en Franky. Los datos salen de la actividad."
      footer={
        <>
          <Button variant="outline" onClick={() => void printPoster()}>
            <Printer className="h-4 w-4" /> Imprimir cartel
          </Button>
          <Button variant="dark" onClick={downloadStory} disabled={!story}>
            <Download className="h-4 w-4" /> Descargar story
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <div className="aspect-[9/16] w-full max-w-[16rem] overflow-hidden rounded-2xl border border-border bg-bg-secondary shadow-card">
          {story ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={story} alt={`Story de ${activity.title}`} className="h-full w-full object-cover" />
          ) : (
            <div className="skeleton-shimmer h-full w-full" aria-hidden />
          )}
        </div>
        {failed ? (
          <p className="text-sm text-text-muted">
            Este navegador no ha podido dibujar la story. El cartel para imprimir sí funciona.
          </p>
        ) : (
          <p className="text-center text-xs text-text-muted">
            1080 x 1920, el tamaño de las stories. El QR lleva a {url.replace(/^https?:\/\//, "")}.
          </p>
        )}
      </div>
    </Drawer>
  );
}
