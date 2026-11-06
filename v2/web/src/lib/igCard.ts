// Generador de tarjetas para Instagram (1080x1920, 9:16 Stories) compartido por FOMO y Ligar.
// Todo es client-side (canvas) — no depende del backend. Diseño pensado para que
// la gente joven QUIERA compartirlo: degradado "mesh" de marca, grano sutil,
// destellos, cabecera tipo sticker y tarjeta glass con el contenido del post.

export type IgCardKind = "fomo" | "ligar";

export interface IgCardOptions {
  kind: IgCardKind;
  universityName: string;
  body: string | null;
  /** Etiqueta del autor (FOMO) — "Anónimo" o el nombre. */
  authorLabel?: string;
  /** "Lo que aporto" (Ligar). */
  offer?: string | null;
  /** Chip de audiencia (Ligar): "Para todos" / "Para chicas"… */
  audienceLabel?: string;
  /** URL del adjunto. Solo se dibuja si mediaType === "image". */
  mediaUrl?: string | null;
  /** Tipo del adjunto: "image" | "audio" | "video". */
  mediaType?: string | null;
}

// ── Paleta de marca ─────────────────────────────────────────────────────────
const C = {
  violetDeep: [124, 58, 237] as const, // #7C3AED
  violet: [139, 92, 246] as const, // #8B5CF6
  violetBright: [168, 85, 247] as const, // #A855F7
  fuchsia: [192, 38, 211] as const, // #C026D3
  pink: [232, 111, 240] as const, // acento rosa
  orange: [222, 137, 39] as const, // #DE8927
  ink: "#171428",
  inkSoft: "#4A4560",
  accent: "#7C3AED",
};

const rgba = (c: readonly [number, number, number], a: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const hex = (c: readonly [number, number, number]) =>
  `rgb(${c[0]},${c[1]},${c[2]})`;

const HEAD = "Outfit, system-ui, sans-serif";
const BODY = "Inter, system-ui, sans-serif";

const KIND_TAG: Record<IgCardKind, string> = { fomo: "FOMO", ligar: "CRUSH" };
const KIND_TAG_GRAD: Record<IgCardKind, [string, string]> = {
  fomo: ["#F6A623", "#E07C12"],
  ligar: ["#C84BF0", "#E86AE0"],
};
const KIND_TAGLINE: Record<IgCardKind, string> = {
  fomo: "Lo que se cuece en tu uni",
  ligar: "Tu crush en la biblioteca",
};
const KIND_PLACEHOLDER: Record<IgCardKind, string> = {
  fomo: "Mira lo que se cuece en mi uni 👀",
  ligar: "Alguien especial anda por la biblioteca 👀",
};

// ── Helpers de dibujo ────────────────────────────────────────────────────────
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function linGrad(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: [number, string][]
) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Resplandor radial de color sobre todo el lienzo. */
function glow(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  x: number,
  y: number,
  r: number,
  color: readonly [number, number, number],
  a: number
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Destello de 4 puntas (sparkle). */
function sparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  a: number
) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.translate(cx, cy);
  ctx.beginPath();
  const inner = r * 0.32;
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2;
    ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    const a2 = ang + Math.PI / 4;
    ctx.lineTo(Math.cos(a2) * inner, Math.sin(a2) * inner);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Tile de grano para dar textura premium. */
function noiseTile(size = 160): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const cx = c.getContext("2d");
  if (!cx) return null;
  const img = cx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 90 + Math.random() * 130;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 16;
  }
  cx.putImageData(img, 0, 0);
  return c;
}

function loadImage(
  url: string,
  crossOrigin = false
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Imagen cubriendo (object-fit: cover) un rectángulo redondeado, con sombra. */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.save();
  ctx.shadowColor = "rgba(20,10,40,0.16)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#fff";
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const ir = img.naturalWidth / img.naturalHeight;
  const br = w / h;
  let dw: number, dh: number, dx: number, dy: number;
  if (ir > br) {
    dh = h;
    dw = h * ir;
    dx = x - (dw - w) / 2;
    dy = y;
  } else {
    dw = w;
    dh = w / ir;
    dx = x;
    dy = y - (dh - h) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 3;
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r - 1);
  ctx.stroke();
  ctx.restore();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Ajusta el tamaño de fuente hasta que el texto cabe en el alto disponible. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  opts: { maxFont: number; minFont: number; family: string; weight: string; lh?: number }
): { lines: string[]; fontSize: number; lineHeight: number } {
  const lhRatio = opts.lh ?? 1.34;
  let fontSize = opts.maxFont;
  while (fontSize >= opts.minFont) {
    ctx.font = `${opts.weight} ${fontSize}px ${opts.family}`;
    const lineHeight = Math.round(fontSize * lhRatio);
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length * lineHeight <= maxHeight) {
      return { lines, fontSize, lineHeight };
    }
    fontSize -= 2;
  }
  ctx.font = `${opts.weight} ${opts.minFont}px ${opts.family}`;
  const lineHeight = Math.round(opts.minFont * lhRatio);
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  let lines = wrapLines(ctx, text, maxWidth);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = lines.length - 1;
    let t = lines[last];
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
      t = t.slice(0, -1);
    }
    lines[last] = `${t}…`;
  }
  return { lines, fontSize: opts.minFont, lineHeight };
}

