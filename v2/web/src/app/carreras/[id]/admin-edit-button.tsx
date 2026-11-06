"use client";

import { useState } from "react";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import { parseAcademicDuration } from "@/lib/academic-duration";

interface CareerData {
  id: string;
  name: string;
  description: string | null;
  cut_off_score: number | null;
  duration_years: number | null;
  credits: number | null;
  employment_rate: number | null;
  avg_salary: number | null;
  career_prospects: string | null;
  places_offered: number | null;
  modality: string | null;
  campus: string | null;
}

export default function AdminEditCareerButton({ career }: { career: CareerData }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: career.name || "",
    description: career.description || "",
    cut_off_score: career.cut_off_score?.toString() || "",
    duration_years: career.duration_years?.toString() || "",
    credits: career.credits?.toString() || "",
    employment_rate: career.employment_rate?.toString() || "",
    avg_salary: career.avg_salary?.toString() || "",
    career_prospects: career.career_prospects || "",
    places_offered: career.places_offered?.toString() || "",
    modality: career.modality || "presencial",
    campus: career.campus || "",
  });
  const router = useRouter();

  const handleSave = async () => {
    setSaveError(null);
    const duration = parseAcademicDuration(form.duration_years);
    if (form.duration_years.trim() && duration == null) {
      setSaveError('Introduce una duración válida, por ejemplo 5,5 años.');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("careers")
        .update({
          name: form.name,
          description: form.description || null,
          cut_off_score: form.cut_off_score ? parseFloat(form.cut_off_score) : null,
          duration_years: duration,
          credits: form.credits ? parseInt(form.credits) : null,
          employment_rate: form.employment_rate ? parseFloat(form.employment_rate) : null,
          avg_salary: form.avg_salary ? parseFloat(form.avg_salary) : null,
          career_prospects: form.career_prospects || null,
          places_offered: form.places_offered ? parseInt(form.places_offered) : null,
          modality: form.modality,
          campus: form.campus || null,
        })
        .eq("id", career.id)
        .select("id")
        .single();

      if (error) throw error;
      setEditing(false);
      router.refresh();
    } catch {
      setSaveError('No se han guardado los cambios. Revisa tu conexión y vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
        Editar carrera (Admin)
      </button>
    );
  }

  const inputClass = "w-full px-3 py-2 rounded-lg border border-border bg-bg-primary text-sm transition-colors focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-violet/20";
  const labelClass = "block text-xs font-medium text-text-muted mb-1";

  return (
    <div className="rounded-2xl border border-border border-l-2 border-l-orange bg-bg-primary p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold font-heading text-amber-800">Editar Carrera</h3>
        <button onClick={() => setEditing(false)} disabled={saving} aria-label="Cerrar edición" className="text-text-muted hover:text-error">
          <X className="h-5 w-5" />
        </button>
      </div>
      {saveError && <p role="alert" className="mb-4 text-sm text-error">{saveError}</p>}
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
          <label className={labelClass}>Nota de corte</label>
          <input type="number" step="0.001" className={inputClass} value={form.cut_off_score} onChange={(e) => setForm({ ...form, cut_off_score: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Duración (años)</label>
          <input type="number" step="0.1" min="0.1" max="99.9" aria-label="Duración (años)" className={inputClass} value={form.duration_years} onChange={(e) => setForm({ ...form, duration_years: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Créditos ECTS</label>
          <input type="number" className={inputClass} value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Tasa de empleo (%)</label>
          <input type="number" step="0.1" className={inputClass} value={form.employment_rate} onChange={(e) => setForm({ ...form, employment_rate: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Salario medio (€/año)</label>
          <input type="number" className={inputClass} value={form.avg_salary} onChange={(e) => setForm({ ...form, avg_salary: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Plazas ofertadas</label>
          <input type="number" className={inputClass} value={form.places_offered} onChange={(e) => setForm({ ...form, places_offered: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Modalidad</label>
          <select className={inputClass} value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
            <option value="hibrida">Híbrida</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Campus</label>
          <input className={inputClass} value={form.campus} onChange={(e) => setForm({ ...form, campus: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Salidas profesionales (JSON o texto)</label>
          <textarea className={`${inputClass} min-h-[80px]`} value={form.career_prospects} onChange={(e) => setForm({ ...form, career_prospects: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-4">
        <button
          onClick={() => setEditing(false)}
          disabled={saving}
          className="px-4 py-2 rounded-xl border border-border text-sm text-text-muted hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-text-primary text-bg-primary text-sm font-semibold transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-card-hover disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </button>
      </div>
    </div>
  );
}
