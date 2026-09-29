/**
 * Lógica pura de Stock, Movimientos y Kardex (bloque B1). Sin React: la prueban
 * los tests (`__tests__/logicaStock.test.ts`).
 */
import type { TonoBadge } from '@/components/kit/estadoTono';
import type { EstadoStock, StockFila, StockPorSucursal } from '@/lib/services/stockService';

// ─── Estado de una fila de stock (Figma 582:277572) ─────────────────────────

export const TONO_ESTADO_STOCK: Record<EstadoStock, TonoBadge> = {
  disponible: 'exito',
  bajo_minimo: 'advertencia',
  agotado: 'peligro',
  negativo: 'peligro',
};

/** Fila resaltada en rojo (Figma: «Café molido» en negativo). */
export function tonoFilaStock(fila: Pick<StockFila, 'estado'>): 'peligro' | undefined {
  return fila.estado === 'negativo' ? 'peligro' : undefined;
}

/** Sucursales de la fila en el orden del servidor (principal primero). */
export function sucursalesDeFila(fila: Pick<StockFila, 'por_sucursal'>, maximo = 3): { visibles: StockPorSucursal[]; resto: number } {
  const visibles = fila.por_sucursal.slice(0, maximo);
  return { visibles, resto: Math.max(0, fila.por_sucursal.length - visibles.length) };
}

/** Existencia de un producto en una sucursal (0 si no tiene fila). */
export function existenciaEn(fila: Pick<StockFila, 'por_sucursal'>, branchId: number | null | undefined): StockPorSucursal | null {
  if (!branchId) return null;
  return fila.por_sucursal.find((s) => s.branch_id === branchId) ?? null;
}

// ─── Motivos de los diálogos (Figma 586:73716 / 586:73820) ───────────────────

export const MOTIVOS_ENTRADA = ['compra_sin_orden', 'devolucion_cliente', 'donacion', 'sobrante', 'produccion_propia', 'otro'] as const;
export const MOTIVOS_SALIDA = ['merma_vencido', 'merma_rotura', 'consumo_interno', 'danio', 'perdida', 'muestra', 'otro'] as const;
export type MotivoEntrada = (typeof MOTIVOS_ENTRADA)[number];
export type MotivoSalida = (typeof MOTIVOS_SALIDA)[number];

/** B2 guarda `reason` de hasta 60 caracteres. */
export const LARGO_MOTIVO = 60;

// ─── Validación de «Registrar entrada/salida» ────────────────────────────────

export interface FormMovimiento {
  direccion: 'in' | 'out';
  productoId: number | null;
  sucursalId: number | null;
  cantidad: number | null;
  costo: number | null;
  motivo: string;
  /** Texto libre cuando el motivo es «otro». */
  motivoOtro: string;
  loteId: number | null;
  conLotes: boolean;
  conSeriales: boolean;
  /** Disponible en la sucursal (o en el lote elegido) para la salida. */
  disponible: number | null;
}

export type CampoMovimiento = 'producto' | 'sucursal' | 'cantidad' | 'costo' | 'motivo' | 'lote';
export type ErrorCampo = 'requerido' | 'mayorQueCero' | 'noNegativo' | 'superaDisponible' | 'conSeriales';

export function validarMovimiento(f: FormMovimiento): Partial<Record<CampoMovimiento, ErrorCampo>> {
  const e: Partial<Record<CampoMovimiento, ErrorCampo>> = {};
  if (!f.productoId) e.producto = 'requerido';
  else if (f.conSeriales) e.producto = 'conSeriales';
  if (!f.sucursalId) e.sucursal = 'requerido';
  if (f.cantidad === null || !Number.isFinite(f.cantidad)) e.cantidad = 'requerido';
  else if (f.cantidad <= 0) e.cantidad = 'mayorQueCero';
  else if (f.direccion === 'out' && f.disponible !== null && f.cantidad > f.disponible) e.cantidad = 'superaDisponible';
  if (f.direccion === 'in') {
    if (f.costo === null || !Number.isFinite(f.costo)) e.costo = 'requerido';
    else if (f.costo < 0) e.costo = 'noNegativo';
  }
  if (!f.motivo || (f.motivo === 'otro' && !f.motivoOtro.trim())) e.motivo = 'requerido';
  if (f.conLotes && !f.loteId) e.lote = 'requerido';
  return e;
}

/** Diferencia de «Ajustar cantidad del lote» (Figma 522:63102): nueva − actual, 3 decimales. */
export function diferenciaCantidad(actual: number, nueva: number | null): number | null {
  if (nueva === null || !Number.isFinite(nueva)) return null;
  return Math.round((nueva - actual) * 1000) / 1000;
}

// ─── Exportación ─────────────────────────────────────────────────────────────

export interface FormatosCsv {
  estado: (e: EstadoStock) => string;
  cantidad: (n: number) => string;
  moneda: (n: number | null) => string;
}

/** Filas del CSV de stock: una por producto y, debajo, su desglose por sucursal. */
export function filasCsvStock(filas: readonly StockFila[], f: FormatosCsv): (string | number | null)[][] {
  return filas.map((s) => [
    s.nombre,
    s.sku ?? '',
    s.atributos ?? '',
    s.categoria ?? '',
    s.por_sucursal.map((p) => `${p.sucursal}: ${f.cantidad(p.existencia)}`).join(' | '),
    s.existencia,
    s.reservado,
    s.disponible,
    s.minimo,
    s.costo_promedio === null ? '' : f.moneda(s.costo_promedio),
    s.valor === null ? '' : f.moneda(s.valor),
    f.estado(s.estado),
  ]);
}

/** Nombre del archivo: día de la organización, nunca `toISOString`. */
export function nombreArchivo(base: string, hoy: string, extension = 'csv'): string {
  return `${base}_${hoy}.${extension}`;
}
