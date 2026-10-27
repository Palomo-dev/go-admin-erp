/**
 * Mapeo del contador (20261027210000): ICA_0.966 → 23680501, RETE_4 → 23652501,
 * RETE_11 → 23651501, RETE_11_COMISION («Comisiones 11 %») → 23652001; IVA_0
 * (exento) SIN cuenta. Nunca se usan 23170501, 23650501 (nómina), 23650502 ni
 * 24080503. Si el código guardado no existe, se usa la canónica solamente
 * cuando esa sí está en el plan; si no, no hay cuenta.
 */

/** Cuentas que la siembra ya no debe usar. */
export const CUENTAS_IMPUESTO_OBSOLETAS = ['23170501', '23650501', '23650502', '24080503'] as const;

/** Mapeo que siembran las orgs nuevas (`fn_sembrar_mapeo_impuestos`). IVA_0 no lleva cuenta. */
export const MAPEO_IMPUESTOS_SIEMBRA: Readonly<Record<string, string | null>> = {
  IVA_19: '24080501',
  IVA_5: '24080502',
  IVA_0: null,
  RETE_4: '23652501',
  RETE_11: '23651501',
  RETE_11_COMISION: '23652001',
  'ICA_0.966': '23680501',
};

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
  if (code === 'IVA_0' || code === 'IVA_EXCLUIDO') return null;
  if (code in MAPEO_IMPUESTOS_SIEMBRA) return MAPEO_IMPUESTOS_SIEMBRA[code];
  if (esImpuestoIva(code, name)) return '2408';
  if (code.includes('ICA') || name.includes('ICA')) return '23680501';
  if (code.startsWith('RETE') || name.includes('RETE') || name.includes('FUENTE')) {
    if (code.includes('IVA') || name.includes('VENTAS')) return '23670501';
    if (name.includes('COMISI')) return '23652001';
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
