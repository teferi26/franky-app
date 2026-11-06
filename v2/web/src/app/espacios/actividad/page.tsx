import EventLifecycleManager from '@/components/workspaces/EventLifecycleManager';
import {z} from 'zod';
export default async function Page({searchParams}:{searchParams:Promise<{organization?:string;resource?:string}>}){const p=await searchParams;if(!z.string().uuid().safeParse(p.organization).success||p.resource&&!z.string().uuid().safeParse(p.resource).success)return <p className="p-6">Abre la gestión desde una actividad de tu espacio.</p>;return <EventLifecycleManager key={`${p.organization}:${p.resource??''}`} organizationId={p.organization!} resourceId={p.resource??null}/>;}
