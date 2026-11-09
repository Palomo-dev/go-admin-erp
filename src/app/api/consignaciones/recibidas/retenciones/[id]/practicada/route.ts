/**
 * POST /api/consignaciones/recibidas/retenciones/[id]/practicada — ronda 4 del
 * Contador, punto 4: reconoce la retención PRACTICADA cuando ocurre (el pagador
 * ya la descontó), con valor, base, fecha y soporte; no espera el certificado.
 * La estimada nunca se asienta (`fn_consignacion_retencion_practicada`).
 * Permiso `finance.create`, resuelto aquí y otra vez en la base.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { retencionPracticadaSchema } from '@/lib/inventario/consignaciones/recibidas';
import { registrarRetencionPracticada, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('retencion_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas/retenciones/[id]/practicada',
    permisos: ['finance.create'],
    esquema: retencionPracticadaSchema,
    accion: (s) => registrarRetencionPracticada(ctx, id, s),
  });
});
