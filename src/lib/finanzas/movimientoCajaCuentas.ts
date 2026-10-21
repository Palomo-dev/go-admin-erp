/**
 * Contrapartida de un movimiento de caja.
 *
 * La regla viva `cash_movement/created` es D 1105 / C 4105. En un egreso el
 * disparador intercambia los lados, así que un gasto que no es una venta
 * queda D 4105 (Ventas) / C 1105. Aquí el egreso va a la cuenta del concepto
 * (gasto de clase 5, proveedor, banco o préstamo) y 4105 solo se usa cuando
 * el concepto es una venta de contado.
 */

export type AccionAsiento =
  | { tipo: 'asiento'; debito: string; credito: string }
  | { tipo: 'omitir' }
  | { tipo: 'sin_cuenta' };

const CAJA = ['1105'] as const;

const EGRESO_POR_CONCEPTO: Record<string, readonly string[]> = {
  pagoProveedor: ['2105', '2205'],
  prestamoEmpleado: ['1365'],
  retiroConsignacion: ['1110'],
  retiroEfectivo: ['1110'],
};

/** Gasto de clase 5. 5195 (diversos) antes que 5105 (personal): un egreso genérico no es nómina. */
const GASTO = ['5195', '5135', '5305', '5105'] as const;

const INGRESO_POR_CONCEPTO: Record<string, readonly string[]> = {
  ventaContadoEspecial: ['4105'],
  fondoAdicional: ['3105', '3115', '3605'],
  prestamoInterno: ['2380', '2305', '2195'],
  devolucionRecibida: ['2105'],
};

/** Otro ingreso: 4250 existe en el plan estándar. No es 4105. */
const OTRO_INGRESO = ['4250', '4295', '4210'] as const;

export function primeraDisponible(
  preferidas: readonly string[],
  existentes: ReadonlySet<string>,
): string | null {
  return preferidas.find((codigo) => existentes.has(codigo)) ?? null;
}

function esEntrada(tipo: string): boolean {
  return tipo === 'in' || tipo === 'deposit' || tipo === 'income';
}

/**
 * `existentes` son cuentas de detalle que la organización sí tiene.
 * `cambioEfectivo` no mueve resultado: se omite el asiento.
 */
export function asientoDeMovimientoCaja(
  tipo: string,
  conceptCode: string | null | undefined,
  existentes: ReadonlySet<string>,
): AccionAsiento {
  const clave = conceptCode ?? '';
  if (clave === 'cambioEfectivo') return { tipo: 'omitir' };

  const caja = primeraDisponible(CAJA, existentes);
  if (esEntrada(tipo)) {
    const preferidas = INGRESO_POR_CONCEPTO[clave] ?? OTRO_INGRESO;
    let credito = primeraDisponible(preferidas, existentes);
    if (clave !== 'ventaContadoEspecial' && credito?.startsWith('4105')) credito = null;
    if (!caja || !credito) return { tipo: 'sin_cuenta' };
    return { tipo: 'asiento', debito: caja, credito };
  }

  const preferidas = EGRESO_POR_CONCEPTO[clave] ?? GASTO;
  const debito = primeraDisponible(preferidas, existentes);
  if (!caja || !debito || debito.startsWith('4')) return { tipo: 'sin_cuenta' };
  return { tipo: 'asiento', debito, credito: caja };
}

/**
 * Revisión de los otros hechos que la auditoría pidió mirar.
 * El valor es la cuenta que DEBE quedar al débito. Una devolución de venta
 * reversa el ingreso (4105): no es un gasto de clase 5.
 */
export const DEBITO_REVISADO: Record<string, { debito: string; clase: 'gasto' | 'pasivo' | 'contra_ingreso' | 'costo' }> = {
  'tip.created': { debito: '5105', clase: 'gasto' },
  'payroll.created': { debito: '5105', clase: 'gasto' },
  'payroll.paid': { debito: '2505', clase: 'pasivo' },
  'commission.accrued': { debito: '5235', clase: 'gasto' },
  'commission.paid': { debito: '2370', clase: 'pasivo' },
  'refund.refunded': { debito: '4105', clase: 'contra_ingreso' },
  'sale_credit_note.created': { debito: '4105', clase: 'contra_ingreso' },
  'inventory_adjustment.loss': { debito: '5150', clase: 'gasto' },
  'inventory.adjusted': { debito: '6105', clase: 'costo' },
};

/** Ajuste de banco: la salida es gasto financiero, no 5105 ni 4105. La entrada acredita 4250, no un gasto. */
export function asientoAjusteBanco(
  importe: number,
  cuentaBanco: string | null | undefined,
  existentes: ReadonlySet<string>,
): AccionAsiento {
  const banco = cuentaBanco && existentes.has(cuentaBanco)
    ? cuentaBanco
    : primeraDisponible(['1110', '1105'], existentes);
  if (importe < 0) {
    const debito = primeraDisponible(['5305', '5195', '5135'], existentes);
    if (!banco || !debito || debito.startsWith('4') || debito === '5105') return { tipo: 'sin_cuenta' };
    return { tipo: 'asiento', debito, credito: banco };
  }
  if (importe > 0) {
    const credito = primeraDisponible(['4250', '4295', '4210'], existentes);
    if (!banco || !credito || credito.startsWith('4105') || credito.startsWith('5')) return { tipo: 'sin_cuenta' };
    return { tipo: 'asiento', debito: banco, credito };
  }
  return { tipo: 'omitir' };
}

/** Transferencia: débito el banco destino, crédito el origen. Sin códigos no se usa la regla `bank/adjusted` (C 5105). */
export function asientoTransferenciaBancaria(
  cuentaOrigen: string | null | undefined,
  cuentaDestino: string | null | undefined,
): AccionAsiento {
  const origen = cuentaOrigen?.trim() || '';
  const destino = cuentaDestino?.trim() || '';
  if (!origen || !destino || origen === destino) return { tipo: 'sin_cuenta' };
  if (/^[45]/.test(origen) || /^[45]/.test(destino)) return { tipo: 'sin_cuenta' };
  return { tipo: 'asiento', debito: destino, credito: origen };
}
