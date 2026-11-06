import { describe, expect, it } from 'vitest';
import { academicReference } from '@/lib/academic-reference';
import { academicReference as nativeReference } from '../../../mobile/src/lib/academic-reference';

const entry = { reference_value: { duration_years: 5.5, credits: 330 }, checked_at: '2026-09-06', title: 'Ficha oficial UC3M', url: 'https://www.uc3m.es/grado/parsi-informatica', note: 'Grado: 4 años y 240 ECTS. Máster: 1,5 años y 90 ECTS.' };
const career = { duration_years: 5.5, credits: 330, academic_sources: { duration_credits: entry } };
describe.each([['web',academicReference],['mobile',nativeReference]] as const)('academic references: %s',(_,parse)=>{
 it('keeps the complete programme and its component explanation together',()=>{
   expect(parse(career)).toMatchObject({duration:5.5,credits:330,note:entry.note,url:entry.url,checkedDate:'6 de septiembre de 2026'});
 });
 it('hides a stale reference immediately after either value is edited',()=>{
   expect(parse({...career,duration_years:4})).toBeNull();
   expect(parse({...career,credits:240})).toBeNull();
 });
 it('does not use an admission source as academic evidence',()=>{
   expect(parse({...career,academic_sources:{cut_off_score:entry}})).toBeNull();
 });
 it.each(['2026-02-30','not-a-date','2026-09-06T00:00:00Z'])('rejects invalid reference date %s',checked_at=>{
   expect(parse({...career,academic_sources:{duration_credits:{...entry,checked_at}}})).toBeNull();
 });
 it.each(['javascript:alert(1)','http://www.uc3m.es','https://student:secret@www.uc3m.es'])('rejects unsafe source %s',url=>{
   expect(parse({...career,academic_sources:{duration_credits:{...entry,url}}})).toBeNull();
 });
 it('ignores malformed or incomplete stored evidence',()=>{
   for(const bad of [null,[],true,{duration_credits:[]},{duration_credits:{...entry,reference_value:{duration_years:5.5,credits:'330'}}}])
     expect(parse({...career,academic_sources:bad})).toBeNull();
 });
});
