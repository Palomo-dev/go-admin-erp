/**
 * Operación del módulo Membresías (clases, reservas, check-in, instructores,
 * control de acceso y kiosco) sin React: valores que acepta la base, tonos de
 * los badges, cálculo de fechas en la zona de la organización y la regla del
 * método de entrada. Todo lo que escribe el navegador sale de estas listas:
 * las CHECK de la base (verificadas con el MCP el 2026-09-28) rechazan
 * cualquier otro valor.
 */
import type { TonoBadge } from '@/components/kit';
import { addPlainDays, toPlainDate, wallTimeToInstant, formatInstantWithOffset } from '@/lib/utils/dateCore';

// ── Valores de la base ──────────────────────────────────────────────────────

/** `gym_classes_status_check`. «Programada» es `active`. */
export const ESTADOS_CLASE = ['active', 'completed', 'cancelled'] as const;
export type EstadoClase = (typeof ESTADOS_CLASE)[number];

/** `class_reservations_status_check`. «Asistió» es `checked_in`. */
export const ESTADOS_RESERVA = ['booked', 'checked_in', 'no_show', 'cancelled'] as const;
export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

/** `class_reservations_reservation_source_check`. */
export const ORIGENES_RESERVA = ['staff', 'app', 'web', 'kiosk'] as const;
export type OrigenReserva = (typeof ORIGENES_RESERVA)[number];

/** `member_checkins_method_check`. */
export const METODOS_ENTRADA = ['manual', 'qr', 'rfid', 'fingerprint', 'facial'] as const;
export type MetodoEntrada = (typeof METODOS_ENTRADA)[number];

/** `gym_access_devices_device_type_check`. */
export const TIPOS_DISPOSITIVO = ['tablet', 'kiosk', 'turnstile', 'scanner', 'door_lock'] as const;
export type TipoDispositivo = (typeof TIPOS_DISPOSITIVO)[number];

/** `gym_classes_difficulty_level_check` (admite NULL). */
export const NIVELES_CLASE = ['all_levels', 'beginner', 'intermediate', 'advanced'] as const;
export type NivelClase = (typeof NIVELES_CLASE)[number];

/**
 * Tipos de clase sugeridos. `class_type` es texto libre en la base: la lista
 * se completa con los tipos que la organización ya usa (`tiposDeClase`).
 */
export const TIPOS_CLASE_SUGERIDOS = [
  'spinning',
  'yoga',
  'pilates',
  'crossfit',
  'zumba',
  'boxing',
  'functional',
  'stretching',
  'aerobics',
  'swimming',
  'hiit',
  'dance',
  'other',
] as const;

export function esTipoSugerido(tipo: string): tipo is (typeof TIPOS_CLASE_SUGERIDOS)[number] {
  return (TIPOS_CLASE_SUGERIDOS as readonly string[]).includes(tipo);
}

/** Sugeridos + los que ya existen en las clases de la organización, sin repetir. */
export function tiposDeClase(existentes: readonly (string | null | undefined)[]): string[] {
  const vistos = new Set<string>(TIPOS_CLASE_SUGERIDOS);
  const extra: string[] = [];
  for (const t of existentes) {
    const v = (t ?? '').trim();
    if (v && !vistos.has(v)) {
      vistos.add(v);
      extra.push(v);
    }
  }
  return [...TIPOS_CLASE_SUGERIDOS, ...extra.sort((a, b) => a.localeCompare(b))];
}

/** Estado de clase que se lee de la base, con los valores viejos (`scheduled`, `in_progress`) llevados a `active`. */
export function estadoClase(valor: string | null | undefined): EstadoClase {
  if (valor === 'completed' || valor === 'cancelled') return valor;
  return 'active';
}

/** Estado de reserva que se lee de la base (`attended` viejo = `checked_in`). */
export function estadoReserva(valor: string | null | undefined): EstadoReserva {
  if (valor === 'attended') return 'checked_in';
  return (ESTADOS_RESERVA as readonly string[]).includes(valor ?? '') ? (valor as EstadoReserva) : 'booked';
}

export function metodoValido(valor: string | null | undefined): MetodoEntrada {
  return (METODOS_ENTRADA as readonly string[]).includes(valor ?? '') ? (valor as MetodoEntrada) : 'manual';
}

// ── Tonos de badge (SISTEMA-BADGES) ─────────────────────────────────────────

export const TONO_ESTADO_CLASE: Record<EstadoClase, TonoBadge> = {
  active: 'informacion',
  completed: 'exito',
  cancelled: 'neutro',
};

