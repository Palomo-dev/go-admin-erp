import { NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getEsignReadiness, publicReadiness } from '@/lib/services/crm/contractService';
import { failResponse } from '@/lib/services/crm/f10RouteHelpers';

export const runtime = 'nodejs';

/**
 * GET /api/crm/contracts/status — ¿hay proveedor de firma electrónica para la
 * organización? `{ configured, provider, source, missing[] }` sin claves ni
 * nombres de variables de entorno. F10.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const readiness = await getEsignReadiness(ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true, data: publicReadiness(readiness) });
  } catch (error) {
    return failResponse('CRM Contracts status', error);
  }
}
