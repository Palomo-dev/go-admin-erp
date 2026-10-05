/**
 * POST /api/inventario/precios-sede/resolver
 *      { tipo?: 'precio'|'costo', branch_id|null, product_ids[] (≤500), en?, heredar_padre? }
 *      → [{ product_id, valor, comparacion, origen }] con la regla de la base
 *        (`fn_precios_vigentes_lote` / `fn_costos_vigentes_lote`):
 *        sede → general → (opcional) padre.
 *
 * Es una lectura, pero va por POST porque la lista de ids no cabe en la URL.
 * Organización de la sesión (`withOrg`) y 403 registrado ante una ajena en el
 * body o la query (`readOrgBody`); sede ajena → 404; costos sin
 * inventory.costs.view → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { resolverValoresSedeSchema } from '@/lib/services/inventario/preciosSede';
import { resolverValoresSede } from '@/lib/services/inventario/preciosSedeService';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const RUTA = 'POST api/inventario/precios-sede/resolver';

export const POST = withOrg(async (ctx, req) => {
  try {
    const raw = await readOrgBody(ctx, req, { route: RUTA });
    const sinOrg =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
        : {};
    const r = resolverValoresSedeSchema.safeParse(sinOrg);
    if (!r.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', code: 'datos_invalidos', campos: r.error.issues.map((i) => i.path.join('.')) },
        { status: 400, headers: SIN_CACHE },
      );
    }
    const valores = await resolverValoresSede(
      { organizationId: ctx.organizationId, userId: ctx.userId, supabase: ctx.supabase },
      r.data,
    );
    return NextResponse.json({ valores }, { headers: SIN_CACHE });
  } catch (err) {
    return routeErrorResponse(RUTA, err);
  }
});
