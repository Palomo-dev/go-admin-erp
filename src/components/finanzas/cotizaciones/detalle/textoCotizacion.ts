/**
 * Nombre visible de un impuesto guardado en una línea de cotización por su
 * código (`IVA_19` → «IVA», `INC_8` → «INC»). La cotización guarda un solo
 * impuesto por línea (`tax_code`, `tax_rate`); sin código, null y la pantalla
 * pone «Impuesto».
 */
export function nombreImpuesto(codigo: string | null | undefined): string | null {
  const c = (codigo ?? '').trim();
  if (!c) return null;
  const base = c.split(/[_\s-]/)[0];
  return base ? base.toUpperCase() : null;
}
