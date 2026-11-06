"use client";

import * as React from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowUpRight, Copy, DoorOpen, Hammer, LogIn, LogOut, MapPin, MessageCircle, Printer, Scale, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProProperty } from "@/lib/pro/types";
import { money } from "@/lib/pro/format";
import { shortDate } from "@/lib/pro/housing";
import { patchProperty, whatsappHref } from "@/lib/pro/housing-ops";
import { portfolioMap, posterRooms, propertyHistory, propertyPublicUrl, propertyShareText, type HistoryEvent } from "@/lib/pro/housing-tools";
import { propertyPosterHtml } from "@/lib/pro/housing-docs";
import { roomsVsWhole, roomsVsWholeText } from "@/lib/pro/housing-desk";
import { cn } from "@/lib/utils";
import { Empty, FormField, Pill, inputClass } from "../../kit";
import { openPrintable, slugFile } from "./output";
import { euros } from "./shared";

/**
 * Lo que se hace con un piso más allá de sus habitaciones: compartirlo con su
 * enlace, su texto y su cartel con QR; ver su historia curso a curso; y
 * comparar lo que deja por habitaciones con lo que dejaría entero.
 */

/* ------------------------------------------------------------------ */
/* Compartir el piso                                                    */
/* ------------------------------------------------------------------ */

