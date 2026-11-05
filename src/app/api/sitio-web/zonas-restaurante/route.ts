/**
 * GET /api/sitio-web/zonas-restaurante?branch_ids=1,2
 *   → { zonas: [{ nombre, sedes: [{ id, nombre }], mesasWeb }] }
 *
 * Opciones del campo «Zonas visibles» (entidad `zone`) de la reserva con plano de mesas. La
 * organización sale de la sesión (`withOrg`); una organización ajena en la query es 403
 * registrado (`readOrgBody`). Las sedes, si llegan, deben ser de esa organización. Lectura con
 * el cliente de la sesión (RLS).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { listarZonasRestaurante } from '@/lib/services/website/zonasRestauranteService';

export const dynamic = 'force-dynamic';

const RUTA = 'api/sitio-web/zonas-restaurante';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: `GET ${RUTA}` });
    const crudo = new URL(req.url).searchParams.get('branch_ids');
    let sedes: number[] | null = null;
    if (crudo) {
      const ids = crudo.split(',').map((x) => Number(x.trim()));
      if (ids.length > 50 || ids.some((n) => !Number.isInteger(n) || n <= 0)) {
        return NextResponse.json({ error: 'branch_ids inválido', code: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
      }
      const { data, error } = await ctx.supabase.from('branches').select('id').eq('organization_id', ctx.organizationId).in('id', ids);
      if (error) throw error;
      if ((data ?? []).length !== new Set(ids).size) {
        return NextResponse.json({ error: 'La sede no existe en esta organización', code: 'sucursal_no_encontrada' }, { status: 404, headers: SIN_CACHE });
      }
      sedes = ids;
    }
    const zonas = await listarZonasRestaurante(ctx.supabase, ctx.organizationId, sedes);
    return NextResponse.json({ zonas }, { headers: SIN_CACHE });
  } catch (err) {
    return routeErrorResponse(`GET ${RUTA}`, err);
  }
});
