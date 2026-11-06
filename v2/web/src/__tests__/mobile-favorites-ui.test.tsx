import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { motionMock } from './helpers/mobile-motion-mock';

const deferred=<T,>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};};
const favorite=(id='uni-a')=>({type:'university',id,title:`Guardado ${id}`,subtitle:'Madrid',image:null,savedAt:1});
const post=(id='post-a')=>({id,body:id,media_url:null,media_type:null,is_anonymous:true,created_at:'2026-09-06'});
const homes=[{id:'piso-a',title:'Piso A',city:'Madrid',price:400,type:'habitacion',images:[]},{id:'piso-b',title:'Piso B',city:'Madrid',price:500,type:'habitacion',images:[]}];
const slot={slot_id:'slot-a',slot_date:'2026-09-10',start_time:'10:00:00',end_time:'11:00:00',price_cents:100,available:2};

function fixture({ earlyPass = false } = {}){
 const mountAction = { enabled: earlyPass, used: false };
 let identity:{userId:string;generation:number}|null={userId:'A',generation:1};let params:any={};const listeners=new Set<()=>void>();
 const session={captureSessionIdentity:()=>identity,isCurrentSessionIdentity:(value:any)=>!!identity&&value?.userId===identity.userId&&value.generation===identity.generation,onSessionIdentityChange:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);}};
 const router={push:vi.fn()};const alerts:any[][]=[];
 const toast={toast:vi.fn(),toastError:vi.fn(),toastInfo:vi.fn()};
 const favs={getCachedFavs:vi.fn(async(..._args:any[])=>[] as any[]),getFavs:vi.fn(async(..._args:any[])=>[favorite()]),removeFav:vi.fn(async(..._args:any[])=>({ok:true})),addFav:vi.fn(async(..._args:any[])=>({ok:true,alreadySaved:false})),getPassed:vi.fn(async(..._args:any[])=>[] as string[]),addPassed:vi.fn(async(..._args:any[])=>{}),clearPassed:vi.fn(async(..._args:any[])=>{}),removeLastPassed:vi.fn(async(..._args:any[])=>'piso-a')};
 const api={getSavedFomoThreads:vi.fn(async(..._args:any[])=>[post()]),getLikedFomoThreads:vi.fn(async(..._args:any[])=>[post('liked-a')]),unsaveFomoThread:vi.fn(async(..._args:any[])=>({ok:true})),getAccommodationCities:vi.fn(async()=>['Madrid','Alicante']),getMyCity:vi.fn(async()=> 'Madrid'),getAccommodations:vi.fn(),getEvents:vi.fn(),getSpot:vi.fn(async()=>({id:'spot-a',name:'Lugar A',category:'cultural',city:'Madrid',details:{},images:[],image_url:null}))};
 const housing={getBookableVisitTimes:vi.fn(async(..._args:any[])=>[slot]),bookVisit:vi.fn(async(..._args:any[])=>({ok:true,bookingId:'booking-a',requiresPayment:true,priceCents:100})),payVisit:vi.fn(async(..._args:any[])=>({ok:true,status:'paid'})),requestAccommodationContact:vi.fn(async(..._args:any[])=>({ok:true})),likeAccommodation:vi.fn()};
 const Box=({children,accessible}:any)=><div aria-hidden={accessible===false?true:undefined}>{children}</div>;
 const Tap=({children,onPress,onLongPress,accessibilityLabel,accessibilityRole,accessibilityState,disabled}:any)=>{
  React.useLayoutEffect(()=>{
   if(mountAction.enabled&&!mountAction.used&&!disabled&&accessibilityLabel==='Pasar'){
    mountAction.used=true;onPress?.();
   }
  },[]);
  return <div role={accessibilityRole??'button'} tabIndex={0} aria-label={accessibilityLabel} aria-selected={accessibilityState?.selected} aria-busy={accessibilityState?.busy} aria-disabled={!!disabled} onClick={()=>{if(!disabled)onPress?.();}} onContextMenu={event=>{event.preventDefault();if(!disabled)onLongPress?.();}}>{children}</div>;
 };
 const Btn=({label,onPress,disabled,busy}:any)=><button disabled={disabled||busy} onClick={onPress}>{label}</button>;
 const kit={Tap,Btn,Chip:({label,onPress,active,accessibilityRole}:any)=><button role={accessibilityRole??'button'} aria-selected={!!active} onClick={onPress}>{label}</button>,
  EmptyState:({title,subtitle,cta,onCta}:any)=><div>{title}<p>{subtitle}</p>{cta&&<button onClick={onCta}>{cta}</button>}</div>,Skeleton:()=>null,Pill:({label}:any)=><span>{label}</span>,IconCircle:()=>null};
 class ValueXY {x={interpolate:()=>0};y=0;setValue(){}stopAnimation(){}}
 const animation=()=>({start:(done:any)=>done?.({finished:true})});
 const native={View:Box,Text:({children}:any)=><span>{children}</span>,ScrollView:Box,Modal:({visible,children}:any)=>visible?<div role="dialog">{children}</div>:null,Pressable:Tap,ActivityIndicator:()=> <span>Cargando</span>,Alert:{alert:(...args:any[])=>alerts.push(args)},useWindowDimensions:()=>({width:390,height:844}),LayoutAnimation:{configureNext:vi.fn(),Presets:{}},Animated:{View:Box,ValueXY,timing:animation,spring:animation,event:()=>()=>{}},PanResponder:{create:()=>({panHandlers:{}})},Platform:{OS:'ios'},Linking:{openURL:vi.fn()},RefreshControl:()=>null};
 const event={id:'event-a',title:'Evento A',city:'Madrid',category:'cultural',price:0,start_date:'2026-09-10T10:00:00Z',status:'upcoming',image_url:null};
 const mocks:Record<string,any>={
  react:{...React,default:React},'react/jsx-runtime':jsx,'react-native':native,'expo-router':{useRouter:()=>router,useLocalSearchParams:()=>params},'expo-image':{Image:()=>null},'expo-linear-gradient':{LinearGradient:Box},'expo-constants':{default:{expoConfig:{}}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:0,top:0,left:0,right:0})},'expo-haptics':{selectionAsync:vi.fn(async()=>{}),impactAsync:vi.fn(async()=>{}),notificationAsync:vi.fn(async()=>{}),ImpactFeedbackStyle:{Light:'light',Medium:'medium'},NotificationFeedbackType:{Success:'success'}},
  'lucide-react-native':new Proxy({},{get:()=>()=>null}),'@/theme':{C:{},F:{},S:{},R:{},FONT:{},BRAND_GRADIENT:['#fff','#000'],SHADOW:{}},
  '@/lib/session':session,'./session':session,'@/lib/favs':favs,'@/lib/api':api,'@/lib/housing':housing,'@/lib/toast':toast,'@/lib/a11y':{MAX_FONT_SCALE:1.6,useReduceMotion:()=>true},'@/lib/format':{eur:(value:number)=>`${value} €`,typeLabel:{habitacion:'Habitación',cultural:'Cultural'},dateLong:()=> '10 septiembre'},
  '@/lib/social-moderation':{useSocialModerationRefresh:()=>{},confirmSocialAction:vi.fn()},
  '@/components/ui':kit,'./ui':kit,'@/components/motion':motionMock,'./motion':motionMock,'@/components/GridTile':{GridTile:({body}:any)=><span>{body}</span>},'@/components/HomeSwitch':{ViviendaSwitch:()=>null},'@/components/HousingSearchAlert':{default:()=>null,recordHousingSearch:vi.fn()},'@/components/CatalogueRefreshNotice':{default:()=>null},'@/components/EventsMap':{EventsMap:()=>null},
  '@/components/Screen':{Header:({title,right}:any)=><div>{title}{right}</div>,Screen:({children,title,ListHeaderComponent,ListEmptyComponent,data,renderItem,onRefresh,refreshing}:any)=><div>{title}{children}{onRefresh&&<button aria-label="Actualizar" data-refreshing={!!refreshing} onClick={onRefresh}>Actualizar</button>}{ListHeaderComponent}{data?.length?data.map((item:any,index:number)=><React.Fragment key={item.id}>{renderItem({item,index})}</React.Fragment>):ListEmptyComponent}</div>},
  '@/lib/useFetch':{useFetch:(_fetch:any,key:string)=>({rows:key==='events'?[event]:homes,loading:false,error:null,refreshing:false,refreshError:false,refresh:vi.fn()})},
 };
 Object.assign(api, {getMyUniversity:vi.fn(async()=>({id:'uni',name:'Universidad'})),getThreads:vi.fn(async()=>({rows:[{...post('old-post'),reaction_count:0,comment_count:0},{...post('new-post'),reaction_count:0,comment_count:0}],live:true})),getSavedFomoThreadIds:vi.fn(async()=>new Set<string>()),saveFomoThread:vi.fn(async()=>({ok:true}))});
 const query:any={select:()=>query,eq:()=>query,limit:()=>query,then:(yes:any)=>Promise.resolve({data:[],error:null}).then(yes)};
 Object.assign(mocks,{'@/lib/owned-request':{withOwnedRequest:async(_owner:any,work:any)=>work({query:(value:any)=>value})},'@/lib/supabase':{supabase:{from:()=>query,auth:{getSession:async()=>({data:{session:identity?{user:{id:identity.userId}}:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}}},'@/lib/social':{toggleFollow:vi.fn()},'@/lib/admin':{getStaffRole:vi.fn(async()=>null)},'@/lib/monitoring':{captureError:vi.fn()},'@/lib/spaces':{SPACES:[]},'@/lib/i18n':{t:(key:string)=>key}});
 Object.assign(kit,{Avatar:()=>null,SearchBar:()=>null,OptionsSheet:()=>null});
 Object.assign(mocks['@/lib/format'],{timeAgo:()=> 'Ahora'});
 Object.assign(mocks['@/components/HomeSwitch'],{HomeSwitch:()=>null});
 Object.assign(mocks['react-native'].Animated,{Value:class {setValue(){}interpolate(){return 0;}}});
 mocks['@/components/fomo']={AudioNote:()=>null,ThreadPoll:()=>null,RichText:()=>null,SendPostSheet:()=>null};
 for (const name of ['VideoPlayer','StoriesBar','CampusBoardIntro','DiscoverChecklist','TodayStrip','Lightbox']) mocks[`@/components/${name}`]={[name]:()=>null};
 // La tarjeta de Franky Card del feed tira de la API de Card (red y almacenamiento nativo); aquí no se prueba.
 mocks['@/components/card/CardPromo']={CardPromo:()=>null,CardPromoIfEligible:()=>null};
 const modules=new Map<string,any>();
 function load(file:string):any{
  const path=resolve(file);if(modules.has(path))return modules.get(path);const mod={exports:{}};modules.set(path,mod.exports);
  const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(source,{module:mod,exports:mod.exports,console,Date,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,require:(name:string)=>{
   if(name in mocks)return mocks[name];
   if(name.startsWith('@/lib/'))return load(`../mobile/src/lib/${name.slice(6)}.ts`);
   if(name.startsWith('@/components/'))return load(`../mobile/src/components/${name.slice(13)}.tsx`);
   if(name.startsWith('.'))return load(resolve(dirname(path),name+'.ts'));
   if(name==='@/components/motion'||name==='./motion')return motionMock; throw Error(name);
  }},{filename:path});return mod.exports;
 }
 return {page:(path:string)=>load(`../mobile/${path}`),favs,api:api as typeof api & {getSavedFomoThreadIds:ReturnType<typeof vi.fn>;saveFomoThread:ReturnType<typeof vi.fn>;getMyUniversity:ReturnType<typeof vi.fn>},housing,toast,router,alerts,setParams:(value:any)=>{params=value;},switchUser:(userId:string|null)=>{identity=userId?{userId,generation:(identity?.generation??0)+1}:null;listeners.forEach(fn=>fn());}};
}

describe('Native favorites screen ownership and errors',()=>{
 it('clears private rows immediately on account change and ignores the old response',async()=>{
  const f=fixture();const Page=f.page('app/favoritos.tsx').default;const old=deferred<any>();
  f.favs.getFavs.mockReturnValueOnce(old.promise).mockResolvedValueOnce([favorite('uni-b')]);
  render(<Page/>);await waitFor(()=>expect(f.favs.getFavs).toHaveBeenCalledTimes(1));
  act(()=>f.switchUser('B'));await screen.findByText('Guardado uni-b');
  await act(async()=>old.resolve([favorite('uni-a')]));expect(screen.queryByText('Guardado uni-a')).toBeNull();
 });
 it('keeps a failed removal visible and suppresses duplicate clicks',async()=>{
  const f=fixture();const Page=f.page('app/favoritos.tsx').default;const remote=deferred<any>();f.favs.removeFav.mockReturnValueOnce(remote.promise);
  render(<Page/>);const remove=await screen.findByRole('button',{name:'Quitar Guardado uni-a de guardados'});
  act(()=>{fireEvent.click(remove);fireEvent.click(remove);});expect(f.favs.removeFav).toHaveBeenCalledTimes(1);expect(screen.getByText('Guardado uni-a')).toBeInTheDocument();
  await act(async()=>remote.resolve({ok:false}));expect(screen.getByText('Guardado uni-a')).toBeInTheDocument();expect(f.toast.toast).not.toHaveBeenCalled();
 });
 it('keeps a removal when an older refresh resolves afterwards',async()=>{
  const f=fixture();const Page=f.page('app/favoritos.tsx').default;const old=deferred<any>();render(<Page/>);await screen.findByText('Guardado uni-a');
  f.favs.getFavs.mockReturnValueOnce(old.promise);fireEvent.click(screen.getByRole('button',{name:'Actualizar'}));
  fireEvent.click(screen.getByRole('button',{name:'Quitar Guardado uni-a de guardados'}));await waitFor(()=>expect(screen.queryByText('Guardado uni-a')).toBeNull());
  await act(async()=>old.resolve([favorite()]));expect(screen.queryByText('Guardado uni-a')).toBeNull();
 });
 it('shows a saved-post failure with retry, not an empty collection',async()=>{
  const f=fixture();const Page=f.page('app/favoritos.tsx').default;f.api.getSavedFomoThreads.mockRejectedValueOnce(Error('offline'));render(<Page/>);
  fireEvent.click(screen.getByRole('tab',{name:'Publicaciones'}));await screen.findByText('No se pudo cargar lo guardado');expect(screen.queryByText('Aún no has guardado nada')).toBeNull();
  fireEvent.click(screen.getAllByRole('button',{name:'Reintentar'})[0]);await screen.findByText('post-a');
 });
 it('rejects an old unsave confirmation after switching accounts',async()=>{
  const f=fixture();const Page=f.page('app/favoritos.tsx').default;render(<Page/>);fireEvent.click(screen.getByRole('tab',{name:'Publicaciones'}));
  fireEvent.contextMenu(await screen.findByRole('button',{name:'Publicación: post-a'}));const confirm=f.alerts[0][2].find((button:any)=>button.text==='Quitar').onPress;
  act(()=>f.switchUser('B'));await act(async()=>confirm());expect(f.api.unsaveFomoThread).not.toHaveBeenCalled();
 });
 it('keeps pull-to-refresh busy until the active private list finishes',async()=>{
  const f=fixture();const Page=f.page('app/favoritos.tsx').default;render(<Page/>);fireEvent.click(screen.getByRole('tab',{name:'Publicaciones'}));await screen.findByText('post-a');
  const pending=deferred<any>();f.api.getSavedFomoThreads.mockReturnValueOnce(pending.promise);fireEvent.click(screen.getByRole('button',{name:'Actualizar'}));
  await act(async()=>{});expect(screen.getByRole('button',{name:'Actualizar'})).toHaveAttribute('data-refreshing','true');
  await act(async()=>pending.resolve([post()]));expect(screen.getByRole('button',{name:'Actualizar'})).toHaveAttribute('data-refreshing','false');
 });
});

describe('Native housing choices and booking dialogs',()=>{
 it('saving a piso never contacts its owner or opens a reservation prompt',async()=>{
  const f=fixture();const Page=f.page('app/pisos.tsx').default;render(<Page/>);fireEvent.click(await screen.findByRole('button',{name:'Guardar piso'}));
  await screen.findByText(/2 de 2/);expect(f.favs.addFav).toHaveBeenCalledTimes(1);expect(f.housing.likeAccommodation).not.toHaveBeenCalled();expect(f.housing.requestAccommodationContact).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('does not advance the deck when saving fails',async()=>{
  const f=fixture();f.favs.addFav.mockResolvedValueOnce({ok:false,alreadySaved:false});const Page=f.page('app/pisos.tsx').default;render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:'Guardar piso'}));await waitFor(()=>expect(f.toast.toastError).toHaveBeenCalled());expect(screen.getByText(/1 de 2/)).toBeInTheDocument();
 });
 it('does not undo the card when the server rejects favorite removal',async()=>{
  const f=fixture();f.favs.removeFav.mockResolvedValueOnce({ok:false});const Page=f.page('app/pisos.tsx').default;render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:'Guardar piso'}));await screen.findByText(/2 de 2/);fireEvent.click(screen.getByRole('button',{name:'Deshacer el último swipe'}));
  await waitFor(()=>expect(f.toast.toastError).toHaveBeenCalled());expect(screen.getByText(/2 de 2/)).toBeInTheDocument();
 });
 it('undo preserves a favorite that was already saved before the gesture',async()=>{
  const f=fixture();f.favs.addFav.mockResolvedValueOnce({ok:true,alreadySaved:true});const Page=f.page('app/pisos.tsx').default;render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:'Guardar piso'}));await screen.findByText(/2 de 2/);fireEvent.click(screen.getByRole('button',{name:'Deshacer el último swipe'}));
  await screen.findByText(/1 de 2/);expect(f.favs.removeFav).not.toHaveBeenCalled();
 });
 it('does not execute an old paid-slot confirmation after closing and reopening the sheet',async()=>{
  const f=fixture();const Sheet=f.page('src/components/VisitBookingSheet.tsx').VisitBookingSheet;const props={visible:true,accommodation:{id:'piso-a',title:'Piso A'},onClose:vi.fn()};const view=render(<Sheet {...props}/>);
  fireEvent.click(await screen.findByRole('button',{name:/Reservar el .*10:00/}));const confirm=f.alerts[0][2].find((button:any)=>button.text==='Continuar').onPress;
  view.rerender(<Sheet {...props} visible={false}/>);view.rerender(<Sheet {...props}/>);await act(async()=>confirm());expect(f.housing.bookVisit).not.toHaveBeenCalled();
 });
 it('does not start payment after the booking sheet has closed during a reservation',async()=>{
  const f=fixture();const pending=deferred<any>();f.housing.bookVisit.mockReturnValueOnce(pending.promise);const Sheet=f.page('src/components/VisitBookingSheet.tsx').VisitBookingSheet;const props={visible:true,accommodation:{id:'piso-a',title:'Piso A'},onClose:vi.fn()};const view=render(<Sheet {...props}/>);
  fireEvent.click(await screen.findByRole('button',{name:/Reservar el .*10:00/}));await act(async()=>f.alerts[0][2].find((button:any)=>button.text==='Continuar').onPress());
  view.rerender(<Sheet {...props} visible={false}/>);expect(f.housing.bookVisit.mock.calls[0][3].aborted).toBe(true);
  await act(async()=>pending.resolve({ok:true,bookingId:'booking-a',requiresPayment:true,priceCents:100}));expect(f.housing.payVisit).not.toHaveBeenCalled();
 });
 it('replaces slots when opening another property and ignores the previous response',async()=>{
  const f=fixture();const old=deferred<any>();f.housing.getBookableVisitTimes.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{...slot,slot_id:'slot-b',start_time:'12:00:00'}]);
  const Sheet=f.page('src/components/VisitBookingSheet.tsx').VisitBookingSheet;const props={visible:true,accommodation:{id:'piso-a',title:'Piso A'},onClose:vi.fn()};const view=render(<Sheet {...props}/>);
  view.rerender(<Sheet {...props} accommodation={{id:'piso-b',title:'Piso B'}}/>);await screen.findByRole('button',{name:/Reservar el .*12:00/});
  await act(async()=>old.resolve([slot]));expect(screen.queryByRole('button',{name:/Reservar el .*10:00/})).toBeNull();
 });
});

