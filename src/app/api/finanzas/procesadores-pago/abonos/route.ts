/**
 * POST /api/finanzas/procesadores-pago/abonos — registra el abono de un procesador
 * tal como viene en su extracto (`fn_procesador_abono_registrar`, que exige
 * finance.create y valida el cuadre, el NIT del procesador, la factura cuando el IVA
 * va al descontable y el saldo, y escribe el asiento). `solicitud` hace la operación
 * idempotente: el mismo valor dos veces no duplica el abono. Organización de la
 * sesión; otra en el body → 403.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { sinClavesDeOrganizacion } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import { PROCESADORES } from '@/lib/finanzas/procesadoresPago/procesadoresLogica';
import { ErrorProcesadores, estadoDeError, registrarAbono } from '@/lib/services/procesadoresPago/procesadoresPago.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const importe = z.number().finite().min(0).max(1e13);
const esquema = z
  .object({
    solicitud: z.string().uuid(),
    procesador: z.enum(PROCESADORES),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bruto: importe.positive(),
    neto: importe.positive(),
    comision: importe,
    iva_comision: importe,
    retencion_fuente: importe,
    retencion_iva: importe,
    retencion_ica: importe,
    cuenta_bancaria: z.number().int().positive().nullable(),
    factura_comision: z.string().trim().max(60).nullable(),
    referencia: z.string().trim().max(120).nullable(),
    notas: z.string().trim().max(500).nullable(),
  })
  .strict();

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/finanzas/procesadores-pago/abonos' });
  const parsed = esquema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  try {
    return NextResponse.json(await registrarAbono(ctx, parsed.data), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorProcesadores) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo, mensaje: err.message }, { status: estadoDeError(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
