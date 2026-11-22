// Lógica de la pantalla de Cupones (Figma 1088:714507 y sección 23 458:*):
// validación del formulario y del lote, cambios para editar, ejemplo de
// códigos, CSV del lote, vigencia y errores. Sin React ni Supabase.
//
// No valida si un cupón se puede canjear: eso es `validarCupon`
// (src/lib/pos/venta/cuponCarrito.ts) en el POS y en la tienda web. El estado
// que se muestra en la lista lo calcula la base (`fn_cupon_estado`).

import type { CreateCouponData, DatosLote, DiscountType, EstadoCupon, UpdateCouponData } from './types';

/** Sin 0/O ni 1/I (32 signos, los mismos de `pos_cupones_crear_lote`): se dictan por teléfono y se copian de una tarjeta impresa. */
export const ALFABETO_CODIGO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const LARGO_ALEATORIO = 6;
export const MAXIMO_LOTE = 5000;
export const PATRON_PREFIJO = /^[A-Z0-9]{1,12}$/;
export const PATRON_CODIGO = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

export function normalizarCodigo(valor: string): string {
  return valor.trim().toUpperCase();
}

export function normalizarPrefijo(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

/** Parte aleatoria; `aleatorio` se inyecta en las pruebas. */
export function parteAleatoria(largo = LARGO_ALEATORIO, aleatorio: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < largo; i++) s += ALFABETO_CODIGO[Math.floor(aleatorio() * ALFABETO_CODIGO.length) % ALFABETO_CODIGO.length];
  return s;
}

/** «Generar uno al azar» del formulario (la unicidad la garantiza el índice de la base). */
export function codigoAlAzar(prefijo = '', aleatorio: () => number = Math.random): string {
  const p = normalizarPrefijo(prefijo);
  return p ? `${p}-${parteAleatoria(LARGO_ALEATORIO, aleatorio)}` : parteAleatoria(8, aleatorio);
}

/** «Así se verán»: ejemplos con el formato real del lote (los códigos de verdad salen del servidor). */
export function ejemplosLote(prefijo: string, n = 4, aleatorio: () => number = Math.random): string[] {
  const p = normalizarPrefijo(prefijo) || 'LOTE';
  return Array.from({ length: n }, () => `${p}-${parteAleatoria(LARGO_ALEATORIO, aleatorio)}`);
}

// ── Formulario de un cupón ────────────────────────────────────────────────

export interface FormularioCupon {
  code: string;
  name: string;
  discount_type: DiscountType;
  discount_value: number | null;
  max_discount_amount: number | null;
  min_purchase_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  usage_limit: number | null;
  usage_limit_per_customer: number | null;
  applies_to_first_purchase: boolean;
  customer_id: string | null;
  promotion_id: string | null;
  is_active: boolean;
}

export type CampoCupon = 'code' | 'discount_value' | 'end_date' | 'usage_limit_per_customer';
export type ErrorCupon = 'codigoVacio' | 'codigoFormato' | 'valor' | 'porcentajeMaximo' | 'vigencia' | 'usosCliente';

export function validarFormularioCupon(f: FormularioCupon): Partial<Record<CampoCupon, ErrorCupon>> {
  const e: Partial<Record<CampoCupon, ErrorCupon>> = {};
  const code = normalizarCodigo(f.code);
  if (!code) e.code = 'codigoVacio';
  else if (!PATRON_CODIGO.test(code)) e.code = 'codigoFormato';
  if (f.discount_value === null || !(f.discount_value > 0)) e.discount_value = 'valor';
  else if (f.discount_type === 'percentage' && f.discount_value > 100) e.discount_value = 'porcentajeMaximo';
  if (f.start_date && f.end_date && f.end_date < f.start_date) e.end_date = 'vigencia';
  if (f.usage_limit && f.usage_limit_per_customer && f.usage_limit_per_customer > f.usage_limit) e.usage_limit_per_customer = 'usosCliente';
  return e;
}

function positivo(v: number | null | undefined, entero = false): number | null {
  if (v === null || v === undefined) return null;
  const n = entero ? Math.trunc(Number(v)) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Datos para guardar. Los opcionales vacíos viajan como `null` explícito: así
 * se pueden vaciar al editar (antes viajaban `undefined` y supabase-js los
 * descartaba). El tope solo tiene sentido con porcentaje.
 */
export function datosDelFormulario(f: FormularioCupon): CreateCouponData {
  return {
    code: normalizarCodigo(f.code),
    name: f.name.trim() || null,
    discount_type: f.discount_type,
    discount_value: Number(f.discount_value) || 0,
    max_discount_amount: f.discount_type === 'percentage' ? positivo(f.max_discount_amount) : null,
    min_purchase_amount: positivo(f.min_purchase_amount),
    usage_limit: positivo(f.usage_limit, true),
    usage_limit_per_customer: positivo(f.usage_limit_per_customer, true),
    start_date: f.start_date || null,
    end_date: f.end_date || null,
    applies_to_first_purchase: f.applies_to_first_purchase,
    customer_id: f.customer_id || null,
    promotion_id: f.promotion_id || null,
    is_active: f.is_active,
  };
}

/** Fila para un UPDATE: todas las claves presentes, las vacías como null. */
export function cambiosCupon(d: UpdateCouponData): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) salida[k] = v === undefined || v === '' ? null : v;
  if (typeof salida.code === 'string') salida.code = normalizarCodigo(salida.code);
  return salida;
}

