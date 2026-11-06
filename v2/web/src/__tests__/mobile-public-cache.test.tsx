import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function deferred<T>() { let resolve!: (value:T)=>void; let reject!: (error:Error)=>void; const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }
afterEach(()=>vi.restoreAllMocks());
type Reply={rows:string[];live:boolean};
function fixture(){
 const values=new Map<string,string>();
 const storage={getItem:vi.fn(async(key:string)=>values.get(key)??null),setItem:vi.fn(async(key:string,value:string)=>{values.set(key,value);}),removeItem:vi.fn(async(key:string)=>{values.delete(key);})};
 const net={reportOnline:vi.fn(),reportMaybeOffline:vi.fn()};const module={exports:{} as any};
 const path=resolve('../mobile/src/lib/useFetch.ts');const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(source,{module,exports:module.exports,console,Date,require:(name:string)=>{
  if(name==='react')return React;if(name==='@react-native-async-storage/async-storage')return {default:storage};if(name==='./net')return net;if(name==='./supabase')return {supabase:{}};throw Error(name);
 }},{filename:path});
 return {useFetch:module.exports.useFetch as (fn:()=>Promise<Reply>,key?:string)=>{rows:string[]|null;error:boolean;refreshError:boolean;loading:boolean;refreshing:boolean;refresh:()=>Promise<void>},values,storage,net};
}

it('clears another city immediately and shows its own load failure',async()=>{
 const f=fixture();const madrid=vi.fn(async()=>({rows:['Madrid'],live:true}));const delayed=deferred<Reply>();
 const sevilla=vi.fn(()=>delayed.promise);
 const {result,rerender}=renderHook(({fn,key})=>f.useFetch(fn,key),{initialProps:{fn:madrid as ()=>Promise<Reply>,key:'city:Madrid'}});
 await waitFor(()=>expect(result.current.rows).toEqual(['Madrid']));
 rerender({fn:sevilla,key:'city:Sevilla'});expect(result.current.rows).toBeNull();expect(result.current.loading).toBe(true);
 await act(async()=>delayed.reject(Error('offline')));expect(result.current.rows).toEqual([]);expect(result.current.error).toBe(true);
});

it('ignores late city responses and restores the correct memory cache on return',async()=>{
 const f=fixture();const old=deferred<Reply>();const madrid=()=>old.promise;const sevilla=async()=>({rows:['Sevilla'],live:true});
 const {result,rerender}=renderHook(({fn,key})=>f.useFetch(fn,key),{initialProps:{fn:madrid,key:'Madrid'}});
 rerender({fn:sevilla,key:'Sevilla'});await waitFor(()=>expect(result.current.rows).toEqual(['Sevilla']));
 await act(async()=>old.resolve({rows:['Madrid antiguo'],live:true}));expect(result.current.rows).toEqual(['Sevilla']);
 rerender({fn:()=>new Promise<Reply>(()=>{}),key:'Madrid'});expect(result.current.rows).toBeNull();
 rerender({fn:()=>new Promise<Reply>(()=>{}),key:'Sevilla'});expect(result.current.rows).toEqual(['Sevilla']);
});

it('an older refresh cannot overwrite newer data in memory or disk',async()=>{
 const f=fixture();const old=deferred<Reply>();const newer=deferred<Reply>();const fn=vi.fn().mockResolvedValueOnce({rows:['Inicial'],live:true}).mockImplementationOnce(()=>old.promise).mockImplementationOnce(()=>newer.promise);
 const view=renderHook(()=>f.useFetch(fn,'same'));await waitFor(()=>expect(view.result.current.rows).toEqual(['Inicial']));
 let first!:Promise<void>;let second!:Promise<void>;
 act(()=>{first=view.result.current.refresh();});act(()=>{second=view.result.current.refresh();});
 await act(async()=>{newer.resolve({rows:['Nueva'],live:true});await second;});
 await act(async()=>{old.resolve({rows:['Antigua'],live:true});await first;});
 expect(view.result.current.rows).toEqual(['Nueva']);view.unmount();
 const cached=renderHook(()=>f.useFetch(React.useCallback(()=>new Promise<Reply>(()=>{}),[]),'same'));
 expect(cached.result.current.rows).toEqual(['Nueva']);
 await waitFor(()=>expect(JSON.parse([...f.values.values()][0]).rows).toEqual(['Nueva']));
});

