/**
 * Politica de respuesta del bot conversacional — logica pura, sin dependencias.
 *
 * Este archivo es el primer ladrillo del nucleo compartido de la Fase 1: no
 * importa Deno ni Next, asi que lo puede usar la Edge Function (con la extension
 * `.ts` en el import, como exige Deno) y lo puede testear Jest (importandolo sin
 * extension). Toda decision que se pueda tomar sin tocar la base de datos vive
 * aqui, para que sea verificable.
 */

/** Horario laboral de un canal, tal como se guarda en `channels.business_hours`. */
export interface FranjaHoraria {
  open?: string;
  close?: string;
  closed?: boolean;
}
export type HorarioSemanal = Record<string, FranjaHoraria>;

/**
 * Comparacion en tiempo constante. Evita filtrar el secreto compartido por el
 * tiempo que tarda en fallar la comparacion.
 */
export function secretosCoinciden(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const DIAS = [
  'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
];

/** Acepta 'miercoles' y 'miércoles', y 'sabado' y 'sábado'. */
function buscarDia(horario: HorarioSemanal, indiceDia: number): FranjaHoraria | undefined {
  const base = DIAS[indiceDia];
  if (horario[base]) return horario[base];
  const conTilde: Record<string, string> = { miercoles: 'miércoles', sabado: 'sábado' };
  const alterno = conTilde[base];
  return alterno ? horario[alterno] : undefined;
}

/**
 * ¿Estamos dentro del horario laboral del canal?
 *
 * Devuelve `null` cuando NO se puede decidir (horario vacio o mal formado). Esa
 * distincion importa: hoy los 7 canales productivos tienen `business_hours = {}`,
 * y tratar "sin horario" como "fuera de horario" haria que el bot cambiara de
 * comportamiento sin que nadie lo pidiera.
 */
export function dentroDeHorarioLaboral(
  horario: HorarioSemanal | null | undefined,
  ahora: Date = new Date()
): boolean | null {
  if (!horario || Object.keys(horario).length === 0) return null;

  const dia = buscarDia(horario, ahora.getUTCDay());
  if (!dia) return null;
  if (dia.closed === true) return false;
  if (!dia.open || !dia.close) return null;

  const [ho, mo] = String(dia.open).split(':').map(Number);
  const [hc, mc] = String(dia.close).split(':').map(Number);
  if ([ho, mo, hc, mc].some((n) => !Number.isFinite(n))) return null;

  const minutos = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  return minutos >= ho * 60 + mo && minutos <= hc * 60 + mc;
}

export type MotivoSilencio =
  | 'canal_manual'
  | 'ia_desactivada'
  | 'agente_humano_activo'
  | 'horario_laboral'
  | null;

export interface EntradaDecision {
  aiMode: string;
  iaActiva: boolean;
  autoRespuestaActiva: boolean;
  /** Minutos desde el ultimo mensaje de un agente humano; null si no hubo. */
  minutosDesdeUltimoAgente: number | null;
  pausaPorAgenteMinutos: number;
  respetarHorarioLaboral: boolean;
  horario: HorarioSemanal | null;
  ahora?: Date;
}

/**
 * Decide si el bot debe responder. Devuelve el motivo del silencio, o `null`
 * cuando si debe responder.
 *
 * Semantica de `ai_mode` (el enum real es ai_only | hybrid | manual; el codigo
 * anterior comparaba contra 'disabled', un valor inexistente):
 *   - manual  -> nunca responde.
 *   - ai_only -> responde siempre.
 *   - hybrid  -> responde salvo que un agente humano este atendiendo, y, solo si
 *                la organizacion lo activa, salvo que sea horario laboral.
 */
export function decidirSilencio(e: EntradaDecision): MotivoSilencio {
  if (e.aiMode === 'manual') return 'canal_manual';
  if (!e.iaActiva || !e.autoRespuestaActiva) return 'ia_desactivada';
  if (e.aiMode !== 'hybrid') return null;

  if (
    e.minutosDesdeUltimoAgente !== null &&
    e.minutosDesdeUltimoAgente <= e.pausaPorAgenteMinutos
  ) {
    return 'agente_humano_activo';
  }

  if (e.respetarHorarioLaboral) {
    const dentro = dentroDeHorarioLaboral(e.horario, e.ahora);
    if (dentro === true) return 'horario_laboral';
  }

  return null;
}
