"use client";

/**
 * Envia un error de cliente al recolector (/api/client-error).
 *
 * `sendBeacon` cuando existe: sobrevive a que el usuario cierre o navegue justo
 * despues del fallo, que es exactamente cuando pasa. Si no, `fetch` con
 * `keepalive`. Nunca lanza: un fallo reportando un fallo no puede empeorar la
 * situacion del usuario.
 */
export function reportError(
  error: unknown,
  meta: { boundary?: "route" | "global" | "window"; digest?: string } = {}
): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = JSON.stringify({
      message: err.message.slice(0, 500),
      stack: err.stack?.slice(0, 4000),
      digest: meta.digest,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      boundary: meta.boundary ?? "route",
    });

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/client-error", blob)) return;
    }
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* nunca propagar */
  }
}
