'use client';

/**
 * Rutas de facturas de compra. La misma pantalla vive en Finanzas y en
 * Inventario (`basePath` se deduce de la URL); las URL de detalle NO cambian:
 * las enlazan proveedor, OC, kardex, notificaciones, comisiones y reportes.
 */
import { usePathname } from 'next/navigation';

export const RUTA_COMPRAS_FINANZAS = '/app/finanzas/facturas-compra';
export const RUTA_COMPRAS_INVENTARIO = '/app/inventario/facturas-compra';
export const RUTA_CXP = '/app/finanzas/cuentas-por-pagar';
export const RUTA_PROVEEDORES = '/app/inventario/proveedores';

export function baseCompras(pathname: string | null | undefined): string {
  return (pathname ?? '').startsWith('/app/inventario') ? RUTA_COMPRAS_INVENTARIO : RUTA_COMPRAS_FINANZAS;
}

export function useBaseCompras(): string {
  return baseCompras(usePathname());
}
