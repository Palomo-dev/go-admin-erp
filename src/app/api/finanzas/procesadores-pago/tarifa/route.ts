/**
 * POST /api/finanzas/procesadores-pago/tarifa — guarda (o borra con `tarifa: null`) la tarifa de
 * UN procesador con la que «Cobros» estima comisión, IVA de la comisión, retenciones y neto
 * (`fn_procesador_pago_tarifa_guardar`, que exige acceso a la organización y finance.create; la
 * base vuelve a validar rangos). Organización de la sesión; otra en el body → 403.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { sinClavesDeOrganizacion } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import { PROCESADORES } from '@/lib/finanzas/procesadoresPago/procesadoresLogica';
import { PLANES_TARIFA } from '@/lib/finanzas/procesadoresPago/tarifaProcesador';
import { ErrorProcesadores, estadoDeError, guardarTarifaProcesador } from '@/lib/services/procesadoresPago/procesadoresPago.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const pct = z.number().finite().min(0).max(100);
const tramo = z.object({ porcentaje: pct, fijo: z.number().finite().min(0) }).strict();
const esquema = z
  .object({
    procesador: z.enum(PROCESADORES),
    tarifa: z
      .object({
        version: z.literal(1),
        plan: z.enum(PLANES_TARIFA as unknown as [string, ...string[]]),
        base: tramo,
        tarjeta: tramo.nullable(),
        tarjetaOtras: tramo.nullable(),
        pseBilleteras: tramo.nullable(),
        pseSinRetenciones: z.boolean(),
        internacionalPct: pct,
        ivaComisionPct: pct,
        reteFuentePct: pct,
        reteIcaPct: pct,
        reteIvaPct: pct,
        retencionesConfiguradas: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/finanzas/procesadores-pago/tarifa' });
  const parsed = esquema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  try {
    const { procesador, tarifa } = parsed.data;
    return NextResponse.json(await guardarTarifaProcesador(ctx, procesador, tarifa as Parameters<typeof guardarTarifaProcesador>[2]), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorProcesadores) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo, mensaje: err.message }, { status: estadoDeError(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
