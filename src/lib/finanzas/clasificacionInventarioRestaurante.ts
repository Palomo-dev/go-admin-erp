/**
 * Clasificación de inventario y costo por producto en hoteles y restaurantes (regla del contador,
 * 25-oct-2026). Espejo de `public.fn_clasificar_producto_restaurante` (migración 134030).
 *
 * Orden: 1) override del producto; 2) ingrediente de receta = insumo (14050501 / 61400501), y si
 * además se vende solo, revisión; 3) compuesto o preparación = plato (costo 61400501, mermas
 * 61400502; inventario solo con control de stock: 14350101 + revisión); 4) resto = reventa
 * (14350101); 5) desconocido = 14350101. Comercio: siempre 14350101.
 *
 * Separación insumo/reventa (QA 25-oct, punto D): el insumo va a 14050501 SOLO si `separarInsumos`
 * es true, que debe venir de `public.fn_separacion_insumos_activa(org)` (tabla
 * `p1_separacion_insumos`: las orgs H/R existentes al aplicar 134030 quedan desactivadas hasta que Juan
 * apruebe la reclasificación de su stock; las orgs nuevas sí separan). Por defecto false (conservador):
 * sin el dato, el insumo sigue en 14350101 y nunca deja 14050501 en negativo.
 *
 * Decide la cuenta del MOVIMIENTO NUEVO. No reclasifica saldos históricos: eso es un asiento de
 * reclasificación aparte con el OK de Juan.
 */
import { esHotelORestaurante } from './cuentaAuxiliarDeTitulo';

export type ClaseProducto = 'comercio' | 'insumo' | 'plato' | 'reventa' | 'desconocido';

export interface ProductoClasificable {
  cuentaInventario?: string | null;
  cuentaCosto?: string | null;
  esIngrediente?: boolean;
  seVendeSolo?: boolean;
  isComposite?: boolean | null;
  productionType?: string | null;
  trackStock?: boolean | null;
}

export interface ClasificacionProducto {
  clase: ClaseProducto;
  cuentaInventario: string | null;
  cuentaCosto: string | null;
  cuentaMerma: string | null;
  revisar: string | null;
  override: boolean;
}

export const CUENTA_INSUMOS_COCINA = '14050501';
export const CUENTA_REVENTA = '14350101';
export const CUENTA_COSTO_AYB = '61400501';
export const CUENTA_MERMAS_COCINA = '61400502';

export function clasificarProductoRestaurante(
  tipoOrg: number | null | undefined,
  producto: ProductoClasificable | null | undefined,
  cuentasMovimiento?: ReadonlySet<string>,
  separarInsumos = false,
): ClasificacionProducto {
  if (!esHotelORestaurante(tipoOrg)) {
    return { clase: 'comercio', cuentaInventario: CUENTA_REVENTA, cuentaCosto: null, cuentaMerma: null, revisar: null, override: false };
  }
  if (!producto) {
    return { clase: 'desconocido', cuentaInventario: CUENTA_REVENTA, cuentaCosto: CUENTA_COSTO_AYB, cuentaMerma: CUENTA_MERMAS_COCINA, revisar: null, override: false };
  }
  let r: ClasificacionProducto;
  if (producto.esIngrediente) {
    r = {
      clase: 'insumo', cuentaInventario: separarInsumos ? CUENTA_INSUMOS_COCINA : CUENTA_REVENTA, cuentaCosto: CUENTA_COSTO_AYB, cuentaMerma: CUENTA_MERMAS_COCINA,
      revisar: producto.seVendeSolo ? 'insumo que también se vende solo en POS' : null, override: false,
    };
  } else if (producto.isComposite || producto.productionType === 'composite' || producto.productionType === 'preparation') {
    r = {
      clase: 'plato', cuentaInventario: producto.trackStock ? CUENTA_REVENTA : null, cuentaCosto: CUENTA_COSTO_AYB,
      cuentaMerma: CUENTA_MERMAS_COCINA, revisar: producto.trackStock ? 'plato preparado con control de stock' : null, override: false,
    };
  } else {
    r = { clase: 'reventa', cuentaInventario: CUENTA_REVENTA, cuentaCosto: CUENTA_COSTO_AYB, cuentaMerma: CUENTA_MERMAS_COCINA, revisar: null, override: false };
  }
  const ok = (c: string | null | undefined): c is string =>
    !!c?.trim() && (cuentasMovimiento ? cuentasMovimiento.has(c.trim()) : /^\d{8}$/.test(c.trim()));
  if (ok(producto.cuentaInventario)) r = { ...r, cuentaInventario: producto.cuentaInventario.trim(), override: true };
  if (ok(producto.cuentaCosto)) r = { ...r, cuentaCosto: producto.cuentaCosto.trim(), override: true };
  return r;
}
