import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const f=vi.hoisted(()=>({user:'a',listener:((_event:string,_session:any)=>{}) as (event:string,session:any)=>void,getUser:vi.fn(),getSession:vi.fn(),city:vi.fn()}));
vi.mock('@/lib/supabase-client',()=>({createClient:()=>({auth:{getUser:f.getUser,getSession:f.getSession,onAuthStateChange:(listener:typeof f.listener)=>{f.listener=listener;return{data:{subscription:{unsubscribe(){}}}};}},rpc:()=>({setHeader:async()=>({data:['a','b'].map(id=>({id,name:`Espacio ${id}`,kind:'community',permissions:['finance.read','finance.manage']}))})})})}));
vi.mock('@/lib/city-content-client',()=>({cityRequest:f.city}));
vi.mock('@/lib/env',()=>({clientEnv:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test'}}));
vi.mock('next/link',()=>({default:({children,href}:{children:React.ReactNode;href:string})=><a href={href}>{children}</a>}));
import Dashboard from '../app/espacios/workspace-dashboard';
import EventLifecycleManager from '../components/workspaces/EventLifecycleManager';
import GrowthDashboard from '../components/GrowthDashboard';
import CampaignManager from '../components/CampaignManager';
import {useAccountScope} from '../hooks/useAccountScope';
function deferred<T>() { let resolve!: (value:T)=>void; let reject!: (reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject}; }
const session=(id:string|null)=>id?{user:{id},access_token:`token-${id}`}:null;
const event=(title:string,more=false)=>({event:{title},permissions:{content:false,finance:false,attendees:true},templates:[],waitlist:{items:[{id:'one',name:'Primera persona',eligible:true}],next_cursor:more?{id:'one',created_at:'2026-09-22T12:00:00Z'}:null},refunds:{items:[],next_cursor:null},cancellation:null});
beforeEach(()=>{
 f.user='a';f.getUser.mockReset().mockImplementation(async()=>({data:{user:{id:f.user}}}));f.getSession.mockReset().mockImplementation(async()=>({data:{session:session(f.user)}}));f.city.mockReset();localStorage.clear();
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{const name=url.split('/').at(-1),owner=String((options.headers as Record<string,string>).Authorization).slice(13);const data=name==='get_workspace_access'?{enabled:true,can_create:true}:name==='list_my_workspaces'?[{id:owner,kind:'housing',name:`Espacio ${owner}`,permissions:['resource.read','content.manage'],role:'owner'}]:name==='list_workspace_invitations'?[{id:`invite-${owner}`,organization_name:`Invitación ${owner}`,role:'editor'}]:name==='get_workspace_dashboard'?{metrics:[],activity:[]}:name==='get_workspace_resources'?{items:[],next_cursor:null}:{};return{ok:true,json:async()=>data};}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function AccountProbe(){const account=useAccountScope();return <p>{`${account.userId??'anonymous'}:${account.revision}:${account.ready}`}</p>;}
it('account scope ignores a stale initial session and invalidates same-UID logout/login',async()=>{
 const old=deferred<any>();f.getSession.mockReturnValueOnce(old.promise);render(<AccountProbe/>);
 await act(async()=>f.listener('SIGNED_IN',session('b')));expect(screen.getByText('b:1:true')).toBeInTheDocument();
 await act(async()=>old.resolve({data:{session:session('a')}}));expect(screen.getByText('b:1:true')).toBeInTheDocument();
 await act(async()=>{f.listener('SIGNED_OUT',null);f.listener('SIGNED_IN',session('b'));});expect(screen.getByText('b:3:true')).toBeInTheDocument();
 await act(async()=>f.listener('TOKEN_REFRESHED',session('b')));expect(screen.getByText('b:3:true')).toBeInTheDocument();
});
it('a failed initial session read resolves the loading state safely',async()=>{
 f.getSession.mockRejectedValueOnce(new Error('session unavailable'));render(<AccountProbe/>);await screen.findByText('anonymous:0:true');
});
it('a delayed getUser from A cannot overwrite B bootstrap identity',async()=>{
 const old=deferred<any>();f.getUser.mockReturnValueOnce(old.promise);render(<Dashboard/>);
 await act(async()=>{f.user='b';f.listener('SIGNED_IN',session('b'));});await screen.findByRole('heading',{name:'Espacio b'});
 await act(async()=>old.resolve({data:{user:{id:'a'}}}));fireEvent.click(screen.getByRole('button',{name:'Pisos'}));
 await waitFor(()=>expect(fetch).toHaveBeenCalledWith(expect.stringContaining('get_workspace_resources'),expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer token-b'})})));
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('changing account immediately removes invitations and an unsaved creation dialog',async()=>{
 render(<Dashboard/>);await screen.findByText('Invitación a · Editor');fireEvent.click(screen.getByRole('button',{name:'Crear espacio'}));expect(screen.getByRole('dialog')).toBeInTheDocument();
 const pending=deferred<any>();f.getUser.mockReturnValueOnce(pending.promise);
 await act(async()=>{f.user='b';f.listener('SIGNED_IN',session('b'));});expect(screen.queryByText('Invitación a · Editor')).not.toBeInTheDocument();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('switching activity discards the old response and hides its controls immediately',async()=>{
 const old=deferred<any>();f.city.mockImplementation((url:string)=>url.includes('resource=a')?old.promise:Promise.resolve(event('Actividad B')));
 const page=render(<EventLifecycleManager organizationId="org" resourceId="a"/>);await waitFor(()=>expect(f.city).toHaveBeenCalled());
 page.rerender(<EventLifecycleManager organizationId="org" resourceId="b"/>);await screen.findByRole('heading',{name:'Actividad B'});
 await act(async()=>old.resolve(event('Actividad A')));expect(screen.queryByRole('heading',{name:'Actividad A'})).not.toBeInTheDocument();expect(screen.getByRole('heading',{name:'Actividad B'})).toBeInTheDocument();
});
it('double clicking pagination performs one request and appends each attendee once',async()=>{
 const page=deferred<any>();f.city.mockImplementation((url:string)=>url.includes('&waitAt=')?page.promise:Promise.resolve(event('Actividad',true)));
 render(<EventLifecycleManager organizationId="org" resourceId="a"/>);const more=await screen.findByRole('button',{name:'Cargar más'});fireEvent.click(more);fireEvent.click(more);
 expect(f.city.mock.calls.filter(([url])=>url.includes('&waitAt='))).toHaveLength(1);
 await act(async()=>page.resolve({...event('Actividad'),waitlist:{items:[{id:'two',name:'Segunda persona',eligible:true}],next_cursor:null}}));expect(screen.getAllByText('Segunda persona · Pendiente')).toHaveLength(1);
});
it('a pending growth mutation cannot block the new account or repopulate its form',async()=>{
 const old=deferred<any>();const snapshot={enabled:true,demo:false,balance:0,code:null,referrals:{pending:0,approved:0,activated:0},rewards:[],redemptions:[],ledger:[],creator:null,content:[],commissions:[],tariffs:[]};
 f.city.mockImplementation((_url:string,body:any,_signal:any,owner:string)=>body&&owner==='a'?old.promise:Promise.resolve(snapshot));
 render(<GrowthDashboard creators/>);await screen.findByRole('button',{name:'Enviar propuesta'});
 fireEvent.change(screen.getByPlaceholderText('Enlaces a tus perfiles, comunidad o portfolio'),{target:{value:'Cuenta de A'}});
 fireEvent.change(screen.getByPlaceholderText('Qué quieres contar, a quién y cómo encaja con Franky'),{target:{value:'Propuesta de colaboración de A'}});
 fireEvent.click(screen.getByRole('button',{name:'Enviar propuesta'}));
 await act(async()=>{f.user='b';f.listener('SIGNED_IN',session('b'));});const submit=await screen.findByRole('button',{name:'Enviar propuesta'});
 expect(screen.getByPlaceholderText('Enlaces a tus perfiles, comunidad o portfolio')).toHaveValue('');expect(submit).not.toBeDisabled();
 await act(async()=>old.resolve({ok:true}));expect(screen.getByPlaceholderText('Enlaces a tus perfiles, comunidad o portfolio')).toHaveValue('');
});
it('a campaign request from the old workspace cannot unlock a pending request in the new workspace',async()=>{
 const old=deferred<any>(),next=deferred<any>();const snapshot={metrics:{views:0,opens:0,period:'Periodo'},posts:[],items:[{id:'campaign',title:'Campaña',status:'active',starts_at:'2026-09-22',ends_at:'2026-09-24',budget_cents:1000,spent_cents:0}]};
 f.city.mockImplementation((_url:string,body:any)=>body?(body.organizationId==='a'?old.promise:next.promise):Promise.resolve(snapshot));
 render(<CampaignManager/>);await act(async()=>f.listener('SIGNED_IN',session('a')));fireEvent.click(await screen.findByRole('button',{name:'Pausar'}));
 fireEvent.change(screen.getByLabelText('Espacio'),{target:{value:'b'}});const pause=await screen.findByRole('button',{name:'Pausar'});expect(pause).not.toBeDisabled();fireEvent.click(pause);
 await act(async()=>old.resolve({ok:true}));expect(pause).toBeDisabled();fireEvent.click(pause);
 expect(f.city.mock.calls.filter(([,body])=>body?.organizationId==='b')).toHaveLength(1);
 await act(async()=>next.resolve({ok:true}));
});
