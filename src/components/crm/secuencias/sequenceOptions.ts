/**
 * Catálogos y funciones puras de la interfaz de secuencias: disparadores,
 * condiciones de salida, motivos de salida, tasa de respuesta, advertencia de
 * inscripción y validación de horas. Sin React.
 *
 * Pruebas: los catálogos se contrastan con los literales del motor en
 * `src/lib/services/crm/__tests__/sequenceStatsIo.test.ts`; las funciones
 * (`responseSummary`, `enrollmentTitle`, `hoursError`, `enrollWarning`,
 * `stepsCountLabel`, `unsupportedExitConditions`, `enrollBlockReason`,
 * `enrollErrorText`, `joinChannelNames`, `activeStepCount`) en
 * `__tests__/sequenceOptions.test.ts`, junto a este archivo.
 */

import { CUSTOMER_FACING_CHANNELS, channelLabel } from '@/lib/services/crm/sequenceTimeline';

export const TRIGGER_OPTIONS = [
  { value: 'manual', label: 'Manual', hint: 'Se inscribe a mano desde la lista' },
  { value: 'stage_change', label: 'Cambio de etapa', hint: 'Cuando una oportunidad cambia de etapa' },
  { value: 'lead_capture', label: 'Captura de lead', hint: 'Cuando entra un lead nuevo' },
  { value: 'event', label: 'Evento', hint: 'Cuando ocurre un evento del CRM' },
  { value: 'custom', label: 'Personalizado', hint: 'Lo dispara una automatización' },
] as const;

export function triggerLabel(value: string): string {
  return TRIGGER_OPTIONS.find((t) => t.value === value)?.label ?? value;
}

/**
 * Condiciones de salida que ofrece el formulario: SOLO las que implementa
 * `checkExitConditions`. `stage_changed` y `replied` se retiraron (r2 #3):
 * el motor no las evalúa y ofrecerlas prometía algo que no pasaba.
 * `won_lost` se aplica siempre, esté marcada o no.
 */
export const EXIT_CONDITION_VALUES = ['won_lost', 'opted_out'] as const;
export const ALWAYS_ON_EXIT_CONDITION = 'won_lost';

/**
 * Motivos de salida tal y como los escribe el motor (`checkExitConditions`,
 * `unenrollFromSequence`, `unenroll_sequence` de automatizaciones y
 * `fn_resume_sequence_enrollment`). La prueba los contrasta con el código.
 */
export const EXIT_REASON_LABELS: Record<string, string> = {
  opportunity_won: 'la oportunidad se ganó',
  opportunity_lost: 'la oportunidad se perdió',
  opportunity_closed: 'la oportunidad se cerró',
  opted_out: 'el cliente pidió no recibir mensajes',
  all_steps_completed: 'todos los pasos ejecutados',
  condition_false: 'una condición no se cumplió',
  condition_unevaluable: 'una condición no se pudo evaluar',
  step_failed: 'falló un paso y la secuencia corta',
  manual_unenroll: 'desinscripción manual',
  rule_unenroll: 'la sacó una automatización',
};

/** Texto humano del motivo (pausa o salida). Desconocido → se muestra en crudo. */
export function reasonText(reason: string | null | undefined): string {
  if (!reason) return '';
  if (reason.startsWith('customer_replied')) return 'el cliente respondió';
  return EXIT_REASON_LABELS[reason] ?? reason;
}

/** Nombre visible de una inscripción; sin nombre, un id corto: dos «sin nombre» eran indistinguibles (R4). */
export function enrollmentTitle(e: { id: string; opportunity_name?: string | null; customer_name?: string | null }): string {
  return e.opportunity_name ?? e.customer_name ?? `Oportunidad sin nombre · ${e.id.slice(0, 8)}`;
}

/**
 * Texto visible de la tarjeta: «pausadas por respuesta: 2 de 8» dice QUÉ
 * cuenta (`paused_reason = customer_replied_*`, escrito solo por
 * `fn_pause_sequences_on_reply`; al reanudar el motor lo borra). Esa función
 * solo actúa `WHERE s.pause_on_reply`: con la casilla desactivada un «0 de N»
 * sería falso, así que se dice «no se registran respuestas» (r2 #3). Lo
 * definitivo —conservar el hecho al reanudar— es migración, pendiente.
 */
export function responseSummary(
  stats: { replied: number; total: number } | null | undefined,
  pauseOnReply: boolean | undefined,
): string {
  if (!stats || stats.total <= 0) return 'sin inscritos';
  if (pauseOnReply === false) {
    return stats.replied > 0 ? `pausadas por respuesta: ${stats.replied} de ${stats.total} · ya no se registran` : 'no se registran respuestas';
  }
  return `pausadas por respuesta: ${stats.replied} de ${stats.total}`;
}

