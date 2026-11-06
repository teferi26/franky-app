"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, CalendarDays, Check, Clock3, MapPin, Sparkles, Star, Users, Zap } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/components/SessionProvider";
import { createClient } from "@/lib/supabase-client";
import { Drawer, FixedPortal, FormField, inputClass, textareaClass } from "@/components/pro/kit";
import { findDemoBySlug, mutateDemo } from "@/lib/pro/demo-bridge";
import { PRO_VERTICALS, demoSpaceId } from "@/lib/pro/verticals";
import type { ProData, ProVerticalId } from "@/lib/pro/types";
import { addDays, atLocal, capitalize, dayLabel, durationLabel, localDate, localMinutes, minutesToLabel, money, relative, time } from "@/lib/pro/format";
import { startTimes } from "@/lib/pro/agenda";
import { HousingPublicListing, hasPublicListing } from "@/components/pro/sections/housing/public-listing";
import { cn } from "@/lib/utils";

/** Lo que devuelve get_pro_public_profile para un negocio real. */
export type RealProfile = {
  organization_id: string;
  name: string;
  city: string | null;
  vertical: ProVerticalId;
  slug: string;
  description: string;
  address: string | null;
  booking_enabled: boolean;
  card_enabled: boolean;
  card_discount_pct: number;
  walk_minutes_to_campus: number | null;
  image_url: string | null;
  rating: number | null;
  reviews_count: number;
  offers: {
    id: string;
    kind: string;
    title: string;
    detail: string;
    discount_pct: number;
    price_cents: number | null;
    final_price_cents: number | null;
    ends_at: string | null;
    slots_left: number | null;
    students_only: boolean;
  }[];
  menu: { section: string; name: string; description: string | null; price_cents: number; allergens: string[]; student_favorite: boolean; vegetarian: boolean }[];
  daily_menu: { price_cents: number; student_price_cents: number | null; starters: string[]; mains: string[]; desserts: string[]; includes: string } | null;
  reviews: { rating: number; body: string; reply: string | null; created_at: string; author: string }[];
};

/** Forma común para pintar la ficha, venga de la base de datos o de la demo. */
type View = {
  source: "real" | "demo";
  vertical: ProVerticalId;
  name: string;
  city: string;
  address: string;
  description: string;
  imageUrl: string | null;
  rating: number | null;
  reviewsCount: number;
  walkMinutes: number | null;
  bookingEnabled: boolean;
  cardEnabled: boolean;
  cardDiscountPct: number;
  offers: RealProfile["offers"];
  menu: RealProfile["menu"];
  dailyMenu: RealProfile["daily_menu"];
  reviews: RealProfile["reviews"];
  organizationId?: string;
};

const ALLERGEN_SHORT: Record<string, string> = {
  gluten: "Gluten", crustaceos: "Crustáceos", huevo: "Huevo", pescado: "Pescado", cacahuete: "Cacahuete", soja: "Soja",
  lacteos: "Lácteos", frutos_cascara: "Frutos de cáscara", apio: "Apio", mostaza: "Mostaza", sesamo: "Sésamo",
  sulfitos: "Sulfitos", altramuces: "Altramuces", moluscos: "Moluscos",
};

function fromDemo(data: ProData, vertical: ProVerticalId, now: Date): View {
  const today = localDate(now);
  return {
    source: "demo",
    vertical,
    name: data.space.name,
    city: data.space.city,
    address: data.space.address,
    description: data.space.publicProfile.description,
    imageUrl: null,
    rating: data.space.rating,
    reviewsCount: data.space.reviewsCount,
    walkMinutes: data.space.walkMinutesToCampus,
    bookingEnabled: data.space.publicProfile.bookingEnabled,
    cardEnabled: data.space.publicProfile.cardEnabled,
    cardDiscountPct: data.space.publicProfile.cardDiscountPct,
    offers: data.offers
      .filter((o) => o.status === "live" && o.kind !== "card" && (!o.endsAt || new Date(o.endsAt) > now))
      .map((o) => ({
        id: o.id,
        kind: o.kind,
        title: o.title,
        detail: o.detail,
        discount_pct: o.discountPct,
        price_cents: null,
        final_price_cents: null,
        ends_at: o.endsAt ?? null,
        slots_left: o.slots ? Math.max(0, o.slots - o.claimed) : null,
        students_only: o.audience.studentsOnly,
      })),
    menu: data.menu
      .filter((m) => m.available)
      .map((m) => ({
        section: m.section,
        name: m.name,
        description: m.description ?? null,
        price_cents: m.priceCents,
        allergens: m.allergens,
        student_favorite: Boolean(m.studentFavorite),
        vegetarian: Boolean(m.vegetarian),
      })),
    dailyMenu:
      data.dailyMenu && data.dailyMenu.published && data.dailyMenu.date === today
        ? {
            price_cents: data.dailyMenu.priceCents,
            student_price_cents: data.dailyMenu.studentPriceCents ?? null,
            starters: data.dailyMenu.starters,
            mains: data.dailyMenu.mains,
            desserts: data.dailyMenu.desserts,
            includes: data.dailyMenu.includes,
          }
        : null,
    reviews: data.reviews.slice(0, 6).map((r) => ({ rating: r.rating, body: r.text, reply: r.reply ?? null, created_at: r.at, author: r.clientName })),
  };
}

