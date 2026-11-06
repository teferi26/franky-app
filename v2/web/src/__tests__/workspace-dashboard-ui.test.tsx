import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const fixtures=vi.hoisted(()=>({permissions:['resource.read','content.manage','analytics.read'],requests:[] as {name:string;args:Record<string,unknown>}[]}));
vi.mock('@/lib/supabase-client',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'account'}}}),getSession:async()=>({data:{session:{user:{id:'account'},access_token:'test'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})}));
vi.mock('@/lib/env',()=>({clientEnv:{NEXT_PUBLIC_SUPABASE_URL:'https://test.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test'}}));
vi.mock('next/link',()=>({default:({children,href}:{children:React.ReactNode;href:string})=><a href={href}>{children}</a>}));
// Exercise the parent save boundary without duplicating the form's validation.
vi.mock('../app/espacios/workspace-resource-form',()=>({default:({onSave}:{onSave:(data:unknown,publish:boolean)=>Promise<void>})=><button onClick={()=>void onSave({title:'Piso editado'},false)}>Guardar edición</button>}));
vi.mock('../app/espacios/workspace-detail',()=>({default:()=> <div>Gestión del inmueble abierta</div>}));
import Dashboard from '../app/espacios/workspace-dashboard';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const resource={id,type:'housing',title:'Vivienda disponible',status:'draft',updated_at:'2026-09-22T12:00:00Z',data:{title:'Vivienda disponible'}};
beforeEach(()=>{localStorage.clear();fixtures.requests=[];fixtures.permissions=['resource.read','content.manage','analytics.read'];vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{const name=url.split('/').at(-1)!;const args=JSON.parse(String(options.body));fixtures.requests.push({name,args});const data=name==='get_workspace_access'?{enabled:true,can_create:false}:name==='list_my_workspaces'?[{id:'space',kind:'housing',name:'Mi inmobiliaria',status:'active',role:'owner',permissions:fixtures.permissions}]:name==='list_workspace_invitations'?[]:name==='get_workspace_dashboard'?{metrics:[],activity:[]}:name==='get_workspace_resources'?{items:[resource],next_cursor:null}:name==='save_workspace_resource'?resource:{};return{ok:true,json:async()=>data};}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('saving an existing resource sends its UUID, independently of the editor revision key',async()=>{
 render(<Dashboard/>);await screen.findByRole('heading',{name:'Mi inmobiliaria'});fireEvent.click(screen.getByRole('button',{name:'Pisos'}));fireEvent.click(await screen.findByText('Editar'));fireEvent.click(screen.getByText('Guardar edición'));
 await waitFor(()=>expect(fixtures.requests.find(r=>r.name==='save_workspace_resource')?.args).toMatchObject({p_resource_id:id,p_organization_id:'space',p_publish:false}));
});
it('an analyst can open housing metrics without receiving content editing controls',async()=>{
 fixtures.permissions=['resource.read','analytics.read'];render(<Dashboard/>);await screen.findByRole('heading',{name:'Mi inmobiliaria'});fireEvent.click(screen.getByRole('button',{name:'Pisos'}));fireEvent.click(await screen.findByText('Gestionar'));expect(screen.getByText('Gestión del inmueble abierta')).toBeInTheDocument();expect(screen.queryByText('Editar')).not.toBeInTheDocument();expect(screen.queryByText('Crear anuncio')).not.toBeInTheDocument();
});
