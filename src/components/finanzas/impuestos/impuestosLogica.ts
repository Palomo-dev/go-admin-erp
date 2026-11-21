/**
 * Finanzas › Impuestos (Figma 1012:86383 y estados 830:52xxxx): lógica pura de
 * presentación del listado de impuestos de venta y compra. Sin React ni I/O;
 * probada en `__tests__/impuestosLogica.test.ts`.
 *
 * La clase (impuesto o retención) sale de `organization_taxes.kind`; el código
 * DIAN lo decide `mapTaxCode` (factusService), el mismo que usa la factura
 * electrónica: aquí solo se pinta, nunca se recalcula.
 */
import { mapTaxCode } from '@/lib/services/factusService';

export type TipoImpuesto = 'iva' | 'inc' | 'ibua' | 'ica' | 'otro';

/** Uso de productos (RPC `fn_impuestos_uso_productos`). */
export interface UsoProductos {
  total: number;
  conImpuesto: number;
  exentos: number;
  porImpuesto: Record<string, number>;
}

export interface FilaImpuesto {
  id: string;
  name: string;
  rate: number;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  tax_included?: boolean;
  template_id: number | null;
}

export type FiltroEstado = 'todos' | 'activos' | 'inactivos';
export interface FiltrosImpuestos {
  estado: FiltroEstado;
  tipo: TipoImpuesto | 'todos';
}
export const FILTROS_VACIOS: FiltrosImpuestos = { estado: 'todos', tipo: 'todos' };

function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

/** Tipo de tributo: del código de la plantilla si lo hay; si no, del nombre. */
export function tipoImpuesto(codigo: string | null | undefined, nombre: string | null | undefined): TipoImpuesto {
  const c = normalizar(codigo);
  if (c) {
    if (c === '01' || c.startsWith('IVA')) return 'iva';
    if (c === '04' || c.startsWith('INC')) return 'inc';
    if (c === '35' || c.startsWith('IBUA')) return 'ibua';
    if (c === '03' || c.startsWith('ICA')) return 'ica';
  }
  const n = normalizar(nombre);
  if (/\bIVA\b/.test(n)) return 'iva';
  if (/\bINC\b|IMPOCONSUMO|CONSUMO/.test(n)) return 'inc';
  if (/\bIBUA\b|ULTRAPROCESAD/.test(n)) return 'ibua';
  if (/\bICA\b|INDUSTRIA Y COMERCIO/.test(n)) return 'ica';
  return 'otro';
}

const CODIGO_POR_TIPO: Partial<Record<TipoImpuesto, string>> = { iva: 'IVA', inc: 'INC', ibua: 'IBUA' };

/**
 * Código DIAN con que sale en la factura electrónica («01», «04», «35») o
 * `null` si la factura no lo admite como impuesto de la línea (ICA, otros).
 */
export function codigoDian(codigo: string | null | undefined, nombre: string | null | undefined): string | null {
  const tipo = tipoImpuesto(codigo, nombre);
  const fuente = codigo && normalizar(codigo) ? codigo : CODIGO_POR_TIPO[tipo];
  if (!fuente) return null;
  try {
    return mapTaxCode(fuente);
  } catch {
    return null;
  }
}

/** Tarifa 0 de tipo IVA: excluido o exento. */
export function esExento(fila: Pick<FilaImpuesto, 'rate'>, tipo: TipoImpuesto): boolean {
  return tipo === 'iva' && Number(fila.rate) === 0;
}

/** Búsqueda por nombre, descripción o tarifa («19», «19 %», «0,966»), sin tildes ni mayúsculas. */
export function coincideBusqueda(fila: Pick<FilaImpuesto, 'name' | 'description' | 'rate'>, termino: string): boolean {
  const q = normalizar(termino).replace(/\s*%$/, '').replace(',', '.');
  if (!q) return true;
  if (normalizar(fila.name).includes(q) || normalizar(fila.description).includes(q)) return true;
  return String(Number(fila.rate)).includes(q);
}

