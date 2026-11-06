import { NextRequest,NextResponse } from 'next/server';
import { createRequestSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
export async function GET(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 const limit=await rateLimit(req,{key:'workspace-media',limit:120,windowMs:60_000});if(!limit.ok)return limit.response;
 const {path}=await params;const name=path.join('/');const org=path[0];
 if(!/^[0-9a-f-]{36}$/.test(org??'')||path.length!==3||path.some(x=>x.includes('..')||x.includes('\\'))||name.length>500)return new NextResponse(null,{status:404});
 const s=await createRequestSupabase(req);const{data:{user}}=await s.auth.getUser();const admin=createAdminSupabase();
 let allowed=false;
 if(user){
 const [access,permission]=await Promise.all([
 s.rpc('get_workspace_access'),
 s.rpc('has_organization_permission',{p_organization_id:org,p_permission:'resource.read'}),
 ]);
 // The signing client is privileged: enforce the rollout before bypassing the
 // public canonical-photo check, even when the actor owns an imported space.
 allowed=!access.error&&access.data?.enabled===true&&!permission.error&&permission.data===true;
 }
 if(!allowed){const{data:o,error:oe}=await admin.from('organizations').select('status,demo_cohort_id').eq('id',org).maybeSingle();if(oe||!o||o.status!=='active'||o.demo_cohort_id)return new NextResponse(null,{status:404});
 // A saved draft may replace data.images while the public listing still uses
 // published_data.images. Keep that accepted version visible until publication.
 // Separate structured filters avoid interpolating filenames into a raw OR.
 const versions=await Promise.all(['data','published_data'].map(column=>admin.from('workspace_resources').select('source_id,type').eq('organization_id',org).in('status',['published','pending_review']).contains(column,{images:[name]}).limit(5)));
 if(versions.some(result=>result.error))return new NextResponse(null,{status:503});
 const rs=[...new Map(versions.flatMap(result=>result.data??[]).map(r=>[`${r.type}:${r.source_id}`,r])).values()];
 for(const r of rs){if(!r.source_id)continue;
 const canonicalUrl='https://franky.es/api/workspaces/media/'+name;
 if(r.type==='housing'){const{data}=await admin.from('accommodations').select('id').eq('id',r.source_id).eq('is_paid',true).eq('status','active').contains('images',[canonicalUrl]).maybeSingle();allowed=!!data;}
 else if(r.type==='venue'){const{data}=await admin.from('leisure_spots').select('id').eq('id',r.source_id).eq('is_paid',true).contains('images',[canonicalUrl]).maybeSingle();allowed=!!data;}
 else if(r.type==='event'){const{data}=await admin.from('events').select('id').eq('id',r.source_id).neq('status','cancelled').contains('photos',[canonicalUrl]).maybeSingle();allowed=!!data;}
 else if(r.type==='community'){const{data}=await admin.from('communities').select('id').eq('id',r.source_id).eq('is_private',false).eq('is_deleted',false).eq('is_hidden',false).eq('image_url',canonicalUrl).maybeSingle();allowed=!!data;}
 if(allowed)break;}}
 if(!allowed)return new NextResponse(null,{status:404,headers:{'Cache-Control':'private, no-store'}});
 const{data,error}=await admin.storage.from('workspace-media').createSignedUrl(name,60);if(error||!data?.signedUrl)return new NextResponse(null,{status:404});
 return NextResponse.redirect(data.signedUrl,{status:307,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
