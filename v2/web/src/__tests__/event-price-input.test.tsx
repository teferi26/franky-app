import React, { Suspense } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CrearEvento from '@/app/eventos/crear/page';
import EditarEvento from '@/app/eventos/[id]/editar/page';
import { parseEventPrice, eventPriceMeetsPaymentMinimum } from '@/lib/event-shirt-pricing';
import { ORIGIN_ORGANIZER_ID } from '@/lib/origin-partner';
import { grossFromNetCents, toCents } from '@/lib/pricing';
const mocks=vi.hoisted(()=>({user:{id:'organizer'},replace:vi.fn(),write:vi.fn(),event:{id:'event',organizer_id:'organizer',title:'Encuentro de prueba',city:'Altea',start_date:'2099-09-20T06:30:00Z',category:'otro',price:19.9,payment_mode:'info',show_participant_count:false,max_capacity:45}}));
vi.mock('next/navigation',()=>{const router={replace:mocks.replace};return {useRouter:()=>router};});
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:mocks.user,loading:false})}));
vi.mock('@/components/ui/confirm-dialog',()=>({useConfirm:()=>vi.fn()}));
vi.mock('@/app/eventos/components/event-photo-uploader',()=>({default:()=>null}));
vi.mock('@/app/eventos/components/connect-payouts-notice',()=>({default:()=>null}));
vi.mock('@/lib/supabase-client',()=>({createClient:()=>({from:(table:string)=>{
 const query:any={};
 for(const name of ['select','eq','in']) query[name]=()=>query;
 for(const action of ['insert','update'])query[action]=(payload:unknown)=>{mocks.write(table,action,payload);return query;};
 query.maybeSingle=async()=>({data:table==='profiles'?{role:'user'}:mocks.event,error:null});
 query.single=async()=>({data:{id:'event'},error:null});
 query.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:null,count:0,error:null}).then(resolve);
 return query;
}})}));
beforeEach(()=>{
 vi.clearAllMocks();localStorage.clear();
 localStorage.setItem('franky:evento-borrador',JSON.stringify({savedAt:Date.now(),title:'Encuentro de prueba',city:'Altea',startDate:'2099-09-20',startTime:'08:30',category:'otro',price:'0',showParticipantCount:false,maxCapacity:45,photos:[]}));
});
afterEach(cleanup);
async function form(mode:'create'|'edit'){
 if(mode==='create')render(<CrearEvento/>);
 else { const params=Promise.resolve({id:'event'});await act(async()=>{render(<Suspense fallback={<div>Cargando</div>}><EditarEvento params={params}/></Suspense>);await params;}); }
 return await screen.findByLabelText('Precio (€)');
}
function typePrice(field:HTMLElement,text:string){
 fireEvent.change(field,{target:{value:''}});
 for(const char of text)fireEvent.change(field,{target:{value:(field as HTMLInputElement).value+char}});
}
describe('event price entry and saving',()=>{
 it.each(['create','edit'] as const)('keeps a typed comma and persists cents when %s',async mode=>{
  const field=await form(mode);typePrice(field,'19,');expect(field).toHaveValue('19,');
  fireEvent.change(field,{target:{value:'19,90'}});expect(field).toHaveValue('19,90');
  fireEvent.click(screen.getByRole('button',{name:mode==='create'?'Publicar evento':'Guardar cambios'}));
  await waitFor(()=>expect(mocks.write).toHaveBeenCalledWith('events',mode==='create'?'insert':'update',expect.objectContaining({price:19.9,payment_mode:'info',show_participant_count:false,max_capacity:45})));
 });
 it('accepts arbitrary cents with a dot, not only fifty-cent steps',async()=>{
  const field=await form('create');typePrice(field,'12.37');
  fireEvent.click(screen.getByRole('button',{name:'Publicar evento'}));
  await waitFor(()=>expect(mocks.write).toHaveBeenCalledWith('events','insert',expect.objectContaining({price:12.37})));
 });
 it.each(['create','edit'] as const)('rejects invalid precision rather than publishing a free event: %s',async mode=>{
  const field=await form(mode);fireEvent.change(field,{target:{value:'19,999'}});
  fireEvent.click(screen.getByRole('button',{name:mode==='create'?'Publicar evento':'Guardar cambios'}));
  expect(await screen.findByText(/Indica un precio entre 0 y 9999/)).toBeInTheDocument();
  expect(mocks.write).not.toHaveBeenCalled();
 });
 it('retains commission calculation for decimal net amounts',async()=>{
  const field=await form('create');typePrice(field,'19,90');
  fireEvent.click(screen.getByRole('button',{name:/Cobro por la app/}));
  fireEvent.click(screen.getByRole('button',{name:'Publicar evento'}));
  await waitFor(()=>expect(mocks.write).toHaveBeenCalledWith('events','insert',expect.objectContaining({price:grossFromNetCents(toCents(19.9),'ticket')/100,payment_mode:'app'})));
 });
 it('restores a decimal draft without losing the comma',async()=>{
  const draft=JSON.parse(localStorage.getItem('franky:evento-borrador')!);draft.price='19,90';localStorage.setItem('franky:evento-borrador',JSON.stringify(draft));
  expect(await form('create')).toHaveValue('19,90');
 });
 it.each(['create','edit'] as const)('prevents an unchargeable card total when %s',async mode=>{
  const field=await form(mode);typePrice(field,'0,01');
  fireEvent.click(screen.getByRole('button',{name:/Cobro por la app/}));
  fireEvent.click(screen.getByRole('button',{name:mode==='create'?'Publicar evento':'Guardar cambios'}));
  expect(await screen.findByText(/El precio final para pagos con tarjeta/)).toBeInTheDocument();
  expect(mocks.write).not.toHaveBeenCalled();
 });
 it('applies the minimum to final card prices and ORIGIN without restricting offline events',()=>{
  expect(eventPriceMeetsPaymentMinimum(0.28,'app','organizer')).toBe(false);
  expect(eventPriceMeetsPaymentMinimum(0.50,'app','organizer')).toBe(true);
  expect(eventPriceMeetsPaymentMinimum(0.49,'info',ORIGIN_ORGANIZER_ID)).toBe(false);
  expect(eventPriceMeetsPaymentMinimum(0.50,'info',ORIGIN_ORGANIZER_ID)).toBe(true);
  expect(eventPriceMeetsPaymentMinimum(0.01,'info','organizer')).toBe(true);
  expect(eventPriceMeetsPaymentMinimum(0,'info',ORIGIN_ORGANIZER_ID)).toBe(true);
 });
 it('keeps explicit free events and rejects malformed general prices',()=>{
  const options={allowFree:true,max:9999};
  for(const text of ['','0','0,00'])expect(parseEventPrice(text,options)).toBe(0);
  for(const text of ['-1','1e2','1,234.56','19.999','NaN','10000'])expect(parseEventPrice(text,options)).toBeNull();
  expect(parseEventPrice('0')).toBeNull();
 });
});