describe('Native catalogue save feedback',()=>{
 it('does not claim a leisure spot is saved after a rejected write',async()=>{
  const f=fixture();f.setParams({id:'spot-a'});f.favs.addFav.mockResolvedValueOnce({ok:false,alreadySaved:false});const Page=f.page('app/ocio/[id].tsx').default;render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:'Guardar este sitio'}));await waitFor(()=>expect(f.toast.toastError).toHaveBeenCalled());expect(screen.queryByRole('button',{name:'Guardado'})).toBeNull();expect(f.toast.toast).not.toHaveBeenCalled();
 });
 it('does not claim an event is saved after a rejected write',async()=>{
  const f=fixture();f.favs.addFav.mockResolvedValueOnce({ok:false,alreadySaved:false});const Page=f.page('app/(tabs)/eventos.tsx').default;render(<Page/>);fireEvent.click(screen.getByRole('button',{name:'Ver lista'}));
  fireEvent.click(screen.getByRole('button',{name:'Guardar evento'}));await waitFor(()=>expect(f.toast.toastError).toHaveBeenCalled());expect(screen.queryByRole('button',{name:'Guardado'})).toBeNull();
 });
});


describe('Native deck reconciliation and initial feed bookmarks',()=>{
 it('keeps the active card when only the busy callback changes',async()=>{
  const f=fixture();const Deck=f.page('src/components/SwipeDeck.tsx').SwipeDeck;
  const props={items:homes,renderCard:(item:any)=><span>{item.title}</span>,onSmash:vi.fn(),onPass:vi.fn(async()=>true),emptyTitle:'Fin',emptySubtitle:'Fin',onBusyChange:vi.fn()};
  const view=render(<Deck {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Pasar'}));await screen.findByText(/2 de 2/);
  view.rerender(<Deck {...props} onBusyChange={vi.fn()}/>);
  expect(screen.getByText(/2 de 2/)).toBeInTheDocument();expect(props.onPass).toHaveBeenCalledTimes(1);
 });
 it('does not advance a replacement list after an earlier discard finishes',async()=>{
  const f=fixture();const Deck=f.page('src/components/SwipeDeck.tsx').SwipeDeck;const pending=deferred<boolean>();
  const props={items:homes,renderCard:(item:any)=><span>{item.title}</span>,onSmash:vi.fn(),onPass:vi.fn(()=>pending.promise),emptyTitle:'Fin',emptySubtitle:'Fin'};
  const view=render(<Deck {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Pasar'}));await waitFor(()=>expect(props.onPass).toHaveBeenCalledTimes(1));
  view.rerender(<Deck {...props} items={[homes[0],{...homes[1],id:'piso-c',title:'Piso C'}]}/>);
  await act(async()=>pending.resolve(true));expect(screen.getByText(/1 de 2/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Pasar'})).toHaveAttribute('aria-disabled','false');
 });
 it('preserves a confirmed pass started during initial layout',async()=>{
  const f=fixture({earlyPass:true});const Page=f.page('app/pisos.tsx').default;
  await act(async()=>{render(<Page/>);});
  expect(f.favs.addPassed).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/2 de 2/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Deshacer el último swipe'})).toBeInTheDocument();
 });
 it('keeps a confirmed discard hidden when changing the housing filter',async()=>{
  const f=fixture();const Page=f.page('app/pisos.tsx').default;render(<Page/>);fireEvent.click(await screen.findByRole('button',{name:'Pasar'}));await screen.findByText(/2 de 2/);
  fireEvent.click(screen.getByRole('tab',{name:'Habitación'}));await screen.findByText(/1 de 1/);expect(screen.queryByText('Piso A')).toBeNull();
 });
 it('does not reset the exhausted deck when clearing discards fails',async()=>{
  const f=fixture();const Page=f.page('app/pisos.tsx').default;f.favs.clearPassed.mockRejectedValueOnce(Error('disk unavailable'));render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:'Pasar'}));await screen.findByText(/2 de 2/);fireEvent.click(screen.getByRole('button',{name:'Pasar'}));await screen.findByText('No quedan pisos');
  fireEvent.click(screen.getByRole('button',{name:'Volver a ver los que descarté'}));await waitFor(()=>expect(f.toast.toastError).toHaveBeenCalled());expect(screen.getByText('No quedan pisos')).toBeInTheDocument();
 });
 it('still offers undo after the last card',async()=>{
  const f=fixture();const Page=f.page('app/pisos.tsx').default;f.favs.removeLastPassed.mockResolvedValueOnce('piso-b');render(<Page/>);
  fireEvent.click(await screen.findByRole('button',{name:'Pasar'}));await screen.findByText(/2 de 2/);fireEvent.click(screen.getByRole('button',{name:'Pasar'}));await screen.findByText('No quedan pisos');
  fireEvent.click(screen.getByRole('button',{name:'Deshacer el último swipe'}));await screen.findByText(/2 de 2/);
 });
 it('removing a favorite does not also open its detail',async()=>{
  const f=fixture();const Page=f.page('app/favoritos.tsx').default;render(<Page/>);fireEvent.click(await screen.findByRole('button',{name:'Quitar Guardado uni-a de guardados'}));
  await waitFor(()=>expect(f.favs.removeFav).toHaveBeenCalledTimes(1));expect(f.router.push).not.toHaveBeenCalled();
 });
 it('merges initial saved IDs with a save confirmed while that read was pending',async()=>{
  const f=fixture();const old=deferred<Set<string>>();f.api.getSavedFomoThreadIds.mockReturnValue(old.promise);const Page=f.page('app/(tabs)/feed.tsx').default;render(<Page/>);
  const buttons=await screen.findAllByRole('button',{name:'feed.saveA11y'});fireEvent.click(buttons[1]);await screen.findByRole('button',{name:'feed.unsaveA11y'});
  await act(async()=>old.resolve(new Set(['old-post'])));expect(await screen.findAllByRole('button',{name:'feed.unsaveA11y'})).toHaveLength(2);
 });
});


describe('Native feed bookmark reconciliation',()=>{
 it('renders institutional identity without offering a personal profile or following',async()=>{
  const f=fixture();
  (f.api as any).getThreads.mockResolvedValue({rows:[{...post('institutional'),is_anonymous:false,is_mine:false,author:{id:'must-not-open-person',full_name:'Universidad Oficial',is_organization:true,verified:true},reaction_count:0,comment_count:0}],live:true});
  const Page=f.page('app/(tabs)/feed.tsx').default;render(<Page/>);
  await screen.findByText(/Universidad verificada/);
  fireEvent.click(screen.getByRole('button',{name:'Universidad Oficial'}));
  expect(f.router.push).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'feed.follow'})).toBeNull();
 });
 it('applies a confirmed removal and addition over a delayed snapshot',async()=>{
  const f=fixture();const campus=deferred<any>();const snapshot=deferred<Set<string>>();
  f.api.getMyUniversity.mockReturnValueOnce(campus.promise);f.api.getSavedFomoThreadIds.mockResolvedValueOnce(new Set(['old-post'])).mockReturnValue(snapshot.promise);
  const Page=f.page('app/(tabs)/feed.tsx').default;render(<Page/>);await waitFor(()=>expect(f.api.getSavedFomoThreadIds).toHaveBeenCalledTimes(1));
  await act(async()=>campus.resolve({id:'uni',name:'Universidad'}));await screen.findByRole('button',{name:'feed.unsaveA11y'});
  fireEvent.click(screen.getByRole('button',{name:'feed.unsaveA11y'}));await waitFor(()=>expect(f.api.unsaveFomoThread).toHaveBeenCalledTimes(1));
  const buttons=screen.getAllByRole('button',{name:'feed.saveA11y'});fireEvent.click(buttons[1]);await waitFor(()=>expect(f.api.saveFomoThread).toHaveBeenCalledTimes(1));
  await act(async()=>snapshot.resolve(new Set(['old-post'])));expect(screen.getAllByRole('button',{name:'feed.unsaveA11y'})).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'feed.unsaveA11y'}));await waitFor(()=>expect(f.api.unsaveFomoThread).toHaveBeenLastCalledWith('new-post',{userId:'A',generation:1}));
 });
});
