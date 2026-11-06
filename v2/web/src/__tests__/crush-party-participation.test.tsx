import React from 'react';
// External-contact safety has dedicated social-demo-link tests.
vi.mock('@/components/SocialDemoNotice', () => ({ SocialInstagramLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PartyClient from '../app/crush/fiesta/PartyClient';
import { PARTY_DEMO } from '../app/crush/fiesta/model';
const f = vi.hoisted(() => ({ request:vi.fn(), isCurrent:()=>true, state:null as any, posts:[] as any[], key:'a:1', confirm:vi.fn(), failPost:false, holdPost:null as Promise<any>|null }));
vi.mock('@/components/ui/confirm-dialog',()=>({useConfirm:()=>f.confirm}));
// These tests start with the community terms already accepted. The terms
// helper has separate tests for cancellation and account changes.
vi.mock('@/lib/community-terms-client',()=>({ensureCommunityTerms:async()=>true}));
vi.mock('next/link', () => ({ default:({href,children,...props}:any) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/lib/supabase-client', () => ({ createClient:() => ({ from:() => { const builder:any = { select:()=>builder,eq:()=>builder,order:()=>builder,limit:()=>builder,abortSignal:()=>builder,then:(yes:any) => Promise.resolve({data:[{name:'Enfermería'}],error:null}).then(yes) }; return builder; }, rpc:() => { const promise:any = Promise.resolve({data:[],error:null}); promise.abortSignal = () => promise; return promise; } }) }));
vi.mock('../app/crush/fiesta/usePartyAccount', () => ({ usePartyAccount:() => ({ ready:true,userId:'account-a',key:f.key,isCurrent:f.isCurrent,request:f.request }) }));
vi.mock('../app/crush/fiesta/usePartyFeed', () => ({ usePartyFeed:() => ({ data:{party:PARTY_DEMO,posts:f.posts},loading:false,error:'' }) }));
const id='00000000-0000-4000-8000-000000000001';
const person = () => ({party:PARTY_DEMO,joined:true,eligible:true,posting_open:true,needs_birth_date:false,display_name:'Mar',ineligibility_reasons:[],my_post_ids:[],my_posts:[],profile:{full_name:'Mar Prueba',university_id:PARTY_DEMO.university_id,career:'Enfermería',instagram_handle:'cuenta_propia',birth_date:'2000-01-01',opted_in:true,role:'user'}});
const open = () => render(<PartyClient slug={PARTY_DEMO.slug} universities={[{id:PARTY_DEMO.university_id,name:PARTY_DEMO.university_name}]} />);
const send = () => fireEvent.submit(screen.getByRole('button',{name:'Publicar en Crush y en pantalla'}).closest('form')!);
beforeEach(() => {
  // Keep this participation fixture inside its event window after the real event ends.
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(PARTY_DEMO.starts_at));
  f.request.mockReset(); f.key='a:1'; f.state=person(); f.posts=[]; f.failPost=false; f.holdPost=null; f.confirm.mockReset().mockReturnValue(true); vi.stubGlobal('confirm',f.confirm);
  f.request.mockImplementation(async (url:string,body:any) => {
    if(url.endsWith('/state')) return f.state;
    if(url.endsWith('/join')) { f.state={...f.state,joined:true,eligible:true,needs_birth_date:false,profile:{...f.state.profile,career:body.career,instagram_handle:body.instagram_handle}}; return {ok:true}; }
    if(url.endsWith('/posts')) { if(f.holdPost) return f.holdPost; if(f.failPost) throw new Error('Conexión interrumpida.'); return {id,available:true}; }
    if(url.endsWith('/action')) return {matched:true,instagram_handle:'match_privado',message:'¡Es un match!'};
    throw new Error('Unexpected request');
  });
});
describe('Party participant controls use explicit consent and protect retries', () => {
  it('starts anonymous without public Instagram or screen consent selected', async () => {
    open(); await screen.findByLabelText('Tu mensaje');
    expect(screen.getByRole('button',{name:'En anónimo'})).toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('checkbox',{name:/Compartir mi Instagram/})).not.toBeChecked();
    expect(screen.getByRole('checkbox',{name:/Quiero publicar este mensaje/})).not.toBeChecked();
  });
  it('sharing an Instagram chooses named publication, and switching back clears sharing', async () => {
    open(); await screen.findByLabelText('Tu mensaje');
    const sharing=screen.getByRole('checkbox',{name:/Compartir mi Instagram/}); fireEvent.click(sharing);
    expect(screen.getByRole('button',{name:'Con mi nombre'})).toHaveAttribute('aria-pressed','true'); expect(screen.getByText(/En pantallas: Mar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'En anónimo'})); expect(sharing).not.toBeChecked();
  });
  it('reuses the same request ID after a network failure but changes it when the draft changes', async () => {
    f.failPost=true; open(); const input=await screen.findByLabelText('Tu mensaje'); fireEvent.change(input,{target:{value:'Un hola para la fiesta'}}); fireEvent.click(screen.getByRole('checkbox',{name:/Quiero publicar este mensaje/}));
    send(); await screen.findByText('Conexión interrumpida.'); const first=f.request.mock.calls.find(([url])=>url.endsWith('/posts'))![1];
    send(); await waitFor(()=>expect(f.request.mock.calls.filter(([url])=>url.endsWith('/posts'))).toHaveLength(2));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Publicar en Crush y en pantalla'})).not.toBeDisabled());
    expect(f.request.mock.calls.filter(([url])=>url.endsWith('/posts'))[1][1].client_request_id).toBe(first.client_request_id);
    fireEvent.change(input,{target:{value:'Otro mensaje diferente'}}); send();
    await waitFor(()=>expect(f.request.mock.calls.filter(([url])=>url.endsWith('/posts'))).toHaveLength(3));
    const third=f.request.mock.calls.filter(([url])=>url.endsWith('/posts'))[2][1]; expect(third.client_request_id).not.toBe(first.client_request_id); expect(third).toMatchObject({is_anonymous:true,share_instagram:false,screen_consent:true});
  });
  it('does not send duplicate requests while a publication is awaiting confirmation', async () => {
    let resolve!:(value:any)=>void; f.holdPost=new Promise(yes=>{resolve=yes;}); open(); fireEvent.change(await screen.findByLabelText('Tu mensaje'),{target:{value:'Un solo mensaje'}}); const form=screen.getByLabelText('Tu mensaje').closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form); await waitFor(()=>expect(f.request.mock.calls.filter(([url])=>url.endsWith('/posts'))).toHaveLength(1));
    resolve({id,available:true}); await screen.findByText(/¡Publicado!/); expect(screen.getByRole('checkbox',{name:/Quiero publicar este mensaje/})).not.toBeChecked();
  });
  it('loads existing basics and does not ask again for a known birth date', async () => {
    f.state={...person(),joined:false,eligible:false}; open(); await screen.findByText('Casi estás dentro.');
    expect(screen.getByLabelText('Tu carrera')).toHaveValue('Enfermería'); expect(screen.queryByLabelText('Fecha de nacimiento')).toBeNull(); expect(screen.getByRole('checkbox',{name:/Quiero activar mi perfil/})).not.toBeChecked();
  });
  it('preserves a draft through profile editing and asks again before sharing the changed Instagram', async () => {
    open(); const input=await screen.findByLabelText('Tu mensaje'); fireEvent.change(input,{target:{value:'Conservar este borrador'}});
    fireEvent.click(screen.getByRole('checkbox',{name:/Compartir mi Instagram/})); fireEvent.click(screen.getByRole('checkbox',{name:/Quiero publicar este mensaje/}));
    fireEvent.click(screen.getByRole('button',{name:'Mis datos'})); await screen.findByText('Casi estás dentro.');
    fireEvent.change(screen.getByLabelText(/Tu Instagram/),{target:{value:'otra_cuenta_propia'}}); fireEvent.click(screen.getByRole('checkbox',{name:/Quiero activar mi perfil/}));
    fireEvent.submit(screen.getByRole('button',{name:'Entrar y escribir'}).closest('form')!);
    await waitFor(()=>expect(screen.getByLabelText('Tu mensaje')).toBeVisible());
    expect(screen.getByLabelText('Tu mensaje')).toHaveValue('Conservar este borrador');
    expect(screen.getByRole('checkbox',{name:/Compartir mi Instagram/})).not.toBeChecked(); expect(screen.getByRole('checkbox',{name:/Quiero publicar este mensaje/})).not.toBeChecked();
  });
  it('clears the old draft when the account session changes', async () => {
    const view=open(); const input=await screen.findByLabelText('Tu mensaje'); fireEvent.change(input,{target:{value:'Borrador de la sesión anterior'}});
    f.key='b:2'; view.rerender(<PartyClient slug={PARTY_DEMO.slug} universities={[]} />);
    expect(await screen.findByLabelText('Tu mensaje')).toHaveValue('');
  });
  it('shows a private matched handle only in the requesting account view', async () => {
    f.posts=[{id,body:'Un mensaje de otra persona',display_name:null,instagram_handle:null,is_anonymous:true,created_at:'2026-09-06T11:00:00Z',reaction_count:0}];
    open(); fireEvent.click(await screen.findByRole('button',{name:'Pedir su Instagram'}));
    expect(await screen.findByRole('link',{name:/@match_privado/})).toHaveAttribute('href','https://www.instagram.com/match_privado/'); expect(screen.getByText(/Solo para ti/)).toBeInTheDocument();
  });
  it('offers withdrawal of own messages after the party closes, without a self-request button', async () => {
    f.state={...person(),party:{...PARTY_DEMO,active:false},posting_open:false,my_post_ids:[id],my_posts:[{id,body:'Mi mensaje anterior',created_at:'2026-09-06T11:00:00Z',is_anonymous:true,available:true}]};
    open(); await screen.findByText('El envío está cerrado.'); fireEvent.click(screen.getByText('Tus últimos mensajes'));
    fireEvent.click(screen.getByRole('button',{name:'Retirar mensaje'})); await waitFor(()=>expect(f.request).toHaveBeenCalledWith(expect.stringContaining('/action'),{post_id:id,action:'delete'})); expect(screen.queryByRole('button',{name:'Pedir su Instagram'})).toBeNull();
  });
});
