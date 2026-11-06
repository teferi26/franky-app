"use client";
import { MEC_FIELDS, mecInputError, type MecDraft } from "@/lib/mec-requirements";
import { Input } from "@/components/ui/input";

// Preguntas de la beca general MEC dentro del orientador: etiqueta visible,
// control con los mismos tokens que ui/input y error inline con role="alert".
export default function MecQuestions({ part, value, onChange, level }: { part:'economia'|'academico'; value:MecDraft; onChange:(value:MecDraft)=>void; level:string }) {
  const selectClass = "mt-1.5 flex h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15";
  const error=mecInputError(value,part);
  const select=(key:keyof typeof MEC_FIELDS)=><label key={key} className="block text-sm font-semibold text-text-primary">{MEC_FIELDS[key].label}<select className={selectClass} value={value[key]??''} onChange={e=>onChange({...value,[key]:e.target.value})}>{MEC_FIELDS[key].options.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>;
  const number=(key:keyof MecDraft,label:string,max:number)=><label key={key} className="block text-sm font-semibold text-text-primary">{label}<Input className="mt-1.5 tabular" inputMode="decimal" type="number" min="0" max={max} step="any" value={value[key]??''} onChange={e=>onChange({...value,[key]:e.target.value})} placeholder="Opcional"/></label>;
  return <div className="space-y-4">{part==='economia'?<>{select('miembros')}{number('rentaComputable','Renta familiar computable de 2025 (€)',10000000)}<p className="text-xs leading-relaxed text-text-muted">Utiliza la renta calculada para la beca después de las deducciones aplicables. No es el salario bruto. Si no conoces la cifra o quién es miembro computable, déjalo pendiente. Estos datos permanecen en esta pantalla.</p></>:<>{select('curso')}{number('creditos','ECTS que vas a matricular en 2026/2027',180)}{value.curso==='posterior'&&<>{level==='grado'&&select('rama')}{number('creditosPrevios','ECTS matriculados el curso anterior',180)}{number('aprobados','De esos ECTS, cuántos aprobaste',180)}</>}<p className="text-xs leading-relaxed text-text-muted">Si accedes a primero de grado por PAU, indica arriba la nota sobre 10 sin la fase voluntaria. La matrícula parcial, los dobles grados y los últimos créditos pueden tener reglas especiales.</p></>}{error&&<p role="alert" className="text-sm font-medium text-error">{error}</p>}</div>;
}
