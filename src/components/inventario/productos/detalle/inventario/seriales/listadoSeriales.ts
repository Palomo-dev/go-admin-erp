/**
 * Lógica pura del listado de seriales del detalle de producto: filtros,
 * búsqueda exacta (escáner), cupo por sucursal y exportación CSV.
 *
 * Sin React ni Supabase: se prueba en `__tests__/listadoSeriales.test.ts`.
 * Las reglas de estados, transiciones, patrón y garantía viven en
 * `logica/seriales.ts` (compartidas con el formulario y el servidor).
 */
import { cupoSeriales, estadoGarantia } from '../../../logica/seriales';

/** Fila de `serial_numbers` con los nombres ya resueltos (cliente, sucursal). */
export interface FilaSerial {
  id: number;
  product_id: number;
  serial: string;
  status: string;
  branch_id: number | null;
  current_branch_id: number | null;
  sold_to_customer_id: string | null;
  sale_date: string | null;
  /** Columna `date`. */
  warranty_start: string | null;
  /** Columna `date`. */
  warranty_end: string | null;
  warranty_months: number | null;
  cost_at_purchase: number | null;
  price_at_sale: number | null;
  received_date: string | null;
  created_at: string;
  cliente: string | null;
  sucursal: string | null;
}

export type FiltroGarantia = 'vigente' | 'por_vencer' | 'vencida' | 'sin_garantia';

export const FILTROS_GARANTIA: readonly FiltroGarantia[] = ['vigente', 'por_vencer', 'vencida', 'sin_garantia'];

/** Días de anticipación para «por vencer». */
export const DIAS_POR_VENCER = 30;

/** Categoría de garantía de un serial (`hoy` = día de la organización). */
export function categoriaGarantia(warrantyEnd: string | null | undefined, hoy: string): FiltroGarantia {
  const g = estadoGarantia(warrantyEnd, hoy);
  if (g.estado === 'sin_garantia') return 'sin_garantia';
  if (g.estado === 'vencida') return 'vencida';
  return g.dias <= DIAS_POR_VENCER ? 'por_vencer' : 'vigente';
}

export interface FiltrosSeriales {
  texto: string;
  estado: string | null;
  sucursal: number | null;
  garantia: FiltroGarantia | null;
  variante: number | null;
}

export const FILTROS_VACIOS: FiltrosSeriales = { texto: '', estado: null, sucursal: null, garantia: null, variante: null };

export function normalizarSerial(texto: string): string {
  return texto.trim().toLowerCase();
}

export function filtrarSeriales<T extends FilaSerial>(filas: readonly T[], filtros: FiltrosSeriales, hoy: string): T[] {
  const texto = normalizarSerial(filtros.texto);
  return filas.filter((f) => {
    if (texto && !f.serial.toLowerCase().includes(texto)) return false;
    if (filtros.estado && f.status !== filtros.estado) return false;
    if (filtros.sucursal !== null && f.current_branch_id !== filtros.sucursal) return false;
    if (filtros.variante !== null && f.product_id !== filtros.variante) return false;
    if (filtros.garantia) {
      const cat = categoriaGarantia(f.warranty_end, hoy);
      // «Vigente» incluye las que están por vencer (siguen vigentes).
      if (filtros.garantia === 'vigente' ? cat !== 'vigente' && cat !== 'por_vencer' : cat !== filtros.garantia) return false;
    }
    return true;
  });
}

/** Serial idéntico al texto (lectura del escáner o Enter en el buscador). */
export function buscarSerialExacto<T extends { serial: string }>(filas: readonly T[], texto: string): T | null {
  const buscado = normalizarSerial(texto);
  if (!buscado) return null;
  return filas.find((f) => f.serial.trim().toLowerCase() === buscado) ?? null;
}

/** Clave de stock por (producto, sucursal). */
export function claveStock(productId: number, branchId: number): string {
  return `${productId}:${branchId}`;
}

/** Seriales en stock o reservados por (producto, sucursal): lo que ya ocupa unidades. */
export function serialesOcupando(filas: readonly Pick<FilaSerial, 'product_id' | 'current_branch_id' | 'status'>[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    if (f.current_branch_id === null || (f.status !== 'in_stock' && f.status !== 'reserved')) continue;
    const k = claveStock(f.product_id, f.current_branch_id);
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return mapa;
}

/** Cupo (unidades sin serial) de un producto en una sucursal; igual que `fn_producto_generar_seriales`. */
export function cupoEn(stock: ReadonlyMap<string, number>, ocupando: ReadonlyMap<string, number>, productId: number, branchId: number): number {
  const k = claveStock(productId, branchId);
  return cupoSeriales(stock.get(k) ?? 0, ocupando.get(k) ?? 0);
}

/** Unidades sin serial de todo el producto (todas las sucursales y variantes con stock). */
export function totalSinSerial(stock: ReadonlyMap<string, number>, ocupando: ReadonlyMap<string, number>): number {
  let total = 0;
  stock.forEach((qty, k) => {
    total += cupoSeriales(qty, ocupando.get(k) ?? 0);
  });
  return total;
}

/** Consecutivo con el que continuaría el patrón (el servidor usa count(*) + 1 por producto). */
export function siguienteSecuencia(filas: readonly Pick<FilaSerial, 'product_id'>[], productId: number): number {
  return filas.reduce((n, f) => (f.product_id === productId ? n + 1 : n), 0) + 1;
}

/** Cuántas entradas repetidas trae una lista pegada (antes de quitar duplicados). */
export function repetidosEnLista(texto: string): number {
  const partes = texto.split(/[\n\r,;\t]+/).map((s) => s.trim()).filter(Boolean);
  return partes.length - new Set(partes).size;
}

// ── CSV ────────────────────────────────────────────────────────────────────

/**
 * Celda CSV entre comillas. Los valores que empiezan por = + - @ se prefijan
 * con apóstrofo para que la hoja de cálculo no los ejecute como fórmula
 * (los seriales y nombres de cliente vienen de usuarios).
 */
export function celdaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '""';
  let s = String(valor);
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const BOM = String.fromCharCode(0xfeff);

/** CSV con BOM (Excel reconoce UTF-8) y fin de línea CRLF. */
export function construirCsv(encabezados: readonly string[], filas: readonly (readonly (string | number | null | undefined)[])[]): string {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(celdaCsv).join(','));
  return BOM + lineas.join('\r\n');
}

/** Nombre de archivo seguro a partir del SKU. */
export function nombreArchivoCsv(sku: string | null | undefined, id: number, hoy: string): string {
  const base = (sku ?? '').trim().replace(/[^\w.-]+/g, '_') || String(id);
  return `seriales_${base}_${hoy}.csv`;
}
