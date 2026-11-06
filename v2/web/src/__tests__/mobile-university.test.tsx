import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { motionMock } from './helpers/mobile-motion-mock';

function deferred<T>() { let resolve!: (value: T) => void; const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve}; }
const courses=[{id:'degree-a',name:'Informática',branch:'ingenieria_arquitectura',campus:'Alcalá',cut_off_score:12.135,cut_off_year:2026},{id:'degree-b',name:'Enfermería',branch:'ciencias_salud',campus:'Guadalajara',cut_off_score:null,cut_off_year:2026,admission_without_cutoff:true}];

// Run the native screen and actual useFetch hook; mock only rendering and I/O.
function fixture(){
 let id='a';const push=vi.fn();const router={push};
 const getUniversity=vi.fn(async (value:string)=>({id:value,slug:`uni-${value}`,name:`Universidad ${value}`,city:'Madrid',type:'publica',description:`Descripción ${value}`,website:'https://example.org'}));
 const getCareers=vi.fn(async()=>({rows:courses,live:true}));
 const Box=({children}:any)=><div>{children}</div>;
 const Btn=({label,onPress}:any)=><button onClick={onPress}>{label}</button>;
 const kit={Card:Box,Pill:({label}:any)=><span>{label}</span>,Stat:({label,value}:any)=><span>{label}: {value}</span>,Btn,
  Tap:({children,onPress,accessibilityLabel}:any)=><button aria-label={accessibilityLabel} onClick={onPress}>{children}</button>,
  Chip:({label,onPress,active,accessibilityRole}:any)=><button role={accessibilityRole??'button'} aria-selected={!!active} onClick={onPress}>{label}</button>,
  EmptyState:({title,subtitle,cta,onCta}:any)=><div>{title}<p>{subtitle}</p>{cta&&<button onClick={onCta}>{cta}</button>}</div>,
  SectionHeader:({title,subtitle}:any)=><div><h2>{title}</h2><p>{subtitle}</p></div>,
  NavRow:({title,onPress}:any)=><button onClick={onPress}>{title}</button>,Skeleton:()=>null,SkeletonList:()=> <p>Cargando carreras</p>,
  SearchBar:({value,onChange,placeholder}:any)=><input type="search" aria-label={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>,
 };
 const mocks:Record<string,any>={
  '@/lib/academic-analytics': { trackAcademicConsultation: vi.fn(async () => {}) },
  react:{...React,default:React},'react/jsx-runtime':jsx,
  'react-native':{View:Box,Text:({children}:any)=><span>{children}</span>,ScrollView:Box,Linking:{openURL:vi.fn().mockResolvedValue(undefined)}},
  'expo-router':{useRouter:()=>router,useLocalSearchParams:()=>({id})},'expo-image':{Image:()=>null},
  'lucide-react-native':new Proxy({},{get:()=>()=>null}),
  '@/components/Screen':{Screen:({children,ListHeaderComponent,ListEmptyComponent,data,renderItem}:any)=><div>{children}{ListHeaderComponent}{data?.length?data.map((item:any,index:number)=><React.Fragment key={item.id}>{renderItem({item,index})}</React.Fragment>):ListEmptyComponent}</div>},
  '@/components/ui':kit,'@/lib/api':{getUniversity,getCareers},'@/lib/university-gallery':{UNIVERSITY_GALLERIES:{}},
  '@/components/Lightbox':{Lightbox:({uri,onClose}:any)=>uri?<div role="dialog" aria-label="Imagen del campus"><span>{uri}</span><button onClick={onClose}>Cerrar imagen</button></div>:null},
  '@/lib/format':{branchLabel:{ciencias_salud:'Salud',ingenieria_arquitectura:'Ingeniería'}},'@/lib/a11y':{MAX_FONT_SCALE:1.6},'@/lib/toast':{toastError:vi.fn()},
  '@/theme':{C:{},F:{},S:{},R:{},FONT:{}},
  '@react-native-async-storage/async-storage':{default:{getItem:vi.fn().mockResolvedValue(null),setItem:vi.fn().mockResolvedValue(undefined)}},
  './net':{reportOnline:vi.fn(),reportMaybeOffline:vi.fn()},'./supabase':{supabase:{}},
 };
 const loaded=new Map<string,any>();
 function load(file:string):any{
  const path=resolve(file);if(loaded.has(path))return loaded.get(path);
  const mod={exports:{}};loaded.set(path,mod.exports);
  const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(source,{exports:mod.exports,module:mod,console,Date,URL,require:(name:string)=>{
   if(name in mocks)return mocks[name];
   if(name.startsWith('@/lib/'))return load(`../mobile/src/lib/${name.slice(6)}.ts`);
   // Módulos movidos a v2/shared: el re-export de src/lib los importa por ruta relativa.
   if(name.startsWith('.'))return load(resolve(dirname(path),`${name}.ts`));
   if(name==='@/components/motion'||name==='./motion')return motionMock; throw Error(`Unexpected import ${name}`);
  }},{filename:path});return mod.exports;
 }
 const Page=load('../mobile/app/uni/[id].tsx').default;
 return {Page,push,getUniversity,getCareers,setId:(value:string)=>{id=value;},setGallery:(slug:string,images:string[])=>{mocks['@/lib/university-gallery'].UNIVERSITY_GALLERIES[slug]={images,label:'Recreaciones con IA',author:'Autor',reference:'https://example.org/reference',license:'CC BY-SA',licenseUrl:'https://example.org/license'};}};
}

describe('Native university discovery',()=>{
 it('opens the selected campus image and closes it without losing the university content',async()=>{
  const f=fixture();f.setGallery('uni-a',['https://example.org/first.webp','https://example.org/second.webp']);
  render(<f.Page/>);await screen.findByText('Universidad a');
  fireEvent.click(screen.getByRole('button',{name:'Ampliar recreación con IA 2 de Universidad a'}));
  expect(screen.getByRole('dialog').textContent).toContain('https://example.org/second.webp');
  fireEvent.click(screen.getByRole('button',{name:'Cerrar imagen'}));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('searchbox')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Ampliar recreación con IA 2 de Universidad a'})).toBeInTheDocument();
 });
 it('does not carry an open gallery into another university',async()=>{
  const f=fixture();f.setGallery('uni-a',['https://example.org/first.webp']);
  const view=render(<f.Page/>);await screen.findByText('Universidad a');
  fireEvent.click(screen.getByRole('button',{name:'Ampliar recreación con IA 1 de Universidad a'}));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  f.setId('b');view.rerender(<f.Page/>);await screen.findByText('Universidad b');
  expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('shows exact institutional figures and their source without inventing a period',async()=>{
  const f=fixture();
  f.getUniversity.mockResolvedValueOnce({id:'a',slug:'uni-a',name:'Universidad a',city:'Madrid',type:'publica',description:'Descripción a',website:'https://example.org',student_count:25202,campus_count:4,
   institutional_sources:{student_count:{reference_value:25202,checked_at:'2026-09-06',sources:[{title:'Recuento oficial UC3M',url:'https://www.uc3m.es/conocenos'}]}}} as any);
  render(<f.Page/>);await screen.findByText('Universidad a');
  expect(screen.getByText('Estudiantes')).toBeInTheDocument();
  expect(screen.getByText('25.202')).toBeInTheDocument();
  expect(screen.getByText('Periodo no documentado')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Recuento oficial UC3M'})).toBeInTheDocument();
 });
 it('does not attribute an edited description to its old official source or to Wikipedia',async()=>{
  const f=fixture();
  f.getUniversity.mockResolvedValueOnce({id:'a',slug:'uni-a',name:'Universidad a',city:'Madrid',type:'publica',description:'Descripción editada',website:'https://example.org',wiki_link:'https://es.wikipedia.org/wiki/Universidad',
   institutional_sources:{description:{reference_value:'Descripción anterior',checked_at:'2026-09-06',sources:[{title:'Fuente de la descripción anterior',url:'https://www.uc3m.es/conocenos'}]}}} as any);
  render(<f.Page/>);await screen.findByText('Universidad a');
  expect(screen.queryByText('Fuente de la descripción anterior')).not.toBeInTheDocument();
  expect(screen.queryByText('Texto adaptado de Wikipedia')).not.toBeInTheDocument();
  expect(screen.getByText('Fuente de esta descripción pendiente de comprobar.')).toBeInTheDocument();
 });
 it('opens directly in study choices and keeps the FOMO destination',async()=>{
  const f=fixture();render(<f.Page/>);
  await screen.findByRole('searchbox');
  expect(screen.getByRole('heading',{name:'Grados'})).toBeInTheDocument();
  expect(screen.getByText('Descripción a')).toBeInTheDocument();
  expect(await screen.findByText('12,135')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ver su FOMO'}));
  expect(f.push).toHaveBeenCalledWith({pathname:'/fomo-uni/[id]',params:{id:'a',name:'Universidad a'}});
 });
 it('preserves study filters when opening and closing the campus gallery',async()=>{
  const f=fixture();f.setGallery('uni-a',['https://example.org/first.webp']);render(<f.Page/>);await screen.findByText('12,135');
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'informatica alcala'}});

  expect(screen.getByText('Descripción a')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ampliar recreación con IA 1 de Universidad a'}));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Cerrar imagen'}));
  expect(screen.getByRole('searchbox')).toHaveValue('informatica alcala');
  expect(screen.getByText('12,135')).toBeInTheDocument();
  expect(screen.queryByText('Sin corte')).not.toBeInTheDocument();
 });
 it('combines campus and branch and allows clearing an empty result',async()=>{
  const f=fixture();render(<f.Page/>);await screen.findByText('12,135');
  fireEvent.click(screen.getByRole('button',{name:'Guadalajara'}));
  fireEvent.click(screen.getByRole('button',{name:'Ingeniería'}));
  expect(screen.getByText('No hay resultados')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button',{name:'Quitar filtros'})[0]);
  expect(screen.getByText('12,135')).toBeInTheDocument();
  expect(screen.getByText('Sin corte')).toBeInTheDocument();
 });
 it('does not show courses from A under B while the new catalogue is loading',async()=>{
  const f=fixture();const delayed=deferred<any>();
  f.getCareers.mockResolvedValueOnce({rows:courses,live:true}).mockReturnValueOnce(delayed.promise);
  const view=render(<f.Page/>);await screen.findByText('12,135');
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'informatica'}});
  f.setId('b');view.rerender(<f.Page/>);
  await screen.findByText('Universidad b');
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(screen.queryByText('12,135')).not.toBeInTheDocument();
  expect(screen.getByText('Cargando carreras')).toBeInTheDocument();
  await act(async()=>delayed.resolve({rows:[{...courses[0],id:'new',name:'Oferta B',cut_off_score:9.789}],live:true}));
  expect(await screen.findByText('9,789')).toBeInTheDocument();
 });
 it('shows a catalogue failure and retry rather than a zero-result claim',async()=>{
  const f=fixture();f.getCareers.mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({rows:courses,live:true});
  render(<f.Page/>);await screen.findByText('No se cargaron las carreras');
  expect(screen.queryByText(/0 ofertas encontradas/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));
  await screen.findByText('12,135');expect(f.getCareers).toHaveBeenCalledTimes(2);
 });
 it('ignores a university response after navigation to another university',async()=>{
  const f=fixture();const delayed=deferred<any>();f.getUniversity.mockReturnValueOnce(delayed.promise);
  const view=render(<f.Page/>);await waitFor(()=>expect(f.getUniversity).toHaveBeenCalledTimes(1));
  f.setId('b');view.rerender(<f.Page/>);await screen.findByText('Universidad b');
  await act(async()=>delayed.resolve({id:'a',name:'Universidad a',slug:'uni-a'}));
  expect(screen.queryByText('Universidad a')).not.toBeInTheDocument();
 });
});