function fromReal(p: RealProfile): View {
  return {
    source: "real",
    vertical: p.vertical,
    name: p.name,
    city: p.city ?? "",
    address: p.address ?? "",
    description: p.description,
    imageUrl: p.image_url,
    rating: p.rating,
    reviewsCount: p.reviews_count,
    walkMinutes: p.walk_minutes_to_campus,
    bookingEnabled: p.booking_enabled,
    cardEnabled: p.card_enabled,
    cardDiscountPct: p.card_discount_pct,
    offers: p.offers,
    menu: p.menu,
    dailyMenu: p.daily_menu,
    reviews: p.reviews,
    organizationId: p.organization_id,
  };
}

type Sheet = null | "book" | "group" | { offer: string } | "done";

export default function BusinessPage({ slug, real, piso }: { slug: string; real: RealProfile | null; piso?: string }) {
  const [demo, setDemo] = React.useState<{ vertical: ProVerticalId; data: ProData } | null>(null);
  const [ready, setReady] = React.useState(Boolean(real));
  const [sheet, setSheet] = React.useState<Sheet>(null);
  const [doneText, setDoneText] = React.useState<{ title: string; body: string } | null>(null);
  const now = React.useMemo(() => new Date(), []);

  React.useEffect(() => {
    if (real) return;
    setDemo(findDemoBySlug(slug));
    setReady(true);
  }, [real, slug]);

  const refreshDemo = React.useCallback(() => {
    if (demo) setDemo(findDemoBySlug(slug));
  }, [demo, slug]);

  if (!ready) return <div className="mx-auto h-[70vh] max-w-5xl px-4 py-10"><div className="h-64 rounded-3xl skeleton-shimmer" /></div>;
  if (!real && !demo) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-heading text-2xl font-extrabold">No encontramos este negocio</h1>
        <p className="mt-2 text-text-muted">Puede que ya no esté en Franky o que el enlace tenga una errata.</p>
        <Link href="/ocio" className={buttonVariants({ variant: "dark", className: "mt-6" })}>Ver zonas de ocio</Link>
      </div>
    );
  }

  // Ficha de un piso concreto con visitas que se reservan solas (motor de vivienda).
  if (demo && piso && PRO_VERTICALS[demo.vertical].engine === "housing" && hasPublicListing(demo.data, piso)) {
    return <HousingPublicListing key={piso} slug={slug} demo={demo} propertyId={piso} />;
  }

  const view = real ? fromReal(real) : fromDemo(demo!.data, demo!.vertical, now);
  const v = PRO_VERTICALS[view.vertical];
  const primary = primaryAction(view.vertical);

  const finish = (title: string, body: string) => {
    setDoneText({ title, body });
    setSheet("done");
    refreshDemo();
  };

  return (
    <div className="bg-bg-primary pb-28 lg:pb-16">
      {view.source === "demo" ? (
        <div className="border-b border-border-light bg-bg-secondary">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-6">
            <span className="text-text-muted">Ficha de ejemplo. Lo que hagas aquí le llega a la app del negocio.</span>
            <Link href={`/pro/${demoSpaceId(view.vertical)}`} className="inline-flex items-center gap-1 font-semibold text-violet">
              Ver su Franky Pro <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : null}

      <header className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:pt-10">
        <div className="overflow-hidden rounded-3xl border border-border">
          {view.imageUrl ? (
            <img src={view.imageUrl} alt="" className="h-48 w-full object-cover sm:h-64" />
          ) : (
            <div className="flex h-40 items-end bg-[linear-gradient(135deg,var(--color-bg-tertiary),var(--color-bg-secondary))] p-5 sm:h-56">
              <span className="font-heading text-5xl font-extrabold text-text-primary/10 sm:text-7xl">{view.name}</span>
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">{v.label}</p>
            <h1 className="mt-1.5 font-heading text-fluid-h1 font-extrabold">{view.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
              {view.rating ? (
                <span className="flex items-center gap-1 font-semibold text-text-primary">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {view.rating.toFixed(1)}
                  <span className="font-normal text-text-muted">({view.reviewsCount})</span>
                </span>
              ) : null}
              {view.walkMinutes !== null ? (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> A {view.walkMinutes} min andando del campus
                </span>
              ) : null}
              {view.address ? <span>{view.address}, {view.city}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {view.cardEnabled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-text-primary px-3 py-1 text-sm font-semibold text-bg-primary">
                <Sparkles className="h-3.5 w-3.5" /> Franky Card -{view.cardDiscountPct} %
              </span>
            ) : null}
          </div>
        </div>
        {view.description ? <p className="mt-4 max-w-2xl text-fluid-lead text-text-secondary">{view.description}</p> : null}
      </header>

      <main className="mx-auto mt-8 grid max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-10">
          {view.offers.length ? (
            <section>
              <h2 className="flex items-center gap-2 font-heading text-xl font-extrabold">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> Ahora para estudiantes
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {view.offers.map((o) => (
                  <li key={o.id} className="flex flex-col rounded-2xl border border-border p-4 shadow-card">
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-violet px-2 py-0.5 text-[0.7rem] font-bold text-white">
                      <Zap className="h-3 w-3" /> {o.discount_pct ? `-${o.discount_pct} %` : o.title}
                    </span>
                    <p className="mt-2 font-semibold">{o.detail}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-muted">
                      {o.ends_at ? <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> Hasta las {time(o.ends_at)}</span> : null}
                      {o.slots_left !== null ? <span>Quedan {o.slots_left}</span> : null}
                      {o.students_only ? <span className="flex items-center gap-1 text-violet-deep"><BadgeCheck className="h-3 w-3" /> Solo estudiantes</span> : null}
                    </p>
                    <Button variant="secondary" size="sm" className="mt-3 self-start" disabled={o.slots_left === 0} onClick={() => setSheet({ offer: o.id })}>
                      {o.slots_left === 0 ? "Agotada" : "Me la quedo"}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {demo ? <EngineContent demo={demo} onBook={() => setSheet("book")} /> : null}

          {view.dailyMenu ? (
            <section>
              <h2 className="font-heading text-xl font-extrabold">Menú del día</h2>
              <div className="mt-4 rounded-2xl border border-border p-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  {[["Primeros", view.dailyMenu.starters], ["Segundos", view.dailyMenu.mains], ["Postres", view.dailyMenu.desserts]].map(([title, list]) => (
                    <div key={title as string}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{title as string}</p>
                      <ul className="mt-1.5 space-y-1 text-sm">
                        {(list as string[]).map((x) => <li key={x}>{x}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
                <p className="mt-4 flex flex-wrap items-baseline gap-2 border-t border-border-light pt-3">
                  <span className="font-heading text-2xl font-extrabold tabular">{money(view.dailyMenu.student_price_cents ?? view.dailyMenu.price_cents)}</span>
                  {view.dailyMenu.student_price_cents ? <span className="text-sm text-text-muted line-through tabular">{money(view.dailyMenu.price_cents)}</span> : null}
                  <span className="text-sm text-text-muted">{view.dailyMenu.includes}</span>
                </p>
              </div>
            </section>
          ) : null}

          {view.menu.length ? <MenuList menu={view.menu} /> : null}

          {view.reviews.length ? (
            <section>
              <h2 className="font-heading text-xl font-extrabold">Opiniones de quien ha ido</h2>
              <ul className="mt-4 divide-y divide-border-light rounded-2xl border border-border">
                {view.reviews.map((r, i) => (
                  <li key={i} className="px-4 py-4 sm:px-5">
                    <p className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">{r.author}</span>
                      <span className="flex items-center gap-2 text-xs text-text-muted">
                        <span className="flex">{Array.from({ length: 5 }, (_, j) => <Star key={j} className={cn("h-3.5 w-3.5", j < r.rating ? "fill-amber-400 text-amber-400" : "text-border")} />)}</span>
                        {relative(r.created_at, now.getTime())}
                      </span>
                    </p>
                    <p className="mt-1.5 text-sm text-text-secondary">{r.body}</p>
                    {r.reply ? <p className="mt-2 border-l-2 border-border pl-3 text-sm text-text-muted">{view.name}: {r.reply}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-3 rounded-2xl border border-border p-5 shadow-card">
            <p className="font-heading text-lg font-bold">{primary.title}</p>
            <p className="text-sm text-text-muted">{primary.body}</p>
            {primary.kind !== "none" ? (
              <Button variant="dark" size="lg" onClick={() => setSheet("book")}>{primary.cta}</Button>
            ) : null}
            {allowsGroups(view.vertical) ? (
              <Button variant="outline" onClick={() => setSheet("group")}>
                <Users className="h-4 w-4" /> Pedir presupuesto de grupo
              </Button>
            ) : null}
            {view.cardEnabled ? <p className="text-xs text-text-muted">Enseña tu Franky Card al pagar: -{view.cardDiscountPct} %.</p> : null}
          </div>
        </aside>
      </main>

      <FixedPortal>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-primary/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-lg gap-2">
            {allowsGroups(view.vertical) ? (
              <Button variant="outline" size="lg" onClick={() => setSheet("group")} aria-label="Pedir presupuesto de grupo">
                <Users className="h-4 w-4" />
              </Button>
            ) : null}
            {primary.kind !== "none" ? (
              <Button variant="dark" size="lg" className="flex-1" onClick={() => setSheet("book")}>{primary.cta}</Button>
            ) : null}
          </div>
        </div>
      </FixedPortal>

      {demo && sheet === "book" ? <DemoAction demo={demo} onClose={() => setSheet(null)} onDone={finish} /> : null}
      {real && sheet === "book" ? <RealBooking profile={real} onClose={() => setSheet(null)} /> : null}
      {sheet === "group" ? <GroupRequest view={view} slug={slug} demo={demo} onClose={() => setSheet(null)} onDone={finish} /> : null}
      {sheet && typeof sheet === "object" ? <ClaimOffer view={view} offerId={sheet.offer} demo={demo} slug={slug} onClose={() => setSheet(null)} onDone={finish} /> : null}
      <Drawer open={sheet === "done"} onOpenChange={(o) => !o && setSheet(null)} title={doneText?.title ?? "Hecho"} description={doneText?.body}>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-7 w-7" strokeWidth={2.6} /></span>
          {demo ? (
            <Link href={`/pro/${demoSpaceId(demo.vertical)}`} className={buttonVariants({ variant: "dark" })}>
              Ver cómo le llega a {view.name} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link href="/perfil" className={buttonVariants({ variant: "outline" })}>Ir a mi perfil</Link>
          )}
        </div>
      </Drawer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function primaryAction(vertical: ProVerticalId): { kind: "book" | "none"; title: string; body: string; cta: string } {
  const engine = PRO_VERTICALS[vertical].engine;
  switch (engine) {
    case "agenda":
      return { kind: "book", title: "Pide tu cita", body: "Elige servicio y hora. Te llega la confirmación en Franky.", cta: "Pedir cita" };
    case "tables":
      return vertical === "cafe"
        ? { kind: "none", title: "Ven cuando quieras", body: "Sin reserva. Enseña tu Franky Card al pagar y suma sellos.", cta: "" }
        : { kind: "book", title: "Reserva mesa", body: "Dinos cuántos sois y a qué hora.", cta: "Reservar mesa" };
    case "night":
      return { kind: "book", title: "Entradas y reservados", body: "Compra tu entrada o apúntate a la lista desde aquí.", cta: "Ver entradas" };
    case "classes":
      return { kind: "book", title: "Reserva tu plaza", body: "Las próximas sesiones con plazas libres.", cta: "Reservar plaza" };
    case "courts":
      return { kind: "book", title: vertical === "coworking" ? "Reserva tu sitio" : "Reserva pista", body: "Elige hora. Las mañanas tienen precio de estudiante.", cta: vertical === "coworking" ? "Reservar sitio" : "Reservar pista" };
    case "housing":
      return { kind: "book", title: "¿Te interesa?", body: "Cuéntales cuándo entras y cuánto tiempo. Te contestan por Franky.", cta: "Me interesa" };
    case "community":
      return { kind: "book", title: "Únete", body: "Apúntate a la próxima actividad o hazte socio.", cta: "Me apunto" };
    default:
      return { kind: "none", title: "", body: "", cta: "" };
  }
}

function allowsGroups(vertical: ProVerticalId) {
  return ["agenda", "tables", "classes"].includes(PRO_VERTICALS[vertical].engine) && vertical !== "cafe" && vertical !== "sports" && vertical !== "academy";
}

/* ------------------------------------------------------------------ */
/* Contenido propio de cada tipo de negocio (en la demo)                */
/* ------------------------------------------------------------------ */

function EngineContent({ demo, onBook }: { demo: { vertical: ProVerticalId; data: ProData }; onBook: () => void }) {
  const { data, vertical } = demo;
  const engine = PRO_VERTICALS[vertical].engine;
  const now = new Date();
  if (engine === "agenda" && data.services.length) {
    const cats = Array.from(new Set(data.services.filter((s) => s.online).map((s) => s.category)));
    return (
      <section>
        <h2 className="font-heading text-xl font-extrabold">Servicios</h2>
        <div className="mt-4 flex flex-col gap-4">
          {cats.map((c) => (
            <div key={c}>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{c}</p>
              <ul className="mt-1 divide-y divide-border-light">
                {data.services.filter((s) => s.online && s.category === c).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block font-medium">{s.name}</span>
                      <span className="text-xs text-text-muted">{durationLabel(s.durationMin)}</span>
                    </span>
                    <span className="text-right tabular">
                      {s.studentPriceCents ? (
                        <>
                          <span className="block font-semibold text-violet-deep">{money(s.studentPriceCents)}</span>
                          <span className="text-xs text-text-muted">{money(s.priceCents)} sin descuento</span>
                        </>
                      ) : (
                        <span className="font-semibold">{money(s.priceCents)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <Button variant="outline" className="self-start" onClick={onBook}>Pedir cita</Button>
        </div>
      </section>
    );
  }
  if (engine === "night") {
    const upcoming = data.events.filter((e) => e.status !== "draft" && new Date(e.closes) > now).slice(0, 4);
    if (!upcoming.length) return null;
    return (
      <section>
        <h2 className="font-heading text-xl font-extrabold">Próximas noches</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {upcoming.map((e) => {
            const tier = e.tiers.find((t) => t.sold < t.quantity && (!t.until || new Date(t.until) > now));
            return (
              <li key={e.id} className="rounded-2xl border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{capitalize(dayLabel(e.date))}</p>
                <p className="mt-1 font-heading text-lg font-bold">{e.name}</p>
                <p className="text-sm text-text-muted">Puertas {time(e.doorsOpen)} · +{e.ageMin}</p>
                {tier ? <p className="mt-2 text-sm"><span className="font-semibold">{tier.name}</span> · {money(tier.priceCents)}</p> : <p className="mt-2 text-sm text-text-muted">Solo en taquilla</p>}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  if (engine === "classes") {
    const next = data.sessions.filter((s) => new Date(s.start) > now).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8);
    if (!next.length) return null;
    return (
      <section>
        <h2 className="font-heading text-xl font-extrabold">Próximas sesiones</h2>
        <ul className="mt-4 divide-y divide-border-light rounded-2xl border border-border">
          {next.map((s) => {
            const t = data.classTypes.find((c) => c.id === s.classTypeId);
            const left = Math.max(0, s.capacity - s.booked);
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{t?.name}</span>
                  <span className="text-xs text-text-muted">{capitalize(dayLabel(s.start))} · {time(s.start)}</span>
                </span>
                <span className={cn("text-sm font-semibold tabular", left ? "text-text-primary" : "text-text-muted")}>{left ? `${left} plazas` : "Completa"}</span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  if (engine === "housing") {
    const rooms = data.properties.flatMap((p) => p.rooms.filter((r) => r.status === "free" || r.status === "leaving").map((r) => ({ p, r }))).slice(0, 8);
    if (!rooms.length) return null;
    return (
      <section>
        <h2 className="font-heading text-xl font-extrabold">Habitaciones disponibles</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {rooms.map(({ p, r }) => (
            <li key={r.id} className="rounded-2xl border border-border p-4">
              <p className="font-semibold">{p.title}</p>
              <p className="text-sm text-text-muted">{p.zone} · {p.minutesToCampus} min del campus</p>
              <p className="mt-2 text-sm">{r.name} · {r.sizeM2} m² {r.privateBath ? "· baño propio" : ""}</p>
              <p className="mt-1 flex items-baseline justify-between"><span className="font-heading text-lg font-bold tabular">{money(r.priceCents)}/mes</span><span className="text-xs text-text-muted">desde {dayLabel(r.availableFrom, { weekday: false })}</span></p>
              <Link href={`/n/${data.space.slug}?piso=${p.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })}>
                Ver el piso y reservar visita
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (engine === "community") {
    const next = data.activities.filter((a) => a.status === "published" && new Date(a.date) > now).slice(0, 4);
    if (!next.length) return null;
    return (
      <section>
        <h2 className="font-heading text-xl font-extrabold">Próximas actividades</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {next.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{capitalize(dayLabel(a.date))}</p>
              <p className="mt-1 font-semibold">{a.title}</p>
              <p className="text-sm text-text-muted">{a.place} · {a.priceCents ? money(a.priceCents) : "Gratis"}{a.ectsHours ? ` · ${a.ectsHours} h para créditos` : ""}</p>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return null;
}

function MenuList({ menu }: { menu: View["menu"] }) {
  const sections = Array.from(new Set(menu.map((m) => m.section)));
  return (
    <section>
      <h2 className="font-heading text-xl font-extrabold">Carta</h2>
      <div className="mt-4 flex flex-col gap-5">
        {sections.map((s) => (
          <div key={s}>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{s}</p>
            <ul className="mt-1 divide-y divide-border-light">
              {menu.filter((m) => m.section === s).map((m) => (
                <li key={m.name} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-medium">{m.name}{m.student_favorite ? <span className="ml-2 text-xs font-semibold text-violet-deep">Favorito de estudiantes</span> : null}</span>
                    {m.description ? <span className="block text-sm text-text-muted">{m.description}</span> : null}
                    {m.allergens.length ? <span className="mt-0.5 block text-xs text-text-muted">Contiene: {m.allergens.map((a) => ALLERGEN_SHORT[a] ?? a).join(", ")}</span> : null}
                  </span>
                  <span className="shrink-0 font-semibold tabular">{money(m.price_cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-text-muted">Si tienes alguna alergia, díselo al personal antes de pedir.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Acciones en la demo: escriben en la app del negocio                  */
/* ------------------------------------------------------------------ */

function DemoAction({ demo, onClose, onDone }: { demo: { vertical: ProVerticalId; data: ProData }; onClose: () => void; onDone: (t: string, b: string) => void }) {
  const engine = PRO_VERTICALS[demo.vertical].engine;
  const now = new Date();
  const today = localDate(now);
  const { data, vertical } = demo;
  const [name, setName] = React.useState("Laura Soler");
  const [serviceId, setServiceId] = React.useState(data.services.find((s) => s.online)?.id ?? "");
  const [day, setDay] = React.useState(today);
  const [minute, setMinute] = React.useState<number | null>(null);
  const [people, setPeople] = React.useState(2);
  const [choice, setChoice] = React.useState<string>("");

  const inboxItem = (title: string, body: string, href: string) => ({ id: `in-${Date.now()}`, at: new Date().toISOString(), kind: "booking" as const, title, body, href, read: false });

  // Horas libres de cualquier profesional que haga ese servicio.
  const service = data.services.find((s) => s.id === serviceId);
  const agendaTimes = React.useMemo(() => {
    if (engine !== "agenda" || !service) return [] as { minute: number; staffId: string }[];
    const map = new Map<number, string>();
    for (const staffId of service.staffIds)
      for (const m of startTimes(data, day, staffId, service.durationMin, day === today ? localMinutes(now) + 15 : 0)) if (!map.has(m)) map.set(m, staffId);
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([m, staffId]) => ({ minute: m, staffId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, service, day, data]);

  const submit = () => {
    if (engine === "agenda" && service && minute !== null) {
      const slot = agendaTimes.find((t) => t.minute === minute)!;
      mutateDemo(vertical, (d) => ({
        ...d,
        bookings: [...d.bookings, { id: `b-${Date.now()}`, kind: "appointment", clientName: name, staffId: slot.staffId, serviceId: service.id, start: atLocal(day, minute), end: atLocal(day, minute + service.durationMin), partySize: 1, status: "confirmed", priceCents: service.studentPriceCents ?? service.priceCents, paidCents: 0, source: "franky", student: true }],
        inbox: [inboxItem("Nueva cita desde tu ficha", `${name} · ${service.name} · ${minutesToLabel(minute)}`, "agenda"), ...d.inbox],
      }));
      onDone("Cita confirmada", `${service.name} el ${dayLabel(atLocal(day, minute))} a las ${minutesToLabel(minute)}.`);
      return;
    }
    if (engine === "tables" && minute !== null) {
      mutateDemo(vertical, (d) => ({
        ...d,
        bookings: [...d.bookings, { id: `b-${Date.now()}`, kind: "table", clientName: name, start: atLocal(day, minute), end: atLocal(day, minute + 90), partySize: people, status: "requested", priceCents: 0, paidCents: 0, source: "franky", student: true }],
        inbox: [inboxItem("Reserva pedida desde tu ficha", `${name} · ${people} personas · ${minutesToLabel(minute)}`, "reservas"), ...d.inbox],
      }));
      onDone("Reserva pedida", `Mesa para ${people} el ${dayLabel(atLocal(day, minute))} a las ${minutesToLabel(minute)}. Te confirman por Franky.`);
      return;
    }
    if (engine === "classes" && choice) {
      mutateDemo(vertical, (d) => ({
        ...d,
        sessions: d.sessions.map((s) => (s.id === choice ? { ...s, booked: Math.min(s.capacity, s.booked + 1) } : s)),
        inbox: [inboxItem("Plaza reservada desde tu ficha", `${name} se ha apuntado`, "horario"), ...d.inbox],
      }));
      onDone("Plaza reservada", "Te esperamos. Si no puedes ir, cancela desde Franky para dejar la plaza a otro.");
      return;
    }
    if (engine === "courts" && choice && minute !== null) {
      mutateDemo(vertical, (d) => ({
        ...d,
        bookings: [...d.bookings, { id: `b-${Date.now()}`, kind: "court", clientName: name, resourceId: choice, start: atLocal(day, minute), end: atLocal(day, minute + 90), partySize: 4, status: "confirmed", priceCents: 0, paidCents: 0, source: "franky", student: true }],
        inbox: [inboxItem("Reserva desde tu ficha", `${name} · ${minutesToLabel(minute)}`, "pistas"), ...d.inbox],
      }));
      onDone("Reserva confirmada", `${dayLabel(atLocal(day, minute))} a las ${minutesToLabel(minute)}.`);
      return;
    }
    if (engine === "night" && choice) {
      mutateDemo(vertical, (d) => ({
        ...d,
        events: d.events.map((e) => (e.id === choice ? { ...e, tiers: e.tiers.map((t, i) => (i === e.tiers.findIndex((x) => x.sold < x.quantity) ? { ...t, sold: t.sold + 1 } : t)) } : e)),
        inbox: [inboxItem("Entrada vendida desde tu ficha", `${name} ha comprado una entrada`, "eventos"), ...d.inbox],
      }));
      onDone("Entrada comprada", "La tienes en Mis entradas. En la puerta enseñas el QR.");
      return;
    }
    if (engine === "housing") {
      mutateDemo(vertical, (d) => ({
        ...d,
        leads: [{ id: `l-${Date.now()}`, name, university: "Universidad de Alicante", studies: "Ingeniería Informática", verified: true, erasmus: false, budgetCents: 35000, moveIn: addDays(today, 20), months: 10, stage: "new", message: "Hola, me interesa una habitación para este curso.", createdAt: new Date().toISOString(), guarantor: true }, ...d.leads],
        inbox: [{ ...inboxItem("Nuevo interesado", `${name} (UA, verificada) quiere una habitación`, "interesados"), kind: "lead" as const }, ...d.inbox],
      }));
      onDone("Mensaje enviado", "Te contestan por Franky. Tu universidad aparece verificada.");
      return;
    }
    if (engine === "community") {
      const act = data.activities.find((a) => a.id === choice) ?? data.activities.find((a) => a.status === "published" && new Date(a.date) > now);
      mutateDemo(vertical, (d) => ({
        ...d,
        activities: d.activities.map((a) => (a.id === act?.id ? { ...a, registered: Math.min(a.capacity, a.registered + 1) } : a)),
        inbox: [inboxItem("Nueva inscripción", `${name} se ha apuntado a ${act?.title ?? "una actividad"}`, "actividades"), ...d.inbox],
      }));
      onDone("Apuntada", `Te esperamos en ${act?.title ?? "la actividad"}.`);
    }
  };

  const nextDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const tableTimes = [13 * 60, 13 * 60 + 30, 14 * 60, 14 * 60 + 30, 20 * 60 + 30, 21 * 60, 21 * 60 + 30, 22 * 60].filter((m) => day !== today || m > localMinutes(now) + 30);
  const courtTimes = Array.from({ length: 12 }, (_, i) => 9 * 60 + i * 90).filter((m) => m < 22 * 60 && (day !== today || m > localMinutes(now)));

  const canSubmit =
    name.trim().length > 1 &&
    ((engine === "agenda" && minute !== null) ||
      (engine === "tables" && minute !== null) ||
      (engine === "classes" && Boolean(choice)) ||
      (engine === "courts" && Boolean(choice) && minute !== null) ||
      (engine === "night" && Boolean(choice)) ||
      engine === "housing" ||
      engine === "community");

  const dayPicker = (
    <FormField label="Día">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {nextDays.map((d) => (
          <button key={d} type="button" onClick={() => { setDay(d); setMinute(null); }} className={cn("flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border text-xs", d === day ? "border-violet bg-violet-50 text-violet-deep" : "border-border")}>
            <span className="capitalize">{new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "short" })}</span>
            <span className="font-heading text-base font-bold">{Number(d.slice(8))}</span>
          </button>
        ))}
      </div>
    </FormField>
  );
  const timeGrid = (times: number[]) => (
    <FormField label="Hora">
      {times.length ? (
        <div className="grid grid-cols-4 gap-2">
          {times.map((m) => (
            <button key={m} type="button" onClick={() => setMinute(m)} className={cn("h-10 rounded-xl border text-sm font-semibold tabular", minute === m ? "border-violet bg-violet-50 text-violet-deep" : "border-border")}>
              {minutesToLabel(m)}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">No quedan horas ese día. Prueba otro.</p>
      )}
    </FormField>
  );

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={primaryAction(vertical).title}
      description={data.space.name}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" disabled={!canSubmit} onClick={submit}>{primaryAction(vertical).cta}</Button></>}
    >
      <div className="flex flex-col gap-5">
        <FormField label="Tu nombre" htmlFor="pub-name"><input id="pub-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></FormField>
        {engine === "agenda" ? (
          <>
            <FormField label="Servicio">
              <div className="flex flex-col gap-2">
                {data.services.filter((s) => s.online).map((s) => (
                  <button key={s.id} type="button" onClick={() => { setServiceId(s.id); setMinute(null); }} className={cn("flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm", serviceId === s.id ? "border-violet bg-violet-50" : "border-border")}>
                    <span><span className="block font-semibold">{s.name}</span><span className="text-xs text-text-muted">{durationLabel(s.durationMin)}</span></span>
                    <span className="font-semibold tabular">{money(s.studentPriceCents ?? s.priceCents)}</span>
                  </button>
                ))}
              </div>
            </FormField>
            {dayPicker}
            {timeGrid(agendaTimes.map((t) => t.minute))}
          </>
        ) : null}
        {engine === "tables" ? (
          <>
            <FormField label="Personas">
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <button key={n} type="button" onClick={() => setPeople(n)} className={cn("h-10 w-12 rounded-xl border text-sm font-semibold", people === n ? "border-violet bg-violet-50 text-violet-deep" : "border-border")}>{n}</button>
                ))}
              </div>
            </FormField>
            {dayPicker}
            {timeGrid(tableTimes)}
          </>
        ) : null}
        {engine === "classes" ? (
          <FormField label="Sesión">
            <div className="flex flex-col gap-2">
              {data.sessions.filter((s) => new Date(s.start) > now && s.booked < s.capacity).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 10).map((s) => (
                <button key={s.id} type="button" onClick={() => setChoice(s.id)} className={cn("flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm", choice === s.id ? "border-violet bg-violet-50" : "border-border")}>
                  <span><span className="block font-semibold">{data.classTypes.find((c) => c.id === s.classTypeId)?.name}</span><span className="text-xs text-text-muted">{capitalize(dayLabel(s.start))} · {time(s.start)}</span></span>
                  <span className="text-xs text-text-muted">{s.capacity - s.booked} plazas</span>
                </button>
              ))}
            </div>
          </FormField>
        ) : null}
        {engine === "courts" ? (
          <>
            <FormField label={vertical === "coworking" ? "Espacio" : "Pista"}>
              <div className="flex flex-wrap gap-2">
                {data.resources.map((r) => (
                  <button key={r.id} type="button" onClick={() => setChoice(r.id)} className={cn("rounded-xl border px-3 py-2 text-sm font-semibold", choice === r.id ? "border-violet bg-violet-50 text-violet-deep" : "border-border")}>{r.name}</button>
                ))}
              </div>
            </FormField>
            {dayPicker}
            {timeGrid(courtTimes)}
          </>
        ) : null}
        {engine === "night" ? (
          <FormField label="Noche">
            <div className="flex flex-col gap-2">
              {data.events.filter((e) => e.status !== "draft" && new Date(e.closes) > now).slice(0, 5).map((e) => {
                const tier = e.tiers.find((t) => t.sold < t.quantity);
                return (
                  <button key={e.id} type="button" onClick={() => setChoice(e.id)} disabled={!tier} className={cn("flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm disabled:opacity-50", choice === e.id ? "border-violet bg-violet-50" : "border-border")}>
                    <span><span className="block font-semibold">{e.name}</span><span className="text-xs text-text-muted">{capitalize(dayLabel(e.date))}</span></span>
                    <span className="font-semibold tabular">{tier ? money(tier.priceCents) : "Agotado"}</span>
                  </button>
                );
              })}
            </div>
          </FormField>
        ) : null}
        {engine === "housing" ? <p className="rounded-xl bg-bg-secondary p-3 text-sm text-text-secondary">Le enviamos tu universidad verificada, tu fecha de entrada y cuánto tiempo te quedarías. No compartimos tu teléfono hasta que tú quieras.</p> : null}
        {engine === "community" ? (
          <FormField label="Actividad">
            <div className="flex flex-col gap-2">
              {data.activities.filter((a) => a.status === "published" && new Date(a.date) > now).slice(0, 5).map((a) => (
                <button key={a.id} type="button" onClick={() => setChoice(a.id)} className={cn("flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm", choice === a.id ? "border-violet bg-violet-50" : "border-border")}>
                  <span><span className="block font-semibold">{a.title}</span><span className="text-xs text-text-muted">{capitalize(dayLabel(a.date))}</span></span>
                  <span className="text-xs text-text-muted">{a.priceCents ? money(a.priceCents) : "Gratis"}</span>
                </button>
              ))}
            </div>
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}

function RealBooking({ profile, onClose }: { profile: RealProfile; onClose: () => void }) {
  // Las reservas de negocios reales usan el motor de reservas de Franky.
  const router = useRouter();
  React.useEffect(() => {
    router.push(`/espacios/servicios/reservar?organization=${profile.organization_id}`);
    onClose();
  }, [profile.organization_id, router, onClose]);
  return null;
}

function GroupRequest({ view, slug, demo, onClose, onDone }: { view: View; slug: string; demo: { vertical: ProVerticalId; data: ProData } | null; onClose: () => void; onDone: (t: string, b: string) => void }) {
  const session = useSession();
  const router = useRouter();
  const [organizer, setOrganizer] = React.useState("");
  const [organization, setOrganization] = React.useState("");
  const [kind, setKind] = React.useState("Cena de clase");
  const [people, setPeople] = React.useState("20");
  const [date, setDate] = React.useState(addDays(localDate(new Date()), 14));
  const [budget, setBudget] = React.useState("20");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  const submit = async () => {
    const payload = {
      organizer_name: organizer.trim(),
      organization_name: organization.trim(),
      kind: kind.trim(),
      people: Number(people),
      starts_at: atLocal(date, 21 * 60),
      budget_per_person_cents: Math.round(Number(budget.replace(",", ".")) * 100) || 0,
      message: message.trim(),
    };
    if (demo) {
      mutateDemo(demo.vertical, (d) => ({
        ...d,
        groupRequests: [{ id: `g-${Date.now()}`, organizer: payload.organizer_name, organization: payload.organization_name || "Grupo de estudiantes", kind: payload.kind, people: payload.people, date: payload.starts_at, budgetPerPersonCents: payload.budget_per_person_cents, message: payload.message || "Nos gustaría celebrarlo aquí.", status: "new", createdAt: new Date().toISOString() }, ...d.groupRequests],
        inbox: [{ id: `in-${Date.now()}`, at: new Date().toISOString(), kind: "group", title: "Petición de grupo", body: `${payload.organization_name || payload.organizer_name}: ${payload.people} personas`, href: PRO_VERTICALS[demo.vertical].nav.some((n) => n.id === "grupos") ? "grupos" : "estudiantes", read: false }, ...d.inbox],
      }));
      onDone("Petición enviada", `${view.name} te contestará con un presupuesto por Franky.`);
      return;
    }
    if (!session.user) {
      router.push(`/login?next=${encodeURIComponent(`/n/${slug}`)}`);
      return;
    }
    setSending(true);
    setError(null);
    const { error: e } = await createClient().rpc("request_pro_group_quote", { p_slug: slug, p_data: payload });
    setSending(false);
    if (e) setError(e.message.includes("pro_request_limit") ? "Tienes demasiadas peticiones abiertas. Espera a que te contesten." : "No se pudo enviar. Revisa los datos.");
    else onDone("Petición enviada", `${view.name} te contestará con un presupuesto.`);
  };

  const valid = organizer.trim().length > 1 && kind.trim().length > 2 && Number(people) >= 2;
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Presupuesto de grupo" description={`Para cenas de clase, graduaciones, previas o celebraciones en ${view.name}.`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={sending} disabled={!valid || sending} onClick={submit}>Enviar petición</Button></>}>
      <div className="flex flex-col gap-4">
        <FormField label="Tu nombre" htmlFor="gr-organizer"><input id="gr-organizer" value={organizer} onChange={(e) => setOrganizer(e.target.value)} className={inputClass} /></FormField>
        <FormField label="Clase, asociación o grupo" htmlFor="gr-org"><input id="gr-org" value={organization} onChange={(e) => setOrganization(e.target.value)} className={inputClass} placeholder="2.º de Enfermería" /></FormField>
        <FormField label="Qué celebráis" htmlFor="gr-kind"><input id="gr-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass} /></FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Personas" htmlFor="gr-people"><input id="gr-people" inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} className={inputClass} /></FormField>
          <FormField label="Día" htmlFor="gr-date" className="col-span-2"><input id="gr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></FormField>
        </div>
        <FormField label="Presupuesto por persona (€)" htmlFor="gr-budget"><input id="gr-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} /></FormField>
        <FormField label="Algo más" htmlFor="gr-msg"><textarea id="gr-msg" value={message} onChange={(e) => setMessage(e.target.value)} className={textareaClass} placeholder="Hora aproximada, alergias, si queréis zona reservada..." /></FormField>
        {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
      </div>
    </Drawer>
  );
}

function ClaimOffer({ view, offerId, demo, slug, onClose, onDone }: { view: View; offerId: string; demo: { vertical: ProVerticalId; data: ProData } | null; slug: string; onClose: () => void; onDone: (t: string, b: string) => void }) {
  const session = useSession();
  const router = useRouter();
  const offer = view.offers.find((o) => o.id === offerId);
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  if (!offer) return null;

  const claim = async () => {
    if (demo) {
      mutateDemo(demo.vertical, (d) => ({
        ...d,
        offers: d.offers.map((o) => (o.id === offerId ? { ...o, claimed: Math.min(o.slots || o.claimed + 1, o.claimed + 1), bookings: o.bookings + 1 } : o)),
        inbox: [{ id: `in-${Date.now()}`, at: new Date().toISOString(), kind: "booking", title: "Oferta reservada", body: `Una estudiante verificada ha cogido "${offer.detail}"`, href: "estudiantes", read: false }, ...d.inbox],
      }));
      onDone("Es tuya", `Enseña esta pantalla o tu Franky Card en ${view.name}.`);
      return;
    }
    if (!session.user) {
      router.push(`/login?next=${encodeURIComponent(`/n/${slug}`)}`);
      return;
    }
    setSending(true);
    const { error: e } = await createClient().rpc("claim_pro_offer", { p_offer_id: offerId });
    setSending(false);
    if (!e) onDone("Es tuya", `Enseña tu Franky en ${view.name}.`);
    else if (e.message.includes("pro_student_required")) setError("Esta oferta es solo para estudiantes con el correo de la universidad verificado. Verifícalo en tu perfil.");
    else if (e.message.includes("pro_offer_unavailable")) setError("Se acaba de agotar o ha terminado.");
    else if (e.message.includes("pro_offer_other_university")) setError("Esta oferta es para estudiantes de otra universidad.");
    else setError("No se pudo reservar. Inténtalo de nuevo.");
  };

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={offer.title} description={view.name}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={sending} onClick={claim}>Me la quedo</Button></>}>
      <div className="flex flex-col gap-3">
        <p className="font-heading text-lg font-bold">{offer.detail}</p>
        <p className="flex flex-wrap gap-x-3 text-sm text-text-muted">
          {offer.ends_at ? <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" /> Hasta las {time(offer.ends_at)}</span> : null}
          {offer.slots_left !== null ? <span>Quedan {offer.slots_left}</span> : null}
        </p>
        {offer.students_only ? <p className="flex items-center gap-1.5 text-sm text-violet-deep"><BadgeCheck className="h-4 w-4" /> Solo estudiantes verificados</p> : null}
        {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
      </div>
    </Drawer>
  );
}
