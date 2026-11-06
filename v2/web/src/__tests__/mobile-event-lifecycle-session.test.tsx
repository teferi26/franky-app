import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};};
function fixture(){
 let resource='a';let confirm:(()=>void)|undefined;
 const active={id:'org'},isCurrent=()=>true;
 const data=()=>({event:{title:`Actividad ${resource}`},permissions:{content:false,finance:false,attendees:true},templates:[],waitlist:{items:[],next_cursor:{id:'one',created_at:'2026-09-22'}},refunds:{items:[],next_cursor:null},cancellation:{can_cancel:true,cancelled:false}});
 const run=vi.fn(async(name:string):Promise<any>=>name==='get_workspace_event_lifecycle'?data():{});
 const Block=({children}:any)=><div>{children}</div>;
 const Input=({accessibilityLabel,onChangeText,value}:any)=><input aria-label={accessibilityLabel} value={value} onChange={e=>onChangeText(e.target.value)}/>;
 const Btn=({label,onPress,disabled}:any)=><button onClick={onPress} disabled={disabled}>{label}</button>;
 const load=nativeLoader({react:{...React,default:React},'react/jsx-runtime':jsx,
   'react-native':{ActivityIndicator:Block,Platform:{OS:'ios'},View:Block,Text:Block,TextInput:Input,Alert:{alert:(_title:string,_body:string,buttons:any[])=>{confirm=buttons.at(-1).onPress;}}},
   '@react-native-community/datetimepicker':{default:Block},
   'expo-router':{Redirect:Block,useFocusEffect:(fn:()=>void)=>React.useEffect(fn,[fn]),useLocalSearchParams:()=>({resource})},
   '@/components/Screen':{Screen:Block},'@/components/ui':{Btn,Card:Block,Chip:Btn},
   '@/components/WorkspaceProvider':{useWorkspace:()=>({active,ready:true,revision:1,run,isCurrent})},
   '@/lib/tap':{newTapKey:async()=> 'request'},'@/theme':{C:{},F:{}},
 });
 const Page=load('../mobile/app/espacio-actividad-gestion.tsx').default;
 return{Page,run,data,switchResource(){resource='b';},confirm(){confirm?.();}};
}
afterEach(cleanup);
it('a cancellation dialog from the previous event cannot act after navigation within the same workspace',async()=>{
 const f=fixture(),page=render(<f.Page/>);await screen.findByText('Actividad a');
 fireEvent.change(screen.getByLabelText('Motivo de cancelación o devolución'),{target:{value:'Cambio de programación'}});fireEvent.click(screen.getByRole('button',{name:'Cancelar actividad'}));
 f.switchResource();page.rerender(<f.Page/>);await screen.findByText('Actividad b');await act(async()=>f.confirm());
 expect(f.run.mock.calls.filter(([name])=>name==='workspace_event_lifecycle_action')).toHaveLength(0);
});
it('native pagination prevents two simultaneous reads for the same cursor',async()=>{
 const f=fixture(),pending=deferred<any>();render(<f.Page/>);const more=await screen.findByRole('button',{name:'Cargar más'});
 f.run.mockImplementationOnce(()=>pending.promise);fireEvent.click(more);fireEvent.click(more);expect(f.run).toHaveBeenCalledTimes(2);
 await act(async()=>pending.resolve({...f.data(),waitlist:{items:[{id:'two',name:'Persona nueva',eligible:true}],next_cursor:null}}));expect(screen.getAllByText('Persona nueva · Pendiente')).toHaveLength(1);
});
