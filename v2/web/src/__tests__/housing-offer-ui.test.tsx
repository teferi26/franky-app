import React from 'react';
import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import OwnerPlan from '@/app/negocio/propietario/client';
import Dashboard from '@/app/negocio/dashboard/client';
import { HousingOfferStatus } from '@/app/negocio/components/housing-offer';
const fetchMock=vi.fn();
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'owner'},loading:false})}));
beforeEach(()=>{
 vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();
 fetchMock.mockImplementation(async(url:string)=>({ok:!url.includes('checkout'),json:async()=>url.includes('owner-status')?{active:false}:url.includes('housing-offer')?{offers:[]}:url.includes('invoices')?{invoices:[]}:{error:'Sin cobro en esta prueba'}}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('housing free-until-interest consent',()=>{
 it('defaults to the legacy owner trial without advertising or querying the disabled offer',async()=>{
  fetchMock.mockImplementation(async(url:string)=>({ok:!url.includes('checkout'),json:async()=>url.includes('owner-status')?{active:false,trialAvailable:true}:{error:'Sin cobro en esta prueba'}}));
  render(<OwnerPlan canceled={false}/>);
  const button=await screen.findByRole('button',{name:/Empezar prueba de 7 días/});
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();expect(screen.queryByText(/primer interesado/)).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalledWith('/api/negocio/housing-offer');fireEvent.click(button);
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/stripe/checkout',expect.objectContaining({body:JSON.stringify({mode:'owner',billing:'monthly'})})));
 });
 it('does not offer another free trial when the legacy account has used it',async()=>{
  fetchMock.mockImplementation(async()=>({ok:true,json:async()=>({active:false,trialAvailable:false})}));
  render(<OwnerPlan canceled={false}/>);await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/negocio/owner-status'));
  expect(screen.getByRole('button',{name:/Darme de alta/})).toBeEnabled();
  expect(screen.queryByText(/0 € hoy/)).not.toBeInTheDocument();expect(screen.queryByText(/primer interesado/)).not.toBeInTheDocument();
 });
 it('defaults to the individual listing contract without deferred consent',async()=>{
  render(<Dashboard leisure={[]} housing={[{id:'flat',title:'Piso de prueba',city:'Alicante',type:'room',price:400,images:null,is_paid:false,status:'active'}]} subscriptions={[]} ownerSub={null} success={false} published={false} ownerSuccess={false} canOwnerPanel={false}/>);
  fireEvent.click(screen.getByRole('button',{name:'Completar pago'}));
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/stripe/checkout',expect.objectContaining({body:JSON.stringify({mode:'business',businessType:'housing',listingId:'flat',interval:'month'})})));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();expect(fetchMock).not.toHaveBeenCalledWith('/api/negocio/housing-offer');
 });
 it('requires explicit consent for owner plans and clears it when the chosen price changes',async()=>{
  render(<OwnerPlan canceled={false} deferredHousingEnabled deferredHousingReady/>);
  const button=screen.getByRole('button',{name:/Guardar tarjeta · 0/});expect(button).toBeDisabled();
  expect(screen.getByText(/Hoy pagas 0/)).toHaveTextContent('80,00');
  const checkbox=screen.getByRole('checkbox');fireEvent.click(checkbox);expect(button).toBeEnabled();
  fireEvent.click(screen.getByRole('radio',{name:/primer trimestre/i}));expect(checkbox).not.toBeChecked();expect(button).toBeDisabled();
  expect(screen.getByText(/Hoy pagas 0/)).toHaveTextContent('192,00');
  fireEvent.click(checkbox);fireEvent.click(button);
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/stripe/checkout',expect.objectContaining({body:JSON.stringify({mode:'owner',billing:'quarterly',offerVersion:'first-interest-v1'})})));
 });
 it('sends deferred consent for an individual listing instead of charging immediately',async()=>{
  render(<Dashboard deferredHousingEnabled deferredHousingReady leisure={[]} housing={[{id:'flat',title:'Piso de prueba',city:'Alicante',type:'room',price:400,images:null,is_paid:false,status:'active'}]} subscriptions={[]} ownerSub={null} success={false} published={false} ownerSuccess={false} canOwnerPanel={false}/>);
  const button=screen.getByRole('button',{name:'Guardar tarjeta y publicar gratis'});expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/stripe/checkout',expect.objectContaining({body:JSON.stringify({mode:'business',businessType:'housing',listingId:'flat',interval:'month',offerVersion:'first-interest-v1'})})));
 });
 it('shows no billing date and allows canceling while still waiting for interest',async()=>{
  fetchMock.mockResolvedValue({ok:true,json:async()=>({offers:[{id:'offer',listing_id:null,billing:'monthly',state:'waiting',terms_text:'Condiciones',first_interest_at:null,payment_url:null}]})});
  render(<HousingOfferStatus/>);await screen.findByText(/Publicado gratis/);
  expect(screen.getByText(/No hay fecha de cobro/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Cancelar publicación gratis'})).toBeEnabled();
 });
 it('shows the bank confirmation link after an incomplete payment',async()=>{
  fetchMock.mockResolvedValue({ok:true,json:async()=>({offers:[{id:'offer',listing_id:null,billing:'monthly',state:'payment_required',terms_text:'Condiciones',first_interest_at:'2026-09-14',payment_url:'https://invoice.stripe.com/example'}]})});
  render(<HousingOfferStatus/>);await screen.findByRole('link',{name:'Completar pago en Stripe'});
  expect(screen.queryByRole('button',{name:'Cancelar publicación gratis'})).not.toBeInTheDocument();
 });
});
