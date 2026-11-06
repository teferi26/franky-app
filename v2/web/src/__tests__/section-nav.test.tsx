import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SectionNav from '@/components/SectionNav';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();Reflect.deleteProperty(document,'fonts');history.replaceState(null,'','/');document.querySelectorAll('[data-nav-fixture]').forEach(e=>e.remove());});
function fixture(){
 const tops:Record<string,number>={campus:140,studies:500,info:140};const frames=new Map<number,FrameRequestCallback>();let nextFrame=0;
 vi.stubGlobal('requestAnimationFrame',vi.fn((fn:FrameRequestCallback)=>{const id=++nextFrame;frames.set(id,fn);return id;}));
 vi.stubGlobal('cancelAnimationFrame',vi.fn((id:number)=>frames.delete(id)));
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return {top:tops[this.id]??56,bottom:this.tagName==='NAV'?118:2000,height:2000,left:0,right:390,width:390,x:0,y:0,toJSON:()=>({})};});
 const scroll=vi.fn();
 for(const id of Object.keys(tops)){const element=document.createElement('section');element.id=id;element.dataset.navFixture='';element.scrollIntoView=scroll;document.body.append(element);}
 Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn(()=>({matches:true}))});
 return {tops,scroll,tick:()=>act(()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(0));})};
}
it('updates the current link when a long section begins below the fixed bar',()=>{
 const f=fixture();render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'studies',label:'Estudios'}]}/>);
 expect(screen.getByRole('link',{name:'Campus'})).toHaveAttribute('aria-current','location');
 f.tops.campus=-205;f.tops.studies=144;fireEvent.scroll(window);f.tick();
 expect(screen.getByRole('link',{name:'Estudios'})).toHaveAttribute('aria-current','location');
});
it('keeps an explicitly selected adjacent section at the same vertical position',()=>{
 const f=fixture();render(<SectionNav label="Universidad" items={[{id:'campus',label:'Campus'},{id:'info',label:'Información'}]}/>);
 fireEvent.click(screen.getByRole('link',{name:'Información'}));fireEvent.scroll(window);f.tick();
 expect(screen.getByRole('link',{name:'Información'})).toHaveAttribute('aria-current','location');
 expect(f.scroll).toHaveBeenCalledWith({behavior:'auto',block:'start'});
});
it('returns to the earlier section when scrolling up and ignores missing targets',()=>{
 const f=fixture();f.tops.studies=144;f.tops.campus=-100;
 render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'missing',label:'Pendiente'},{id:'studies',label:'Estudios'}]}/>);
 f.tops.campus=144;f.tops.studies=500;fireEvent.scroll(window);f.tick();
 expect(screen.getByRole('link',{name:'Campus'})).toHaveAttribute('aria-current','location');
 expect(screen.getByRole('link',{name:'Pendiente'})).not.toHaveAttribute('aria-current');
});

it('keeps the selected sidebar while smooth scrolling crosses an earlier section',()=>{
 const f=fixture();f.tops.campus=-900;f.tops.info=-900;f.tops.studies=140;
 vi.spyOn(window,'scrollY','get').mockReturnValue(1044);
 vi.spyOn(document.documentElement,'scrollHeight','get').mockReturnValue(4000);
 for(const el of document.querySelectorAll<HTMLElement>('[data-nav-fixture]'))el.style.scrollMarginTop='144px';
 render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'studies',label:'Estudios'},{id:'info',label:'Información'}]}/>);
 fireEvent.click(screen.getByRole('link',{name:'Información'}));
 fireEvent.scroll(window);f.tick();
 expect(screen.getByRole('link',{name:'Información'})).toHaveAttribute('aria-current','location');
 f.tops.campus=144;f.tops.info=144;f.tops.studies=1184;
 fireEvent.scroll(window);f.tick();
 expect(screen.getByRole('link',{name:'Información'})).toHaveAttribute('aria-current','location');
});

it('lets a manual scroll interrupt the selected destination',()=>{
 const f=fixture();f.tops.info=1100;
 vi.spyOn(document.documentElement,'scrollHeight','get').mockReturnValue(4000);
 render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'info',label:'Información'}]}/>);
 fireEvent.click(screen.getByRole('link',{name:'Información'}));fireEvent.scroll(window);f.tick();
 expect(screen.getByRole('link',{name:'Información'})).toHaveAttribute('aria-current','location');
 fireEvent.wheel(window);f.tick();
 expect(screen.getByRole('link',{name:'Campus'})).toHaveAttribute('aria-current','location');
});

