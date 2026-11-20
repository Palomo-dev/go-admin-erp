// Lógica de la pantalla de Cargos de servicio v2 (Figma 1088:714506): estado,
// filtros, resumen, avisos del formulario y vista previa del recibo. Sin React
// ni Supabase, para poder probarla.

import type { AppliesTo, ChargeType, ServiceCharge } from './types';

export type EstadoCargo = 'activo' | 'inactivo' | 'archivado';
export type FiltroEstadoCargo = 'todos' | 'activos' | 'inactivos' | 'archivados';
export type FiltroCobroCargo = 'todos' | 'obligatorio' | 'opcional';

export function estadoCargo(c: Pick<ServiceCharge, 'is_active' | 'archived_at'>): EstadoCargo {
  if (c.archived_at) return 'archivado';
  return c.is_active ? 'activo' : 'inactivo';
}

export interface FiltrosCargo {
  q: string;
  estado: FiltroEstadoCargo;
  /** `null` = cualquiera. Un cargo `all` aplica a todos los servicios: sale en cualquier filtro. */
  aplicaA: AppliesTo | null;
  cobro: FiltroCobroCargo;
}

export const FILTROS_CARGO_INICIALES: FiltrosCargo = { q: '', estado: 'todos', aplicaA: null, cobro: 'todos' };

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Filtra en el navegador la lista (ya acotada a la organización, la sucursal del
 * header y archivados sí/no por el servicio). «Todos» no incluye los archivados:
 * esos solo salen con el filtro «Archivados».
 */
export function filtrarCargos(lista: readonly ServiceCharge[], f: FiltrosCargo): ServiceCharge[] {
  const q = normalizar(f.q);
  return lista.filter((c) => {
    const estado = estadoCargo(c);
    if (f.estado === 'archivados' ? estado !== 'archivado' : estado === 'archivado') return false;
    if (f.estado === 'activos' && estado !== 'activo') return false;
    if (f.estado === 'inactivos' && estado !== 'inactivo') return false;
    if (f.aplicaA && c.applies_to !== f.aplicaA && c.applies_to !== 'all') return false;
    if (f.cobro === 'obligatorio' && c.is_optional) return false;
    if (f.cobro === 'opcional' && !c.is_optional) return false;
    if (q && !normalizar(c.name).includes(q)) return false;
    return true;
  });
}

export function conteoFiltrosCargo(f: FiltrosCargo): number {
  return (f.estado !== 'todos' ? 1 : 0) + (f.aplicaA ? 1 : 0) + (f.cobro !== 'todos' ? 1 : 0);
}

export interface ResumenCargos {
  /** Sin archivados. */
  total: number;
  activos: number;
  inactivos: number;
  archivados: number;
}

export function resumirCargos(lista: readonly ServiceCharge[]): ResumenCargos {
  const r: ResumenCargos = { total: 0, activos: 0, inactivos: 0, archivados: 0 };
  for (const c of lista) {
    const e = estadoCargo(c);
    if (e === 'archivado') {
      r.archivados++;
      continue;
    }
    r.total++;
    if (e === 'activo') r.activos++;
    else r.inactivos++;
  }
  return r;
}

/**
 * Orden de la lista: nombre, con los archivados al final. `dir` invierte el
 * orden por nombre (cabecera «Nombre ⇅»).
 */
