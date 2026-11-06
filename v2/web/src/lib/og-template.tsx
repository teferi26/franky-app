import { ImageResponse } from "next/og";

/**
 * Plantilla comun para las imagenes Open Graph de ficha.
 *
 * Antes TODAS las paginas compartian la misma imagen estatica: daba igual que
 * alguien mandara por WhatsApp una carrera, una beca o el muro de su
 * universidad, la tarjeta se veia identica. Eso mata el clic, que es justo lo
 * que se juega al compartir un enlace.
 *
 * Cada ficha genera aqui la suya con su titulo, su contexto y hasta tres
 * metricas destacadas.
 */
export const OG_SIZE = { width: 1200, height: 630 };

export type OgStat = { value: string; label: string };

/** Recorta sin cortar palabras a medias. */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max)}…`;
}

export function renderOgCard(opts: {
  /** Etiqueta pequena de seccion ("Nota de corte", "Beca", "FOMO"…). */
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  stats?: OgStat[];
}): ImageResponse {
  const title = clamp(opts.title, 90);
  const stats = (opts.stats ?? []).slice(0, 3);
  // Titulos largos (los dobles grados llegan a 110 caracteres) necesitan bajar
  // el cuerpo o se salen del lienzo.
  const titleSize = title.length > 62 ? 54 : title.length > 40 ? 64 : 76;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 68px",
          background:
            "linear-gradient(135deg, #12071f 0%, #4c1d95 38%, #7c3aed 68%, #c026d3 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "rgba(255,255,255,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
            }}
          >
            🎓
          </div>
          <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>Franky</span>
          <span
            style={{
              marginLeft: 12,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.72)",
            }}
          >
            {opts.eyebrow}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: -1.5,
              maxWidth: 1020,
            }}
          >
            {title}
          </div>
          {opts.subtitle && (
            <div style={{ fontSize: 30, color: "rgba(255,255,255,0.82)" }}>
              {clamp(opts.subtitle, 80)}
            </div>
          )}
        </div>

        {stats.length > 0 ? (
          <div style={{ display: "flex", gap: 24 }}>
            {stats.map((s) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: "rgba(255,255,255,0.13)",
                  borderRadius: 18,
                  padding: "18px 26px",
                  minWidth: 190,
                }}
              >
                <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1 }}>
                  {s.value}
                </span>
                <span style={{ fontSize: 19, color: "rgba(255,255,255,0.8)" }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 24, color: "rgba(255,255,255,0.7)" }}>franky.es</div>
        )}
      </div>
    ),
    OG_SIZE
  );
}
