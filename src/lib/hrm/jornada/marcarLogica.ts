/**
 * Reglas puras de la pantalla «Marcar turno» (Figma 20.9). Sin React: las
 * prueban `__tests__/marcarLogica.test.ts`.
 *
 * Lo que decide la pantalla, nunca la marca: el tipo de evento, la hora y la
 * validez de la ubicación los pone el servidor (`fn_hr_marcar`). Aquí solo se
 * calcula qué mostrar (en turno, en descanso, llegada tarde, fuera de turno) y
 * la distancia aproximada a la sede para avisar ANTES de marcar.
 */

export type TipoEvento = 'check_in' | 'check_out' | 'break_start' | 'break_end';

export interface MarcaDia {
  tipo: TipoEvento;
  hora: string;
  metodo?: string | null;
  modo?: string | null;
  revisar?: string | null;
}

export interface TurnoEstado {
  id?: string;
  fecha: string;
  inicio: string | null;
  fin: string | null;
  dia_descanso: boolean;
  descanso_min: number | null;
  descanso_pagado?: boolean;
  plantilla: string | null;
}

export interface EstadoMarcacion {
  vinculo: { id: string; sede_id: number | null; sede: string | null; nombre: string } | null;
  zona?: string;
  hoy?: string;
  sede?: { id: number; nombre: string; lat: number | null; lng: number | null; radio_m: number } | null;
  modalidad?: 'presencial' | 'remoto' | 'hibrido';
  mecanismos?: string[];
  dias_laborables?: number[];
  ubicacion?: { autorizada: boolean; version: string | null; fecha: string | null };
  ultima?: { tipo: TipoEvento; hora: string; fecha_trabajo: string } | null;
  siguiente?: TipoEvento;
  turno?: TurnoEstado | null;
  proximo_turno?: { fecha: string; inicio: string | null; fin: string | null; plantilla: string | null } | null;
  marcas?: MarcaDia[];
  tolerancia_min?: number;
  jefe?: { id: string; nombre: string } | null;
  /** Marcación M0 (Figma 20.30): lo que ofrece la sede a esta persona (sede, ficha y excepción). */
  metodos_sede?: { ubicacion: boolean; qr: boolean; nfc: boolean } | null;
  metodo_preferido?: 'ubicacion' | 'qr' | 'nfc' | 'remoto' | null;
  reglas?: { qr_exige_ubicacion?: boolean; nfc_exige_ubicacion?: boolean; permitir_computador?: boolean } | null;
  excepciones?: { metodo: string; hasta: string }[];
}

export type FaseMarcacion =
  /** Antes de la hora de entrada (o hasta la tolerancia). */
  | 'antes'
  /** Pasó la hora de entrada sin marcar: «Sin marcar · 18 min tarde». */
  | 'tarde'
  | 'enTurno'
  | 'enDescanso'
  | 'cerrado'
  /** Sin turno ahora: marcar exige motivo y va a aprobación (Figma 20.9.8). */
  | 'fueraDeTurno';

export interface VistaMarcacion {
  fase: FaseMarcacion;
  /** Lo que marca el botón principal. */
  accion: TipoEvento;
  /** Minutos tarde (`tarde`), en turno (`enTurno`) o en descanso (`enDescanso`). */
  minutos: number;
  entrada: string | null;
  descansoDesde: string | null;
}

const MIN = 60_000;

function minutos(desde: string | number, hasta: number): number {
  const d = typeof desde === 'string' ? Date.parse(desde) : desde;
  return Number.isFinite(d) ? Math.max(0, Math.floor((hasta - d) / MIN)) : 0;
}

/** Margen antes del inicio en que una entrada ya cuenta para el turno (el mismo de la base: 3 h). */
const MARGEN_PREVIO = 3 * 60 * MIN;

export function vistaMarcacion(e: Pick<EstadoMarcacion, 'turno' | 'marcas' | 'tolerancia_min'>, ahora: Date): VistaMarcacion {
  const t = ahora.getTime();
  const marcas = [...(e.marcas ?? [])].sort((a, b) => Date.parse(a.hora) - Date.parse(b.hora));
  const entrada = [...marcas].reverse().find((m) => m.tipo === 'check_in') ?? null;
  const ultima = marcas[marcas.length - 1] ?? null;
  const turno = e.turno && !e.turno.dia_descanso && e.turno.inicio && e.turno.fin ? e.turno : null;

  if (ultima && ultima.tipo !== 'check_out' && entrada) {
    if (ultima.tipo === 'break_start') {
      return { fase: 'enDescanso', accion: 'break_end', minutos: minutos(ultima.hora, t), entrada: entrada.hora, descansoDesde: ultima.hora };
    }
    return { fase: 'enTurno', accion: 'check_out', minutos: minutos(entrada.hora, t), entrada: entrada.hora, descansoDesde: null };
  }
  if (ultima?.tipo === 'check_out' && entrada && turno && Date.parse(turno.fin!) + 2 * 60 * MIN > t) {
    return { fase: 'cerrado', accion: 'check_in', minutos: minutos(entrada.hora, Date.parse(ultima.hora)), entrada: entrada.hora, descansoDesde: null };
  }
  if (!turno) return { fase: 'fueraDeTurno', accion: 'check_in', minutos: 0, entrada: null, descansoDesde: null };
  const inicio = Date.parse(turno.inicio!);
  const fin = Date.parse(turno.fin!);
  if (t < inicio - MARGEN_PREVIO || t > fin) return { fase: 'fueraDeTurno', accion: 'check_in', minutos: 0, entrada: null, descansoDesde: null };
  const tarde = minutos(inicio, t);
  if (tarde > (e.tolerancia_min ?? 0)) return { fase: 'tarde', accion: 'check_in', minutos: tarde, entrada: null, descansoDesde: null };
  return { fase: 'antes', accion: 'check_in', minutos: 0, entrada: null, descansoDesde: null };
}

