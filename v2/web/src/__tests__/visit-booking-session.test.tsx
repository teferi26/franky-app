import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const f=vi.hoisted(()=>({user:'a',listener:((_event:string,_session:any)=>{}) as (event:string,session:any)=>void,getSession:vi.fn(),rpc:vi.fn(),listeners:new Set<(event:string,session:any)=>void>(),queries:[] as {name:string;authorization:string|null;signal?:AbortSignal}[],toast:{success:vi.fn(),info:vi.fn(),error:vi.fn()}}));
vi.mock('@/lib/supabase-client',()=>({createClient:()=>({auth:{getSession:f.getSession,onAuthStateChange:(listener:typeof f.listener)=>{f.listeners.add(listener);return{data:{subscription:{unsubscribe(){f.listeners.delete(listener);}}}};}},rpc:(name:string)=>{
 const record={name,authorization:null as string|null,signal:undefined as AbortSignal|undefined};
 const query={setHeader(_name:string,value:string){record.authorization=value;return query;},abortSignal(signal:AbortSignal){record.signal=signal;return query;},then(yes:Function,no:Function){f.queries.push(record);return Promise.resolve(f.rpc(name)).then(yes as any,no as any);}};return query;
},from:()=>{const query={select(){return query;},eq(){return query;},in(){return query;},setHeader(){return query;},abortSignal(){return query;},then(yes:Function){return Promise.resolve({data:[]}).then(yes as any);}};return query;}})}));
vi.mock('@/components/ui/toast',()=>({useToast:()=>f.toast}));
vi.mock('next/link',()=>({default:({children,href}:{children:React.ReactNode;href:string})=><a href={href}>{children}</a>}));
import VisitBooking from '../app/alojamiento/[id]/components/visit-booking';
const session=(id:string)=>({user:{id},access_token:`token-${id}`});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};}
beforeEach(()=>{f.user='a';f.queries=[];f.listeners.clear();f.listener=(event,session)=>f.listeners.forEach(listener=>listener(event,session));for(const fn of Object.values(f.toast))fn.mockReset();f.getSession.mockReset().mockImplementation(async()=>({data:{session:session(f.user)}}));f.rpc.mockReset().mockImplementation(async(name:string)=>name==='get_bookable_visit_times'?{data:[{slot_id:'slot',slot_date:'2026-09-30',start_time:'12:00:00',end_time:'12:30:00',price_cents:500,available:2}]}:{data:{booking_id:'booking-a',requires_payment:true}});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({status:'pending'})})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function open(){render(<VisitBooking accommodationId="house" ownerId="owner"/>);return screen.findByRole('button',{name:/12:00/});}
it('pins bearer on both reservation and payment, and double clicks create one booking',async()=>{
 const button=await open(),reservation=deferred<any>();f.rpc.mockImplementationOnce(()=>reservation.promise);
 fireEvent.click(button);fireEvent.click(button);
 await waitFor(()=>expect(f.queries.filter(q=>q.name==='book_visit_slot')).toHaveLength(1));
 expect(f.queries.find(q=>q.name==='book_visit_slot')?.authorization).toBe('Bearer token-a');
 await act(async()=>reservation.resolve({data:{booking_id:'booking-a',requires_payment:true}}));
 expect(fetch).toHaveBeenCalledWith('/api/stripe/pay/visit',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer token-a'})}));
 await screen.findByText(/El pago sigue pendiente/);
});
it('never reserves for B when an action from A waits for session credentials',async()=>{
 const button=await open(),old=deferred<any>();f.getSession.mockReturnValueOnce(old.promise);fireEvent.click(button);
 await act(async()=>{f.user='b';f.listener('SIGNED_IN',session('b'));});
 await act(async()=>old.resolve({data:{session:session('b')}}));
 expect(f.queries.filter(q=>q.name==='book_visit_slot')).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();
});
it('does not start payment or show A notifications after changing account mid reservation',async()=>{
 const button=await open(),old=deferred<any>();f.rpc.mockImplementationOnce(()=>old.promise);fireEvent.click(button);
 await waitFor(()=>expect(f.queries.some(q=>q.name==='book_visit_slot')).toBe(true));const request=f.queries.find(q=>q.name==='book_visit_slot')!;
 await act(async()=>{f.user='b';f.listener('SIGNED_IN',session('b'));});expect(request.signal?.aborted).toBe(true);
 await act(async()=>old.resolve({data:{booking_id:'booking-a',requires_payment:true}}));expect(fetch).not.toHaveBeenCalled();expect(f.toast.success).not.toHaveBeenCalled();expect(f.toast.error).not.toHaveBeenCalled();
});
it('recognizes a confirmed payment without requiring a redirect URL',async()=>{
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({status:'paid',order_id:'order'})} as Response);
 fireEvent.click(await open());await waitFor(()=>expect(f.toast.success).toHaveBeenCalledWith('Pago confirmado',expect.any(String)));expect(f.toast.error).not.toHaveBeenCalled();
});
it('invalidates the payment immediately on auth change before React can unmount',async()=>{
 const payment=deferred<Response>();vi.mocked(fetch).mockReturnValueOnce(payment.promise);fireEvent.click(await open());await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
 const options=vi.mocked(fetch).mock.calls[0][1]!;
 await act(async()=>{
   f.listener('SIGNED_OUT',null);
   expect(options.signal?.aborted).toBe(true);
   payment.resolve({ok:true,json:async()=>({status:'paid'})} as Response);
 });
 expect(f.toast.success).not.toHaveBeenCalled();
});
it('retries the exact same booking after an uncertain payment, without another reservation',async()=>{
 vi.mocked(fetch).mockRejectedValueOnce(new Error('network'));
 const button=await open();fireEvent.click(button);await screen.findByText(/No se pudo confirmar el pago/);fireEvent.click(button);await screen.findByText(/El pago sigue pendiente/);
 expect(f.queries.filter(q=>q.name==='book_visit_slot')).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(2);
 for(const [,options] of vi.mocked(fetch).mock.calls)expect(JSON.parse(String(options?.body))).toEqual({booking_id:'booking-a'});
});
it('does not navigate to a non-Stripe URL advertised as checkout',async()=>{
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({status:'checkout',url:'https://attacker.invalid/checkout'})} as Response);
 fireEvent.click(await open());await screen.findByText(/El pago sigue pendiente/);expect(f.toast.success).not.toHaveBeenCalled();
});
