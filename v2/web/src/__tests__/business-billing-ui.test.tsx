import React from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dashboard from '@/app/negocio/dashboard/client';
import Registro from '@/app/negocio/registro/client';
const auth=vi.hoisted(()=>({user:{id:'owner'}}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>auth}));
vi.mock('@/lib/supabase-client',()=>({createClient:()=>({})}));
const fetchMock=vi.fn();
beforeEach(()=>{vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();fetchMock.mockImplementation(async (url:string)=>({ok:url.includes('invoices')||url.includes('housing-offer'),json:async()=>url.includes('invoices')?{invoices:[]}:url.includes('housing-offer')?{offers:[]}:{error:'Prueba de pago sin cobro'}}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const props=()=>({leisure:[],housing:[],subscriptions:[],ownerSub:null,success:false,published:false,ownerSuccess:false,canOwnerPanel:false});
const local={id:'local-one',name:'Local de prueba',city:'Alicante',category:'bar',image_url:null,is_paid:false};
describe('local annual billing controls',()=>{
 it('the actual registration form carries annual billing through listing creation',async()=>{
  fetchMock.mockImplementation(async(url:string)=>({ok:!url.includes('stripe/checkout'),json:async()=>url==='/api/negocio/registro'?{listingId:'created-local'}:url.includes('checkout')?{error:'Prueba de pago sin cobro'}:url.includes('owner-status')?{active:false}:{structure:[]}}));
  render(<Registro initialType="leisure" canceled={false}/>);
  fireEvent.change(screen.getByPlaceholderText('Cafetería Alma'),{target:{value:'Local de prueba'}});
  fireEvent.change(screen.getByPlaceholderText('Ej: Madrid'),{target:{value:'Alicante'}});
  fireEvent.click(screen.getByRole('button',{name:/Bar \/ Tapas/}));
  fireEvent.click(screen.getByRole('radio',{name:/Anual/}));fireEvent.click(screen.getByRole('button',{name:'Continuar al pago'}));
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/stripe/checkout',expect.objectContaining({body:JSON.stringify({mode:'business',businessType:'leisure',listingId:'created-local',interval:'year'})})));
 });
 it('sends annual cadence after choosing yearly on a pending local',async()=>{
  render(<Dashboard {...props()} leisure={[local]}/>);
  fireEvent.click(screen.getByRole('radio',{name:/Anual/}));
  expect(screen.getByText(/Un pago de 100 € ahora y renovación cada año/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Completar pago'}));
  await screen.findByRole('alert');
  expect(fetchMock).toHaveBeenCalledWith('/api/stripe/checkout',expect.objectContaining({body:JSON.stringify({mode:'business',businessType:'leisure',listingId:'local-one',interval:'year'})}));
 });
 it('defaults to monthly and allows changing back before paying',()=>{
  render(<Dashboard {...props()} leisure={[local]}/>);const monthly=screen.getByRole('radio',{name:/Mensual/}),annual=screen.getByRole('radio',{name:/Anual/});
  expect(monthly).toBeChecked();fireEvent.click(annual);expect(annual).toBeChecked();fireEvent.click(monthly);expect(monthly).toBeChecked();
 });
 it('does not offer annual billing for housing',()=>{
  render(<Dashboard {...props()} housing={[{id:'housing',title:'Piso',city:'Alicante',type:'room',price:400,images:null,is_paid:false,status:'active'}]}/>);
  expect(screen.queryByRole('radio',{name:/Anual/})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Completar pago'})).toBeEnabled();
  expect(fetchMock).not.toHaveBeenCalledWith('/api/negocio/housing-offer');
 });
 it('shows current annual subscription ahead of historical cancelled monthly rows',async()=>{
  const sub={id:'sub-year',type:'leisure' as const,listing_id:local.id,status:'active',current_period_end:'2027-09-09T12:00:00Z',stripe_subscription_id:'sub_stripe',billing_interval:'year' as const,amount_cents:10000,cancel_at_period_end:true};
  render(<Dashboard {...props()} leisure={[{...local,is_paid:true}]} subscriptions={[sub,{...sub,id:'sub-old',status:'canceled',billing_interval:'month',amount_cents:999}]}/>);
  expect(screen.getByText(/Tarifa base: 100,00.*año/)).toBeInTheDocument();expect(screen.getByText(/Activa hasta/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Completar pago'})).not.toBeInTheDocument();
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/stripe/invoices'));
 });
});
