/**
 * Cupo del plan (usuarios y sucursales): lectura de la ÚNICA fuente,
 * `fn_cupo_plan(p_org)` (migración pendiente 20261006150000_cupo_plan_servidor),
 * y reconocimiento del error que lanzan sus disparadores.
 *
 * Auditoría de Organización 2026-10, P0-4: el cupo solo existía en el
 * navegador (cinco cálculos distintos). Ahora lo hace cumplir la base
 * —disparadores BEFORE en organization_members, branches e invitations— y
 * este módulo es lo único que lo lee en el servidor (`GET /api/me/plan`).
 *
 * Sin dependencias de servidor: `errorDeCupo` también lo usa el navegador
 * (crear sucursal y reactivar miembro escriben con la sesión).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Hints estables de los disparadores (`raise ... using hint = ...`). */
export const HINT_CUPO_USUARIOS = 'cupo_plan_usuarios';
export const HINT_CUPO_SUCURSALES = 'cupo_plan_sucursales';

export type CodigoCupo = 'CUPO_PLAN_USUARIOS' | 'CUPO_PLAN_SUCURSALES';

export interface ErrorCupo {
  codigo: CodigoCupo;
  /** El mensaje de la base, ya en español y con los números («El plan permite 10 usuarios…»). */
  mensaje: string;
}

interface ErrorPostgrestLike {
  hint?: string | null;
  message?: string | null;
}

/** ¿Es el rechazo de un disparador de cupo? Devuelve código y mensaje para responder 409. */
export function errorDeCupo(error: ErrorPostgrestLike | null | undefined): ErrorCupo | null {
  if (!error) return null;
  const mensaje = (error.message ?? '').trim();
  if (error.hint === HINT_CUPO_USUARIOS) return { codigo: 'CUPO_PLAN_USUARIOS', mensaje };
  if (error.hint === HINT_CUPO_SUCURSALES) return { codigo: 'CUPO_PLAN_SUCURSALES', mensaje };
  return null;
}

/** Fila de `fn_cupo_plan`. Máximos `null` = ilimitado (plan a medida). */
export interface FilaCupoPlan {
  plan_id: number | null;
  plan_codigo: string | null;
  /** Estado de la suscripción que rige, o 'sin_suscripcion' / 'vencida' (plan free). */
  estado: string | null;
  max_usuarios: number | null;
  usuarios_activos: number;
  invitaciones_vigentes: number;
  extra_usuarios: number;
  max_sucursales: number | null;
  sucursales_activas: number;
  extra_sucursales: number;
}

/** Forma de `uso.usuarios` y `uso.sucursales` en `GET /api/me/plan`. */
export interface UsoCupo {
  usuarios: { actual: number; maximo: number | null; comprados: number; invitacionesVigentes: number };
  sucursales: { actual: number; maximo: number | null; comprados: number };
}

function entero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function enteroONulo(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function usoDesdeFila(fila: Partial<FilaCupoPlan>): UsoCupo {
  return {
    usuarios: {
      actual: entero(fila.usuarios_activos),
      maximo: enteroONulo(fila.max_usuarios),
      comprados: entero(fila.extra_usuarios),
      invitacionesVigentes: entero(fila.invitaciones_vigentes),
    },
    sucursales: {
      actual: entero(fila.sucursales_activas),
      maximo: enteroONulo(fila.max_sucursales),
      comprados: entero(fila.extra_sucursales),
    },
  };
}

/** PGRST202: la función no está en el esquema expuesto; 42883: no existe. */
export function esFuncionAusente(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

/**
 * Cupo de la organización con el cliente de servicio (`fn_cupo_plan` solo la
 * ejecuta `service_role`). `organizationId` tiene que venir YA validado de la
 * sesión. Devuelve `null` si la migración aún no está aplicada (la ruta cae al
 * cálculo anterior mientras tanto); cualquier otro error se lanza.
 */
export async function leerCupoPlan(servicio: SupabaseClient, organizationId: number): Promise<UsoCupo | null> {
  const { data, error } = await servicio.rpc('fn_cupo_plan', { p_org: organizationId });
  if (error) {
    if (esFuncionAusente(error)) return null;
    throw new Error(`fn_cupo_plan: ${error.message}`);
  }
  const fila = (Array.isArray(data) ? data[0] : data) as Partial<FilaCupoPlan> | null | undefined;
  return usoDesdeFila(fila ?? {});
}
