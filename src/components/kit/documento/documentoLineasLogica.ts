/**
 * Lógica de presentación de las líneas de un documento (factura de venta y de
 * compra, NC, cotización, recepción de OC). Sin React. **No calcula** el total
 * de la línea ni sus impuestos: llegan del servicio.
 */
import { contextoMoneda, type ContextoMoneda } from '@/lib/utils/moneda';

export type ModoLineas = 'lectura' | 'edicion' | 'recepcion';

export interface ImpuestoLinea {
  nombre: string;
  /** Porcentaje (19, 8). */
  tarifa?: number | null;
  /** Incluido en el precio o adicional. */
  incluido?: boolean;
}

export interface LineaDocumento {
  id: string;
  descripcion: string;
  sku?: string | null;
  variante?: string | null;
  nota?: string | null;
  seriales?: readonly string[];
  cantidad: number;
  unidad?: string | null;
  precioUnitario: number;
  /** Descuento de la línea en dinero, ya calculado. */
  descuento?: number | null;
  impuestos?: readonly ImpuestoLinea[];
  /** Total de la línea, ya calculado por el servicio. */
  total: number;
  /** Recepción: cuánto se recibió ya y cuánto falta (de la OC o la factura). */
  cantidadRecibida?: number | null;
  cantidadPendiente?: number | null;
  /** Error del servidor en esta línea («El precio cambió»). */
  error?: string | null;
}

/** Campos que una línea puede cambiar desde la tabla. */
export type CambioLinea = Partial<Pick<LineaDocumento, 'cantidad' | 'precioUnitario' | 'descuento' | 'cantidadRecibida'>>;

/**
 * Símbolo de la moneda para el prefijo de `CampoNumero` («$», «US$», «€»),
 * con el locale del contexto. Si `Intl` no conoce la moneda, el código.
 */
export function simboloMoneda(moneda: ContextoMoneda | string): string {
  const ctx = typeof moneda === 'string' ? contextoMoneda(moneda) : moneda;
  try {
    const partes = new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: ctx.code }).formatToParts(0);
    return partes.find((p) => p.type === 'currency')?.value ?? ctx.code;
  } catch {
    return ctx.code;
  }
}

/** Decimales para una cantidad: enteros salvo que alguna línea traiga fracción (kilos, metros). */
export function decimalesCantidad(lineas: readonly Pick<LineaDocumento, 'cantidad'>[], maximo = 3): number {
  let d = 0;
  for (const l of lineas) {
    const texto = String(l.cantidad ?? 0);
    const i = texto.indexOf('.');
    if (i >= 0) d = Math.max(d, texto.length - i - 1);
  }
  return Math.min(d, maximo);
}

/**
 * Impuestos de una línea como texto corto: «IVA 19 % · INC 8 %». `incluido`
 * se marca aparte (la pantalla pone «Incluido» o «Adicional» traducido).
 */
export function textoImpuestosLinea(
  impuestos: readonly ImpuestoLinea[] | null | undefined,
  formatearTarifa: (tarifa: number | null | undefined) => string | null,
): { texto: string; incluido: boolean | null } {
  const lista = (impuestos ?? []).filter((i) => (i.nombre ?? '').trim());
  if (lista.length === 0) return { texto: '', incluido: null };
  const texto = lista
    .map((i) => {
      const tarifa = formatearTarifa(i.tarifa);
      return tarifa ? `${i.nombre.trim()} ${tarifa}` : i.nombre.trim();
    })
    .join(' · ');
  const incluidos = lista.filter((i) => i.incluido).length;
  return { texto, incluido: incluidos === 0 ? false : incluidos === lista.length ? true : null };
}

/** Límites del campo «Recibida» en modo recepción: nunca negativo ni más de lo pendiente. */
export function limitesRecepcion(linea: Pick<LineaDocumento, 'cantidad' | 'cantidadPendiente'>): { minimo: number; maximo: number } {
  const pendiente = linea.cantidadPendiente;
  const maximo = typeof pendiente === 'number' && Number.isFinite(pendiente) ? Math.max(0, pendiente) : Math.max(0, linea.cantidad);
  return { minimo: 0, maximo };
}

/** Resumen de una recepción: cuántas líneas quedan completas, parciales y sin recibir. */
export function resumenRecepcion(
  lineas: readonly Pick<LineaDocumento, 'cantidad' | 'cantidadPendiente' | 'cantidadRecibida'>[],
): { completas: number; parciales: number; sinRecibir: number } {
  let completas = 0;
  let parciales = 0;
  let sinRecibir = 0;
  for (const l of lineas) {
    const { maximo } = limitesRecepcion(l);
    const r = Math.max(0, l.cantidadRecibida ?? 0);
    if (maximo === 0 || r >= maximo) completas += 1;
    else if (r > 0) parciales += 1;
    else sinRecibir += 1;
  }
  return { completas, parciales, sinRecibir };
}
