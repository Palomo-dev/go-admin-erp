import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/crm/customers/search?q=<texto>&limit=10
 * Busca clientes por nombre o teléfono dentro de la organización activa.
 * Usado por el CallLinkPanel para vincular un cliente a una llamada.
 */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim().slice(0, 60);
  const limit = Math.min(20, Math.max(1, Number(searchParams.get('limit') ?? 10)));

  if (!q) {
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    // Buscar por nombre (ilike) o teléfono (ilike)
    const { data, error } = await ctx.supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email')
      .eq('organization_id', ctx.organizationId)
      .or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`
      )
      .limit(limit);

    if (error) {
      console.error('[CRM customers/search] error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM customers/search] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
