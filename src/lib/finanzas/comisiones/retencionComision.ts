/**
 * Retención en la fuente sobre comisiones (art. 392 ET), regla del contador 25-oct-2026.
 * Espejo de public.fn_comision_retencion / fn_retencion_art383 (migración 20261025134130).
 * - Sin base mínima.
 * - Régimen Simple: 0.
 * - Persona jurídica: 11 %.
 * - Persona natural: 10 %; 11 % si lo causado con ese vendedor en el año supera 3.300 UVT.
 * - Persona natural que certifica (aplica art. 383): tabla del art. 383.
 * - La tarifa del vendedor (editable), si está, manda sobre todo lo anterior salvo Régimen Simple.
 */
export const UVT_2026 = 52374;
/** UVT por año (espejo de public.fiscal_uvt / fn_uvt). Años sin dato usan el último conocido. */
export const UVT_POR_ANIO: Readonly<Record<number, number>> = { 2024: 47065, 2025: 49799, 2026: UVT_2026 };

export function uvtDelAnio(anio: number = new Date().getFullYear()): number {
  if (UVT_POR_ANIO[anio] != null) return UVT_POR_ANIO[anio];
  const anios = Object.keys(UVT_POR_ANIO).map(Number).sort((a, b) => a - b);
  const previo = anios.filter((a) => a <= anio).pop() ?? anios[0];
  return UVT_POR_ANIO[previo];
}
export const TOPE_ANUAL_UVT = 3300;

export type TipoPersona = 'natural' | 'juridica' | 'simple';

export interface VendedorRetencion {
  tipoPersona?: TipoPersona | null;
  retencionTarifa?: number | null;
  aplicaArt383?: boolean | null;
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Tabla del art. 383 ET sobre la base en pesos; resultado en pesos redondeado. */
export function retencionArt383(base: number, uvt = UVT_2026): number {
  const u = Math.max(0, base) / uvt;
  let enUvt: number;
  if (u <= 95) enUvt = 0;
  else if (u <= 150) enUvt = (u - 95) * 0.19;
  else if (u <= 360) enUvt = (u - 150) * 0.28 + 10;
  else if (u <= 640) enUvt = (u - 360) * 0.33 + 69;
  else if (u <= 945) enUvt = (u - 640) * 0.35 + 162;
  else if (u <= 2300) enUvt = (u - 945) * 0.37 + 268;
  else enUvt = (u - 2300) * 0.39 + 770;
  return Math.round(Math.max(0, enUvt) * uvt);
}

/**
 * @param monto comisión causada
 * @param acumuladoAnual lo ya causado (accrued/paid) con el mismo vendedor en el año, sin esta comisión
 * @param tarifaRegla tarifa de la regla contable (por defecto 10)
 * @param anio año de causación: define la UVT (art. 383 y tope de 3.300 UVT)
 */
export function retencionComision(
  monto: number,
  vendedor: VendedorRetencion | null | undefined,
  acumuladoAnual = 0,
  tarifaRegla: number | null = null,
  anio = 2026,
): number {
  const uvt = uvtDelAnio(anio);
  if (!(monto > 0)) return 0;
  const tipo = vendedor?.tipoPersona ?? 'natural';
  if (tipo === 'simple') return 0;
  if (vendedor?.retencionTarifa != null) return redondear2((monto * vendedor.retencionTarifa) / 100);
  if (tipo === 'juridica') return redondear2((monto * 11) / 100);
  if (vendedor?.aplicaArt383) return retencionArt383(monto, uvt);
  const tarifa = acumuladoAnual + monto > TOPE_ANUAL_UVT * uvt ? 11 : tarifaRegla ?? 10;
  return redondear2((monto * tarifa) / 100);
}
