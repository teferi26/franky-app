"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { FileText, Plus, Loader2, Eye, Send, Trash2, X, Search, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatEur } from "@/lib/pricing";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";
import {
  Notice,
  Panel,
  PanelBody,
  PanelHeader,
  SectionTitle,
  controlClass,
  labelClass,
  tableClass,
  tdClass,
  thClass,
  trClass,
} from "../panel-ui";
import {
  CONTRACT_STEPS,
  type ContractField,
  type ContractAnswers,
} from "@/lib/contracts/questions";

interface Accommodation {
  id: string;
  title: string;
  city: string | null;
}

interface ContractRow {
  id: string;
  title: string | null;
  status: string;
  accommodation_id: string;
  accommodation_title: string;
  rent_cents: number | null;
  locked_at: string | null;
  updated_at: string;
}

interface StudentResult {
  id: string;
  full_name: string | null;
  career: string | null;
  university_course: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviado",
  partially_signed: "Firma parcial",
  fully_signed: "Firmado",
  cancelled: "Cancelado",
};

/** Color del punto de estado: solo el punto lleva color, el texto es neutro. */
const STATUS_DOT: Record<string, string> = {
  draft: "bg-text-muted",
  sent: "bg-warning",
  partially_signed: "bg-warning",
  fully_signed: "bg-success",
  cancelled: "bg-error",
};

function shouldShow(field: ContractField, answers: ContractAnswers): boolean {
  if (!field.showIf) return true;
  return answers[field.showIf.key] === field.showIf.equals;
}

