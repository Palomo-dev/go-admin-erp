/**
 * POST /api/consignaciones/recibidas/[id]/liquidar — liquidación al consignante
 * (Figma R5). Intermediación: remuneración contra el auxiliar 281510 del dueño
 * (`fn_consignacion_recibida_liquidar`); el saldo se paga por Dinero de terceros.
 * Estimatorio: además, el BORRADOR de la factura de compra de siempre, para
 * completarlo con el soporte del consignante. IVA y retenciones quedan como
 * pendiente contable (se determinan por ley). Permiso `finance.create`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { liquidarRecibidaSchema } from '@/lib/inventario/consignaciones/recibidas';
import { liquidarRecibida, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('nota_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas/[id]/liquidar',
    permisos: ['finance.create'],
    esquema: liquidarRecibidaSchema,
    accion: (s) => liquidarRecibida(ctx, id, s.hasta ?? null, s.clave_idempotencia),
  });
});
