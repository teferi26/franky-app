"use client";

import * as React from "react";
import { FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import {
  applyImport,
  importBundles,
  importPreview,
  type ImportField,
} from "@/lib/pro/agenda-import";
import { Panel, Pill, textareaClass } from "../../kit";
import { Callout, useAgenda } from "./parts";

const FIELD_LABEL: Record<ImportField, string> = {
  name: "Nombre",
  firstName: "Nombre",
  lastName: "Apellidos",
  phone: "Teléfono",
  email: "Email",
  notes: "Notas",
  birthday: "Cumpleaños",
  visits: "Visitas",
  lastVisit: "Última visita",
  bundle: "Bono",
  sessions: "Sesiones",
};

/**
 * Traer los clientes de la agenda anterior: se pega o se sube el CSV, se ve
 * qué entra y qué ya estaba, y se guarda con un toque. Los bonos vivos
 * entran con las sesiones que les quedan.
 */
export function ImportClients() {
  const { data, run, allowed } = useAgenda();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const preview = React.useMemo(
    () => (text.trim() ? importPreview(data, text) : null),
    [data, text],
  );
  const bundles = preview ? importBundles(preview) : null;
  const hasName =
    preview?.columns.includes("name") || preview?.columns.includes("firstName");
  const labels = preview
    ? [...new Set(preview.columns.map((field) => FIELD_LABEL[field]))]
    : [];

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
  };

  const save = async () => {
    if (!preview?.rows.length) return;
    const ids = preview.rows.map(() => localId("c"));
    const ok = await run("agenda.import", (d) =>
      applyImport(d, preview, { ids, at: new Date().toISOString() }),
    );
    if (!ok) return;
    toast.success(
      `${preview.rows.length} ${preview.rows.length === 1 ? "cliente añadido" : "clientes añadidos"}`,
      bundles?.matched
        ? `Con ${bundles.matched} ${bundles.matched === 1 ? "bono vivo" : "bonos vivos"}.`
        : undefined,
    );
    setText("");
  };

  return (
    <Panel
      title="Trae tus clientes"
      description="Sube o pega el CSV de tu agenda anterior o de una hoja de cálculo. Antes de guardar ves qué entra."
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            aria-label="Archivo CSV de clientes"
            onChange={(e) => void readFile(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            className="h-10"
            disabled={!allowed("agenda.import")}
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="h-4 w-4" strokeWidth={1.9} /> Subir CSV
          </Button>
          {text ? (
            <Button
              variant="ghost"
              className="h-10"
              onClick={() => {
                setText("");
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Empezar de nuevo
            </Button>
          ) : null}
        </div>
        <textarea
          aria-label="Clientes en CSV"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "Nombre;Teléfono;Email;Bono;Sesiones\nLaura Soler;600 123 456;laura@correo.es;Bono 6 láser piernas;4"
          }
          className={textareaClass}
          rows={4}
        />

        {preview && !hasName ? (
          <Callout tone="warning" title="No encontramos la columna del nombre">
            La primera fila tiene que ser la cabecera, con una columna Nombre (o
            Nombre y Apellidos).
          </Callout>
        ) : null}

        {preview && hasName ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((label) => (
                <Pill key={label}>{label}</Pill>
              ))}
            </div>
            <p className="text-sm text-text-secondary">
              <span className="font-semibold text-text-primary">
                Entran {preview.rows.length}{" "}
                {preview.rows.length === 1 ? "ficha" : "fichas"}
              </span>
              {preview.duplicates.length
                ? `, ${preview.duplicates.length} ya ${preview.duplicates.length === 1 ? "estaba" : "estaban"} (mismo teléfono o nombre)`
                : ""}
              {preview.skipped
                ? `, ${preview.skipped} ${preview.skipped === 1 ? "fila sin nombre" : "filas sin nombre"}`
                : ""}
              {bundles?.matched ? `. ${bundles.matched} con bono vivo` : ""}
              {bundles?.unmatched
                ? ` y ${bundles.unmatched} ${bundles.unmatched === 1 ? "bono" : "bonos"} sin un servicio que se llame igual (entra la ficha, no el bono)`
                : ""}
              .
            </p>
            {preview.rows.length ? (
              <div className="overflow-x-auto rounded-xl border border-border pro-scroll">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-text-muted">
                      <th className="px-3 py-2 font-semibold">Nombre</th>
                      <th className="px-3 py-2 font-semibold">Teléfono</th>
                      <th className="px-3 py-2 font-semibold">Bono</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 5).map((row, i) => (
                      <tr
                        key={`${row.name}-${i}`}
                        className="border-b border-border-light last:border-0"
                      >
                        <td className="px-3 py-2 font-semibold">{row.name}</td>
                        <td className="px-3 py-2 tabular text-text-secondary">
                          {row.phone ?? ""}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {row.bundle
                            ? `${row.bundle.label}, quedan ${row.bundle.sessions}`
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 5 ? (
                  <p className="border-t border-border-light px-3 py-2 text-xs text-text-muted">
                    Y {preview.rows.length - 5} más.
                  </p>
                ) : null}
              </div>
            ) : null}
            <Button
              variant="dark"
              className="self-start"
              disabled={!preview.rows.length || !allowed("agenda.import")}
              onClick={() => void save()}
            >
              <Upload className="h-4 w-4" strokeWidth={1.9} /> Añadir{" "}
              {preview.rows.length}{" "}
              {preview.rows.length === 1 ? "cliente" : "clientes"}
            </Button>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
