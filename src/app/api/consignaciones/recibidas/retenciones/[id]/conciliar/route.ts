/**
 * POST /api/consignaciones/recibidas/retenciones/[id]/conciliar — concilia una
 * retención de la liquidación (de la operación o de la remuneración) con su
 * soporte: el valor que consta en el certificado, nunca presumido; cierra su
 * pendiente (`fn_consignacion_conciliar_retencion`). Permiso `finance.create`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { conciliarRetencionSchema } from '@/lib/inventario/consignaciones/recibidas';
import { conciliarRetencion, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('retencion_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas/retenciones/[id]/conciliar',
    permisos: ['finance.create'],
    esquema: conciliarRetencionSchema,
    accion: (s) => conciliarRetencion(ctx, id, s),
  });
});
