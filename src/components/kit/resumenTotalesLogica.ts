/**
 * Filas del resumen de totales (carrito, cobro, factura de venta y de compra,
 * cierre de caja), sin React. **No calcula el negocio**: subtotal, impuestos,
 * total, retenciones y neto llegan ya calculados por el servicio o la RPC.
 * Aquí solo se decide qué filas se ven, en qué orden, con qué signo y tono,
 * y se agrupan los impuestos por nombre y tarifa (IVA 19 % de tres líneas =
 * una fila).
 */
import type { TonoFilaDato } from './tonosKit';

export interface ImpuestoResumen {
  /** Nombre del impuesto de la organización («IVA», «INC», «ReteFuente»). */
  nombre: string;
  /** Tarifa en porcentaje (19, 8, 2.5). */
  tarifa?: number | null;
  base?: number | null;
  importe: number;
}

export interface AjusteResumen {
  id?: string;
  /** Ya traducida («Descuento general», «Flete», «Cargo de servicio 10 %»). */
  etiqueta: string;
  /** Siempre positivo: el signo lo pone el tipo de fila. */
  importe: number;
  descripcion?: string;
}

export interface EntradaResumen {
  subtotal: number;
  impuestos?: readonly ImpuestoResumen[];
  descuentos?: readonly AjusteResumen[];
  /** Flete, cargo de servicio: suman. */
  cargos?: readonly AjusteResumen[];
  /** Retenciones (compras y ventas a grandes contribuyentes): restan después del total. */
  retenciones?: readonly ImpuestoResumen[];
  total: number;
  /** Neto a pagar o a cobrar (total − retenciones), calculado por el servicio. */
  neto?: number | null;
  /** Precios con impuesto incluido: las filas de impuesto son informativas. */
  impuestosIncluidos?: boolean;
  /** Muestra la base de cada impuesto bajo su fila (facturas). */
  mostrarBases?: boolean;
}

export type TipoFilaResumen = 'subtotal' | 'descuento' | 'cargo' | 'impuesto' | 'total' | 'retencion' | 'neto';

export interface FilaResumen {
  id: string;
  tipo: TipoFilaResumen;
  /** Texto fijo del kit (`kit.resumen.<clave>`) o texto del dato. */
  etiqueta: { clave: 'subtotal' | 'total' | 'neto' } | { texto: string };
  importe: number;
  /** −1 resta (descuento, retención), 1 suma, 0 informativo (impuesto incluido). */
  signo: -1 | 0 | 1;
  /** Solo para impuestos: tarifa en porcentaje, para pintar «IVA 19 %». */
  tarifa?: number | null;
  /** Base del impuesto, si se pidió `mostrarBases`. */
  base?: number | null;
  descripcion?: string;
  sangria: 0 | 1;
  tono: TonoFilaDato;
  /** Divisor encima (antes del total). */
  separadorAntes?: boolean;
}

