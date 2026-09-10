import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { checkRateLimit } from '@/lib/security/rateLimit';

/**
 * POST /api/ai-assistant/dynamic-options
 *
 * Seguridad (F0, C-D): se eliminó el JWT anon hardcodeado; se usa el cliente
 * de sesión (`ctx.supabase`, RLS) y la organización activa. El body ya no
 * decide la organización.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  // Cada llamada lista hasta 300 categorías, 300 proveedores, 100 clientes y
  // todas las sucursales: sin coste de IA, pero sí de base de datos.
  const rl = await checkRateLimit(`assistant:options:${ctx.userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones seguidas.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  try {
    const organizationId = ctx.organizationId;
    const supabase = ctx.supabase;

    // `branches` se añade en F0: `stock_levels.branch_id` es NOT NULL, así que
    // sin sucursal el ajuste de stock no puede ejecutarse.
    //
    // Deuda conocida (C12): listar catálogos completos no escala. F2 sustituye
    // los `<select>` por resolución mediante búsqueda (`buscar_productos`).
    const [categoriesRes, suppliersRes, customersRes, branchesRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name')
        .limit(300),
      supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name')
        .limit(300),
      supabase
        .from('customers')
        .select('id, full_name')
        .eq('organization_id', organizationId)
        .order('full_name')
        .limit(100),
      supabase
        .from('branches')
        .select('id, name, is_main')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('is_main', { ascending: false })
        .order('name'),
    ]);

    return NextResponse.json({
      categories: (categoriesRes.data || []).map(c => ({ value: String(c.id), label: c.name })),
      suppliers: (suppliersRes.data || []).map(s => ({ value: String(s.id), label: s.name })),
      customers: (customersRes.data || []).map(c => ({ value: String(c.id), label: c.full_name })),
      branches: (branchesRes.data || []).map(b => ({ value: String(b.id), label: b.name })),
    });
  } catch (error: unknown) {
    console.error('Error cargando opciones dinámicas:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error cargando opciones' },
      { status: 500 }
    );
  }
}
