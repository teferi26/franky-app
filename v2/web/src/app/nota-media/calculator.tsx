"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Trash2, GraduationCap, Calculator } from "lucide-react";

/**
 * Calculadora de nota media ponderada por créditos.
 *
 * Portada desde la app móvil (mobile/app/nota-media.tsx), donde ya existía
 * desde el ciclo 2. En web además es pública e indexable: "calcular nota media
 * universidad" es una búsqueda con muchísimo volumen y ninguna herramienta
 * decente detrás.
 *
 * Igual que en móvil, todo vive en el dispositivo: no hay tabla en Supabase y
 * no hace falta cuenta. Se guarda en localStorage para que la lista sobreviva
 * a cerrar la pestaña.
 */
const STORAGE_KEY = "franky.notamedia.v1";

type Subject = { id: string; name: string; credits: number; grade: number };

/** Equivalencia cualitativa del sistema español (0-10). */
function qualitative(media: number): { label: string; className: string } {
  if (media < 5) return { label: "Suspenso", className: "text-error" };
  if (media < 7) return { label: "Aprobado", className: "text-text-secondary" };
  if (media < 9) return { label: "Notable", className: "text-info" };
  return { label: "Sobresaliente", className: "text-success" };
}

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function NotaMediaCalculator() {
  // null = todavía no se ha leído localStorage. Distinguirlo de [] evita
  // machacar la lista guardada con un array vacío en el primer render.
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [name, setName] = useState("");
  const [credits, setCredits] = useState("");
  const [grade, setGrade] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setSubjects(raw ? (JSON.parse(raw) as Subject[]) : []);
    } catch {
      setSubjects([]);
    }
  }, []);

  useEffect(() => {
    if (subjects === null) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(subjects));
    } catch {
      /* incógnito estricto: se pierde al cerrar, pero funciona */
    }
  }, [subjects]);

  const stats = useMemo(() => {
    const list = subjects ?? [];
    const totalCredits = list.reduce((s, a) => s + a.credits, 0);
    const weighted = list.reduce((s, a) => s + a.credits * a.grade, 0);
    const media = totalCredits > 0 ? weighted / totalCredits : 0;
    const passed = list.filter((a) => a.grade >= 5);
    const creditsPassed = passed.reduce((s, a) => s + a.credits, 0);
    const weightedPassed = passed.reduce((s, a) => s + a.credits * a.grade, 0);
    const mediaPassed = creditsPassed > 0 ? weightedPassed / creditsPassed : 0;
    return { totalCredits, media, creditsPassed, mediaPassed, count: list.length };
  }, [subjects]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    // Se acepta la coma decimal: en España se escribe "7,5", no "7.5".
    const c = Number(credits.replace(",", "."));
    const g = Number(grade.replace(",", "."));

    if (!trimmed) return setError("Pon el nombre de la asignatura.");
    if (!Number.isFinite(c) || c <= 0)
      return setError("Los créditos ECTS tienen que ser un número mayor que 0.");
    if (!Number.isFinite(g) || g < 0 || g > 10)
      return setError("La nota tiene que estar entre 0 y 10.");

    setSubjects((prev) => [
      ...(prev ?? []),
      { id: crypto.randomUUID(), name: trimmed, credits: c, grade: g },
    ]);
    setName("");
    setCredits("");
    setGrade("");
  };

  const remove = (id: string) =>
    setSubjects((prev) => (prev ?? []).filter((s) => s.id !== id));

  const list = subjects ?? [];
  const qual = qualitative(stats.media);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        {/* Alta de asignatura */}
        <form
          onSubmit={add}
          className="rounded-2xl border border-border bg-bg-primary p-5"
        >
          <h2 className="mb-4 font-heading text-lg font-bold">Añade una asignatura</h2>
          {error && (
            <p role="alert" className="mb-3 rounded-xl border border-error/30 p-3 text-sm text-error">
              {error}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_110px_110px_auto]">
            <div>
              <label htmlFor="nm-name" className="mb-1 block text-xs font-medium text-text-muted">
                Asignatura
              </label>
              <input
                id="nm-name"
                name="asignatura"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cálculo I"
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm transition-colors focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-violet/20"
              />
            </div>
            <div>
              <label htmlFor="nm-credits" className="mb-1 block text-xs font-medium text-text-muted">
                Créditos
              </label>
              <input
                id="nm-credits"
                name="creditos"
                inputMode="decimal"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                placeholder="6"
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm transition-colors focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-violet/20"
              />
            </div>
            <div>
              <label htmlFor="nm-grade" className="mb-1 block text-xs font-medium text-text-muted">
                Nota
              </label>
              <input
                id="nm-grade"
                name="nota"
                inputMode="decimal"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="7,5"
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm transition-colors focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-violet/20"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex h-[42px] w-full items-center justify-center gap-1.5 rounded-xl px-4 bg-text-primary text-bg-primary font-semibold transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-card-hover cursor-pointer sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                Añadir
              </button>
            </div>
          </div>
        </form>

        {/* Listado */}
        <div className="mt-6">
          {list.length === 0 ? (
            /* Vacío del sistema. Aquí no hay CTA porque la acción ya está
               justo encima (el formulario de añadir asignatura): un botón
               duplicado solo añadiría ruido. */
            <EmptyState
              icon={GraduationCap}
              compact
              title="Todavía no has añadido nada"
              description="Mete tus asignaturas con sus créditos y sus notas y verás la media ponderada al momento. No hace falta cuenta: se queda en este navegador."
            />
          ) : (
            <ul className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border bg-bg-primary">
              {list.map((s) => (
                <li key={s.id} className="flex items-center gap-3 p-4 transition-colors hover:bg-bg-secondary">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text-primary">{s.name}</p>
                    <p className="text-xs text-text-muted">
                      {fmt(s.credits)} ECTS
                    </p>
                  </div>
                  <span
                    className={`font-heading text-lg font-bold tabular ${
                      s.grade >= 5 ? "text-violet" : "text-error"
                    }`}
                  >
                    {fmt(s.grade)}
                  </span>
                  <button
                    onClick={() => remove(s.id)}
                    aria-label={`Quitar ${s.name}`}
                    className="cursor-pointer rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-error"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Resumen */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
          <div className="eyebrow mb-4 flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Tu expediente
          </div>

          <div className="text-center">
            <div className="font-heading text-5xl font-extrabold tracking-tight text-text-primary tabular">
              {fmt(stats.media)}
            </div>
            <div className={`mt-1 text-sm font-semibold ${qual.className}`}>
              {stats.count > 0 ? qual.label : "Sin asignaturas"}
            </div>
            <p className="mt-1 text-xs text-text-muted">Media ponderada por créditos</p>
          </div>

          <dl className="mt-6 space-y-3 border-t border-border-light pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Asignaturas</dt>
              <dd className="font-semibold text-text-primary tabular">{stats.count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Créditos totales</dt>
              <dd className="font-semibold text-text-primary tabular">{fmt(stats.totalCredits)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Créditos superados</dt>
              <dd className="font-semibold text-text-primary tabular">{fmt(stats.creditsPassed)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Media de lo aprobado</dt>
              <dd className="font-semibold text-text-primary tabular">{fmt(stats.mediaPassed)}</dd>
            </div>
          </dl>

          {list.length > 0 && (
            <button
              onClick={() => setSubjects([])}
              className="mt-5 w-full cursor-pointer rounded-xl border border-border py-2.5 text-sm font-medium text-text-muted transition-colors hover:border-error hover:text-error"
            >
              Vaciar la lista
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