function numero(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * Agrupa por nombre (sin distinguir mayúsculas) y tarifa, sumando base e
 * importe. Orden: tarifa de mayor a menor y luego nombre. Las filas en cero
 * se conservan solo si su tarifa es 0 («Exento 0 %» dice algo).
 */
export function agruparImpuestos(lista: readonly ImpuestoResumen[] | null | undefined): ImpuestoResumen[] {
  const grupos = new Map<string, ImpuestoResumen>();
  for (const imp of lista ?? []) {
    const nombre = (imp.nombre ?? '').trim();
    if (!nombre) continue;
    const tarifa = typeof imp.tarifa === 'number' && Number.isFinite(imp.tarifa) ? imp.tarifa : null;
    const clave = `${nombre.toLowerCase()}|${tarifa ?? ''}`;
    const previo = grupos.get(clave);
    if (previo) {
      previo.importe += numero(imp.importe);
      if (imp.base !== undefined && imp.base !== null) previo.base = numero(previo.base) + numero(imp.base);
    } else {
      grupos.set(clave, {
        nombre,
        tarifa,
        base: imp.base === undefined || imp.base === null ? imp.base : numero(imp.base),
        importe: numero(imp.importe),
      });
    }
  }
  return Array.from(grupos.values())
    .filter((g) => g.importe !== 0 || g.tarifa === 0)
    .sort((a, b) => numero(b.tarifa) - numero(a.tarifa) || a.nombre.localeCompare(b.nombre));
}

/** Filas en el orden del manual: subtotal · descuentos · cargos · impuestos · total · retenciones · neto. */
export function filasResumen(e: EntradaResumen): FilaResumen[] {
  const filas: FilaResumen[] = [
    { id: 'subtotal', tipo: 'subtotal', etiqueta: { clave: 'subtotal' }, importe: numero(e.subtotal), signo: 1, sangria: 0, tono: 'neutro' },
  ];
  (e.descuentos ?? []).forEach((d, i) => {
    if (!numero(d.importe)) return;
    filas.push({
      id: `descuento-${d.id ?? i}`,
      tipo: 'descuento',
      etiqueta: { texto: d.etiqueta },
      importe: Math.abs(numero(d.importe)),
      signo: -1,
      descripcion: d.descripcion,
      sangria: 0,
      tono: 'exito',
    });
  });
  (e.cargos ?? []).forEach((c, i) => {
    if (!numero(c.importe)) return;
    filas.push({
      id: `cargo-${c.id ?? i}`,
      tipo: 'cargo',
      etiqueta: { texto: c.etiqueta },
      importe: Math.abs(numero(c.importe)),
      signo: 1,
      descripcion: c.descripcion,
      sangria: 0,
      tono: 'neutro',
    });
  });
  for (const imp of agruparImpuestos(e.impuestos)) {
    filas.push({
      id: `impuesto-${imp.nombre}-${imp.tarifa ?? ''}`,
      tipo: 'impuesto',
      etiqueta: { texto: imp.nombre },
      tarifa: imp.tarifa,
      base: e.mostrarBases ? imp.base ?? null : undefined,
      importe: imp.importe,
      signo: e.impuestosIncluidos ? 0 : 1,
      sangria: 0,
      tono: 'neutro',
    });
  }
  filas.push({ id: 'total', tipo: 'total', etiqueta: { clave: 'total' }, importe: numero(e.total), signo: 1, sangria: 0, tono: 'fuerte', separadorAntes: true });
  const retenciones = agruparImpuestos(e.retenciones);
  for (const r of retenciones) {
    filas.push({
      id: `retencion-${r.nombre}-${r.tarifa ?? ''}`,
      tipo: 'retencion',
      etiqueta: { texto: r.nombre },
      tarifa: r.tarifa,
      base: e.mostrarBases ? r.base ?? null : undefined,
      importe: Math.abs(r.importe),
      signo: -1,
      sangria: 1,
      tono: 'neutro',
    });
  }
  if (typeof e.neto === 'number' && Number.isFinite(e.neto) && (retenciones.length > 0 || e.neto !== numero(e.total))) {
    filas.push({ id: 'neto', tipo: 'neto', etiqueta: { clave: 'neto' }, importe: e.neto, signo: 1, sangria: 0, tono: 'fuerte', separadorAntes: true });
  }
  return filas;
}

/** «19 %», «2,5 %», «19%» según el idioma. `null` si no hay tarifa. */
export function formatearTarifa(tarifa: number | null | undefined, locale: string): string | null {
  if (typeof tarifa !== 'number' || !Number.isFinite(tarifa)) return null;
  try {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(tarifa / 100);
  } catch {
    return `${tarifa}%`;
  }
}

/** Importe con el signo de su fila: «−$ 5.000» (menos tipográfico, no guion). */
export function importeConSigno(formatear: (n: number) => string, importe: number, signo: -1 | 0 | 1): string {
  const texto = formatear(Math.abs(importe));
  if (signo === -1 && importe !== 0) return `−${texto}`;
  if (signo !== -1 && importe < 0) return `−${texto}`;
  return texto;
}
