/**
 * Tiny CSV exporter — turn an array of rows into a downloadable .csv.
 *
 * Usage from a button handler:
 *
 *   downloadCsv("usuarios-comunidad.csv", [
 *     { label: "Madrid", count: 320 },
 *     { label: "Cataluña", count: 280 },
 *   ]);
 *
 * Notes:
 * - es-ES locale: uses `;` as separator (Excel/Numbers in Spain default).
 * - UTF-8 BOM prepended so Excel shows accents correctly.
 * - Values are quoted only when they contain `;`, `"` or a newline.
 */

type Row = Record<string, string | number | boolean | null | undefined>;

function escape(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Quoting does not stop spreadsheet formulas in user-supplied labels.
  const raw = String(value);
  const s = typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  if (/[;"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((acc, row) => {
      Object.keys(row).forEach((k) => acc.add(k));
      return acc;
    }, new Set())
  );
  const lines = [headers.map(escape).join(";")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(";"));
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, rows: Row[]): void {
  const csv = rowsToCsv(rows);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Download arbitrary data as a JSON file (pretty-printed).
 * Useful for dumping a full analytics snapshot to share / archive.
 */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
