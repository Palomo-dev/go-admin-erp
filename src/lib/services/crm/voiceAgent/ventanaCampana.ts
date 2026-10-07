/**
 * Ventana de marcación de una CAMPAÑA del agente de voz.
 *
 * Módulo PURO (sin base, sin red, sin Next). Lo usa `runCampaignQueue` ANTES de
 * reclamar filas con `fn_claim_voice_agent_calls`.
 *
 * Por qué existe (incidente del 2026-10-06, org 125): con `schedule = {}` la
 * campaña no tenía franja propia (`isWithinSchedule` devolvía `true`) y el
 * despachador reclamaba filas a las 00:00. La guarda de la Ley 2300 de
 * `dialClaimedCall` sí frenaba la marcación y reprogramaba a las 07:00 —ninguna
 * llamada salió al teléfono fuera de horario—, pero el reclamo ya había
 * anotado el intento en `voice_agent_call_attempts`: se gastaban intentos y
 * cupo diario/horario de madrugada. Ahora la campaña ni siquiera reclama fuera
 * de la franja legal.
 *
 * Reglas:
 *  1. La franja legal de la Ley 2300 de 2023 (`ley2300.ts`: L-V 7:00–19:00,
 *     sábados 8:00–15:00, nunca domingos ni festivos de Colombia) se aplica
 *     SIEMPRE, con o sin `schedule`. Un `schedule` más amplio que la ley no la
 *     amplía.
 *  2. Si la campaña declara horas propias (`start_hour`/`end_hour`, y
 *     opcionalmente `days`), además deben cumplirse. Un `schedule` vacío
 *     significa «solo la franja legal», nunca «sin restricción».
 *  3. Zona: la del `schedule` si la trae; si no, la de la organización
 *     (`getOrganizationTimezone`); si no, America/Bogota. Zona inválida →
 *     cerrada (fail-closed: no se marca a ciegas).
 *
 * Esta es una barrera de campaña. La guarda por destinatario
 * (`evaluarLey2300Cliente` en `dialClaimedCall`, con la zona del número) sigue
 * siendo la autoridad final para cada llamada.
 */

import { diaSemana, partesLocales, ventanaLey2300Abierta, ZONA_COLOMBIA } from './ley2300';

export interface HorarioCampana {
  /** 0 = domingo … 6 = sábado. */
  days?: number[];
  start_hour?: number;
  end_hour?: number;
  timezone?: string;
}

export type MotivoVentanaCerrada = 'zona_invalida' | 'ley2300' | 'horario_campana';

export type VentanaCampana =
  | { abierta: true; zona: string }
  | { abierta: false; zona: string; motivo: MotivoVentanaCerrada };

/** ¿Es una zona IANA que el runtime sabe resolver? */
export function zonaValida(zona: string | null | undefined): zona is string {
  if (!zona || typeof zona !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/** ¿El `schedule` declara una franja propia (horas de inicio y fin)? */
export function tieneHorarioPropio(schedule: HorarioCampana | null | undefined): boolean {
  return !!schedule && typeof schedule.start_hour === 'number' && typeof schedule.end_hour === 'number';
}

/**
 * Franja PROPIA de la campaña (sin la ley). Sin horas declaradas → `true`
 * (no añade restricción). Con horas y zona inválida → `false`.
 */
export function horarioPropioAbierto(
  schedule: HorarioCampana | null | undefined,
  zona: string,
  ahora: Date = new Date()
): boolean {
  if (!tieneHorarioPropio(schedule)) return true;
  if (!zonaValida(zona)) return false;
  const p = partesLocales(ahora, zona);
  const dia = diaSemana(p.fecha);
  if (schedule!.days && schedule!.days.length > 0 && !schedule!.days.includes(dia)) return false;
  const hora = Math.floor(p.minutosDelDia / 60);
  return hora >= schedule!.start_hour! && hora < schedule!.end_hour!;
}

/** Zona efectiva de la campaña: la del schedule → la de la organización → Colombia. */
export function zonaCampana(schedule: HorarioCampana | null | undefined, zonaOrganizacion?: string | null): string {
  return schedule?.timezone || zonaOrganizacion || ZONA_COLOMBIA;
}

/** Barrera de campaña: franja legal (siempre) Y franja propia (si la hay). */
export function evaluarVentanaCampana(
  schedule: HorarioCampana | null | undefined,
  zonaOrganizacion?: string | null,
  ahora: Date = new Date()
): VentanaCampana {
  const zona = zonaCampana(schedule, zonaOrganizacion);
  if (!zonaValida(zona)) return { abierta: false, zona, motivo: 'zona_invalida' };
  if (!ventanaLey2300Abierta(ahora, zona)) return { abierta: false, zona, motivo: 'ley2300' };
  if (!horarioPropioAbierto(schedule, zona, ahora)) return { abierta: false, zona, motivo: 'horario_campana' };
  return { abierta: true, zona };
}
