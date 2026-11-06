import { ExternalLink } from "lucide-react";
import { assessMec, MEC_COURSE, MEC_SOURCE, type MecDraft } from "@/lib/mec-requirements";
import { Badge } from "@/components/ui/badge";

// Revisión de la beca general (MEC o AGAUR) tras el orientador: un bloque
// plegable con una fila por comprobación y el estado en insignia.
export default function MecAssessment({ draft, level, grade, region }: { draft:MecDraft; level:string; grade:string; region?:string|null }) {
  const catalonia = /catalu[ñn]a|catalunya/i.test(region ?? '');
  const source = catalonia ? 'https://agaur.gencat.cat/es/beques-i-ajuts/beca-general-generalitat/estudiants-domicili-catalunya/informacio-solicitud-requisits/' : MEC_SOURCE;
  const checks=assessMec(draft,level,grade);
  if(!checks.length)return null;
  return <details className="mb-8 rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-6 animate-fade-in" open>
    <summary className="cursor-pointer list-none">
      <p className="eyebrow">Beca general · {MEC_COURSE}</p>
      <span className="mt-1 block font-heading text-xl font-bold text-text-primary">Tu revisión de la beca general {catalonia ? 'AGAUR' : 'MEC'}</span>
    </summary>
    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">{catalonia ? 'Si tu domicilio familiar a 31/12/2025 estaba en Cataluña, corresponde la convocatoria AGAUR, cerrada el 18 de mayo de 2026 a las 15:00. La universidad puede estar en cualquier comunidad.' : 'El plazo general terminó el 19 de mayo de 2026 a las 15:00. Si tu domicilio familiar estaba en Cataluña, corresponde la convocatoria de la Generalitat.'} Si ya la pediste, revisa los requisitos y los trámites de tu expediente.</p>
    <ul className="mt-4 divide-y divide-border-light border-y border-border-light">
      {checks.map((check, i)=><li key={check.label} className="flex flex-col gap-1 py-3 animate-list-in sm:flex-row sm:items-start sm:gap-4" style={{ "--i": i } as React.CSSProperties}>
        <div className="flex shrink-0 items-center gap-2 sm:w-56">
          <p className="text-sm font-semibold text-text-primary">{check.label}</p>
          <Badge variant={check.state==='revisar' ? 'warning' : 'success'}>{check.state==='revisar'?'Por revisar':'Referencia comprobada'}</Badge>
        </div>
        <p className="text-sm leading-relaxed text-text-secondary">{check.detail}</p>
      </li>)}
    </ul>
    <a href={source} target="_blank" rel="noopener noreferrer" className="group mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-violet link-underline">
      Requisitos oficiales · comprobados el 05/09/2026
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  </details>;
}
