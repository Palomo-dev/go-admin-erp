/**
 * Retención en la fuente sobre comisiones (art. 392 ET), regla del contador 25-oct-2026.
 * Espejo de public.fn_comision_retencion / fn_retencion_art383 (migración 20261025134130).
 * - Sin base mínima.
 * - Régimen Simple: 0.
 * - Persona jurídica: 11 %.
 * - Sin datos tributarios del tercero: null (la comisión va a la cola, como el SQL; no se asume natural 10 %).
 * - Persona natural: 10 %; 11 % si el contrato o lo causado con ese tercero en el año supera 3.300 UVT.
 * - Persona natural que certifica (aplica art. 383): tabla del art. 383 sobre el ACUMULADO DEL MES, menos lo
 *   ya retenido en el mes (QA ROJO 8dc44d22 N4).
 * - La tarifa del vendedor (editable), si está, manda sobre todo lo anterior salvo Régimen Simple.
 */
export const UVT_2026 = 52374;
/** UVT por año (espejo de public.fiscal_uvt / fn_uvt). Un año sin dato es un error (QA ROJO N8: no se usa otro año). */
export const UVT_POR_ANIO: Readonly<Record<number, number>> = { 2024: 47065, 2025: 49799, 2026: UVT_2026 };

export class UvtNoConfiguradaError extends Error {
  constructor(public readonly anio: number) {
    super(`uvt_no_configurada COL/${anio}`);
    this.name = 'UvtNoConfiguradaError';
  }
}

export function uvtDelAnio(anio: number = new Date().getFullYear()): number {
  const uvt = UVT_POR_ANIO[anio];
  if (uvt == null) throw new UvtNoConfiguradaError(anio);
  return uvt;
}
export const TOPE_ANUAL_UVT = 3300;

export type TipoPersona = 'natural' | 'juridica' | 'simple';

export interface VendedorRetencion {
  tipoPersona?: TipoPersona | null;
  retencionTarifa?: number | null;
  aplicaArt383?: boolean | null;
  /** Valor del contrato (pesos): si supera 3.300 UVT, persona natural al 11 %. */
  valorContrato?: number | null;
}

/** Acumulado del mes con el tercero (sin esta comisión), para el art. 383. */
export interface AcumuladoMes {
  /** Base ya causada en el mes. */
  base: number;
  /** Retención ya practicada en el mes. */
  retenido: number;
}

/** Sin tipo de persona ni tarifa ni certificación: el SQL lo manda a la cola (retencion_sin_datos_tributarios). */
export function tieneDatosTributarios(v: VendedorRetencion | null | undefined): boolean {
  return !!v && (v.tipoPersona != null || v.retencionTarifa != null || v.aplicaArt383 != null);
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
 * @param vendedor datos tributarios del tercero; sin datos → null (cola)
 * @param acumuladoAnual lo ya causado (accrued/paid) con el mismo tercero en el año, sin esta comisión
 * @param tarifaRegla tarifa de la regla contable (por defecto 10)
 * @param anio año de causación: define la UVT (art. 383 y tope de 3.300 UVT); sin UVT del año lanza error
 * @param mes acumulado del mes y lo ya retenido en el mes (art. 383)
 * @returns retención en pesos, o null si faltan los datos tributarios del tercero
 */
export function retencionComision(
  monto: number,
  vendedor: VendedorRetencion | null | undefined,
  acumuladoAnual = 0,
  tarifaRegla: number | null = null,
  anio = 2026,
  mes: AcumuladoMes = { base: 0, retenido: 0 },
): number | null {
  if (!(monto > 0)) return 0;
  if (!tieneDatosTributarios(vendedor)) return null;
  const v = vendedor as VendedorRetencion;
  if (v.tipoPersona === 'simple') return 0;
  if (v.retencionTarifa != null) return redondear2((monto * v.retencionTarifa) / 100);
  if (v.tipoPersona === 'juridica') return redondear2((monto * 11) / 100);
  const uvt = uvtDelAnio(anio);
  if (v.aplicaArt383) {
    return Math.max(retencionArt383(mes.base + monto, uvt) - mes.retenido, 0);
  }
  const tope = TOPE_ANUAL_UVT * uvt;
  const tarifa = (v.valorContrato ?? 0) > tope || acumuladoAnual + monto > tope ? 11 : tarifaRegla ?? 10;
  return redondear2((monto * tarifa) / 100);
}
