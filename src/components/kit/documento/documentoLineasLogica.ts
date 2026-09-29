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
  /**
   * Símbolo de la unidad de venta («kg», «m», «L») de un producto por peso o
   * medida: va junto a la cantidad («0,735 kg») y al precio («/ kg»).
   */
  unidad?: string | null;
  /**
   * Decimales de la cantidad de ESTA línea (los del producto: 3 en kg, 2 en
   * metros). Sin valor, la línea usa los del documento (`decimalesCant` o los
   * que traigan las demás líneas sin regla propia).
   */
  decimalesCantidad?: number | null;
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
  /**
   * Aviso de la línea (Figma `LineaDocumentoEdicion` Estado=aviso): «Solo hay
   * 3 en Sucursal Principal…», «La orden pedía 12 y llegaron 10». La fila se
   * tiñe de advertencia; no bloquea.
   */
  aviso?: string | null;
  /** Chips bajo el producto: «Stock 14», «Faltan 2», «Ítem manual», «Recibido 12/12». */
  insignias?: readonly InsigniaLinea[];
  /** Edición: la descripción se escribe en la línea (ítem manual). */
  descripcionEditable?: boolean;
  /** Edición: impuestos elegidos de la organización (`ImpuestosLinea`). */
  impuestosSeleccion?: { ids: readonly string[]; incluido: boolean } | null;
  /** Texto pequeño bajo el total («IVA incl. $ 102.185»), ya formateado. */
  detalleTotal?: string | null;
}

export interface InsigniaLinea {
  texto: string;
  tono?: 'neutro' | 'exito' | 'advertencia' | 'peligro' | 'informacion';
}

/** Campos que una línea puede cambiar desde la tabla. */
export type CambioLinea = Partial<Pick<LineaDocumento, 'cantidad' | 'precioUnitario' | 'descuento' | 'cantidadRecibida' | 'descripcion'>> & {
  /** Impuestos elegidos en `ImpuestosLinea` (ids de `organization_taxes`). */
  impuestos?: { ids: string[]; incluido: boolean };
};

/** Tono de la fila: el error manda sobre el aviso. */
export function tonoLinea(l: Pick<LineaDocumento, 'error' | 'aviso'>): 'peligro' | 'advertencia' | undefined {
  if (l.error) return 'peligro';
  if (l.aviso) return 'advertencia';
  return undefined;
}

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

/**
 * Decimales que traen los VALORES de unas líneas: enteros salvo que alguna
 * traiga fracción. Es el respaldo de las líneas sin regla propia (ítems
 * manuales, productos por unidad); las de peso o medida llevan la suya en
 * `decimalesCantidad` (ver `decimalesLinea`).
 */
export function decimalesCantidad(lineas: readonly Pick<LineaDocumento, 'cantidad'>[], maximo = 3): number {
  let d = 0;
  for (const l of lineas) {
    const texto = String(l.cantidad ?? 0);
    const i = texto.indexOf('.');
    if (i >= 0) d = Math.max(d, texto.length - i - 1);
  }
  return Math.min(d, maximo);
}

/** ¿La línea trae sus propios decimales (producto por peso o medida)? */
export function tieneReglaCantidad(l: Pick<LineaDocumento, 'decimalesCantidad'>): boolean {
  return typeof l.decimalesCantidad === 'number' && Number.isFinite(l.decimalesCantidad);
}

/**
 * Decimales por defecto del documento para las líneas SIN regla propia: los
 * que diga la pantalla o, si no, los que traigan esas líneas. Una línea de
 * 0,735 kg ya no obliga a mostrar «2,000» en las líneas por unidad.
 */
export function decimalesDocumento(lineas: readonly Pick<LineaDocumento, 'cantidad' | 'decimalesCantidad'>[], fijados?: number | null): number {
  if (typeof fijados === 'number' && Number.isFinite(fijados)) return Math.max(0, Math.min(3, Math.trunc(fijados)));
  return decimalesCantidad(lineas.filter((l) => !tieneReglaCantidad(l)));
}

/**
 * Decimales de una línea: los suyos (del producto) o los del documento. Nunca
 * menos de los que ya trae su valor: el campo no redondea en silencio una
 * cantidad guardada (un 1,5 de antes sigue siendo 1,5).
 */
export function decimalesLinea(l: Pick<LineaDocumento, 'cantidad' | 'decimalesCantidad'>, porDefecto: number): number {
  if (!tieneReglaCantidad(l)) return porDefecto;
  return Math.min(3, Math.max(0, Math.trunc(l.decimalesCantidad as number), decimalesCantidad([l])));
}

/**
 * Cantidad de la línea como texto en el idioma: con regla propia, decimales
 * fijos y la unidad («0,735 kg», «2,50 m»), igual que el tiquete; sin regla,
 * los decimales justos («3», «1,5»).
 */
export function textoCantidadLinea(
  l: Pick<LineaDocumento, 'decimalesCantidad' | 'unidad'> & { cantidad: number | null | undefined },
  locale: string,
  porDefecto: number,
  valor?: number | null,
): string {
  const texto = numeroCantidadLinea(l, locale, porDefecto, valor);
  return l.unidad ? `${texto} ${l.unidad}` : texto;
}

/** Solo el número de `textoCantidadLinea` (la tabla pinta la unidad aparte, en gris). */
export function numeroCantidadLinea(
  l: Pick<LineaDocumento, 'decimalesCantidad'> & { cantidad: number | null | undefined },
  locale: string,
  porDefecto: number,
  valor?: number | null,
): string {
  const n = Number(valor ?? l.cantidad ?? 0) || 0;
  if (tieneReglaCantidad(l)) {
    const d = decimalesLinea({ cantidad: n, decimalesCantidad: l.decimalesCantidad }, porDefecto);
    return new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: Math.max(porDefecto, 3) }).format(n);
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
