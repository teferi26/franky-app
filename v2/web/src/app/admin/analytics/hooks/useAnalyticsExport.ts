"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccountGuard } from '@/components/AccountScope';
import { downloadJson } from '@/lib/csv-export';

const BLOCKS = [
  ['kpis', 'Resumen'], ['users', 'Personas'], ['product', 'Estudios y pantallas'],
  ['engagement', 'Uso'], ['monetization', 'Ingresos'], ['content', 'Contenido'],
  ['security', 'Seguridad'], ['growth', 'Crecimiento'],
] as const;

/** Export one explicit context, never a mixture of accounts or filter changes. */
export function useAnalyticsExport(queryString: string) {
  const { owner, isCurrent } = useAccountGuard();
  const context = useRef({ owner, queryString });
  context.current = { owner, queryString };
  const pending = useRef<AbortController | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDownloading(false); setMessage(null);
    return () => { pending.current?.abort(); pending.current = null; };
  }, [owner, queryString]);

  const downloadSnapshot = useCallback(async () => {
    if (pending.current || !owner || !isCurrent()) return;
    const controller = new AbortController(); pending.current = controller;
    const current = () => !controller.signal.aborted && isCurrent()
      && context.current.owner === owner && context.current.queryString === queryString;
    setDownloading(true); setMessage(null);
    const startedAt = new Date().toISOString();
    const data: Record<string, unknown> = {};
    const failed: string[] = [];
    let denied = false; let index = 0;
    try {
      // Limit concurrent expensive aggregate requests; never publish a partial file.
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (current() && index < BLOCKS.length) {
          const [name, label] = BLOCKS[index++];
          try {
            const response = await fetch(`/api/admin/analytics/${name}?${queryString}`, { cache: 'no-store', signal: controller.signal });
            const json = await response.json().catch(() => null);
            if (!current()) return;
            if (response.status === 401 || response.status === 403) denied = true;
            if (!response.ok || !json || typeof json !== 'object' || Array.isArray(json) || json.error || json._scope?.complete !== true) failed.push(label);
            else data[name] = json;
          } catch {
            if (current()) failed.push(label);
          }
        }
      }));
      if (!current()) return;
      if (failed.length) {
        setMessage(denied
          ? 'No se ha exportado nada. Revisa tu sesión y completa el segundo factor.'
          : `No se ha exportado nada porque faltan datos de ${failed.join(', ')}. Reintenta la descarga.`);
        return;
      }
      const completedAt = new Date().toISOString();
      downloadJson(`franky-analisis-${completedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`, {
        schema_version: 2,
        started_at: startedAt,
        completed_at: completedAt,
        complete: true,
        included_blocks: BLOCKS.map(([name]) => name),
        excluded_details: ['ambassador_individual_leads', 'event_creator_contacts', 'decision_center'],
        requested_filters: Object.fromEntries(new URLSearchParams(queryString)),
        scope_note: 'Cada bloque indica los filtros que aplica. Inventarios, suscripciones y ventanas fijas no representan una cohorte filtrada. Las consultas se realizan entre started_at y completed_at; no son una transacción simultánea.',
        data,
      });
      setMessage('Análisis descargado con los 8 bloques y el alcance de sus indicadores.');
    } finally {
      if (pending.current === controller) pending.current = null;
      if (current()) setDownloading(false);
    }
  }, [owner, isCurrent, queryString]);

  return { downloadSnapshot, downloading, message };
}
