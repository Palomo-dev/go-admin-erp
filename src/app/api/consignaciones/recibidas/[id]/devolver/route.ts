/**
 * POST /api/consignaciones/recibidas/[id]/devolver — devolver mercancía al
 * consignante: salida del kardex y reversión de las cuentas de orden, en UNA RPC
 * (`fn_consignacion_recibida_devolver`). Si la nota llegó vinculada, la
 * devolución le llega al consignante. Permiso `finance.create`; la base exige
 * además inventario «trasladar».
 */
import { withOrg } from '@/lib/utils/orgContext';
import { devolverSchema } from '@/lib/inventario/consignaciones/recibidas';
import { devolver, respuestaErrorRecibida } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar, idDeRuta } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = await idDeRuta(routeParams);
  if (!id) return respuestaErrorRecibida('nota_no_encontrada');
  return ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas/[id]/devolver',
    permisos: ['finance.create'],
    esquema: devolverSchema,
    accion: (s) => devolver(ctx, id, s.lineas, s.clave_idempotencia, s.notas ?? null),
  });
});
