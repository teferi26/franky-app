import RefundRequests from '@/components/RefundRequests';
import {z} from 'zod';
export default async function Page({searchParams}:{searchParams:Promise<{ticket?:string;booking?:string}>}){const p=await searchParams;return <RefundRequests ticket={z.string().uuid().safeParse(p.ticket).success?p.ticket:undefined} booking={z.string().uuid().safeParse(p.booking).success?p.booking:undefined}/>;}
