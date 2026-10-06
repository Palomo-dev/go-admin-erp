/**
 * PUT { modo: 'todas' | 'algunas', sucursales } — alcance por sucursal de una persona
 * (users.edit) con `fn_miembro_asignar_sucursales`, la misma RPC que Organización › Miembros:
 * «todas» es explícito (p_todas) y borra las asignaciones (sin filas = todas, también las que se
 * creen después); «algunas» deja exactamente las elegidas, nunca una lista vacía.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { guardarAlcance } from '@/lib/services/roles/rolesServidor.server';
import { fallo, idEntero, parametros, responder } from '@/lib/services/roles/respuestaRoles';

export const dynamic = 'force-dynamic';

const esquema = z.discriminatedUnion('modo', [
  z.object({ modo: z.literal('todas') }),
  z.object({ modo: z.literal('algunas'), sucursales: z.array(z.number().int().positive()).min(1).max(500) }),
]);

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const id = idEntero((await parametros(routeParams)).id);
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, req, { route: 'PUT /api/organizacion/roles/miembros/[id]/sucursales' }));
  if (!id) return fallo(404, 'no_encontrado');
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  const sucursales = cuerpo.data.modo === 'todas' ? null : cuerpo.data.sucursales;
  return responder(() => guardarAlcance(ctx, id, sucursales));
});
