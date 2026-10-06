import type { ScheduledKind } from './scheduledOrgs';

/**
 * Contrato ÚNICO de scheduling de la cola `outbound_jobs` (F0-JOBS r3, QA r2 N-3).
 *
 * Decisión (FASE-00 §2.2 / §13 r3): **Vercel Cron es el scheduler primario** y
 * pg_cron (jobs 17/18/19, `active=false`) el respaldo manual. Motivo: desde el
 * commit `9c0288a7` (circuit-breaker por 522/544) el drenaje total pasó de
 * «cada minuto» a «cada 2 minutos» (`DRAIN_SCHEDULE`), y la evidencia en BD (`recording_cleanup` diario
 * desde 2026-09-11) demuestra que Vercel ya lo ejecuta. Mientras pg_cron siga
 * apagado no hay doble ejecución; si el dueño lo activa, los jobs 17 y 19 deben
 * alinearse con este módulo (migración `crm_v4_f00_41`, pendiente de aplicar).
 *
 * Este módulo NO importa nada de servidor: lo leen la ruta `run`, la UI
 * (`JobsMonitor`) y el guardarraíl 18 de `src/__tests__/guardrails.test.ts`,
 * que comprueba que `vercel.json` coincide con lo declarado aquí.
 */

/** Ruta que drena la cola (misma para los tres crons de `vercel.json`). */
export const JOBS_RUN_PATH = '/api/crm/jobs/run';

/** Minutos entre drenajes totales (sin kinds). La UI lo muestra como latencia máxima. */
export const DRAIN_INTERVAL_MIN = 2;

/** Cron del drenaje total: «cada N minutos» con N = `DRAIN_INTERVAL_MIN`. */
export const DRAIN_SCHEDULE = `*/${DRAIN_INTERVAL_MIN} * * * *`;

/**
 * Crons de Vercel que comparten `JOBS_RUN_PATH` y se distinguen por el header
 * `x-vercel-cron-schedule`. Un schedule ausente aquí ⇒ drenaje total.
 * 08:30 UTC = 03:30 Bogotá (Vercel y pg_cron usan UTC).
 */
export const VERCEL_SCHEDULE_KINDS: Readonly<Record<string, readonly ScheduledKind[]>> = {
  // `voice_campaigns` (F6) viaja en el cron que YA existe: no se añade una
  // entrada nueva a `crons` de `vercel.json` (el número de crons está limitado)
  // y el drenaje de `campaign_batch` no se toca. Es una `ScheduledTask`, así que
  // `splitScheduledKinds` la aparta de los kinds de cola: el runner no intenta
  // drenar nada con ese nombre.
  '*/5 * * * *': ['campaign_batch', 'voice_campaigns'],
  '30 8 * * *': ['recording_cleanup', 'maintenance', 'health_recalculate', 'renewals_sync'],
};

/** Todos los schedules válidos para `JOBS_RUN_PATH` en `vercel.json`. */
export const JOBS_RUN_SCHEDULES: readonly string[] = [DRAIN_SCHEDULE, ...Object.keys(VERCEL_SCHEDULE_KINDS)];

/**
 * Minutos entre pasadas de una tarea programada con cron de intervalo
 * («*\/N * * * *»), leídos de `VERCEL_SCHEDULE_KINDS`. `null` si la tarea no
 * está programada o su cron no es de intervalo (p. ej. diaria). Lo usa el panel
 * de campañas de voz para decir «llama sola cada N min» sin cablear el 5.
 */
export function intervaloMinutosDe(kind: ScheduledKind): number | null {
  for (const [cron, kinds] of Object.entries(VERCEL_SCHEDULE_KINDS)) {
    if (!kinds.includes(kind)) continue;
    const m = /^\*\/(\d{1,2}) \* \* \* \*$/.exec(cron);
    return m ? Number(m[1]) : null;
  }
  return null;
}

/** Siguiente múltiplo de `minutos` (las pasadas caen en minutos redondos UTC, y toda zona horaria real es múltiplo de 5 min). */
export function proximaPasada(minutos: number, ahora: Date = new Date()): Date {
  const paso = Math.max(1, Math.round(minutos)) * 60_000;
  return new Date(Math.floor(ahora.getTime() / paso) * paso + paso);
}
