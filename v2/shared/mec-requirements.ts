/** MEC 2026/27. Source checked 2026-09-05; never reused for another call. */
export const MEC_SOURCE = "https://www.becaseducacion.gob.es/becas-y-ayudas/universidad-grado-master/que-necesitas.html";
export const MEC_COURSE = "2026/2027";
export type MecDraft = Partial<Record<"miembros" | "rentaComputable" | "curso" | "creditos" | "creditosPrevios" | "aprobados" | "rama", string>>;
export type MecCheck = { label: string; state: "revisar" | "orientativo"; detail: string };
const thresholds = [[8843,13898,14818],[13264,23724,25293],[17685,32201,34332],[22107,38242,40773],[25644,42743,45572],[29181,46142,49196],[32718,49503,52780],[36255,52850,56348]];
const value = (text?: string) => text?.trim() && Number.isFinite(Number(text.replace(",", "."))) ? Number(text.replace(",", ".")) : null;
const euros = (n: number) => `${n.toLocaleString("es-ES")} €`;
export function mecInputError(d:MecDraft,part:'economia'|'academico'):string|null {
  const keys=part==='economia'?['rentaComputable']:['creditos',...(d.curso==='posterior'?['creditosPrevios','aprobados']:[])];
  for(const key of keys as (keyof MecDraft)[]) {
    const raw=d[key]; if(!raw?.trim())continue;
    const n=value(raw),max=key==='rentaComputable'?10000000:180;
    if(n==null||n<0||n>max)return key==='rentaComputable'?'Introduce una renta válida, entre 0 y 10.000.000 €, o déjala pendiente.':'Introduce créditos válidos, entre 0 y 180, o déjalos pendientes.';
  }
  if(part==='academico'&&d.curso==='posterior'&&value(d.aprobados)!=null&&value(d.creditosPrevios)!=null&&value(d.aprobados)!>value(d.creditosPrevios)!)return 'Los créditos aprobados no pueden superar los matriculados.';
  return null;
}

