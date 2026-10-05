/**
 * ¿Esta organización puede recibir un correo operativo?
 *
 * Operativo: avisos al miembro, reportes programados y la invitación de una
 * reunión. No entra aquí el correo de acceso (invitación, contraseña, aviso de
 * cuenta existente) ni el que la organización manda a sus propios clientes.
 *
 * La regla es la de la cuenta congelada (`checkOrgAndSubscriptionStatus`):
 * suspendida o eliminada, suscripción cancelada, pago pendiente, incompleta, o
 * prueba cuyo fin ya pasó. También corta `frozen` y `trial_expired`, que el
 * selector de organización ya muestra como congeladas. `inactive` sigue
 * recibiendo: el acceso a la app no la congela. No mira el último ingreso:
 * una empresa de temporada puede estar días sin entrar y seguir al día.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type MotivoSinCorreoOperativo =
  | 'organizacion_suspendida'
  | 'organizacion_congelada'
  | 'organizacion_eliminada'
  | 'prueba_vencida'
  | 'suscripcion_cancelada'
  | 'pago_pendiente'
  | 'suscripcion_incompleta'
  | 'suscripcion_pausada'
  | 'organizacion_inexistente';

export type VeredictoCorreoOperativo =
  | { enviar: true }
  | { enviar: false; motivo: MotivoSinCorreoOperativo | 'consulta' };

export type DecisionCorreoOperativo = 'enviar' | 'omitir' | 'reintentar';

export interface CuentaParaCorreo {
  estadoOrganizacion: string | null | undefined;
  estadoSuscripcion?: string | null;
  finPrueba?: string | null;
  finPeriodo?: string | null;
}

const MOTIVO_POR_ESTADO: Record<string, MotivoSinCorreoOperativo> = {
  suspended: 'organizacion_suspendida',
  frozen: 'organizacion_congelada',
  deleted: 'organizacion_eliminada',
  trial_expired: 'prueba_vencida',
};

function instante(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function motivoSuscripcion(cuenta: CuentaParaCorreo, ahora: Date): MotivoSinCorreoOperativo | null {
  const estado = (cuenta.estadoSuscripcion ?? '').trim().toLowerCase();
  if (!estado) return null;
  if (estado === 'canceled') return 'suscripcion_cancelada';
  if (estado === 'past_due' || estado === 'unpaid') return 'pago_pendiente';
  if (estado === 'incomplete' || estado === 'incomplete_expired') return 'suscripcion_incompleta';
  if (estado === 'paused') return 'suscripcion_pausada';
  if (estado === 'trialing') {
    const fin = instante(cuenta.finPrueba) ?? instante(cuenta.finPeriodo);
    if (fin && fin < ahora) return 'prueba_vencida';
  }
  return null;
}

/** `null` cuando el correo operativo sí sale. */
export function motivoSinCorreoOperativo(cuenta: CuentaParaCorreo, ahora: Date = new Date()): MotivoSinCorreoOperativo | null {
  const estado = (cuenta.estadoOrganizacion ?? '').trim().toLowerCase();
  if (!estado || estado === 'active' || estado === 'inactive') return motivoSuscripcion(cuenta, ahora);
  return MOTIVO_POR_ESTADO[estado] ?? 'organizacion_congelada';
}

/** Una consulta fallida se reintenta. Una cuenta cerrada no vuelve a encolarse. */
export function decisionCorreoOperativo(veredicto: VeredictoCorreoOperativo): DecisionCorreoOperativo {
  if (veredicto.enviar) return 'enviar';
  return veredicto.motivo === 'consulta' ? 'reintentar' : 'omitir';
}

interface FilaOrganizacion {
  status?: string | null;
}

interface FilaSuscripcion {
  status?: string | null;
  trial_end?: string | null;
  current_period_end?: string | null;
}

function filaUnica<T>(data: T | T[] | null | undefined): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

/** Lee la organización y su suscripción más reciente. Si la lectura falla, no envía en este pase. */
export async function veredictoCorreoOperativo(
  db: SupabaseClient,
  organizationId: number,
  ahora: Date = new Date(),
): Promise<VeredictoCorreoOperativo> {
  const { data: org, error: errorOrg } = await db
    .from('organizations')
    .select('status')
    .eq('id', organizationId)
    .maybeSingle();
  if (errorOrg) {
    console.error('[cuenta-correo] organizacion', { organizationId, message: errorOrg.message });
    return { enviar: false, motivo: 'consulta' };
  }
  const filaOrg = filaUnica(org as FilaOrganizacion | FilaOrganizacion[] | null);
  if (!filaOrg) return { enviar: false, motivo: 'organizacion_inexistente' };

  const motivoOrg = motivoSinCorreoOperativo({ estadoOrganizacion: filaOrg.status }, ahora);
  if (motivoOrg) return { enviar: false, motivo: motivoOrg };

  const { data: subs, error: errorSub } = await db
    .from('subscriptions')
    .select('status, trial_end, current_period_end')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errorSub) {
    console.error('[cuenta-correo] suscripcion', { organizationId, message: errorSub.message });
    return { enviar: false, motivo: 'consulta' };
  }
  const filaSub = filaUnica(subs as FilaSuscripcion | FilaSuscripcion[] | null);
  if (!filaSub) return { enviar: true };

  const motivo = motivoSinCorreoOperativo({
    estadoOrganizacion: filaOrg.status,
    estadoSuscripcion: filaSub.status,
    finPrueba: filaSub.trial_end,
    finPeriodo: filaSub.current_period_end,
  }, ahora);
  return motivo ? { enviar: false, motivo } : { enviar: true };
}