export const TONO_ESTADO_RESERVA: Record<EstadoReserva, TonoBadge> = {
  booked: 'informacion',
  checked_in: 'exito',
  no_show: 'advertencia',
  cancelled: 'neutro',
};

/** Estado visual de una membresía (vigencia.ts) → tono. */
export const TONO_ESTADO_MEMBRESIA: Record<string, TonoBadge> = {
  pendiente_pago: 'advertencia',
  por_activar: 'informacion',
  activa: 'exito',
  congelada: 'informacion',
  en_gracia: 'advertencia',
  vencida: 'peligro',
  cancelada: 'neutro',
};

// ── Motivos y avisos del check-in (fn_membresia_registrar_checkin) ─────────

export const MOTIVOS_RECHAZO = [
  'sin_membresia',
  'pendiente_de_pago',
  'congelada',
  'vencida',
  'sede_no_permitida',
  'fuera_de_horario',
  'limite_diario',
] as const;
export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

export const AVISOS_ENTRADA = ['en_gracia', 'activada_hoy'] as const;
export type AvisoEntrada = (typeof AVISOS_ENTRADA)[number];

/** `denied_reason` puede ser un código de la función nueva o texto libre de registros viejos. */
export function esMotivoConocido(motivo: string | null | undefined): motivo is MotivoRechazo {
  return (MOTIVOS_RECHAZO as readonly string[]).includes(motivo ?? '');
}

export function esAvisoConocido(aviso: string | null | undefined): aviso is AvisoEntrada {
  return (AVISOS_ENTRADA as readonly string[]).includes(aviso ?? '');
}

/**
 * Cómo se muestra el resultado de fn_membresia_registrar_checkin: en gracia
 * deja entrar con aviso (P5), así que es advertencia, no éxito ni rechazo.
 */
export function tonoResultadoEntrada(r: { permitido: boolean; aviso: string | null }): 'exito' | 'advertencia' | 'peligro' {
  if (!r.permitido) return 'peligro';
  return r.aviso === 'en_gracia' ? 'advertencia' : 'exito';
}

// ── Método de entrada ───────────────────────────────────────────────────────

const normalizarCodigo = (s: string) => s.trim().toUpperCase();

/**
 * `qr` solo si el texto llegó de un lector (ráfaga de teclas) y es exactamente
 * el código de acceso de la membresía encontrada (lo que codifica su QR). Lo
 * tecleado a mano, o un documento o teléfono leído por el lector, es `manual`.
 */
export function metodoDeEntrada(
  origen: 'lector' | 'teclado',
  texto: string,
  codigoMembresia: string | null | undefined,
): MetodoEntrada {
  if (origen !== 'lector' || !codigoMembresia) return 'manual';
  return normalizarCodigo(texto) === normalizarCodigo(codigoMembresia) ? 'qr' : 'manual';
}

// ── Fechas en la zona de la organización ────────────────────────────────────

/** Día de la semana ISO (1 = lunes … 7 = domingo) de un día calendario `YYYY-MM-DD`. */
export function diaIsoDe(dia: string): number {
  const [a, m, d] = dia.split('-').map(Number);
  const js = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Lunes de la semana del día dado. */
export function lunesDe(dia: string): string {
  return addPlainDays(dia, 1 - diaIsoDe(dia));
}

/** Los 7 días (lunes a domingo) de la semana que empieza en `lunes`. */
export function diasDeSemana(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addPlainDays(lunes, i));
}