export function filtrarImpuestos<T extends FilaImpuesto>(
  filas: readonly T[],
  termino: string,
  filtros: FiltrosImpuestos,
  tipoDe: (fila: T) => TipoImpuesto,
): T[] {
  return filas.filter((f) => {
    if (filtros.estado === 'activos' && !f.is_active) return false;
    if (filtros.estado === 'inactivos' && f.is_active) return false;
    if (filtros.tipo !== 'todos' && tipoDe(f) !== filtros.tipo) return false;
    return coincideBusqueda(f, termino);
  });
}

export function conteoFiltros(filtros: FiltrosImpuestos): number {
  return (filtros.estado !== 'todos' ? 1 : 0) + (filtros.tipo !== 'todos' ? 1 : 0);
}

/** Estado del listado (DataTable): el error de permiso manda sobre el error genérico. */
export function estadoListado(args: {
  cargando: boolean;
  sinPermiso: boolean;
  error: boolean;
  total: number;
  visibles: number;
}): 'cargando' | 'sinPermiso' | 'error' | 'vacio' | 'sinResultados' | 'listo' {
  if (args.sinPermiso) return 'sinPermiso';
  if (args.cargando && args.total === 0) return 'cargando';
  if (args.error && args.total === 0) return 'error';
  if (args.total === 0) return 'vacio';
  if (args.visibles === 0) return 'sinResultados';
  return 'listo';
}

/** Normaliza la respuesta de `fn_impuestos_uso_productos`. */
export function leerUsoProductos(crudo: unknown): UsoProductos | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const c = crudo as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
  const por: Record<string, number> = {};
  if (c.por_impuesto && typeof c.por_impuesto === 'object') {
    for (const [k, v] of Object.entries(c.por_impuesto as Record<string, unknown>)) por[k] = n(v);
  }
  return { total: n(c.total), conImpuesto: n(c.con_impuesto), exentos: n(c.exentos), porImpuesto: por };
}

export interface Cobertura {
  /** Productos sin impuesto propio: se venden con la tarifa por defecto. */
  sinConfigurar: number;
  pctConImpuesto: number;
  pctExentos: number;
  pctSinConfigurar: number;
}

/** Porcentajes con un decimal que suman 100 (el resto va a «sin configurar»). */
export function cobertura(uso: UsoProductos): Cobertura {
  const total = uso.total;
  const con = Math.min(uso.conImpuesto, total);
  const exentos = Math.min(uso.exentos, Math.max(0, total - con));
  const sinConfigurar = Math.max(0, total - con - exentos);
  if (total === 0) return { sinConfigurar: 0, pctConImpuesto: 0, pctExentos: 0, pctSinConfigurar: 0 };
  const pct = (x: number) => Math.round((x / total) * 1000) / 10;
  const pctConImpuesto = pct(con);
  const pctExentos = pct(exentos);
  return { sinConfigurar, pctConImpuesto, pctExentos, pctSinConfigurar: Math.max(0, Math.round((100 - pctConImpuesto - pctExentos) * 10) / 10) };
}

/** Nombre de la copia al duplicar («IVA 19 % (copia)»), sin pasar de 100 caracteres. */
export function nombreCopia(nombre: string, sufijo: string): string {
  const extra = ` (${sufijo})`;
  return `${nombre.slice(0, Math.max(0, 100 - extra.length))}${extra}`;
}

/** Plantillas del país que la organización aún no tiene (para «Cargar plantilla»). */
export function plantillasPendientes(
  plantillas: readonly { id: number; kind?: string | null }[],
  impuestosOrg: readonly { template_id: number | null }[],
): number {
  const usadas = new Set(impuestosOrg.map((t) => t.template_id).filter((x): x is number => x !== null));
  return plantillas.filter((p) => (p.kind ?? 'tax') === 'tax' && !usadas.has(p.id)).length;
}
