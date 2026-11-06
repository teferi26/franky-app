export type EventRefundStatus='requested'|'approved'|'processing'|'pending'|'refunded'|'closed_unpaid'|'rejected'|'review';
export type EventRefund={id:string;payment_id:string|null;ticket_id:string|null;booking_id?:string|null;type?:'ticket'|'visit';name:string;amount_cents:number;refunded_cents:number;status:EventRefundStatus;reason:string;review_reason:string|null;created_at:string;demo:boolean};
export type VisitRefundSnapshot={booking:{id:string;title:string;name:string|null;status:string;payment_status:string;amount_cents:number|null;demo:boolean};can_request:boolean;can_approve:boolean;refunds:EventRefund[]};
export type MyVisit={id:string;title:string;accommodation_id:string;status:string;payment_status:string;price_cents:number;slot_date:string;start_time:string;end_time:string;created_at:string};
export type MyVisitPage={items:MyVisit[];next_cursor:string|null};
export type RefundableVisits={items:{booking_id:string;title:string;starts_at:string;amount_cents:number;status:string;payment_status:string;refund_status:EventRefundStatus|null;demo:boolean}[];next_cursor:string|null};
export const VISIT_LABEL:Record<string,string>={pending:'Pendiente',confirmed:'Confirmada',completed:'Realizada',cancelled_by_owner:'Cancelada por el propietario',cancelled_by_visitor:'Cancelada por ti',no_show:'Sin asistencia'};
export type EventTemplate={id:string;name:string;version:number;updated_at:string};
export type EventWaiter={id:string;name:string;created_at:string;notified_at:string|null;eligible:boolean};
export type EventLifecycle={
 event:{id:string;title:string;status:string;starts_at:string;price_cents:number;demo:boolean}|null;
 templates:EventTemplate[];permissions:{content:boolean;attendees:boolean;finance:boolean};
 waitlist:{items:EventWaiter[];next_cursor:{created_at:string;id:string}|null};
 refunds:{items:EventRefund[];next_cursor:string|null};
 cancellation:{cancelled:boolean;can_cancel:boolean;requires_finance:boolean;attendees:number;pending_orders:number;paid_orders:number;remaining_cents:number;reason:string|null}|null;
};
export type EventLifecycleAction='save_template'|'archive_template'|'use_template'|'repeat'|'notify_waitlist'|'cancel'|'approve_refund'|'reject_refund';
export type EventLifecycleResult={template_id?:string;resource_id?:string;resources?:string[];cancelled?:boolean;refund_id?:string;notified?:number;demo?:boolean};
export const EVENT_REFUND_LABEL:Record<EventRefundStatus,string>={requested:'Solicitud recibida',approved:'Devolución autorizada',processing:'En comprobación',pending:'Pendiente del proveedor',refunded:'Devuelto',closed_unpaid:'Cobro cerrado sin cargo',rejected:'Solicitud no aprobada',review:'Necesita revisión'};
export function eventLifecycleError(error:unknown){const message=error instanceof Error?error.message:String((error as {message?:string})?.message??'');if(/mfa_required/.test(message))return 'Confirma tu identidad con el segundo factor para gestionar devoluciones.';if(/request_conflict/.test(message))return 'La solicitud anterior contiene otros datos. Actualiza antes de continuar.';if(/invalid_event_series/.test(message))return 'Revisa las fechas: hasta 12 actividades, cada 1–12 semanas, con duración máxima de 7 días.';if(/reason_required/.test(message))return 'Escribe un motivo de entre 5 y 1.000 caracteres.';if(/session_changed|workspace_changed|request_cancelled/.test(message))return 'La cuenta o el espacio ha cambiado.';return 'No se ha podido completar la operación. Comprueba tus permisos y vuelve a intentarlo.';}
