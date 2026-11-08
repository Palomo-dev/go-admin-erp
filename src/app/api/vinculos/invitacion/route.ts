/**
 * POST /api/vinculos/invitacion — lo que ve quien abre el enlace (Figma R7), con
 * sesión: quién invita (nombre y NIT que esa organización decidió mostrar) y
 * cuándo vence. Un token inválido, usado o vencido no revela nada más. El token
 * viaja en el cuerpo, no en la URL de la API. Cualquier miembro puede verla;
 * aceptarla exige ser administrador.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { TOKEN_RE } from '@/lib/inventario/consignaciones/recibidas';
import { verInvitacion } from '@/lib/services/consignaciones/recibidas.server';
import { ejecutar } from '@/lib/services/consignaciones/rutasRecibidas.server';

export const dynamic = 'force-dynamic';

const cuerpo = z.object({ token: z.string().regex(TOKEN_RE) }).strict();

export const POST = withOrg((ctx, req) =>
  ejecutar(ctx, req, {
    ruta: 'POST /api/vinculos/invitacion',
    permisos: ['finance.view', 'finance.create'],
    esquema: cuerpo,
    accion: (s) => verInvitacion(ctx, s.token),
  }),
);