export function ordenarCargos(lista: readonly ServiceCharge[], dir: 'asc' | 'desc' = 'asc'): ServiceCharge[] {
  const signo = dir === 'asc' ? 1 : -1;
  return [...lista].sort((a, b) => {
    const archA = a.archived_at ? 1 : 0;
    const archB = b.archived_at ? 1 : 0;
    if (archA !== archB) return archA - archB;
    return signo * a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
}

// ── Formulario ──────────────────────────────────────────────────────────────

export interface FormularioCargo {
  name: string;
  charge_type: ChargeType;
  charge_value: number | null;
  tax_id: string | null;
  applies_to: AppliesTo;
  min_guests: number | null;
  min_amount: number | null;
  branch_id: number | null;
  is_optional: boolean;
}

export type ErrorFormularioCargo = 'nombre' | 'valor' | 'porcentajeMaximo';

export function validarFormularioCargo(f: FormularioCargo): Partial<Record<'name' | 'charge_value', ErrorFormularioCargo>> {
  const errores: Partial<Record<'name' | 'charge_value', ErrorFormularioCargo>> = {};
  if (!f.name.trim()) errores.name = 'nombre';
  if (f.charge_value === null || !(f.charge_value > 0)) errores.charge_value = 'valor';
  else if (f.charge_type === 'percentage' && f.charge_value > 100) errores.charge_value = 'porcentajeMaximo';
  return errores;
}

/**
 * Decisión 2 del dueño (2026-09-24): el formulario avisa si el cargo parece una
 * propina disfrazada. Regla: opcional + porcentual + sin impuesto, o un nombre
 * que diga «propina» o «tip».
 */
export function pareceUnaPropina(f: Pick<FormularioCargo, 'name' | 'charge_type' | 'tax_id' | 'is_optional'>): boolean {
  const nombre = normalizar(f.name);
  if (/\bpropina\b|\btips?\b|\bgorjeta\b|\bpourboire\b/.test(nombre)) return true;
  return f.is_optional && f.charge_type === 'percentage' && !f.tax_id;
}

/**
 * Decisión 3 del dueño (2026-09-24): el domicilio se cobra como flete. Avisa si
 * se crea un cargo fijo de domicilio sin impuesto.
 */
export function pareceFlete(f: Pick<FormularioCargo, 'charge_type' | 'applies_to' | 'tax_id'>): boolean {
  return f.charge_type === 'fixed_amount' && f.applies_to === 'delivery' && !f.tax_id;
}

// ── Vista previa del recibo ────────────────────────────────────────────────

export interface VistaPreviaCargo {
  /** Subtotal de ejemplo: después de descuentos y antes de impuestos. */
  subtotal: number;
  /** Comensales del ejemplo (los mínimos del cargo, si tiene). */
  comensales: number | null;
  cargo: number;
  /** Impuesto sobre productos y cargo, suponiendo que los productos llevan el mismo impuesto del cargo. */
  impuesto: number;
  total: number;
}

const SUBTOTAL_EJEMPLO = 100_000;
const POR_COMENSAL_EJEMPLO = 20_000;

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Vista previa del recibo del formulario (Figma 1088:716994). Es solo
 * ilustración con un subtotal de ejemplo que cumple las condiciones del cargo;
 * **no** es el cálculo del cobro (POS-CARGOS-SERVICIO-EN-VENTAS.md §3: ese lo
 * hará la base, `fn_calcular_cargos_servicio`). Mismo orden que allí: el cargo
 * se calcula sobre el subtotal antes de impuestos y el impuesto va sobre
 * productos + cargo.
 */
export function vistaPreviaCargo(
  f: Pick<FormularioCargo, 'charge_type' | 'charge_value' | 'min_guests' | 'min_amount'>,
  tarifaImpuesto: number | null,
): VistaPreviaCargo {
  const comensales = f.min_guests && f.min_guests > 0 ? Math.trunc(f.min_guests) : null;
  const porComensales = comensales ? comensales * POR_COMENSAL_EJEMPLO : 0;
  const subtotal = Math.max(SUBTOTAL_EJEMPLO, f.min_amount && f.min_amount > 0 ? f.min_amount : 0, porComensales);
  const valor = f.charge_value && f.charge_value > 0 ? f.charge_value : 0;
  const cargo = redondear(f.charge_type === 'percentage' ? (subtotal * Math.min(valor, 100)) / 100 : valor);
  const tasa = tarifaImpuesto && tarifaImpuesto > 0 ? tarifaImpuesto : 0;
  const impuesto = redondear(((subtotal + cargo) * tasa) / 100);
  return { subtotal, comensales, cargo, impuesto, total: redondear(subtotal + cargo + impuesto) };
}

/** Texto del valor («10 %» o el monto ya formateado). */
export function textoValorCargo(
  c: Pick<ServiceCharge, 'charge_type' | 'charge_value'>,
  formatearMoneda: (n: number) => string,
  formatearNumero: (n: number) => string,
): string {
  return c.charge_type === 'percentage' ? `${formatearNumero(Number(c.charge_value))} %` : formatearMoneda(Number(c.charge_value));
}
