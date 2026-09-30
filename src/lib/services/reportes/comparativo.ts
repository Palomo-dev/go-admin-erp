// ============================================================
// Comparativo y lectura rápida, comunes a todos los reportes.
//
// El comparativo no es una consulta aparte: es el mismo reporte corrido con
// otro periodo. Aquí solo se cruzan los KPI por posición y título (los dos
// resultados salen del mismo `fetch`, así que traen los mismos KPI).
// ============================================================

import type { LecturaReporte, ReportData, ReporteColumna, ReporteKPI } from './types';

export interface VariacionKpi {
  titulo: string;
  actual: number | null;
  anterior: number | null;
  /** actual − anterior; null si alguno no es numérico. */
  diferencia: number | null;
  /** Variación relativa en %; null si el anterior es 0 o no es numérico. */
  porcentaje: number | null;
}

function numero(valor: ReporteKPI['valor'] | undefined): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor))) return Number(valor);
  return null;
}

export function compararKpis(actual: ReportData, anterior: ReportData | null): VariacionKpi[] {
  return actual.kpis.map((kpi, i) => {
    const mismoIndice = anterior?.kpis[i];
    const previo = mismoIndice?.titulo === kpi.titulo ? mismoIndice : anterior?.kpis.find((k) => k.titulo === kpi.titulo) ?? null;
    const a = numero(kpi.valor);
    const b = previo ? numero(previo.valor) : null;
    const diferencia = a !== null && b !== null ? a - b : null;
    const porcentaje = diferencia !== null && b !== null && b !== 0 ? (diferencia / Math.abs(b)) * 100 : null;
    return { titulo: kpi.titulo, actual: a, anterior: b, diferencia, porcentaje };
  });
}

/** Umbral de variación (%) a partir del cual el cambio se menciona en la lectura. */
export const UMBRAL_VARIACION = 15;

/** Las (hasta 3) variaciones que merecen mención: |%| ≥ umbral, de mayor a menor. */
export function variacionesRelevantes(variaciones: VariacionKpi[]): Array<VariacionKpi & { porcentaje: number }> {
  return variaciones
    .filter((v): v is VariacionKpi & { porcentaje: number } => v.porcentaje !== null && Math.abs(v.porcentaje) >= UMBRAL_VARIACION)
    .sort((x, y) => Math.abs(y.porcentaje) - Math.abs(x.porcentaje))
    .slice(0, 3);
}

/** ¿El resultado no tiene movimientos (ni filas ni KPI numéricos distintos de cero)? */
export function sinMovimientos(actual: ReportData): boolean {
  return actual.filas.length === 0 && actual.kpis.every((k) => !numero(k.valor));
}

export interface TablaComparable {
  columnas: ReporteColumna[];
  filas: Record<string, unknown>[];
  totales?: Record<string, unknown>;
}

/** Sufijos de las columnas que agrega `tablaComparada`. */
export const SUFIJO_ANTERIOR = '__anterior';
export const SUFIJO_VARIACION = '__variacion';

/**
 * Tabla del visor con comparativo («Septiembre · Agosto · Variación», Figma
 * «Visor · Estado de resultados»): tras la primera columna de importe o
 * cantidad (y su porcentaje, si lo sigue) se agregan la del periodo de
 * referencia y la variación; las demás columnas quedan después.
 *
 * Las filas se cruzan por la primera columna de texto. Si esa clave se repite
 * (filas que no son un concepto único, como un listado de ventas) no hay
 * cruce posible y se devuelve `null`: el visor muestra la tabla sin columnas
 * de comparación en lugar de emparejar mal.
 */
export function tablaComparada(
  actual: TablaComparable,
  referencia: TablaComparable,
  titulos: { anterior: string; variacion: string },
): TablaComparable | null {
  const clave = actual.columnas.find((c) => c.tipo === 'texto');
  const cifra = actual.columnas.find((c) => c.tipo === 'moneda' || c.tipo === 'numero');
  if (!clave || !cifra) return null;

  const texto = (f: Record<string, unknown>) => String(f[clave.key] ?? '').trim();
  const claves = actual.filas.map(texto);
  if (new Set(claves).size !== claves.length) return null;

  const previas = new Map<string, Record<string, unknown>>();
  for (const f of referencia.filas) previas.set(texto(f), f);

  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const kAnt = `${cifra.key}${SUFIJO_ANTERIOR}`;
  const kVar = `${cifra.key}${SUFIJO_VARIACION}`;
  const extender = (f: Record<string, unknown>, previa: Record<string, unknown> | undefined) => {
    const a = num(f[cifra.key]);
    const b = previa ? num(previa[cifra.key]) : null;
    return { ...f, [kAnt]: b, [kVar]: a !== null && b !== null ? a - b : null };
  };

  const indice = actual.columnas.indexOf(cifra);
  const corte = actual.columnas[indice + 1]?.tipo === 'porcentaje' ? indice + 2 : indice + 1;
  const columnas = [
    ...actual.columnas.slice(0, corte),
    { key: kAnt, titulo: titulos.anterior, tipo: cifra.tipo, alinear: 'right' as const },
    { key: kVar, titulo: titulos.variacion, tipo: cifra.tipo, alinear: 'right' as const },
    ...actual.columnas.slice(corte),
  ];
  return {
    columnas,
    filas: actual.filas.map((f) => extender(f, previas.get(texto(f)))),
    totales: actual.totales ? extender(actual.totales, referencia.totales) : undefined,
  };
}

/**
 * Lectura rápida genérica: lo que dice el propio resultado. Los reportes
 * pueden traer la suya (`ReportData.lectura`), que va primero.
 * Los textos son en español y con cifras ya calculadas: el visor los muestra
 * tal cual y el documento de cierre los congela.
 */
export function lecturaDelReporte(
  actual: ReportData,
  variaciones: VariacionKpi[] | null,
  etiquetaComparado: string | null,
): LecturaReporte[] {
  const lectura: LecturaReporte[] = [...(actual.lectura ?? [])];

  if (sinMovimientos(actual)) {
    lectura.push({ tono: 'info', texto: 'No hay movimientos en este periodo.' });
    return lectura;
  }

  if (variaciones && etiquetaComparado) {
    for (const v of variacionesRelevantes(variaciones)) {
      const sube = v.porcentaje > 0;
      lectura.push({
        tono: 'info',
        texto: `${v.titulo} ${sube ? 'sube' : 'baja'} ${Math.abs(v.porcentaje).toFixed(1).replace('.', ',')} % frente a ${etiquetaComparado}.`,
      });
    }
  }

  return lectura;
}
