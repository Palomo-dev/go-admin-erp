/**
 * POST /api/vinculos — invitar a otra organización de GO Admin (Figma R6). La
 * base genera el token de UN SOLO USO, guarda solo su sha-256 y lo devuelve en
 * claro UNA vez para armar el enlace; vence en 7 días y queda amarrado a un
 * tercero propio. Genérico (`organization_links`): hoy consignación; listo para
 * órdenes de compra y facturas. Permiso `finance.create`.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { invitarSchema, RUTA_VINCULAR } from '@/lib/inventario/consignaciones/recibidas';
import { invitar } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg((ctx, req) =>
  ejecutar(ctx, req, {
    ruta: 'POST /api/vinculos',
    permisos: ['finance.create'],
    esquema: invitarSchema,
    estado: 201,
    accion: async (s) => {
      const r = await invitar(ctx, s);
      // La ruta del enlace; el origen lo pone el navegador. El token no se registra en ningún log.
      return { vinculoId: r.vinculo_id, vence: r.vence, enlace: `${RUTA_VINCULAR}/${r.token}` };
    },
  }),
);
