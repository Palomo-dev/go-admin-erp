/**
 * Envíos programados de reportes (`scheduled_reports`): cuándo sale el
 * siguiente, qué periodo cubre y cómo se leen los destinatarios guardados.
 * Puro: lo usan las rutas, el cron, el diálogo «Programar envío» y los tests.
 *
 * - Las horas son de pared en `zona_horaria` (la de la organización al
 *   programarlo): «lunes 7:00 a. m.» sigue siendo las 7:00 con o sin horario
 *   de verano (`wallTimeToInstant`).
 * - Cada envío cubre el periodo ANTERIOR completo del tipo elegido, calculado
 *   el día del envío en esa zona: un semanal del lunes manda la semana que
 *   acaba de terminar.
 */
import { addPlainDays, toPlainDate, wallTimeToInstant } from '@/lib/utils/dateCore';
import { esHora, periodoAnterior, resolverPeriodo } from '../periodosService';
import type { PeriodoCierre, TipoCierre } from '../types';

export const FRECUENCIAS = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'custom'] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

export const FORMATOS_ENVIO = ['pdf', 'excel', 'pdf_excel', 'csv'] as const;
export type FormatoEnvio = (typeof FORMATOS_ENVIO)[number];

/** Periodos que puede cubrir un envío (el personalizado no tiene «anterior» útil). */
export const PERIODOS_ENVIO = ['diario', 'semanal', 'quincenal', 'mensual', 'trimestral', 'semestral', 'anual'] as const satisfies readonly TipoCierre[];
export type PeriodoEnvio = (typeof PERIODOS_ENVIO)[number];

export const COMPARATIVOS = ['anterior', 'anio-anterior'] as const;
export type Comparativo = (typeof COMPARATIVOS)[number];

/** Periodo que cubre cada frecuencia si nadie elige otro. */
export const PERIODO_POR_FRECUENCIA: Record<Frecuencia, PeriodoEnvio> = {
  daily: 'diario',
  weekly: 'semanal',
  biweekly: 'quincenal',
  monthly: 'mensual',
  quarterly: 'trimestral',
  custom: 'diario',
};

export interface FiltrosEnvio {
  periodo: PeriodoEnvio;
  horaInicio: string | null;
  horaFin: string | null;
  comparar: Comparativo | null;
  vista: string | null;
}

export type MotivoPausa = 'sin_membresia' | 'sin_permiso' | 'sin_alcance' | 'modulo_no_contratado' | 'aprobador_sin_acceso' | 'rebote';

export interface DestinatarioMiembro {
  tipo: 'miembro';
  user_id: string;
  email: string;
  nombre: string | null;
  estado: 'activo' | 'pausado';
  motivo: MotivoPausa | null;
}

export interface DestinatarioExterno {
  tipo: 'externo';
  email: string;
  estado: 'pendiente' | 'activo' | 'pausado';
  aprobado_por: string | null;
  motivo: MotivoPausa | null;
}

export type Destinatario = DestinatarioMiembro | DestinatarioExterno;

export interface Programacion {
  frequency: Frecuencia;
  /** `HH:mm` (o `HH:mm:ss`, como lo devuelve la columna `time`). */
  hora: string;
  dia: number | null;
  dias_semana: number[] | null;
  zona: string;
}

export function esFrecuencia(v: unknown): v is Frecuencia {
  return typeof v === 'string' && (FRECUENCIAS as readonly string[]).includes(v);
}

export function esFormatoEnvio(v: unknown): v is FormatoEnvio {
  return typeof v === 'string' && (FORMATOS_ENVIO as readonly string[]).includes(v);
}

