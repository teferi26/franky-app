export type CityPost={id:string;title:string;body:string;city:string;organization_id:string;organization_name:string;kind:'community'|'leisure';verified:boolean;sponsored:boolean;published_at:string;minimum_age:string};
export type CityCursor={id:string;sponsored:boolean};
export type CityPage={items:CityPost[];next_cursor:CityCursor|null};
export type CityCampaign={id:string;resource_id:string;title:string;city:string;starts_at:string;ends_at:string;budget_cents:number;spent_cents:number;minimum_age:number;status:'requested'|'active'|'paused'|'rejected'|'ended';revision:string;review_note:string|null;organization_name?:string};
export type CampaignSnapshot={enabled:boolean;demo:boolean;items:CityCampaign[];posts:{id:string;title:string;city:string;status:string;minimum_age:number}[];metrics:{period:string;views:number|null;opens:number|null;suppressed:boolean}};
export const CAMPAIGN_STATUS:Record<string,string>={requested:'Pendiente de revisión',active:'Activa / programada',paused:'Pausada',rejected:'No aprobada',ended:'Finalizada',approved:'Aprobado',pending:'Pendiente de revisión',published:'Publicado',draft:'Borrador'};
export function campaignCents(value:string):number|null{const normalized=value.trim().replace(',','.');if(!/^\d{1,6}(\.\d{1,2})?$/.test(normalized))return null;const[whole,fraction='']=normalized.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));return cents>=100&&cents<=10_000_000?cents:null;}
export type CampaignAttempt={fingerprint:string;key:string};
/** Preserve an uncertain retry only while all submitted values are identical. */
export function campaignAttempt(previous:CampaignAttempt|null,payload:Record<string,unknown>,newKey:string):CampaignAttempt{
 const fingerprint=JSON.stringify(Object.fromEntries(Object.entries(payload).sort(([a],[b])=>a.localeCompare(b))));
 return previous?.fingerprint===fingerprint?previous:{fingerprint,key:newKey};
}
