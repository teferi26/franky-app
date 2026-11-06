/**
 * Genera todos los iconos de Franky (móvil, tiendas y web) desde un único
 * archivo maestro en alta resolución.
 *
 * MAESTRO: assets/images/icon-master.png (1254x1254, hecho con IA por Teferi).
 * Es la única fuente de verdad. Si algún día cambia el logo, se sustituye ese
 * archivo y se vuelve a ejecutar este script.
 *
 * Historia: el icono que había antes medía 217x208 px, insuficiente para las
 * tiendas (Google Play pide 512x512 y el build de iOS 1024x1024) y borroso al
 * escalarlo. Con el maestro en alta resolución ya no hay que reconstruir nada.
 *
 * EL ICONO ADAPTATIVO DE ANDROID merece explicación. Android recorta el icono
 * con máscaras (círculo, cuadrado redondeado, "squircle") según el launcher, así
 * que el diseño a sangre NO sirve como capa frontal: una máscara circular le
 * cortaría el brazo a la F y el borde al cuerpo. Lo correcto son dos capas:
 *
 *   - fondo: el degradado violeta, a sangre (se puede recortar sin perder nada)
 *   - frente: solo la figura, con transparencia y reducida a la zona segura
 *
 * Para separarlas se modela el logo como "blanco con opacidad sobre un degradado
 * lineal", que es literalmente cómo está construido: se ajusta el degradado del
 * fondo por mínimos cuadrados y la opacidad del blanco sale de ahí por
 * despeje. Al recomponer frente sobre fondo se recupera el diseño exacto.
 *
 * Uso:  node scripts/build-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// sharp vive en el proyecto web; la app móvil no lo necesita en runtime.
const sharp = require("../../web/node_modules/sharp");

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const MOBILE = path.join(HERE, "..");
const ASSETS = path.join(MOBILE, "assets", "images");
const STORE = path.join(ASSETS, "store");
const WEB_ICONS = path.join(MOBILE, "..", "web", "public", "icons");
const WEB_IMG = path.join(MOBILE, "..", "web", "public", "img");
const MASTER = path.join(ASSETS, "icon-master.png");

/** Ajuste lineal v = a*x + b*y + d por mínimos cuadrados. */
function fitPlane(pts) {
  let n = pts.length, Sxx = 0, Sxy = 0, Sx = 0, Syy = 0, Sy = 0, Sxv = 0, Syv = 0, Sv = 0;
  for (const [x, y, v] of pts) {
    Sxx += x * x; Sxy += x * y; Sx += x; Syy += y * y; Sy += y;
    Sxv += x * v; Syv += y * v; Sv += v;
  }
  const A = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]], B = [Sxv, Syv, Sv];
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [B[i], B[p]] = [B[p], B[i]];
    for (let r = i + 1; r < 3; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < 3; c++) A[r][c] -= f * A[i][c];
      B[r] -= f * B[i];
    }
  }
  const s = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let t = B[i];
    for (let c = i + 1; c < 3; c++) t -= A[i][c] * s[c];
    s[i] = t / A[i][i];
  }
  let err = 0;
  for (const [x, y, v] of pts) err += Math.abs(s[0] * x + s[1] * y + s[2] - v);
  return { a: s[0], b: s[1], d: s[2], mae: err / Math.max(1, n) };
}

