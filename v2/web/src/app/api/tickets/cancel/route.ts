import { NextRequest } from 'next/server';
import { marketplaceCancel } from '@/lib/marketplace-cancel-route';
export async function POST(req: NextRequest) { return marketplaceCancel(req, 'ticket'); }
