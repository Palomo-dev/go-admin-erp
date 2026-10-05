import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { crearSitio, listarSitios } from '@/lib/services/website/siteDocumentService';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';

/**
 * Sitios V2 de la organización de la sesión (ADR-002 D1/D4).
 *
 * GET  → lista de sitios (principal y sedes) con su estado de borrador, publicación y adopción.
 * POST { branchId: number | null } → crea el sitio y su borrador: el principal importa su estado
 *      legacy (D12), una sede hereda del principal (D6). Idempotente. No cambia la web pública.
 *
 * La organización sale de la sesión (`withOrg`); un `organization_id` distinto en el body o la
 * query → 403 `FOREIGN_ORGANIZATION` y registro (`readOrgBody`). Los permisos los resuelven la
 * RLS y las RPC con el cliente de la sesión.
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'website/v2/sites' });
    return NextResponse.json({ sitios: await listarSitios(ctx.supabase, ctx.organizationId) });
  } catch (error) {
    return manejarError(error, 'GET sites');
  }
});

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = (await readOrgBody(ctx, request, { route: 'website/v2/sites' })) as { branchId?: unknown };
    const branchId = body.branchId ?? null;
    if (branchId !== null && !(typeof branchId === 'number' && Number.isInteger(branchId) && branchId > 0)) {
      return respuestaError('peticion_invalida', 'branchId debe ser un id de sucursal o null.');
    }
    const resultado = await crearSitio(ctx.supabase, ctx.organizationId, branchId as number | null);
    return NextResponse.json(resultado, { status: resultado.creado ? 201 : 200 });
  } catch (error) {
    return manejarError(error, 'POST sites');
  }
});
