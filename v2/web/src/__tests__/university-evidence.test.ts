import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { universityEvidence, universityStudentContext } from '@/lib/university-evidence';
import { summarizeUniversityAdmission, type AdmissionOffer } from '@/lib/university-comparison';

const source = { reference_value: 25202, checked_at: '2026-09-06', period: null, sources: [{title:'UC3M · cifras',url:'https://www.uc3m.es/conocenos'}] };
const uni = { student_count: 25202, institutional_sources: { student_count: source } };
describe('Institutional evidence follows the actual field', () => {
  it('preserves an explicitly unknown period instead of inferring it from the verification date', () => {
    expect(universityEvidence(uni,'student_count')?.checked_at).toBe('2026-09-06');
    expect(universityStudentContext(uni)).toBe('Periodo no documentado');
  });
  it('invalidates verification after an administrator changes the statistic', () => {
    expect(universityEvidence({...uni,student_count:26000},'student_count')).toBeNull();
    expect(universityEvidence({...uni,student_count:'25202'},'student_count')).toBeNull();
  });
  it('invalidates a description changed through the delegated editor', () => {
    const original = 'Una universidad pública';
    const entry = {...source,reference_value:original};
    expect(universityEvidence({description:original,institutional_sources:{description:entry}},'description')).not.toBeNull();
    expect(universityEvidence({description:original+' y privada',institutional_sources:{description:entry}},'description')).toBeNull();
  });
  it.each(['javascript:alert(1)','data:text/html,hello','//evil.example','https://user:pass@example.com','http://example.com'])('rejects an unsafe source: %s', url => {
    expect(universityEvidence({...uni,institutional_sources:{student_count:{...source,sources:[{title:'Fuente',url}]}}},'student_count')).toBeNull();
  });
  it.each(['2026-02-30','2026-09-06T00:00:00Z','ayer',''])('rejects malformed dates: %s', checked_at => {
    expect(universityEvidence({...uni,institutional_sources:{student_count:{...source,checked_at}}},'student_count')).toBeNull();
  });
  it('does not turn a partially malformed source list into a verified fact', () => {
    expect(universityEvidence({...uni,institutional_sources:{student_count:{...source,sources:[...source.sources,{}]}}},'student_count')).toBeNull();
  });
  it('shows the documented period without turning it into the current academic year', () => {
    expect(universityStudentContext({...uni,institutional_sources:{student_count:{...source,period:'Curso 2023/2024'}}})).toBe('Curso 2023/2024');
  });
  it('uses the same validation on web and native clients', () => {
    expect(readFileSync(resolve('../mobile/src/lib/university-evidence.ts'),'utf8')).toBe(readFileSync(resolve('src/lib/university-evidence.ts'),'utf8'));
  });
});

describe('University comparison keeps admission courses separate', () => {
  const offer = (score:number|null,year:number|null,other:Partial<AdmissionOffer>={}):AdmissionOffer => ({university_id:'a',cut_off_score:score,cut_off_year:year,...other});
  it('counts all variants but uses only the latest course for the range in either input order', () => {
    const items=[offer(5,2025),offer(12,2026),offer(11.001,2026),offer(14,2024),offer(null,2026)];
    const expected={count:5,min:11.001,max:12,year:2026,scored:2};
    expect(summarizeUniversityAdmission(items).get('a')).toEqual(expected);
    expect(summarizeUniversityAdmission([...items].reverse()).get('a')).toEqual(expected);
  });
  it('keeps admission without a cutoff, missing years and invalid scores out of the range', () => {
    const items=[offer(5,2026,{admission_without_cutoff:true}),offer(9,null),offer(0,2026),offer(15,2026),offer(8,2026.5),offer(null,2026)];
    expect(summarizeUniversityAdmission(items).get('a')).toEqual({count:6,min:null,max:null,year:null,scored:0});
  });
  it('does not mix universities or disguise historical data as current', () => {
    const result=summarizeUniversityAdmission([offer(10.025,2025),offer(12,2026,{university_id:'b'})]);
    expect(result.get('a')).toEqual({count:1,min:10.025,max:10.025,year:2025,scored:1});
    expect(result.get('b')?.year).toBe(2026);
  });
  it('includes the tail of a large catalogue instead of assuming a single API page', () => {
    const items=Array.from({length:1201},(_,index)=>offer(index===1200?13.99:8,2026));
    expect(summarizeUniversityAdmission(items).get('a')).toEqual({count:1201,min:8,max:13.99,year:2026,scored:1201});
  });
});

describe('University comparison by chosen course', () => {
  const offer = (other: Partial<AdmissionOffer>): AdmissionOffer => ({ university_id: 'a', cut_off_score: null, cut_off_year: null, ...other });
  it('uses only the requested course, from the current or the previous column', () => {
    const items = [
      offer({ cut_off_score: 12, cut_off_year: 2026, cut_off_score_prev: 11, cut_off_year_prev: 2025 }),
      offer({ cut_off_score: 9, cut_off_year: 2025 }),
      offer({ cut_off_score_prev: 13, cut_off_year_prev: 2025 }),
    ];
    expect(summarizeUniversityAdmission(items, 2026).get('a')).toEqual({ count: 3, min: 12, max: 12, year: 2026, scored: 1 });
    expect(summarizeUniversityAdmission(items, 2025).get('a')).toEqual({ count: 3, min: 9, max: 13, year: 2025, scored: 3 });
  });
});
