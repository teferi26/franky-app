"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, MapPin, Users, Video } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { mutateDemo } from "@/lib/pro/demo-bridge";
import { demoSpaceId } from "@/lib/pro/verticals";
import type { ProData, ProVerticalId, ProVisit } from "@/lib/pro/types";
import { addDays, localDate, minutesToLabel, money } from "@/lib/pro/format";
import { UNIVERSITIES } from "@/lib/pro/demo/common";
import { shortDate, uniShort } from "@/lib/pro/housing";
import {
  bookPublicVisit,
  joinPublicWaitlist,
  listingPriceLabel,
  otherListings,
  publicListing,
  publicVisitDays,
  publicVisitSummary,
  type PublicListing,
} from "@/lib/pro/housing-public";
import { cn } from "@/lib/utils";
import { ChoiceChips, Drawer, FixedPortal, FormField, inputClass } from "../../kit";
import { EnergyBadge } from "./property-tools";
import { PropertyCover, RoomTraits, dayChip, euros, selectClass } from "./shared";

/**
 * Ficha pública de un piso: /n/<slug>?piso=<id>. El estudiante (o su madre o
 * su padre) ve las habitaciones libres con precio y fecha, la letra
 * energética y los minutos al campus, y reserva la visita sin escribir a
 * nadie. En la demo la reserva se guarda en la misma sesión que lee la app
 * del negocio, así que aparece al momento en su pantalla de Visitas.
 */

type Demo = { vertical: ProVerticalId; data: ProData };

export function hasPublicListing(data: ProData, propertyId: string | null | undefined) {
  return Boolean(publicListing(data, propertyId));
}

