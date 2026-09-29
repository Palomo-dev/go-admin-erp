/**
 * Producción: lógica pura de las pantallas (sin React ni red). El cálculo de
 * consumos y costos NO está aquí: lo hace el servidor (`fn_receta_int_calcular`,
 * `fn_receta_costo`, `complete_production_order`).
 */
import type { AccionProduccion, OrdenProduccionFila, ProductionOrderStatus } from '@/lib/services/productionOrderService';

export const rutaProduccion = () => '/app/inventario/produccion';
export const rutaOrdenProduccion = (id: number) => `/app/inventario/produccion/${id}`;
export const rutaRecetaProducto = (productId: number) => `/app/inventario/recetas/editar?producto=${productId}`;
export const rutaKardexOrden = (productId: number) => `/app/inventario/kardex?producto=${productId}&origen=production`;
export const rutaDistribuirOrden = (id: number) => `/app/inventario/distribucion?orden=${id}`;
export const rutaTraslado = (id: number) => `/app/inventario/transferencias/${id}`;

/** Máximo que se acepta al completar: 150 % de lo planeado (lo exige también el servidor). */
export const FACTOR_MAXIMO_PRODUCIDO = 1.5;

export function maximoProducible(planeado: number): number {
  return Math.round(planeado * FACTOR_MAXIMO_PRODUCIDO * 1000) / 1000;
}

/** Paso a paso de la orden (Figma `ProductionStepper`). Cancelada no tiene paso. */
export const PASOS_ORDEN: readonly Exclude<ProductionOrderStatus, 'cancelled'>[] = ['draft', 'confirmed', 'in_progress', 'completed'];

/** Qué se puede hacer con una orden en cada estado (Figma 603:153432, §3.3). */
export function accionesDisponibles(estado: ProductionOrderStatus): (AccionProduccion | 'completar' | 'distribuir')[] {
  switch (estado) {
    case 'draft':
      return ['confirmar', 'eliminar'];
    case 'confirmed':
      return ['iniciar', 'completar', 'cancelar'];
    case 'in_progress':
      return ['completar', 'cancelar'];
    case 'completed':
      return ['distribuir'];
    default:
      return [];
  }
}

/**
 * Validación de la cantidad producida en el diálogo «Completar»:
 * > 0, ≤ 150 % de lo planeado y con los decimales del producto (0 por unidad,
 * 3 por peso). Devuelve la clave del error (`inventarioProduccion.completar.errores.*`).
 */
export type ErrorCantidadProducida = 'requerida' | 'mayor_que_cero' | 'excede' | 'decimales';

export function validarCantidadProducida(
  cantidad: number | null,
  planeado: number,
  decimales: number,
): ErrorCantidadProducida | null {
  if (cantidad === null || !Number.isFinite(cantidad)) return 'requerida';
  if (cantidad <= 0) return 'mayor_que_cero';
  if (cantidad > maximoProducible(planeado) + 1e-9) return 'excede';
  const factor = 10 ** Math.max(0, Math.min(decimales, 3));
  if (Math.abs(Math.round(cantidad * factor) - cantidad * factor) > 1e-6) return 'decimales';
  return null;
}

/** Diferencia planeado vs. producido del mes (KPI): (producido − planeado) ÷ planeado. */
export function diferenciaPlaneado(planeado: number, producido: number): number | null {
  if (!planeado) return null;
  return (producido - planeado) / planeado;
}

/** Tandas de receta: cuántas veces el rinde entra en lo que se produce. */
export function tandas(cantidad: number, rinde: number): number {
  if (!rinde || rinde <= 0) return cantidad;
  return Math.round((cantidad / rinde) * 100) / 100;
}

/** Filas del CSV del listado. */
export function filasCsvProduccion(
  filas: readonly OrdenProduccionFila[],
  fmt: { fecha: (v: string | null) => string; estado: (e: ProductionOrderStatus) => string },
): (string | number | null)[][] {
  return filas.map((f) => [
    f.numero,
    fmt.fecha(f.creado_en),
    f.sucursal.nombre,
    f.producto.nombre,
    f.producto.sku,
    `v${f.receta.version}`,
    f.a_producir,
    f.producido,
    f.producto.unidad,
    f.estado === 'completed' ? f.costo_real : f.costo_estimado,
    fmt.estado(f.estado),
    f.creado_por,
  ]);
}

/** Id de una orden en la URL heredada (`/produccion?orden=12`, la que enlazan el kardex y los traslados). */
export function ordenDeLaUrl(valor: string | null | undefined): number | null {
  return valor && /^\d{1,9}$/.test(valor) ? Number(valor) : null;
}
