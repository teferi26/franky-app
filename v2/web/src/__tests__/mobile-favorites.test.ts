import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function deferred<T>() { let resolve!: (value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve}; }
const favorite={type:'university',id:'uni-1',title:'Universidad de prueba',subtitle:'Madrid',image:null,savedAt:1};
type Query={table:string;operation:string;filters:Record<string,unknown>;payload?:any;headers:Record<string,string>;range?:[number,number];signal?:AbortSignal};

function fixture(){
 let uid:string|null='A';let generation=1;const listeners=new Set<()=>void>();
 const disk=new Map<string,string>();const sent:Query[]=[];const server=new Map<string,any[]>();server.set('A',[]);server.set('B',[]);
 const storage={getItem:vi.fn(async(key:string)=>disk.get(key)??null),setItem:vi.fn(async(key:string,value:string)=>{disk.set(key,value);}),removeItem:vi.fn(async(key:string)=>{disk.delete(key);})};
 const owner=()=>uid?{userId:uid,generation}:null;
 const current=(value:any)=>!!value&&uid===value.userId&&generation===value.generation;
 const auth={getUser:vi.fn(async()=>({data:{user:uid?{id:uid}:null},error:null})),getSession:vi.fn(async()=>({data:{session:uid?{user:{id:uid},access_token:uid}:null},error:null}))};
 let rejectMutation=false;let enrichmentError=false;let beforeSend:(()=>void)|undefined;let readGate:ReturnType<typeof deferred<void>>|undefined;
 const execute=async(q:Query)=>{
  beforeSend?.();sent.push(q);if(q.signal?.aborted)return {data:null,error:{message:'aborted'}};const actor=q.headers.Authorization?.replace('Bearer ','')??uid;
  const selected=String(q.filters.user_id??q.payload?.user_id??actor);
  if(q.table==='favorites'){
   if(actor!==selected)return {data:null,error:{message:'RLS denied'}};
   if(q.operation==='upsert'){
    if(rejectMutation)return {data:null,error:{message:'write rejected'}};
    const rows=server.get(selected)??[];const exists=rows.some(row=>row.target_type===q.payload.target_type&&row.target_id===q.payload.target_id);if(!exists)rows.push({...q.payload,created_at:'2026-09-06T01:00:00Z'});server.set(selected,rows);return {data:exists?[]:[{target_id:q.payload.target_id}],error:null};
   }
   if(q.operation==='delete'){
    if(rejectMutation)return {data:null,error:{message:'write rejected'}};
    server.set(selected,(server.get(selected)??[]).filter(row=>!(row.target_type===q.filters.target_type&&row.target_id===q.filters.target_id)));return {data:null,error:null};
   }
   const filter=q.filters.target_type;const snapshot=(server.get(selected)??[]).filter(row=>!filter||(Array.isArray(filter)?filter.includes(row.target_type):row.target_type===filter)).map(row=>({...row}));
   if(readGate)await readGate.promise;
   return {data:q.range?snapshot.slice(q.range[0],q.range[1]+1):snapshot,error:null};
  }
  if(q.operation==='rpc')return {data:{booking_id:'booking-test',price_cents:100,requires_payment:true},error:null};
  if(q.table==='visit_bookings')return {data:{payment_status:'paid'},error:null};
  if(enrichmentError)return {data:null,error:{message:'catalogue unavailable'}};
  return {data:(Array.isArray(q.filters.id)?q.filters.id:['uni-1']).map((id:string)=>({id,name:'Universidad de prueba',city:'Madrid',short_name:null,logo_url:null,image_url:null,body:'Publicación de prueba',is_anonymous:true,created_at:'2026-09-06'})),error:null};
 };
 const builderFor=(table:string,payload?:any)=>{
  const q:Query={table,operation:payload?'rpc':'select',payload,filters:{},headers:{}};const builder:any={
   select:()=>builder,maybeSingle:()=>builder,eq:(key:string,value:unknown)=>{q.filters[key]=value;return builder;},in:(key:string,value:unknown)=>{q.filters[key]=value;return builder;},order:()=>builder,
   abortSignal:(signal:AbortSignal)=>{q.signal=signal;return builder;},range:(from:number,to:number)=>{q.range=[from,to];return builder;},setHeader:(key:string,value:string)=>{q.headers[key]=value;return builder;},
   upsert:(payload:any)=>{q.operation='upsert';q.payload=payload;return builder;},delete:()=>{q.operation='delete';return builder;},match:(filters:any)=>{Object.assign(q.filters,filters);return builder;},
   then:(yes:any,no:any)=>execute(q).then(yes,no),
  };return builder;
 };
 const supabase={auth,from:builderFor,rpc:(name:string,payload:any)=>builderFor(name,payload)};
 const browser={openBrowserAsync:vi.fn(async()=>({type:'dismiss'})),WebBrowserPresentationStyle:{PAGE_SHEET:'pageSheet'}};
 const fetcher=vi.fn(async():Promise<any>=>({ok:true,json:async()=>({url:'https://checkout.stripe.com/c/pay/test'})}));
 const modules=new Map<string,any>();
 function load(file:string):any{
  const path=resolve(file);if(modules.has(path))return modules.get(path);const module={exports:{}};modules.set(path,module.exports);
  const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{module,exports:module.exports,console,Date,AbortController,URL,setTimeout,clearTimeout,require:(name:string)=>{
   if(name==='@react-native-async-storage/async-storage')return {default:storage};if(name==='expo-web-browser')return browser;if(name==='./monitoring')return {captureError:vi.fn()};if(name==='./supabase')return {supabase,WEB_URL:'https://example.test',fetchConTimeout:fetcher};if(name==='./session')return {captureSessionIdentity:owner,isCurrentSessionIdentity:current,onSessionIdentityChange:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);}};if(name.startsWith('.'))return load(resolve(dirname(path),name+'.ts'));throw Error(name);
  }},{filename:path});return module.exports;
 }
 const favs=load('../mobile/src/lib/favs.ts');
 return {favs,api:()=>load('../mobile/src/lib/api.ts'),housing:()=>load('../mobile/src/lib/housing.ts'),owned:()=>load('../mobile/src/lib/owned-request.ts'),browser,fetcher,listeners,disk,storage,server,sent,auth,owner,current,switchUser:(next:string|null)=>{uid=next;generation++;listeners.forEach(fn=>fn());},rejectMutations:()=>{rejectMutation=true;},failEnrichment:()=>{enrichmentError=true;},beforeSend:(fn:()=>void)=>{beforeSend=fn;},delayRead:()=>{readGate=deferred<void>();return readGate;}};
}

