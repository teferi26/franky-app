import { formatAcademicDuration } from '@/lib/academic-duration';
import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { normalizeVocationalBigFive, type VocationalBigFiveTrait } from '@/lib/vocational-big-five';
import React from "react";
import {
  Document, Page, Text, View, StyleSheet, renderToBuffer,
} from "@react-pdf/renderer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// ─────────────────────────────────────────────────────────────
// Brand palette
// ─────────────────────────────────────────────────────────────
const COLOR = {
  violet: "#7C3AED",
  violetDark: "#5B21B6",
  fuchsia: "#D946EF",
  textPrimary: "#0F172A",
  textSecondary: "#334155",
  textMuted: "#64748B",
  border: "#E2E8F0",
  bgSoft: "#F8FAFC",
  bgViolet: "#F5F3FF",
  bgFuchsia: "#FDF4FF",
  white: "#FFFFFF",
  success: "#10B981",
  warn: "#F59E0B",
} as const;

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: COLOR.white,
    padding: 0,
    fontFamily: "Helvetica",
    color: COLOR.textPrimary,
    fontSize: 10,
  },

  // ── COVER ──
  coverHeader: {
    backgroundColor: COLOR.violet,
    paddingVertical: 36,
    paddingHorizontal: 40,
  },
  coverHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  coverLogo: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: COLOR.white,
    letterSpacing: 1.5,
  },
  coverDate: {
    fontSize: 9,
    color: COLOR.white,
    opacity: 0.8,
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    color: COLOR.white,
    lineHeight: 1.15,
    marginTop: 8,
  },
  coverSubtitle: {
    fontSize: 11,
    color: COLOR.white,
    opacity: 0.85,
    marginTop: 6,
  },

  // ── SECTION HEADERS ──
  sectionWrap: {
    paddingHorizontal: 40,
    paddingTop: 28,
  },
  sectionEyebrow: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLOR.violet,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: COLOR.textPrimary,
    marginBottom: 14,
  },

  // ── PERSONALITY HERO ──
  heroCard: {
    marginHorizontal: 40,
    marginTop: 22,
    borderRadius: 14,
    backgroundColor: COLOR.bgViolet,
    padding: 24,
    borderLeft: `4pt solid ${COLOR.violet}`,
  },
  heroEyebrow: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLOR.violet,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: COLOR.textPrimary,
    marginBottom: 4,
  },
  heroTagline: {
    fontSize: 11,
    fontStyle: "italic",
    color: COLOR.textMuted,
    marginBottom: 10,
  },
  heroBadgesRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  badge: {
    fontSize: 9,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    fontFamily: "Helvetica-Bold",
  },
  badgeViolet: {
    backgroundColor: COLOR.violet,
    color: COLOR.white,
  },
  badgeFuchsia: {
    backgroundColor: COLOR.fuchsia,
    color: COLOR.white,
  },
  badgeSoft: {
    backgroundColor: COLOR.white,
    color: COLOR.violet,
    border: `1pt solid ${COLOR.violet}`,
  },
  heroBody: {
    fontSize: 11,
    color: COLOR.textSecondary,
    lineHeight: 1.55,
  },

  // ── STRENGTHS ──
  strengthsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  strengthPill: {
    fontSize: 9,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLOR.white,
    border: `1pt solid ${COLOR.violet}`,
    color: COLOR.violet,
    fontFamily: "Helvetica-Bold",
  },

  // ── BARS ──
  barRow: {
    marginBottom: 10,
  },
  barLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 3,
  },
  barLabel: {
    fontSize: 10,
    color: COLOR.textPrimary,
    fontFamily: "Helvetica-Bold",
  },
  barLabelSub: {
    fontSize: 8,
    color: COLOR.textMuted,
    marginTop: 1,
  },
  barPct: {
    fontSize: 10,
    color: COLOR.violet,
    fontFamily: "Helvetica-Bold",
  },
  barTrack: {
    height: 8,
    backgroundColor: COLOR.bgSoft,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: 8,
    backgroundColor: COLOR.violet,
    borderRadius: 4,
  },

  // ── CAREER CARD ──
  careerCard: {
    marginHorizontal: 40,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: COLOR.white,
    padding: 16,
    border: `1pt solid ${COLOR.border}`,
  },
  careerCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  careerRank: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLOR.violet,
    backgroundColor: COLOR.bgViolet,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginRight: 8,
  },
  careerName: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: COLOR.textPrimary,
  },
  careerScore: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  careerScorePct: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: COLOR.violet,
    lineHeight: 1,
  },
  careerScoreLabel: {
    fontSize: 7,
    color: COLOR.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  careerMeta: {
    fontSize: 9,
    color: COLOR.textMuted,
    marginBottom: 8,
  },
  careerJustification: {
    fontSize: 10,
    color: COLOR.textSecondary,
    lineHeight: 1.5,
    marginBottom: 6,
  },
  careerUni: {
    fontSize: 9,
    color: COLOR.textMuted,
    fontStyle: "italic",
  },
  aspirationalBadge: {
    fontSize: 7,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: "#FFF4E6",
    color: "#B45309",
    border: `1pt solid #FCD34D`,
    fontFamily: "Helvetica-Bold",
    marginRight: 6,
  },

  // ── UNIVERSITY CARD ──
  uniCard: {
    marginHorizontal: 40,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: COLOR.bgSoft,
    padding: 14,
    border: `0.5pt solid ${COLOR.border}`,
  },
  uniHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  uniName: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: COLOR.textPrimary,
  },
  uniBadgeWrap: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 3,
  },
  uniMeta: {
    fontSize: 9,
    color: COLOR.textMuted,
    marginBottom: 4,
  },
  uniJustification: {
    fontSize: 9.5,
    color: COLOR.textSecondary,
    lineHeight: 1.45,
  },

  // ── CITY CARD ──
  cityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 36,
    gap: 8,
  },
  cityCard: {
    width: "47%",
    margin: 4,
    borderRadius: 10,
    backgroundColor: COLOR.bgFuchsia,
    padding: 12,
    borderLeft: `3pt solid ${COLOR.fuchsia}`,
  },
  cityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 3,
  },
  cityName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: COLOR.textPrimary,
  },
  cityScore: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: COLOR.fuchsia,
  },
  cityComunidad: {
    fontSize: 8,
    color: COLOR.textMuted,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cityJustification: {
    fontSize: 9,
    color: COLOR.textSecondary,
    lineHeight: 1.4,
  },

  // ── DIVIDER ──
  divider: {
    marginHorizontal: 40,
    height: 1,
    backgroundColor: COLOR.border,
    marginVertical: 18,
  },

  // ── FOOTER ──
  footer: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: COLOR.textMuted,
    paddingTop: 6,
    borderTop: `0.5pt solid ${COLOR.border}`,
  },
  footerBrand: {
    fontFamily: "Helvetica-Bold",
    color: COLOR.violet,
    letterSpacing: 1,
  },
});

