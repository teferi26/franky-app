"use client";

import { useState } from "react";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";

interface UniversityData {
  id: string;
  name: string;
  description: string | null;
  city: string;
  comunidad_autonoma: string;
  type: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  founded_year: number | null;
  student_count: number | null;
  campus_count: number | null;
  image_url: string | null;
  address: string | null;
  rector: string | null;
  motto: string | null;
  modality: string | null;
  academic_staff: number | null;
  wiki_link: string | null;
  image_attribution: string | null;
  logo_url: string | null;
  is_partner: boolean | null;
  partner_tier: string | null;
  partner_since: string | null;
  partner_blurb: string | null;
  intro_video_url: string | null;
  gallery_urls: string[] | null;
  jpa_url: string | null;
  jpa_label: string | null;
}

export default function AdminEditUniversityButton({ university }: { university: UniversityData }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: university.name || "",
    description: university.description || "",
    city: university.city || "",
    comunidad_autonoma: university.comunidad_autonoma || "",
    website: university.website || "",
    phone: university.phone || "",
    email: university.email || "",
    founded_year: university.founded_year?.toString() || "",
    student_count: university.student_count?.toString() || "",
    campus_count: university.campus_count?.toString() || "",
    image_url: university.image_url || "",
    address: university.address || "",
    rector: university.rector || "",
    motto: university.motto || "",
    modality: university.modality || "presencial",
    academic_staff: university.academic_staff?.toString() || "",
    wiki_link: university.wiki_link || "",
    image_attribution: university.image_attribution || "",
    logo_url: university.logo_url || "",
    is_partner: university.is_partner || false,
    partner_tier: university.partner_tier || "",
    partner_since: university.partner_since || "",
    partner_blurb: university.partner_blurb || "",
    intro_video_url: university.intro_video_url || "",
    gallery_urls: (university.gallery_urls || []).join("\n"),
    jpa_url: university.jpa_url || "",
    jpa_label: university.jpa_label || "",
  });
  const router = useRouter();

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("universities")
      .update({
        name: form.name,
        description: form.description || null,
        city: form.city,
        comunidad_autonoma: form.comunidad_autonoma,
        website: form.website || null,
        phone: form.phone || null,
        email: form.email || null,
        founded_year: form.founded_year ? parseInt(form.founded_year) : null,
        student_count: form.student_count ? parseInt(form.student_count) : null,
        campus_count: form.campus_count ? parseInt(form.campus_count) : null,
        image_url: form.image_url || null,
        address: form.address || null,
        rector: form.rector || null,
        motto: form.motto || null,
        modality: form.modality || null,
        academic_staff: form.academic_staff ? parseInt(form.academic_staff) : null,
        wiki_link: form.wiki_link || null,
        image_attribution: form.image_attribution || null,
        logo_url: form.logo_url || null,
        is_partner: form.is_partner,
        partner_tier: form.partner_tier || null,
        partner_since: form.partner_since || null,
        partner_blurb: form.partner_blurb || null,
        intro_video_url: form.intro_video_url || null,
        gallery_urls: form.gallery_urls
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        jpa_url: form.jpa_url || null,
        jpa_label: form.jpa_label || null,
      })
      .eq("id", university.id);

    setSaving(false);
    if (!error) {
      setEditing(false);
      router.refresh();
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
        Editar universidad (Admin)
      </button>
    );
  }

  const inputClass = "w-full px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet/30";
  const labelClass = "block text-xs font-medium text-text-muted mb-1";

  return (
    <div className="rounded-2xl border border-border border-l-2 border-l-orange bg-bg-primary p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold font-heading text-amber-800">Editar Universidad</h3>
        <button onClick={() => setEditing(false)} className="text-text-muted hover:text-error">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelClass}>Nombre</label>
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Descripción</label>
          <textarea className={`${inputClass} min-h-[100px]`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Ciudad</label>
          <input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Comunidad Autónoma</label>
          <input className={inputClass} value={form.comunidad_autonoma} onChange={(e) => setForm({ ...form, comunidad_autonoma: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Web</label>
          <input className={inputClass} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Teléfono</label>
          <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Año fundación</label>
          <input type="number" className={inputClass} value={form.founded_year} onChange={(e) => setForm({ ...form, founded_year: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Nº Estudiantes</label>
          <input type="number" className={inputClass} value={form.student_count} onChange={(e) => setForm({ ...form, student_count: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Nº Campus</label>
          <input type="number" className={inputClass} value={form.campus_count} onChange={(e) => setForm({ ...form, campus_count: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>URL imagen</label>
          <input className={inputClass} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Dirección</label>
          <input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Rector/a</label>
          <input className={inputClass} value={form.rector} onChange={(e) => setForm({ ...form, rector: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Lema / Motto</label>
          <input className={inputClass} value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Modalidad</label>
          <select className={inputClass} value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
            <option value="semipresencial">Semipresencial</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Personal académico</label>
          <input type="number" className={inputClass} value={form.academic_staff} onChange={(e) => setForm({ ...form, academic_staff: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Enlace Wikipedia</label>
          <input className={inputClass} value={form.wiki_link} onChange={(e) => setForm({ ...form, wiki_link: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Atribución imagen</label>
          <input className={inputClass} value={form.image_attribution} onChange={(e) => setForm({ ...form, image_attribution: e.target.value })} />
        </div>

        {/* ── Colaboración (SCU) ── */}
        <div className="sm:col-span-2 mt-2 pt-4 border-t border-amber-200">
          <h4 className="text-sm font-bold font-heading text-amber-800 mb-1">Colaboración (Franky)</h4>
          <p className="text-xs text-text-muted">Marca la universidad como colaboradora para que aparezca en /colaboradores y muestre la ficha premium.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_partner}
              onChange={(e) => setForm({ ...form, is_partner: e.target.checked })}
              className="h-4 w-4 rounded border-border text-violet focus:ring-violet/30"
            />
            <span className="text-sm font-medium text-text-primary">Es universidad colaboradora</span>
          </label>
        </div>
        <div>
          <label className={labelClass}>Nivel de colaboración</label>
          <select className={inputClass} value={form.partner_tier} onChange={(e) => setForm({ ...form, partner_tier: e.target.value })}>
            <option value="">Sin nivel</option>
            <option value="fundadora">Fundadora</option>
            <option value="colaboradora">Colaboradora</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Colaboradora desde</label>
          <input type="date" className={inputClass} value={form.partner_since} onChange={(e) => setForm({ ...form, partner_since: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>URL del logo (muro de colaboradoras)</label>
          <input className={inputClass} value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Mensaje de la universidad (blurb)</label>
          <textarea className={`${inputClass} min-h-[70px]`} value={form.partner_blurb} onChange={(e) => setForm({ ...form, partner_blurb: e.target.value })} />
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
          <textarea className={`${inputClass} min-h-[70px] font-mono text-xs`} value={form.gallery_urls} onChange={(e) => setForm({ ...form, gallery_urls: e.target.value })} placeholder={"https://...\nhttps://..."} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-4">
        <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl border border-border text-sm text-text-muted hover:bg-gray-50">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet text-white text-sm font-medium hover:bg-violet-deep transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </button>
      </div>
    </div>
  );
}