describe('Account-owned native favorites',()=>{
 it('does not assign global legacy favorites to the next signed-in account',async()=>{
  const f=fixture();f.disk.set('franky.favs.v2',JSON.stringify([favorite]));f.disk.set('franky.favs.v1',JSON.stringify([favorite]));f.switchUser('B');
  expect(await f.favs.getCachedFavs()).toEqual([]);expect(f.disk.size).toBe(2);
 });
 it('an add started by A cannot be sent as B after an asynchronous cache read',async()=>{
  const f=fixture();f.storage.getItem.mockImplementationOnce(async()=>{f.switchUser('B');return null;});
  await f.favs.addFav(favorite);expect(f.server.get('B')).toEqual([]);
 });
 it('rejects an explicitly captured owner after signing out and into the same account',async()=>{
  const f=fixture();const owner=f.owner();f.switchUser(null);f.switchUser('A');
  expect((await f.favs.addFav(favorite,owner)).ok).toBe(false);expect(f.sent).toEqual([]);
 });
 it('keeps a failed remote removal in the confirmed cache',async()=>{
  const f=fixture();await f.favs.addFav(favorite);f.rejectMutations();
  expect((await f.favs.removeFav('university','uni-1')).ok).toBe(false);expect((await f.favs.getCachedFavs()).map((row:any)=>row.id)).toEqual(['uni-1']);
 });
 it('does not persist an add that the server rejected',async()=>{
  const f=fixture();f.rejectMutations();expect((await f.favs.addFav(favorite)).ok).toBe(false);expect(await f.favs.getCachedFavs()).toEqual([]);
 });
 it('surfaces partial enrichment failures and keeps the previous snapshot',async()=>{
  const f=fixture();await f.favs.addFav(favorite);f.failEnrichment();
  await expect(f.favs.getFavs()).rejects.toBeDefined();expect((await f.favs.getCachedFavs()).map((row:any)=>row.id)).toEqual(['uni-1']);
 });
 it('serializes concurrent discards without losing either action',async()=>{
  const f=fixture();await Promise.all([f.favs.addPassed('accommodation','first'),f.favs.addPassed('accommodation','second')]);
  expect(await f.favs.getPassed('accommodation')).toEqual(['first','second']);
 });
 it('separates discards and leaves ownerless legacy keys intact',async()=>{
  const f=fixture();f.disk.set('franky.passed.v1.accommodation',JSON.stringify(['legacy']));await f.favs.addPassed('accommodation','A-choice');f.switchUser('B');
  expect(await f.favs.getPassed('accommodation')).toEqual([]);expect(f.disk.get('franky.passed.v1.accommodation')).toBe('["legacy"]');
 });
 it('a delayed response from A cannot become B’s cache',async()=>{
  const f=fixture();await f.favs.addFav(favorite);const gate=f.delayRead();const request=f.favs.getFavs();
  await vi.waitFor(()=>expect(f.sent.some(q=>q.table==='favorites'&&q.operation==='select')).toBe(true));f.switchUser('B');gate.resolve();await request.catch(()=>{});
  expect(await f.favs.getCachedFavs()).toEqual([]);
 });
 it('pins the captured actor even when the shared client changes before sending',async()=>{
  const f=fixture();f.beforeSend(()=>f.switchUser('B'));await f.favs.addFav(favorite);
  expect(f.sent.filter(q=>q.operation==='upsert').every(q=>q.headers.Authorization==='Bearer A'&&q.payload.user_id==='A')).toBe(true);expect(f.server.get('B')).toEqual([]);expect(f.server.get('A')).toEqual([]);expect(f.sent.filter(q=>q.operation==='upsert')).toHaveLength(1);expect(f.sent[0].signal?.aborted).toBe(true);
 });
});


