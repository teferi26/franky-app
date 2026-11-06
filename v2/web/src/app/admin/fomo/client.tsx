"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  ShieldAlert,
  Trash2,
  Eye,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PanelHeader, Panel, Quiet } from "../components/panel-ui";
import { useAccountGuard, withAccountScope } from '@/components/AccountScope';
import PublicationQueue from './PublicationQueue';

interface ModItem {
  report_id: string;
  due_at: string;
  status: string;
  target_type: string;
  target_id: string;
  thread_id?: string;
  body: string | null;
  media_url: string | null;
  media_type: "image" | "audio" | "video" | null;
  is_anonymous: boolean;
  is_hidden: boolean;
  is_deleted: boolean;
  report_count: number;
  created_at: string;
  author_id: string;
  author_name: string | null;
  reasons: string[];
}

type Action = "delete" | "hide" | "unhide" | "dismiss";

function AdminFomoClient({ readOnly = false }: { readOnly?: boolean }) {
  const supabase = createClient();
  const { owner, isCurrent } = useAccountGuard();
  const toast = useToast();
  const [items, setItems] = useState<ModItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_social_reports');
    if (!isCurrent()) return;
    setLoadError(!!error);
    setItems((data ?? []).map((row: { id: string; due_at: string; status: string; target_kind: string; target_id: string; reason: string; created_at: string; content: { body?: string | null; media_url?: string | null; media_type?: 'image' | 'audio' | 'video' | null; is_hidden?: boolean } | null }) => ({
      report_id: row.id, due_at: row.due_at, status: row.status, target_type: row.target_kind, target_id: row.target_id,
      body: row.content?.body ?? 'El contenido ya no está disponible.', media_url: row.content?.media_url ?? null,
      media_type: row.content?.media_type ?? null, is_hidden: row.content?.is_hidden ?? false, is_deleted: !row.content,
      report_count: 1, created_at: row.created_at, author_id: '', author_name: null, is_anonymous: true, reasons: [row.reason],
    })));
    setLoading(false);
  }, [supabase, isCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  const moderate = useCallback(
    async (item: ModItem, action: Action) => {
      setBusy(item.target_id + action);
      const { data: { session } } = await supabase.auth.getSession();
      if (!isCurrent() || session?.user.id !== owner) return;
      const { error } = await supabase.rpc('admin_resolve_social_report', {
        p_report_id: item.report_id, p_action: action === 'unhide' ? 'restore' : action === 'dismiss' ? 'dismiss' : 'remove',
        p_reason: reasons[item.report_id]?.trim() ?? '',
      }).setHeader('Authorization', `Bearer ${session.access_token}`);
      if (!isCurrent()) return;
      setBusy(null);
      if (error) {
        toast.error(
          "No se pudo moderar",
          'Comprueba que has verificado tu sesión con doble factor y escrito el motivo de la decisión.'
        );
        return;
      }
      load();
    },
    [supabase, load, toast, isCurrent, owner, reasons]
  );

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <PanelHeader
          eyebrow="Moderación"
          title={
            <span className="inline-flex items-center gap-2.5">
              <ShieldAlert className="h-7 w-7 text-violet" strokeWidth={1.75} /> Moderación de contenido
            </span>
          }
          description="Revisa cada denuncia antes de 24 horas. Si confirmas una infracción, retira el contenido y suspende al autor. Si no hay infracción, descarta la denuncia y registra el motivo."
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin"><ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.75} /> Volver al panel</Link>
            </Button>
          }
        />

        <div className="mt-8">
          <PublicationQueue readOnly={readOnly} />
          {loading && (
            <div className="flex justify-center py-20 text-text-muted">
              <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.75} />
            </div>
          )}

          {loadError && <Panel><Quiet>No se pudo consultar la cola. Verifica tu sesión con doble factor y vuelve a intentarlo.</Quiet><Button type="button" onClick={load}>Reintentar</Button></Panel>}
          {!loading && !loadError && items.length === 0 && (
            <Panel><Quiet>No hay contenido reportado ni oculto. Todo en orden.</Quiet></Panel>
          )}

          {!loading && items.length > 0 && (
            <div className="space-y-3">
              {items.map((it, i) => (
                <Panel
                  key={it.report_id}
                  style={{ "--i": i } as CSSProperties}
                  className="animate-list-in p-5"
                >
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{{ fomo_thread: 'FOMO', fomo_reply: 'Respuesta', crush_post: 'Crush', story: 'Historia', story_highlight: 'Destacada' }[it.target_type] ?? it.target_type}</Badge>
                    <Badge variant="destructive">
                      {it.report_count} {it.report_count === 1 ? "reporte" : "reportes"}
                    </Badge>
                    {it.is_hidden && <Badge variant="warning">Oculto</Badge>}
                    <span className="text-xs text-text-muted">
                      Revisar antes de {new Date(it.due_at).toLocaleString('es-ES')}
                    </span>
                  </div>

                  {it.body && (
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
                      {it.body}
                    </p>
                  )}

                  {!readOnly && <label className="mt-3 block text-sm text-text-secondary">Motivo de la decisión
                    <textarea value={reasons[it.report_id] ?? ''} onChange={event => setReasons(prev => ({ ...prev, [it.report_id]: event.target.value }))}
                      maxLength={1000} rows={2} className="mt-1 w-full rounded-xl border border-border bg-bg-primary p-3 text-text-primary" />
                  </label>}
                  {it.media_url && it.media_type === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.media_url} alt="adjunto" className="mt-3 max-h-40 rounded-xl border border-border" />
                  )}
                  {it.media_url && it.media_type === "audio" && (
                    <audio controls src={it.media_url} className="mt-3 w-full" />
                  )}
                  {it.media_url && it.media_type === "video" && (
                    <video controls playsInline preload="metadata" src={it.media_url} className="mt-3 max-h-60 rounded-xl border border-border" />
                  )}

                  {it.reasons.length > 0 && (
                    <p className="mt-2 text-xs text-text-muted">
                      Motivos: {it.reasons.join(" · ")}
                    </p>
                  )}

                  {readOnly ? (
                    <p className="mt-4 border-t border-border-light pt-4 text-xs text-text-muted">
                      Solo lectura: la moderación la hace el admin.
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border-light pt-4">
                      <Button type="button" variant="destructive" size="sm" disabled={!!busy || (reasons[it.report_id]?.trim().length ?? 0) < 3} onClick={() => moderate(it, "delete")}>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} /> Retirar y suspender autor
                      </Button>
                      {it.is_hidden ? (
                        <Button type="button" variant="outline" size="sm" disabled={!!busy || (reasons[it.report_id]?.trim().length ?? 0) < 3} onClick={() => moderate(it, "unhide")}>
                          <Eye className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} /> Restaurar
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" size="sm" disabled={!!busy || (reasons[it.report_id]?.trim().length ?? 0) < 3} onClick={() => moderate(it, "dismiss")}>
                        <Check className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} /> Descartar reportes
                      </Button>
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default withAccountScope(AdminFomoClient);