it('preserves modified clicks as native anchor actions',()=>{
 const f=fixture();render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'info',label:'Información'}]}/>);
 fireEvent.click(screen.getByRole('link',{name:'Información'}),{ctrlKey:true});
 expect(f.scroll).not.toHaveBeenCalled();
 expect(screen.getByRole('link',{name:'Campus'})).toHaveAttribute('aria-current','location');
});

it('restores a direct section link after the initial layout',()=>{
 const f=fixture();history.replaceState(null,'','#studies');
 render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'studies',label:'Estudios'}]}/>);f.tick();
 expect(f.scroll).toHaveBeenCalledWith({behavior:'instant',block:'start'});
 expect(screen.getByRole('link',{name:'Estudios'})).toHaveAttribute('aria-current','location');
});

it('does not pull the reader back when they scroll before fonts finish loading',async()=>{
 const f=fixture();let fontsReady!:()=>void;
 Object.defineProperty(document,'fonts',{configurable:true,value:{ready:new Promise<void>(resolve=>{fontsReady=resolve;})}});
 history.replaceState(null,'','#studies');
 render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'studies',label:'Estudios'}]}/>);f.tick();f.scroll.mockClear();
 fireEvent.wheel(window);await act(async()=>fontsReady());
 expect(f.scroll).not.toHaveBeenCalled();
 Reflect.deleteProperty(document,'fonts');
});

it('ignores a malformed or missing initial fragment',()=>{
 const f=fixture();history.replaceState(null,'','#%broken');
 render(<SectionNav items={[{id:'campus',label:'Campus'}]}/>);f.tick();
 expect(f.scroll).not.toHaveBeenCalled();
});

it('does not restore an obsolete fragment when the hash changes before fonts finish',async()=>{
 const f=fixture();let ready!:()=>void;Object.defineProperty(document,'fonts',{configurable:true,value:{ready:new Promise<void>(resolve=>{ready=resolve;})}});
 history.replaceState(null,'','#studies');render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'studies',label:'Estudios'}]}/>);f.tick();f.scroll.mockClear();
 history.replaceState(null,'','#campus');await act(async()=>ready());
 expect(f.scroll).not.toHaveBeenCalled();
});

it('cancels delayed restoration after an accessible click without pointerdown',async()=>{
 const f=fixture();let ready!:()=>void;Object.defineProperty(document,'fonts',{configurable:true,value:{ready:new Promise<void>(resolve=>{ready=resolve;})}});
 history.replaceState(null,'','#studies');render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'studies',label:'Estudios'}]}/>);f.tick();
 fireEvent.click(screen.getByRole('link',{name:'Campus'}));f.scroll.mockClear();await act(async()=>ready());
 expect(f.scroll).not.toHaveBeenCalled();expect(screen.getByRole('link',{name:'Campus'})).toHaveAttribute('aria-current','location');
});

it('still corrects font layout after equivalent navigation items re-render',async()=>{
 const f=fixture();let ready!:()=>void;Object.defineProperty(document,'fonts',{configurable:true,value:{ready:new Promise<void>(resolve=>{ready=resolve;})}});
 history.replaceState(null,'','#studies');const view=render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'studies',label:'Estudios'}]}/>);f.tick();f.scroll.mockClear();
 view.rerender(<SectionNav items={[{id:'campus',label:'Campus'},{id:'studies',label:'Estudios'}]}/>);await act(async()=>ready());
 expect(f.scroll).toHaveBeenCalledExactlyOnceWith({behavior:'instant',block:'start'});
});

it('restores once under StrictMode and cancels frames and font work after unmount',async()=>{
 const f=fixture();let ready!:()=>void;Object.defineProperty(document,'fonts',{configurable:true,value:{ready:new Promise<void>(resolve=>{ready=resolve;})}});
 history.replaceState(null,'','#studies');const view=render(<React.StrictMode><SectionNav items={[{id:'campus',label:'Campus'},{id:'studies',label:'Estudios'}]}/></React.StrictMode>);f.tick();
 expect(f.scroll).toHaveBeenCalledExactlyOnceWith({behavior:'instant',block:'start'});f.scroll.mockClear();
 view.unmount();await act(async()=>ready());f.tick();expect(f.scroll).not.toHaveBeenCalled();
});

it('preserves the first-frame correction when fonts are ready sooner',async()=>{
 const f=fixture();let ready!:()=>void;Object.defineProperty(document,'fonts',{configurable:true,value:{ready:new Promise<void>(resolve=>{ready=resolve;})}});
 history.replaceState(null,'','#studies');render(<SectionNav items={[{id:'campus',label:'Campus'},{id:'studies',label:'Estudios'}]}/>);
 await act(async()=>ready());f.scroll.mockClear();f.tick();
 expect(f.scroll).toHaveBeenCalledExactlyOnceWith({behavior:'instant',block:'start'});
});