export function SharePropertyBox({ property }: { property: ProProperty }) {
  const { data } = usePro();
  const toast = useToast();
  const [printing, setPrinting] = React.useState(false);
  // En la web se enseña el enlace del sitio en el que se está; el QR impreso lleva siempre franky.es.
  const origin = typeof window === "undefined" ? "https://franky.es" : window.location.origin;
  const printedUrl = propertyPublicUrl(data.space.slug, property.id);
  const liveHref = `/n/${encodeURIComponent(data.space.slug)}?piso=${encodeURIComponent(property.id)}`;
  const text = propertyShareText(data, property);
  const free = posterRooms(property);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${origin}${liveHref}`);
      toast.success("Enlace copiado", "Pégalo en tu anuncio, en Instagram o en el grupo de la facultad.");
    } catch {
      toast.error("No se ha podido copiar", "Mantén pulsado el enlace para copiarlo a mano.");
    }
  };

  const poster = async () => {
    setPrinting(true);
    let qrSvg: string | undefined;
    try {
      qrSvg = await QRCode.toString(printedUrl, { type: "svg", margin: 0 });
    } catch {
      // Sin QR el cartel lleva el enlace escrito.
      qrSvg = undefined;
    }
    const html = propertyPosterHtml(data, { property, url: printedUrl, qrSvg, campus: data.space.campus });
    const how = openPrintable(html, slugFile("cartel", property.title));
    setPrinting(false);
    if (how === "downloaded") toast.info("Cartel descargado", "Ábrelo y elige Imprimir. Queda bien en A4.");
  };

  if (!property.published)
    return (
      <Empty
        icon={DoorOpen}
        title="Publícalo para compartirlo"
        body="Cuando el piso esté publicado tendrá su ficha con las habitaciones libres y las visitas que se reservan solas."
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border p-3.5">
        <p className="text-sm font-semibold">Su ficha en Franky</p>
        <p className="mt-0.5 text-xs text-text-muted">
          {free.length
            ? `Enseña ${free.length === 1 ? "la habitación libre" : `las ${free.length} habitaciones libres`}, el precio y las franjas de visita. Quien reserva entra en Visitas.`
            : "Está lleno: la ficha deja apuntarse a la lista de espera."}
        </p>
        <p className="mt-2.5 truncate rounded-xl bg-bg-secondary px-3 py-2 text-xs tabular text-text-secondary">{printedUrl.replace(/^https:\/\//, "")}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={copy}>
            <Copy className="h-3.5 w-3.5" /> Copiar enlace
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={liveHref}>
              Ver la ficha <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border p-3.5">
        <p className="text-sm font-semibold">Texto para WhatsApp o Instagram</p>
        <p className="mt-2 whitespace-pre-line rounded-xl bg-bg-secondary px-3 py-2.5 text-sm text-text-secondary">{text}</p>
        <Button size="sm" variant="secondary" className="mt-2.5" asChild>
          <a href={whatsappHref(text)} target="_blank" rel="noreferrer">
            <MessageCircle className="h-3.5 w-3.5" /> Compartir por WhatsApp
          </a>
        </Button>
      </div>

      <div className="rounded-2xl border border-border p-3.5">
        <p className="text-sm font-semibold">Cartel con QR</p>
        <p className="mt-0.5 text-xs text-text-muted">
          A4 para el portal, el tablón de la facultad o la copistería: habitaciones libres con precio y fecha, letra energética y el QR que abre la ficha.
        </p>
        <Button size="sm" variant="outline" className="mt-2.5" onClick={poster} loading={printing}>
          <Printer className="h-3.5 w-3.5" /> Imprimir cartel
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Historial del piso                                                   */
/* ------------------------------------------------------------------ */

const EVENT_ICON: Record<HistoryEvent["kind"], typeof LogIn> = {
  move_in: LogIn,
  move_out: LogOut,
  incident: Wrench,
  expense: Hammer,
};

export function PropertyHistoryBox({ property }: { property: ProProperty }) {
  const { data, now } = usePro();
  const courses = propertyHistory(data, property.id, now);
  if (!courses.length)
    return <Empty icon={DoorOpen} title="Aún no hay historia" body="Cada entrada, salida, incidencia y reparación del piso queda aquí, curso a curso." />;
  return (
    <div className="flex flex-col gap-5">
      {courses.map((c) => (
        <section key={c.startYear}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-heading text-base font-bold">{c.label}</p>
            <p className="text-xs text-text-muted tabular">
              {c.tenants} {c.tenants === 1 ? "entrada" : "entradas"} · {c.incidents} {c.incidents === 1 ? "incidencia" : "incidencias"}
              {c.expensesCents ? ` · ${money(c.expensesCents, { round: true })} en gastos` : ""}
            </p>
          </div>
          <ol className="mt-2 flex flex-col border-l border-border pl-4">
            {c.events.map((ev) => {
              const Icon = EVENT_ICON[ev.kind];
              return (
                <li key={ev.id} className="relative py-1.5">
                  <span className="absolute -left-[1.4rem] top-2.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-bg-primary" aria-hidden>
                    <Icon className={cn("h-3.5 w-3.5", ev.kind === "incident" ? "text-amber-700 dark:text-amber-300" : "text-text-muted")} strokeWidth={1.9} />
                  </span>
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                    <span className="min-w-0 font-semibold">{ev.title}</span>
                    <span className="text-xs text-text-muted tabular">{shortDate(ev.date)}</span>
                  </p>
                  <p className="text-xs text-text-muted">
                    {ev.detail}
                    {ev.amountCents ? <span className="tabular"> · {money(ev.amountCents)}</span> : null}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Habitaciones frente a piso entero                                    */
/* ------------------------------------------------------------------ */

export function RoomsVsWholeBox({ property }: { property: ProProperty }) {
  const { update } = usePro();
  const toast = useToast();
  const cmp = roomsVsWhole(property);
  const [editing, setEditing] = React.useState(false);
  const [amount, setAmount] = React.useState(String(Math.round((property.wholeFlatReferenceCents ?? property.wholeFlatPriceCents ?? 0) / 100) || ""));

  const save = async () => {
    const cents = euros(amount);
    if (!(await update("property.whole.reference", (d) => patchProperty(d, property.id, (p) => ({ ...p, wholeFlatReferenceCents: cents || undefined }))))) return;
    toast.success("Comparación guardada", cents ? `Piso entero a ${money(cents)} al mes.` : "Sin renta de referencia.");
    setEditing(false);
  };

  const max = cmp ? Math.max(cmp.roomsCents, cmp.wholeCents) : 1;
  return (
    <div className="rounded-2xl border border-border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Scale className="h-4 w-4 text-text-muted" strokeWidth={1.9} /> Por habitaciones o entero
        </p>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancelar" : cmp ? "Cambiar" : "Comparar"}
        </Button>
      </div>
      {editing || !cmp ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <FormField label="Lo que pedirías por el piso entero (€ al mes)" htmlFor={`whole-ref-${property.id}`} className="min-w-0 flex-1">
            <input id={`whole-ref-${property.id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="950" />
          </FormField>
          <Button size="sm" variant="secondary" className="h-10" onClick={save} disabled={!euros(amount) && !property.wholeFlatReferenceCents}>
            Guardar
          </Button>
        </div>
      ) : null}
      {cmp ? (
        <>
          <div className="mt-3 flex flex-col gap-2">
            {[
              { label: "Habitaciones", cents: cmp.roomsCents, strong: cmp.diffCents >= 0 },
              { label: "Piso entero", cents: cmp.wholeCents, strong: cmp.diffCents < 0 },
            ].map((bar) => (
              <div key={bar.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                <span className="text-text-muted">{bar.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-bg-secondary">
                  <span className={cn("block h-full rounded-full", bar.strong ? "bg-violet" : "bg-text-muted/40")} style={{ width: `${Math.max(4, (bar.cents / max) * 100)}%` }} />
                </span>
                <span className="font-semibold tabular">{money(bar.cents, { round: true })}</span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-sm text-text-secondary">{roomsVsWholeText(cmp)}</p>
          {cmp.diffCents > 0 ? (
            <Pill tone="violet" className="mt-2">
              {cmp.diffPct > 0 ? `+${cmp.diffPct} %` : `${cmp.diffPct} %`} al mes por habitaciones
            </Pill>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-text-muted">Pon lo que pedirías por el piso entero y te enseñamos cuánto ganas por habitaciones y cuántos meses vacíos aguanta.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mapa de la cartera por minutos al campus                             */
/* ------------------------------------------------------------------ */

/**
 * La cartera como regla de distancia: cada zona es una fila y cada piso un
 * punto a sus minutos del campus. Lleno en gris, con libres en violeta y el
 * número de libres dentro. Sirve para saber qué piso enseñar a quien quiere
 * ir andando o a quien le da igual coger el tranvía.
 */
export function PortfolioMap({ onOpen }: { onOpen: (propertyId: string) => void }) {
  const { data } = usePro();
  const map = portfolioMap(data);
  const ticks = Array.from({ length: map.scaleMax / 5 + 1 }, (_, i) => i * 5);
  if (!map.zones.length) return <Empty icon={MapPin} title="Aún no hay pisos" body="Cuando subas pisos, aquí los verás por zona y por minutos al campus." />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {map.bands.map((b) => (
          <div key={b.id} className="rounded-2xl border border-border px-3 py-2.5">
            <p className="text-xs text-text-muted">{b.label}</p>
            <p className="font-heading text-lg font-extrabold tabular">
              {b.flats} <span className="text-sm font-semibold text-text-muted">{b.flats === 1 ? "piso" : "pisos"}</span>
            </p>
            <p className={cn("text-xs tabular", b.free ? "font-semibold text-violet-deep" : "text-text-muted")}>
              {b.free ? `${b.free} ${b.free === 1 ? "libre" : "libres"}` : "Todo lleno"}
            </p>
          </div>
        ))}
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pro-scroll">
        <div className="min-w-[520px] rounded-2xl border border-border p-4">
          <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3">
            <span />
            <div className="relative h-5 text-[0.7rem] text-text-muted tabular">
              {ticks.map((t) => (
                <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(t / map.scaleMax) * 100}%` }}>
                  {t} min
                </span>
              ))}
            </div>
            {map.zones.map((z) => (
              <React.Fragment key={z.zone}>
                <div className="flex flex-col justify-center border-t border-border-light py-3">
                  <span className="truncate text-sm font-semibold">{z.zone}</span>
                  <span className="text-xs text-text-muted tabular">
                    {z.free}/{z.total} libres · {z.avgMinutes} min
                  </span>
                </div>
                <div className="relative min-h-[3.25rem] border-t border-border-light">
                  {ticks.map((t) => (
                    <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-border-light" style={{ left: `${(t / map.scaleMax) * 100}%` }} />
                  ))}
                  {/* Si dos pisos están a los mismos minutos, el segundo baja un poco. */}
                  {z.pins.map((pin, i) => (
                    <button
                      key={pin.property.id}
                      type="button"
                      onClick={() => onOpen(pin.property.id)}
                      title={`${pin.property.title}: ${pin.free} libres de ${pin.total}, ${pin.minutes} min`}
                      aria-label={`${pin.property.title}, ${pin.minutes} minutos, ${pin.free} habitaciones libres de ${pin.total}`}
                      className={cn(
                        "absolute inline-flex h-9 min-w-9 -translate-x-1/2 items-center justify-center rounded-full border-2 px-1.5 text-xs font-bold tabular shadow-card transition-transform hover:scale-110",
                        pin.free ? "border-violet bg-violet text-white" : "border-border bg-bg-secondary text-text-muted",
                      )}
                      style={{ left: `${(pin.minutes / map.scaleMax) * 100}%`, top: `${0.4 + (i % 2) * 0.55}rem` }}
                    >
                      {pin.free || pin.total}
                    </button>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-violet" /> Con libres (el número son las libres)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-border bg-bg-secondary" /> Lleno (el número son sus habitaciones)
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