export function HousingPublicListing({ slug, demo, propertyId }: { slug: string; demo: Demo; propertyId: string }) {
  const [data, setData] = React.useState(demo.data);
  const [sheet, setSheet] = React.useState<null | "book" | "wait">(null);
  const [roomId, setRoomId] = React.useState<string | undefined>();
  const [done, setDone] = React.useState<null | { title: string; body: string }>(null);
  const now = React.useMemo(() => new Date(), []);
  const listing = publicListing(data, propertyId);
  if (!listing) return null;
  const { property } = listing;
  const days = publicVisitDays(data, propertyId, now, 6);
  const others = otherListings(data, propertyId);
  const letter = property.compliance?.energyLetter;

  const open = (id?: string) => {
    setRoomId(id);
    setSheet(listing.full ? "wait" : "book");
  };

  return (
    <div className="bg-bg-primary pb-28 lg:pb-16">
      <div className="border-b border-border-light bg-bg-secondary">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-6">
          <span className="text-text-muted">Ficha de ejemplo. Lo que hagas aquí le llega a la app del negocio.</span>
          <Link href={`/pro/${demoSpaceId(demo.vertical)}/visitas`} className="inline-flex items-center gap-1 font-semibold text-violet">
            Ver su Franky Pro <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <header className="mx-auto max-w-5xl px-4 pt-5 sm:px-6 lg:pt-8">
        <Link href={`/n/${encodeURIComponent(slug)}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" /> Todos los pisos de {data.space.name}
        </Link>
        <PropertyCover property={property} className="mt-2 h-44 rounded-3xl sm:h-60">
          {letter ? <EnergyBadge letter={letter} className="absolute right-4 top-4 h-8 min-w-8 text-sm" /> : null}
        </PropertyCover>
        <p className="eyebrow mt-5">Habitaciones para estudiantes</p>
        <h1 className="mt-1.5 font-heading text-fluid-h1 font-extrabold">{property.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" strokeWidth={1.9} /> {property.minutesToCampus} min del campus de la {uniShort(data.space.campus)}
          </span>
          <span>{property.address}, {property.zone}</span>
        </p>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-heading text-2xl font-extrabold tabular">{listingPriceLabel(listing)}</span>
          {listing.firstFree ? (
            <span className="text-sm text-text-muted">{listing.firstFree <= localDate(now) ? "Libre ya" : `Libre desde el ${shortDate(listing.firstFree)}`}</span>
          ) : null}
        </p>
      </header>

      <main className="mx-auto mt-8 grid max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-10">
          <section>
            <h2 className="font-heading text-xl font-extrabold">{listing.full ? "Ahora mismo está lleno" : "Habitaciones libres"}</h2>
            {listing.full ? (
              <p className="mt-2 text-text-secondary">
                Apúntate y te avisan en cuanto se libere una habitación que te encaje.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {listing.rooms.map((r) => (
                  <li key={r.id} className="flex flex-col rounded-2xl border border-border p-4 shadow-card">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{r.name}</span>
                      <span className="font-heading text-lg font-bold tabular">{money(r.priceCents, { round: true })}</span>
                    </p>
                    <RoomTraits room={r} />
                    <p className="mt-1 text-xs text-text-muted">
                      {r.availableFrom.slice(0, 10) <= localDate(now) ? "Libre ya" : `Libre desde el ${shortDate(r.availableFrom)}`}
                      {r.summer ? " · también julio y agosto" : ""}
                    </p>
                    <Button variant="outline" size="sm" className="mt-3 self-start" onClick={() => open(r.id)}>
                      Quiero verla
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {listing.wholeFlatPerPersonCents ? (
            <section className="rounded-2xl border border-border p-5">
              <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold">
                <Users className="h-5 w-5" strokeWidth={1.9} /> Entero para un grupo
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Si venís {property.rooms.length} amigos, o Roomie os ha juntado, podéis alquilarlo entero por{" "}
                <span className="font-semibold tabular">{money(listing.wholeFlatPerPersonCents, { round: true })}</span> al mes cada uno. Un solo contrato.
              </p>
            </section>
          ) : null}

          {!listing.full && days.length ? (
            <section>
              <h2 className="font-heading text-xl font-extrabold">Próximas visitas libres</h2>
              <p className="mt-1 text-sm text-text-muted">En el piso o por videollamada si aún no estás en Alicante. Media hora.</p>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {days.slice(0, 5).map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => open(roomId)}
                    className="flex min-w-[6.5rem] shrink-0 flex-col rounded-2xl border border-border px-3 py-2.5 text-left transition-colors hover:border-text-primary/25"
                  >
                    <span className="text-xs font-semibold capitalize text-text-muted">{dayChip(d.date, localDate(now))}</span>
                    <span className="font-heading text-base font-bold tabular">{minutesToLabel(d.slots[0])}</span>
                    <span className="text-[0.7rem] text-text-muted">{d.slots.length} {d.slots.length === 1 ? "hueco" : "huecos"}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-2 text-sm text-text-secondary">
            <p className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} /> Tu universidad aparece verificada: sabe que eres estudiante sin pedirte papeles para la visita.
            </p>
            {letter ? (
              <p className="flex items-center gap-2">
                <EnergyBadge letter={letter} /> Certificado energético {letter}.
              </p>
            ) : null}
          </section>

          {others.length ? (
            <section>
              <h2 className="font-heading text-xl font-extrabold">Otros pisos de {data.space.name}</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {others.map((o) => (
                  <OtherListing key={o.property.id} slug={slug} listing={o} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-3 rounded-2xl border border-border p-5 shadow-card">
            <p className="font-heading text-lg font-bold">{listing.full ? "Avísame cuando haya hueco" : "Reserva la visita"}</p>
            <p className="text-sm text-text-muted">
              {listing.full ? "Te escriben por Franky en cuanto se libere algo que te encaje." : "Eliges el día y la hora. No hace falta escribir a nadie."}
            </p>
            <Button variant="dark" size="lg" onClick={() => open(roomId)}>
              {listing.full ? "Apuntarme" : "Reservar visita"}
            </Button>
          </div>
        </aside>
      </main>

      <FixedPortal>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-primary px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold tabular">{listingPriceLabel(listing)}</span>
            <Button variant="dark" size="lg" onClick={() => open(roomId)}>
              {listing.full ? "Apuntarme" : "Reservar visita"}
            </Button>
          </div>
        </div>
      </FixedPortal>

      {sheet === "book" ? (
        <BookVisit
          demo={demo}
          data={data}
          listing={listing}
          now={now}
          initialRoomId={roomId}
          onClose={() => setSheet(null)}
          onDone={(next, visit) => {
            setData(next);
            setSheet(null);
            setDone({ title: "Visita reservada", body: publicVisitSummary(next, visit) });
          }}
        />
      ) : null}
      {sheet === "wait" ? (
        <JoinWaitlist
          demo={demo}
          listing={listing}
          now={now}
          onClose={() => setSheet(null)}
          onDone={(next) => {
            setData(next);
            setSheet(null);
            setDone({ title: "Estás en la lista", body: `Te avisan por Franky cuando se libere una habitación en el ${property.title}.` });
          }}
        />
      ) : null}
      <Drawer open={Boolean(done)} onOpenChange={(o) => !o && setDone(null)} title={done?.title ?? "Hecho"} description={done?.body}>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check className="h-7 w-7" strokeWidth={2.6} />
          </span>
          <Link href={`/pro/${demoSpaceId(demo.vertical)}/${done?.title === "Estás en la lista" ? "curso" : "visitas"}`} className={buttonVariants({ variant: "dark" })}>
            Ver cómo le llega a {data.space.name} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Drawer>
    </div>
  );
}

function OtherListing({ slug, listing }: { slug: string; listing: PublicListing }) {
  return (
    <li>
      <Link
        href={`/n/${encodeURIComponent(slug)}?piso=${encodeURIComponent(listing.property.id)}`}
        className="group flex flex-col rounded-2xl border border-border p-4 transition-colors hover:border-text-primary/15 hover-lift"
      >
        <span className="font-semibold">{listing.property.title}</span>
        <span className="text-sm text-text-muted">
          {listing.property.zone} · {listing.property.minutesToCampus} min del campus
        </span>
        <span className="mt-2 flex items-center justify-between text-sm">
          <span className="font-semibold tabular">{listingPriceLabel(listing)}</span>
          <ArrowRight className="h-4 w-4 arrow-nudge text-text-muted" />
        </span>
      </Link>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Reservar visita                                                      */
/* ------------------------------------------------------------------ */

function BookVisit({
  demo,
  data,
  listing,
  now,
  initialRoomId,
  onClose,
  onDone,
}: {
  demo: Demo;
  data: ProData;
  listing: PublicListing;
  now: Date;
  initialRoomId?: string;
  onClose: () => void;
  onDone: (next: ProData, visit: ProVisit) => void;
}) {
  const today = localDate(now);
  const days = publicVisitDays(data, listing.property.id, now, 7);
  const [day, setDay] = React.useState(days[0]?.date ?? "");
  const [minute, setMinute] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<ProVisit["mode"]>("in_person");
  const [roomId, setRoomId] = React.useState(initialRoomId ?? "");
  const [who, setWho] = React.useState<"student" | "parent">("student");
  const [name, setName] = React.useState("");
  const [uni, setUni] = React.useState(UNIVERSITIES[0]);
  const [moveIn, setMoveIn] = React.useState(listing.firstFree && listing.firstFree > today ? listing.firstFree : addDays(today, 7));
  const [months, setMonths] = React.useState("10");
  const [budget, setBudget] = React.useState(listing.fromPriceCents ? String(Math.round(listing.fromPriceCents / 100)) : "350");
  const [error, setError] = React.useState<string | null>(null);
  const slots = days.find((d) => d.date === day)?.slots ?? [];
  const valid = name.trim().length > 1 && day && minute !== null && moveIn;

  const submit = () => {
    if (!valid || minute === null) return;
    const stamp = Date.now();
    let result: ReturnType<typeof bookPublicVisit> | null = null;
    // Se vuelve a leer lo guardado para no pisar lo que haya hecho el negocio mientras tanto.
    mutateDemo(demo.vertical, (current) => {
      result = bookPublicVisit(
        current,
        listing.property.id,
        {
          name,
          university: uni,
          moveIn,
          months: Number(months) || 10,
          budgetCents: euros(budget),
          roomId: roomId || undefined,
          date: day,
          minute,
          mode,
          bookedBy: who,
        },
        new Date(),
        { lead: `l-${stamp}`, visit: `v-${stamp}`, inbox: `in-${stamp}` },
      );
      return result.ok ? result.data : current;
    });
    const r = result as ReturnType<typeof bookPublicVisit> | null;
    if (!r || !r.ok) {
      setError(r?.reason === "slot_taken" ? "Esa hora se acaba de ocupar. Elige otra." : "Revisa tu nombre, el día y la hora.");
      setMinute(null);
      return;
    }
    onDone(r.data, r.visit);
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Reserva la visita"
      description={listing.property.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={!valid} onClick={submit}>
            <CalendarDays className="h-4 w-4" /> Reservar visita
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Cómo">
          <ChoiceChips
            value={mode}
            onChange={setMode}
            options={[
              { value: "in_person", label: "En el piso", hint: "Media hora" },
              { value: "video", label: "Por vídeo", hint: "Si aún no estás aquí" },
            ]}
          />
        </FormField>
        <FormField label="Día">
          {days.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={d.date === day}
                  onClick={() => {
                    setDay(d.date);
                    setMinute(null);
                  }}
                  className={cn(
                    "flex h-14 min-w-14 shrink-0 flex-col items-center justify-center rounded-xl border px-2 text-xs",
                    d.date === day ? "border-violet bg-violet-50 text-violet-deep" : "border-border",
                  )}
                >
                  <span className="capitalize">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "short", timeZone: "UTC" })}</span>
                  <span className="font-heading text-base font-bold">{Number(d.date.slice(8))}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No quedan huecos estas semanas. Apúntate y te escriben.</p>
          )}
        </FormField>
        {slots.length ? (
          <FormField label="Hora">
            <div className="grid grid-cols-4 gap-2">
              {slots.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={minute === m}
                  onClick={() => setMinute(m)}
                  className={cn("h-10 rounded-xl border text-sm font-semibold tabular", minute === m ? "border-violet bg-violet-50 text-violet-deep" : "border-border")}
                >
                  {minutesToLabel(m)}
                </button>
              ))}
            </div>
          </FormField>
        ) : null}

        {listing.rooms.length > 1 ? (
          <FormField label="Habitación" htmlFor="pv-room">
            <select id="pv-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={selectClass}>
              <option value="">Cualquiera, la que mejor me encaje</option>
              {listing.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}, {money(r.priceCents, { round: true })}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}

        <FormField label="Quién reserva">
          <ChoiceChips
            value={who}
            onChange={setWho}
            options={[
              { value: "student", label: "Soy yo", hint: "El estudiante" },
              { value: "parent", label: "Para mi hijo o hija", hint: "Madre o padre" },
            ]}
          />
        </FormField>
        <FormField label={who === "parent" ? "Nombre del estudiante" : "Tu nombre"} htmlFor="pv-name">
          <input id="pv-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="name" />
        </FormField>
        <FormField label="Universidad" htmlFor="pv-uni">
          <select id="pv-uni" value={uni} onChange={(e) => setUni(e.target.value)} className={selectClass}>
            {UNIVERSITIES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Entrada" htmlFor="pv-in">
            <input id="pv-in" type="date" value={moveIn} min={today} onChange={(e) => setMoveIn(e.target.value)} className={cn(inputClass, "px-2")} />
          </FormField>
          <FormField label="Meses" htmlFor="pv-months">
            <input id="pv-months" type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Hasta (€)" htmlFor="pv-budget">
            <input id="pv-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        {mode === "video" ? (
          <p className="flex items-start gap-2 rounded-xl bg-bg-secondary p-3 text-sm text-text-secondary">
            <Video className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} /> El enlace de la videollamada te llega en Franky el mismo día.
          </p>
        ) : null}
        {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
      </div>
    </Drawer>
  );
}

function JoinWaitlist({
  demo,
  listing,
  now,
  onClose,
  onDone,
}: {
  demo: Demo;
  listing: PublicListing;
  now: Date;
  onClose: () => void;
  onDone: (next: ProData) => void;
}) {
  const today = localDate(now);
  const [name, setName] = React.useState("");
  const [uni, setUni] = React.useState(UNIVERSITIES[0]);
  const [moveIn, setMoveIn] = React.useState(addDays(today, 30));
  const [months, setMonths] = React.useState("10");
  const [budget, setBudget] = React.useState("350");
  const valid = name.trim().length > 1 && moveIn;

  const submit = () => {
    const stamp = Date.now();
    let next: ProData | null = null;
    mutateDemo(demo.vertical, (current) => {
      const r = joinPublicWaitlist(
        current,
        listing.property.id,
        { name, university: uni, moveIn, months: Number(months) || 10, budgetCents: euros(budget) },
        new Date(),
        { lead: `l-${stamp}`, inbox: `in-${stamp}` },
      );
      next = r.ok ? r.data : null;
      return next ?? current;
    });
    if (next) onDone(next);
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Avísame cuando haya hueco"
      description={listing.property.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={!valid} onClick={submit}>Apuntarme</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Tu nombre" htmlFor="pw-name">
          <input id="pw-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="name" />
        </FormField>
        <FormField label="Universidad" htmlFor="pw-uni">
          <select id="pw-uni" value={uni} onChange={(e) => setUni(e.target.value)} className={selectClass}>
            {UNIVERSITIES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Entrada" htmlFor="pw-in">
            <input id="pw-in" type="date" value={moveIn} min={today} onChange={(e) => setMoveIn(e.target.value)} className={cn(inputClass, "px-2")} />
          </FormField>
          <FormField label="Meses" htmlFor="pw-months">
            <input id="pw-months" type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Hasta (€)" htmlFor="pw-budget">
            <input id="pw-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} />
          </FormField>
        </div>
      </div>
    </Drawer>
  );
}
