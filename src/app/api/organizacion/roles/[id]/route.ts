/**
 * Un rol.
 *   GET    — rol, sus permisos, su versión y las personas que lo tienen en ESTA organización.
 *   PUT    { version, nombre, descripcion, permisoIds } — guarda un rol PROPIO (roles.edit) con
 *          `fn_rol_guardar`. 409 `conflicto` con `actual` si otra persona guardó antes.
 *   DELETE { rolDestinoId? } — elimina un rol PROPIO (roles.delete) con `fn_rol_eliminar`; si
 *          alguien lo tiene, exige rol de destino y reasigna en la misma transacción.
 * Los roles del sistema no se editan ni se eliminan (403 `rol_sistema`, lo decide la base).
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { detalleRol, eliminarRol, guardarRol } from '@/lib/services/roles/rolesServidor.server';
import { fallo, idEntero, parametros, responder } from '@/lib/services/roles/respuestaRoles';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/organizacion/roles/[id]' });
  const id = idEntero((await parametros(routeParams)).id);
  if (!id) return fallo(404, 'no_encontrado');
  return responder(() => detalleRol(ctx, id));
});

const esquemaGuardar = z.object({
  version: z.number().int().positive(),
  nombre: z.string().trim().min(2).max(60),
  descripcion: z.string().trim().max(240).nullable(),
  permisoIds: z.array(z.number().int().positive()).max(1000),
});

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const id = idEntero((await parametros(routeParams)).id);
  const cuerpo = esquemaGuardar.safeParse(await readOrgBody(ctx, req, { route: 'PUT /api/organizacion/roles/[id]' }));
  if (!id) return fallo(404, 'no_encontrado');
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  return responder(() => guardarRol(ctx, id, cuerpo.data));
});

const esquemaEliminar = z.object({ rolDestinoId: z.number().int().positive().nullable().optional() });

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  const id = idEntero((await parametros(routeParams)).id);
  const cuerpo = esquemaEliminar.safeParse(await readOrgBody(ctx, req, { route: 'DELETE /api/organizacion/roles/[id]' }));
  if (!id) return fallo(404, 'no_encontrado');
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  return responder(() => eliminarRol(ctx, id, cuerpo.data.rolDestinoId ?? null));
});
