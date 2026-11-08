/**
 * POST /api/finanzas/tributario/iva/naturaleza { asiento, naturaleza, invoice_purchase_id?, base?, soporte?, nota? }
 * Fija la naturaleza fiscal de un asiento que mueve la 2408 sin ser de un documento
 * con líneas (P4): pago a la DIAN, traslado, cierre, devolución de compra, ajuste
 * procedente, importación u otro. `naturaleza: null` quita el registro.
 *
 * `finance.approve` (o administrador) aquí y otra vez en la RPC. Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS, requireOrgPermission } from '@/lib/security/orgGuards';
import { validarNaturaleza } from '@/lib/finanzas/tributario/formulario300';
import { respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';
import { guardarNaturaleza } from '@/lib/services/tributario/iva300.server';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/finanzas/tributario/iva/naturaleza';

export const POST = withOrg(async (ctx, req) => {
  try {
    const cuerpo = (await readOrgBody<Record<string, unknown>>(ctx, req, { route: RUTA })) ?? {};
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.APROBAR, RUTA);
    const v = validarNaturaleza(cuerpo);
    if (!v.ok) return NextResponse.json({ error: v.error, codigo: v.error }, { status: 400, headers: SIN_CACHE });
    const r = await guardarNaturaleza(ctx, v.asiento, v.datos);
    return NextResponse.json({ naturaleza: r }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA, err);
  }
});
