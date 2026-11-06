"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3, Users, UserPlus, Home, Heart, GraduationCap, MapPin,
  Save, Loader2, Pencil, ExternalLink, BadgeCheck, ClipboardCheck, School,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";

interface LabelCount { label: string; count: number }
interface CareerCount { career_id: string; name: string; count: number }
interface MonthCount { month: string; count: number }

interface Summary {
  university_name: string;
  audience_total: number;
  audience_new_30d: number;
  studying_here: number;
  prospects: number;
  looking_housing: number;
  looking_roommate: number;
  vocational_completed: number;
  by_student_type: LabelCount[];
}

interface UniversityRow {
  id: string; name: string; slug: string; description: string | null;
  logo_url: string | null; image_url: string | null; website: string | null;
  phone: string | null; email: string | null; address: string | null;
  motto: string | null; rector: string | null; partner_blurb: string | null;
  intro_video_url: string | null; gallery_urls: string[] | null;
  jpa_url: string | null; jpa_label: string | null;
  is_partner: boolean | null; partner_tier: string | null;
}

const STUDENT_TYPE_LABEL: Record<string, string> = {
  bachillerato: "Bachillerato",
  fp: "FP",
  universidad: "Universidad",
  master: "Máster",
  otro: "Otro",
  sin_dato: "Sin dato",
};

/**
 * "uv.es" no es una URL válida y la ficha la rechaza. Antes eso se perdía en el
 * `if (!error)` de abajo: el gestor pulsaba Guardar, no pasaba nada visible y no
 * había forma de saber por qué. Se completa el esquema antes de enviar.
 */
