import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import WorkspaceModeration from '../app/espacios/workspace-moderation';
import {moderationPayload} from '../../../shared/workspace-moderation';

afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('institutional moderation decisions',()=>{
 it('requires a reason, bounded whole-day duration and an exact sanction decision',()=>{
  expect(()=>moderationPayload('remove','x','7')).toThrow();
  for(const days of ['0','366','1.5','-2','Infinity','1e2'])expect(()=>moderationPayload('sanction','Motivo explicado',days)).toThrow();
  expect(moderationPayload('sanction',' Motivo explicado ',null)).toEqual({reason:'Motivo explicado',duration_days:null});
  expect(()=>moderationPayload('lift_sanction','Motivo explicado','7')).toThrow();
  expect(moderationPayload('lift_sanction','Motivo explicado','7','decision-id')).toEqual({reason:'Motivo explicado',decision_id:'decision-id'});
 });
 it('shows protected restore state and sends removal with a stable retry key',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true);const keys:string[]=[];
  const rpc=vi.fn(async(name:string,args?:Record<string,unknown>)=>{if(name==='get_workspace_moderation_history')return{items:[],next_cursor:null,can_restore:false,target_state:'visible'};keys.push((args?.p_data as {client_request_id:string}).client_request_id);throw Error('Network unavailable');});
  render(<WorkspaceModeration organizationId="org" reportId="report" rpc={rpc} onChanged={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Revisar decisiones e historial'}));
  await screen.findByText('Estado: Visible');expect((screen.getByRole('button',{name:'Restaurar publicación'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Motivo de la decisión'),{target:{value:'El contenido infringe las normas'}});
  fireEvent.click(screen.getByRole('button',{name:'Retirar publicación'}));await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{name:'Retirar publicación'}));await waitFor(()=>expect(keys).toHaveLength(2));expect(keys[0]).toBe(keys[1]);
  expect(rpc).toHaveBeenCalledWith('workspace_resource_action',expect.objectContaining({p_organization_id:'org',p_resource_id:'report',p_action:'remove'}));
 });
 it('lifts a chosen anonymous sanction without sending an author identifier',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true);const rpc=vi.fn(async(name:string,_args?:Record<string,unknown>)=>name==='get_workspace_moderation_history'?{items:[{id:'decision',action:'sanction',reason:'Normas del campus',created_at:'2026-09-22T12:00:00Z',sanction_status:'active',sanction_expires_at:null,appeal_status:null}],next_cursor:null,can_restore:false,target_state:'visible'}:{});
  render(<WorkspaceModeration organizationId="org" reportId="report" rpc={rpc} onChanged={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Revisar decisiones e historial'}));await screen.findByText('Vigente sin fecha de fin');
  fireEvent.change(screen.getByLabelText('Motivo de la decisión'),{target:{value:'La situación se ha revisado'}});fireEvent.click(screen.getByRole('button',{name:'Levantar esta sanción'}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('workspace_resource_action',expect.objectContaining({p_action:'lift_sanction',p_data:expect.objectContaining({decision_id:'decision'})})));
  const args=rpc.mock.calls.find(c=>c[0]==='workspace_resource_action')?.[1];expect(JSON.stringify(args)).not.toContain('user_id');
 });
});
