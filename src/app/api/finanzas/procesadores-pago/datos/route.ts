/**
 * POST /api/finanzas/procesadores-pago/datos — guarda NIT, nombre, origen
 * (nacional/exterior) y «retiene saldo a propósito» de UN procesador
 * (`fn_procesador_pago_configurar`, que exige finance.create). Lo que no venga en el
 * body no se toca; un NIT vacío vuelve al de fábrica. Organización de la sesión;
 * otra en el body → 403.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { sinClavesDeOrganizacion } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import { PROCESADORES } from '@/lib/finanzas/procesadoresPago/procesadoresLogica';
import { configurarProcesador, ErrorProcesadores, estadoDeError } from '@/lib/services/procesadoresPago/procesadoresPago.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const esquema = z
  .object({
    procesador: z.enum(PROCESADORES),
    nit: z.string().trim().max(20).nullable().optional(),
    nombre: z.string().trim().max(120).nullable().optional(),
    origen: z.enum(['nacional', 'exterior']).optional(),
    retiene_saldo: z.boolean().optional(),
    tipo_documento: z.enum(['31', '42', '43']).nullable().optional(),
  })
  .strict();

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/finanzas/procesadores-pago/datos' });
  const parsed = esquema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  try {
    return NextResponse.json(await configurarProcesador(ctx, parsed.data), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorProcesadores) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo, mensaje: err.message }, { status: estadoDeError(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
