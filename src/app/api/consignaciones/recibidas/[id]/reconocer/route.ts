/**
 * POST /api/consignaciones/recibidas/[id]/reconocer — reconoce la remuneración al
 * cumplirse la obligación posterior REAL que documenta el contrato (Ronda 3 del
 * Contador, punto 1), con evidencia: D auxiliar 281510 del dueño / C auxiliar 413512
 * por lo vendido y aún no reconocido (`fn_consignacion_reconocer_remuneracion`).
 * Nunca por la fecha de liquidación. Permiso `finance.create`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { reconocerRemuneracionSchema } from '@/lib/inventario/consignaciones/recibidas';
import { reconocerRemuneracion, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('nota_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas/[id]/reconocer',
    permisos: ['finance.create'],
    esquema: reconocerRemuneracionSchema,
    estado: 201,
    accion: (s) => reconocerRemuneracion(ctx, id, s),
  });
});
