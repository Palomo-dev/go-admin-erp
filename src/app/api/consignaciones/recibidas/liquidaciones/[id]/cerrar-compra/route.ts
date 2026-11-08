/**
 * POST /api/consignaciones/recibidas/liquidaciones/[id]/cerrar-compra — estimatorio:
 * verifica que la factura de compra ligada ya se confirmó con el soporte del
 * consignante y deja la liquidación «liquidada»
 * (`fn_consignacion_recibida_cerrar_compra`). Permiso `finance.create`.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { cerrarCompraRecibida, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

const cuerpo = z.object({ factura_id: z.string().uuid() }).strict();

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('liquidacion_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas/liquidaciones/[id]/cerrar-compra',
    permisos: ['finance.create'],
    esquema: cuerpo,
    accion: (s) => cerrarCompraRecibida(ctx, id, s.factura_id),
  });
});
