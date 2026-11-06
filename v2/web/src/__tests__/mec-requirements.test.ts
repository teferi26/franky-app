import { describe, it, expect } from "vitest";
import { assessMec, mecInputError } from "@/lib/mec-requirements";

describe("MEC 2026/27 reference checks",()=>{
  it("uses household size rather than a universal four-person threshold",()=>{
    const small=assessMec({miembros:'4',rentaComputable:'42000'},'grado','');
    const large=assessMec({miembros:'5',rentaComputable:'42000'},'grado','');
    expect(small[0].detail).toContain('supera el umbral 3');
    expect(large[0].detail).toContain('umbral 2');
  });
  it("keeps unknown income distinct from a declared zero",()=>{
    expect(assessMec({miembros:'3',rentaComputable:''},'grado','')[0].state).toBe('revisar');
    expect(assessMec({miembros:'3',rentaComputable:'0'},'grado','')[0].detail).toContain('umbral 1');
  });
  it("never treats an admission score out of 14 as a valid grade out of 10",()=>{
    const result=assessMec({curso:'primero'},'grado','12.3').find(c=>c.label==='Nota de acceso sobre 10');
    expect(result?.state).toBe('revisar');
    expect(result?.detail).toContain('entre 0 y 10');
  });
  it("distinguishes branches and does not apply full-enrolment rates to partial enrolment",()=>{
    const draft={curso:'posterior',creditos:'60',creditosPrevios:'60',aprobados:'42'};
    expect(assessMec({...draft,rama:'ingenieria'},'grado','7').find(c=>c.label==='Créditos del curso anterior')?.state).toBe('orientativo');
    expect(assessMec({...draft,rama:'salud'},'grado','7').find(c=>c.label==='Créditos del curso anterior')?.state).toBe('revisar');
    expect(assessMec({...draft,rama:'ingenieria',creditosPrevios:'30',aprobados:'25'},'grado','7').find(c=>c.label==='Créditos del curso anterior')?.detail).toContain('matrícula parcial');
  });
  it("rejects impossible credit values and allows leaving answers pending",()=>{
    expect(mecInputError({curso:'posterior',creditosPrevios:'60',aprobados:'61'},'academico')).toContain('no pueden superar');
    expect(mecInputError({rentaComputable:'-3'},'economia')).not.toBeNull();
    expect(mecInputError({},'academico')).toBeNull();
    expect(assessMec({},'doctorado','')).toEqual([]);
  });
});
