/**
 * Carta por sede (Sitio web, ADR-002 D3).
 *
 * GET  /api/website/carta-sede?branch_id&category_id&q&filtro&pagina
 *      → productos de la sede con su ajuste y el precio vigente.
 * PUT  /api/website/carta-sede
 *      { tipo: 'productos', branch_id, cambios[] }            → lote de productos
 *      { tipo: 'categoria', branch_id, category_id, accion }  → toda la categoría
 *
 * Organización de la sesión (`withOrg`); una organización ajena en la query o
 * en el body es 403 registrado (`readOrgBody`). Escritura con el cliente de la
 * sesión (RLS + `website.sites.edit`), un upsert por lote.
 */
import { NextResponse } from 'next/server';
import { withOrg, type ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { escrituraCartaSedeSchema, listadoCartaSedeSchema } from '@/lib/services/website/cartaSede';
import { guardarCartaSede, listarCartaSede, type ContextoCartaSede } from '@/lib/services/website/cartaSedeService';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const RUTA = 'api/website/carta-sede';

function sinClavesDeOrganizacion(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)));
}

async function contexto(ctx: ServerOrgContext): Promise<ContextoCartaSede> {
  return {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    supabase: ctx.supabase,
    timezone: await getOrganizationTimezone(ctx.organizationId, ctx.supabase),
  };
}

function datosInvalidos(campos: string[]): Response {
  return NextResponse.json({ error: 'Datos inválidos', code: 'datos_invalidos', campos }, { status: 400, headers: SIN_CACHE });
}

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: `GET ${RUTA}` });
    const params = Object.fromEntries(new URL(req.url).searchParams.entries());
    const r = listadoCartaSedeSchema.safeParse(sinClavesDeOrganizacion(params));
    if (!r.success) return datosInvalidos(r.error.issues.map((i) => i.path.join('.')));
    const datos = await listarCartaSede(await contexto(ctx), r.data);
    return NextResponse.json(datos, { headers: SIN_CACHE });
  } catch (err) {
    return routeErrorResponse(`GET ${RUTA}`, err);
  }
});

export const PUT = withOrg(async (ctx, req) => {
  try {
    const raw = await readOrgBody(ctx, req, { route: `PUT ${RUTA}` });
    const r = escrituraCartaSedeSchema.safeParse(sinClavesDeOrganizacion(raw));
    if (!r.success) return datosInvalidos(r.error.issues.map((i) => i.path.join('.')));
    const resultado = await guardarCartaSede(await contexto(ctx), r.data);
    return NextResponse.json(resultado, { headers: SIN_CACHE });
  } catch (err) {
    return routeErrorResponse(`PUT ${RUTA}`, err);
  }
});
