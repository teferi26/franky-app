"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProfessionalRpc } from "./useProfessionalRpc";
import {
  professionalError,
  type ProfessionalNoticePage,
  type ProfessionalNotice,
} from "../../../../shared/professional-services";

export function ProfessionalNotices({
  owner,
  organizationId,
  onOpen,
}: {
  owner: string;
  organizationId?: string;
  onOpen: (notice: ProfessionalNotice) => Promise<void>;
}) {
  const rpc = useProfessionalRpc(owner),
    [page, setPage] = useState<ProfessionalNoticePage>({
      items: [],
      next_cursor: null,
      unread_count: 0,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const live = useRef(true),
    version = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      version.current++;
    };
  }, []);
  const load = useCallback(
    async (cursor: string | null = null) => {
      const current = ++version.current;
      try {
        const result = await rpc<ProfessionalNoticePage>(
          "professional_list_notices",
          {
            p_organization_id: organizationId ?? null,
            p_cursor: cursor,
            p_limit: 20,
          },
        );
        if (live.current && current === version.current) {
          setPage((old) => ({
            ...result,
            items: cursor
              ? [
                  ...old.items,
                  ...result.items.filter(
                    (n) => !old.items.some((p) => p.id === n.id),
                  ),
                ]
              : result.items,
          }));
          setError("");
        }
      } catch (e) {
        if (live.current && current === version.current) {
          setPage({ items: [], next_cursor: null, unread_count: 0 });
          setError(professionalError((e as Error).message));
        }
      }
    },
    [rpc, organizationId],
  );
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  async function open(n: ProfessionalNotice) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await onOpen(n);
      await rpc("professional_read_notice", { p_notice_id: n.id });
      if (live.current) await load();
    } catch (e) {
      if (live.current) setError(professionalError((e as Error).message));
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <details className="my-6 rounded-2xl border border-border bg-bg-primary p-4">
      <summary className="cursor-pointer font-semibold">
        Avisos de reservas{" "}
        {page.unread_count > 0 && (
          <span className="ml-2 rounded-full bg-violet px-2 py-1 text-xs text-white">
            {page.unread_count} sin leer
          </span>
        )}
      </summary>
      <p className="mt-3 text-xs text-text-secondary">
        Confirmaciones, cambios y recordatorios dentro de Franky.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm">
          {error}
        </p>
      )}
      <div className="mt-4 space-y-3">
        {page.items.map((n) => (
          <article
            key={n.id}
            className={`rounded-xl border p-4 ${n.read_at ? "border-border" : "border-violet/30 bg-violet/5"}`}
          >
            <h3 className="font-semibold">{n.title}</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-text-secondary">
              {n.body}
            </p>
            <button
              className="mt-3 text-sm font-semibold text-violet disabled:opacity-40"
              type="button"
              disabled={busy}
              onClick={() => void open(n)}
            >
              Abrir reserva{!n.read_at ? " y marcar leído" : ""}
            </button>
          </article>
        ))}
      </div>
      {!page.items.length && !error && (
        <p className="mt-4 text-sm text-text-secondary">
          No tienes avisos pendientes de consultar.
        </p>
      )}
      <div className="mt-4 flex gap-4">
        <button
          type="button"
          className="text-sm text-violet"
          disabled={busy}
          onClick={() => void load()}
        >
          Actualizar avisos
        </button>
        {page.next_cursor && (
          <button
            type="button"
            className="text-sm text-violet"
            disabled={busy}
            onClick={() => void load(page.next_cursor)}
          >
            Ver anteriores
          </button>
        )}
      </div>
    </details>
  );
}
