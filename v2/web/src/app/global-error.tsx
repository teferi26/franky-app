"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

/**
 * Ultimo recurso: captura los errores que revientan el propio layout raiz,
 * donde `app/error.tsx` ya no puede montarse porque el arbol entero ha caido.
 *
 * No existia. Cuando fallaba algo del layout, el usuario veia la pantalla de
 * error en blanco del navegador y nosotros no nos enterabamos de nada.
 *
 * Tiene que declarar <html> y <body> propios: sustituye al layout raiz.
 * Estilos en linea a proposito: si lo que ha fallado es el arbol, no se puede
 * dar por hecho que las clases de Tailwind esten disponibles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: "global", digest: error.digest });
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#ffffff",
          color: "#121019",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#706b80",
              margin: "0 0 12px",
            }}
          >
            Error
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 12px" }}>
            Franky se ha caído un momento
          </h1>
          <p style={{ color: "#706b80", fontSize: 15, lineHeight: 1.55, margin: "0 0 24px" }}>
            Ha fallado algo por nuestra parte, no por la tuya. Ya nos ha llegado
            el aviso. Prueba a recargar.
          </p>
          {error.digest && (
            <p style={{ color: "#706b80", fontSize: 12, fontFamily: "monospace", margin: "0 0 24px" }}>
              Código: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              cursor: "pointer",
              border: "none",
              borderRadius: 12,
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 600,
              color: "#fff",
              // Violeta sólido de marca (v3): sin degradado.
              background: "#6d3df0",
            }}
          >
            Recargar
          </button>
        </main>
      </body>
    </html>
  );
}