describe('Confirmed native favorites and request lifetime',()=>{
 it('reports whether a favorite was already saved, so undo does not delete an older choice',async()=>{
  const f=fixture();expect(await f.favs.addFav(favorite)).toMatchObject({ok:true,alreadySaved:false});
  expect(await f.favs.addFav(favorite)).toMatchObject({ok:true,alreadySaved:true});expect(f.server.get('A')).toHaveLength(1);
 });
 it('keeps more than 300 favorites and paginates beyond the server row limit',async()=>{
  const f=fixture();f.server.set('A',Array.from({length:1101},(_,i)=>({target_type:'university',target_id:`u-${i}`,created_at:'2026-09-06'})));
  expect(await f.favs.getFavs()).toHaveLength(1101);expect(await f.favs.getCachedFavs()).toHaveLength(1101);
  expect(f.sent.filter(q=>q.table==='favorites'&&q.operation==='select')).toHaveLength(3);
 });
 it('does not report a confirmed save as rejected when disk storage fails',async()=>{
  const f=fixture();f.storage.setItem.mockRejectedValueOnce(Error('disk full'));
  expect((await f.favs.addFav(favorite)).ok).toBe(true);expect(f.server.get('A')).toHaveLength(1);expect(await f.favs.getCachedFavs()).toEqual([]);
 });
 it('serializes a refresh followed by removal so the final cache cannot restore the deleted row',async()=>{
  const f=fixture();await f.favs.addFav(favorite);const gate=f.delayRead();const read=f.favs.getFavs();
  await vi.waitFor(()=>expect(f.sent.some(q=>q.operation==='select'&&q.table==='favorites')).toBe(true));
  const remove=f.favs.removeFav('university','uni-1');gate.resolve();await read;expect((await remove).ok).toBe(true);expect(await f.favs.getCachedFavs()).toEqual([]);
 });
 it('rejects a stale unsave confirmation without touching the new account',async()=>{
  const f=fixture();const api=f.api();const owner=f.owner();f.switchUser('B');
  expect((await api.unsaveFomoThread('post-a',owner)).ok).toBe(false);expect(f.sent).toEqual([]);
 });
 it('keeps saved post enrichment errors visible instead of returning an empty collection',async()=>{
  const f=fixture();f.server.set('A',[{target_type:'fomo_thread',target_id:'post-a',created_at:'2026-09-06'}]);f.failEnrichment();
  await expect(f.api().getSavedFomoThreads()).rejects.toBeDefined();expect(f.sent.every(q=>q.headers.Authorization==='Bearer A')).toBe(true);
 });
 it('rejects an already cancelled screen before any authentication or server request',async()=>{
  const f=fixture();const controller=new AbortController();controller.abort();
  await expect(f.housing().bookVisit('piso',{slot_id:'slot'},f.owner(),controller.signal)).rejects.toBeDefined();
  expect(f.sent).toEqual([]);expect(f.auth.getSession).not.toHaveBeenCalled();expect(f.listeners.size).toBe(0);
 });
 it.each([['manual',{slot_id:'slot'}],['schedule',{slot_id:null,slot_date:'2026-09-10',start_time:'10:00'}]])('pins and cancels a %s booking when identity changes inside the SDK',async(_label,slot)=>{
  const f=fixture();f.beforeSend(()=>f.switchUser('B'));
  await expect(f.housing().bookVisit('piso',slot)).rejects.toBeDefined();
  expect(f.sent).toHaveLength(1);expect(f.sent[0].headers.Authorization).toBe('Bearer A');expect(f.sent[0].signal?.aborted).toBe(true);expect(f.listeners.size).toBe(0);
 });
 it('does not open checkout when the sheet closes while payment creation is pending',async()=>{
  const f=fixture();const controller=new AbortController();f.fetcher.mockImplementationOnce(async()=>{controller.abort();return {ok:true,json:async()=>({url:'https://checkout.stripe.com/c/pay/test'})};});
  await expect(f.housing().payVisit('booking',f.owner(),controller.signal)).rejects.toBeDefined();expect(f.browser.openBrowserAsync).not.toHaveBeenCalled();
 });
 it('does not open a payment URL outside Stripe Checkout',async()=>{
  const f=fixture();f.fetcher.mockResolvedValueOnce({ok:true,json:async()=>({url:'https://checkout.stripe.com.attacker.test/pay'})});
  expect(await f.housing().payVisit('booking')).toMatchObject({ok:false,status:'error'});expect(f.browser.openBrowserAsync).not.toHaveBeenCalled();
 });
 it('confirms payment through the booking record using the same actor and cleans listeners',async()=>{
  const f=fixture();expect(await f.housing().payVisit('booking')).toEqual({ok:true,status:'paid'});
  expect(f.browser.openBrowserAsync).toHaveBeenCalledTimes(1);expect(f.sent[0].headers.Authorization).toBe('Bearer A');expect(f.listeners.size).toBe(0);
 });
});


describe('Discard undo identity',()=>{
 it('does not remove a different last discard when an older undo is submitted',async()=>{
  const f=fixture();await f.favs.addPassed('accommodation','first');await f.favs.addPassed('accommodation','second');
  await expect(f.favs.removeLastPassed('accommodation',f.owner(),'first')).rejects.toBeDefined();expect(await f.favs.getPassed('accommodation')).toEqual(['first','second']);
 });
});
