import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { motionMock } from './helpers/mobile-motion-mock';

function deferred<T>() { let resolve!: (value:T)=>void;let reject!: (value:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }
const spot=(city:string)=>({id:city,name:`Café de ${city}`,city,category:'cafeteria',tagline:'Charlas junto al campus',price_range:1,rating:4.4,owner_id:null});
type Reply={rows:ReturnType<typeof spot>[];total:number|null;hasMore:boolean};
type Filters={city:string;category:string;free:boolean;query:string};
const page=(rows:ReturnType<typeof spot>[]):Reply=>({rows,total:rows.length,hasMore:false});

// Actual discovery, refresh notice and public hook; only native rendering and
// external I/O are replaced. Reject HTML intrinsics that cannot mount natively.
function fixture(){
 let uid='user-a';const push=vi.fn();const router={push};
 // The screen now asks the server for one filtered page at a time; this fake
 // server applies the same filters (city, category, free) to its catalogue.
 const listLeisureSpotsPage=vi.fn(async(f:Filters,_page:number):Promise<Reply>=>page([spot(f.city||'España')].filter(s=>(!f.category||s.category===f.category)&&(!f.free||s.price_range===0))));
 const Box=({children}:any)=><div>{children}</div>;
 const Tap=({children,onPress,accessibilityLabel,accessibilityRole,accessibilityState,disabled}:any)=><button role={accessibilityRole} aria-checked={accessibilityState?.checked} aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>{children}</button>;
 const nativeJsx=(type:any,props:any,key:any)=>{if(typeof type==='string')throw Error(`Unsupported native HTML: ${type}`);return jsx.jsx(type,props,key);};
 const mocks:Record<string,any>={
  react:{...React,default:React},'react/jsx-runtime':{...jsx,jsx:nativeJsx,jsxs:nativeJsx},
  'react-native':{Pressable:Tap,Modal:Box,KeyboardAvoidingView:Box,Platform:{OS:'ios'},useWindowDimensions:()=>({width:390,fontScale:1}),FlatList:({data,renderItem,ListEmptyComponent}:any)=><div>{data.length?data.map((item:any)=><React.Fragment key={item.value}>{renderItem({item})}</React.Fragment>):ListEmptyComponent}</div>,View:Box,Text:({children}:any)=><span>{children}</span>,ScrollView:Box,TextInput:({accessibilityLabel,value,onChangeText}:any)=><input aria-label={accessibilityLabel} value={value} onChange={e=>onChangeText(e.target.value)}/>},
  'expo-linear-gradient':{LinearGradient:Box},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'expo-router':{useRouter:()=>router},'expo-image':{Image:()=>null},'lucide-react-native':new Proxy({},{get:()=>()=>null}),
  '@/components/Screen':{Screen:({data,renderItem,ListHeaderComponent,ListEmptyComponent,ListFooterComponent,right,onRefresh,refreshing}:any)=><div><div>{right}</div><button onClick={onRefresh}>Actualizar lista</button><p>{refreshing?'Recargando':'En reposo'}</p>{ListHeaderComponent}{data.length?data.map((item:any)=><React.Fragment key={item.id}>{renderItem({item})}</React.Fragment>):ListEmptyComponent}{ListFooterComponent}</div>},
  '@/components/ui':{Tap,Btn:({label,onPress,disabled}:any)=><button disabled={disabled} onClick={onPress}>{label}</button>,SearchBar:({value,onChange,placeholder}:any)=><input aria-label={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>,Chip:({label,onPress,active}:any)=><button aria-pressed={active} onClick={onPress}>{label}</button>,SkeletonList:()=> <p>Cargando sitios</p>,EmptyState:({title,subtitle,cta,onCta}:any)=><div>{title}<p>{subtitle}</p>{cta&&<button onClick={onCta}>{cta}</button>}</div>},
  '@/lib/api':{},'@/lib/leisure-pages':{listLeisureSpotsPage,getLeisureCitiesCached:vi.fn(async()=>['Madrid','Sevilla']),resolveMyLeisureCity:vi.fn(async()=>'Madrid'),foldText:(v:string)=>v.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim()},
  '@/lib/useSessionIdentity':{useSessionIdentity:()=>({uid})},'@/lib/format':{typeLabel:{}},'@/lib/a11y':{MAX_FONT_SCALE:1.6,useReduceMotion:()=>true},'@/theme':{C:{},F:{},S:{},R:{},FONT:{}},
  '@react-native-async-storage/async-storage':{default:{getItem:vi.fn(async()=>null),setItem:vi.fn(async()=>{}),removeItem:vi.fn(async()=>{})}},
  './net':{reportOnline:vi.fn(),reportMaybeOffline:vi.fn()},'./supabase':{supabase:{}},
 };
 const loaded=new Map<string,any>();
 function load(file:string):any{
  const path=resolve(file);if(loaded.has(path))return loaded.get(path);const module={exports:{}};loaded.set(path,module.exports);
  const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(source,{module,exports:module.exports,console,Date,setTimeout,clearTimeout,require:(name:string)=>{
   if(name in mocks)return mocks[name];if(name==='@/components/motion'||name==='./motion')return motionMock;if(name.startsWith('@/lib/'))return load(`../mobile/src/lib/${name.slice(6)}.ts`);if(name.startsWith('@/components/'))return load(`../mobile/src/components/${name.slice(13)}.tsx`);if(name.startsWith('.'))return load(resolve(dirname(path),name+'.ts')); throw Error(name);
  }},{filename:path});return module.exports;
 }
 return {Page:load('../mobile/src/components/LeisureDiscovery.tsx').default,listLeisureSpotsPage,push,setUser:(value:string)=>{uid=value;}};
}

it('renders the native title without HTML and opens the selected place',async()=>{
 const f=fixture();render(<f.Page/>);expect(await screen.findByText('Café de Madrid')).toBeInTheDocument();
 expect(screen.getByText('Un sitio para cada plan.')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Descubrir Café de Madrid, Madrid'}));expect(f.push).toHaveBeenCalledWith('/ocio/Madrid');
});

it('replaces city results, handles failure and retries the selected city',async()=>{
 const f=fixture();const delayed=deferred<Reply>();render(<f.Page/>);await screen.findByText('Café de Madrid');
 f.listLeisureSpotsPage.mockImplementationOnce(()=>delayed.promise);
 fireEvent.click(screen.getByRole('button',{name:/^Filtros/}));fireEvent.click(screen.getByRole('button',{name:/^Ciudad:/}));fireEvent.click(screen.getByRole('radio',{name:'Sevilla'}));fireEvent.click(screen.getByRole('button',{name:'Ver resultados'}));
 expect(screen.queryByText('Café de Madrid')).not.toBeInTheDocument();expect(screen.getByText('Cargando sitios')).toBeInTheDocument();
 await act(async()=>delayed.reject(Error('offline')));expect(screen.getByText('No pudimos cargar los sitios')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));expect(await screen.findByText('Café de Sevilla')).toBeInTheDocument();expect(f.listLeisureSpotsPage).toHaveBeenLastCalledWith(expect.objectContaining({city:'Sevilla'}),0);
});

it('keeps cached places visible, shows refresh progress and provides a clear recovery',async()=>{
 const f=fixture();render(<f.Page/>);await screen.findByText('Café de Madrid');const delayed=deferred<Reply>();
 f.listLeisureSpotsPage.mockImplementationOnce(()=>delayed.promise);fireEvent.click(screen.getByRole('button',{name:'Actualizar lista'}));
 expect(screen.getByText('Recargando')).toBeInTheDocument();expect(screen.getByText('Café de Madrid')).toBeInTheDocument();
 await act(async()=>delayed.reject(Error('offline')));expect(screen.getByText(/Estás viendo los últimos datos guardados/)).toBeInTheDocument();
 const retry=deferred<Reply>();f.listLeisureSpotsPage.mockImplementationOnce(()=>retry.promise);fireEvent.click(screen.getByRole('button',{name:'Actualizar datos guardados'}));
 expect(screen.getByRole('button',{name:'Actualizar datos guardados'})).toBeDisabled();
 await act(async()=>retry.resolve(page([spot('Madrid actualizado')])));expect(screen.queryByText(/Estás viendo los últimos datos guardados/)).not.toBeInTheDocument();expect(screen.getByText('Café de Madrid actualizado')).toBeInTheDocument();
});

it('applies price and category together, clears them and retains category across cities',async()=>{
 const f=fixture();render(<f.Page/>);await screen.findByText('Café de Madrid');
 fireEvent.click(screen.getByRole('button',{name:/^Filtros/}));
 fireEvent.click(screen.getByRole('button',{name:/^Precio:/}));fireEvent.click(screen.getByRole('radio',{name:'Solo sitios gratis'}));
 fireEvent.click(screen.getByRole('button',{name:'Ver resultados'}));expect(await screen.findByText('Prueba otro plan')).toBeInTheDocument();
 fireEvent.click(screen.getAllByRole('button',{name:'Limpiar filtros'})[0]);await screen.findByText('Café de España');
 fireEvent.click(screen.getByRole('button',{name:/^Filtros/}));fireEvent.click(screen.getByRole('button',{name:/^Tipo de plan:/}));fireEvent.click(screen.getByRole('radio',{name:'Café y charla'}));
 fireEvent.click(screen.getByRole('button',{name:/^Ciudad:/}));fireEvent.click(screen.getByRole('radio',{name:'Sevilla'}));fireEvent.click(screen.getByRole('button',{name:'Ver resultados'}));
 await screen.findByText('Café de Sevilla');expect(screen.getByRole('button',{name:'Filtros, 2 activos'})).toBeInTheDocument();
});

it('cancels draft filters without changing results and resets the draft explicitly',async()=>{
 const f=fixture();render(<f.Page/>);await screen.findByText('Café de Madrid');
 fireEvent.click(screen.getByRole('button',{name:/^Filtros/}));fireEvent.click(screen.getByRole('button',{name:/^Precio:/}));fireEvent.click(screen.getByRole('radio',{name:'Solo sitios gratis'}));
 expect(screen.getByText('Café de Madrid')).toBeInTheDocument();fireEvent.click(screen.getAllByRole('button',{name:'Cerrar filtros sin aplicar'})[0]);
 expect(screen.getByRole('button',{name:'Filtros, 1 activos'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/^Filtros/}));fireEvent.click(screen.getByRole('button',{name:'Restablecer filtros'}));fireEvent.click(screen.getByRole('button',{name:'Ver resultados'}));
 await screen.findByText('Café de España');expect(screen.getByRole('button',{name:'Filtros'})).toBeInTheDocument();
});

it('an account change discards an in-flight screen before resolving the next city',async()=>{
 const f=fixture();const late=deferred<Reply>();f.listLeisureSpotsPage.mockImplementationOnce(()=>late.promise);
 const view=render(<f.Page/>);await waitFor(()=>expect(f.listLeisureSpotsPage).toHaveBeenCalledTimes(1));f.setUser('user-b');view.rerender(<f.Page/>);
 await screen.findByText('Café de Madrid');await act(async()=>late.resolve(page([spot('Ciudad anterior')])));expect(screen.queryByText('Café de Ciudad anterior')).not.toBeInTheDocument();
});
