// @vitest-environment node
import { describe,expect,it,vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/partners/origin/events/route';
import { ORIGIN_EVENT_FIELDS,ORIGIN_ORGANIZER_ID } from '@/lib/origin-partner';
const mocks=vi.hoisted(()=>({select:vi.fn(),eq:vi.fn(),limit:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({rateLimit:async()=>({ok:true})}));
vi.mock('@/lib/supabase-server',()=>({createPublicSupabase:()=>({from:()=>{
 const q:any={select:(fields:string)=>{mocks.select(fields);return q;},eq:(...args:unknown[])=>{mocks.eq(...args);return q;},in:()=>q,order:()=>q,limit:mocks.limit};
 return q;
}})}));
describe('ORIGIN public capacity preference',()=>{
 it.each([false,true,null])('only returns capacity when explicitly visible: %s',async show=>{
  mocks.limit.mockResolvedValue({data:[{id:'f15ca9d5-fb77-45f5-959b-ddc4c7f3459d',max_capacity:45,show_participant_count:show,price:19.9}],error:null});
  const response=await GET(new NextRequest('https://franky.es/api/partners/origin/events'));
  expect(response.status).toBe(200);
  expect((await response.json()).events[0]).toEqual(expect.objectContaining({show_participant_count:show,max_capacity:show===true?45:null,price:19.9}));
  expect(ORIGIN_EVENT_FIELDS.split(',')).toContain('show_participant_count');
  expect(mocks.eq).toHaveBeenCalledWith('organizer_id',ORIGIN_ORGANIZER_ID);
 });
});

