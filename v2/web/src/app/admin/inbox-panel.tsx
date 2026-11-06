"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase-client";
import { usePagedFeed } from "@/hooks/usePagedFeed";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionTitle, Panel, Chip, Notice, Quiet } from "./components/panel-ui";

type Message = { id: string; kind: string; subject: string | null; body: string; name: string | null; email: string | null; source: string; status: string; created_at: string; alert?: { status: string; attempts: number; last_error: string | null } };
const STATES = ["nuevo", "leido", "resuelto", "descartado"] as const;
const LABELS: Record<string, string> = { nuevo: "Nuevo", leido: "Leído", resuelto: "Resuelto", descartado: "Descartado" };
export default function InboxPanel({ readOnly }: { readOnly: boolean }) {
  const [filter, setFilter] = useState("nuevo");
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const fetchPage = useCallback(async (offset: number): Promise<Message[]> => {
    const db = createClient();
    let query = db.from("platform_messages").select("id,kind,subject,body,name,email,source,status,created_at").order("created_at", { ascending: false }).order("id").range(offset, offset + 29);
    if (filter !== "todos") query = query.eq("status", filter);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return [];
    const { data: alerts, error: alertError } = await db.from("staff_alert_outbox").select("data,status,attempts,last_error").in("data->>mensaje_id", data.map(row => row.id));
    if (alertError) throw alertError;
    return data.map(row => ({ ...row, alert: alerts?.find(alert => alert.data?.mensaje_id === row.id) }));
  }, [filter]);
  const { items, error, moreError, loading, loadingMore, hasMore, loadMore, reload } = usePagedFeed(fetchPage, 30);
  const update = async (id: string, status: string) => {
    if (busy || readOnly) return;
    setBusy(id);
    try {
      const db = createClient();
      const { data: { user } } = await db.auth.getUser();
      if (!user) throw new Error("auth_required");
      const { data, error } = await db.from("platform_messages").update({ status, handled_by: user.id, handled_at: new Date().toISOString() }).eq("id", id).select("id").single();
      if (error || !data) throw error ?? new Error("not_updated");
      reload();
    } catch { toast.error("No se pudo guardar el estado", "Comprueba tu sesión y segundo factor."); }
    finally { setBusy(null); }
  };
  return (
    <section className="space-y-5">
      <SectionTitle
        eyebrow="Soporte"
        title="Buzón de Franky"
        description="Contacto, ideas y fallos enviados desde la web y la app."
        aside={<Button variant="outline" size="sm" onClick={reload}>Actualizar</Button>}
      />
      <Notice>
        Cada mensaje queda guardado aquí. Los correos se reintentan automáticamente hasta ocho veces. «Aceptado» indica
        que el proveedor lo ha recibido; no confirma que haya llegado a la bandeja de entrada.
      </Notice>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar mensajes">
        {["nuevo", "leido", "resuelto", "descartado", "todos"].map((value, i) => (
          <Chip key={value} index={i} active={filter === value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {LABELS[value] ?? "Todos"}
          </Chip>
        ))}
      </div>
      {loading ? (
        <Quiet role="status">Cargando buzón…</Quiet>
      ) : error ? (
        <Notice tone="error" role="alert">
          <span className="mr-3">No se pudo cargar el buzón. Revisa tu sesión y el segundo factor.</span>
          <Button variant="outline" size="sm" onClick={reload}>Reintentar</Button>
        </Notice>
      ) : !items.length ? (
        <Panel><Quiet>No hay mensajes en este estado.</Quiet></Panel>
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => (
            <Panel key={item.id} style={{ "--i": i } as CSSProperties} className="animate-list-in space-y-3 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">{item.kind} · {item.source} · {new Date(item.created_at).toLocaleString("es-ES")}</p>
                  <h3 className="mt-2 font-heading text-lg font-bold text-text-primary">{item.subject || "Mensaje sin asunto"}</h3>
                </div>
                <Badge variant={item.status === "nuevo" ? "default" : item.status === "resuelto" ? "success" : "outline"}>
                  {LABELS[item.status]}
                </Badge>
              </div>
              <p className="text-sm text-text-secondary">{item.name || "Sin nombre"}{item.email ? ` · ${item.email}` : ""}</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">{item.body}</p>
              <p className={`text-xs ${item.alert?.status === "failed" ? "text-error" : "text-text-muted"}`}>Correo: {item.alert ? item.alert.status === "accepted" ? "aceptado por el proveedor" : item.alert.status === "failed" ? "no confirmado; requiere revisión" : "pendiente de confirmación" : "sin aviso registrado; mensaje guardado en el buzón"}{item.alert ? ` · ${item.alert.attempts}/8 intentos` : ""}{item.alert?.last_error ? ` · ${item.alert.last_error}` : ""}</p>
              {!readOnly && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {STATES.filter(status => status !== item.status).map(status => (
                    <Button key={status} variant="outline" size="sm" disabled={busy !== null} onClick={() => update(item.id, status)}>
                      Marcar {LABELS[status].toLowerCase()}
                    </Button>
                  ))}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
      {moreError && <Notice tone="error" role="alert">No se pudo cargar la siguiente página.</Notice>}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Cargando…" : "Ver más mensajes"}</Button>
        </div>
      )}
    </section>
  );
}