/** Hora de pared `HH:mm` de un instante en la zona. */
export function horaEnZona(instante: string | Date, zona: string): string {
  const fecha = typeof instante === 'string' ? new Date(instante) : instante;
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const h = partes.find((p) => p.type === 'hour')?.value ?? '00';
  const m = partes.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

/** Minutos desde la medianoche (de la zona) de un instante. */
export function minutosDelDia(instante: string | Date, zona: string): number {
  const [h, m] = horaEnZona(instante, zona).split(':').map(Number);
  return h * 60 + m;
}

/** Instante ISO con offset de un día + hora de pared en la zona. */
export function instanteEnZona(dia: string, hora: string, zona: string): string {
  return formatInstantWithOffset(wallTimeToInstant(dia, hora, zona), zona);
}

/** Suma minutos a una hora `HH:mm` (da la vuelta a las 24 h). */
export function sumarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(':').map(Number);
  const total = (((h * 60 + m + minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Minutos entre dos horas del mismo día; si la final es anterior, cruza la medianoche. */
export function minutosEntre(desde: string, hasta: string): number {
  const [h1, m1] = desde.split(':').map(Number);
  const [h2, m2] = hasta.split(':').map(Number);
  let d = h2 * 60 + m2 - (h1 * 60 + m1);
  if (d <= 0) d += 1440;
  return d;
}

/**
 * Inicio y fin de una clase a partir de su día, hora de inicio y duración, en
 * la zona de la organización (no en la del navegador).
 */
export function horarioClase(dia: string, hora: string, duracionMin: number, zona: string): { inicio: string; fin: string } {
  const inicio = wallTimeToInstant(dia, hora, zona);
  const fin = new Date(inicio.getTime() + duracionMin * 60_000);
  return { inicio: formatInstantWithOffset(inicio, zona), fin: formatInstantWithOffset(fin, zona) };
}

/**
 * Copia de una clase en otro día conservando su hora de pared y su duración.
 * El duplicado viejo tomaba `new Date('YYYY-MM-DD')` (medianoche UTC) y le
 * ponía la hora local del navegador: en América la copia caía un día antes.
 */
export function horarioDuplicado(
  original: { start_at: string; end_at: string },
  nuevoDia: string,
  zona: string,
): { inicio: string; fin: string } {
  const duracion = Math.max(1, Math.round((new Date(original.end_at).getTime() - new Date(original.start_at).getTime()) / 60_000));
  return horarioClase(nuevoDia, horaEnZona(original.start_at, zona), duracion, zona);
}

/** Mueve una clase a otro día y hora (arrastrar en el calendario), conservando la duración. */
export function horarioMovido(
  original: { start_at: string; end_at: string },
  dia: string,
  hora: string,
  zona: string,
): { inicio: string; fin: string } {
  const duracion = Math.max(1, Math.round((new Date(original.end_at).getTime() - new Date(original.start_at).getTime()) / 60_000));
  return horarioClase(dia, hora, duracion, zona);
}

/** ¿El instante cae en el día calendario `dia` de la zona? */
export function esDelDia(instante: string | null | undefined, dia: string, zona: string): boolean {
  if (!instante) return false;
  const f = new Date(instante);
  return !isNaN(f.getTime()) && toPlainDate(f, zona) === dia;
}

/** Rango de instantes [desde, hasta) que cubre los días `[dia, dia + dias)` en la zona. */
export function rangoDias(dia: string, dias: number, zona: string): { desde: string; hasta: string } {
  return {
    desde: instanteEnZona(dia, '00:00', zona),
    hasta: instanteEnZona(addPlainDays(dia, dias), '00:00', zona),
  };
}

export type FiltroFechaReserva = 'todas' | 'hoy' | 'semana';

/**
 * Rango de la **fecha de la clase** (no de `booked_at`) para el filtro de
 * reservas: «Hoy» es el día de hoy en la zona de la organización; «Semana»,
 * hoy y los 6 días siguientes.
 */
export function rangoFiltroReservas(filtro: FiltroFechaReserva, hoy: string, zona: string): { desde: string; hasta: string } | null {
  if (filtro === 'hoy') return rangoDias(hoy, 1, zona);
  if (filtro === 'semana') return rangoDias(hoy, 7, zona);
  return null;
}

// ── Cupo ────────────────────────────────────────────────────────────────────

/** Reservas que ocupan cupo: todas menos las canceladas. */
export function ocupaCupo(estado: string | null | undefined): boolean {
  return estadoReserva(estado) !== 'cancelled';
}

export function cuposLibres(capacidad: number, ocupadas: number): number {
  return Math.max(0, capacidad - ocupadas);
}

// ── Código del QR del dispositivo ───────────────────────────────────────────

/** Token aleatorio con `crypto.getRandomValues` (antes `Math.random`). */
export function tokenSeguro(longitud = 32, fuente: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  // 62 símbolos: solo se usan bytes < 248 (4 × 62) para no sesgar el módulo.
  while (s.length < longitud) {
    const bytes = new Uint8Array(longitud * 2);
    fuente.getRandomValues(bytes);
    for (let i = 0; i < bytes.length && s.length < longitud; i++) {
      if (bytes[i] < 248) s += alfabeto[bytes[i] % alfabeto.length];
    }
  }
  return s;
}

/** Contenido del QR que muestra un dispositivo (se conserva el formato del kiosco anterior). */
export function contenidoQrDispositivo(dispositivoId: string, token: string): string {
  return `gym-checkin:${dispositivoId}:${token}`;
}

/** Búsqueda local sin tildes ni mayúsculas. */
export function coincide(texto: string | null | undefined, termino: string): boolean {
  if (!termino.trim()) return true;
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return n(texto ?? '').includes(n(termino.trim()));
}
