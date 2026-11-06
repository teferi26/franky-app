"use client";

/**
 * Sacar papeles de Franky Pro: abrir un documento para imprimir o guardar en
 * PDF, y descargar listados en CSV para el gestor o el asesor.
 */

/**
 * Abre el documento en una pestaña nueva y lanza el diálogo de imprimir.
 * Si el navegador bloquea la pestaña, se descarga el HTML para abrirlo aparte.
 * Devuelve cómo ha salido para decírselo al usuario.
 */
export function openPrintable(html: string, fileName: string): "opened" | "downloaded" {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    // El documento no lleva scripts (la CSP no los dejaría): se imprime desde aquí.
    win.addEventListener("load", () => {
      try {
        win.focus();
        win.print();
      } catch {
        // Si no se puede, el documento queda abierto para imprimirlo a mano.
      }
    });
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return "opened";
  }
  downloadBlob(blob, fileName.endsWith(".html") ? fileName : `${fileName}.html`);
  URL.revokeObjectURL(url);
  return "downloaded";
}

/** Descarga un CSV que Excel abre con tildes y separado por punto y coma. */
export function downloadCsv(csv: string, fileName: string) {
  // La marca BOM hace que Excel lea el fichero como UTF-8.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nombre de fichero sin tildes ni espacios. */
export function slugFile(...parts: string[]) {
  return parts
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