export function assessMec(d: MecDraft, level: string, gradeText: string): MecCheck[] {
  if (!["grado","master"].includes(level)) return [];
  const result: MecCheck[] = [];
  const members=value(d.miembros), income=value(d.rentaComputable);
  if (members != null && Number.isInteger(members) && members>=1 && members<=8 && income != null && income>=0) {
    const limits=thresholds[members-1];
    const tier=limits.findIndex(limit=>income<=limit);
    result.push({label:"Renta familiar de 2025",state:tier<0?"revisar":"orientativo",detail:tier<0 ? `La cifra indicada supera el umbral 3 de ${euros(limits[2])} para ${members} miembros. Revisa el cálculo fiscal, los miembros computables y las deducciones.` : `La renta computable indicada se sitúa en el umbral ${tier+1} (hasta ${euros(limits[tier])}) para ${members} miembros. Faltan patrimonio y demás requisitos; esto no calcula una concesión.`});
  } else result.push({label:"Renta familiar de 2025",state:"revisar",detail:"Faltan renta computable y miembros de la unidad familiar. Para más de ocho miembros, consulta los incrementos de las bases. Un salario bruto o un tramo de ingresos no sustituye el cálculo fiscal."});
  const credits=value(d.creditos), previous=value(d.creditosPrevios), passed=value(d.aprobados), grade=value(gradeText);
  result.push({label:"Matrícula de 2026/2027",state:credits!=null&&credits>=60?"orientativo":"revisar",detail:credits==null?"Indica cuántos créditos vas a matricular.":credits>=60?"Alcanzas la referencia general de 60 ECTS. Comprueba primeras matrículas, reconocimientos y condiciones de tus estudios.":credits>=30?"Entre 30 y 59 ECTS se aplican condiciones de matrícula parcial y cuantías limitadas. Revisa las excepciones y tu unidad de becas.":"Por debajo de 30 ECTS debes revisar si se aplica alguna excepción, como últimos créditos o limitación de matrícula."});
  if (!d.curso) result.push({label:"Requisito académico",state:"revisar",detail:"Selecciona si empiezas estos estudios o continúas."});
  else if (d.curso === "primero") result.push({label:level==='grado'?"Nota de acceso sobre 10":"Nota de acceso al máster",state:grade!=null&&grade>=5&&grade<=10?"orientativo":"revisar",detail:grade==null?"Falta la nota de la enseñanza que te da acceso.":grade<0||grade>10?"La nota debe estar entre 0 y 10.":grade>=5?(level==='grado'?"Alcanzas el mínimo general de 5/10. Si accedes por PAU, utiliza 0,6 × Bachillerato + 0,4 × fase obligatoria, sin la fase voluntaria.":"Alcanzas la referencia general de 5/10 en los estudios de acceso."):(level==='master'?"La referencia es 5/10. Si vienes de ingeniería o arquitectura, consulta el coeficiente 1,17 previsto por la convocatoria.":"No alcanzas la referencia general de 5/10 con la nota indicada. Revisa la vía de acceso y las excepciones.")});
  else {
    const rates: Record<string,number>={ingenieria:65,ciencias:65,salud:80,sociales:90,artes:90};
    const required=level==='master'?100:rates[d.rama??''];
    if (previous==null||passed==null||previous<=0||passed<0||passed>previous||!required) result.push({label:"Créditos del curso anterior",state:"revisar",detail:"Faltan los créditos matriculados y aprobados, o la rama. Los aprobados no pueden superar los matriculados."});
    else if (previous<60) result.push({label:"Créditos del curso anterior",state:"revisar",detail:"La matrícula anterior fue inferior a 60 ECTS. Revisa los requisitos específicos de matrícula parcial y las excepciones; no aplicamos el porcentaje de matrícula completa."});
    else {
      const percentage=passed/previous*100;
      result.push({label:"Créditos del curso anterior",state:percentage>=required?'orientativo':'revisar',detail:`Has indicado ${passed} de ${previous} ECTS aprobados (${percentage.toFixed(1)} %). La referencia general de tu rama y curso es ${required} %. ${percentage>=required?'Alcanzas esa referencia; faltan los demás requisitos.':'Revisa si tus circunstancias permiten alguna excepción.'}`});
    }
    if(level==='master')result.push({label:"Media del primer curso de máster",state:grade!=null&&grade>=5&&grade<=10?'orientativo':'revisar',detail:'Además de aprobar el 100 % de los créditos, se exige una media de 5/10 en el primer curso. Contrasta tu expediente.'});
  }
  result.push({label:"Comprobaciones pendientes",state:"revisar",detail:"Patrimonio, residencia o nacionalidad, títulos previos, incompatibilidades y situaciones especiales se comprueban en las bases oficiales. No se determina una cuantía ni se presenta una solicitud aquí."});
  return result;
}

export const MEC_FIELDS = {
  miembros: { label: "Miembros computables de tu familia", options: [["","No lo sé"],...[1,2,3,4,5,6,7,8].map(n=>[String(n),`${n} ${n===1?'persona':'personas'}`]),["9","Más de 8 personas"]] },
  curso: { label: "Curso que vas a estudiar", options: [["","Por confirmar"],["primero","Primer curso"],["posterior","Segundo curso o posterior"]] },
  rama: { label: "Rama de tu grado", options: [["","Por confirmar"],["ingenieria","Ingeniería o arquitectura"],["ciencias","Ciencias"],["salud","Ciencias de la salud"],["sociales","Ciencias sociales o jurídicas"],["artes","Artes o humanidades"]] },
};

export function mecReviewRows(d:MecDraft,level:string):[string,string][] {
  const chosen=(key:keyof typeof MEC_FIELDS)=>MEC_FIELDS[key].options.find(([v])=>v===d[key])?.[1]??'Por confirmar';
  return [
    ['Miembros computables',chosen('miembros')],
    ['Renta computable de 2025',value(d.rentaComputable)==null?'Por confirmar':euros(value(d.rentaComputable)!)],
    ['Curso',chosen('curso')],
    ['ECTS de matrícula',d.creditos||'Por confirmar'],
    ...(d.curso==='posterior' ? [
      ...(level==='grado' ? [['Rama',chosen('rama')] as [string,string]] : []),
      ['ECTS del curso anterior',d.creditosPrevios||'Por confirmar'] as [string,string],
      ['ECTS aprobados',d.aprobados||'Por confirmar'] as [string,string],
    ] : []),
  ];
}
