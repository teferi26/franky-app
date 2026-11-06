import { redirect } from 'next/navigation';
import { ALICANTE_PARTY_SLUG, partyPath } from '@/lib/crush-party-route';
export default function FiestaShortcut() { redirect(partyPath(ALICANTE_PARTY_SLUG)); }
