"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccountGuard } from "@/components/AccountScope";

/**
 * Tiny SWR-like wrapper for the analytics endpoints. Avoids pulling in
 * SWR/React-Query just for this dashboard:
 *
 *   const { data, error, loading, refetch } = useAnalyticsQuery<KpisResponse>(
 *     `/api/admin/analytics/kpis?${queryString}`
 *   );
 *
 * Re-fetches whenever the URL changes. Cancels in-flight requests on unmount
 * so we don't set state on unmounted components.
 */

export type QueryState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
};

export function useAnalyticsQuery<T>(url: string | null): QueryState<T> {
  const { owner, isCurrent } = useAccountGuard();
  const [state, setState] = useState<{ url: string | null; owner: string | null; data: T | null; error: string | null; loading: boolean }>({ url, owner, data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const revision = useRef(0);

  useEffect(() => {
    const request = ++revision.current;
    if (!url || !owner || !isCurrent()) {
      setState({ url, owner, data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && request === revision.current && isCurrent();
    setState(previous => ({ url, owner, data: previous.url === url && previous.owner === owner ? previous.data : null, error: null, loading: true }));
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const mfa = [json?.error, json?.detail].some(value => typeof value === 'string' && /mfa_required|aal2/.test(value));
          if (res.status === 400 && json?.error === 'unsupported_period') throw new Error('Esta sección admite periodos recientes. Elige uno de los periodos del selector.');
          throw new Error(mfa ? 'Completa el segundo factor para consultar estos datos.' : res.status === 401 ? 'Tu sesión ha caducado. Vuelve a iniciar sesión.' : res.status === 403 ? 'Tu cuenta no tiene permiso para consultar estos datos.' : res.status === 400 ? 'Revisa los filtros y el periodo seleccionados.' : 'No se pudieron consultar los indicadores. Puedes reintentar.');
        }
        if (json === null || typeof json !== 'object') throw new Error('La respuesta no contiene indicadores válidos. Puedes reintentar.');
        return json;
      })
      .then((json) => {
        if (current()) setState({ url, owner, data: json as T, error: null, loading: false });
      })
      .catch((err) => {
        if (!current()) return;
        const message = err instanceof TypeError ? 'No se pudo conectar. Comprueba la conexión y reintenta.' : err instanceof Error ? err.message : 'No se pudieron consultar los indicadores.';
        setState({ url, owner, data: null, error: message, loading: false });
      });
    return () => controller.abort();
  }, [url, tick, owner, isCurrent]);

  const refetch = useCallback(() => setTick(t => t + 1), []);
  const matches = state.url === url && state.owner === owner && isCurrent();
  return { data: matches ? state.data : null, error: matches ? state.error : null, loading: !!url && !!owner && (!matches || state.loading), refetch };
}
