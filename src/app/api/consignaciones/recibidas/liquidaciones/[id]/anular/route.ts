/**
 * POST /api/consignaciones/recibidas/liquidaciones/[id]/anular — anula la ÚLTIMA
 * liquidación de una nota recibida con motivo: contra-asiento de la
 * remuneración y lo vendido vuelve a quedar por liquidar
 * (`fn_consignacion_recibida_anular_liquidacion`). Permiso `finance.void`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { anularLiquidacionSchema } from '@/lib/inventario/consignaciones/recibidas';
import { anularLiquidacionRecibida, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('liquidacion_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas/liquidaciones/[id]/anular',
    permisos: ['finance.void'],
    esquema: anularLiquidacionSchema,
    accion: (s) => anularLiquidacionRecibida(ctx, id, s.motivo),
  });
});
