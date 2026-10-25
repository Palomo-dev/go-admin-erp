/**
 * Las 288 filas de `tax_account_mapping` (48 organizaciones) apuntan a
 * auxiliares de 8 dígitos que no están en el plan: 24080501 (IVA),
 * 23650501 (retefuente) y 23170501 (ICA). La cuenta canónica del IVA por
 * pagar es 2408. Si el código guardado no existe, se usa la canónica
 * solamente cuando esa sí está en el plan; si no, no hay cuenta (no se
 * contabiliza contra un código fantasma).
 */

export function esImpuestoIva(codigo: string | null | undefined, nombre: string | null | undefined): boolean {
  const code = (codigo ?? '').trim().toUpperCase();
  const name = (nombre ?? '').trim().toUpperCase();
  if (code.startsWith('IVA')) return true;
  if (name.includes('RETEIVA') || name.includes('RETE IVA')) return false;
  return name.includes('IVA');
}

/**
 * Cuenta PUC a la que debe caer el mapeo si el auxiliar no existe. Las madres 2365/2367/2368 son título
 * (134125/134135): se devuelve el auxiliar de movimiento (retefuente 23654001, ReteIVA 23670501, ReteICA 23680501).
 */
export function cuentaCanonicaImpuesto(codigo: string | null | undefined, nombre: string | null | undefined): string | null {
  const code = (codigo ?? '').trim().toUpperCase();
  const name = (nombre ?? '').trim().toUpperCase();
  if (esImpuestoIva(code, name)) return '2408';
  if (code.includes('ICA') || name.includes('ICA')) return '23680501';
  if (code.startsWith('RETE') || name.includes('RETE') || name.includes('FUENTE')) {
    if (code.includes('IVA') || name.includes('VENTAS')) return '23670501';
    return '23654001';
  }
  return null;
}

/**
 * Cuenta que sí se puede usar: la mapeada si existe en el plan; si no, la
 * canónica si existe. `null` cuando ninguna de las dos está.
 */
export function cuentaAplicableDeMapeo(
  cuentaMapeada: string | null | undefined,
  codigo: string | null | undefined,
  nombre: string | null | undefined,
  existentes: ReadonlySet<string>,
): string | null {
  const mapeada = (cuentaMapeada ?? '').trim();
  if (mapeada && existentes.has(mapeada)) return mapeada;
  const canonica = cuentaCanonicaImpuesto(codigo, nombre);
  if (canonica && existentes.has(canonica)) return canonica;
  return null;
}

/** Cuentas de activo clase 11 que pueden ser el PUC de una cuenta bancaria. */
export function cuentasBancariasElegibles<T extends { account_code: string; name: string; type: string; parent_code?: string | null; is_active?: boolean | null }>(
  cuentas: readonly T[],
): T[] {
  const activas = cuentas.filter((cuenta) => cuenta.is_active !== false);
  return activas
    .filter((cuenta) => cuenta.type === 'asset' && cuenta.account_code.startsWith('11'))
    .filter((cuenta) => {
      const codigo = cuenta.account_code;
      if (codigo.length < 4) return false;
      return !activas.some((otra) => {
        if (otra.account_code === codigo) return false;
        if (otra.parent_code === codigo) return true;
        return otra.account_code.startsWith(codigo);
      });
    })
    .slice()
    .sort((a, b) => a.account_code.localeCompare(b.account_code));
}
