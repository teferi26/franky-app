import type { ContractAnswers } from './contracts';
export type HousingTeamPerson = { id: string; name: string | null };
export type WorkspaceContract = {
 id: string; resource_id: string; title: string | null; accommodation_title?: string; status: string;
 answers: ContractAnswers; updated_at: string; rent_cents?: number | null; deposit_cents?: number | null;
 demo?: boolean; legal_owner_id: string; content_sha256?: string | null;
 signers: { user_id: string; name: string | null; role: string; status: string; signed_at?: string | null }[];
 eligible_tenants?: HousingTeamPerson[];
};
export type HousingOperations = {
 resource_id: string; title: string; demo: boolean; assignment: { agent_id: string | null; name: string | null } | null;
 team: HousingTeamPerson[]; notes: { id: string; body: string; created_at: string; author_name: string | null }[];
 tenancies: { id: string; tenant_id: string; name: string | null; status: string; room_label: string | null; start_date: string | null; end_date: string | null }[];
 contracts: Pick<WorkspaceContract,'id'|'title'|'status'|'rent_cents'|'deposit_cents'|'updated_at'>[];
 rents: { id: string; contract_id: string; tenant_id: string; period: string; due_date: string; amount_cents: number; status: string; external_recorded_cents: number; receipts: { id: string; amount_cents: number; method: string; reference: string; created_at: string; reversed: boolean }[] }[];
 provider_collected_cents: number | null;
 next_notes?: string | null; next_contracts?: string | null; next_rents?: string | null;
};
export const CONTRACT_STATUS: Record<string,string> = { draft:'Borrador',sent:'Pendiente de firmas',partially_signed:'Firmado parcialmente',fully_signed:'Firmado por todas las partes',cancelled:'Cancelado',pending_confirmation:'Pendiente de aceptación',active:'Activo',ended:'Finalizado',rejected:'No aceptado' };
export function moneyInputCents(value: string): number | null {
 if (!/^\d{1,8}([.,]\d{1,2})?$/.test(value.trim())) return null;
 const result=Math.round(Number(value.replace(',','.'))*100);return Number.isSafeInteger(result)&&result>0&&result<=10000000?result:null;
}