const RIASEC_LABELS: Record<string, string> = {
  R: "Realista", I: "Investigador", A: "Artistico", S: "Social", E: "Emprendedor", C: "Convencional",
};
const RIASEC_DESC: Record<string, string> = {
  R: "Práctico, manual, orientado a resultados",
  I: "Analítico, curioso, le encanta investigar",
  A: "Creativo, expresivo, sensibilidad estética",
  S: "Empático, colaborador, motivado por ayudar",
  E: "Líder, persuasivo, ambicioso",
  C: "Organizado, metódico, atento al detalle",
};
const BIG_FIVE_LABELS: Record<string, string> = {
  O: "Apertura a la experiencia",
  C: "Responsabilidad",
  E: "Extraversión",
  A: "Amabilidad",
  N: "Estabilidad emocional",
};
const BIG_FIVE_DESC: Record<string, string> = {
  O: "Curiosidad, imaginación, atracción por lo nuevo",
  C: "Disciplina, organización, esfuerzo dirigido",
  E: "Energía social, asertividad, búsqueda de estímulo",
  A: "Empatía, cooperación, confianza interpersonal",
  N: "Calma, equilibrio emocional, resistencia al estrés",
};

// Las fuentes estándar de react-pdf (Helvetica) codifican en WinAnsi
// (cp1252): tildes, eñes, ¿¡ y el euro se pintan bien (comprobado al generar
// un PDF de prueba, sep-2026). Antes se quitaban TODAS las tildes y el informe
// salía con faltas ("Extraversion", "Donde vivir"). Solo se eliminan los
// caracteres fuera de WinAnsi (emojis, símbolos), que sí saldrían en blanco.
const WINANSI_EXTRA = "\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178";
const NOT_WINANSI = new RegExp(`[^\\x20-\\x7E\\n\\u00A0-\\u00FF${WINANSI_EXTRA}]`, "g");
function ascii(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(NOT_WINANSI, "");
}

interface ResultRow {
  id: string;
  created_at: string;
  scores: Record<string, number> | null;
  big_five: Record<string, number> | null;
  mbti_type: string | null;
  holland_code: string | null;
  personality_narrative: string | null;
  strengths: string[] | null;
  work_style: string | null;
  top_careers: Array<Record<string, unknown>> | null;
  top_universities: Array<Record<string, unknown>> | null;
  top_cities: Array<Record<string, unknown>> | null;
  questions_answered: number | null;
}