function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

async function ensureFonts() {
  try {
    if (typeof document !== "undefined" && "fonts" in document) {
      await Promise.all([
        document.fonts.load("800 64px Outfit"),
        document.fonts.load("700 40px Outfit"),
        document.fonts.load("500 46px Inter"),
        document.fonts.load("600 46px Inter"),
      ]);
      await document.fonts.ready;
    }
  } catch {
    /* tipografías de sistema como respaldo */
  }
}

// ── Generación de la tarjeta ─────────────────────────────────────────────────
/** Dibuja la tarjeta y devuelve un PNG como Blob. */
export async function generateIgCardBlob(opts: IgCardOptions): Promise<Blob> {
  await ensureFonts();
  const icon = await loadImage("/img/franky-icon.png");
  const showImg = !!opts.mediaUrl && opts.mediaType === "image";
  const media =
    showImg && opts.mediaUrl ? await loadImage(opts.mediaUrl, true) : null;

  // 1080×1920 (9:16): formato Stories de Instagram → la tarjeta ocupa toda la
  // pantalla al compartir en historia (antes 1080×1350 / 4:5 dejaba bandas).
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas-context");

  // ── Fondo mesh: base diagonal + resplandores de color ─────────────────────
  ctx.fillStyle = linGrad(ctx, 0, 0, W, H, [
    [0, hex(C.violetDeep)],
    [0.5, hex(C.violet)],
    [1, hex(C.fuchsia)],
  ]);
  ctx.fillRect(0, 0, W, H);
  glow(ctx, W, H, W * 0.12, H * 0.08, 720, C.violetBright, 0.55);
  glow(ctx, W, H, W * 0.95, H * 0.92, 760, C.pink, 0.5);
  glow(ctx, W, H, W * 0.85, H * 0.3, 460, C.orange, 0.16);

  // Viñeta para enfocar el centro
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.75);
  vig.addColorStop(0, "rgba(10,5,30,0)");
  vig.addColorStop(1, "rgba(10,5,30,0.28)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Grano sutil
  const noise = noiseTile();
  if (noise) {
    const pat = ctx.createPattern(noise, "repeat");
    if (pat) {
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // Destellos decorativos (márgenes izquierdo/derecho, nunca sobre la tarjeta)
  // Columna izquierda
  sparkle(ctx, 88, 320, 28, "#ffffff", 0.9);
  sparkle(ctx, 60, 470, 14, "#ffffff", 0.5);
  sparkle(ctx, 72, H * 0.55, 18, "#FFE2B0", 0.55);
  sparkle(ctx, 56, H * 0.72, 11, "#ffffff", 0.4);
  // Columna derecha
  sparkle(ctx, W - 88, 360, 32, "#ffffff", 0.85);
  sparkle(ctx, W - 56, 510, 15, "#FFE2B0", 0.7);
  sparkle(ctx, W - 80, H * 0.48, 20, "#ffffff", 0.55);
  sparkle(ctx, W - 60, H - 340, 28, "#ffffff", 0.8);
  sparkle(ctx, W - 90, H - 470, 14, "#FFE2B0", 0.6);

  // ── Cabecera tipo sticker: icono + "Franky" + tag de sección ──────────────
  // 9:16 → cabecera más generosa; rowCenterY sube al 10% del alto (≈192px)
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const badge = 116;
  const gapA = 26;
  const gapB = 20;
  ctx.font = `800 72px ${HEAD}`;
  const nameW = ctx.measureText("Franky").width;
  const tagText = KIND_TAG[opts.kind];
  ctx.font = `800 34px ${HEAD}`;
  const tagW = ctx.measureText(tagText).width + 60;
  const tagH = 64;
  const rowW = badge + gapA + nameW + gapB + tagW;
  let hx = (W - rowW) / 2;
  const rowCenterY = 192;

  // Insignia con el icono
  if (icon) {
    ctx.save();
    ctx.shadowColor = "rgba(10,5,30,0.32)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    roundRect(ctx, hx, rowCenterY - badge / 2, badge, badge, 30);
    ctx.fill();
    ctx.restore();
    ctx.save();
    const inset = 14;
    roundRect(ctx, hx + inset, rowCenterY - badge / 2 + inset, badge - inset * 2, badge - inset * 2, 18);
    ctx.clip();
    ctx.drawImage(icon, hx + inset, rowCenterY - badge / 2 + inset, badge - inset * 2, badge - inset * 2);
    ctx.restore();
  }
  hx += badge + gapA;

  // Wordmark "Franky"
  ctx.save();
  ctx.shadowColor = "rgba(10,5,30,0.22)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 72px ${HEAD}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Franky", hx, rowCenterY + 2);
  ctx.restore();
  hx += nameW + gapB;

  // Tag de sección
  ctx.save();
  ctx.shadowColor = "rgba(10,5,30,0.28)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = linGrad(ctx, hx, 0, hx + tagW, 0, [
    [0, KIND_TAG_GRAD[opts.kind][0]],
    [1, KIND_TAG_GRAD[opts.kind][1]],
  ]);
  roundRect(ctx, hx, rowCenterY - tagH / 2, tagW, tagH, tagH / 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 34px ${HEAD}`;
  ctx.textBaseline = "middle";
  ctx.fillText(tagText, hx + 30, rowCenterY + 2);
  ctx.textBaseline = "alphabetic";

  // Chip de universidad — separado del header, más generoso en 9:16
  ctx.font = `600 36px ${BODY}`;
  const uniName = truncateToWidth(ctx, opts.universityName, W - 240);
  const uniW = ctx.measureText(uniName).width;
  const dot = 13;
  const uniPad = 34;
  const uniChipW = uniW + uniPad * 2 + dot + 16;
  const uniChipH = 68;
  const uniX = (W - uniChipW) / 2;
  const uniY = rowCenterY + badge / 2 + 32; // siempre debajo del badge
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundRect(ctx, uniX, uniY, uniChipW, uniChipH, uniChipH / 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(uniX + uniPad + dot / 2, uniY + uniChipH / 2, dot / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `600 36px ${BODY}`;
  ctx.textBaseline = "middle";
  ctx.fillText(uniName, uniX + uniPad + dot + 16, uniY + uniChipH / 2 + 1);
  ctx.textBaseline = "alphabetic";

  // ── Tarjeta glass (altura adaptable al contenido) ─────────────────────────
  // 9:16: regionTop justo debajo del chip (chip bottom ≈ uniY+uniChipH), con
  // 56px de aire. regionBottom deja espacio para CTA + footer (≈256px).
  const cardX = 64;
  const cardW = W - cardX * 2;
  const padX = 60;
  const padY = 68; // padding interior generoso en 9:16
  const innerW = cardW - padX * 2;

  const regionTop = uniY + uniChipH + 56;
  const regionBottom = H - 260; // espacio para CTA + @franky.es + tagline
  const regionH = regionBottom - regionTop;
  const contentMaxH = regionH - padY * 2;

  // — Medidas de cada bloque —
  let labelH = 0;
  let labelGap = 0;
  let chipText = "";
  let chipW = 0;
  const chipH = 66; // más alto en 9:16
  const chipPad = 32;
  const isFomoAuthor = opts.kind === "fomo" && !!opts.authorLabel;
  const isLigarChip = opts.kind === "ligar" && !!opts.audienceLabel;
  if (isFomoAuthor) {
    labelH = 54; // más alto para font 46px
    labelGap = 28;
  } else if (isLigarChip) {
    chipText = opts.audienceLabel as string;
    ctx.font = `700 34px ${HEAD}`;
    chipW = ctx.measureText(chipText).width + chipPad * 2 + 38;
    labelH = chipH;
    labelGap = 30;
  }

  const offerText = (opts.offer || "").trim();
  const hasOffer = opts.kind === "ligar" && offerText.length > 0;
  const offerH = hasOffer ? 180 : 0; // mayor en 9:16
  const offerGap = hasOffer ? 32 : 0;

  const imgGap = media ? 28 : 0;
  let imgDispH = 0;
  if (media) {
    const ratio = media.naturalHeight / media.naturalWidth;
    imgDispH = Math.min(innerW * ratio, 640);
  }

  const rawBody = (opts.body || "").trim();
  const bodyText = (rawBody || KIND_PLACEHOLDER[opts.kind]).slice(0, 600);
  const bodyWeight = "600";
  const fixedH =
    labelH + labelGap + offerH + offerGap + (media ? imgGap + imgDispH : 0);
  let bodyMaxH = contentMaxH - fixedH;
  if (media && bodyMaxH < 120) {
    const deficit = 120 - bodyMaxH;
    imgDispH = Math.max(190, imgDispH - deficit);
    bodyMaxH =
      contentMaxH - (labelH + labelGap + offerH + offerGap + imgGap + imgDispH);
  }
  bodyMaxH = Math.max(bodyMaxH, 64);
  const fitted = fitText(ctx, bodyText, innerW - (isFomoAuthor ? 36 : 0), bodyMaxH, {
    maxFont: 62, // más grande en 9:16 — el cuerpo es el protagonista
    minFont: 32,
    family: BODY,
    weight: bodyWeight,
    lh: 1.38,
  });
  const bodyActualH = fitted.lines.length * fitted.lineHeight;

  const contentH =
    labelH +
    labelGap +
    bodyActualH +
    (media ? imgGap + imgDispH : 0) +
    offerGap +
    offerH;
  const cardH = Math.min(contentH + padY * 2, regionH);
  // Sesgar la tarjeta ligeramente hacia arriba del centro de la región (40%
  // del espacio libre arriba, 60% abajo) — más intencional que centrado exacto.
  const slack = Math.max(0, regionH - cardH);
  const cardY = regionTop + Math.round(slack * 0.40);

  // Sombra + relleno glass
  ctx.save();
  ctx.shadowColor = "rgba(10,5,30,0.32)";
  ctx.shadowBlur = 54;
  ctx.shadowOffsetY = 26;
  ctx.fillStyle = linGrad(ctx, cardX, cardY, cardX, cardY + cardH, [
    [0, "#ffffff"],
    [1, "#FBF8FF"],
  ]);
  roundRect(ctx, cardX, cardY, cardW, cardH, 46);
  ctx.fill();
  ctx.restore();
  // Brillo interior superior
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  roundRect(ctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, 45);
  ctx.stroke();
  ctx.restore();

  // — Contenido —
  let cursorY = cardY + padY;
  const contentX = cardX + padX;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (isFomoAuthor) {
    // Etiqueta de autor con degradado de marca
    ctx.fillStyle = linGrad(ctx, contentX, 0, contentX + 280, 0, [
      [0, hex(C.violetDeep)],
      [1, hex(C.fuchsia)],
    ]);
    ctx.font = `800 46px ${HEAD}`;
    ctx.fillText(
      truncateToWidth(ctx, opts.authorLabel as string, innerW - 20),
      contentX,
      cursorY + 46
    );
    cursorY += labelH + labelGap;
  } else if (isLigarChip) {
    ctx.save();
    ctx.fillStyle = linGrad(ctx, contentX, 0, contentX + chipW, 0, [
      [0, rgba(C.fuchsia, 0.16)],
      [1, rgba(C.pink, 0.18)],
    ]);
    roundRect(ctx, contentX, cursorY, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.restore();
    // corazoncito vectorial (escalado para chipH=66)
    const hxC = contentX + chipPad;
    const hyC = cursorY + chipH / 2;
    ctx.save();
    ctx.fillStyle = hex(C.fuchsia);
    ctx.translate(hxC + 10, hyC - 5);
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.bezierCurveTo(-14, -9, -25, 7, 0, 23);
    ctx.bezierCurveTo(25, 7, 14, -9, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = hex(C.fuchsia);
    ctx.font = `700 34px ${HEAD}`;
    ctx.textBaseline = "middle";
    ctx.fillText(chipText, contentX + chipPad + 38, cursorY + chipH / 2 + 2);
    ctx.textBaseline = "alphabetic";
    cursorY += labelH + labelGap;
  }

  // Cuerpo (con barra de acento a la izquierda en FOMO)
  const bodyX = isFomoAuthor ? contentX + 36 : contentX;
  if (isFomoAuthor) {
    ctx.fillStyle = linGrad(ctx, contentX, cursorY, contentX, cursorY + bodyActualH, [
      [0, hex(C.violetBright)],
      [1, hex(C.fuchsia)],
    ]);
    roundRect(ctx, contentX, cursorY + 8, 10, Math.max(bodyActualH - 16, 10), 5);
    ctx.fill();
  }
  ctx.fillStyle = rawBody ? C.ink : C.inkSoft;
  ctx.font = `${bodyWeight} ${fitted.fontSize}px ${BODY}`;
  let by = cursorY + fitted.fontSize;
  for (const line of fitted.lines) {
    ctx.fillText(line, bodyX, by);
    by += fitted.lineHeight;
  }
  cursorY += bodyActualH;

  // Imagen adjunta
  if (media) {
    cursorY += imgGap;
    drawImageCover(ctx, media, contentX, cursorY, innerW, imgDispH, 30);
    cursorY += imgDispH;
  }

  // Bloque "Lo que aporto" (Ligar)
  if (hasOffer) {
    cursorY += offerGap;
    const boxH = offerH;
    ctx.fillStyle = rgba(C.violet, 0.08);
    roundRect(ctx, contentX, cursorY, innerW, boxH, 26);
    ctx.fill();
    ctx.fillStyle = C.inkSoft;
    ctx.font = `800 26px ${HEAD}`;
    ctx.fillText("LO QUE APORTO", contentX + 32, cursorY + 50);
    const offFit = fitText(ctx, offerText.slice(0, 200), innerW - 64, boxH - 90, {
      maxFont: 38,
      minFont: 26,
      family: BODY,
      weight: "500",
    });
    ctx.fillStyle = C.ink;
    ctx.font = `500 ${offFit.fontSize}px ${BODY}`;
    let oy = cursorY + 50 + offFit.fontSize + 6;
    for (const line of offFit.lines) {
      ctx.fillText(line, contentX + 32, oy);
      oy += offFit.lineHeight;
    }
  }

  // ── Pie de marca (zona inferior ampliada en 9:16) ────────────────────────
  // Estructura (de arriba a abajo):
  //   H-240 → CTA pill: "Únete gratis en franky.es"
  //   H-138 → wordmark "@franky.es"
  //   H-80  → tagline de sección
  ctx.textAlign = "center";

  // CTA pill
  const ctaText = "Únete gratis en franky.es";
  ctx.font = `700 30px ${BODY}`;
  const ctaTextW = ctx.measureText(ctaText).width;
  const ctaPadX = 40;
  const ctaPillW = ctaTextW + ctaPadX * 2;
  const ctaPillH = 62;
  const ctaPillX = (W - ctaPillW) / 2;
  const ctaPillY = H - 240;
  // Borde translúcido con brillo
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  roundRect(ctx, ctaPillX, ctaPillY, ctaPillW, ctaPillH, ctaPillH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.shadowColor = "rgba(10,5,30,0.18)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `700 30px ${BODY}`;
  ctx.textBaseline = "middle";
  ctx.fillText(ctaText, W / 2, ctaPillY + ctaPillH / 2 + 1);
  ctx.restore();
  ctx.textBaseline = "alphabetic";

  // Wordmark @franky.es
  ctx.save();
  ctx.shadowColor = "rgba(10,5,30,0.24)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 52px ${HEAD}`;
  ctx.fillText("@franky.es", W / 2, H - 122);
  ctx.restore();

  // Tagline
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `500 32px ${BODY}`;
  ctx.fillText(KIND_TAGLINE[opts.kind], W / 2, H - 74);

  const blob: Blob | null = await new Promise((res) =>
    canvas.toBlob((b) => res(b), "image/png")
  );
  if (!blob) throw new Error("no-blob");
  return blob;
}

/** Comparte la tarjeta (Web Share API con archivo) o la descarga como respaldo. */
export async function shareIgCard(
  opts: IgCardOptions & {
    filename?: string;
    shareTitle?: string;
    shareText?: string;
  }
): Promise<void> {
  const blob = await generateIgCardBlob(opts);
  const filename = opts.filename ?? `franky-${opts.kind}.png`;
  const file = new File([blob], filename, { type: "image/png" });

  if (
    typeof navigator !== "undefined" &&
    navigator.canShare &&
    navigator.canShare({ files: [file] }) &&
    navigator.share
  ) {
    try {
      await navigator.share({
        files: [file],
        title: opts.shareTitle ?? `Franky ${KIND_TAG[opts.kind]}`,
        text: opts.shareText,
      });
      return;
    } catch {
      /* el usuario canceló o no se pudo — descargamos */
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
