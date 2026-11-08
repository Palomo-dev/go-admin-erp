/**
 * POST /api/consignaciones/recibidas/[id]/liquidar — liquidación al consignante
 * (Figma R5, Ronda 2 del Contador). La remuneración se reconoce cuando se
 * devenga (al vender o al liquidar, según el contrato) en el auxiliar de 413512;
 * el saldo del dueño queda en su auxiliar 281510 y se paga por Dinero de
 * terceros. Nunca se crea una compra ni un documento soporte para pagarle. Los
 * derechos frente al dueño solo se descuentan con el acuerdo escrito. IVA y
 * retenciones quedan como pendiente contable (se determinan por ley).
 * Permiso `finance.create`.
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
    accion: (s) => liquidarRecibida(ctx, id, s),
  });
});
