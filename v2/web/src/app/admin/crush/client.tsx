"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Heart,
  Instagram,
  BadgeCheck,
  EyeOff,
  RotateCcw,
  UserX,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PanelHeader, Panel, Quiet } from "../components/panel-ui";

interface IgReport {
  reported_id: string;
  full_name: string | null;
  instagram_handle: string | null;
  instagram_verified: boolean;
  ig_quarantined: boolean;
  report_count: number;
  reasons: string[];
}

type Action = "quarantine" | "clear" | "wipe_handle";

export default function AdminCrushClient({ readOnly = false }: { readOnly?: boolean }) {
  const supabase = createClient();
  const toast = useToast();
  const [items, setItems] = useState<IgReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("admin_list_ig_reports");
    setItems((data as IgReport[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const moderate = useCallback(
    async (item: IgReport, action: Action) => {
      setBusy(item.reported_id + action);
      const { error } = await supabase.rpc("admin_ig_moderate", {
        p_target: item.reported_id,
        p_action: action,
      });
      setBusy(null);
      if (error) {
        toast.error(
          "No se pudo moderar",
          error.message.includes("forbidden")
            ? "Tu rol no tiene permiso de moderación (¿falta aplicar la migración 112?)"
            : error.message
        );
        return;
      }
      load();
    },
    [supabase, load, toast]
  );

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <PanelHeader
          eyebrow="Moderación"
          title={
            <span className="inline-flex items-center gap-2.5">
              <Heart className="h-7 w-7 text-violet" strokeWidth={1.75} /> Crush · Instagram reportados
            </span>
          }
          description="Perfiles de Instagram que la comunidad ha reportado. Revisa el motivo antes de actuar."
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin"><ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.75} /> Volver al panel</Link>
            </Button>
          }
        />

        <div className="mt-8">
          {loading && (
            <div className="flex justify-center py-20 text-text-muted">
              <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.75} />
            </div>
          )}

          {!loading && items.length === 0 && (
            <Panel><Quiet>No hay Instagram reportados. Todo en orden.</Quiet></Panel>
          )}

          {!loading && items.length > 0 && (
            <div className="space-y-3">
              {items.map((it, i) => (
                <Panel key={it.reported_id} style={{ "--i": i } as CSSProperties} className="animate-list-in p-5">
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <Badge variant="destructive">
                      {it.report_count} {it.report_count === 1 ? "reporte" : "reportes"}
                    </Badge>
                    {it.ig_quarantined && <Badge variant="warning">En cuarentena</Badge>}
                    {it.instagram_verified && (
                      <Badge variant="outline">
                        <BadgeCheck className="mr-1 h-3 w-3" strokeWidth={1.75} /> Verificado
                      </Badge>
                    )}
                    <span className="text-xs text-text-muted">{it.full_name || "Sin nombre"}</span>
                  </div>

                  {it.instagram_handle ? (
                    <a
                      href={`https://instagram.com/${it.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-underline inline-flex items-center gap-1.5 text-sm font-semibold text-violet"
                    >
                      <Instagram className="h-4 w-4" strokeWidth={1.75} /> @{it.instagram_handle}
                    </a>
                  ) : (
                    <span className="text-sm text-text-muted">Sin Instagram</span>
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
                      {!it.ig_quarantined && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!!busy}
                          onClick={() => moderate(it, "quarantine")}
                        >
                          <EyeOff className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} /> Cuarentena
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={!!busy}
                        onClick={() => moderate(it, "wipe_handle")}
                      >
                        <UserX className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} /> Borrar handle
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!!busy}
                        onClick={() => moderate(it, "clear")}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} /> Descartar (es legítimo)
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
