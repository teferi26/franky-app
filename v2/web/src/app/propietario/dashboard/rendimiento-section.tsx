"use client";

import { Fragment, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye, Heart, Inbox, CalendarDays, Home, ChevronDown, ChevronUp,
  Check, X, MessageCircle, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal, CountUp } from "@/components/motion";
import { createClient } from "@/lib/supabase-client";
import { cn } from "@/lib/utils";
import {
  SectionTitle, Panel, Notice, tableClass, thClass, tdClass, trClass,
} from "./panel-ui";

export interface ListingStat {
  accommodation_id: string;
  title: string;
  status: string | null;
  is_paid: boolean | null;
  price: number | null;
  cover_image: string | null;
  views_total: number;
  views_7d: number;
  likes: number;
  favorites: number;
  requests_pending: number;
  requests_total: number;
  visits_upcoming: number;
  visits_total: number;
  created_at: string;
}

export interface InterestedRequest {
  id: string;
  accommodation_id: string;
  user_id: string;
  status: string;
  message: string | null;
  created_at: string;
  student_name: string | null;
  student_avatar: string | null;
}

function requestBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="warning">Pendiente</Badge>;
    case "accepted":
      return <Badge variant="success">Aceptada</Badge>;
    case "rejected":
      return <Badge variant="outline">Rechazada</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function RendimientoSection({
  stats,
  requests: initialRequests,
}: {
  stats: ListingStat[];
  requests: InterestedRequest[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  // La web solo PINTABA "3 interesados · Pendiente": no había forma de aceptar,
  // rechazar ni escribir. En la app móvil (mobile/app/mis-pisos.tsx) sí se
  // podía desde julio, y ni la RPC ni la RLS lo impedían aquí. Se replica.
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelta, setPendingDelta] = useState<Record<string, number>>({});

  /**
   * Aceptar o rechazar. La política "Owners update request status" de la
   * migración 011 es FOR UPDATE USING (accommodation_id IN mis pisos); sin
   * WITH CHECK, Postgres reutiliza el USING, y como no tocamos
   * accommodation_id el UPDATE pasa.
   */
  const decidir = async (
    req: InterestedRequest,
    next: "accepted" | "rejected"
  ) => {
    if (busy) return;
    setBusy(req.id);
    setError(null);
    const { data, error: updateError } = await createClient()
      .from("accommodation_requests")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", req.id)
      // Sin .select(), un UPDATE bloqueado por la RLS devuelve error null y
      // cero filas: la pantalla cantaría victoria sin haber cambiado nada.
      .select("id");
    setBusy(null);
    if (updateError) {
      setError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    if (!data?.length) {
      setError("No tienes permiso para responder a esta solicitud, o ya no existe.");
      return;
    }
    setRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, status: next } : r))
    );
    if (req.status === "pending") {
      setPendingDelta((prev) => ({
        ...prev,
        [req.accommodation_id]: (prev[req.accommodation_id] ?? 0) + 1,
      }));
    }
    // Que el resto del panel (contadores del servidor) se ponga al día.
    router.refresh();
  };

  /** Mismo DM 1:1 que el resto de la web (RPC idempotente). */
  const chatearCon = async (userId: string) => {
    if (busy) return;
    setBusy(userId);
    setError(null);
    const { data, error: rpcError } = await createClient().rpc(
      "get_or_create_direct_chat",
      { p_other_user_id: userId }
    );
    setBusy(null);
    if (rpcError || !data) {
      setError(
        rpcError?.message?.includes("not_allowed")
          ? "Este estudiante limita quién puede escribirle."
          : "No se pudo abrir el chat. Inténtalo de nuevo."
      );
      return;
    }
    router.push(`/chats?chat=${data}`);
  };

  if (stats.length === 0) return null;

  /** Pendientes del servidor menos las que se acaban de responder aquí. */
  const pendientesDe = (s: ListingStat) =>
    Math.max(0, s.requests_pending - (pendingDelta[s.accommodation_id] ?? 0));

  const totals = stats.reduce(
    (acc, s) => ({
      views7d: acc.views7d + s.views_7d,
      interest: acc.interest + s.likes + s.favorites,
      pending: acc.pending + pendientesDe(s),
      visits: acc.visits + s.visits_upcoming,
    }),
    { views7d: 0, interest: 0, pending: 0, visits: 0 }
  );

  const requestsByAcc = requests.reduce((map, r) => {
    const arr = map.get(r.accommodation_id) ?? [];
    arr.push(r);
    map.set(r.accommodation_id, arr);
    return map;
  }, new Map<string, InterestedRequest[]>());

  const totalCards = [
    { label: "Vistas (7 días)", value: totals.views7d, Icon: Eye },
    { label: "Likes + favoritos", value: totals.interest, Icon: Heart },
    { label: "Solicitudes pendientes", value: totals.pending, Icon: Inbox },
    { label: "Visitas próximas", value: totals.visits, Icon: CalendarDays },
  ];

  return (
    <Reveal as="section">
      <SectionTitle
        eyebrow="Últimos 7 días"
        title="Rendimiento de tus pisos"
        className="mb-4"
        aside={
          <Link
            href="/propietario/dashboard/visitas"
            className="group inline-flex items-center gap-1 text-sm font-semibold text-text-primary link-underline"
          >
            Gestionar visitas
            <ArrowRight className="h-4 w-4 arrow-nudge" strokeWidth={1.75} />
          </Link>
        }
      />

      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      {/* Totales: cifra grande y rótulo, separados por líneas. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
        {totalCards.map(({ label, value, Icon }) => (
          <div key={label} className="bg-bg-primary px-4 py-5 sm:px-5">
            <dt className="flex items-center gap-1.5 text-xs text-text-muted">
              <Icon className="h-3.5 w-3.5 text-violet" strokeWidth={1.75} />
              {label}
            </dt>
            <dd className="mt-1.5 font-heading text-3xl font-extrabold tracking-tight text-text-primary tabular">
              <CountUp value={value} />
            </dd>
          </div>
        ))}
      </dl>

      {/* Por piso: tabla con una fila desplegable de interesados. */}
      <Panel className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>Piso</th>
                <th scope="col" className={cn(thClass, "text-right")} title="Vistas: últimos 7 días / totales">Vistas</th>
                <th scope="col" className={cn(thClass, "text-right")} title="Likes y favoritos">Interés</th>
                <th scope="col" className={cn(thClass, "text-right")} title="Solicitudes: pendientes / totales">Solicitudes</th>
                <th scope="col" className={cn(thClass, "text-right")} title="Visitas: próximas / totales">Visitas</th>
                <th scope="col" className={thClass}>
                  <span className="sr-only">Interesados</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const reqs = requestsByAcc.get(s.accommodation_id) ?? [];
                const isOpen = expanded === s.accommodation_id;
                return (
                  <Fragment key={s.accommodation_id}>
                    <tr className={cn(trClass, isOpen && "bg-bg-secondary/60")}>
                      <td className={cn(tdClass, "min-w-[220px]")}>
                        <div className="flex items-center gap-3">
                          {s.cover_image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={s.cover_image}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-secondary">
                              <Home className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-text-primary">{s.title}</p>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {s.status !== "active" && <Badge variant="outline">Inactivo</Badge>}
                              {s.is_paid === false && <Badge variant="warning">Sin publicar</Badge>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={cn(tdClass, "text-right tabular")}>
                        <span className="font-semibold text-text-primary">{s.views_7d}</span>
                        <span className="text-text-muted"> / {s.views_total}</span>
                      </td>
                      <td className={cn(tdClass, "text-right font-semibold text-text-primary tabular")}>
                        {s.likes + s.favorites}
                      </td>
                      <td className={cn(tdClass, "text-right tabular")}>
                        <span className="font-semibold text-text-primary">{pendientesDe(s)}</span>
                        <span className="text-text-muted"> / {s.requests_total}</span>
                      </td>
                      <td className={cn(tdClass, "text-right tabular")}>
                        <Link
                          href="/propietario/dashboard/visitas"
                          className="link-underline"
                          title="Visitas: próximas / totales"
                        >
                          <span className="font-semibold text-text-primary">{s.visits_upcoming}</span>
                          <span className="text-text-muted"> / {s.visits_total}</span>
                        </Link>
                      </td>
                      <td className={cn(tdClass, "text-right")}>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? null : s.accommodation_id)}
                          className="whitespace-nowrap"
                        >
                          {reqs.length} interesado{reqs.length === 1 ? "" : "s"}
                          {isOpen ? (
                            <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                          )}
                        </Button>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-bg-secondary/40">
                        <td colSpan={6} className="border-b border-border-light px-4 py-3">
                          {reqs.length === 0 ? (
                            <p className="text-xs text-text-muted">
                              Todavía no hay solicitudes para este piso.
                            </p>
                          ) : (
                            <ul className="divide-y divide-border-light">
                              {reqs.map((r, j) => (
                                <li
                                  key={r.id}
                                  style={{ "--i": j } as CSSProperties}
                                  className="animate-list-in flex flex-wrap items-center gap-2 py-2 text-sm"
                                >
                                  {r.student_avatar ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={r.student_avatar}
                                      alt=""
                                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-deep">
                                      {(r.student_name ?? "E").charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <Link
                                    href={`/perfil/${r.user_id}`}
                                    className="truncate font-medium text-text-primary link-underline"
                                  >
                                    {r.student_name ?? "Estudiante"}
                                  </Link>
                                  {requestBadge(r.status)}
                                  {r.message && (
                                    <span className="hidden truncate text-xs text-text-muted sm:inline">
                                      &ldquo;{r.message}&rdquo;
                                    </span>
                                  )}
                                  <span className="ml-auto shrink-0 text-[11px] text-text-muted tabular">
                                    {new Date(r.created_at).toLocaleDateString("es-ES", {
                                      day: "numeric",
                                      month: "short",
                                    })}
                                  </span>
                                  {/* Acciones: aceptar, rechazar y chatear. Antes
                                      aquí solo había una etiqueta "Pendiente". */}
                                  <div className="flex basis-full shrink-0 items-center gap-1.5 sm:basis-auto">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => chatearCon(r.user_id)}
                                      disabled={busy !== null}
                                      loading={busy === r.user_id}
                                    >
                                      {busy !== r.user_id && (
                                        <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                                      )}
                                      Chatear
                                    </Button>
                                    {r.status === "pending" && (
                                      <>
                                        <Button
                                          type="button"
                                          variant="dark"
                                          size="sm"
                                          onClick={() => decidir(r, "accepted")}
                                          disabled={busy !== null}
                                          loading={busy === r.id}
                                        >
                                          {busy !== r.id && <Check className="h-3.5 w-3.5" strokeWidth={2} />}
                                          Aceptar
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => decidir(r, "rejected")}
                                          disabled={busy !== null}
                                          className="hover:text-error"
                                        >
                                          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                                          Rechazar
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </Reveal>
  );
}