/** Minutos que quedan del descanso planeado (nunca negativos). */
export function descansoRestante(desde: string | null, descansoMin: number | null, ahora: Date): number | null {
  if (!desde || !descansoMin) return null;
  return Math.max(0, descansoMin - minutos(desde, ahora.getTime()));
}

/** Distancia en metros entre dos puntos (haversine); la misma fórmula de `fn_hr_marcar`. */
export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

export type MetodoPantalla = 'ubicacion' | 'qr' | 'remoto' | 'nfc';

const METODOS_PANTALLA: readonly MetodoPantalla[] = ['ubicacion', 'qr', 'nfc', 'remoto'];

/** `?metodo=` de «Marcar turno» (Inicio y Mi asistencia abren directo el método de la sede). */
export function metodoDeParametro(v: string | null | undefined): MetodoPantalla | null {
  return v && (METODOS_PANTALLA as readonly string[]).includes(v) ? (v as MetodoPantalla) : null;
}

/** Métodos que ofrece la pantalla según los mecanismos y la modalidad del vínculo. */
export function metodosDisponibles(
  e: Pick<EstadoMarcacion, 'mecanismos' | 'modalidad'> & Partial<Pick<EstadoMarcacion, 'metodos_sede'>>,
  hoyIso: number,
  diasRemoto?: number[]
): MetodoPantalla[] {
  const mec = e.mecanismos ?? ['app', 'qr'];
  const out: MetodoPantalla[] = [];
  const remotoHoy = e.modalidad === 'remoto' || (e.modalidad === 'hibrido' && (!diasRemoto || diasRemoto.includes(hoyIso)));
  const presencial = e.modalidad !== 'remoto';
  // Con la respuesta de Marcación M0 manda la base (sede, ficha y excepciones); sin ella, como antes.
  const sede = e.metodos_sede;
  if (presencial && (sede ? sede.ubicacion : mec.includes('app'))) out.push('ubicacion');
  if (presencial && (sede ? sede.qr : mec.includes('qr'))) out.push('qr');
  if (presencial && sede?.nfc) out.push('nfc');
  if (mec.includes('app') && remotoHoy) out.push('remoto');
  return out;
}

/** Método por defecto (decisión 9): celular con ubicación; remoto si la modalidad lo es. */
export function metodoInicial(
  disponibles: MetodoPantalla[],
  modalidad: EstadoMarcacion['modalidad'],
  preferido?: EstadoMarcacion['metodo_preferido'],
  pedido?: MetodoPantalla | null
): MetodoPantalla | null {
  if (pedido && disponibles.includes(pedido)) return pedido;
  if (modalidad === 'remoto' && disponibles.includes('remoto')) return 'remoto';
  if (preferido && disponibles.includes(preferido)) return preferido;
  return disponibles[0] ?? null;
}

// ─── Sin señal: cola de marcas guardadas en el celular ──────────────────────

export interface MarcaPendiente {
  id: string;
  tipo: TipoEvento;
  capturada: string;
  metodo: 'app';
  remoto: boolean;
}

export const CLAVE_COLA = 'go-admin:hrm:marcas-pendientes';

export function leerCola(crudo: string | null): MarcaPendiente[] {
  if (!crudo) return [];
  try {
    const v = JSON.parse(crudo) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (m): m is MarcaPendiente =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as MarcaPendiente).id === 'string' &&
        typeof (m as MarcaPendiente).capturada === 'string' &&
        ['check_in', 'check_out', 'break_start', 'break_end'].includes((m as MarcaPendiente).tipo)
    );
  } catch {
    return [];
  }
}

/** Tipo que tocaría marcar, contando las marcas aún sin enviar. */
export function siguienteConCola(siguiente: TipoEvento, cola: MarcaPendiente[]): TipoEvento {
  const ultima = cola[cola.length - 1];
  if (!ultima) return siguiente;
  if (ultima.tipo === 'check_out') return 'check_in';
  if (ultima.tipo === 'break_start') return 'break_end';
  return 'check_out';
}
