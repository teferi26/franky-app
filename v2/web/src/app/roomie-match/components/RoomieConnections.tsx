"use client";
import { useState, useMemo, useCallback, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle, MapPin, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { usePagedFeed } from "@/hooks/usePagedFeed";
import { useAuth } from "@/hooks/useAuth";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export type RoomieConnectionTab = "matches" | "given" | "received";
type Connection = { id: string; full_name: string | null; avatar_url: string | null; city: string | null; career: string | null; budget_min: number | null; budget_max: number | null; university_name: string | null; compatibility_score: number | null; conversation_id: string | null };
const TABS = [{ key: "matches", label: "Matches" }, { key: "received", label: "Les encajas" }, { key: "given", label: "Tus likes" }] as const;

// Silueta de tarjeta de conexión mientras llega la página.
function ConnectionSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card" aria-hidden="true">
      <div className="flex items-start gap-3">
        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-2/3 rounded-md" />
          <Skeleton className="h-3 w-1/2 rounded-md" />
        </div>
      </div>
      <div className="my-4 flex gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export default function RoomieConnections({ initialTab = "matches" }: { initialTab?: RoomieConnectionTab }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div role="status" aria-busy="true" className="grid gap-3 p-6 sm:grid-cols-2">
        <span className="sr-only">Cargando tus conexiones…</span>
        <ConnectionSkeleton />
        <ConnectionSkeleton />
      </div>
    );
  }
  if (!user) return <Link href="/login?next=%2Froomie-match" className="link-underline inline-block p-6 font-semibold text-violet">Inicia sesión para ver tus conexiones</Link>;
  return <OwnedRoomieConnections key={user.id} owner={user.id} initialTab={initialTab} />;
}