/** Separa el logo en degradado de fondo + figura blanca con opacidad. */
async function splitLayers() {
  const { data, info } = await sharp(MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;

  // Solo violeta saturado para el ajuste: excluye el lavanda del cuerpo, que si
  // no contamina el degradado.
  const pts = [[], [], []];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C, r = data[i], g = data[i + 1], b = data[i + 2];
    if (b - g > 140 && g < 95) {
      const nx = x / (W - 1), ny = y / (H - 1);
      pts[0].push([nx, ny, r]); pts[1].push([nx, ny, g]); pts[2].push([nx, ny, b]);
    }
  }
  const fit = pts.map(fitPlane);
  const bgAt = (nx, ny) => fit.map((f) => f.a * nx + f.b * ny + f.d);

  // Opacidad del blanco sobre ese fondo, despejada canal a canal.
  const fg = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    const nx = x / (W - 1), ny = y / (H - 1);
    const B = bgAt(nx, ny);
    let sum = 0, used = 0;
    for (let c = 0; c < 3; c++) {
      const den = 255 - B[c];
      // Canales casi saturados no informan de la opacidad (división inestable).
      if (den > 25) { sum += (data[i + c] - B[c]) / den; used++; }
    }
    let a = used ? Math.max(0, Math.min(1, sum / used)) : 0;
    // Suelo de opacidad: el ajuste del degradado tiene un error residual de
    // unas pocas unidades sobre 255, así que los píxeles de FONDO no salen
    // exactamente a cero sino a 0,02-0,05. Ese velo blanquecino, al componer la
    // capa frontal sobre el fondo, dibujaba un cuadrado fantasma visible allí
    // donde llegaba el lienzo original. Por debajo de 0,12 no hay figura.
    if (a < 0.12) a = 0;
    const o = (y * W + x) * 4;
    fg[o] = 255; fg[o + 1] = 255; fg[o + 2] = 255;
    fg[o + 3] = Math.round(a * 255);
  }

  return { W, H, fit, bgAt, foreground: fg };
}

/** Dibuja el degradado del fondo al tamaño pedido (fórmula, no reescalado). */
function gradient(fit, size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / (size - 1), ny = y / (size - 1), o = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) {
      buf[o + c] = Math.max(0, Math.min(255, Math.round(fit[c].a * nx + fit[c].b * ny + fit[c].d)));
    }
    buf[o + 3] = 255;
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 4 } });
}

const layers = await splitLayers();
console.log(`Maestro: ${layers.W}x${layers.H}`);
console.log("  degradado ajustado, error medio:", layers.fit.map((f) => f.mae.toFixed(2)).join(" / "), "sobre 255");
console.log("  esquinas -> supIzq", layers.bgAt(0, 0).map(Math.round),
  "| supDer", layers.bgAt(1, 0).map(Math.round),
  "| infIzq", layers.bgAt(0, 1).map(Math.round));

fs.mkdirSync(STORE, { recursive: true });
const written = [];
const note = (file, size, what) => written.push([file, `${size}x${size}`, what]);

// ── 1. Iconos a sangre (el diseño completo) ────────────────────────────────
// Sin canal alfa: iOS lo exige y las tiendas lo prefieren.
for (const [dest, size, what] of [
  [path.join(ASSETS, "icon.png"), 1024, "icono principal (Expo / iOS)"],
  [path.join(STORE, "playstore-icon-512.png"), 512, "ficha de Google Play"],
  [path.join(WEB_ICONS, "icon-512x512.png"), 512, "web PWA"],
  [path.join(WEB_ICONS, "icon-192x192.png"), 192, "web PWA"],
  [path.join(WEB_ICONS, "apple-touch-icon.png"), 180, "web iOS"],
  [path.join(WEB_IMG, "franky-icon.png"), 256, "web (navbar, footer)"],
]) {
  await sharp(MASTER).resize(size, size, { kernel: "lanczos3" })
    .flatten({ background: "#ffffff" }).png({ compressionLevel: 9 }).toFile(dest);
  note(path.relative(MOBILE, dest).replace(/\\/g, "/"), size, what);
}

// ── 2. Icono adaptativo de Android: dos capas ─────────────────────────────
// La figura ocupa el 62% del lienzo para sobrevivir a las máscaras circulares.
const ADAPTIVE = 1024;
const figSize = Math.round(ADAPTIVE * 0.62);
const figure = await sharp(layers.foreground, {
  raw: { width: layers.W, height: layers.H, channels: 4 },
}).resize(figSize, figSize, { kernel: "lanczos3" }).png().toBuffer();

