"use client";

import * as React from "react";
import { BadgeCheck, MapPin, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProOffer } from "@/lib/pro/types";
import { atLocal, localDate, localMinutes, minutesToLabel, money } from "@/lib/pro/format";
import type { Gap } from "@/lib/pro/agenda";
import { UNIVERSITIES } from "@/lib/pro/demo/common";
import { cn } from "@/lib/utils";
import { ChoiceChips, Drawer, FormField, inputClass } from "../../kit";

export type OfferPreset =
  | {
      gap?: Gap;
      /** Para sectores sin agenda: qué se ofrece y en qué franja. */
      title?: string;
      what?: string;
      date?: string;
      from?: number;
      to?: number;
      priceCents?: number;
      slots?: number;
    }
  | null;

/** Alcance aproximado: estudiantes con la app que pasan cerca en esa franja. */
function estimatedReach(radiusKm: number, unis: number) {
  const base = radiusKm <= 1 ? 420 : radiusKm <= 2 ? 860 : 2100;
  return Math.round(base * (unis > 1 ? 1.35 : 1));
}

export function OfferComposer({ preset, onClose }: { preset: OfferPreset; onClose: () => void }) {
  const { data, update, now, vertical, pending, can } = usePro();
  const toast = useToast();
  const gap = preset?.gap;
  const staff = gap ? data.staff.find((s) => s.id === gap.staffId) : undefined;
  const staffServices = gap ? data.services.filter((s) => s.staffIds.includes(gap.staffId) && s.online) : [];

  const [serviceId, setServiceId] = React.useState("");
  const [what, setWhat] = React.useState("");
  const [basePrice, setBasePrice] = React.useState("10");
  const [discount, setDiscount] = React.useState(30);
  const [radius, setRadius] = React.useState<"1" | "2" | "5">("2");
  const [unis, setUnis] = React.useState<string[]>([UNIVERSITIES[0]]);
  const [studentsOnly, setStudentsOnly] = React.useState(true);
  const [date, setDate] = React.useState(localDate(now));
  const [from, setFrom] = React.useState(17 * 60);
  const [to, setTo] = React.useState(19 * 60);
  const [slots, setSlots] = React.useState(3);

  React.useEffect(() => {
    if (!preset) return;
    const first = staffServices.find((s) => s.popular) ?? staffServices[0];
    setServiceId(first?.id ?? "");
    setWhat(preset.what ?? "");
    setBasePrice(preset.priceCents ? String(preset.priceCents / 100) : "10");
    setDiscount(30);
    setRadius("2");
    setUnis([UNIVERSITIES[0]]);
    setStudentsOnly(true);
    setDate(gap?.date ?? preset.date ?? localDate(now));
    setFrom(gap?.from ?? preset.from ?? Math.max(localMinutes(now) + 30, 10 * 60));
    setTo(gap?.to ?? preset.to ?? Math.max(localMinutes(now) + 150, 12 * 60));
    setSlots(preset.slots ?? (first ? Math.max(1, Math.floor(((gap?.to ?? 0) - (gap?.from ?? 0)) / first.durationMin)) : 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const service = data.services.find((s) => s.id === serviceId);
  const price = service ? service.priceCents : Math.round(Number(basePrice.replace(",", ".")) * 100) || 0;
  const finalPrice = Math.round((price * (100 - discount)) / 100 / 50) * 50;
  const itemName = service?.name ?? (what || "Tu oferta");
  const reach = estimatedReach(Number(radius), unis.length);
  const valid = to > from && price > 0 && (service || what.trim());

  React.useEffect(() => {
    if (service && gap) setSlots(Math.max(1, Math.floor((gap.to - gap.from) / service.durationMin)));
  }, [service, gap]);

  const launch = async () => {
    const offer: ProOffer = {
      id: localId("o"),
      kind: "flash",
      title: gap ? "Hueco de última hora" : "Oferta relámpago",
      detail: `${itemName} a ${money(finalPrice)} ${date === localDate(now) ? "hoy" : "el " + new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long" })} de ${minutesToLabel(from)} a ${minutesToLabel(to)}`,
      discountPct: discount,
      startsAt: atLocal(date, from),
      endsAt: atLocal(date, to),
      slots,
      claimed: 0,
      audience: { studentsOnly, radiusKm: Number(radius), universities: unis },
      status: "live",
      reach,
      views: 0,
      bookings: 0,
      revenueCents: 0,
      createdAt: new Date().toISOString(),
    };
    if (!(await update("offer.launch", (d) => ({ ...d, offers: [offer, ...d.offers] })))) return;
    toast.success("Oferta publicada");
    onClose();
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      wide
      title={gap ? "Ofrecer este hueco a estudiantes" : "Nueva oferta relámpago"}
      description={
        gap && staff
          ? `${staff.name.split(" ")[0]} tiene libre de ${minutesToLabel(gap.from)} a ${minutesToLabel(gap.to)}.`
          : "Llena una franja floja con un descuento solo para estudiantes."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={launch} disabled={pending || !can("offer.launch") || !valid}>
            <Zap className="h-4 w-4" /> Publicar ahora
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_200px]">
        <div className="flex flex-col gap-5">
          {gap ? (
            <FormField label="Qué ofreces">
              <div className="flex flex-wrap gap-2">
                {staffServices.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setServiceId(s.id)}
                    className={cn(
                      "rounded-xl border px-3 py-1.5 text-sm font-semibold",
                      serviceId === s.id ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary",
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </FormField>
          ) : (
            <>
              <FormField label="Qué ofreces" htmlFor="oc-what" hint="Una frase corta. Por ejemplo: menú del día, clase de prueba, partido de 1 hora.">
                <input id="oc-what" value={what} onChange={(e) => setWhat(e.target.value)} placeholder={vertical.engine === "tables" ? "Café y tostada" : "Tu servicio"} className={inputClass} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Precio normal (€)" htmlFor="oc-price">
                  <input id="oc-price" inputMode="decimal" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Plazas" htmlFor="oc-slots">
                  <input id="oc-slots" type="number" min={1} max={200} value={slots} onChange={(e) => setSlots(Math.max(1, Number(e.target.value)))} className={inputClass} />
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Día" htmlFor="oc-date">
                  <input id="oc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Desde" htmlFor="oc-from">
                  <input id="oc-from" type="time" step={900} value={minutesToLabel(from)} onChange={(e) => setFrom(toMinutes(e.target.value))} className={inputClass} />
                </FormField>
                <FormField label="Hasta" htmlFor="oc-to">
                  <input id="oc-to" type="time" step={900} value={minutesToLabel(to)} onChange={(e) => setTo(toMinutes(e.target.value))} className={inputClass} />
                </FormField>
              </div>
            </>
          )}

          <FormField label={`Descuento: ${discount} %`} htmlFor="oc-discount" hint={`Pasa de ${money(price)} a ${money(finalPrice)}.`}>
            <input
              id="oc-discount"
              type="range"
              min={10}
              max={60}
              step={5}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="w-full accent-[var(--color-violet)]"
            />
          </FormField>

          <FormField label="A quién se enseña">
            <ChoiceChips
              value={radius}
              onChange={setRadius}
              options={[
                { value: "1", label: "A 1 km", hint: "Muy cerca" },
                { value: "2", label: "A 2 km", hint: "El campus" },
                { value: "5", label: "A 5 km", hint: "Toda la zona" },
              ]}
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            {UNIVERSITIES.slice(0, 2).map((u) => {
              const on = unis.includes(u);
              return (
                <button
                  key={u}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setUnis((prev) => (on ? prev.filter((x) => x !== u) : [...prev, u]))}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold",
                    on ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-text-secondary",
                  )}
                >
                  {u}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={studentsOnly} onChange={(e) => setStudentsOnly(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
            Solo estudiantes verificados
          </label>
        </div>

        {/* Así lo ve el estudiante */}
        <div className="md:sticky md:top-0">
          <p className="eyebrow mb-2">Así lo ven</p>
          <div className="rounded-[1.6rem] border border-border bg-bg-secondary p-2.5">
            <div className="rounded-[1.2rem] bg-bg-primary p-3.5 shadow-card">
              <p className="inline-flex items-center gap-1 rounded-full bg-violet px-2 py-0.5 text-[0.65rem] font-bold text-white">
                <Zap className="h-3 w-3" /> Ahora cerca
              </p>
              <p className="mt-2 font-heading text-[0.95rem] font-bold leading-snug">{itemName}</p>
              <p className="text-xs text-text-muted">{data.space.name}</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="font-heading text-xl font-extrabold tabular">{money(finalPrice)}</span>
                <span className="text-xs text-text-muted line-through tabular">{money(price)}</span>
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {date === localDate(now) ? "Hoy" : new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long" })} · {minutesToLabel(from)} a {minutesToLabel(to)}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                <MapPin className="h-3 w-3" /> A {data.space.walkMinutesToCampus} min de tu facultad
              </p>
              {studentsOnly ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-violet-deep">
                  <BadgeCheck className="h-3 w-3" /> Solo estudiantes
                </p>
              ) : null}
              <span className="mt-3 flex h-8 items-center justify-center rounded-lg bg-text-primary text-xs font-semibold text-bg-primary">
                Reservar · quedan {slots}
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm">
            <span className="font-heading text-lg font-extrabold tabular">{reach.toLocaleString("es-ES")}</span>{" "}
            <span className="text-text-muted">estudiantes lo verán</span>
          </p>
          <p className="text-xs text-text-muted">Sin comisión por cada reserva.</p>
        </div>
      </div>
    </Drawer>
  );
}

function toMinutes(v: string) {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
