/**
 * /api/integrations/desarrolladores/llaves/[id] — Administración.
 *   PATCH  → { nombre?, alcances?[], expira?: iso|null, activa?: boolean } edita la llave
 *            (nombre, permisos, vencimiento, desactivar/activar). Una revocada no se edita.
 *   DELETE → revoca la llave (no la borra). Borrarla: `DELETE …/[id]/borrar`.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { editarLlave, revocarLlave } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/desarrolladores/llaves/[id]';
const esquema = z.object({
  nombre: z.string().min(1).max(80).optional(),
  alcances: z.array(z.string().max(40)).min(1).max(20).optional(),
  expira: z.string().max(40).nullable().optional(),
  activa: z.boolean().optional(),
});

export const PATCH = withOrg(async (ctx, request, routeParams) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `PATCH ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADA', 'Llave no encontrada.');
  return responder(RUTA, async () => ({
    llave: await editarLlave(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, id, cuerpo.data),
  }));
}, { admin: true });

export const DELETE = withOrg(async (ctx, request, routeParams) => {
  await readOrgBody(ctx, request, { route: `DELETE ${RUTA}` });
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADA', 'Llave no encontrada.');
  return responder(RUTA, async () => {
    await revocarLlave(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId, memberId: ctx.memberId }, id);
    return { revocada: true };
  });
}, { admin: true });
