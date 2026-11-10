/**
 * POST /api/consignaciones/recibidas/liquidaciones/[id]/entrega-escrita — deja la
 * constancia de que la liquidación se entregó por escrito al dueño: fecha, medio
 * (el que fija el contrato) y soporte. Cierra el pendiente «por entregar» y, si el
 * plazo ya había vencido, lo deja escrito (ronda 6 del Contador, respuesta 13;
 * `fn_consignacion_liquidacion_entrega_registrar`). Permiso `finance.create`.
 * La organización sale de la sesión (`withOrg`), nunca del cuerpo.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { entregaEscritaSchema } from '@/lib/inventario/consignaciones/recibidas';
import { registrarEntregaEscrita, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('liquidacion_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas/liquidaciones/[id]/entrega-escrita',
    permisos: ['finance.create'],
    esquema: entregaEscritaSchema,
    accion: (s) => registrarEntregaEscrita(ctx, id, s),
  });
});
