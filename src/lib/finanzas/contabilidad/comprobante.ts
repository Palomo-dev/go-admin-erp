/** Tipo de comprobante que asigna la base al publicar un asiento nuevo. */
export const TIPOS_COMPROBANTE = ['recibo_caja', 'comprobante_egreso', 'nota_contable', 'factura'] as const;
export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number];

export const NOMBRE_COMPROBANTE: Record<TipoComprobante, string> = {
  recibo_caja: 'Recibo de caja',
  comprobante_egreso: 'Comprobante de egreso',
  nota_contable: 'Nota contable',
  factura: 'Factura',
};

export function esTipoComprobante(valor: string | null | undefined): valor is TipoComprobante {
  return TIPOS_COMPROBANTE.some((tipo) => tipo === valor);
}

/** `RC-000042`. Null si el asiento todavía no tiene consecutivo. */
export function textoComprobante(
  prefijo: string | null | undefined,
  numero: number | null | undefined,
): string | null {
  if (numero == null || !Number.isFinite(numero)) return null;
  const consecutivo = String(Math.trunc(numero)).padStart(6, '0');
  const p = (prefijo ?? '').trim();
  return p ? `${p}-${consecutivo}` : consecutivo;
}
