/**
 * Devengo de una factura con IVA incluido, en pesos enteros.
 * La base se redondea y el IVA es el residuo, así el débito al cliente
 * cuadra con el ingreso más el IVA. El IVA de la venta va al crédito.
 */
export function asientoIvaIncluido(total: number, tasa = 0.19): {
  debitoClientes: number;
  ingreso: number;
  ivaGenerado: number;
} {
  const debitoClientes = Math.round(total);
  const ingreso = Math.round(debitoClientes / (1 + tasa));
  const ivaGenerado = debitoClientes - ingreso;
  return { debitoClientes, ingreso, ivaGenerado };
}

/**
 * Misma regla que `fn_create_journal_entry`: redondea el total y el impuesto
 * a pesos y deja el residuo en la línea de ingreso o de costo. El asiento cuadra.
 */
export function cuadrarDevengoPesos(
  total: number,
  impuesto: number,
  impuestoAlCredito: boolean,
): { debitos: number; creditos: number; impuesto: number; contrapartida: number } {
  const monto = Math.round(total);
  let iva = Math.round(impuesto);
  if (iva < 0) iva = 0;
  if (iva > monto) iva = monto;
  const contrapartida = monto - iva;
  if (impuestoAlCredito) {
    return { debitos: monto, creditos: contrapartida + iva, impuesto: iva, contrapartida };
  }
  return { debitos: contrapartida + iva, creditos: monto, impuesto: iva, contrapartida };
}
