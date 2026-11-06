export const WORKSPACE_STATUS_LABELS: Record<string,string> = {
 draft:'Borrador',published:'Publicado',pending_review:'En revisión',archived:'Archivado',
 active:'Activo',inactive:'Inactivo',pending:'Pendiente',confirmed:'Confirmada',
 completed:'Realizada',cancelled:'Cancelada',cancelled_by_owner:'Cancelada por el equipo',
 approved:'Aprobado',rejected:'No aprobado',reviewed:'Revisado',dismissed:'Descartado',
 valid:'Entrada válida',used:'Asistencia confirmada',registered:'Inscrito',
};
const ACTIONS:Record<string,string>={
 'demo.reset':'Demostración reiniciada','workspace.created':'Espacio creado',
 'resource.created':'Contenido creado','resource.updated':'Contenido actualizado',
 'resource.published':'Contenido publicado','resource.archived':'Contenido archivado',
 'member.invited':'Invitación al equipo','member.revoked':'Acceso al equipo revocado',
 'member.role_changed':'Permisos actualizados','ownership.transferred':'Responsable del espacio actualizado',
 'housing.lead_updated':'Seguimiento de un interesado actualizado','event.cancelled':'Actividad cancelada',
};
export function workspaceActionLabel(action:string){return ACTIONS[action]??'Actividad del equipo registrada';}