function OwnedRoomieConnections({ owner, initialTab }: { owner: string; initialTab: RoomieConnectionTab }) {
  const isCurrent = useSessionGuard(owner);
  const operation = useRef(false);
  const [tab, setTab] = useState<RoomieConnectionTab>(initialTab);
  const [busy, setBusy] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const router = useRouter();
  const fetchPage = useCallback(async (offset: number) => {
    if (!isCurrent()) return [];
    const { data, error } = await supabase.rpc("get_my_roomie_connections", { p_tab: tab, p_limit: 30, p_offset: offset });
    if (!isCurrent()) return [];
    if (error) throw error;
    return (data ?? []) as Connection[];
  }, [supabase, tab, isCurrent]);
  const { items, loading, loadingMore, hasMore, error, moreError, reload, loadMore } = usePagedFeed(fetchPage, 30);
  const act = async (person: Connection, action: "like" | "chat") => {
    if (operation.current || !isCurrent()) return;
    operation.current = true;
    setBusy(person.id);
    try {
      if (action === "chat") {
        const { data, error } = await supabase.rpc("get_or_create_direct_chat", { p_other_user_id: person.id });
        if (!isCurrent()) return;
        if (error || !data) throw error ?? new Error("chat_failed");
        router.push(`/chats?chat=${encodeURIComponent(data)}`);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!isCurrent() || user?.id !== owner) return;
        if (!user) { router.push("/login?next=/roomie-match"); return; }
        const { data, error } = await supabase.rpc("process_swipe_action", { p_user_id: user.id, p_target_id: person.id, p_target_type: "roomie", p_action: "like" });
        if (!isCurrent()) return;
        if (error) throw error;
        if (data?.match) { toast.success("¡Os encajáis!", data.conversation_id ? "Tenéis una conversación disponible en Matches." : "El interés es mutuo. La conversación depende de vuestras preferencias de privacidad."); setTab("matches"); }
        else toast.success("Like guardado", "Lo encontrarás en Tus likes.");
        reload();
      }
    } catch (cause) {
      if (!isCurrent()) return;
      const message = (cause as { message?: string })?.message ?? "";
      toast.error(message.includes("roomie_profile_incomplete") ? "Completa tu perfil de Roomie" : message.includes("not_allowed") ? "Esta persona ha limitado quién puede escribirle" : "No se pudo completar la acción", "Revisa tus preferencias o inténtalo de nuevo. Tus conexiones siguen guardadas.");
    } finally { operation.current = false; if (isCurrent()) setBusy(null); }
  };

  const emptyTitle =
    tab === "matches"
      ? "Tu próximo compañero puede estar a un like"
      : tab === "received"
        ? "Aquí aparecerán las personas a las que encajas"
        : "Guarda aquí a quienes te encajan";
  const emptyDescription =
    tab === "matches"
      ? "Cuando el interés sea mutuo apareceréis aquí, también después de recargar."
      : "Completa tu ciudad, presupuesto y hábitos para que sea más fácil encontrar con quién vivir.";

  return (
    <section id="roomie-likes" className="scroll-mt-24 rounded-3xl border border-border bg-bg-primary p-4 shadow-card sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xl">
          <p className="eyebrow">Conexiones</p>
          <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight text-text-primary">De encajar a compartir piso.</h2>
          <p className="mt-1 text-sm text-text-muted">Un match significa que ambos os habéis dado like. A partir de ahí, hablad de lo importante.</p>
        </div>
        <Link href="/roomie-match" className="group inline-flex items-center gap-1 text-sm font-semibold text-violet">
          <span className="link-underline">Descubrir</span>
          <ArrowUpRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
        </Link>
      </div>

      {/* Pestañas: segmento neutro con la activa en blanco */}
      <nav aria-label="Conexiones Roomie" className="mb-6 grid grid-cols-3 gap-1 rounded-xl bg-bg-secondary p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "min-h-10 rounded-lg px-2 text-sm font-medium transition-[color,background-color,box-shadow] duration-200",
              tab === item.key ? "bg-bg-primary font-semibold text-text-primary shadow-card" : "text-text-muted hover:text-text-primary"
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div role="status" aria-busy="true" className="grid gap-3 sm:grid-cols-2">
          <span className="sr-only">Cargando tus conexiones…</span>
          <ConnectionSkeleton />
          <ConnectionSkeleton />
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-border p-6">
          <p className="text-sm text-text-secondary">No se pudieron cargar tus conexiones. Comprueba tu sesión y vuelve a intentarlo.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={reload}>Reintentar</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={emptyTitle}
          description={emptyDescription}
          action={{ href: "/roomie-match", label: "Descubrir roomies" }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((person, i) => (
            <article
              key={person.id}
              className="hover-lift animate-list-in flex flex-col rounded-2xl border border-border bg-bg-primary p-4 shadow-card hover:border-text-primary/15"
              style={{ "--i": i } as CSSProperties}
            >
              <div className="flex items-start gap-3">
                {person.avatar_url ? (
                  <img src={person.avatar_url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-bg-secondary font-heading text-lg font-bold text-text-primary">
                    {(person.full_name ?? "R").charAt(0)}
                  </span>
                )}
                <div className="min-w-0">
                  <h3 className="font-heading text-lg font-bold leading-tight text-text-primary">{person.full_name || "Estudiante"}</h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{[person.career, person.university_name].filter(Boolean).join(" · ")}</p>
                  {person.city && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                      <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                      {person.city}
                    </p>
                  )}
                </div>
              </div>
              <div className="my-4 flex flex-wrap items-center gap-2 text-xs">
                {person.budget_min != null && (
                  <span className="rounded-full border border-border px-3 py-1 font-medium text-text-secondary tabular">
                    de {person.budget_min} a {person.budget_max ?? person.budget_min} €/mes
                  </span>
                )}
                {person.compatibility_score != null && (
                  <span className="text-text-muted">
                    <span className="font-heading text-base font-bold text-violet tabular">{Math.round(person.compatibility_score)}%</span> afinidad de hábitos
                  </span>
                )}
              </div>
              {tab !== "given" && (
                <Button
                  className="mt-auto w-full"
                  variant={tab === "matches" ? "dark" : "default"}
                  disabled={busy !== null}
                  loading={busy === person.id}
                  onClick={() => act(person, tab === "matches" ? "chat" : "like")}
                >
                  {busy !== person.id && (tab === "matches" ? <MessageCircle className="h-4 w-4" aria-hidden="true" /> : <Heart className="h-4 w-4" aria-hidden="true" />)}
                  {tab === "matches" ? "Abrir conversación" : "También me encaja"}
                </Button>
              )}
              {tab === "given" && <p className="mt-auto text-xs text-text-muted">Like guardado. Si también le encajas, aparecerá en Matches.</p>}
            </article>
          ))}
        </div>
      )}
      {moreError && <p role="alert" className="mt-4 text-sm text-text-secondary">No se pudo cargar la siguiente página. Puedes reintentar.</p>}
      {hasMore && (
        <Button variant="outline" className="mt-5 w-full" onClick={loadMore} disabled={loadingMore} loading={loadingMore}>
          {loadingMore ? "Cargando…" : "Ver más conexiones"}
        </Button>
      )}
    </section>
  );
}
