import { describe,it,expect } from 'vitest';
import { normalizeReferralCode,referralUrl,growthMessage } from '../../../shared/growth';
import { growthSignupMetadata } from '@/lib/growth-attribution';
import { buildGrowthDeliverable } from '@/lib/growth-deliverables';

describe('growth acquisition boundaries',()=>{
 it('validates referral code and refuses URLs or markup',()=>{
  expect(normalizeReferralCode(' ABC_def-7 ')).toBe('abc_def-7');
  for(const x of ['',{},'https://evil.test','x<script>','a'.repeat(65),'áéíóú1'])expect(normalizeReferralCode(x)).toBeNull();
  expect(referralUrl('https://franky.es/','ABC_DEF')).toBe('https://franky.es/r/abc_def');
 });
 it('prefers server-issued cookies and passes only typed acquisition claims',()=>{
  const valid='a0000000-0000-0000-0000-000000000001';
  expect(growthSignupMetadata(`growth_first_touch=${valid}; growth_explicit_code=MyCode01`,{growth_first_touch:'bad',points:'9999',role:'admin'})).toEqual({growth_first_touch:valid,growth_explicit_code:'mycode01'});
  expect(growthSignupMetadata('growth_first_touch=------------------')).toEqual({});
  expect(growthSignupMetadata('growth_explicit_code=%E0%A4%A')).toEqual({});
 });
 it('keeps internal errors private',()=>expect(growthMessage('postgres raw internal error')).not.toContain('postgres'));
});
describe('delivered rewards',()=>{
 it('ships a printable complete planner, not a placeholder URL',()=>{
  const d=buildGrowthDeliverable('planning_pack','Ana');
  expect(d.filename).toBe('franky-planning_pack.html');expect(d.html).toContain('Exámenes y entregas');expect(d.html).toContain('Presupuesto'.toLowerCase());expect(d.html).toContain('@page');
 });
 it('escapes names and refuses active report URLs',()=>{
  const d=buildGrowthDeliverable('university_report','<script>alert(1)</script>',[{name:'<img onerror=x>',city:'Alicante',type:'publica',website:'javascript:alert(1)',updated_at:null}]);
  expect(d.html).not.toContain('<script>');expect(d.html).not.toContain('javascript:');expect(d.html).toContain('&lt;img onerror=x&gt;');expect(d.html).toContain('Fuente institucional pendiente');
 });
 it('does not fabricate a university comparison without favorites',()=>{
  expect(buildGrowthDeliverable('university_report','Ana').html).toContain('Aún no has guardado universidades');
 });
 it('only permits fixed accessible personalization colors',()=>{
  const d=buildGrowthDeliverable('profile_palette','Ana',[],'red;position:fixed');
  expect(d.html).not.toContain('position:fixed');expect(d.html).toContain('#6D28D9');
 });
});
