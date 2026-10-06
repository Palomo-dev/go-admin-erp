/**
 * Organización › Equipo › Roles y permisos.
 *   GET  — roles visibles (sistema + propios), catálogo clasificado, personas por rol (de ESTA
 *          organización) y lo que la sesión puede hacer. Requiere roles.view (o gestionarlos).
 *   POST { nombre, descripcion?, plantillaId?, permisoIds? } — crea un rol propio (en blanco,
 *          desde una plantilla o duplicando uno del sistema). Requiere roles.create; lo escribe
 *          `fn_rol_crear` en una transacción.
 * La organización sale de la sesión (`withOrg`); un body con otra organización responde 403.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { crearRol, listarRoles } from '@/lib/services/roles/rolesServidor.server';
import { fallo, responder } from '@/lib/services/roles/respuestaRoles';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/organizacion/roles' });
  return responder(() => listarRoles(ctx));
});

const esquema = z.object({
  nombre: z.string().trim().min(2).max(60),
  descripcion: z.string().trim().max(240).nullable().optional(),
  plantillaId: z.number().int().positive().nullable().optional(),
  permisoIds: z.array(z.number().int().positive()).max(1000).nullable().optional(),
});

export const POST = withOrg(async (ctx, req) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, req, { route: 'POST /api/organizacion/roles' }));
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  return responder(() => crearRol(ctx, cuerpo.data));
});
