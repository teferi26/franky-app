/**
 * Única fuente de verdad del asistente de contratos de alquiler (LAU).
 *
 * Tanto el wizard (cliente) como la generación de PDF y el cálculo del hash
 * (servidor) importan estas definiciones, de modo que los pasos, los campos y
 * sus claves nunca se desincronizan. Es un módulo de datos puro (sin React)
 * para poder usarse en ambos entornos.
 *
 * AVISO: la plantilla resultante es un contrato LAU estándar generado
 * automáticamente, NO asesoramiento legal. Se recomienda revisión profesional.
 */

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "boolean";

export type ContractField = {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  // Solo number: rango y unidad (para validación/visualización).
  min?: number;
  max?: number;
  suffix?: string;
  // Muestra el campo solo si otro campo booleano/select tiene cierto valor.
  showIf?: { key: string; equals: string | boolean };
};

export type ContractStep = {
  id: string;
  title: string;
  description?: string;
  fields: ContractField[];
};

export const CONTRACT_STEPS: ContractStep[] = [
  {
    id: "parties",
    title: "Partes del contrato",
    description: "Quién alquila (arrendador) y quién vive en el piso (arrendatarios).",
    fields: [
      { key: "landlord_name", label: "Nombre del arrendador", type: "text", required: true, placeholder: "Nombre y apellidos" },
      { key: "landlord_nif", label: "NIF / NIE del arrendador", type: "text", required: true, placeholder: "00000000X" },
      { key: "landlord_address", label: "Domicilio del arrendador a efectos de notificaciones", type: "text", placeholder: "Calle, nº, ciudad" },
      {
        key: "tenancy_liability",
        label: "Si hay varios inquilinos, ¿cómo responden de la renta?",
        type: "select",
        help: "Solidaria: cada uno responde del total. Mancomunada: cada uno de su parte.",
        options: [
          { value: "solidaria", label: "Solidaria (recomendado por el arrendador)" },
          { value: "mancomunada", label: "Mancomunada" },
        ],
      },
    ],
  },
  {
    id: "property",
    title: "El inmueble",
    fields: [
      { key: "property_address", label: "Dirección completa del piso", type: "text", required: true, placeholder: "Calle, nº, piso, puerta, ciudad, CP" },
      { key: "cadastral_ref", label: "Referencia catastral", type: "text", placeholder: "20 caracteres", help: "La encuentras en el recibo del IBI o en sedecatastro.gob.es." },
      { key: "surface_m2", label: "Superficie", type: "number", suffix: "m²", min: 1 },
      { key: "furnished", label: "¿El piso se alquila amueblado?", type: "boolean" },
      {
        key: "habitual_residence",
        label: "¿Será la vivienda habitual del inquilino?",
        type: "boolean",
        help: "Decide el régimen LAU: vivienda habitual (Título II, más protección para el inquilino) o de temporada (Título III).",
      },
      { key: "energy_cert", label: "Referencia del certificado de eficiencia energética", type: "text", placeholder: "Nº de registro" },
    ],
  },
  {
    id: "duration",
    title: "Duración",
    fields: [
      { key: "start_date", label: "Fecha de inicio", type: "date", required: true },
      { key: "duration_years", label: "Duración pactada", type: "number", suffix: "años", min: 1, max: 7, required: true, help: "Vivienda habitual: el inquilino puede prorrogar hasta 5 años (7 si el arrendador es persona jurídica)." },
      { key: "tacit_renewal", label: "¿Prórroga tácita al finalizar (art. 10 LAU)?", type: "boolean" },
      { key: "notice_days", label: "Preaviso para no renovar", type: "number", suffix: "días", min: 30, help: "Mínimo legal: 30 días el inquilino, 4 meses el arrendador." },
      { key: "early_withdrawal", label: "¿Permitir desistimiento del inquilino tras 6 meses (art. 11)?", type: "boolean", help: "Con preaviso de 30 días. Se puede pactar indemnización de 1 mensualidad por año restante." },
    ],
  },
  {
    id: "rent",
    title: "Renta",
    fields: [
      { key: "rent_monthly_eur", label: "Renta mensual", type: "number", suffix: "€", min: 1, required: true },
      { key: "payment_day", label: "Día de pago de cada mes", type: "number", min: 1, max: 31, placeholder: "5" },
      {
        key: "payment_method",
        label: "Método de pago",
        type: "select",
        options: [
          { value: "transfer", label: "Transferencia bancaria" },
          { value: "direct_debit", label: "Domiciliación" },
          { value: "platform", label: "A través de Franky" },
        ],
      },
      { key: "payment_iban", label: "IBAN para el pago de la renta", type: "text", placeholder: "ES00 0000 0000 0000 0000 0000", showIf: { key: "payment_method", equals: "transfer" } },
      {
        key: "rent_update_index",
        label: "Actualización anual de la renta",
        type: "select",
        help: "Ley 12/2023: el índice de referencia sustituye al IPC en muchos casos. Consulta el límite vigente.",
        options: [
          { value: "none", label: "Sin actualización" },
          { value: "irav", label: "Índice de referencia (IRAV/INE)" },
          { value: "ipc", label: "IPC" },
          { value: "pactada", label: "Cuantía pactada" },
        ],
      },
    ],
  },
  {
    id: "deposit",
    title: "Fianza y garantías",
    fields: [
      { key: "deposit_months", label: "Fianza legal", type: "number", suffix: "mensualidades", min: 1, max: 2, help: "Vivienda habitual: 1 mensualidad. Temporada: 2.", required: true },
      { key: "additional_guarantee_months", label: "Garantía adicional", type: "number", suffix: "mensualidades", min: 0, max: 2, help: "Máximo 2 mensualidades en vivienda habitual (art. 36.5 LAU)." },
      { key: "deposit_body", label: "Organismo autonómico de depósito de la fianza", type: "text", placeholder: "Ej. IVIMA, Incasòl…", help: "Depositar la fianza en el organismo de tu comunidad es responsabilidad del arrendador." },
    ],
  },
  {
    id: "expenses",
    title: "Gastos y suministros",
    fields: [
      {
        key: "ibi_payer",
        label: "¿Quién paga el IBI?",
        type: "select",
        options: [
          { value: "landlord", label: "Arrendador" },
          { value: "tenant", label: "Inquilino" },
        ],
      },
      {
        key: "community_payer",
        label: "¿Quién paga los gastos de comunidad?",
        type: "select",
        options: [
          { value: "landlord", label: "Arrendador" },
          { value: "tenant", label: "Inquilino" },
        ],
      },
      { key: "utilities_tenant", label: "Suministros a cargo del inquilino", type: "text", placeholder: "Luz, agua, gas, internet, basuras…" },
    ],
  },
  {
    id: "inventory",
    title: "Inventario y estado",
    fields: [
      { key: "inventory_notes", label: "Inventario / estado del inmueble", type: "textarea", placeholder: "Describe mobiliario, electrodomésticos y estado de entrega. Adjunta fotos aparte." },
    ],
  },
  {
    id: "works",
    title: "Obras y conservación",
    fields: [
      { key: "minor_repairs_tenant", label: "Las pequeñas reparaciones por uso ordinario corren a cargo del inquilino (art. 21.4)", type: "boolean" },
      { key: "works_notes", label: "Pactos sobre obras", type: "textarea", placeholder: "Autorizaciones, mejoras, etc. (arts. 21-23 LAU)." },
    ],
  },
  {
    id: "special",
    title: "Cláusulas especiales",
    fields: [
      { key: "pets_allowed", label: "¿Se permiten mascotas?", type: "boolean" },
      { key: "sublet_allowed", label: "¿Se permite el subarriendo (art. 8)?", type: "boolean" },
      { key: "use_restriction", label: "Uso del inmueble", type: "text", placeholder: "Ej. vivienda exclusivamente, no actividad profesional." },
      {
        key: "dispute_forum",
        label: "Resolución de conflictos",
        type: "select",
        options: [
          { value: "courts", label: "Juzgados del lugar del inmueble" },
          { value: "mediation", label: "Mediación previa" },
        ],
      },
      { key: "extra_clauses", label: "Otras cláusulas", type: "textarea", placeholder: "Pactos adicionales lícitos." },
    ],
  },
];

