/**
 * POST /api/inventario/variantes — escrituras del catálogo de variantes (B6a).
 *
 * Body: una acción de `escrituraVariantesSchema` (crear/editar tipo o valor,
 * fusionar, ordenar, activar/desactivar, eliminar sin uso, completar desde las
 * variantes, usar los sugeridos). La lectura va directa por la RPC
 * `fn_variantes_resumen` desde el navegador.
 *
 * Por qué una ruta y cliente de servicio: renombrar o fusionar reescribe
 * `variant_data` de todas las variantes que usan el tipo (11.551 en la
 * organización más grande, ~8 s con su historial) y PostgREST corta a
 * `authenticated` a los 8 s. Con el cliente de servicio no hay ese corte.
 *
 * Seguridad (reglas duras 5 y 6):
 * - La organización sale de la sesión (`withOrg`); una organización ajena en el
 *   cuerpo o la query es 403 registrado (`readOrgBody`).
 * - Antes de tocar nada se lee el permiso con la sesión del usuario
 *   (`fn_inventario_permisos`); sin permiso, 403 registrado.
 * - `fn_variantes_como_actor` (solo `service_role`) ejecuta la RPC pública COMO
 *   el usuario: vuelve a exigir pertenencia y permiso y el historial queda a
 *   su nombre.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import {
  escrituraVariantesSchema,
  estadoHttpDeError,
  permisoDeAccion,
  type ErrorRutaVariantes,
} from '@/components/inventario/variantes/contrato';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RUTA = 'POST /api/inventario/variantes';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

function error(status: number, cuerpo: ErrorRutaVariantes): Response {
  return NextResponse.json(cuerpo, { status, headers: SIN_CACHE });
}

export const POST = withOrg(async (ctx, req) => {
  const crudo: unknown = await readOrgBody(ctx, req, { route: RUTA });
  const sinOrg =
    crudo && typeof crudo === 'object'
      ? Object.fromEntries(Object.entries(crudo).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : {};
  const leido = escrituraVariantesSchema.safeParse(sinOrg);
  if (!leido.success) return error(400, { codigo: 'datos_invalidos' });
  const { accion, ...args } = leido.data;

  const permiso = permisoDeAccion(accion);
  const { data: permisos, error: errorPermisos } = await ctx.supabase.rpc('fn_inventario_permisos', {
    p_org: ctx.organizationId,
  });
  const concedido = !errorPermisos && (permisos as Record<string, unknown> | null)?.[permiso] === true;
  if (!concedido) {
    console.warn('[inventario/variantes] sin permiso', {
      ruta: RUTA,
      accion,
      permiso,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    return error(403, { codigo: 'sin_permiso' });
  }

  const { data, error: errorRpc } = await getServiceClient().rpc('fn_variantes_como_actor', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_accion: accion,
    p_args: args,
  });
  if (errorRpc) {
    const status = estadoHttpDeError(errorRpc.code);
    if (status >= 500) console.error('[inventario/variantes] error de la RPC', { ruta: RUTA, accion, code: errorRpc.code, message: errorRpc.message });
    const relacionado = errorRpc.hint && /^\d+$/.test(errorRpc.hint) ? Number(errorRpc.hint) : null;
    return error(status, { codigo: status >= 500 ? 'error_interno' : errorRpc.message, sqlstate: errorRpc.code, relacionado });
  }
  return NextResponse.json({ resultado: data }, { headers: SIN_CACHE });
});
