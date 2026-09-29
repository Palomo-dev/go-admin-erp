/**
 * GET /api/busqueda-global?q=<texto> — datos del buscador global (Ctrl K).
 *
 * - La organización y el usuario salen de la sesión (`withOrg`, regla dura 5).
 *   Una `organization_id` (u `orgId`…) en la query distinta de la de la sesión
 *   responde 403 y queda registrada.
 * - Qué grupos se buscan y qué acciones rápidas se ofrecen lo decide el
 *   servidor (regla dura 6): páginas visibles por módulos activos y cargo, y
 *   permisos de rol + cargo. Ver `busquedaGlobal.server.ts`.
 * - Sin `q` (o con menos de 2 caracteres) solo devuelve las acciones: la
 *   paleta las pide al abrirse.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import {
  claimedOrganizationsIn,
  foreignOrganizationInBody,
  FOREIGN_ORGANIZATION_CODE,
  FOREIGN_ORGANIZATION_MESSAGE,
} from '@/lib/security/organizationBody';
import { accionesPermitidas, gruposPermitidos, LARGO_MAXIMO_CONSULTA, MIN_CARACTERES_ENTIDADES } from '@/lib/busquedaGlobal/logica';
import type { RespuestaBusquedaGlobal } from '@/lib/busquedaGlobal/definiciones';
import { buscarEntidades, resolverAccesoBusqueda, type AccesoBusqueda } from '@/lib/services/busquedaGlobal/busquedaGlobal.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx, req) => {
  const params = new URL(req.url).searchParams;

  for (const declarada of claimedOrganizationsIn(params)) {
    if (foreignOrganizationInBody(declarada.value, ctx.organizationId) !== null) {
      console.warn('[api/busqueda-global] organización ajena en la query', {
        userId: ctx.userId,
        sesion: ctx.organizationId,
        clave: declarada.key,
        valor: String(declarada.value).slice(0, 64),
      });
      return NextResponse.json({ error: FOREIGN_ORGANIZATION_MESSAGE, code: FOREIGN_ORGANIZATION_CODE }, { status: 403 });
    }
  }

  const consulta = (params.get('q') ?? '').trim().slice(0, LARGO_MAXIMO_CONSULTA);

  let acceso: AccesoBusqueda;
  try {
    acceso = await resolverAccesoBusqueda(ctx);
  } catch (err) {
    console.error('[api/busqueda-global] no se pudo resolver el acceso', {
      org: ctx.organizationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'No se pudo resolver qué puedes buscar', code: 'ACCESO_NO_RESUELTO' }, { status: 500, headers: SIN_CACHE });
  }

  const acciones = accionesPermitidas(acceso);
  if (consulta.length < MIN_CARACTERES_ENTIDADES) {
    const vacia: RespuestaBusquedaGlobal = { grupos: [], fallidos: [], acciones };
    return NextResponse.json(vacia, { headers: SIN_CACHE });
  }

  const { grupos, fallidos } = await buscarEntidades(ctx, consulta, gruposPermitidos(acceso.hrefsVisibles));
  const respuesta: RespuestaBusquedaGlobal = { grupos, fallidos, acciones };
  return NextResponse.json(respuesta, { headers: SIN_CACHE });
});