// ── Lote ──────────────────────────────────────────────────────────────────

export type CampoLote = 'prefijo' | 'cantidad' | 'discount_value' | 'end_date';
export type ErrorLote = 'prefijo' | 'cantidad' | 'valor' | 'porcentajeMaximo' | 'vigencia';

export function validarLote(d: Omit<DatosLote, 'discount_value' | 'cantidad'> & { discount_value: number | null; cantidad: number | null }): Partial<Record<CampoLote, ErrorLote>> {
  const e: Partial<Record<CampoLote, ErrorLote>> = {};
  if (!PATRON_PREFIJO.test(normalizarPrefijo(d.prefijo))) e.prefijo = 'prefijo';
  if (d.cantidad === null || !Number.isInteger(d.cantidad) || d.cantidad < 1 || d.cantidad > MAXIMO_LOTE) e.cantidad = 'cantidad';
  if (d.discount_value === null || !(d.discount_value > 0)) e.discount_value = 'valor';
  else if (d.discount_type === 'percentage' && d.discount_value > 100) e.discount_value = 'porcentajeMaximo';
  if (d.start_date && d.end_date && d.end_date < d.start_date) e.end_date = 'vigencia';
  return e;
}

function celdaCsv(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** «Exportar CSV» del lote creado: una fila por código. */
export function csvLote(codigos: readonly string[], encabezado = 'code'): string {
  return [celdaCsv(encabezado), ...codigos.map((c) => celdaCsv(c))].join('\n') + '\n';
}

// ── Lista ─────────────────────────────────────────────────────────────────

export const TONO_ESTADO_CUPON: Record<EstadoCupon, 'exito' | 'informacion' | 'advertencia' | 'neutro' | 'peligro'> = {
  activo: 'exito',
  programado: 'informacion',
  agotado: 'advertencia',
  vencido: 'neutro',
  inactivo: 'neutro',
  archivado: 'neutro',
};

/** Usos restantes, o null si no hay límite. */
export function usosRestantes(c: { usage_limit?: number | null; usage_count: number }): number | null {
  if (c.usage_limit === null || c.usage_limit === undefined) return null;
  return Math.max(0, c.usage_limit - (c.usage_count || 0));
}

const DIA_MS = 86_400_000;

/**
 * Días enteros entre el día de hoy y otro día (ambos 'YYYY-MM-DD' en la zona
 * de la organización). Para «vence en 2 días» / «empieza en 3 días».
 */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / DIA_MS);
}

/** Aviso de la vigencia bajo la fecha: vence pronto (≤ 7 días) o empieza más adelante. */
export function avisoVigencia(
  estado: EstadoCupon,
  hoy: string,
  inicio: string | null,
  fin: string | null,
): { tipo: 'vence' | 'empieza'; dias: number } | null {
  if (estado === 'programado' && inicio) return { tipo: 'empieza', dias: Math.max(0, diasEntre(hoy, inicio)) };
  if (estado === 'activo' && fin) {
    const dias = diasEntre(hoy, fin);
    if (dias >= 0 && dias <= 7) return { tipo: 'vence', dias };
  }
  return null;
}

// ── Errores ───────────────────────────────────────────────────────────────

export const CODIGOS_ERROR_CUPON = [
  'SIN_PERMISO',
  'CODIGO_DUPLICADO',
  'NO_ENCONTRADO',
  'PREFIJO_INVALIDO',
  'CANTIDAD_INVALIDA',
  'VALOR_INVALIDO',
  'VIGENCIA_INVALIDA',
  'PROMOCION_INVALIDA',
  'SIN_CODIGOS',
  'DESCONOCIDO',
] as const;
export type CodigoErrorCupon = (typeof CODIGOS_ERROR_CUPON)[number];

export class CuponError extends Error {
  constructor(public readonly codigo: CodigoErrorCupon, detalle?: string) {
    super(detalle || codigo);
    this.name = 'CuponError';
  }
}

/** Error de Supabase o de las RPC → código de la pantalla. */
export function codigoErrorCupon(error: unknown): CodigoErrorCupon {
  if (error instanceof CuponError) return error.codigo;
  const e = (error ?? {}) as { code?: string; message?: string };
  const m = e.message || '';
  if (e.code === '42501' || /row-level security|permission denied|sin permiso|sin acceso/i.test(m)) return 'SIN_PERMISO';
  if (e.code === '23505') return 'CODIGO_DUPLICADO';
  if (e.code === 'P0002' || e.code === 'PGRST116') return 'NO_ENCONTRADO';
  if (/prefijo_invalido/.test(m)) return 'PREFIJO_INVALIDO';
  if (/cantidad_invalida/.test(m)) return 'CANTIDAD_INVALIDA';
  if (/valor_invalido|tipo_invalido/.test(m) || (e.code === '23514' && /discount_type/.test(m))) return 'VALOR_INVALIDO';
  if (/vigencia_invalida/.test(m)) return 'VIGENCIA_INVALIDA';
  if (/promocion_invalida/.test(m)) return 'PROMOCION_INVALIDA';
  if (/sin_codigos_disponibles/.test(m)) return 'SIN_CODIGOS';
  return 'DESCONOCIDO';
}

export function errorCupon(error: unknown): CuponError {
  if (error instanceof CuponError) return error;
  return new CuponError(codigoErrorCupon(error), (error as { message?: string } | null)?.message);
}
