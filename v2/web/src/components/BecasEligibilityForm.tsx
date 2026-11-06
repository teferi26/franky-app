"use client";

import { useState, useRef, useEffect } from "react";
import type { ScholarshipProfile } from "@/lib/scholarship-eligibility";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { NIVELES, TIPOS_AYUDA } from "@/lib/becas";
import MecQuestions from "@/components/MecQuestions";
import { mecInputError, mecReviewRows } from "@/lib/mec-requirements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const comunidades = [
  "Andalucía", "Aragón", "Asturias", "Baleares", "Canarias",
  "Cantabria", "Castilla y León", "Castilla-La Mancha", "Cataluña",
  "Comunidad Valenciana", "Extremadura", "Galicia", "La Rioja",
  "Madrid", "Murcia", "Navarra", "País Vasco", "Ceuta", "Melilla",
];

const nivelesEstudio = NIVELES;

const tramosRenta = [
  { value: "desconocida", label: "No lo sé / prefiero no indicarlo" },
  { value: "8000", label: "Menos de 8.000 €/año" },
  { value: "14000", label: "Entre 8.000 y 14.000 €/año" },
  { value: "22000", label: "Entre 14.000 y 22.000 €/año" },
  { value: "36000", label: "Entre 22.000 y 36.000 €/año" },
  { value: "50000", label: "Entre 36.000 y 50.000 €/año" },
  { value: "100000", label: "Más de 50.000 €/año" },
];

// Opción de respuesta única: borde hairline en reposo, borde oscuro y marca de
// verificación cuando está elegida. Es el mismo control en todos los pasos.
function Option({
  active,
  onClick,
  label,
  hint,
  compact = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border bg-bg-primary text-left transition-quick cursor-pointer",
        compact ? "px-3 py-2.5 text-sm" : "px-4 py-3",
        active
          ? "border-text-primary shadow-card"
          : "border-border hover:border-text-primary/30 hover:bg-bg-secondary"
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn("block", active ? "font-semibold text-text-primary" : "font-medium text-text-secondary")}>{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>}
      </span>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-quick",
          active ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-transparent"
        )}
        aria-hidden="true"
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    </button>
  );
}

