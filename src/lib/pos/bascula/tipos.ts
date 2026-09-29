/**
 * Tipos de la lectura de básculas (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.8, §2.9 y §4). Puro: sin React, sin navegador.
 */

export type ProtocoloBascula =
  | 'continuous_st_gs'
  | 'toledo_8217'
  | 'mettler_sics'
  | 'cas_pd2'
  | 'dibal'
  | 'custom_regex';

export const PROTOCOLOS_BASCULA: readonly ProtocoloBascula[] = [
  'continuous_st_gs',
  'toledo_8217',
  'mettler_sics',
  'cas_pd2',
  'dibal',
  'custom_regex',
] as const;

/**
 * Dibal no tiene todavía una trama documentada y validada con un equipo real
 * (§2.8: «se valida con el equipo antes de la fase 3»). Se puede elegir para
 * guardar la báscula y ver los bytes crudos en «Probar lectura», pero no se
 * interpreta: usa «Propio» con una expresión regular mientras tanto.
 */
export const PROTOCOLOS_PENDIENTES: readonly ProtocoloBascula[] = ['dibal'] as const;

/** Transportes que existen hoy (`pos_scales.transport`; TCP y BLE reservados). */
export type TransporteBasculaId = 'desktop_serial' | 'web_serial';

export type Paridad = 'none' | 'even' | 'odd';

export const BAUDIOS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200] as const;

/** Configuración de una báscula para leerla (fila de `pos_scales` normalizada). */
export interface ConfigBascula {
  id: string;
  nombre: string;
  transporte: TransporteBasculaId;
  protocolo: ProtocoloBascula;
  /** Solo `custom_regex`. */
  patron?: string | null;
  /** Ruta del puerto en Desktop ('COM3') o `usb:<vid>:<pid>` en Web Serial. */
  dispositivo?: string | null;
  baudios: number;
  bitsDatos: 7 | 8;
  paridad: Paridad;
  bitsParada: 1 | 2;
  /** 'KG' o 'LB'. */
  unidad: string;
  /** Decimales implícitos cuando la trama no trae punto decimal. */
  decimales: number;
  capacidad: number | null;
  /** División mínima; por defecto 10^-decimales. */
  division: number | null;
  /** Milisegundos de lectura igual para considerarla estable (500 por defecto). */
  estableMs: number;
}

/** Lo que dice la báscula de sí misma en una trama. */
export type EstadoTrama = 'ok' | 'sobrecarga' | 'bajo_cero' | 'error';

/**
 * Una trama interpretada: `{ neto, bruto, tara, unidad, estable, estado }`.
 *
 * - Una báscula que manda el peso bruto (lo normal): `bruto` = `neto` = peso y
 *   `tara` = null; la tara la resta el POS.
 * - Si la báscula manda neto (`NT` en ST,GS): `netoDeBascula` = true y el POS
 *   **no** vuelve a restar su tara (§2.9).
 * - `neto` null: la trama dice el estado pero no trae peso (Toledo «en
 *   movimiento», SICS «S I»).
 */
export interface LecturaTrama {
  neto: number | null;
  bruto: number | null;
  tara: number | null;
  /** Unidad de la trama ('KG', 'LB', 'G') o null si no la trae. */
  unidad: string | null;
  /** La báscula dice que la lectura está estable (sin movimiento). */
  estable: boolean;
  estado: EstadoTrama;
  netoDeBascula: boolean;
}

export interface OpcionesInterpretar {
  /** Decimales implícitos si el peso llega sin punto ('00735' con 3 → 0,735). */
  decimales?: number;
  /** Expresión regular del protocolo propio. */
  patron?: string | null;
}
