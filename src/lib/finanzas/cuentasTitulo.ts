/** Cuenta del plan, con lo mínimo para saber si agrupa a otras. */
export interface CuentaParaTitulo {
  account_code: string;
  parent_code?: string | null;
}

/**
 * Cuenta de título: clase o grupo del PUC (menos de 4 dígitos) o cualquiera
 * que tenga hijas, por `parent_code` o porque otro código la usa de prefijo.
 * Una cuenta de título no recibe movimientos.
 */
export function esCuentaDeTitulo(cuenta: CuentaParaTitulo, todas: readonly CuentaParaTitulo[]): boolean {
  const codigo = cuenta.account_code;
  if (!codigo || codigo.length < 4) return true;
  return todas.some((otra) => {
    if (otra.account_code === codigo) return false;
    if (otra.parent_code === codigo) return true;
    return otra.account_code.startsWith(codigo);
  });
}

export function esCuentaDeDetalle(cuenta: CuentaParaTitulo, todas: readonly CuentaParaTitulo[]): boolean {
  return !esCuentaDeTitulo(cuenta, todas);
}