export function esPeriodoEnvio(v: unknown): v is PeriodoEnvio {
  return typeof v === 'string' && (PERIODOS_ENVIO as readonly string[]).includes(v);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function esCorreo(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
}

/** Día ISO de la semana de un día calendario (1 = lunes … 7 = domingo). */
export function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  const js = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

function diaDelMes(fecha: string): number {
  return Number(fecha.slice(8, 10));
}

function mesDe(fecha: string): number {
  return Number(fecha.slice(5, 7));
}

/** ¿Sale un envío ese día calendario? */
export function tocaElDia(p: Pick<Programacion, 'frequency' | 'dia' | 'dias_semana'>, fecha: string): boolean {
  switch (p.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return diaSemana(fecha) === (p.dia ?? 1);
    case 'biweekly':
      return diaDelMes(fecha) === 1 || diaDelMes(fecha) === 16;
    case 'monthly':
      return diaDelMes(fecha) === (p.dia ?? 1);
    case 'quarterly':
      return (mesDe(fecha) - 1) % 3 === 0 && diaDelMes(fecha) === (p.dia ?? 1);
    case 'custom':
      return (p.dias_semana ?? []).includes(diaSemana(fecha));
  }
}

/** Configuración coherente: el día que exige cada frecuencia. */
export function programacionValida(p: Pick<Programacion, 'frequency' | 'hora' | 'dia' | 'dias_semana'>): boolean {
  if (!esFrecuencia(p.frequency) || !esHora(p.hora.slice(0, 5))) return false;
  const entero = (n: number | null, max: number) => n !== null && Number.isInteger(n) && n >= 1 && n <= max;
  switch (p.frequency) {
    case 'weekly':
      return entero(p.dia, 7);
    case 'monthly':
    case 'quarterly':
      return entero(p.dia, 28);
    case 'custom':
      return (p.dias_semana ?? []).length > 0 && (p.dias_semana ?? []).every((d) => entero(d, 7));
    default:
      return true;
  }
}

/** Días que se revisan hacia adelante: un trimestral cae como mucho a ~92 días. */
const HORIZONTE_DIAS = 400;

/**
 * Siguiente instante de envío estrictamente posterior a `desde`, o null si
 * la programación no es válida.
 */
export function proximoEnvio(p: Programacion, desde: Date): Date | null {
  if (!programacionValida(p)) return null;
  const hora = p.hora.slice(0, 5);
  let fecha = toPlainDate(desde, p.zona);
  for (let i = 0; i <= HORIZONTE_DIAS; i++, fecha = addPlainDays(fecha, 1)) {
    if (!tocaElDia(p, fecha)) continue;
    const instante = wallTimeToInstant(fecha, hora, p.zona);
    if (instante.getTime() > desde.getTime()) return instante;
  }
  return null;
}

/** Periodo que cubre el envío que sale el día `hoy` (en la zona del envío). */
export function periodoDelEnvio(f: FiltrosEnvio, hoy: string): PeriodoCierre {
  const anterior = periodoAnterior(resolverPeriodo(f.periodo, hoy));
  const conFranja = f.horaInicio && f.horaFin;
  return { ...anterior, horaInicio: conFranja ? f.horaInicio : null, horaFin: conFranja ? f.horaFin : null };
}

/** Filtros guardados en `scheduled_reports.filtros`; lo que no se reconoce se descarta. */
export function leerFiltros(valor: unknown, frecuencia: Frecuencia = 'daily'): FiltrosEnvio {
  const v = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const conFranja = esHora(v.horaInicio) && esHora(v.horaFin);
  return {
    periodo: esPeriodoEnvio(v.periodo) ? v.periodo : PERIODO_POR_FRECUENCIA[frecuencia],
    horaInicio: conFranja ? (v.horaInicio as string) : null,
    horaFin: conFranja ? (v.horaFin as string) : null,
    comparar: typeof v.comparar === 'string' && (COMPARATIVOS as readonly string[]).includes(v.comparar) ? (v.comparar as Comparativo) : null,
    vista: typeof v.vista === 'string' && /^[\w-]{1,60}$/.test(v.vista) ? v.vista : null,
  };
}

const MOTIVOS: readonly MotivoPausa[] = ['sin_membresia', 'sin_permiso', 'sin_alcance', 'modulo_no_contratado', 'aprobador_sin_acceso', 'rebote'];
const motivoDe = (v: unknown): MotivoPausa | null => (MOTIVOS as readonly unknown[]).includes(v) ? (v as MotivoPausa) : null;

/** Destinatarios guardados en `scheduled_reports.recipients`; los mal formados se descartan. */
export function leerDestinatarios(valor: unknown): Destinatario[] {
  if (!Array.isArray(valor)) return [];
  const out: Destinatario[] = [];
  for (const d of valor) {
    if (!d || typeof d !== 'object') continue;
    const r = d as Record<string, unknown>;
    if (!esCorreo(r.email)) continue;
    if (r.tipo === 'miembro' && typeof r.user_id === 'string' && UUID_RE.test(r.user_id)) {
      out.push({
        tipo: 'miembro',
        user_id: r.user_id,
        email: r.email,
        nombre: typeof r.nombre === 'string' ? r.nombre : null,
        estado: r.estado === 'pausado' ? 'pausado' : 'activo',
        motivo: motivoDe(r.motivo),
      });
    } else if (r.tipo === 'externo') {
      const aprobado = typeof r.aprobado_por === 'string' && UUID_RE.test(r.aprobado_por) ? r.aprobado_por : null;
      const estado = r.estado === 'pausado' ? 'pausado' : r.estado === 'activo' && aprobado ? 'activo' : 'pendiente';
      out.push({ tipo: 'externo', email: r.email.toLowerCase(), estado, aprobado_por: estado === 'pendiente' ? null : aprobado, motivo: motivoDe(r.motivo) });
    }
  }
  return out;
}

/** «Ana Gómez», o el correo si el perfil no tiene nombre. */
export function nombreDePerfil(p: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined): string | null {
  if (!p) return null;
  const nombre = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return nombre || p.email || null;
}
