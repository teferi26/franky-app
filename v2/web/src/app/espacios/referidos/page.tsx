import OrganizationReferrals from '@/components/workspaces/OrganizationReferrals';
import {z} from 'zod';
export default async function Page({searchParams}:{searchParams:Promise<{organization?:string}>}){const{organization}=await searchParams;return z.string().uuid().safeParse(organization).success?<OrganizationReferrals organizationId={organization!}/>:<p className="p-6">Selecciona un espacio.</p>;}
