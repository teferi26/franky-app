import Image from "next/image";
import Link from "next/link";
import {
  UserPlus, CalendarDays, MapPinned, Star, ArrowRight, Map, MapPin,
  Beer, Martini, Utensils, Coffee, Music, Trees, Landmark, Dumbbell, Laptop,
  type LucideIcon,
} from "lucide-react";
import { createServerSupabase, createPublicSupabase } from "@/lib/supabase-server";
import HomeFollowButton from "@/components/home/HomeFollowButton";
import { MADRID_TZ } from "@/lib/event-time";

// ─── Columna derecha de la home social: descubrir ─────────────────────────
// El "A quién seguir" de Twitter, pero de campus: gente de tu universidad, los
// planes que vienen en tu ciudad y las zonas de ocio mejor valoradas. Vive en
// una columna sticky de 300px que solo existe en escritorio (ver HomeSocial),
// así que aquí no se gasta una sola clase en responsive.
//
// Es un Server Component: las tres consultas se resuelven en el servidor y lo
// único que viaja al navegador es el botón de Seguir (HomeFollowButton). Cada
// bloque es INDEPENDIENTE y fail-soft: si una consulta falla o no devuelve
// nada, esa tarjeta no se pinta y las otras dos siguen ahí. Nunca una columna
// rota, nunca una tarjeta vacía.
//
// Sobre el mapa: existe src/components/LeisureMap.tsx, pero NO se usa aquí a
// propósito. Es un componente de cliente que importa Leaflet y su CSS (unos
// 150 KB de JavaScript más los tiles), y meterlo en la home haría pagar ese
// peso a TODO el que entre a franky.es con sesión, para ver cuatro sitios en
// una columna de 300px donde un mapa ni se lee. Aquí va la lista compacta y un
// enlace a /ocio, que ya monta el mapa completo con sus filtros.
//
// Diseño v3: tarjetas blancas con borde hairline, cabeceras con icono suelto,
// filas que se tintan al pasar el ratón y enlaces de pie con subrayado que
// crece. Los emojis de categoría se sustituyeron por iconos de lucide.

type Props = {
  userId: string;
  universityId: string;
  city: string | null;
};

type Suggestion = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  career: string | null;
};

type UpcomingEvent = {
  id: string;
  title: string;
  start_date: string;
  price: number | null;
  city: string | null;
};

type Spot = {
  id: string;
  name: string;
  category: string;
  rating: number | null;
  image_url: string | null;
};

// Cuánta gente y cuántos planes caben sin que la columna se haga interminable.
// Tres tarjetas de descubrimiento con once filas entre las tres eran, ellas
// solas, más elementos que el feed que tienen al lado. Se recortan: lo justo
// para picar la curiosidad, y cada tarjeta tiene su enlace para ver el resto.
const MAX_SUGGESTIONS = 3;
const MAX_EVENTS = 2;
const MAX_SPOTS = 3;

/** Etiquetas de categoría de ocio, en el mismo idioma que /ocio. */
const CAT_LABEL: Record<string, string> = {
  bar: "Bar",
  pub: "Pub",
  restaurante: "Restaurante",
  cafeteria: "Cafetería",
  discoteca: "Discoteca",
  parque: "Parque",
  cultural: "Cultural",
  deportivo: "Deportivo",
  coworking: "Coworking",
};

/** Icono de respaldo por categoría cuando el sitio no tiene foto. */
const CAT_ICON: Record<string, LucideIcon> = {
  bar: Beer, pub: Martini, restaurante: Utensils, cafeteria: Coffee, discoteca: Music,
  parque: Trees, cultural: Landmark, deportivo: Dumbbell, coworking: Laptop,
};

