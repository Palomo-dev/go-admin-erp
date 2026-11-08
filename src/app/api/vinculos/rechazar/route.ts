/**
 * POST /api/vinculos/rechazar — rechaza una invitación (con motivo opcional que
 * le llega a quien invitó). Lo puede hacer un administrador de una organización
 * distinta a la que invita (lo resuelve la base, `fn_vinculo_rechazar`).
 */
import { withOrg } from '@/lib/utils/orgContext';
import { rechazarVinculoSchema } from '@/lib/inventario/consignaciones/recibidas';
import { rechazarVinculo } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg((ctx, req) =>
  ejecutar(ctx, req, {
    ruta: 'POST /api/vinculos/rechazar',
    permisos: ['finance.view', 'finance.create'],
    esquema: rechazarVinculoSchema,
    accion: (s) => rechazarVinculo(ctx, s.token, s.motivo ?? null),
  }),
);
