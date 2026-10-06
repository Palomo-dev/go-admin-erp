/**
 * Un cargo.
 *   GET — cargo, sus permisos, sus personas y el rol de referencia para «Ya lo da el rol».
 *   PUT { actualizado, permisoIds } — guarda lo que el cargo SUMA (hr.positions.edit) con
 *       `fn_cargo_guardar_permisos`. 409 `conflicto` con `actual` si otra persona guardó antes.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { detalleCargo, guardarCargo } from '@/lib/services/roles/rolesServidor.server';
import { fallo, idUuid, parametros, responder } from '@/lib/services/roles/respuestaRoles';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/organizacion/roles/cargos/[id]' });
  const id = idUuid((await parametros(routeParams)).id);
  if (!id) return fallo(404, 'no_encontrado');
  return responder(() => detalleCargo(ctx, id));
});

const esquema = z.object({
  // Se devuelve tal cual lo entregó el GET (texto con microsegundos): la base lo compara exacto.
  actualizado: z.string().min(10).max(40).nullable(),
  permisoIds: z.array(z.number().int().positive()).max(1000),
});

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const id = idUuid((await parametros(routeParams)).id);
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, req, { route: 'PUT /api/organizacion/roles/cargos/[id]' }));
  if (!id) return fallo(404, 'no_encontrado');
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  return responder(() => guardarCargo(ctx, id, cuerpo.data));
});
