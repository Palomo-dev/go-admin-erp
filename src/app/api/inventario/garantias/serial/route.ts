/**
 * GET /api/inventario/garantias/serial?id=… | ?codigo=… — ¿se puede abrir un
 * reclamo sobre este serial? Devuelve el producto, la venta, el cliente y la
 * garantía (desde la venta), o el motivo por el que no (no vendido, sin
 * garantía, vencida, reclamo abierto, no existe en la organización).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import type { EvaluacionSerial } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, ErrorDatosSeriales, exigirVer, leerQuery, respuestaError, rpc } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/inventario/garantias/serial';

const consulta = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    codigo: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = await leerQuery(ctx, req, consulta, RUTA);
    if (!q.id && !q.codigo) throw new ErrorDatosSeriales(['codigo']);
    await exigirVer(ctx, RUTA);
    const evaluacion = await rpc<EvaluacionSerial>(ctx, 'fn_garantia_serial_para_reclamo', {
      p_org: ctx.organizationId,
      p_serial_id: q.id ?? null,
      p_codigo: q.codigo ?? null,
    });
    return NextResponse.json(evaluacion, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
