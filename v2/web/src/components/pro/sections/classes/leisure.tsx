"use client";

import * as React from "react";
import { Building2, Cake, FileText, Globe2, MessageCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProBooking, ProClassSession } from "@/lib/pro/types";
import type { ProSeatMaterial } from "@/lib/pro/classes-types";
import { dayLabel, localDate, localMinutes, money, plural, time } from "@/lib/pro/format";
import { FALLBACK_PER_PLAYER_CENTS, isRoomMode } from "@/lib/pro/classes";
import { CHARGE_METHOD_LABEL, extrasOf } from "@/lib/pro/classes-care";
import { roomBookingOf, typeExtra } from "@/lib/pro/classes-ops";
import {
  BIRTHDAY_EXTRAS,
  SEAT_UNIT_LABEL,
  birthdayMessage,
  birthdaysComing,
  companyComplete,
  erasmusSuggestion,
  formatQuantity,
  invoiceAmount,
  invoiceTotals,
  knownRooms,
  setStaffSkills,
  staffGaps,
  issueInvoice,
  markBirthdayGreeted,
  materialNeeds,
  setCompany,
  setMaterialStock,
  setSeatMaterial,
  toggleBookingExtra,
  validTaxId,
} from "@/lib/pro/classes-leisure";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, FormField, Panel, Pill, Tip, inputClass } from "../../kit";
import type { OfferPreset } from "../common/offer-composer";
import { escapeHtml, printSheet } from "./ui";

/**
 * Ocio, talleres y escape room, tercera ola: el pack de cumpleaños y la
 * felicitación del año siguiente, el material de los talleres, la factura
 * para empresas y la bienvenida a los Erasmus.
 */

function senderOf(data: { space: { name: string; owner: { firstName?: string } } }) {
  return data.space.owner.firstName || data.space.name;
}

/* ------------------------------------------------------------------ */
/* Pack de cumpleaños en la ficha de la reserva                        */
/* ------------------------------------------------------------------ */

