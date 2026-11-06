"use client";

import { useId } from "react";
import { PRICING } from "@/lib/pricing";
import { businessBillingLabel, type BusinessInterval } from "@/lib/business-billing";

export default function LeisureBillingSelector({ value, onChange, disabled = false }: {
  value: BusinessInterval;
  onChange: (value: BusinessInterval) => void;
  disabled?: boolean;
}) {
  const name = useId();
  const saving = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(PRICING.business_leisure.monthly * 12 - PRICING.business_leisure.yearly);
  return (
    <fieldset disabled={disabled} className="space-y-2 min-w-0">
      <legend className="text-sm font-semibold mb-2">Elige cómo pagar tu local</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["month", "year"] as const).map(interval => (
          <label key={interval} className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer ${value === interval ? "border-violet bg-violet/5" : "border-border"}`}>
            <input type="radio" name={name} value={interval} checked={value === interval} onChange={() => onChange(interval)} className="mt-1 accent-violet" />
            <span className="min-w-0 text-sm">
              <span className="block font-bold">{interval === "year" ? "Anual" : "Mensual"} · {businessBillingLabel({ type: "leisure", billing_interval: interval })}</span>
              <span className="block text-xs text-text-muted mt-1">{interval === "year" ? `Ahorras ${saving} € al año` : "Pago mes a mes"}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-text-muted">IVA incluido · por local. {value === "year" ? "Un pago de 100 € ahora y renovación cada año." : "Renovación mensual."} Puedes cancelar la renovación desde Facturación; tu ficha sigue activa hasta el final del periodo pagado.</p>
    </fieldset>
  );
}
