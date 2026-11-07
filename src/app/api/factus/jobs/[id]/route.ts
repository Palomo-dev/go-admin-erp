/**
 * GET /api/factus/jobs/[id] — detalle de un envío a la DIAN para la bandeja
 * (`finance.view`): la fila normalizada, su línea de tiempo y, solo con
 * `finance.approve` (o administrador), el código y el mensaje técnicos. Nunca
 * el JSON enviado ni el recibido del proveedor.
 *
 * Solo lectura; el envío tiene que ser de la organización de la sesión (404 si no).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { detalleEnvio } from '@/lib/services/einvoicing/bandeja.server';
import { lineaDeTiempo, sinProveedor } from '@/lib/finanzas/facturacionElectronica/bandejaLogica';

const RUTA = 'factus/jobs/[id]';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);
    const params = (await (routeParams as { params?: Promise<Record<string, string>> } | undefined)?.params) ?? {};
    const id = String(params.id ?? '');
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Envío no encontrado', code: 'NOT_FOUND' }, { status: 404 });

    const r = await detalleEnvio(ctx.supabase, ctx.organizationId, id);
    if (!r) return NextResponse.json({ error: 'Envío no encontrado', code: 'NOT_FOUND' }, { status: 404 });

    const tecnico = (await hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.APROBAR))
      ? { codigo: r.crudo.error_code ?? null, mensaje: r.crudo.error_message ? sinProveedor(r.crudo.error_message) : null }
      : null;

    return NextResponse.json(
      { fila: r.fila, pasos: lineaDeTiempo(r.fila, r.eventos), tecnico },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return routeErrorResponse('Factus jobs detalle GET', error);
  }
});
