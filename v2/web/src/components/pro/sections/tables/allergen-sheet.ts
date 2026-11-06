import type { ProMenuItem } from "@/lib/pro/types";
import { ALLERGENS } from "@/lib/pro/tables";
import { allergenMatrix } from "@/lib/pro/tables-day";
import { escapeHtml, printDocument } from "./ops-kit";

/**
 * Hoja de alérgenos en A4 horizontal: cada producto de la carta frente a los
 * 14 alérgenos, con la fecha del día en que se imprime. Se vuelve a imprimir
 * cada vez que cambia la carta.
 */
export function printAllergenSheet(
  spaceName: string,
  menu: ProMenuItem[],
  dateLabel: string,
): boolean {
  const head = ALLERGENS.map(
    (a) => `<th class="c" title="${escapeHtml(a.label)}">${escapeHtml(a.label)}</th>`,
  ).join("");
  const sections = allergenMatrix(menu)
    .map(({ section, rows }) => {
      const body = rows
        .map(
          ({ item, has }) =>
            `<tr><td>${escapeHtml(item.name)}${item.available ? "" : " (agotado)"}</td>${has
              .map((on) => `<td class="c">${on ? "X" : ""}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      return `<tr><th colspan="${ALLERGENS.length + 1}">${escapeHtml(section)}</th></tr>${body}`;
    })
    .join("");
  return printDocument(
    `Alérgenos de ${spaceName}`,
    `<style>@page { size: A4 landscape; } th.c { writing-mode: vertical-rl; transform: rotate(180deg); height: 96px; font-size: 10px; } td.c { width: 22px; font-weight: 700; }</style>
<h1>Alérgenos de ${escapeHtml(spaceName)}</h1>
<p class="muted">Revisada el ${escapeHtml(dateLabel)}. Una X indica que el producto contiene ese alérgeno o trazas declaradas. Pregunta al personal ante cualquier duda.</p>
<table><thead><tr><th>Producto</th>${head}</tr></thead><tbody>${sections}</tbody></table>`,
  );
}