function normalizarUrl(valor: string): string {
  const v = valor.trim();
  if (!v || /^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

/** ¿Sigue siendo inválida después de normalizarla? */
function urlInvalida(valor: string): boolean {
  if (!valor) return false;
  try {
    const u = new URL(valor);
    return u.protocol !== "http:" && u.protocol !== "https:";
  } catch {
    return true;
  }
}

/** Campos de la ficha que son URLs, con el nombre que ve el gestor. */
const CAMPOS_URL = [
  ["logo_url", "URL del logo"],
  ["website", "Web oficial"],
  ["intro_video_url", "URL vídeo institucional"],
  ["jpa_url", "URL Jornada Puertas Abiertas"],
] as const;

function Bars({ items, accent = "violet" }: { items: LabelCount[]; accent?: "violet" | "fuchsia" }) {
  if (!items.length) {
    return <p className="text-sm text-text-muted">Sin datos todavía.</p>;
  }
  // Clases estáticas (Tailwind JIT no detecta `bg-${var}`).
  const barColor = accent === "fuchsia" ? "bg-fuchsia" : "bg-violet";
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3">
          <span className="w-28 sm:w-36 shrink-0 text-sm text-text-secondary truncate" title={it.label}>
            {it.label}
          </span>
          <div className="flex-1 h-5 rounded-full bg-bg-secondary/60 overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${Math.max((it.count / max) * 100, 4)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
            {it.count}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function UniDashboard({
  userName, university, summary, topCareers, origin, monthly,
}: {
  userName: string;
  university: UniversityRow;
  summary: Summary | null;
  topCareers: CareerCount[];
  origin: LabelCount[];
  monthly: MonthCount[];
}) {
  const [tab, setTab] = useState<"metricas" | "ficha">("metricas");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Antes solo existía `saved`: si la RPC devolvía error, no se pintaba NADA.
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [form, setForm] = useState({
    description: university.description || "",
    logo_url: university.logo_url || "",
    website: university.website || "",
    phone: university.phone || "",
    email: university.email || "",
    address: university.address || "",
    motto: university.motto || "",
    rector: university.rector || "",
    partner_blurb: university.partner_blurb || "",
    intro_video_url: university.intro_video_url || "",
    jpa_url: university.jpa_url || "",
    jpa_label: university.jpa_label || "",
    gallery_urls: (university.gallery_urls || []).join("\n"),
  });

  const handleSave = async () => {
    setSaved(false);
    setError(null);

    // 1) Completar el esquema de las URLs y dejar en el formulario lo que
    //    realmente se va a enviar, para que el gestor lo vea.
    const galeria = form.gallery_urls
      .split("\n")
      .map((s) => normalizarUrl(s))
      .filter(Boolean);
    const limpio = {
      ...form,
      logo_url: normalizarUrl(form.logo_url),
      website: normalizarUrl(form.website),
      intro_video_url: normalizarUrl(form.intro_video_url),
      jpa_url: normalizarUrl(form.jpa_url),
      gallery_urls: galeria.join("\n"),
    };
    setForm(limpio);

    // 2) Validar antes de gastar una llamada, señalando el campo por su nombre.
    const malo = CAMPOS_URL.find(([campo]) => urlInvalida(limpio[campo]));
    if (malo) {
      setError(`Revisa el campo "${malo[1]}": no es una dirección web válida.`);
      return;
    }
    const galeriaMala = galeria.find((u) => urlInvalida(u));
    if (galeriaMala) {
      setError(`Hay una URL de la galería que no es válida: ${galeriaMala}`);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("update_my_university", {
      p_payload: { ...limpio, gallery_urls: galeria },
    });
    setSaving(false);
    if (rpcError) {
      setError(
        rpcError.message
          ? `No se pudo guardar: ${rpcError.message}`
          : "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo."
      );
      return;
    }
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 3000);
  };

  const kpis = summary
    ? [
        { icon: Users, label: "Audiencia total", value: summary.audience_total },
        { icon: UserPlus, label: "Nuevos (30 días)", value: summary.audience_new_30d },
        { icon: School, label: "Estudian aquí", value: summary.studying_here },
        { icon: GraduationCap, label: "Desean tus grados", value: summary.prospects },
        { icon: Home, label: "Buscan piso", value: summary.looking_housing },
        { icon: Heart, label: "Buscan compañero", value: summary.looking_roommate },
        { icon: ClipboardCheck, label: "Tests vocacionales", value: summary.vocational_completed },
      ]
    : [];

  const inputClass = "w-full px-3 py-2 rounded-lg border border-border bg-bg-primary text-sm transition-colors focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-violet/20";
  const labelClass = "block text-xs font-medium text-text-muted mb-1";

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera */}
      <div className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8 lg:pt-14">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Hola, {userName}</p>
              <h1 className="mt-3 flex flex-wrap items-center gap-3 font-heading text-fluid-h2 font-extrabold text-text-primary">
                {university.name}
                {university.is_partner && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-violet-deep">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {university.partner_tier === "fundadora" ? "Fundadora" : "Colaboradora"}
                  </span>
                )}
              </h1>
              <p className="mt-2 text-sm text-text-muted">Panel de gestión · datos agregados y anónimos</p>
            </div>
            <Link
              href={`/universidades/${university.slug}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-bg-primary px-4 text-sm font-semibold text-text-primary transition-colors hover:border-text-primary/30 hover:bg-bg-secondary"
            >
              <ExternalLink className="h-4 w-4" />
              Ver ficha pública
            </Link>
          </div>

          {/* Pestañas: subrayado en tinta, sin píldoras de color. */}
          <div className="mt-8 flex gap-6" role="tablist">
            {([["metricas", "Métricas", BarChart3], ["ficha", "Mi ficha", Pencil]] as const).map(
              ([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 pb-3 text-sm font-semibold transition-colors ${
                    tab === key
                      ? "border-text-primary text-text-primary"
                      : "border-transparent text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10 pb-20">
        {tab === "metricas" ? (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-2xl border border-border bg-bg-primary p-4 sm:p-5">
                  <k.icon className="h-5 w-5 text-violet mb-2" />
                  <div className="font-heading text-3xl font-extrabold leading-none tracking-tight text-text-primary tabular">
                    {k.value.toLocaleString("es-ES")}
                  </div>
                  <div className="text-xs text-text-muted mt-1">{k.label}</div>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top grados */}
              <section className="rounded-2xl border border-border bg-bg-primary p-5 sm:p-6">
                <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
                  <GraduationCap className="h-5 w-5 text-violet" />
                  Tus grados más demandados
                </h2>
                <Bars items={topCareers.map((c) => ({ label: c.name, count: c.count }))} />
              </section>

              {/* Origen */}
              <section className="rounded-2xl border border-border bg-bg-primary p-5 sm:p-6">
                <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
                  <MapPin className="h-5 w-5 text-violet" />
                  De dónde vienen tus interesados
                </h2>
                <Bars items={origin} accent="fuchsia" />
              </section>

              {/* Tipo de estudiante */}
              <section className="rounded-2xl border border-border bg-bg-primary p-5 sm:p-6">
                <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
                  <Users className="h-5 w-5 text-violet" />
                  Por tipo de estudiante
                </h2>
                <Bars
                  items={(summary?.by_student_type ?? []).map((s) => ({
                    label: STUDENT_TYPE_LABEL[s.label] ?? s.label,
                    count: s.count,
                  }))}
                />
              </section>

              {/* Altas por mes */}
              <section className="rounded-2xl border border-border bg-bg-primary p-5 sm:p-6">
                <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
                  <BarChart3 className="h-5 w-5 text-violet" />
                  Altas por mes
                </h2>
                <Bars items={monthly.map((m) => ({ label: m.month, count: m.count }))} accent="violet" />
              </section>
            </div>

            <p className="text-xs text-text-muted text-center pt-2">
              Todos los datos son agregados y anónimos. Nunca mostramos información personal de estudiantes.
            </p>
          </div>
        ) : (
          /* ── Mi ficha ── */
          <div className="rounded-2xl border border-border bg-bg-primary p-5 sm:p-8">
            <h2 className="font-heading text-xl font-bold text-text-primary mb-1">Edita la ficha de tu universidad</h2>
            <p className="text-sm text-text-muted mb-6">
              Los cambios se publican al instante en tu ficha pública. El nombre, el tipo y el estado de
              colaboración los gestiona el equipo de Franky.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Descripción</label>
                <textarea className={`${inputClass} min-h-[110px]`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Mensaje de la universidad (se muestra en tu ficha)</label>
                <textarea className={`${inputClass} min-h-[70px]`} value={form.partner_blurb} onChange={(e) => setForm({ ...form, partner_blurb: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>URL del logo</label>
                <input className={inputClass} value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className={labelClass}>Web oficial</label>
                <input className={inputClass} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className={labelClass}>Teléfono</label>
                <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Email de contacto</label>
                <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Dirección</label>
                <input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Lema / Motto</label>
                <input className={inputClass} value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Rector/a</label>
                <input className={inputClass} value={form.rector} onChange={(e) => setForm({ ...form, rector: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>URL vídeo institucional</label>
                <input className={inputClass} value={form.intro_video_url} onChange={(e) => setForm({ ...form, intro_video_url: e.target.value })} placeholder="https://youtu.be/..." />
              </div>
              <div>
                <label className={labelClass}>URL Jornada Puertas Abiertas</label>
                <input className={inputClass} value={form.jpa_url} onChange={(e) => setForm({ ...form, jpa_url: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className={labelClass}>Texto del botón JPA</label>
                <input className={inputClass} value={form.jpa_label} onChange={(e) => setForm({ ...form, jpa_label: e.target.value })} placeholder="JPA · 15 marzo 2026" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Galería (una URL por línea)</label>
                <textarea className={`${inputClass} min-h-[80px] font-mono text-xs`} value={form.gallery_urls} onChange={(e) => setForm({ ...form, gallery_urls: e.target.value })} placeholder={"https://...\nhttps://..."} />
              </div>
            </div>
            {error && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2 rounded-xl border border-error/30 bg-bg-primary px-4 py-3 text-sm text-error"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-3 mt-6">
              {saved && <span className="text-sm font-medium text-green-600">Guardado ✓</span>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm bg-text-primary text-bg-primary font-semibold transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-card-hover cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar cambios
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
