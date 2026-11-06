/**
 * Descargas e impresión de los documentos de la asociación, en el navegador.
 *
 * Los documentos son páginas HTML autónomas (shared/pro/community-docs.ts).
 * Se abren en una pestaña nueva y se lanza el diálogo de impresión, desde el
 * que se guardan en PDF. Si el navegador bloquea la pestaña, se descarga el
 * archivo para abrirlo a mano.
 */

export function downloadFile(content: string | Blob, name: string, mime: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV con BOM para que Excel lea bien las tildes. */
export function downloadCsv(csv: string, name: string): void {
  downloadFile(String.fromCharCode(0xfeff) + csv, name, "text/csv;charset=utf-8");
}

export function downloadDataUrl(dataUrl: string, name: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Nombre de archivo sin tildes ni espacios. */
export function fileSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Abre el documento listo para imprimir o guardar en PDF.
 * Devuelve false si se ha descargado en vez de abrirse.
 */
export function openPrintable(html: string, name: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    downloadFile(html, `${fileSlug(name)}.html`, "text/html;charset=utf-8");
    return false;
  }
  win.addEventListener("load", () => {
    try {
      win.focus();
      win.print();
    } catch {
      // Si no deja imprimir desde aquí, la pestaña queda abierta para hacerlo a mano.
    }
  });
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return true;
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Miniatura del ticket: basta para leer importe y fecha y ocupa poco.
 * Si el navegador no sabe abrir la foto (HEIC en algunos), devuelve null.
 */
export async function receiptThumbnail(file: File, max = 900): Promise<string | null> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) {
    return null;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}
