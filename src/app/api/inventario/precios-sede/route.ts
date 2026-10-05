/**
 * Precios y costos por sede (docs/inventario/PRECIOS-POR-SEDE.md).
 *
 * GET  /api/inventario/precios-sede?product_id=…
 *      → precio/costo general del producto y lo propio de cada sede activa.
 * POST /api/inventario/precios-sede
 *      { tipo: 'precio'|'costo', branch_ids[], product_ids[], valor|null,
 *        comparacion?, desde?, incluir_variantes?, supplier_id? }
 *      → fija (o quita con valor null) en UNA transacción
 *        (`fn_productos_sede_fijar`).
 *
 * Organización de la sesión (`withOrg`); una organización ajena en la query o
 * en el body es 403 registrado (`readOrgBody`). Los permisos los resuelve la
 * base (la RPC exige inventory.edit / product_management /
 * inventory_management; los costos, inventory.costs.view).
 */
import { NextResponse } from 'next/server';
import { withOrg, type ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { detalleValoresSedeSchema, fijarValorSedeSchema } from '@/lib/services/inventario/preciosSede';
import { detalleValoresSede, fijarValoresSede, type ContextoPreciosSede } from '@/lib/services/inventario/preciosSedeService';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const RUTA = 'api/inventario/precios-sede';

function sinClavesDeOrganizacion(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)));
}

function contexto(ctx: ServerOrgContext): ContextoPreciosSede {
  return { organizationId: ctx.organizationId, userId: ctx.userId, supabase: ctx.supabase };
}

function datosInvalidos(campos: string[]): Response {
  return NextResponse.json({ error: 'Datos inválidos', code: 'datos_invalidos', campos }, { status: 400, headers: SIN_CACHE });
}

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: `GET ${RUTA}` });
    const params = Object.fromEntries(new URL(req.url).searchParams.entries());
    const r = detalleValoresSedeSchema.safeParse(sinClavesDeOrganizacion(params));
    if (!r.success) return datosInvalidos(r.error.issues.map((i) => i.path.join('.')));
    const datos = await detalleValoresSede(contexto(ctx), r.data.product_id);
    return NextResponse.json(datos, { headers: SIN_CACHE });
  } catch (err) {
    return routeErrorResponse(`GET ${RUTA}`, err);
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const raw = await readOrgBody(ctx, req, { route: `POST ${RUTA}` });
    const r = fijarValorSedeSchema.safeParse(sinClavesDeOrganizacion(raw));
    if (!r.success) return datosInvalidos(r.error.issues.map((i) => i.path.join('.')));
    const resultado = await fijarValoresSede(contexto(ctx), r.data);
    return NextResponse.json(resultado, { headers: SIN_CACHE });
  } catch (err) {
    return routeErrorResponse(`POST ${RUTA}`, err);
  }
});
