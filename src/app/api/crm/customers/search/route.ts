import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';

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
    // Búsqueda única de clientes (RPC): sin tildes, todas las palabras, dígitos.
    const { filas } = await buscarClientes(ctx.supabase, { organizationId: ctx.organizationId, texto: q, limite: limit });
    const data = filas.map((c) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email }));
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message =
      error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : 'Error desconocido';
    console.error('[CRM customers/search] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
