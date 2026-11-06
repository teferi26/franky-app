/** Organizational benefits stay with the organization across staff transfers. */
export type OrganizationGrowth = {
 enabled:boolean; organization_id:string; name:string; demo:boolean; can_manage:boolean; can_finance:boolean;
 code:string|null; active:boolean; affiliate_enabled:boolean; cash_enabled:boolean;
 periods:{period:string;pending:number|null;approved:number|null;activated:number|null;suppressed:boolean}[];
 totals:{pending:number;available:number;paid:number;reverted:number}|null;
 commission_cursor:string|null;tariff_cursor:string|null;
 commissions:{id:string;amount_cents:number;currency:string;status:string;receipt_reference:string|null;recovery_required:boolean;terms_snapshot?:Record<string,unknown>;created_at:string}[];
 tariffs:{id:string;stage:string;version:number;amount_cents:number;terms:string;starts_at:string}[];
};
export type OrganizationGrowthHistory = {items:OrganizationGrowth['commissions']|OrganizationGrowth['tariffs'];next_cursor:string|null};
export const ORGANIZATION_REFERRAL_NOTICE='El enlace pertenece al espacio y se mantiene aunque cambie su equipo. Los referidos se validan durante al menos siete días. No generan puntos personales para sus responsables.';
export const ORGANIZATION_GROWTH_STATUS:Record<string,string>={pending:'Pendiente',available:'Disponible',paid:'Pagada',reverted:'Revertida'};
