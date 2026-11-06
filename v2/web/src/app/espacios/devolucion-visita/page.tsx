import VisitRefundManager from '@/components/workspaces/VisitRefundManager';
import {z} from 'zod';
export default async function Page({searchParams}:{searchParams:Promise<{organization?:string;booking?:string}>}){const p=await searchParams;if(!z.string().uuid().safeParse(p.organization).success||!z.string().uuid().safeParse(p.booking).success)return <p className="p-6">Abre una visita desde tu espacio.</p>;return <VisitRefundManager organizationId={p.organization!} bookingId={p.booking!}/>;}
