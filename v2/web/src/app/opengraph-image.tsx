import { ImageResponse } from "next/og";
import { createPublicSupabase } from "@/lib/supabase-server";

// Open Graph image for the home page. Built con stats casi en tiempo real.
// Spec: 1200x630 (Twitter/Facebook recommended).
// Cliente anon sin cookies y revalidate diario: cada unfurl de un bot
// (WhatsApp, Twitter, Google) sirve la imagen cacheada, no 4 counts por visita.
export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "Franky · La mayor comunidad de estudiantes de España";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  // Best-effort stats lookup. If the DB is unreachable we fall back to safe defaults
  // so the OG image still renders rather than 500'ing during link unfurl.
  let stats = { uni: 96, career: 5132, scholarship: 477, leisure: 1012 };
  try {
    const supabase = createPublicSupabase();
    const [u, c, s, l] = await Promise.all([
      supabase.from("universities").select("*", { count: "exact", head: true }),
      supabase.from("careers").select("*", { count: "exact", head: true }),
      supabase.from("scholarships").select("*", { count: "exact", head: true }),
      supabase.from("leisure_spots").select("*", { count: "exact", head: true }),
    ]);
    stats = {
      uni: u.count ?? stats.uni,
      career: c.count ?? stats.career,
      scholarship: s.count ?? stats.scholarship,
      leisure: l.count ?? stats.leisure,
    };
  } catch {
    // Keep fallback stats.
  }

  const formatES = (n: number) => n.toLocaleString("es-ES");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background:
            "linear-gradient(135deg, #1a0033 0%, #6d28d9 40%, #db2777 75%, #fb923c 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top: brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
            }}
          >
            🎓
          </div>
          <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>Franky</span>
        </div>

        {/* Middle: tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 1000,
            }}
          >
            La mayor comunidad de estudiantes de España
          </div>
          <div style={{ fontSize: 28, color: "rgba(255,255,255,0.85)", marginTop: 12 }}>
            Carreras · Becas · Alojamiento · Eventos
          </div>
        </div>

        {/* Bottom: live stats */}
        <div style={{ display: "flex", gap: 36, marginTop: 24 }}>
          {[
            { n: formatES(stats.uni) + "+", l: "Universidades" },
            { n: formatES(stats.career) + "+", l: "Carreras" },
            { n: formatES(stats.scholarship) + "+", l: "Becas" },
            { n: formatES(stats.leisure) + "+", l: "Zonas de ocio" },
          ].map((s) => (
            <div
              key={s.l}
              style={{
                display: "flex",
                flexDirection: "column",
                background: "rgba(255,255,255,0.12)",
                borderRadius: 20,
                padding: "20px 28px",
                minWidth: 200,
              }}
            >
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>{s.n}</span>
              <span style={{ fontSize: 20, color: "rgba(255,255,255,0.8)" }}>{s.l}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
