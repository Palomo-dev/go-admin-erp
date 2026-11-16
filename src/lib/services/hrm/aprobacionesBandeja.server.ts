/**
 * Bandeja «Mis aprobaciones» (Figma 20.7) y el detalle de una solicitud.
 * `fn_hr_aprobaciones_bandeja` y `fn_hr_aprobacion_ver` solo las ejecuta la
 * service role, con el actor de la sesión: muestran el monto solo a quien
 * tiene el permiso de salario de esa persona, y esa lectura queda registrada.
 * Decidir y retirar siguen por `fn_hr_aprobacion_decidir` / `_cancelar`
 * (aprobacionesService.server.ts), con la sesión del usuario.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import { HrmError, errorDeRpc, esUuid, type ContextoPeticion } from './tipos';
import type { ContextoPersonas } from './personasService.server';

export type EstadoBandeja = 'pendientes' | 'resueltas';

export async function bandeja(ctx: ContextoPersonas, estado: string | null, p: ContextoPeticion) {
  const e: EstadoBandeja = estado === 'resueltas' ? 'resueltas' : 'pendientes';
  const { data, error } = await getServiceClient().rpc('fn_hr_aprobaciones_bandeja', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_estado: e,
    p_ip: p.ip,
    p_ua: p.userAgent,
    p_ruta: p.ruta,
  });
  if (error) throw errorDeRpc(error);
  return data as Record<string, unknown>;
}

export async function verSolicitud(ctx: ContextoPersonas, instanciaId: string, p: ContextoPeticion) {
  if (!esUuid(instanciaId)) throw new HrmError(400, 'solicitud_invalida');
  const { data, error } = await getServiceClient().rpc('fn_hr_aprobacion_ver', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_instancia: instanciaId,
    p_ip: p.ip,
    p_ua: p.userAgent,
    p_ruta: p.ruta,
  });
  if (error) throw errorDeRpc(error);
  return data as Record<string, unknown>;
}