// ─────────────────────────────────────────────────────────────
// React-PDF components
// ─────────────────────────────────────────────────────────────

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>
        <Text style={styles.footerBrand}>FRANKY</Text>
        {"  ·  franky.es  ·  Test Vocacional"}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

function Bar({ label, sub, percent }: { label: string; sub?: string; percent: number }) {
  const safe = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.barRow}>
      <View style={styles.barLabelRow}>
        <View style={{ flexDirection: "column" }}>
          <Text style={styles.barLabel}>{ascii(label)}</Text>
          {sub && <Text style={styles.barLabelSub}>{ascii(sub)}</Text>}
        </View>
        <Text style={styles.barPct}>{safe}/100</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${safe}%` }]} />
      </View>
    </View>
  );
}

function PersonalityPage({ result }: { result: ResultRow }) {
  const generatedDate = new Date(result.created_at).toLocaleDateString("es-ES", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <Page size="A4" style={styles.page}>
      {/* Cover header */}
      <View style={styles.coverHeader}>
        <View style={styles.coverHeaderRow}>
          <Text style={styles.coverLogo}>FRANKY</Text>
          <Text style={styles.coverDate}>{generatedDate}</Text>
        </View>
        <Text style={styles.coverTitle}>Tu perfil vocacional</Text>
        <Text style={styles.coverSubtitle}>
          Análisis personalizado basado en {result.questions_answered ?? 0} respuestas
        </Text>
      </View>

      {/* Personality hero */}
      {result.mbti_type && (
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Tu tipo de personalidad</Text>
          <Text style={styles.heroTitle}>
            {ascii(getMbtiLabel(result.mbti_type))}
          </Text>
          <Text style={styles.heroTagline}>
            {ascii(getMbtiTagline(result.mbti_type))}
          </Text>
          <View style={styles.heroBadgesRow}>
            <Text style={[styles.badge, styles.badgeViolet]}>{result.mbti_type}</Text>
            {result.holland_code && (
              <Text style={[styles.badge, styles.badgeSoft]}>
                Holland: {result.holland_code.slice(0, 3).toUpperCase()}
              </Text>
            )}
          </View>
          {result.personality_narrative && (
            <Text style={styles.heroBody}>
              {ascii(result.personality_narrative.replace(/\*\*/g, ""))}
            </Text>
          )}
          {result.work_style && (
            <Text style={[styles.heroBody, { marginTop: 8 }]}>
              {ascii(result.work_style)}
            </Text>
          )}
        </View>
      )}

      {/* Strengths */}
      {result.strengths && result.strengths.length > 0 && (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionEyebrow}>Tus fortalezas</Text>
          <View style={styles.strengthsRow}>
            {result.strengths.map((s, i) => (
              <Text key={`${s}-${i}`} style={styles.strengthPill}>
                {ascii(s)}
              </Text>
            ))}
          </View>
        </View>
      )}

      <Footer />
    </Page>
  );
}

function ScoresPage({ result }: { result: ResultRow }) {
  const bigFive = normalizeVocationalBigFive(result.big_five);
  const big5Entries = (Object.keys(BIG_FIVE_LABELS) as VocationalBigFiveTrait[])
      .filter(trait => Number.isFinite(bigFive[trait]))
      .map((trait) => {
        const raw = Number(bigFive[trait]);
        const display = trait === "N" ? 100 - raw : raw;
        return { trait, value: display };
      });

  const riasecEntries = result.scores
    ? Object.entries(result.scores)
        .sort(([, a], [, b]) => Number(b) - Number(a))
    : [];
  const riasecMax = riasecEntries.length ? Math.max(...riasecEntries.map(([, v]) => Number(v))) : 1;

  return (
    <Page size="A4" style={styles.page}>
      {/* Big Five */}
      {big5Entries.length > 0 && (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionEyebrow}>Tus respuestas de personalidad</Text>
          <Text style={styles.sectionTitle}>Tu Big Five (OCEAN)</Text>
          <Text style={styles.careerMeta}>Índices del cuestionario sobre 100. No son percentiles frente a otras personas ni una evaluación de capacidad académica.</Text>
          {big5Entries.map(({ trait, value }) => (
            <Bar
              key={trait}
              label={BIG_FIVE_LABELS[trait]}
              sub={BIG_FIVE_DESC[trait]}
              percent={value}
            />
          ))}
        </View>
      )}

      <View style={styles.divider} />

      {/* RIASEC */}
      {riasecEntries.length > 0 && (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionEyebrow}>Modelo Holland</Text>
          <Text style={styles.sectionTitle}>Tu perfil de intereses (RIASEC)</Text>
          {riasecEntries.map(([k, v]) => {
            const pct = riasecMax > 0 ? Math.round((Number(v) / riasecMax) * 100) : 0;
            return (
              <Bar
                key={k}
                label={RIASEC_LABELS[k] || k}
                sub={RIASEC_DESC[k]}
                percent={pct}
              />
            );
          })}
        </View>
      )}

      <Footer />
    </Page>
  );
}

function CareersSection({ careers }: { careers: Array<Record<string, unknown>> }) {
  if (!careers.length) return null;
  return (
    <View>
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionEyebrow}>Tu top profesional</Text>
        <Text style={styles.sectionTitle}>Carreras recomendadas para ti</Text>
      </View>
      {careers.slice(0, 10).map((c: Record<string, unknown>, i) => {
        const justification = typeof c.justification === "string" ? c.justification : "";
        const universityName = typeof c.university_name === "string" ? c.university_name : "";
        const city = typeof c.city === "string" ? c.city : "";
        const isAspirational = c.is_aspirational === true;
        return (
          <View key={`${String(c.career_id || c.name || "")}-${i}`} style={styles.careerCard} wrap={false}>
            <View style={styles.careerCardTop}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                <Text style={styles.careerRank}>#{i + 1}</Text>
                <Text style={styles.careerName}>{ascii(String(c.name || ""))}</Text>
              </View>
              <View style={styles.careerScore}>
                <Text style={styles.careerScorePct}>{String(c.score ?? "")}%</Text>
                <Text style={styles.careerScoreLabel}>afinidad</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
              {isAspirational && <Text style={styles.aspirationalBadge}>CORTE SUPERIOR A TU NOTA</Text>}
              <Text style={styles.careerMeta}>
                {ascii([
                  c.branch,
                  c.duration_years ? formatAcademicDuration(c.duration_years) : null,
                  c.cut_off ? `Corte de referencia${c.cut_off_year ? ` ${c.cut_off_year}` : ''}: ${c.cut_off}` : null,
                  typeof c.campus === 'string' ? c.campus : null,
                  typeof c.modality === 'string' ? c.modality : null,
                ].filter(Boolean).join("  ·  "))}
              </Text>
            </View>

            {justification.length > 0 && (
              <Text style={styles.careerJustification}>
                {ascii(justification)}
              </Text>
            )}

            {universityName.length > 0 && (
              <Text style={styles.careerUni}>
                {ascii(`Universidad sugerida: ${universityName}${city ? ` · ${city}` : ""}`)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function UniversitiesSection({ unis }: { unis: Array<Record<string, unknown>> }) {
  if (!unis.length) return null;
  return (
    <View>
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionEyebrow}>Dónde estudiar</Text>
        <Text style={styles.sectionTitle}>Universidades concretas para tu perfil</Text>
      </View>
      {unis.slice(0, 10).map((u: Record<string, unknown>, i) => {
        const type = typeof u.type === "string" ? u.type : "";
        const justification = typeof u.justification === "string" ? u.justification : "";
        return (
          <View key={`${String(u.university_id || u.name || "")}-${i}`} style={styles.uniCard} wrap={false}>
            <View style={styles.uniHeader}>
              <Text style={styles.uniName}>{ascii(String(u.name || ""))}</Text>
              <View style={styles.uniBadgeWrap}>
                {type.length > 0 && (
                  <Text style={[styles.badge, type === "publica" ? styles.badgeViolet : styles.badgeFuchsia]}>
                    {type === "publica" ? "PÚBLICA" : "PRIVADA"}
                  </Text>
                )}
                {u.cut_off != null && (
                  <Text style={styles.uniMeta}>Corte{u.cut_off_year ? ` ${u.cut_off_year}` : ''}: {String(u.cut_off)}</Text>
                )}
              </View>
            </View>
            <Text style={styles.uniMeta}>
              {ascii([u.career_name, u.campus ? `Campus: ${u.campus}` : u.city ? `Sede: ${u.city}` : '', u.modality].filter(Boolean).join("  ·  "))}
            </Text>
            {justification.length > 0 && (
              <Text style={styles.uniJustification}>{ascii(justification)}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function CitiesSection({ cities }: { cities: Array<Record<string, unknown>> }) {
  if (!cities.length) return null;
  return (
    <View>
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionEyebrow}>Dónde vivir</Text>
        <Text style={styles.sectionTitle}>Ciudades que más encajan contigo</Text>
      </View>
      <View style={styles.cityGrid}>
        {cities.slice(0, 8).map((c: Record<string, unknown>, i) => {
          const justification = typeof c.justification === "string" ? c.justification : "";
          return (
            <View key={`${String(c.name || "")}-${i}`} style={styles.cityCard} wrap={false}>
              <View style={styles.cityHeader}>
                <Text style={styles.cityName}>{ascii(String(c.name || ""))}</Text>
                <Text style={styles.cityScore}>{Math.round(Number(c.score || 0))}%</Text>
              </View>
              <Text style={styles.cityComunidad}>{ascii(String(c.comunidad || ""))}</Text>
              {justification.length > 0 && (
                <Text style={styles.cityJustification}>{ascii(justification)}</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function getMbtiLabel(type: string): string {
  const labels: Record<string, string> = {
    INTJ: "El/La Estratega",      INTP: "El/La Pensador/a",      ENTJ: "El/La Comandante",     ENTP: "El/La Innovador/a",
    INFJ: "El/La Mentor/a",       INFP: "El/La Soñador/a",       ENFJ: "El/La Líder Empático/a", ENFP: "El/La Activador/a",
    ISTJ: "El/La Inspector/a",    ISFJ: "El/La Protector/a",     ESTJ: "El/La Director/a",     ESFJ: "El/La Anfitrión/a",
    ISTP: "El/La Artesano/a",     ISFP: "El/La Artista",         ESTP: "El/La Emprendedor/a",  ESFP: "El/La Animador/a",
  };
  return labels[type] || "Tu perfil único";
}

function getMbtiTagline(type: string): string {
  const taglines: Record<string, string> = {
    INTJ: "Mente analítica con visión a largo plazo",
    INTP: "Curioso/a, lógico/a y aficionado/a a las teorías",
    ENTJ: "Líder natural orientado/a a resultados",
    ENTP: "Inquieto/a, creativo/a y argumentador/a",
    INFJ: "Sensible, profundo/a y con causa",
    INFP: "Idealista, creativo/a y reflexivo/a",
    ENFJ: "Carismático/a y entregado/a a los demás",
    ENFP: "Entusiasta, espontáneo/a e inspirador/a",
    ISTJ: "Metódico/a, fiable y orientado/a al deber",
    ISFJ: "Leal, organizado/a y atento/a al detalle",
    ESTJ: "Ejecutivo/a, claro/a y eficiente",
    ESFJ: "Cercano/a, organizado/a y muy social",
    ISTP: "Práctico/a, observador/a y resolutivo/a",
    ISFP: "Sensible, espontáneo/a y estético/a",
    ESTP: "Directo/a, enérgico/a y resolutivo/a",
    ESFP: "Cálido/a, divertido/a y muy presente",
  };
  return taglines[type] || "Una mezcla única de rasgos";
}

// ─────────────────────────────────────────────────────────────
// API route
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("No autenticado", { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  let query = supabase
    .from("vocational_results")
    .select("id, created_at, scores, top_categories, big_five, mbti_type, holland_code, personality_narrative, strengths, work_style, top_careers, top_universities, top_cities, questions_answered")
    .eq("user_id", user.id);
  if (id) query = query.eq("id", id);
  query = query.order("created_at", { ascending: false }).limit(1);

  const { data: result } = await query.maybeSingle();
  if (!result) return new Response("Sin resultado", { status: 404 });

  const r = result as ResultRow;
  const careers = r.top_careers || [];
  const unis = r.top_universities || [];
  const cities = r.top_cities || [];

  const doc = (
    <Document
      title={`Franky · Test Vocacional · ${r.id.slice(0, 8)}`}
      author="Franky"
      subject="Resultados del test vocacional Franky"
      creator="franky.es"
      producer="franky.es"
    >
      <PersonalityPage result={r} />
      <ScoresPage result={r} />
      {careers.length > 0 && (
        <Page size="A4" style={styles.page}>
          <CareersSection careers={careers} />
          <Footer />
        </Page>
      )}
      {unis.length > 0 && (
        <Page size="A4" style={styles.page}>
          <UniversitiesSection unis={unis} />
          <Footer />
        </Page>
      )}
      {cities.length > 0 && (
        <Page size="A4" style={styles.page}>
          <CitiesSection cities={cities} />
          <Footer />
        </Page>
      )}
    </Document>
  );

  const buffer = await renderToBuffer(doc);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="franky-test-vocacional-${r.id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