await sharp({
  create: { width: ADAPTIVE, height: ADAPTIVE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: figure, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(ASSETS, "adaptive-icon.png"));
note("assets/images/adaptive-icon.png", ADAPTIVE, "Android: capa frontal (figura, transparente)");

await gradient(layers.fit, ADAPTIVE)
  .png({ compressionLevel: 9 })
  .toFile(path.join(ASSETS, "adaptive-icon-background.png"));
note("assets/images/adaptive-icon-background.png", ADAPTIVE, "Android: capa de fondo (degradado)");

// ── 2b. Maskable de la web (PWA) ───────────────────────────────────────────
// Mismo problema que en Android: quien instala la web como app puede recibir
// una máscara circular, así que la figura va reducida a la zona segura sobre el
// degradado a sangre.
const MASKABLE = 512;
const maskFig = await sharp(layers.foreground, {
  raw: { width: layers.W, height: layers.H, channels: 4 },
}).resize(Math.round(MASKABLE * 0.58), Math.round(MASKABLE * 0.58), { kernel: "lanczos3" }).png().toBuffer();
await gradient(layers.fit, MASKABLE)
  .composite([{ input: maskFig, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(WEB_ICONS, "icon-maskable-512.png"));
note("../web/public/icons/icon-maskable-512.png", MASKABLE, "web PWA: maskable (zona segura)");

// ── 3. Icono de notificación (Android lo pinta como silueta blanca) ────────
const NOTIF = 256;
const notifFig = await sharp(layers.foreground, {
  raw: { width: layers.W, height: layers.H, channels: 4 },
}).resize(Math.round(NOTIF * 0.8), Math.round(NOTIF * 0.8), { kernel: "lanczos3" }).png().toBuffer();
await sharp({
  create: { width: NOTIF, height: NOTIF, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: notifFig, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(ASSETS, "notification-icon.png"));
note("assets/images/notification-icon.png", NOTIF, "Android: notificaciones (silueta)");

// ── 4. Gráfico destacado de Google Play (1024x500, obligatorio) ────────────
const FW = 1024, FH = 500;
const featBg = Buffer.alloc(FW * FH * 4);
for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
  // Se reutiliza el degradado del logo estirado al formato panorámico.
  const nx = x / (FW - 1), ny = y / (FH - 1), o = (y * FW + x) * 4;
  for (let c = 0; c < 3; c++) {
    featBg[o + c] = Math.max(0, Math.min(255, Math.round(layers.fit[c].a * nx + layers.fit[c].b * ny + layers.fit[c].d)));
  }
  featBg[o + 3] = 255;
}
const featLogo = await sharp(MASTER).resize(300, 300, { kernel: "lanczos3" })
  .composite([{
    // Esquinas redondeadas para que no parezca un recorte pegado.
    input: Buffer.from(`<svg width="300" height="300"><rect width="300" height="300" rx="66" ry="66" fill="#fff"/></svg>`),
    blend: "dest-in",
  }])
  .png().toBuffer();
const featText = Buffer.from(
  `<svg width="560" height="240" xmlns="http://www.w3.org/2000/svg">
     <text x="0" y="86" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="74" font-weight="800" fill="#ffffff">Franky</text>
     <text x="0" y="152" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="38" font-weight="600" fill="#ffffff" opacity="0.92">Tu vida universitaria</text>
     <text x="0" y="206" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="27" font-weight="500" fill="#ffffff" opacity="0.75">Notas de corte · Becas · Pisos · Tu campus</text>
   </svg>`
);
await sharp(featBg, { raw: { width: FW, height: FH, channels: 4 } })
  .composite([
    { input: featLogo, left: 70, top: 100 },
    { input: featText, left: 430, top: 130 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(path.join(STORE, "feature-graphic-1024x500.png"));
written.push(["assets/images/store/feature-graphic-1024x500.png", "1024x500", "Google Play: gráfico destacado"]);

// ── 5. Verificación: recomponer frente sobre fondo y comparar con el maestro ─
const recomposed = await gradient(layers.fit, 512)
  .composite([{
    input: await sharp(layers.foreground, { raw: { width: layers.W, height: layers.H, channels: 4 } })
      .resize(512, 512, { kernel: "lanczos3" }).png().toBuffer(),
  }])
  .raw().toBuffer({ resolveWithObject: true });
const { data: ref, info: refInfo } = await sharp(MASTER).resize(512, 512, { kernel: "lanczos3" })
  .raw().toBuffer({ resolveWithObject: true });
let sum = 0;
for (let i = 0; i < 512 * 512; i++) {
  for (let c = 0; c < 3; c++) {
    sum += Math.abs(recomposed.data[i * recomposed.info.channels + c] - ref[i * refInfo.channels + c]);
  }
}
console.log(`  separación de capas verificada: error medio ${(sum / (512 * 512 * 3)).toFixed(2)}/255 al recomponer`);

console.log("\nArchivos generados:");
for (const [f, s, w] of written) console.log(`  ${f.padEnd(46)} ${s.padEnd(10)} ${w}`);
