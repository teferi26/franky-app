"use client";

import * as React from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import { dayLabel } from "@/lib/pro/format";
import { PRIVACY_MIN_GROUP, buildSeasonReport, seasonReportCsv, seasonReportHtml } from "@/lib/pro/university";
import { Meter, PageHeader, Panel, Tip } from "../../kit";
import { HiddenGroup, downloadCsv } from "./ui";

const long = (day: string) => dayLabel(`${day}T12:00:00Z`, { weekday: false });

export default function UniversityMemoria() {
  const { data, now } = usePro();
  const toast = useToast();
  const report = React.useMemo(() => buildSeasonReport(data, now), [data, now]);
  const hasFaculties = report.faculties.length > 0;

  const exportCsv = () => downloadCsv(`informe-temporada-${report.to}.csv`, seasonReportCsv(report));

  // Hoja aparte, limpia, para imprimir o guardar como PDF desde el navegador.
  const print = () => {
    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) {
      toast.error("El navegador ha bloqueado la ventana", "Permite ventanas emergentes o descarga el CSV.");
      return;
    }
    win.document.open();
    win.document.write(seasonReportHtml(report));
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Informe"
        title="Informe de temporada"
        description={`Del ${long(report.from)} al ${long(report.to)}. Lo que ha hecho tu servicio este curso, listo para la memoria anual y para pedir el presupuesto del año que viene.`}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="dark" onClick={print}>
              <Printer className="h-4 w-4" /> Imprimir o guardar PDF
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {report.sections.map((s) => (
          <Panel key={s.title} title={s.title}>
            <dl className="-my-2 divide-y divide-border-light">
              {s.rows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                  <dt className="text-text-muted">{label}</dt>
                  <dd className="shrink-0 font-heading text-base font-bold tabular">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        ))}
      </div>

      {hasFaculties ? (
        <Panel title="Primero por facultad" description="Qué parte de primero ha ido a la bienvenida, se ha apuntado a una asociación y sigue activa a 30 días." flush>
          <div className="overflow-x-auto pro-scroll">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border-light text-left text-xs text-text-muted">
                  <th className="px-4 py-2.5 font-medium sm:px-5">Facultad</th>
                  <th className="px-3 py-2.5 text-right font-medium">Estudiantes</th>
                  <th className="px-3 py-2.5 font-medium">Bienvenida</th>
                  <th className="px-3 py-2.5 font-medium">Asociación</th>
                  <th className="px-4 py-2.5 font-medium sm:px-5">Activos 30 días</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {report.faculties.map((f) => (
                  <tr key={f.faculty}>
                    <td className="px-4 py-2.5 font-medium sm:px-5">{f.faculty}</td>
                    {f.firstYear === null ? (
                      <td colSpan={4} className="px-3 py-2.5 sm:pr-5">
                        <HiddenGroup />
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-right tabular">{f.firstYear.toLocaleString("es-ES")}</td>
                        {[f.participated, f.association, f.active30].map((p, i) => (
                          <td key={i} className={i === 2 ? "px-4 py-2.5 sm:px-5" : "px-3 py-2.5"}>
                            <div className="flex items-center gap-2">
                              <Meter value={p ?? 0} max={100} className="w-16" />
                              <span className="w-10 text-right font-semibold tabular">{p} %</span>
                            </div>
                          </td>
                        ))}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Tip title="Para la memoria y el presupuesto">
        Todas las cifras salen de lo que ha pasado de verdad en Franky y son agregadas: los grupos de menos de {PRIVACY_MIN_GROUP} personas no aparecen. El PDF se genera desde el navegador con “Guardar como PDF”.
      </Tip>
    </div>
  );
}
