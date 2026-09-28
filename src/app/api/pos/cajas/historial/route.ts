/**
 * GET /api/pos/cajas/historial?vista=pagina|diferencias|exportar&… — historial
 * de cajas de la organización de la sesión, con la máscara del cierre ciego
 * aplicada EN EL SERVIDOR (`final_amount` y `difference` en null, sin filtro
 * ni orden por diferencia) para quien no tiene `pos.cajas.ver_esperado`.
 * Lectura con el cliente de la sesión (RLS de cash_sessions).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { verImportesHistorial } from '@/lib/pos/cajas/historialServidor';
import { consultaHistorialDeUrl, diferenciasHistorial, exportacionHistorial, paginaHistorial } from '@/lib/pos/cajas/historialConsulta';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const c = consultaHistorialDeUrl(new URL(req.url));
  try {
    const verImportes = await verImportesHistorial(ctx);
    const op = { organizationId: ctx.organizationId, sucursalId: c.sucursalId, verImportes };
    const cabeceras = { 'Cache-Control': 'private, no-store' };
    if (c.vista === 'diferencias') {
      return NextResponse.json({ verImportes, diferencias: await diferenciasHistorial(ctx.supabase, c.filtros, op) }, { headers: cabeceras });
    }
    if (c.vista === 'exportar') {
      return NextResponse.json({ verImportes, data: await exportacionHistorial(ctx.supabase, c.filtros, op) }, { headers: cabeceras });
    }
    const r = await paginaHistorial(ctx.supabase, c.filtros, op, c.pagina, c.tamano);
    return NextResponse.json({ verImportes, ...r }, { headers: cabeceras });
  } catch (err) {
    console.error('[pos/cajas/historial]', { organizationId: ctx.organizationId, message: (err as { message?: string })?.message });
    return NextResponse.json({ error: 'No se pudo leer el historial de cajas', codigo: 'lectura_fallida' }, { status: 500 });
  }
});