it('keeps the refreshing indicator until the latest overlapping refresh finishes',async()=>{
 const f=fixture();const first=deferred<Reply>();const second=deferred<Reply>();const fn=vi.fn().mockResolvedValueOnce({rows:['Inicial'],live:true}).mockImplementationOnce(()=>first.promise).mockImplementationOnce(()=>second.promise);
 const view=renderHook(()=>f.useFetch(fn,'same'));await waitFor(()=>expect(view.result.current.rows).toEqual(['Inicial']));
 act(()=>{void view.result.current.refresh();void view.result.current.refresh();});expect(view.result.current.refreshing).toBe(true);
 await act(async()=>first.resolve({rows:['Antigua'],live:true}));expect(view.result.current.refreshing).toBe(true);
 await act(async()=>second.resolve({rows:['Nueva'],live:true}));expect(view.result.current.refreshing).toBe(false);
});

it('restores a complete catalogue from disk even when the network fails first',async()=>{
 const f=fixture();const disk=deferred<string|null>();f.storage.getItem.mockImplementation(()=>disk.promise);
 const fn=vi.fn().mockRejectedValue(Error('offline'));const view=renderHook(()=>f.useFetch(fn,'catalogue'));
 await waitFor(()=>expect(view.result.current.error).toBe(true));
 await act(async()=>disk.resolve(JSON.stringify({version:2,at:Date.now(),rows:['Guardada']})));
 expect(view.result.current.rows).toEqual(['Guardada']);expect(view.result.current.error).toBe(false);expect(view.result.current.refreshError).toBe(true);
});

it('a disk response cannot replace a network result',async()=>{
 const f=fixture();const disk=deferred<string|null>();f.storage.getItem.mockImplementation(()=>disk.promise);
 const fn=vi.fn().mockResolvedValue({rows:['Actual'],live:true});const view=renderHook(()=>f.useFetch(fn,'catalogue'));
 await waitFor(()=>expect(view.result.current.rows).toEqual(['Actual']));
 await act(async()=>disk.resolve(JSON.stringify({version:2,at:Date.now(),rows:['Vieja']})));
 expect(view.result.current.rows).toEqual(['Actual']);
});

it.each([undefined,'bad',Date.now()+60_000,Date.now()-25*60*60*1000])('rejects an invalid or expired disk timestamp: %s',async at=>{
 const f=fixture();f.storage.getItem.mockResolvedValue(JSON.stringify({version:2,at,rows:['Caducada']}));
 const fn=vi.fn().mockRejectedValue(Error('offline'));const view=renderHook(()=>f.useFetch(fn,'catalogue'));
 await waitFor(()=>expect(view.result.current.error).toBe(true));expect(view.result.current.rows).toEqual([]);
});

it('persists all 450 rows rather than silently truncating a catalogue to 400',async()=>{
 const f=fixture();const rows=Array.from({length:450},(_,i)=>`Carrera ${i}`);const fn=vi.fn().mockResolvedValue({rows,live:true});
 renderHook(()=>f.useFetch(fn,'catalogue'));await waitFor(()=>expect(f.values.size).toBe(1));
 expect(JSON.parse([...f.values.values()][0]).rows).toHaveLength(450);
});

it('shows a refresh warning while retaining the same city cache and recovers on retry',async()=>{
 const f=fixture();const fn=vi.fn().mockResolvedValueOnce({rows:['Guardada'],live:true}).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({rows:['Actualizada'],live:true});
 const view=renderHook(()=>f.useFetch(fn,'Madrid'));await waitFor(()=>expect(view.result.current.rows).toEqual(['Guardada']));
 await act(async()=>view.result.current.refresh());expect(view.result.current.error).toBe(false);expect(view.result.current.refreshError).toBe(true);expect(view.result.current.rows).toEqual(['Guardada']);
 await act(async()=>view.result.current.refresh());expect(view.result.current.refreshError).toBe(false);expect(view.result.current.rows).toEqual(['Actualizada']);
});

it('a late refresh from an unmounted screen cannot change the shared cache',async()=>{
 const f=fixture();const late=deferred<Reply>();const fn=vi.fn().mockResolvedValueOnce({rows:['Válida'],live:true}).mockImplementationOnce(()=>late.promise);
 const view=renderHook(()=>f.useFetch(fn,'Madrid'));await waitFor(()=>expect(view.result.current.rows).toEqual(['Válida']));
 act(()=>{void view.result.current.refresh();});view.unmount();await act(async()=>late.resolve({rows:['Tardía'],live:true}));
 const next=renderHook(()=>f.useFetch(React.useCallback(()=>new Promise<Reply>(()=>{}),[]),'Madrid'));expect(next.result.current.rows).toEqual(['Válida']);
});

it('repeated failures without cached data continue to offer retry, not an empty success',async()=>{
 const f=fixture();const fn=vi.fn().mockRejectedValue(Error('offline'));const view=renderHook(()=>f.useFetch(fn,'empty'));
 await waitFor(()=>expect(view.result.current.error).toBe(true));
 await act(async()=>view.result.current.refresh());expect(view.result.current.error).toBe(true);expect(view.result.current.refreshError).toBe(false);
});

