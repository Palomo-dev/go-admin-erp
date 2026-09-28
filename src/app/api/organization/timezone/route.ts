// ============================================================
// Escritura de la zona horaria: organización y sucursal (fase A, punto 4).
//
// ÚNICO camino con permiso comprobado en servidor para escribir
// `organizations.timezone` y `branches.timezone`. Antes cada pantalla hacía
// su propio `supabase.from(...).update({ timezone })` desde el navegador y el
// permiso lo decidía un booleano de React (`isOrgAdmin`) más RLS; con eso,
// «¿quién puede cambiar la zona de la organización?» tenía tantas respuestas
// como pantallas.
//
// Reglas duras 5 y 6 de CLAUDE.md:
//  - La organización sale de la SESIÓN (`withOrg` → `getServerOrgContext`),
//    nunca del body. Si el body trae otra, `withOrg` ya responde 403.
//  - El permiso se resuelve en el servidor y por id de rol
//    (`requireOrgAdminOrPermission`: super admin, rol 1/2, o el permiso
//    `admin.full_access` por rol o cargo). Nunca por el nombre del rol ni
//    por un valor que venga del cliente.
//
// La sucursal se comprueba además por pertenencia: una sucursal de otro
// inquilino responde 404, no 403, para no confirmar que ese id existe.
// ============================================================

import { withOrg, jsonError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { isSupportedTimeZone } from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

interface CuerpoZona {
  /** Nivel que se escribe. Sin él se asume la organización. */
  scope?: 'organization' | 'branch';
  /** Obligatorio con scope 'branch'. */
  branchId?: number;
  /**
   * Zona IANA canónica, o `null` para «heredar» (solo con scope 'branch';
   * `organizations.timezone` es NOT NULL y es la raíz de la cascada).
   */
  timezone?: string | null;
}

function leerCuerpo(valor: unknown): CuerpoZona | null {
  if (typeof valor !== 'object' || valor === null) return null;
  return valor as CuerpoZona;
}

/**
 * Normaliza lo que llega del cliente. `''`, espacios y `null` son «heredar»
 * (NULL en la columna). Cualquier otra cosa tiene que ser un nombre IANA
 * canónico: PostgREST acepta cualquier texto y el fallo aparecería mucho
 * después, en un `at time zone` de un trigger.
 */
function normalizar(timezone: unknown): { ok: true; valor: string | null } | { ok: false } {
  if (timezone === null || timezone === undefined) return { ok: true, valor: null };
  if (typeof timezone !== 'string') return { ok: false };
  const valor = timezone.trim();
  if (valor.length === 0) return { ok: true, valor: null };
  if (!isSupportedTimeZone(valor)) return { ok: false };
  return { ok: true, valor };
}

async function guardar(ctx: ServerOrgContext, req: Request): Promise<Response> {
  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return jsonError(400, 'BAD_JSON', 'Cuerpo no es JSON válido');
  }

  const cuerpo = leerCuerpo(crudo);
  if (!cuerpo) return jsonError(400, 'BAD_BODY', 'Cuerpo no es un objeto');

  const zona = normalizar(cuerpo.timezone);
  if (!zona.ok) {
    return jsonError(400, 'TIMEZONE_INVALID', `Zona horaria no reconocida: ${cuerpo.timezone}`);
  }

  const scope = cuerpo.scope ?? 'organization';

  if (scope === 'organization') {
    if (zona.valor === null) {
      return jsonError(
        400,
        'TIMEZONE_REQUIRED',
        'La organización es la raíz de la cascada: no puede heredar.',
      );
    }
    const { error } = await ctx.supabase
      .from('organizations')
      .update({ timezone: zona.valor })
      .eq('id', ctx.organizationId);
    if (error) return jsonError(400, 'TIMEZONE_REJECTED', error.message);
    return Response.json({ ok: true, scope, timezone: zona.valor });
  }

  if (scope !== 'branch') {
    return jsonError(400, 'BAD_SCOPE', 'scope debe ser organization o branch');
  }

  const branchId = Number(cuerpo.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return jsonError(400, 'BRANCH_REQUIRED', 'branchId es obligatorio con scope branch');
  }

  // Pertenencia: la organización sale de la sesión, así que esta comprobación
  // es la que impide escribir en la sucursal de otro inquilino aunque RLS
  // fuera permisiva.
  const { data: sucursal, error: errorSucursal } = await ctx.supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (errorSucursal) return jsonError(400, 'BRANCH_LOOKUP_FAILED', errorSucursal.message);
  if (!sucursal) {
    return jsonError(404, 'BRANCH_NOT_FOUND', 'La sucursal no es de esta organización');
  }

  const { error } = await ctx.supabase
    .from('branches')
    .update({ timezone: zona.valor })
    .eq('id', branchId)
    .eq('organization_id', ctx.organizationId);
  if (error) return jsonError(400, 'TIMEZONE_REJECTED', error.message);

  // Se devuelve la zona EFECTIVA calculada por la base, no la guardada: es la
  // que el cliente debe mostrar, y sirve de comprobación cruzada de que la
  // cascada del navegador y la de `fn_timezone_for` siguen diciendo lo mismo.
  const { data: efectiva } = await ctx.supabase.rpc('fn_timezone_for', {
    p_organization_id: ctx.organizationId,
    p_branch_id: branchId,
  });

  return Response.json({
    ok: true,
    scope,
    branchId,
    timezone: zona.valor,
    effectiveTimezone: typeof efectiva === 'string' ? efectiva : null,
  });
}

export const PUT = withOrg(guardar, { admin: true });
