/**
 * /api/consignaciones/recibidas
 *
 * GET — notas recibidas de la organización de la sesión (mercancía de un
 * consignante en tu poder) y los documentos «por aceptar» que llegaron de otra
 * organización vinculada (Figma R1). RLS por pertenencia. Sin las migraciones:
 * `{ pendiente: true }`. Permiso `finance.view`.
 *
 * POST — recibir a mano (Figma R4): clasificación del contrato obligatoria,
 * nota NCR, entrada al kardex como existencia del consignante (sin costo propio)
 * y cuentas de orden, en UNA RPC (`fn_consignacion_recibir`). Permiso
 * `finance.create`; la base exige además inventario «recibir».
 */
import { withOrg } from '@/lib/utils/orgContext';
import { recibirSchema } from '@/lib/inventario/consignaciones/recibidas';
import { listarRecibidas, recibir } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg((ctx, req) =>
  ejecutar(ctx, req, { ruta: 'GET /api/consignaciones/recibidas', permisos: ['finance.view'], esquema: null, accion: () => listarRecibidas(ctx) }),
);

export const POST = withOrg((ctx, req) =>
  ejecutar(ctx, req, {
    ruta: 'POST /api/consignaciones/recibidas',
    permisos: ['finance.create'],
    esquema: recibirSchema,
    estado: 201,
    accion: (s) => recibir(ctx, s),
  }),
);
