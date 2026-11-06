import { createServerSupabase } from '@/lib/supabase-server';
import { ORIGIN_ORGANIZER_ID } from '@/lib/origin-partner';
type Guest={id:string;buyer_name:string;buyer_email:string;size:string;amount_cents:number;paid_at:string};
export default async function OriginGuestAttendees({eventId,organizerId}:{eventId:string;organizerId:string}) {
  if(organizerId!==ORIGIN_ORGANIZER_ID)return null;
  const supabase=await createServerSupabase();
  const {data,error}=await supabase.rpc('get_origin_event_attendees',{p_event:eventId});
  if(error)return <p role="alert" className="my-6 rounded-xl border border-border-light p-4 text-sm">No se han podido consultar las entradas de la web de ORIGIN. Vuelve a cargar la página; si accedes como administrador, verifica tu segundo factor.</p>;
  const guests=(data??[]) as Guest[];
  const sizes=['XS','S','M','L','XL','XXL'].map(size=>({size,count:guests.filter(g=>g.size===size).length})).filter(row=>row.count>0);
  return <section className="my-6 space-y-3 rounded-2xl border border-border-light bg-white p-5">
    <h2 className="font-heading text-lg font-bold">Entradas compradas en ORIGIN · {guests.length}</h2>
    <p className="text-sm text-text-secondary">Pagadas a Franky. Comprueba el nombre y la referencia del correo en el acceso. Las entradas reembolsadas no aparecen como válidas.</p>
    {sizes.length>0&&<p className="text-sm">Camisetas de estas entradas: {sizes.map(row=>`${row.size}: ${row.count}`).join(' · ')}</p>}
    {guests.length===0?<p className="text-sm text-text-muted">Todavía no hay compras confirmadas desde su web.</p>:<ul className="divide-y divide-border-light">{guests.map(g=><li key={g.id} className="space-y-1 py-3"><p className="font-semibold">{g.buyer_name}</p><p className="break-all text-sm text-text-secondary">{g.buyer_email}</p><p className="text-sm">{g.size==='ninguna'?'Sin camiseta':`Camiseta ${g.size}`} · {(g.amount_cents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'})} pagados</p><p className="break-all text-xs text-text-muted">Referencia: {g.id}</p></li>)}</ul>}
  </section>;
}