/** Claves de campo que llevan el importe usado para el cobro de renta/fianza. */
export const RENT_FIELD_KEY = "rent_monthly_eur";
export const DEPOSIT_MONTHS_KEY = "deposit_months";

export type ContractAnswers = Record<string, string | number | boolean | null>;

/** The same field validation is used before native review and server sending. */
export function validateContractAnswers(answers: ContractAnswers): string | null {
  for (const field of CONTRACT_STEPS.flatMap(step => step.fields)) {
    if (field.showIf && answers[field.showIf.key] !== field.showIf.equals) continue;
    const value = answers[field.key];
    if (value == null || value === '') { if (field.required) return `Completa: ${field.label}.`; continue; }
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || (field.min != null && value < field.min) || (field.max != null && value > field.max)) return `Revisa: ${field.label}.`;
    } else if (field.type === 'boolean') { if (typeof value !== 'boolean') return `Revisa: ${field.label}.`; }
    else if (typeof value !== 'string' || value.length > 4000) return `Revisa: ${field.label}.`;
    else if (field.type === 'select' && !field.options?.some(option => option.value === value)) return `Revisa: ${field.label}.`;
    else if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value)) return `Revisa: ${field.label}.`;
  }
  return null;
}

/** Aviso legal obligatorio mostrado antes de firmar y en el pie del PDF. */
export const LEGAL_DISCLAIMER =
  "Este contrato ha sido generado automáticamente a partir de una plantilla estándar " +
  "y NO constituye asesoramiento legal. Se recomienda su revisión por un profesional " +
  "antes de la firma. La firma electrónica empleada es simple (eIDAS): es admisible " +
  "como prueba, si bien con menor peso probatorio que una firma avanzada o cualificada. " +
  "El depósito de la fianza en el organismo autonómico correspondiente es responsabilidad " +
  "del arrendador. La actualización de la renta queda sujeta a la normativa vigente " +
  "(Ley 12/2023).";

/** Texto de consentimiento que el firmante acepta al firmar (se guarda en auditoría). */
export const SIGNATURE_CONSENT =
  "He leído el contrato y los avisos legales, entiendo que firmo electrónicamente de forma " +
  "vinculante (firma electrónica simple eIDAS) y consiento que se registren la fecha, mi " +
  "dirección IP y mi navegador como prueba de la firma.";

/** Importe de la renta en céntimos a partir de las answers (0 si no válido). */
export function rentCentsFromAnswers(answers: ContractAnswers): number {
  const v = Number(answers[RENT_FIELD_KEY]);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
}

/** Importe de la fianza en céntimos (mensualidades × renta). */
export function depositCentsFromAnswers(answers: ContractAnswers): number {
  const months = Number(answers[DEPOSIT_MONTHS_KEY]);
  const rent = rentCentsFromAnswers(answers);
  return Number.isFinite(months) && months > 0 ? Math.round(months * rent) : 0;
}
