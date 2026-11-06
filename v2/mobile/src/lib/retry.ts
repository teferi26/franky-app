// ─── Reintentos con backoff exponencial + jitter ─────────────────────────
// Mejora 32 del ciclo 2: helper genérico `withRetry` para envolver llamadas
// que pueden fallar por red o por errores 5xx transitorios (subidas a
// Storage, RPC, fetch...), sin reintentar errores de validación (4xx) que
// nunca van a cambiar de resultado por repetirse.
//
// Uso:
//   const resultado = await withRetry(() => uploadFile(uri), {
//     maxAttempts: 3,
//     onRetry: (intento, error) => console.log('reintentando', intento, error),
//   });
//
// Todo fail-soft: si se agotan los intentos, `withRetry` propaga el último
// error tal cual (quien llama decide cómo informar, normalmente con un
// mensaje "no se pudo completar, inténtalo de nuevo").

export type RetryOptions = {
  /** Número máximo de intentos (incluyendo el primero). Por defecto 3. */
  maxAttempts?: number;
  /** Espera base en ms antes del backoff exponencial. Por defecto 500 ms. */
  baseDelayMs?: number;
  /** Tope máximo de espera entre intentos, en ms. Por defecto 8000 ms. */
  maxDelayMs?: number;
  /**
   * Decide si un error concreto merece reintento. Por defecto,
   * `isRetryableError` (red o 5xx sí, 4xx de validación no).
   */
  shouldRetry?: (err: unknown) => boolean;
  /** Callback informativo, opcional, para logging/telemetría. No debe lanzar. */
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
};

/**
 * Heurística por defecto de qué errores son reintentables:
 * - Errores de red (fetch que lanza TypeError "Network request failed",
 *   timeouts, AbortError) → sí.
 * - Códigos 5xx (error de servidor) → sí.
 * - Códigos 4xx (validación, permisos, "no encontrado") → no, repetir no
 *   cambia el resultado.
 * - Si no se puede determinar nada, por defecto NO se reintenta (evita
 *   bucles sobre errores desconocidos que no son de red).
 */
export function isRetryableError(err: unknown): boolean {
  try {
    const anyErr = err as {
      message?: string;
      name?: string;
      status?: number;
      statusCode?: number | string;
    } | null;

    const status = Number(anyErr?.status ?? anyErr?.statusCode ?? NaN);
    if (!Number.isNaN(status)) {
      if (status >= 500) return true;
      if (status >= 400 && status < 500) return false;
    }

    const name = (anyErr?.name ?? '').toLowerCase();
    if (name === 'aborterror') return true;

    const message = (anyErr?.message ?? (typeof err === 'string' ? err : '') ?? '').toLowerCase();
    if (
      message.includes('network') ||
      message.includes('fetch failed') ||
      message.includes('failed to fetch') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('sin conexión') ||
      message.includes('sin conexion') ||
      message.includes('econnreset') ||
      message.includes('econnrefused')
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * ¿El error dice que la tabla o la función NO EXISTE todavía (migración sin
 * aplicar en ese entorno)? Sirve para distinguir "el módulo aún no está" (se
 * enseña vacío, sin alarmar) de un fallo de red o de servidor (se enseña error
 * con Reintentar). Antes los dos casos acababan en la misma lista vacía y un
 * corte de red se leía como "no hay nada".
 */
export function isMissingBackendError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  return code === '42P01' || code === '42883' || code === 'PGRST202' || code === 'PGRST205'
    || msg.includes('does not exist')
    || msg.includes('could not find the function')
    || msg.includes('could not find the table');
}

function delayWithJitter(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  // Backoff exponencial: base * 2^(intento-1), con jitter aleatorio +/-30%
  // para no sincronizar reintentos de varios clientes a la vez.
  const raw = baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(raw, maxDelayMs);
  const jitterFactor = 0.7 + Math.random() * 0.6; // entre 0.7x y 1.3x
  return Math.round(capped * jitterFactor);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta `fn` con reintento exponencial + jitter. Si todos los intentos
 * fallan, propaga el último error (fail-soft: quien llama decide qué mostrar
 * al usuario, no lanzamos nada nuevo ni rompemos la app aquí).
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  const shouldRetry = opts.shouldRetry ?? isRetryableError;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt >= maxAttempts;
      if (isLastAttempt || !shouldRetry(err)) throw err;

      const delayMs = delayWithJitter(attempt, baseDelayMs, maxDelayMs);
      try {
        opts.onRetry?.(attempt, err, delayMs);
      } catch {
        // El callback de logging nunca debe tumbar el reintento.
      }
      await sleep(delayMs);
    }
  }
  // Inalcanzable en la práctica (el bucle siempre retorna o lanza), pero
  // TypeScript necesita un cierre explícito.
  throw lastError;
}
