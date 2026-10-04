import type { NextRequest } from 'next/server';
import { phoneControlRequest } from '@/lib/services/crm/phoneConferenceApi';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest, { params }: { params: Promise<{ sid: string }> }) {
  return phoneControlRequest(request, (await params).sid, 'hold');
}