export function BirthdayExtras({ bookingId }: { bookingId: string }) {
  const { data, update } = usePro();
  const info = roomBookingOf(data, bookingId);
  if (!info.birthdayOf) return null;
  const chosen = new Set(info.extras ?? []);
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
        <Cake className="h-3.5 w-3.5" strokeWidth={1.8} /> Pack de cumpleaños
      </p>
      <div className="flex flex-wrap gap-1.5">
        {BIRTHDAY_EXTRAS.map((extra) => {
          const on = chosen.has(extra);
          return (
            <button
              key={extra}
              type="button"
              aria-pressed={on}
              onClick={() => void update("room.extras", (d) => toggleBookingExtra(d, bookingId, extra))}
              className={cn(
                "min-h-10 rounded-xl border px-3 text-sm font-semibold transition-colors",
                on
                  ? "border-violet bg-violet-50 text-violet-deep"
                  : "border-border text-text-secondary hover:border-text-primary/25",
              )}
            >
              {extra}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Factura para empresas                                               */
/* ------------------------------------------------------------------ */

export function CompanyInvoice({ session, booking }: { session: ProClassSession; booking: ProBooking }) {
  const { data, now, update, can } = usePro();
  const toast = useToast();
  const info = roomBookingOf(data, booking.id);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(info.company?.name ?? "");
  const [taxId, setTaxId] = React.useState(info.company?.taxId ?? "");
  const [address, setAddress] = React.useState(info.company?.address ?? "");
  const ct = data.classTypes.find((c) => c.id === session.classTypeId);
  const amount = invoiceAmount(info, booking);
  const complete = companyComplete(info.company);

  const save = () => {
    void update("room.company", (d) => setCompany(d, booking.id, { name, taxId, address }));
    toast.success("Datos guardados", "Ya puedes emitir la factura.");
    setOpen(false);
  };

  const print = (invoiceNo: string, issuedIso: string) => {
    const company = roomBookingOf(data, booking.id).company ?? info.company;
    if (!company) return;
    const totals = invoiceTotals(amount);
    const players = info.players ?? booking.partySize;
    const ok = printSheet(
      `Factura ${invoiceNo}`,
      `h1{font-size:26px;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
td,th{border-bottom:1px solid #e6e4ec;padding:8px 6px;text-align:left}th{font-size:12px;color:#6b6878}
.r{text-align:right}.grid{display:flex;justify-content:space-between;gap:24px;margin-top:24px;font-size:14px}.muted{color:#6b6878}`,
      `<h1>Factura ${escapeHtml(invoiceNo)}</h1><p class="muted">Fecha: ${escapeHtml(
        dayLabel(issuedIso, { weekday: false }),
      )}</p>
<div class="grid"><div><b>${escapeHtml(data.space.name)}</b><br>${escapeHtml(data.space.address)}<br>${escapeHtml(
        data.space.city,
      )}</div><div><b>${escapeHtml(company.name)}</b><br>${escapeHtml(company.taxId)}<br>${escapeHtml(
        company.address,
      )}</div></div>
<table><tr><th>Concepto</th><th>Día</th><th class="r">Importe</th></tr>
<tr><td>${escapeHtml(ct?.name ?? "Sala")}, ${players} personas</td><td>${escapeHtml(
        dayLabel(session.start, { weekday: false }),
      )} a las ${escapeHtml(time(session.start))}</td><td class="r">${escapeHtml(money(totals.totalCents))}</td></tr>
<tr><td colspan="2" class="r muted">Base imponible</td><td class="r">${escapeHtml(money(totals.baseCents))}</td></tr>
<tr><td colspan="2" class="r muted">IVA ${totals.vatPct} %</td><td class="r">${escapeHtml(money(totals.vatCents))}</td></tr>
<tr><td colspan="2" class="r"><b>Total</b></td><td class="r"><b>${escapeHtml(money(totals.totalCents))}</b></td></tr></table>
${info.paidMethod ? `<p class="muted">Pagado por ${escapeHtml(CHARGE_METHOD_LABEL[info.paidMethod].toLowerCase())}.</p>` : ""}`,
    );
    if (!ok) toast.info("Permite las ventanas", "Tu navegador ha bloqueado la factura para imprimir.");
  };

  const issue = () => {
    const next = issueInvoice(data, booking.id, now);
    const no = roomBookingOf(next, booking.id).invoiceNo;
    if (!no) return;
    void update("room.invoice", (d) => issueInvoice(d, booking.id, now));
    toast.success(`Factura ${no}`, "Lista para imprimir o guardar en PDF.");
    print(no, now.toISOString());
  };

  if (!info.company && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-violet"
      >
        <Building2 className="h-4 w-4" strokeWidth={1.8} /> Piden factura de empresa
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-bg-secondary p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          <span className="truncate">{info.company?.name || "Factura de empresa"}</span>
        </p>
        {info.invoiceNo ? <Pill tone="success">{info.invoiceNo}</Pill> : null}
      </div>
      {open ? (
        <div className="flex flex-col gap-2">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Razón social" aria-label="Razón social" />
          <input
            className={inputClass}
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder="CIF o NIF"
            aria-label="CIF o NIF"
            autoCapitalize="characters"
          />
          {taxId && !validTaxId(taxId) ? (
            <p className="text-xs text-rose-700 dark:text-rose-300">Revisa el CIF o NIF: 8 números y letra, o letra, 7 números y control.</p>
          ) : null}
          <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección fiscal" aria-label="Dirección fiscal" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="dark"
              disabled={!name.trim() || !address.trim() || !validTaxId(taxId)}
              onClick={save}
            >
              Guardar datos
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-text-muted">
            {info.company?.taxId} · {info.company?.address}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {info.invoiceNo ? (
              <Button size="sm" variant="secondary" onClick={() => print(info.invoiceNo!, info.invoicedAt ?? now.toISOString())}>
                <FileText className="h-3.5 w-3.5" /> Ver factura
              </Button>
            ) : (
              <Button size="sm" variant="dark" disabled={!complete || !can("room.invoice")} onClick={issue}>
                <FileText className="h-3.5 w-3.5" /> Emitir factura de {money(amount)}
              </Button>
            )}
            {!info.invoiceNo ? (
              <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
                Editar datos
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hoy: cumpleaños que vuelven                                         */
/* ------------------------------------------------------------------ */

export function BirthdaysToday() {
  const { data, now, update } = usePro();
  const coming = birthdaysComing(data, now);
  if (!coming.length) return null;
  return (
    <Panel
      title="Cumpleaños que vuelven"
      description="Lo celebraron aquí el año pasado. Un mensaje ahora y repiten."
      flush
    >
      <ul className="divide-y divide-border-light">
        {coming.map((b) => {
          const link = customerWhatsApp(b.phone, birthdayMessage(b, senderOf(data), data.space.name));
          return (
            <li key={b.bookingId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={b.honoree} size="sm" tone="violet" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">Cumple de {b.honoree}</span>
                <span className="block truncate text-xs text-text-muted">
                  {b.daysLeft === 0 ? "Hoy" : `En ${plural(b.daysLeft, "día", "días")}`} · reservó {b.contactName}
                </span>
              </span>
              {link ? (
                <Button size="sm" variant="secondary" asChild>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => void update("room.greeted", (d) => markBirthdayGreeted(d, b.bookingId, now))}
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Felicitar
                  </a>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Hoy: material de los talleres                                       */
/* ------------------------------------------------------------------ */

export function MaterialNeedsPanel() {
  const { data, now } = usePro();
  const needs = materialNeeds(data, now).filter((n) => n.seats > 0);
  if (!needs.length) return null;
  const short = needs.filter((n) => n.shortSeats > 0);
  return (
    <Panel
      title="Material de la semana"
      description={
        short.length
          ? `Te falta material para ${plural(short.reduce((a, n) => a + n.shortSeats, 0), "plaza", "plazas")} con las reservas de los próximos 7 días.`
          : "Tienes material para todas las reservas de los próximos 7 días."
      }
      flush
    >
      <ul className="divide-y divide-border-light">
        {needs.map((n) => (
          <li key={n.classType.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Package className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.8} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{n.classType.name}</span>
              <span className="block truncate text-xs text-text-muted">
                {plural(n.seats, "plaza", "plazas")} gastan {formatQuantity(n.need)} {SEAT_UNIT_LABEL[n.material.unit]} de{" "}
                {n.material.item}, tienes {formatQuantity(n.material.stock)}
              </span>
            </span>
            {n.shortSeats ? (
              <Pill tone="danger">Faltan para {n.shortSeats}</Pill>
            ) : (
              <Pill tone="success">Hay de sobra</Pill>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Material por plaza de un taller, en Salas y precios. */
export function SeatMaterialEditor({ typeId }: { typeId: string }) {
  const { data, update } = usePro();
  const toast = useToast();
  const current = typeExtra(data, typeId).seatMaterial;
  const [item, setItem] = React.useState(current?.item ?? "");
  const [perSeat, setPerSeat] = React.useState(current ? String(current.perSeat).replace(".", ",") : "");
  const [unit, setUnit] = React.useState<ProSeatMaterial["unit"]>(current?.unit ?? "kg");
  const [stock, setStock] = React.useState(current ? String(current.stock).replace(".", ",") : "");
  const num = (v: string) => Number(v.replace(",", "."));
  const valid = item.trim() && num(perSeat) > 0 && num(stock) >= 0;

  const save = () => {
    if (!valid) return;
    const material = { item, perSeat: num(perSeat), unit, stock: num(stock) || 0 };
    // Si solo cambia lo que hay en el almacén, se guarda como recuento.
    const onlyStock =
      current && current.item === item.trim() && current.perSeat === material.perSeat && current.unit === unit;
    void update(onlyStock ? "material.stock" : "material.setup", (d) =>
      onlyStock ? setMaterialStock(d, typeId, material.stock) : setSeatMaterial(d, typeId, material),
    );
    toast.success("Material guardado", "Hoy te avisa si falta para las reservas de la semana.");
  };

  return (
    <FormField
      label="Material por plaza"
      hint="Barro, lienzos, velas... Hoy te avisa si no llega para las reservas de la semana."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <input className={cn(inputClass, "col-span-2 sm:col-span-1")} value={item} onChange={(e) => setItem(e.target.value)} placeholder="Qué: barro" aria-label="Material" />
        <input className={inputClass} inputMode="decimal" value={perSeat} onChange={(e) => setPerSeat(e.target.value)} placeholder="Por plaza" aria-label="Cantidad por plaza" />
        <input className={inputClass} inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="En almacén" aria-label="Cantidad en el almacén" />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <ChoiceChips
          value={unit}
          onChange={setUnit}
          options={(Object.keys(SEAT_UNIT_LABEL) as ProSeatMaterial["unit"][]).map((u) => ({
            value: u,
            label: SEAT_UNIT_LABEL[u],
          }))}
        />
        <Button size="sm" variant="secondary" disabled={!valid} onClick={save}>
          Guardar material
        </Button>
      </div>
    </FormField>
  );
}

/* ------------------------------------------------------------------ */
/* Hoy: bienvenida a los Erasmus                                       */
/* ------------------------------------------------------------------ */

export function ErasmusCard({ onOffer }: { onOffer?: (preset: OfferPreset) => void }) {
  const { data, now } = usePro();
  const suggestion = erasmusSuggestion(data, now);
  if (!suggestion) return null;
  const first = suggestion.sessions[0];
  const month = localDate(now).slice(5, 7);
  const offer = () => {
    const s = first.session;
    const room = isRoomMode(data, data.classTypes.find((c) => c.id === s.classTypeId));
    // Mismo punto de partida que al ofrecer un hueco desde el horario: el
    // precio se ajusta en la propia oferta.
    onOffer?.({
      title: `${first.typeName} en inglés para Erasmus`,
      what: `${first.typeName} en inglés`,
      date: localDate(s.start),
      from: localMinutes(s.start),
      to: localMinutes(s.end),
      priceCents: room ? FALLBACK_PER_PLAYER_CENTS : 1200,
      slots: room ? 1 : Math.max(1, s.capacity - s.booked),
    });
  };
  return (
    <Tip title={month === "09" || month === "10" ? "Llegan los Erasmus de septiembre" : "Llegan los Erasmus de febrero"}>
      <span className="flex items-start gap-2">
        <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.8} />
        <span>
          Tienes {plural(suggestion.sessions.length, "sesión en inglés", "sesiones en inglés")} con sitio en las
          próximas tres semanas (la primera, {first.typeName} el {first.label}). Buscan planes en grupo para conocer
          gente.{" "}
          {onOffer ? (
            <button type="button" onClick={offer} className="font-semibold text-violet">
              Ofrecerla a Erasmus
            </button>
          ) : null}
        </span>
      </span>
    </Tip>
  );
}

/* ------------------------------------------------------------------ */
/* Game masters: qué salas lleva cada uno y en qué idiomas             */
/* ------------------------------------------------------------------ */

const LANGUAGES: { value: string; label: string }[] = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "fr", label: "Francés" },
  { value: "de", label: "Alemán" },
  { value: "it", label: "Italiano" },
];

function ToggleChip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPress}
      className={cn(
        "min-h-10 rounded-xl border px-3 text-sm font-semibold transition-colors",
        on ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
      )}
    >
      {label}
    </button>
  );
}

export function GameMastersView() {
  const { data, now, update, can } = usePro();
  const rooms = knownRooms(data);
  const skills = extrasOf(data).staff;
  const team = data.staff.filter((s) => s.role !== "reception");
  const gaps = staffGaps(data, now);
  const editable = can("staff.skills");

  const toggle = (staffId: string, key: "rooms" | "languages", value: string) => {
    const current = skills[staffId] ?? { languages: ["es"], rooms: [] };
    const list = current[key].includes(value) ? current[key].filter((v) => v !== value) : [...current[key], value];
    void update("staff.skills", (d) => setStaffSkills(d, staffId, { ...current, [key]: list }));
  };

  return (
    <div className="flex flex-col gap-4">
      {gaps.length ? <StaffGapsPanel /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {team.map((s) => {
          const k = skills[s.id] ?? { languages: ["es"], rooms: [] };
          return (
            <Panel key={s.id} title={s.name} description={s.title ?? undefined}>
              <div className="flex flex-col gap-4">
                <FormField label="Salas que lleva" hint={k.rooms.length ? undefined : "Sin marcar: puede llevar todas."}>
                  <div className="flex flex-wrap gap-1.5">
                    {rooms.map((r) => (
                      <ToggleChip key={r} on={k.rooms.includes(r)} label={r} onPress={() => editable && toggle(s.id, "rooms", r)} />
                    ))}
                  </div>
                </FormField>
                <FormField label="Idiomas">
                  <div className="flex flex-wrap gap-1.5">
                    {LANGUAGES.map((l) => (
                      <ToggleChip
                        key={l.value}
                        on={k.languages.includes(l.value)}
                        label={l.label}
                        onPress={() => editable && toggle(s.id, "languages", l.value)}
                      />
                    ))}
                  </div>
                </FormField>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

/** Partidas de la semana que su game master no puede llevar. */
export function StaffGapsPanel() {
  const { data, now } = usePro();
  const gaps = staffGaps(data, now);
  if (!gaps.length) return null;
  return (
    <Panel
      title="Partidas sin game master que las pueda llevar"
      description="Cámbialas de persona desde la sesión antes de que lleguen."
      flush
    >
      <ul className="divide-y divide-border-light">
        {gaps.slice(0, 6).map((g) => (
          <li key={g.session.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <span className="w-24 shrink-0 text-xs font-semibold capitalize text-text-muted">
              {dayLabel(g.session.start, { weekday: true }).split(",")[0]} {time(g.session.start)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{g.typeName}</span>
              <span className="block truncate text-xs text-text-muted">
                {g.coachName ? `${g.coachName.split(" ")[0]}: ` : ""}
                {g.why}
              </span>
            </span>
            <Pill tone="warning">Revisar</Pill>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
