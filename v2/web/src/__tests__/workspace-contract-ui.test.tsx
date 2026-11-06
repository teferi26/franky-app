import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import WorkspaceContract from '../app/espacios/workspace-contract';
import type {Workspace} from '../../../shared/workspaces';
const workspace={id:'org-a',kind:'housing',permissions:['finance.read','finance.manage'],demo_cohort_id:null} as Workspace;
const record={id:'contract-a',title:'Contrato de alquiler',status:'draft',answers:{},updated_at:'2026-09-22T12:00:00Z',demo:false,signers:[],eligible_tenants:[]};
afterEach(cleanup);
describe('professional contract editor',()=>{
 it('preserves an uncertain retry but assigns a new key when the submitted data changes',async()=>{
  const rpc=vi.fn().mockRejectedValue(new Error('network unavailable'));
  render(<WorkspaceContract workspace={workspace} resourceId="home-a" contractId={null} rpc={rpc} api={vi.fn()} onClose={vi.fn()} onChanged={vi.fn()}/>);
  fireEvent.click(screen.getByText('Guardar borrador'));await screen.findByRole('alert');
  const original=rpc.mock.calls[0][1];fireEvent.click(screen.getByText('Guardar borrador'));
  await waitFor(()=>expect(rpc).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.getByText('Guardar borrador')).not.toBeDisabled());
  expect(rpc.mock.calls[1][1].p_client_request_id).toBe(original.p_client_request_id);
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Contrato corregido'}});fireEvent.click(screen.getByText('Guardar borrador'));
  await waitFor(()=>expect(rpc).toHaveBeenCalledTimes(3));expect(rpc.mock.calls[2][1].p_client_request_id).not.toBe(original.p_client_request_id);
 });
 it('pins the saved revision and serializes a double click on a draft',async()=>{
  let finish!:(value:unknown)=>void;const rpc=vi.fn().mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  render(<WorkspaceContract workspace={workspace} resourceId="home-a" contractId={null} rpc={rpc} api={vi.fn()} onClose={vi.fn()} onChanged={vi.fn()}/>);
  const save=screen.getByText('Guardar borrador');fireEvent.click(save);fireEvent.click(save);expect(rpc).toHaveBeenCalledTimes(1);
  finish(record);await screen.findByText('Borrador guardado.');
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Nueva revisión'}});fireEvent.click(save);
  await waitFor(()=>expect(rpc).toHaveBeenCalledTimes(2));expect(rpc.mock.calls[1][1]).toMatchObject({p_contract_id:record.id,p_expected_updated_at:record.updated_at,p_title:'Nueva revisión'});
 });
 it('demo sending uses the isolated simulator and never invokes the real contract API',async()=>{
  const demo={...record,demo:true};const rpc=vi.fn().mockImplementation(name=>Promise.resolve(name==='workspace_contract_action'?{}:demo)),api=vi.fn();
  render(<WorkspaceContract workspace={{...workspace,demo_cohort_id:'demo-a'}} resourceId="home-a" contractId={demo.id} rpc={rpc} api={api} onClose={vi.fn()} onChanged={vi.fn()}/>);
  fireEvent.click(await screen.findByText('Simular envío a firma'));
  await waitFor(()=>expect(rpc).toHaveBeenCalledWith('workspace_contract_action',{p_organization_id:'org-a',p_contract_id:demo.id,p_action:'simulate_send'}));expect(api).not.toHaveBeenCalled();
 });
});