// Ya no se piden `erasmus` ni `edad`:
//  · `erasmus` era un checkbox que se recogía y NUNCA se usaba al filtrar. Su
//    intención pasa a la opción "Irme al extranjero" del paso de tipo de ayuda,
//    que sí cruza contra `coverage` y `target_audience`.
//  · `edad` tampoco se usaba, y no puede usarse: la tabla `scholarships` no
//    tiene ninguna columna de edad. Pedir un dato que no filtra nada es
//    engañar a quien lo rellena.
export default function BecasEligibilityForm({ onComplete, initialValues }: { onComplete: (profile: ScholarshipProfile) => void; initialValues?: ScholarshipProfile }) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const [form, setForm] = useState<ScholarshipProfile>(initialValues ?? {
    nivel: "",
    comunidad: "",
    renta: "",
    nota_media: "",
    ayuda: "cualquiera",
    discapacidad: false,
    familia_numerosa: false,
  });

  const steps = [
    {
      title: "¿Qué vas a estudiar?",
      subtitle: "Selecciona tu nivel de estudios",
      field: "nivel" as const,
    },
    {
      title: "¿Dónde vives?",
      subtitle: "Algunas ayudas exigen residir o estudiar en una comunidad concreta",
      field: "comunidad" as const,
    },
    {
      title: "Renta familiar",
      subtitle: ['grado','master'].includes(form.nivel) ? "Revisión económica de la beca general MEC 2026/2027" : "Indica el tramo de renta anual de tu unidad familiar",
      field: "renta" as const,
    },
    {
      title: "Tu situación académica",
      subtitle: form.mec?.curso==='primero' ? "Nota de acceso a estos estudios, sobre 10" : "Nota media del curso anterior, sobre 10",
      field: "nota_media" as const,
    },
    {
      title: "¿Qué tipo de ayuda buscas?",
      subtitle: "Hay becas que son dinero y otras que son un contrato o unas prácticas",
      field: "ayuda" as const,
    },
    {
      title: "Información adicional",
      subtitle: "Estas opciones pueden darte acceso a becas especiales",
      field: "extra" as const,
    },
    { title: "Revisa tus respuestas", subtitle: "Puedes volver atrás y cambiar cualquier respuesta antes de continuar", field: "extra" as const },
  ];

  const currentStep = steps[step];
  const progress = ((step + 1) / steps.length) * 100;

  const canContinue = () => {
    switch (step) {
      case 0: return form.nivel !== "";
      case 1: return form.comunidad !== "";
      case 2: return ['grado','master'].includes(form.nivel) ? !mecInputError(form.mec??{},'economia') : form.renta !== "";
      case 3: return !mecInputError(form.mec??{},'academico') && (form.nota_media === "" || (Number.isFinite(Number(form.nota_media)) && Number(form.nota_media) >= 0 && Number(form.nota_media) <= 10));
      case 4: return true; // tipo de ayuda: por defecto "cualquiera", nunca bloquea
      case 5: return true;
      case 6: return true;
      default: return false;
    }
  };

  const handleSubmit = () => {
    onComplete(form);
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 pb-12 pt-4 sm:pt-6">
      <div className="mb-8">
        <p className="eyebrow">Orientador de ayudas</p>
        <h2 className="mt-2 font-heading text-2xl font-extrabold text-text-primary sm:text-3xl">
          Encuentra por dónde empezar
        </h2>
        <p className="mt-2 max-w-xl text-sm text-text-secondary sm:text-base">
          Preparamos una selección para revisar. Tus respuestas permanecen en esta pantalla y no se incluyen en enlaces ni en analítica.
        </p>
      </div>

      {/* Progreso: una línea fina y el paso en cifra tabular. */}
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs text-text-muted tabular">
          <span>Paso {step + 1} de {steps.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className="h-full rounded-full bg-violet transition-[width] duration-500 ease-[var(--ease-out-quart)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Cada paso entra deslizándose desde la derecha (key por paso). */}
      <div key={step} className="animate-step-in">
        <div className="mb-6">
          {currentStep && (
            <>
              <h3 ref={heading} tabIndex={-1} className="font-heading text-xl font-bold text-text-primary outline-none">{currentStep.title}</h3>
              <p className="mt-1 text-sm text-text-secondary">{currentStep.subtitle}</p>
            </>
          )}
        </div>

        {/* Paso 0: nivel de estudios */}
        {step === 0 && (
          <div className="grid gap-2">
            {nivelesEstudio.map((n) => (
              <Option key={n.value} active={form.nivel === n.value} onClick={() => setForm({ ...form, nivel: n.value })} label={n.label} />
            ))}
          </div>
        )}

        {/* Paso 1: comunidad */}
        {step === 1 && (
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {comunidades.map((c) => (
              <Option key={c} compact active={form.comunidad === c} onClick={() => setForm({ ...form, comunidad: c })} label={c} />
            ))}
          </div>
        )}

        {/* Paso 2: renta */}
        {step === 2 && !['grado','master'].includes(form.nivel) && (
          <div className="grid gap-2">
            {tramosRenta.map((r) => (
              <Option key={r.value} active={form.renta === r.value} onClick={() => setForm({ ...form, renta: r.value })} label={r.label} />
            ))}
          </div>
        )}

        {/* Paso 3: nota media */}
        {step === 2 && ['grado','master'].includes(form.nivel) && <MecQuestions part="economia" value={form.mec??{}} level={form.nivel} onChange={mec=>setForm({...form,mec})}/>}
        {step === 3 && (
          <div>
            <Field
              id="beca-nota-media"
              label="Nota media sobre diez"
              optional
              hint="Si la dejas en blanco, marcaremos el requisito como pendiente de comprobar. La nota de acceso, la media y los créditos aprobados son requisitos distintos según curso y convocatoria."
            >
              <Input
                type="number"
                aria-label="Nota media sobre diez, opcional"
                min="0"
                max="10"
                step="0.01"
                inputMode="decimal"
                value={form.nota_media}
                onChange={(e) => setForm({ ...form, nota_media: e.target.value })}
                placeholder="Ej: 7.50"
                className="h-12 text-lg font-semibold tabular"
              />
            </Field>
            {['grado','master'].includes(form.nivel)&&<div className="mt-6 border-t border-border-light pt-6"><MecQuestions part="academico" value={form.mec??{}} level={form.nivel} onChange={mec=>setForm({...form,mec})}/></div>}
          </div>
        )}

        {/* Paso 4: tipo de ayuda */}
        {step === 4 && (
          <div className="grid gap-2">
            {TIPOS_AYUDA.map((t) => (
              <Option key={t.value} active={form.ayuda === t.value} onClick={() => setForm({ ...form, ayuda: t.value })} label={t.label} hint={t.hint} />
            ))}
          </div>
        )}

        {/* Paso 5: información adicional */}
        {step === 5 && (
          <div className="space-y-2">
            <label className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border bg-bg-primary p-4 transition-quick",
              form.discapacidad ? "border-text-primary shadow-card" : "border-border hover:border-text-primary/30 hover:bg-bg-secondary"
            )}>
              <input
                type="checkbox"
                checked={form.discapacidad}
                onChange={(e) => setForm({ ...form, discapacidad: e.target.checked })}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-violet"
              />
              <span>
                <span className="block text-sm font-medium text-text-primary">Quiero consultar ayudas por discapacidad reconocida</span>
                <span className="mt-0.5 block text-xs text-text-muted">Opcional. Cada convocatoria establece el grado y la documentación necesarios.</span>
              </span>
            </label>
            <label className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border bg-bg-primary p-4 transition-quick",
              form.familia_numerosa ? "border-text-primary shadow-card" : "border-border hover:border-text-primary/30 hover:bg-bg-secondary"
            )}>
              <input
                type="checkbox"
                checked={form.familia_numerosa}
                onChange={(e) => setForm({ ...form, familia_numerosa: e.target.checked })}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-violet"
              />
              <span>
                <span className="block text-sm font-medium text-text-primary">Familia numerosa</span>
                <span className="mt-0.5 block text-xs text-text-muted">Algunas becas priorizan o reservan plazas</span>
              </span>
            </label>
          </div>
        )}

        {/* Paso 6: revisión */}
        {step === 6 && <div className="space-y-4 text-sm">
          <dl className="divide-y divide-border-light rounded-xl border border-border">
            {([
              ['Estudios',nivelesEstudio.find(n=>n.value===form.nivel)?.label??form.nivel],
              ['Residencia',form.comunidad],
              ['Nota sobre 10',form.nota_media||'Por confirmar'],
              ['Tipo de ayuda',TIPOS_AYUDA.find(t=>t.value===form.ayuda)?.label??'Cualquiera'],
              ...(['grado','master'].includes(form.nivel)?mecReviewRows(form.mec??{},form.nivel):[['Renta familiar',tramosRenta.find(r=>r.value===form.renta)?.label??'Por confirmar']]),
              ['Ayudas por discapacidad',form.discapacidad?'Quiero consultarlas':'No seleccionadas'],
              ['Familia numerosa',form.familia_numerosa?'Sí':'No indicada'],
            ] as [string,string][]).map(([label,value])=><div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 px-4 py-2.5"><dt className="text-text-muted">{label}</dt><dd className="break-words font-semibold text-text-primary">{value}</dd></div>)}
          </dl>
          <p className="text-text-muted">El resultado orienta tu búsqueda. Revisa las bases, el plazo y las comprobaciones pendientes antes de solicitar. Completar el formulario no presenta una solicitud.</p>
        </div>}
      </div>

      {/* Navegación: volver como fantasma, continuar como acción principal. */}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border-light pt-6">
        <Button
          variant="ghost"
          onClick={() => setStep(Math.max(0, step - 1))}
          className={cn(step === 0 && "invisible")}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Anterior
        </Button>
        <Button
          variant="dark"
          onClick={handleNext}
          disabled={!canContinue()}
          className="group"
        >
          {step === steps.length - 1 ? "Ver mis becas" : "Siguiente"}
          <ArrowRight className="arrow-nudge h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
