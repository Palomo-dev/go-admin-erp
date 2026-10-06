/**
 * GET /api/analitica-web?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&sucursal=N][&pais=CO]
 *
 * Datos de la pantalla «Analítica web» (Figma 03 › 464:237482) en una sola
 * llamada a la RPC `fn_analitica_web` (SECURITY INVOKER: lee con la RLS de la
 * sesión).
 *
 *  - La organización sale de la sesión (`withOrg`), nunca de la query ni del
 *    body. Sin sesión: 401; sin pertenencia: 403.
 *  - Quién la ve: el panel completo del inicio (por id de rol / super admin,
 *    `veePanelCompleto`) o el permiso `reports.sales` (rol + cargo, resuelto
 *    en la base). Nunca por el nombre del rol. El resto: 403 sin consultar.
 *  - Exportar CSV: además, `reports.export` (o panel completo).
 *  - Los días se cortan con `fn_timezone_for(org, sucursal)`: la zona de la
 *    sucursal pedida si tiene, si no la de la organización.
 *  - Una sucursal de otra organización: 400 (la RPC la rechaza).
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission, jsonError } from '@/lib/utils/orgContext';
import { veePanelCompleto } from '@/lib/dashboard/accesoPanel';
import { puedeVerAnaliticaWeb } from '@/lib/navigation/capacidadesNav.server';
import { leerPeticion, mapearRespuestaRpc } from '@/lib/analiticaWeb/analiticaWeb';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const panel = veePanelCompleto(ctx);
  // Misma regla que la capacidad `verAnaliticaWeb` del menú: si el menú ofrece
  // «Analítica», aquí no hay 403.
  if (!(await puedeVerAnaliticaWeb(ctx))) return jsonError(403, 'SIN_PERMISO', 'No tienes acceso a la analítica web');

  const peticion = leerPeticion(new URL(req.url).searchParams);
  if (!peticion.ok) return jsonError(400, peticion.codigo);
  const { desde, hasta, sucursal, pais } = peticion.valor;

  const [rpc, puedeExportar] = await Promise.all([
    ctx.supabase.rpc('fn_analitica_web', {
      p_organization_id: ctx.organizationId,
      p_desde: desde,
      p_hasta: hasta,
      p_branch_id: sucursal,
      p_pais: pais,
    }),
    panel ? Promise.resolve(true) : hasOrgAdminOrPermission(ctx, 'reports.export'),
  ]);

  if (rpc.error) {
    const codigo = (rpc.error as { code?: string }).code;
    if (codigo === '42501' && sucursal !== null) return jsonError(400, 'SUCURSAL_INVALIDA');
    if (codigo === '22023') return jsonError(400, 'PETICION_INVALIDA', rpc.error.message);
    if (codigo === '42501') return jsonError(403, 'SIN_ACCESO');
    console.error('[api/analitica-web]', rpc.error.message);
    return NextResponse.json({ error: 'No se pudo calcular la analítica web' }, { status: 500 });
  }

  return NextResponse.json(
    { organizationId: ctx.organizationId, puedeExportar, datos: mapearRespuestaRpc(rpc.data) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
