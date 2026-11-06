"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Envoltorio de campo de formulario: etiqueta visible, texto de ayuda y error
 * inline bajo el control, todo enlazado por `aria-describedby`.
 *
 * Los formularios de la web repetían este bloque a mano y cada uno lo hacía
 * distinto (unos con la ayuda encima, otros con el error en un toast, otros
 * sin etiqueta y con placeholder). Aquí se fija una sola forma:
 *
 *   <Field id="email" label="Correo" hint="El de la uni si lo tienes" error={err}>
 *     <Input id="email" aria-invalid={!!err} onBlur={validar} />
 *   </Field>
 *
 * El control se pasa como hijo para no acoplar el envoltorio a Input: sirve
 * igual para Textarea, select nativo o Combobox. El id de la ayuda y del error
 * se derivan del `id` del campo y se inyectan en el hijo si es un elemento
 * React válido (React.cloneElement), así el lector de pantalla lee el error
 * al entrar en el campo.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  optional,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode | null;
  required?: boolean;
  /** Pinta "(opcional)" junto a la etiqueta: se marca lo raro, no lo normal. */
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[13px] font-semibold tracking-tight text-text-primary">
        {label}
        {required && (
          <span className="ml-0.5 text-error" aria-hidden="true">
            *
          </span>
        )}
        {optional && (
          <span className="ml-1.5 text-xs font-normal text-text-muted">(opcional)</span>
        )}
      </label>
      {control}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-error animate-fade-in"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
