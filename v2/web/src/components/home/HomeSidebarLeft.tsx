import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, CalendarDays, MessageCircle, Users, ShoppingBag, Ticket, ArrowRight } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase-server";

// ─── Columna izquierda de la home social ──────────────────────────────────
// La tarjeta de identidad, al estilo de la columna izquierda de Twitter o del
// menú lateral de Instagram web: quién eres, cuánta gente te sigue y los
// atajos a lo que de verdad usas a diario. Vive dentro de una columna sticky
// de 260px que solo existe en escritorio (ver HomeSocial), así que aquí no se
// gasta ni una clase en responsive: el móvil no la ve nunca.
//
// Es un Server Component: los contadores se resuelven en el servidor con la
// sesión del usuario, sin un solo byte de JavaScript de cliente ni scripts
// en línea (la CSP es estricta). Todo lo que consulta es fail-soft: si una
// query falla, la tarjeta se pinta igual y los contadores se quedan a 0.
//
// Diseño v3: superficie blanca con borde hairline, avatar con anillo fino (el
// degradado de marca desapareció), cifras en tabular y una lista de atajos
// limpia con la flecha que se desplaza al pasar el ratón.

type Props = {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  career: string | null;
  universityName: string;
  verified: boolean;
};

type SocialCounts = { posts: number; followers: number; following: number };

/**
 * Contadores de publicaciones, seguidores y siguiendo. Primero la RPC
 * get_social_counts (migración 123, misma firma que usa /perfil/[id]);
 * si no existe todavía en producción, tres counts head-only directos.
 * Nunca lanza: en el peor caso devuelve ceros.
 */
async function fetchSocialCounts(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string
): Promise<SocialCounts> {
  try {
    const { data, error } = await supabase.rpc("get_social_counts", { p_user: userId });
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      return {
        posts: Number(row?.posts ?? 0),
        followers: Number(row?.followers ?? 0),
        following: Number(row?.following ?? 0),
      };
    }
  } catch { /* sin RPC: caemos al conteo directo */ }
  try {
    const [p, fw, fg] = await Promise.all([
      // Mismos filtros que la RPC (123/124) para que el número no baile
      // según haya migración o no: los anónimos y los borrados no cuentan.
      supabase.from("fomo_threads").select("id", { head: true, count: "exact" })
        .eq("author_id", userId)
        .eq("is_anonymous", false)
        .eq("is_deleted", false)
        .eq("is_hidden", false),
      supabase.from("follows").select("follower_id", { head: true, count: "exact" })
        .eq("followee_id", userId),
      supabase.from("follows").select("followee_id", { head: true, count: "exact" })
        .eq("follower_id", userId),
    ]);
    return { posts: p.count ?? 0, followers: fw.count ?? 0, following: fg.count ?? 0 };
  } catch {
    return { posts: 0, followers: 0, following: 0 };
  }
}

/** Iniciales para cuando no hay foto: una o dos letras, nunca vacío. */
function initialsOf(name: string | null): string {
  const src = (name ?? "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Atajos del menú lateral: SOLO lo que no está ya en la barra de navegación.
 *
 * Estaban los siete: perfil, chats, notificaciones, guardado, comunidades,
 * mercado y entradas. Los cuatro primeros ya viven en la barra de arriba (y el
 * perfil, además, es la propia tarjeta de aquí encima, que enlaza a él), así
 * que la home enseñaba el mismo enlace dos veces a la vez. Eso no es tener más
 * accesos: es ruido, y es parte de por qué esto parecía un panel de control en
 * lugar de una portada.
 */
const SHORTCUTS: { href: string; label: string; icon: React.ElementType }[] = [
  // La agenda (horario, exámenes, entregas) es la pestaña Estudio de la app:
  // no está en la barra de arriba, así que aquí sí aporta un acceso nuevo.
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/comunidades", label: "Comunidades", icon: Users },
  { href: "/mercado", label: "Mercado", icon: ShoppingBag },
  { href: "/mis-entradas", label: "Mis entradas", icon: Ticket },
];

export default async function HomeSidebarLeft({
  userId,
  fullName,
  avatarUrl,
  career,
  universityName,
  verified,
}: Props) {
  const supabase = await createServerSupabase();

  const counts = await fetchSocialCounts(supabase, userId);

  const displayName = fullName?.trim() || "Estudiante";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Tarjeta de identidad ─────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
        <Link
          href="/perfil"
          className="group block p-5 text-center transition-colors duration-200 hover:bg-bg-secondary/60"
        >
          {/* Anillo hairline alrededor de la foto: separa sin gritar. */}
          <span className="inline-block rounded-full border border-border p-[3px] transition-colors duration-200 group-hover:border-violet/40">
            <span className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full bg-violet-50">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  width={72}
                  height={72}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="font-heading text-2xl font-bold text-violet-deep">
                  {initialsOf(fullName)}
                </span>
              )}
            </span>
          </span>

          <div className="mt-3 flex items-center justify-center gap-1">
            <p className="truncate font-heading text-base font-bold text-text-primary">
              {displayName}
            </p>
            {verified && (
              // El title va en el envoltorio: los iconos de lucide no aceptan
              // title como prop, y así el tooltip nativo funciona igual.
              <span
                className="shrink-0"
                title="Estudiante verificado: ha confirmado el correo de su universidad"
              >
                <BadgeCheck className="h-4 w-4 text-violet" aria-label="Estudiante verificado" />
              </span>
            )}
          </div>

          {career && (
            <p className="mt-0.5 truncate text-sm text-text-secondary">{career}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-text-muted">{universityName}</p>
        </Link>

        {/* ── Contadores del grafo social ─────────────────────────────── */}
        <div className="grid grid-cols-3 border-t border-border-light">
          <CounterLink value={counts.posts} label="Publicaciones" />
          <CounterLink value={counts.followers} label="Seguidores" className="border-x border-border-light" />
          <CounterLink value={counts.following} label="Siguiendo" />
        </div>
      </div>

      {/* ── Atajos ───────────────────────────────────────────────────── */}
      <nav
        aria-label="Accesos rápidos"
        className="rounded-2xl border border-border bg-bg-primary p-2 shadow-card"
      >
        {SHORTCUTS.map(({ href, label, icon: Icon }, i) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-secondary animate-list-in"
            style={{ ["--i" as string]: i }}
          >
            <Icon className="h-4 w-4 shrink-0 text-text-primary transition-colors duration-200 group-hover:text-violet" />
            <span className="truncate">{label}</span>
            <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100 arrow-nudge" />
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Un contador, enlazado al perfil (donde se ven las listas completas). */
function CounterLink({
  value,
  label,
  className = "",
}: {
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href="/perfil"
      className={`px-1 py-3 text-center transition-colors duration-200 hover:bg-bg-secondary/60 ${className}`}
    >
      <span className="block font-heading text-lg font-extrabold leading-tight text-text-primary tabular">
        {value}
      </span>
      <span className="block text-[11px] text-text-muted">{label}</span>
    </Link>
  );
}
