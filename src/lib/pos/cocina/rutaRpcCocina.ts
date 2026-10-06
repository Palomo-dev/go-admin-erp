/**
 * Esqueleto común de las rutas POST de Comandas v2 (/api/pos/cocina/estado,
 * /item, /cancelar, /mover-item, /cerrar-anteriores, /avisar-mesero).
 *
 * - La organización y el actor salen de la SESIÓN (`getServerOrgContext`); una
 *   organización ajena en el body → 403 y registro (`readOrgBody`).
 * - El permiso (operar / gestionar la cocina) se resuelve aquí, en el servidor,
 *   y la RPC lo vuelve a comprobar (`fn_pos_cocina_puede`).
 * - Las RPC solo las ejecuta `service_role`.
 * - Si la RPC todavía no existe (migración 20261006171155 sin aplicar), la ruta
 *   responde 501 `rpc_no_disponible` y el cliente sigue con el camino anterior.
 */
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { errorDeRpcCocina, rpcNoDisponible, sinClavesDeOrganizacion } from './rutasCocina';
import { puedeCocina, type NivelCocina } from './permisosCocina';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export function errorCocina(status: number, codigo: string) {
  return NextResponse.json({ error: codigo, codigo }, { status, headers: SIN_CACHE });
}

export function respuestaOrgError(err: unknown) {
  if (err instanceof OrgContextError) {
    return NextResponse.json({ error: err.message, code: err.code, codigo: err.code }, { status: err.statusCode, headers: SIN_CACHE });
  }
  return null;
}

/**
 * Valida el body (ya leído con `readOrgBody` en la ruta), comprueba el permiso
 * y llama la RPC. La ruta conserva `getServerOrgContext` + `readOrgBody` en su
 * propio handler (guardarraíl 5).
 */
export async function ejecutarRpcCocina<S extends z.ZodTypeAny>(
  ctx: ServerOrgContext,
  body: unknown,
  opciones: {
    ruta: string;
    schema: S;
    nivel: NivelCocina | ((datos: z.infer<S>) => NivelCocina);
    rpc: string;
    args: (ctx: ServerOrgContext, datos: z.infer<S>) => Record<string, unknown>;
  },
) {
  const parsed = opciones.schema.safeParse(sinClavesDeOrganizacion(body));
  if (!parsed.success) return errorCocina(400, 'datos_invalidos');
  const nivel = typeof opciones.nivel === 'function' ? opciones.nivel(parsed.data) : opciones.nivel;
  if (!(await puedeCocina(ctx, nivel))) return errorCocina(403, 'sin_permiso');

  const { data, error } = await getServiceClient().rpc(opciones.rpc, opciones.args(ctx, parsed.data));
  if (error) {
    if (rpcNoDisponible(error)) return errorCocina(501, 'rpc_no_disponible');
    const traducido = errorDeRpcCocina(error);
    if (traducido.status >= 500) {
      console.error(`[${opciones.ruta}]`, { organizationId: ctx.organizationId, message: error.message });
    }
    return errorCocina(traducido.status, traducido.codigo);
  }
  return NextResponse.json({ resultado: data }, { headers: SIN_CACHE });
}
