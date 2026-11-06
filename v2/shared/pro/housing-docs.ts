import type { ProData, ProLeadContract, ProProperty, ProRoom, ProTenant } from "./types";
import type { ProMoveOut, ProTenantDocs } from "./housing-types";
import { addDays, money } from "./format";
import { addMonths } from "./housing";
import {
  DEFAULT_RULES,
  INVENTORY_STATE,
  depositMonths,
  inventoryChanges,
  monthLabel,
  settlement,
  type Receipt,
  type ownerStatement,
} from "./housing-ops";

/**
 * Documentos imprimibles del motor de vivienda: recibo mensual, contrato,
 * liquidación de fianza y liquidación a propietarios. Devuelven una página
 * HTML completa y sin dependencias que la web abre en una pestaña para
 * imprimir o guardar como PDF. Todo el texto variable se escapa.
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const e = escapeHtml;

function longDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Página base: tipografía del sistema, tinta negra y márgenes de A4. */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, "Segoe UI", Inter, Roboto, sans-serif; color: black; background: white; max-width: 720px; margin: 24px auto; padding: 0 16px; line-height: 1.5; font-size: 14px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 15px; margin: 22px 0 6px; }
  p { margin: 6px 0; }
  .muted { color: dimgray; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px solid gainsboro; }
  .total { font-weight: 700; font-size: 16px; border-bottom: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid gainsboro; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .sign { display: flex; gap: 32px; margin-top: 48px; }
  .sign div { flex: 1; border-top: 1px solid black; padding-top: 6px; }
  .print { margin: 24px 0; }
  @media print { .print { display: none; } body { margin: 0; } }
</style>
</head>
<body>
<p class="print muted">Para guardarlo en PDF, elige Imprimir en tu navegador y después Guardar como PDF.</p>
${body}
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Recibo                                                              */
/* ------------------------------------------------------------------ */

export function receiptHtml(data: ProData, tenant: ProTenant, receipt: Receipt, property?: ProProperty, room?: ProRoom): string {
  const paid = receipt.status === "paid";
  const lines = [
    `<div class="row"><span>Renta de ${e(room?.name.toLowerCase() ?? "la habitación")}, ${e(monthLabel(receipt.month, "long"))}</span><span>${money(receipt.rentCents)}</span></div>`,
    ...receipt.utilities.map((u) => `<div class="row"><span>${e(u.label)} <span class="muted">(${e(u.period)})</span></span><span>${money(u.cents)}</span></div>`),
    `<div class="row total"><span>Total</span><span>${money(receipt.totalCents)}</span></div>`,
  ].join("\n");
  return page(
    `Recibo ${receipt.number}`,
    `<h1>Recibo de alquiler</h1>
<p class="muted">N.º ${e(receipt.number)} · Periodo del ${longDate(receipt.from)} al ${longDate(receipt.to)}</p>
<h2>Arrendador</h2>
<p>${e(data.space.owner.name)}${data.space.owner.name !== data.space.name ? `, ${e(data.space.name)}` : ""}<br>${e(data.space.address)}</p>
<h2>Inquilino</h2>
<p>${e(tenant.name)}<br>${e(property?.address ?? "")}${room ? `, ${e(room.name.toLowerCase())}` : ""}</p>
<h2>Detalle</h2>
${lines}
<p style="margin-top:16px">${paid ? `Cobrado${receipt.paidAt ? ` el ${longDate(receipt.paidAt)}` : ""}.` : "Pendiente de pago."}</p>
<div class="sign"><div>Firma del arrendador</div></div>`,
  );
}

/* ------------------------------------------------------------------ */
/* Contrato                                                            */
/* ------------------------------------------------------------------ */

export type ContractInput = {
  tenantName: string;
  university: string;
  property: ProProperty;
  room?: ProRoom;
  contract: ProLeadContract;
  docs?: ProTenantDocs;
  /** Grupo que alquila el piso entero. */
  group?: string[];
};

function utilitiesClause(contract: ProLeadContract, property: ProProperty) {
  if (contract.utilities === "included") return "Los suministros (luz, agua, gas e internet) están incluidos en la renta.";
  const cap = contract.utilitiesCapCents ?? property.utilitiesCapCents;
  if (contract.utilities === "cap" && cap)
    return `Los suministros están incluidos hasta ${money(cap)} al mes por persona. Lo que supere esa cantidad se reparte entre los inquilinos por días de estancia.`;
  return "Los suministros (luz, agua, gas e internet) se pagan aparte y se reparten entre los inquilinos por días de estancia, con la factura a la vista.";
}

export function contractHtml(data: ProData, input: ContractInput): string {
  const { property, room, contract } = input;
  const end = addDays(addMonths(contract.start, contract.months), -1);
  const deposit = contract.rentCents * depositMonths(contract.kind);
  const rules = property.rules?.length ? property.rules : DEFAULT_RULES;
  const guarantor = input.docs?.guarantor;
  const object = input.group
    ? `la vivienda completa situada en ${e(property.address)}, de ${property.rooms.length} habitaciones, para uso compartido de ${input.group.length} personas`
    : `la ${e(room?.name.toLowerCase() ?? "habitación")} (${room?.sizeM2 ?? ""} m²) de la vivienda situada en ${e(property.address)}, con uso compartido de cocina, baño y zonas comunes`;
  const kindTitle = contract.kind === "temporada" ? "por temporada" : contract.kind === "habitacion" ? "de habitación" : "de vivienda";
  return page(
    `Contrato ${input.tenantName}`,
    `<h1>Contrato de arrendamiento ${kindTitle}</h1>
<p class="muted">${e(data.space.city)}, a ${longDate(new Date().toISOString())}</p>

<h2>Partes</h2>
<p><strong>Arrendador:</strong> ${e(data.space.owner.name)}${data.space.owner.name !== data.space.name ? `, en representación de la propiedad a través de ${e(data.space.name)}` : ""}, con domicilio en ${e(data.space.address)}. DNI: ______________</p>
<p><strong>Arrendatario:</strong> ${e(input.group ? input.group.join(", ") : input.tenantName)}, estudiante de la ${e(input.university)}. DNI o NIE: ______________</p>
${guarantor ? `<p><strong>Avalista:</strong> ${e(guarantor.name)}${guarantor.relation ? ` (${e(guarantor.relation)})` : ""}${guarantor.phone ? `, teléfono ${e(guarantor.phone)}` : ""}. DNI: ______________</p>` : ""}

<h2>1. Objeto</h2>
<p>Se arrienda ${object}.${property.compliance?.cadastralRef ? ` Referencia catastral ${e(property.compliance.cadastralRef)}.` : ""}${property.compliance?.nrua ? ` NRUA ${e(property.compliance.nrua)}.` : ""}${property.compliance?.energyLetter ? ` Calificación energética ${e(property.compliance.energyLetter)}; el arrendatario recibe copia del certificado.` : ""}</p>

<h2>2. Duración</h2>
<p>Del ${longDate(contract.start)} al ${longDate(end)} (${contract.months} meses).${contract.kind === "temporada" ? ` El arrendamiento es de temporada por el siguiente motivo: ${e(contract.reason?.trim() || "estudios universitarios durante el curso académico")}. No constituye la vivienda habitual y permanente del arrendatario.${input.docs?.items.enrolment?.status === "received" ? " El arrendatario acredita este motivo con su matrícula o carta de admisión, de la que se guarda copia junto a este contrato." : ""}` : ""}</p>

<h2>3. Renta</h2>
<p>${money(contract.rentCents)} al mes${input.group ? " por persona" : ""}, pagaderos por adelantado dentro de los cinco primeros días de cada mes mediante transferencia a la cuenta que indique el arrendador, que entregará recibo de cada pago.</p>

<h2>4. Fianza</h2>
<p>El arrendatario entrega ${money(deposit)}${input.group ? " por persona" : ""} (${depositMonths(contract.kind) === 2 ? "dos mensualidades" : "una mensualidad"}) en concepto de fianza, que el arrendador depositará en la Generalitat Valenciana. Se devolverá al terminar el contrato, una vez revisado el estado de ${input.group ? "la vivienda" : "la habitación"} con el inventario de entrada.</p>

<h2>5. Suministros</h2>
<p>${utilitiesClause(contract, property)}</p>

<h2>6. Normas de la casa</h2>
<ul>${rules.map((r) => `<li>${e(r)}</li>`).join("")}</ul>

<h2>7. Inventario</h2>
<p>Se adjunta el inventario de ${input.group ? "la vivienda" : "la habitación"} con fotos, firmado por ambas partes el día de la entrada.</p>

<div class="sign"><div>El arrendador</div><div>El arrendatario</div>${guarantor ? "<div>El avalista</div>" : ""}</div>
<p class="muted" style="margin-top:32px">Generado con Franky Pro a partir de los datos del contrato. Revísalo antes de firmar.</p>`,
  );
}

/* ------------------------------------------------------------------ */
/* Salida y fianza                                                     */
/* ------------------------------------------------------------------ */

export function moveOutHtml(data: ProData, tenant: ProTenant, moveOut: ProMoveOut, property?: ProProperty, room?: ProRoom): string {
  const s = settlement(tenant, moveOut);
  const changes = tenant.inventory ? inventoryChanges(tenant.inventory) : [];
  return page(
    `Liquidación de fianza ${tenant.name}`,
    `<h1>Liquidación de la fianza</h1>
<p class="muted">${e(tenant.name)} · ${e(property?.title ?? "")}${room ? `, ${e(room.name.toLowerCase())}` : ""} · salida el ${longDate(moveOut.date)}</p>
<h2>Estado de la habitación</h2>
${
  tenant.inventory
    ? `<table><thead><tr><th>Elemento</th><th>Al entrar</th><th>Al salir</th></tr></thead><tbody>${tenant.inventory.items
        .map((i) => `<tr><td>${e(i.label)}</td><td>${INVENTORY_STATE[i.in].label}</td><td>${i.out ? INVENTORY_STATE[i.out].label : "Sin revisar"}</td></tr>`)
        .join("")}</tbody></table>
<p class="muted">${changes.length ? `${changes.length} cambios respecto a la entrada.` : "Sin daños respecto a la entrada."} Fotos: ${tenant.inventory.inPhotos} a la entrada, ${tenant.inventory.outPhotos ?? 0} a la salida.</p>`
    : "<p>Sin inventario de entrada.</p>"
}
<h2>Cuentas</h2>
<div class="row"><span>Fianza entregada</span><span>${money(s.depositCents)}</span></div>
${moveOut.deductions.map((d) => `<div class="row"><span>Descuento: ${e(d.label)}</span><span>-${money(d.amountCents)}</span></div>`).join("\n")}
<div class="row total"><span>A devolver</span><span>${money(s.returnCents)}</span></div>
${moveOut.note ? `<p>${e(moveOut.note)}</p>` : ""}
<div class="sign"><div>${e(data.space.owner.name)}</div><div>${e(tenant.name)}</div></div>`,
  );
}

/* ------------------------------------------------------------------ */
/* Liquidación a propietario                                            */
/* ------------------------------------------------------------------ */

export function statementHtml(data: ProData, statement: ReturnType<typeof ownerStatement>): string {
  const rows = statement.lines
    .map(
      (l) =>
        `<tr><td>${e(l.property.title)}<br><span class="muted">${l.paidRents} rentas cobradas</span></td><td class="num">${money(l.rentCents)}</td><td class="num">-${money(l.feeCents)}</td><td class="num">-${money(l.expensesCents)}</td><td class="num"><strong>${money(l.netCents)}</strong></td></tr>`,
    )
    .join("");
  return page(
    `Liquidación ${statement.owner.name} ${statement.month}`,
    `<h1>Liquidación de ${e(monthLabel(statement.month, "long"))} ${statement.month.slice(0, 4)}</h1>
<p class="muted">${e(statement.owner.name)} · gestionado por ${e(data.space.name)}</p>
<table><thead><tr><th>Piso</th><th class="num">Rentas</th><th class="num">Honorarios (${Math.round(statement.owner.feePct * 100)} %)</th><th class="num">Gastos</th><th class="num">Neto</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="row total" style="margin-top:12px"><span>${statement.netCents < 0 ? "A cargo del propietario" : "A transferir"}</span><span>${money(Math.abs(statement.netCents))}</span></div>
<p class="muted">Los gastos incluyen las reparaciones de incidencias con su factura.</p>`,
  );
}

/* ------------------------------------------------------------------ */
/* Cartel del piso con QR                                               */
/* ------------------------------------------------------------------ */

export type PropertyPosterInput = {
  property: ProProperty;
  /** Enlace de la ficha pública del piso (el mismo que lleva el QR). */
  url: string;
  /** QR ya dibujado en SVG por la web; sin él se imprime solo el enlace. */
  qrSvg?: string;
  campus: string;
};

/**
 * Cartel A4 para el portal, la facultad o el escaparate: habitaciones libres
 * con precio y fecha, minutos al campus, letra energética (obligatoria en
 * cualquier anuncio) y el QR que abre el piso en Franky.
 */
export function propertyPosterHtml(data: ProData, input: PropertyPosterInput): string {
  const { property: p, url, qrSvg, campus } = input;
  const rooms = p.rooms
    .filter((r) => r.status === "free" || r.status === "leaving")
    .sort((a, b) => a.availableFrom.localeCompare(b.availableFrom));
  const rows = rooms
    .map(
      (r) =>
        `<tr><td><strong>${e(r.name)}</strong><br><span class="muted">${r.sizeM2} m²${r.exterior ? ", exterior" : ""}${r.privateBath ? ", baño propio" : ""}</span></td><td>Desde el ${e(longDate(r.availableFrom))}</td><td class="num"><strong>${money(r.priceCents, { round: true })}</strong> al mes</td></tr>`,
    )
    .join("");
  const letter = p.compliance?.energyLetter;
  const facts = [
    `${p.minutesToCampus} min a ${e(campus)}`,
    `${p.rooms.length} habitaciones`,
    letter ? `Certificado energético ${letter}` : "",
    p.compliance?.nrua ? `NRUA ${e(p.compliance.nrua)}` : "",
  ].filter(Boolean);
  return page(
    `Cartel ${p.title}`,
    `<p class="muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:700;font-size:12px">Habitaciones para estudiantes</p>
<h1 style="font-size:34px;line-height:1.1;margin-top:6px">${e(p.title)}</h1>
<p style="font-size:16px">${e(p.address)} · ${e(p.zone)}</p>
<p class="muted">${facts.join(" · ")}</p>
${
  rooms.length
    ? `<h2>Libres</h2><table><tbody>${rows}</tbody></table>`
    : `<h2>Ahora mismo está lleno</h2><p>Escanea el código y apúntate: te avisamos cuando se libere una habitación.</p>`
}
<div style="display:flex;gap:28px;align-items:center;margin-top:36px;padding-top:24px;border-top:1px solid gainsboro">
  ${qrSvg ? `<div style="width:190px;height:190px;flex:none">${qrSvg}</div>` : ""}
  <div>
    <p style="font-size:24px;font-weight:800;margin:0;line-height:1.15">Escanea y pide visita en Franky</p>
    <p class="muted" style="margin-top:8px">Presencial o por vídeo. Tu universidad aparece verificada.</p>
    <p style="margin-top:10px;word-break:break-all">${e(url.replace(/^https:\/\//, ""))}</p>
    <p class="muted">${e(data.space.name)}</p>
  </div>
</div>`,
  );
}
