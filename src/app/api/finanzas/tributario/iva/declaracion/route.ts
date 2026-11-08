/**
 * POST /api/finanzas/tributario/iva/declaracion { desde, hasta, presentada_en, numero_formulario?, nota? }
 * Registra que la empresa YA presentó el IVA de ese período (lo hace una persona;
 * el sistema nunca lo marca). Con eso el borrador señala lo grabado después en un
 * período declarado. `presentada_en: null` quita el registro.
 *
 * `finance.approve` (o administrador) aquí y otra vez en la RPC. Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS, requireOrgPermission } from '@/lib/security/orgGuards';
import { validarDeclaracion } from '@/lib/finanzas/tributario/formulario300';
import { respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';
import { guardarDeclaracion } from '@/lib/services/tributario/iva300.server';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/finanzas/tributario/iva/declaracion';

export const POST = withOrg(async (ctx, req) => {
  try {
    const cuerpo = (await readOrgBody<Record<string, unknown>>(ctx, req, { route: RUTA })) ?? {};
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.APROBAR, RUTA);
    const v = validarDeclaracion(cuerpo);
    if (!v.ok) return NextResponse.json({ error: v.error, codigo: v.error }, { status: 400, headers: SIN_CACHE });
    const r = await guardarDeclaracion(ctx, v.desde, v.hasta, v.datos);
    return NextResponse.json({ declaracion: r }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA, err);
  }
});