it('does not mark an unresolved location placeholder as a successful network response',async()=>{
 const f=fixture();const fn=vi.fn().mockResolvedValue({rows:[],live:false});const view=renderHook(()=>f.useFetch(fn));
 await waitFor(()=>expect(view.result.current.loading).toBe(false));expect(f.net.reportOnline).not.toHaveBeenCalled();expect(f.values.size).toBe(0);
});

it('non-live results for a named catalogue do not erase a valid cache',async()=>{
 const f=fixture();const fn=vi.fn().mockResolvedValueOnce({rows:['Guardada'],live:true}).mockResolvedValueOnce({rows:[],live:false});
 const view=renderHook(()=>f.useFetch(fn,'catalogue'));await waitFor(()=>expect(view.result.current.rows).toEqual(['Guardada']));
 await act(async()=>view.result.current.refresh());expect(view.result.current.rows).toEqual(['Guardada']);expect(view.result.current.refreshError).toBe(true);
});

it('removes an older disk entry when the new complete catalogue exceeds the cache budget',async()=>{
 const f=fixture();const rows=['X'.repeat(500_001)];const fn=vi.fn().mockResolvedValueOnce({rows:['Pequeña'],live:true}).mockResolvedValueOnce({rows,live:true});
 const view=renderHook(()=>f.useFetch(fn,'catalogue'));await waitFor(()=>expect(f.values.size).toBe(1));
 await act(async()=>view.result.current.refresh());await waitFor(()=>expect(f.values.size).toBe(0));expect(view.result.current.rows).toEqual(rows);
 expect(f.storage.removeItem).toHaveBeenCalledWith('franky.cache.v2:catalogue');
});

it('serializes disk writes so a slow old write finishes before the new one',async()=>{
 const f=fixture();const oldWrite=deferred<void>();
 f.storage.setItem.mockImplementationOnce(async(key,value)=>{await oldWrite.promise;f.values.set(key,value);});
 const fn=vi.fn().mockResolvedValueOnce({rows:['Primera'],live:true}).mockResolvedValueOnce({rows:['Segunda'],live:true});
 const view=renderHook(()=>f.useFetch(fn,'catalogue'));await waitFor(()=>expect(f.storage.setItem).toHaveBeenCalledTimes(1));
 await act(async()=>view.result.current.refresh());expect(f.storage.setItem).toHaveBeenCalledTimes(1);
 await act(async()=>oldWrite.resolve());await waitFor(()=>expect(JSON.parse([...f.values.values()][0]).rows).toEqual(['Segunda']));
});

it('two mounted consumers cannot roll shared memory back with an older response',async()=>{
 const f=fixture();const old=deferred<Reply>();const latest=deferred<Reply>();const firstFn=()=>old.promise;const latestFn=()=>latest.promise;
 const first=renderHook(()=>f.useFetch(firstFn,'shared'));const second=renderHook(()=>f.useFetch(latestFn,'shared'));
 await act(async()=>latest.resolve({rows:['Actual'],live:true}));await act(async()=>old.resolve({rows:['Anterior'],live:true}));
 first.unmount();second.unmount();const next=renderHook(()=>f.useFetch(React.useCallback(()=>new Promise<Reply>(()=>{}),[]),'shared'));
 expect(next.result.current.rows).toEqual(['Actual']);
});

it('does not restore v1 disk entries whose catalogue might have been truncated',async()=>{
 const f=fixture();f.values.set('franky.cache.v1:catalogue',JSON.stringify({at:Date.now(),rows:['Primera de muchas']}));
 const fn=vi.fn().mockRejectedValue(Error('offline'));const view=renderHook(()=>f.useFetch(fn,'catalogue'));
 await waitFor(()=>expect(view.result.current.error).toBe(true));expect(view.result.current.rows).toEqual([]);expect(f.values.has('franky.cache.v1:catalogue')).toBe(true);
});

it('does not treat yesterday’s memory cache as a fresh initial catalogue',async()=>{
 const f=fixture();const fn=vi.fn().mockResolvedValue({rows:['Ayer'],live:true});const view=renderHook(()=>f.useFetch(fn,'catalogue'));
 await waitFor(()=>expect(view.result.current.rows).toEqual(['Ayer']));view.unmount();vi.spyOn(Date,'now').mockReturnValue(Date.now()+25*60*60*1000);
 const next=renderHook(()=>f.useFetch(React.useCallback(()=>new Promise<Reply>(()=>{}),[]),'catalogue'));expect(next.result.current.rows).toBeNull();
});
