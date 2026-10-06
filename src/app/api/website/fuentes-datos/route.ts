/**
 * Fuentes de datos de las secciones del sitio web (Figma «05 Editor»: «Faltan datos»).
 *
 * GET /api/website/fuentes-datos?branch_id=
 *   → { fuentes: { tipos_habitacion: n, productos: n, … } }
 *
 * Solo conteos de registros, nunca los registros. La organización sale de la
 * sesión (`withOrg`); una organización ajena en la query es 403 registrado
 * (`readOrgBody`). `branch_id`, si llega, debe ser una sede de esa
 * organización. Lectura con el cliente de la sesión (RLS).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { contarFuentesDatos } from '@/lib/services/website/fuentesDatosService';

export const dynamic = 'force-dynamic';

const RUTA = 'api/website/fuentes-datos';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: `GET ${RUTA}` });
    const crudo = new URL(req.url).searchParams.get('branch_id');
    let sede: number | null = null;
    if (crudo !== null && crudo !== '') {
      const n = Number(crudo);
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ error: 'branch_id inválido', code: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
      }
      const { data, error } = await ctx.supabase
        .from('branches')
        .select('id')
        .eq('id', n)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return NextResponse.json({ error: 'La sede no existe en esta organización', code: 'sucursal_no_encontrada' }, { status: 404, headers: SIN_CACHE });
      }
      sede = n;
    }
    const fuentes = await contarFuentesDatos(ctx.supabase, ctx.organizationId, sede);
    return NextResponse.json({ fuentes }, { headers: SIN_CACHE });
  } catch (err) {
    return routeErrorResponse(`GET ${RUTA}`, err);
  }
});