export default function ContratosClient({ accommodations }: { accommodations: Accommodation[] }) {
  const toast = useToast();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  const [accommodationId, setAccommodationId] = useState<string>(accommodations[0]?.id ?? "");
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<ContractAnswers>({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Tenant picker
  const [tenantQuery, setTenantQuery] = useState("");
  const [tenantResults, setTenantResults] = useState<StudentResult[]>([]);
  const [selectedTenants, setSelectedTenants] = useState<StudentResult[]>([]);
  const [searching, setSearching] = useState(false);

  const totalSteps = CONTRACT_STEPS.length + 1; // +1 = paso de revisión/envío
  const isReviewStep = stepIdx === CONTRACT_STEPS.length;

  const loadContracts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contracts");
      const json = await res.json();
      if (res.ok) setContracts(json.contracts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  const resetWizard = () => {
    setWizardOpen(false);
    setContractId(null);
    setStepIdx(0);
    setAnswers({});
    setSelectedTenants([]);
    setTenantQuery("");
    setTenantResults([]);
  };

  const startNew = () => {
    if (accommodations.length === 0) {
      toast.error("Publica un piso antes de crear un contrato");
      return;
    }
    setAccommodationId(accommodations[0].id);
    setContractId(null);
    setAnswers({});
    setSelectedTenants([]);
    setStepIdx(0);
    setWizardOpen(true);
  };

  const editDraft = async (c: ContractRow) => {
    setAccommodationId(c.accommodation_id);
    setContractId(c.id);
    setStepIdx(0);
    setWizardOpen(true);
    // Carga las respuestas guardadas.
    const res = await fetch(`/api/contracts/${c.id}`);
    const json = await res.json();
    if (res.ok) setAnswers((json.contract?.answers ?? {}) as ContractAnswers);
  };

  // Crea el borrador en la primera edición; luego hace PATCH.
  const persist = async (): Promise<string | null> => {
    setSaving(true);
    try {
      if (!contractId) {
        const res = await fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accommodation_id: accommodationId, answers }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error("No se pudo guardar", json.error);
          return null;
        }
        setContractId(json.id);
        return json.id;
      }
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        const json = await res.json();
        toast.error("No se pudo guardar", json.error);
        return null;
      }
      return contractId;
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    const id = await persist();
    if (!id) return;
    setStepIdx((i) => Math.min(i + 1, totalSteps - 1));
  };

  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  const searchTenants = async (q: string) => {
    setTenantQuery(q);
    if (q.trim().length < 2) {
      setTenantResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (res.ok) setTenantResults(json.results ?? []);
    } finally {
      setSearching(false);
    }
  };

  const toggleTenant = (s: StudentResult) => {
    setSelectedTenants((prev) =>
      prev.some((t) => t.id === s.id) ? prev.filter((t) => t.id !== s.id) : [...prev, s]
    );
  };

  const sendContract = async () => {
    if (!contractId) {
      toast.error("Guarda el contrato primero");
      return;
    }
    if (selectedTenants.length === 0) {
      toast.error("Selecciona al menos un inquilino");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_ids: selectedTenants.map((t) => t.id) }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error("No se pudo enviar", json.error);
        return;
      }
      toast.success("Contrato enviado a firmar");
      resetWizard();
      loadContracts();
    } finally {
      setSending(false);
    }
  };

  const cancelContract = async (id: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/contracts/${id}/cancel`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error("No se pudo cancelar", json.error);
        return;
      }
      toast.success("Contrato cancelado");
      loadContracts();
    } finally {
      setActing(null);
    }
  };

  const deleteDraft = async (id: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/contracts/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        toast.error("No se pudo borrar", json.error);
        return;
      }
      toast.success("Borrador eliminado");
      loadContracts();
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <PanelHeader
        title="Contratos"
        description="Crea contratos de alquiler, envíalos a firmar y cobra la renta dentro de Franky."
        actions={
          !wizardOpen ? (
            <Button onClick={startNew} variant="dark">
              <Plus className="h-4 w-4" strokeWidth={1.75} /> Nuevo contrato
            </Button>
          ) : undefined
        }
      />

      <PanelBody className="space-y-8">
        {/* Lista */}
        {!wizardOpen &&
          (loading ? (
            <p className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </p>
          ) : contracts.length === 0 ? (
            <Reveal className="rounded-3xl border border-dashed border-border px-6 py-16 text-center">
              <FileText className="mx-auto h-8 w-8 text-text-muted" strokeWidth={1.5} />
              <p className="mt-4 font-heading text-lg font-bold text-text-primary">
                Aún no has creado ningún contrato
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
                Responde unas preguntas y Franky redacta el contrato listo para firmar.
              </p>
              <Button onClick={startNew} variant="dark" className="mt-6">
                <Plus className="h-4 w-4" strokeWidth={1.75} /> Nuevo contrato
              </Button>
            </Reveal>
          ) : (
            <Reveal className="space-y-5">
              <SectionTitle
                title="Tus contratos"
                aside={
                  <span className="text-sm text-text-muted tabular">
                    {contracts.length} {contracts.length === 1 ? "contrato" : "contratos"}
                  </span>
                }
              />
              <Panel className="overflow-x-auto">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Contrato</th>
                      <th className={thClass}>Estado</th>
                      <th className={cn(thClass, "text-right")}>Renta</th>
                      <th className={cn(thClass, "text-right")}>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c, i) => (
                      <tr
                        key={c.id}
                        style={{ "--i": i } as CSSProperties}
                        className={cn(trClass, "animate-list-in")}
                      >
                        <td className={tdClass}>
                          <p className="truncate font-semibold text-text-primary">
                            {c.title?.trim() || `Contrato: ${c.accommodation_title}`}
                          </p>
                          <p className="truncate text-xs text-text-muted">{c.accommodation_title}</p>
                        </td>
                        <td className={tdClass}>
                          <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-text-secondary">
                            <span
                              aria-hidden="true"
                              className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[c.status] ?? "bg-text-muted")}
                            />
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </td>
                        <td className={cn(tdClass, "text-right font-semibold text-text-primary tabular")}>
                          {c.rent_cents ? formatEur(c.rent_cents / 100) : <span className="text-text-muted">Sin fijar</span>}
                        </td>
                        <td className={cn(tdClass, "text-right")}>
                          <div className="inline-flex items-center gap-0.5">
                            {c.status !== "draft" && (
                              <Button asChild size="icon-sm" variant="ghost" title="Ver PDF">
                                <a
                                  href={`/api/contracts/${c.id}/pdf`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Ver PDF"
                                >
                                  <Eye className="h-4 w-4" strokeWidth={1.75} />
                                </a>
                              </Button>
                            )}
                            {c.status === "draft" && (
                              <>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() => editDraft(c)}
                                  title="Continuar"
                                  aria-label="Continuar borrador"
                                >
                                  <Send className="h-4 w-4" strokeWidth={1.75} />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  loading={acting === c.id}
                                  onClick={() => deleteDraft(c.id)}
                                  title="Eliminar borrador"
                                  aria-label="Eliminar borrador"
                                >
                                  {acting !== c.id && <Trash2 className="h-4 w-4" strokeWidth={1.75} />}
                                </Button>
                              </>
                            )}
                            {(c.status === "sent" || c.status === "partially_signed") && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                loading={acting === c.id}
                                onClick={() => cancelContract(c.id)}
                                title="Cancelar contrato"
                                aria-label="Cancelar contrato"
                              >
                                {acting !== c.id && <X className="h-4 w-4" strokeWidth={1.75} />}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </Reveal>
          ))}

        {/* Asistente */}
        {wizardOpen && (
          <div className="animate-page-in mx-auto max-w-2xl">
            {/* Cabecera del asistente */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow tabular">
                  Paso {stepIdx + 1} de {totalSteps}
                </p>
                <h2 className="mt-2 font-heading text-2xl font-bold text-text-primary sm:text-3xl">
                  {isReviewStep ? "Revisión y envío" : CONTRACT_STEPS[stepIdx].title}
                </h2>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={resetWizard} aria-label="Cerrar asistente">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </div>

            {/* Barra de progreso */}
            <div
              className="mt-5 h-1 overflow-hidden rounded-full bg-bg-tertiary"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={totalSteps}
              aria-valuenow={stepIdx + 1}
            >
              <div
                className="h-full rounded-full bg-text-primary transition-[width] duration-500 ease-[var(--ease-out-quart)]"
                style={{ width: `${((stepIdx + 1) / totalSteps) * 100}%` }}
              />
            </div>

            {/* El contenedor cambia de key por paso para que la entrada se repita. */}
            <div key={stepIdx} className="animate-step-in mt-8 space-y-6">
              {/* Selector de piso (solo primer paso de un contrato nuevo) */}
              {stepIdx === 0 && !contractId && accommodations.length > 1 && (
                <label className="block">
                  <span className={labelClass}>Piso</span>
                  <select
                    value={accommodationId}
                    onChange={(e) => setAccommodationId(e.target.value)}
                    className={controlClass}
                  >
                    {accommodations.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Campos del paso */}
              {!isReviewStep && (
                <div className="space-y-5">
                  {CONTRACT_STEPS[stepIdx].description && (
                    <p className="max-w-prose text-[15px] text-text-muted">
                      {CONTRACT_STEPS[stepIdx].description}
                    </p>
                  )}
                  {CONTRACT_STEPS[stepIdx].fields
                    .filter((f) => shouldShow(f, answers))
                    .map((field) => (
                      <FieldInput
                        key={field.key}
                        field={field}
                        value={answers[field.key]}
                        onChange={(v) => setAnswers((a) => ({ ...a, [field.key]: v }))}
                      />
                    ))}
                </div>
              )}

              {/* Paso de revisión */}
              {isReviewStep && (
                <div className="space-y-6">
                  {/* Vista previa del PDF */}
                  {contractId && (
                    <div className="overflow-hidden rounded-3xl border border-border bg-bg-secondary shadow-card">
                      <iframe
                        src={`/api/contracts/${contractId}/pdf`}
                        className="block h-[420px] w-full"
                        title="Vista previa del contrato"
                      />
                    </div>
                  )}

                  {/* Selección de inquilinos */}
                  <div className="space-y-3">
                    <p className={labelClass}>¿Quién firma como inquilino?</p>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                        strokeWidth={1.75}
                      />
                      <input
                        type="search"
                        className={cn(controlClass, "pl-10")}
                        placeholder="Busca al estudiante por nombre…"
                        aria-label="Buscar estudiante"
                        value={tenantQuery}
                        onChange={(e) => searchTenants(e.target.value)}
                      />
                    </div>
                    {searching && (
                      <p className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
                      </p>
                    )}
                    {tenantResults.length > 0 && (
                      <ul className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border">
                        {tenantResults.map((s) => {
                          const sel = selectedTenants.some((t) => t.id === s.id);
                          return (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => toggleTenant(s)}
                                aria-pressed={sel}
                                className={cn(
                                  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-bg-secondary",
                                  sel && "bg-bg-secondary"
                                )}
                              >
                                <span className="flex-1 truncate text-text-primary">
                                  {s.full_name ?? "Estudiante"}
                                  {s.career && <span className="text-text-muted"> · {s.career}</span>}
                                </span>
                                {sel && <Check className="h-4 w-4 text-violet" strokeWidth={2} />}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {selectedTenants.length > 0 && (
                      <ul className="flex flex-wrap gap-2 pt-1">
                        {selectedTenants.map((t) => (
                          <li
                            key={t.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-text-primary bg-text-primary py-1 pl-3 pr-1.5 text-xs font-semibold text-bg-primary"
                          >
                            {t.full_name ?? "Estudiante"}
                            <button
                              type="button"
                              onClick={() => toggleTenant(t)}
                              aria-label={`Quitar a ${t.full_name ?? "estudiante"}`}
                              className="rounded-full p-0.5 transition-colors hover:bg-bg-primary/20"
                            >
                              <X className="h-3 w-3" strokeWidth={2} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <Notice tone="warning">
                    Al enviar, el contrato queda bloqueado: no podrás editar las
                    respuestas. La plantilla es estándar y no constituye asesoramiento
                    legal; se recomienda revisión profesional. La firma electrónica es
                    simple (eIDAS).
                  </Notice>
                </div>
              )}
            </div>

            {/* Navegación */}
            <div className="mt-8 flex items-center justify-between border-t border-border-light pt-6">
              <Button variant="ghost" onClick={goBack} disabled={stepIdx === 0}>
                <ChevronLeft className="h-4 w-4" strokeWidth={1.75} /> Atrás
              </Button>
              {isReviewStep ? (
                <Button onClick={sendContract} loading={sending} variant="dark" size="lg">
                  {!sending && <Send className="h-4 w-4" strokeWidth={1.75} />}
                  Enviar a firmar
                </Button>
              ) : (
                <Button onClick={goNext} loading={saving} variant="dark" size="lg">
                  Siguiente <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              )}
            </div>
          </div>
        )}
      </PanelBody>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ContractField;
  value: ContractAnswers[string] | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  const label = (
    <span className={labelClass}>
      {field.label}
      {field.required && (
        <span className="text-error" aria-hidden="true">
          {" "}
          *
        </span>
      )}
    </span>
  );
  const help = field.help ? (
    <p className="-mt-0.5 mb-2 text-xs text-text-muted">{field.help}</p>
  ) : null;

  if (field.type === "boolean") {
    return (
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-bg-secondary">
        <span>
          <span className="block text-sm font-semibold text-text-primary">
            {field.label}
            {field.required && (
              <span className="text-error" aria-hidden="true">
                {" "}
                *
              </span>
            )}
          </span>
          {field.help && <span className="mt-0.5 block text-xs text-text-muted">{field.help}</span>}
        </span>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 shrink-0 rounded border-border accent-violet"
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block">
        {label}
        {help}
        <select
          value={value != null ? String(value) : ""}
          onChange={(e) => onChange(e.target.value)}
          className={controlClass}
        >
          <option value="">Selecciona…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="block">
        {label}
        {help}
        <textarea
          value={value != null ? String(value) : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className={cn(controlClass, "h-auto min-h-[6.5rem] resize-y py-2.5")}
        />
      </label>
    );
  }

  return (
    <label className="block">
      {label}
      {help}
      <div className="relative">
        <input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={value != null ? String(value) : ""}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          onChange={(e) =>
            onChange(field.type === "number" ? Number(e.target.value) : e.target.value)
          }
          className={cn(controlClass, field.type === "number" && "tabular", field.suffix && "pr-12")}
        />
        {field.suffix && (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
            {field.suffix}
          </span>
        )}
      </div>
    </label>
  );
}
