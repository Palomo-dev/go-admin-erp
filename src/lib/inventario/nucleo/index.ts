/**
 * Núcleo de existencias (bloque B0). Punto de entrada para los bloques B1–B10:
 *
 *   import { costoPromedioTrasEntrada, repartirFefo, type PermisosInventario } from '@/lib/inventario/nucleo';
 *
 * Hooks y RPC con cliente: `@/lib/inventario/permisos`, `@/lib/inventario/usePermisosInventario`,
 * `@/lib/inventario/documentoMovimiento`. Movimientos desde TS: solo por
 * `stockMovementService` (fachada de RPC) o por las RPC de cada bloque.
 */
export * from './tipos';
export * from './costo';
export * from './errores';
export * from './lotes';
