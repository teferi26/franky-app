import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const f=vi.hoisted(()=>({ user:'a', query:'', refresh:vi.fn(), getSession:vi.fn(), rpc:vi.fn(), listeners:new Set<(event:string,session:any)=>void>(), queries:[] as {name:string;authorization:string|null;signal?:AbortSignal}[] }));
vi.mock('@/lib/supabase-client',()=>({createClient:()=>({auth:{getSession:f.getSession,onAuthStateChange:(listener:(event:string,session:any)=>void)=>{f.listeners.add(listener);return{data:{subscription:{unsubscribe(){f.listeners.delete(listener);}}}};}},rpc:(name:string)=>{
 const record={name,authorization:null as string|null,signal:undefined as AbortSignal|undefined};
 const query={setHeader(_name:string,value:string){record.authorization=value;return query;},abortSignal(signal:AbortSignal){record.signal=signal;return query;},then(yes:Function,no:Function){f.queries.push(record);return Promise.resolve(f.rpc(name)).then(yes as any,no as any);}};return query;
}})}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:f.refresh}),useSearchParams:()=>new URLSearchParams(f.query)}));
vi.mock('next/link',()=>({default:({children,href}:{children:React.ReactNode;href:string})=><a href={href}>{children}</a>}));
vi.mock('../app/eventos/components/event-shirt-size',()=>({default:()=>null}));
import TicketPurchase from '../app/eventos/[id]/ticket-purchase';
const session=(id:string)=>({user:{id},access_token:`token-${id}`});
const props={eventId:'event',price:10,accountId:'a',isLoggedIn:true,isPast:false,isOrganizer:false,hasTicket:false,soldOut:false,connectStatus:'active' as const};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};}
beforeEach(()=>{f.user='a';f.query='';f.listeners.clear();f.queries=[];f.refresh.mockReset();f.getSession.mockReset().mockImplementation(async()=>({data:{session:session(f.user)}}));f.rpc.mockReset().mockImplementation(async(name:string)=>name==='check_discount_code'?{data:{valid:true,discount_cents:1000}}:{data:{ticket_id:'ticket-a'}});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({status:'pending'})})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function open(overrides:Partial<typeof props>={}){render(<TicketPurchase {...props} {...overrides}/>);return screen.findByRole('button',{name:/Comprar entrada|Conseguir entrada gratis/});}
it('does not claim a paid ticket from a return URL',async()=>{f.query='ticket=ok';await open();expect(screen.queryByText('Tienes tu entrada')).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'Revisar Mis entradas'})).toHaveAttribute('href','/mis-entradas');});
it('pins authorization on reservation and checkout and rejects double clicks',async()=>{
 const button=await open(),pending=deferred<any>();f.rpc.mockReturnValueOnce(pending.promise);fireEvent.click(button);fireEvent.click(button);
 await waitFor(()=>expect(f.queries.filter(q=>q.name==='reserve_event_ticket')).toHaveLength(1));expect(f.queries[0].authorization).toBe('Bearer token-a');
 await act(async()=>pending.resolve({data:{ticket_id:'ticket-a'}}));await screen.findByText(/El pago sigue pendiente/);
 expect(fetch).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledWith('/api/stripe/pay/ticket',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer token-a'})}));
});
it('keeps the same quote and reservation after a network failure',async()=>{
 const button=await open();fireEvent.change(screen.getByLabelText('¿Tienes un código?'),{target:{value:'FREE'}});fireEvent.click(screen.getByRole('button',{name:'Aplicar'}));await screen.findByText(/Código FREE/);
 vi.mocked(fetch).mockRejectedValueOnce(new Error('network'));fireEvent.click(button);await screen.findByText(/No se pudo confirmar el pago/);expect(screen.getByRole('button',{name:'Quitar'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Conseguir entrada gratis'}));await screen.findByText(/El pago sigue pendiente/);
 expect(f.queries.filter(q=>q.name==='reserve_event_ticket')).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(2);
 for(const [url,options] of vi.mocked(fetch).mock.calls){expect(url).toBe('/api/stripe/pay/ticket');expect(JSON.parse(String(options?.body))).toEqual({ticket_id:'ticket-a',code:'FREE'});}
});
it('shows paid only from the authenticated response, including a free response with relative URL',async()=>{
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({status:'paid',free:true,url:'/mis-entradas'})} as Response);
 fireEvent.click(await open());await screen.findByText('Tienes tu entrada');expect(fetch).toHaveBeenCalledTimes(1);expect(f.refresh).toHaveBeenCalled();
});
it('invalidates an in-flight reservation immediately on account change before React rerenders',async()=>{
 const button=await open(),pending=deferred<any>();f.rpc.mockReturnValueOnce(pending.promise);fireEvent.click(button);
 await waitFor(()=>expect(f.queries).toHaveLength(1));const signal=f.queries[0].signal;
 await act(async()=>{f.user='b';for(const listener of f.listeners)listener('SIGNED_IN',session('b'));expect(signal?.aborted).toBe(true);pending.resolve({data:{ticket_id:'ticket-a'}});});
 expect(fetch).not.toHaveBeenCalled();expect(screen.queryByText('Tienes tu entrada')).not.toBeInTheDocument();await screen.findByText('Actualizando tu sesión…');
});
it('does not reserve for B when A waits on session credentials',async()=>{
 const button=await open(),pending=deferred<any>();f.getSession.mockReturnValueOnce(pending.promise);fireEvent.click(button);
 await act(async()=>pending.resolve({data:{session:session('b')}}));expect(f.queries).toHaveLength(0);expect(fetch).not.toHaveBeenCalled();
});
it('suppresses stale paid response after logout',async()=>{
 const button=await open(),pending=deferred<any>();vi.mocked(fetch).mockReturnValueOnce(pending.promise);fireEvent.click(button);await waitFor(()=>expect(fetch).toHaveBeenCalled());
 const signal=vi.mocked(fetch).mock.calls[0][1]?.signal;
 await act(async()=>{for(const listener of f.listeners)listener('SIGNED_OUT',null);expect(signal?.aborted).toBe(true);pending.resolve({ok:true,json:async()=>({status:'paid'})});});
 expect(screen.queryByText('Tienes tu entrada')).not.toBeInTheDocument();
});
it('rejects untrusted checkout hosts without cancelling the reservation',async()=>{
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({status:'checkout',url:'https://attacker.invalid/pay'})} as Response);
 fireEvent.click(await open());await screen.findByText(/El pago sigue pendiente/);expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not reuse another account’s server rendered ticket ownership',async()=>{
 f.user='b';render(<TicketPurchase {...props} hasTicket/>);await screen.findByText('Actualizando tu sesión…');expect(screen.queryByText('Tienes tu entrada')).not.toBeInTheDocument();await waitFor(()=>expect(f.refresh).toHaveBeenCalled());
});
it('shows a live reservation separately from a confirmed ticket',async()=>{
 render(<TicketPurchase {...props} pendingReservation/>);await screen.findByText(/Tienes una reserva pendiente/);expect(screen.queryByText('Tienes tu entrada')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/Comprar entrada/})).not.toBeInTheDocument();
});
it('permits only the exact established partner onboarding exception',async()=>{
 const location={href:'https://franky.es/eventos/event'};vi.stubGlobal('location',location);
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({url:'https://franky.es/api/partners/origin/connect'})} as Response);
 render(<TicketPurchase {...props} isOrganizer connectStatus="none"/>);fireEvent.click(await screen.findByRole('button',{name:'Conectar cobros'}));
 await waitFor(()=>expect(location.href).toBe('https://franky.es/api/partners/origin/connect'));
 expect(fetch).toHaveBeenCalledWith('/api/stripe/connect/onboard',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer token-a'})}));
});