/** Iniciales para cuando no hay foto: una o dos letras, nunca vacío. */
function initialsOf(name: string | null): string {
  const src = (name ?? "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "vie 12 sep · 22:30", siempre en hora de Madrid (como el resto de eventos). */
function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString("es-ES", {
      timeZone: MADRID_TZ,
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const time = d.toLocaleTimeString("es-ES", {
      timeZone: MADRID_TZ,
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${day} · ${time}`;
  } catch {
    return "";
  }
}

/**
 * La ciudad de la que tirar para planes y ocio. El perfil puede no tenerla
 * (no es obligatoria en el onboarding), así que se cae a la ciudad de la
 * universidad: quien estudia en Alicante quiere ver Alicante aunque no haya
 * rellenado su ciudad. Si tampoco resuelve, se devuelve null y esos bloques
 * trabajan sin filtro de ciudad.
 */
async function resolveCity(city: string | null, universityId: string): Promise<string | null> {
  const own = city?.trim();
  if (own) return own;
  try {
    const anon = createPublicSupabase();
    const { data, error } = await anon
      .from("universities")
      .select("city")
      .eq("id", universityId)
      .maybeSingle();
    if (error || !data?.city) return null;
    return (data.city as string) || null;
  } catch {
    return null;
  }
}

/**
 * A quién seguir: gente de TU universidad a la que aún no sigues.
 *
 * Se leen primero los follows propios y se descartan en memoria, en vez de
 * mandar un `not.in` gigante a PostgREST: con muchos seguidos la URL se
 * dispara y la consulta se cae. Se piden bastantes candidatos de más (los
 * últimos en llegar al campus, que es la sugerencia más interesante) y se
 * recortan aquí a los que caben.
 */
async function fetchSuggestions(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  universityId: string
): Promise<Suggestion[]> {
  try {
    const { data: mine } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", userId)
      .limit(1000);
    const followed = new Set((mine ?? []).map((f) => f.followee_id as string));

    const { data, error } = await supabase
      .from("public_profiles")
      .select("id, full_name, avatar_url, career, created_at")
      .eq("university_id", universityId)
      .neq("id", userId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error || !data) return [];

    return data
      .filter((p) => !followed.has(p.id as string))
      // Un perfil sin nombre no dice nada a quien lo lee: no se sugiere.
      .filter((p) => Boolean((p.full_name as string | null)?.trim()))
      .slice(0, MAX_SUGGESTIONS)
      .map((p) => ({
        id: p.id as string,
        full_name: (p.full_name as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
        career: (p.career as string | null) ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * Los próximos planes. Con ciudad se filtra por ciudad; si ahí no hay nada
 * (campus pequeño, mes de agosto) se reintenta sin filtro antes que dejar el
 * bloque vacío, y entonces cada plan enseña su ciudad para que no engañe.
 */
async function fetchEvents(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  city: string | null
): Promise<UpcomingEvent[]> {
  const nowIso = new Date().toISOString();
  const base = () =>
    supabase
      .from("events")
      .select("id, title, start_date, price, city")
      .eq("status", "upcoming")
      .gte("start_date", nowIso)
      .order("start_date", { ascending: true })
      .limit(MAX_EVENTS);

  const map = (rows: Record<string, unknown>[]): UpcomingEvent[] =>
    rows.map((e) => ({
      id: e.id as string,
      title: e.title as string,
      start_date: e.start_date as string,
      price: e.price == null ? null : Number(e.price),
      city: (e.city as string | null) ?? null,
    }));

  try {
    if (city) {
      const { data, error } = await base().eq("city", city);
      if (!error && data && data.length > 0) return map(data);
    }
    const { data, error } = await base();
    if (error || !data) return [];
    return map(data);
  } catch {
    return [];
  }
}

/**
 * Zonas de ocio mejor valoradas de la ciudad. Mismos filtros que /ocio
 * (`is_verified` y `is_paid`) para no enseñar aquí sitios que allí no salen.
 * Catálogo público, así que se lee con el cliente anónimo.
 */
async function fetchSpots(city: string | null): Promise<Spot[]> {
  if (!city) return [];
  try {
    const anon = createPublicSupabase();
    const { data, error } = await anon
      .from("leisure_spots")
      .select("id, name, category, rating, image_url")
      .eq("is_verified", true)
      .eq("is_paid", true)
      .eq("city", city)
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(MAX_SPOTS);
    if (error || !data) return [];
    return data.map((s) => ({
      id: s.id as string,
      name: s.name as string,
      category: s.category as string,
      rating: s.rating == null ? null : Number(s.rating),
      image_url: (s.image_url as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

export default async function HomeSidebarRight({ userId, universityId, city }: Props) {
  const supabase = await createServerSupabase();

  // La ciudad manda en dos de los tres bloques, así que se resuelve antes;
  // el resto va en paralelo para no encadenar esperas.
  const effectiveCity = await resolveCity(city, universityId);
  const [people, events, spots] = await Promise.all([
    fetchSuggestions(supabase, userId, universityId),
    fetchEvents(supabase, effectiveCity),
    fetchSpots(effectiveCity),
  ]);

  const ocioHref = effectiveCity
    ? `/ocio?ciudad=${encodeURIComponent(effectiveCity)}`
    : "/ocio";
  const eventosHref = effectiveCity
    ? `/eventos?ciudad=${encodeURIComponent(effectiveCity)}`
    : "/eventos";

  // Si no hay absolutamente nada que descubrir, la columna no se pinta: mejor
  // espacio en blanco que tres tarjetas vacías pidiendo perdón.
  if (people.length === 0 && events.length === 0 && spots.length === 0) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── A quién seguir ───────────────────────────────────────────── */}
      {people.length > 0 && (
        <Card icon={UserPlus} title="A quién seguir" index={0}>
          <ul className="divide-y divide-border-light">
            {people.map((person) => {
              const name = person.full_name?.trim() || "Estudiante";
              return (
                <li key={person.id} className="flex items-center gap-2.5 px-4 py-3">
                  <Link
                    href={`/perfil/${person.id}`}
                    className="group flex min-w-0 flex-1 items-center gap-2.5"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-50 ring-1 ring-border transition-[box-shadow] duration-200 group-hover:ring-violet/40">
                      {person.avatar_url ? (
                        <Image
                          src={person.avatar_url}
                          alt=""
                          width={40}
                          height={40}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="text-xs font-bold text-violet-deep">
                          {initialsOf(person.full_name)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-text-primary transition-colors duration-200 group-hover:text-violet">
                        {name}
                      </span>
                      {person.career && (
                        <span className="block truncate text-xs text-text-muted">
                          {person.career}
                        </span>
                      )}
                    </span>
                  </Link>
                  <HomeFollowButton
                    followerId={userId}
                    profileId={person.id}
                    name={name}
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ── Próximos planes ──────────────────────────────────────────── */}
      {events.length > 0 && (
        <Card icon={CalendarDays} title="Próximos planes" index={1}>
          <ul className="divide-y divide-border-light">
            {events.map((ev) => {
              const free = ev.price == null || ev.price === 0;
              // La ciudad solo se nombra cuando NO es la del usuario, que es
              // justo el caso del reintento sin filtro.
              const otherCity =
                ev.city && effectiveCity && ev.city !== effectiveCity ? ev.city : null;
              return (
                <li key={ev.id}>
                  <Link
                    href={`/eventos/${ev.id}`}
                    className="group flex items-start gap-2 px-4 py-3 transition-colors duration-200 hover:bg-bg-secondary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text-primary transition-colors duration-200 group-hover:text-violet">
                        {ev.title}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {shortDate(ev.start_date)}
                        {otherCity && ` · ${otherCity}`}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular ${
                        free
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-violet-50 text-violet-deep"
                      }`}
                    >
                      {free ? "Gratis" : `${ev.price}€`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <CardFooterLink href={eventosHref} label="Ver todos los planes" icon={ArrowRight} />
        </Card>
      )}

      {/* ── Zonas de ocio cerca ──────────────────────────────────────── */}
      {spots.length > 0 && (
        <Card
          icon={MapPinned}
          title="Ocio cerca"
          subtitle={effectiveCity ?? undefined}
          index={2}
        >
          <ul className="divide-y divide-border-light">
            {spots.map((spot) => {
              const Fallback = CAT_ICON[spot.category] ?? MapPin;
              return (
                <li key={spot.id}>
                  <Link
                    href={`/ocio/${spot.id}`}
                    className="group flex items-center gap-2.5 px-4 py-3 transition-colors duration-200 hover:bg-bg-secondary"
                  >
                    {/* Miniatura con marco hairline; sin foto, el icono de la
                        categoría suelto (sin cuadrado tintado detrás). */}
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                      {spot.image_url ? (
                        <Image
                          src={spot.image_url}
                          alt=""
                          width={40}
                          height={40}
                          className="h-full w-full rounded-xl object-cover ring-1 ring-border"
                          unoptimized
                        />
                      ) : (
                        <Fallback
                          className="h-5 w-5 text-text-muted transition-colors duration-200 group-hover:text-violet"
                          aria-hidden
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text-primary transition-colors duration-200 group-hover:text-violet">
                        {spot.name}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {CAT_LABEL[spot.category] || spot.category}
                      </span>
                    </span>
                    {spot.rating != null && spot.rating > 0 && (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-text-secondary tabular">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                        {spot.rating.toFixed(1)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* El mapa completo vive en /ocio: aquí solo el enlace, para no
              cargar Leaflet en la home (ver la nota de arriba). */}
          <CardFooterLink href={ocioHref} label="Ver el mapa" icon={Map} />
        </Card>
      )}
    </div>
  );
}

/** Tarjeta de la columna: mismo lenguaje visual que la columna izquierda. */
function Card({
  icon: Icon,
  title,
  subtitle,
  index = 0,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  /** Posición en la columna: retrasa la entrada en cascada. */
  index?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card animate-list-in"
      style={{ ["--i" as string]: index * 2 }}
    >
      <div className="flex items-center gap-2 border-b border-border-light px-4 py-3">
        <Icon className="h-4 w-4 shrink-0 text-text-primary" aria-hidden />
        <h2 className="font-heading text-sm font-bold text-text-primary">{title}</h2>
        {subtitle && (
          <span className="ml-auto truncate text-xs text-text-muted">{subtitle}</span>
        )}
      </div>
      {children}
    </section>
  );
}

/** Pie de tarjeta con el enlace a la sección completa. */
function CardFooterLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-center gap-1.5 border-t border-border-light px-4 py-2.5 text-xs font-semibold text-text-primary transition-colors duration-200 hover:bg-bg-secondary"
    >
      <span className="link-underline">{label}</span>
      <Icon className="h-3.5 w-3.5 text-text-muted arrow-nudge" aria-hidden />
    </Link>
  );
}
