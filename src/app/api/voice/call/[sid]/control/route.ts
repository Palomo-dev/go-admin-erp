import type { NextRequest } from 'next/server';
import { phoneControlRequest } from '@/lib/services/crm/phoneConferenceApi';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Route = { params: Promise<{ sid: string }> };
export async function GET(request: NextRequest, { params }: Route) { return phoneControlRequest(request, (await params).sid); }
export async function POST(request: NextRequest, { params }: Route) { return phoneControlRequest(request, (await params).sid); }