/** Condiciones de salida guardadas que el formulario ya no ofrece (el motor no las evalúa): se avisa antes de perderlas al guardar. */
export function unsupportedExitConditions(saved: unknown[] | null | undefined): string[] {
  const offered: ReadonlySet<string> = new Set(EXIT_CONDITION_VALUES);
  const out: string[] = [];
  for (const c of saved ?? []) {
    const name = typeof c === 'string' ? c : (c as { type?: string } | null)?.type ?? '';
    if (name && !offered.has(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/** «1 paso» / «2 pasos» para el `aria-label` de la lista de pasos del diálogo de inscripción. */
export function stepsCountLabel(n: number): string {
  return `${n} paso${n === 1 ? '' : 's'}, empezando por el primero`;
}

/**
 * Advertencia del diálogo de inscripción: qué canales llegan a una persona
 * real y qué dato de contacto falta. Antes vivía inline en `EnrollDialog`.
 */
export function enrollWarning(
  steps: { channel: string }[],
  candidate: { customer_email: string | null },
): { sendsToCustomer: boolean; channelNames: string; needsEmail: boolean; contactNote: string } {
  const channels = Array.from(new Set(steps.map((s) => s.channel).filter((c) => CUSTOMER_FACING_CHANNELS.has(c))));
  const needsEmail = channels.includes('email');
  const contactNote = candidate.customer_email
    ? ` (${candidate.customer_email})`
    : needsEmail ? ' (sin email: los correos fallarán)' : '';
  return { sendsToCustomer: channels.length > 0, channelNames: joinChannelNames(channels.map(channelLabel)), needsEmail, contactNote };
}

/** «Email, WhatsApp y SMS»: comas y una sola «y» (antes `join(' y ')`). */
export function joinChannelNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** Pasos que el preview y `fn_enroll_in_sequence` tienen en cuenta: solo los activos (`is_active` ausente cuenta, como el default de la BD). */
export function activeStepCount(steps: { is_active?: boolean }[] | null | undefined): number {
  return (steps ?? []).filter((s) => s.is_active !== false).length;
}

/**
 * Motivo visible por el que «Inscribir» está deshabilitado, o `null` si se
 * puede inscribir. Refleja las dos guardas de `fn_enroll_in_sequence`
 * (`sequence_has_no_active_steps`, `sequence_inactive`) para que el botón no
 * prometa lo que la RPC va a rechazar después de marcar la casilla de envíos
 * reales (tester r3). Sin pasos manda: activar no bastaría.
 */
export function enrollBlockReason(sequence: { is_active: boolean; steps?: { is_active?: boolean }[] | null }): string | null {
  if (activeStepCount(sequence.steps) === 0) return 'Sin pasos no hay nada que enviar: edítala y añade pasos para poder inscribir.';
  if (!sequence.is_active) return 'Activa la secuencia para inscribir.';
  return null;
}

/**
 * Códigos que devuelven `fn_enroll_in_sequence` (RAISE EXCEPTION y `reason`)
 * y `fn_resume_sequence_enrollment`, leídos de `pg_proc`. El servicio los
 * envuelve como `enrollInSequence: <código>`; aquí se desenvuelven.
 */
export const ENROLL_ERROR_LABELS: Record<string, string> = {
  invalid_arguments: 'Faltan datos para inscribir.',
  opportunity_or_customer_required: 'Hace falta una oportunidad o un cliente.',
  forbidden_org: 'No tienes acceso a esta organización.',
  sequence_not_found: 'La secuencia ya no existe.',
  sequence_inactive: 'La secuencia está inactiva: actívala para inscribir.',
  opportunity_not_found: 'La oportunidad ya no existe.',
  customer_not_found: 'El cliente ya no existe.',
  already_active: 'Ya está inscrita en esta secuencia.',
  sequence_has_no_active_steps: 'La secuencia no tiene pasos activos.',
  enrollment_not_found: 'La inscripción ya no existe.',
  not_paused: 'La inscripción no está pausada.',
  no_pending_steps: 'No quedan pasos pendientes que reanudar.',
};

const RPC_ERROR_PREFIX = 'enrollInSequence:';

/** Texto humano de un código de la RPC; desconocido → en crudo (nunca se oculta). */
export function enrollErrorText(reason: string | null | undefined): string {
  if (!reason) return '';
  const code = (reason.startsWith(RPC_ERROR_PREFIX) ? reason.slice(RPC_ERROR_PREFIX.length) : reason).trim();
  return ENROLL_ERROR_LABELS[code] ?? reason;
}

/** Clase del `<select>` nativo del módulo (un solo sitio; antes duplicada). */
export const SELECT_CLASS = 'h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 '
  + 'dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

/** Espera en horas dentro del día: la BD la limita a 0–23 (R5, validación en cliente). */
export function hoursError(hours: unknown): string | null {
  const h = Number(hours);
  if (!Number.isInteger(h) || h < 0 || h > 23) return 'Entre 0 y 23 horas.';
  return null;
}
