/**
 * Cuenta de una línea de factura y filtro de cuentas de movimiento.
 * El orden es el de `fn_cuenta_catalogo_linea` y `fn_es_cuenta_de_titulo`:
 * la base vuelve a decidirlo al publicar. Aquí solo se adelanta en pantalla.
 */

export type RolCuentaLinea = 'ingreso' | 'costo' | 'inventario' | 'devolucion';

export interface CuentasCatalogo {
  cuenta_ingreso?: string | null;
  cuenta_costo?: string | null;
  cuenta_inventario?: string | null;
  cuenta_devolucion?: string | null;
}

export interface CuentaParaMovimiento {
  account_code: string;
  parent_code?: string | null;
  is_active?: boolean | null;
  es_movimiento?: boolean | null;
}

function limpia(valor: string | null | undefined): string | null {
  const texto = (valor ?? '').trim();
  return texto === '' ? null : texto;
}

/** Compra de un producto que controla existencias: inventario. Si no, costo. */
export function rolCuentaCompra(controlaExistencias: boolean): 'inventario' | 'costo' {
  return controlaExistencias ? 'inventario' : 'costo';
}

/** Cuenta del producto y, si no tiene, la de su categoría. Sin línea escrita. */
export function cuentaDeCatalogo(
  rol: RolCuentaLinea,
  producto: CuentasCatalogo | null | undefined,
  categoria: CuentasCatalogo | null | undefined,
): string | null {
  const p = producto ?? {};
  const c = categoria ?? {};
  if (rol === 'costo') return limpia(p.cuenta_costo) ?? limpia(c.cuenta_costo);
  if (rol === 'inventario') return limpia(p.cuenta_inventario) ?? limpia(c.cuenta_inventario);
  if (rol === 'devolucion') {
    return (
      limpia(p.cuenta_devolucion) ??
      limpia(p.cuenta_ingreso) ??
      limpia(c.cuenta_devolucion) ??
      limpia(c.cuenta_ingreso)
    );
  }
  return limpia(p.cuenta_ingreso) ?? limpia(c.cuenta_ingreso);
}

/**
 * Línea, luego producto, luego categoría. Null: la publicación usa la
 * configuración contable (no se elige aquí).
 */
export function cuentaDeLinea(opciones: {
  rol: RolCuentaLinea;
  cuentaLinea?: string | null;
  producto?: CuentasCatalogo | null;
  categoria?: CuentasCatalogo | null;
}): string | null {
  return limpia(opciones.cuentaLinea) ?? cuentaDeCatalogo(opciones.rol, opciones.producto, opciones.categoria);
}

/** Igual que `fn_es_cuenta_de_titulo`: clase PUC o cuenta con hijas activas. */
export function esCuentaDeTitulo(codigo: string, cuentas: readonly CuentaParaMovimiento[]): boolean {
  const code = codigo.trim();
  if (code.length < 4) return true;
  return cuentas.some((hija) => {
    if (hija.is_active === false || hija.account_code === code) return false;
    return hija.parent_code === code || hija.account_code.slice(0, code.length) === code;
  });
}

/** La que puede ir en un asiento: activa, de movimiento y no de título. */
export function esCuentaDeMovimiento(cuenta: CuentaParaMovimiento, cuentas: readonly CuentaParaMovimiento[]): boolean {
  if (cuenta.is_active === false || cuenta.es_movimiento === false) return false;
  return !esCuentaDeTitulo(cuenta.account_code, cuentas);
}
