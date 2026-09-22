/**
 * Identidad de la terminal del POS (`public.pos_terminals`): tipo de fila,
 * columnas que se leen, formato del código y validación del formulario.
 *
 * Módulo HOJA (sin Supabase, sin DOM) para que lo compartan el servicio del
 * navegador (`posTerminalsService.ts`) y la ruta de servidor
 * (`PATCH /api/pos/terminals/[id]`) sin que la ruta arrastre el cliente de
 * `@/lib/supabase/config`, que es solo de navegador. La regla es UNA sola
 * definición: nadie reimplementa el patrón del código ni la lista de
 * columnas.
 */

/** Fila de `pos_terminals` tal como la devuelve la BD (solo columnas de identidad). */
export interface PosTerminal {
  id: string;
  organization_id: number;
  branch_id: number;
  name: string;
  code: string;
  is_active: boolean;
  display_last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PosTerminalInput {
  /** «Caja 1». No vacío (constraint pos_terminals_name_no_vacio). */
  name: string;
  /** Corto, para el pie de pantalla y recibos: `[A-Z0-9_-]{1,20}` (constraint pos_terminals_code_formato). Único por sucursal. */
  code: string;
}

/** Columnas que se leen; `*` traería cualquier columna futura sin querer. */
export const TERMINAL_COLUMNS = 'id, organization_id, branch_id, name, code, is_active, display_last_seen_at, created_at, updated_at';

/** Mismo formato que la constraint pos_terminals_code_formato, para avisar antes del viaje (la BD exige además mayúsculas: ver normalizeTerminalCode). */
export const TERMINAL_CODE_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;
export const TERMINAL_CODE_MAX = 20;
export const TERMINAL_NAME_MAX = 80;

export type TerminalInputError = 'name_required' | 'name_too_long' | 'code_invalid';

/**
 * Forma canónica del código: recortado y en MAYÚSCULAS. La UI ya fuerza
 * mayúsculas y el servicio y la ruta normalizan igual antes de escribir.
 * Desde la ronda 3 de F2-A la BASE también lo garantiza (migración
 * 20260921150100): índice único `pos_terminals_code_unico_ci` sobre
 * (organization_id, branch_id, upper(code)) — «caja-1» y «CAJA-1» chocan con
 * 23505, el mismo código que la UNIQUE original — y CHECK
 * `pos_terminals_code_mayusculas` (code = upper(code)), que rechaza con 23514
 * cualquier escritura en minúsculas que no pase por aquí (PostgREST directo,
 * un cliente offline futuro). Normalizar aquí sigue siendo lo que evita que
 * el usuario vea ese error: la regla no depende del cliente, pero el cliente
 * la cumple antes del viaje.
 */
export function normalizeTerminalCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Valida el formulario de la tarjeta. `null` si es válido. Recorta espacios y normaliza el código (la BD también recorta). */
export function validateTerminalInput(input: PosTerminalInput): TerminalInputError | null {
  const name = input.name.trim();
  if (name.length === 0) return 'name_required';
  if (name.length > TERMINAL_NAME_MAX) return 'name_too_long';
  if (!TERMINAL_CODE_PATTERN.test(normalizeTerminalCode(input.code))) return 'code_invalid';
  return null;
}

/**
 * Sugerencia de código a partir del nombre («Caja 1» → «CAJA-1»); vacío si no
 * queda nada útil. Se recorta a 20 ANTES de quitar los guiones de los
 * extremos, así nunca termina en guion («AAAA…-» de un nombre largo).
 */
export function suggestTerminalCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TERMINAL_CODE_MAX)
    .replace(/^-+|-+$/g, '');
}
