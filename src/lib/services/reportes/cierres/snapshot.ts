/**
 * Snapshot de un cierre de periodo (`report_closings.snapshot`).
 *
 * El cierre se congela al emitirse: el documento se pinta SIEMPRE desde aquí,
 * así que descargarlo otra vez da las mismas cifras con el mismo número.
 * Recalcular crea una versión nueva; este objeto nunca se edita.
 *
 * - Los rótulos (títulos, columnas, KPIs, lectura) quedan en el idioma en que
 *   se emitió: son el contenido del cierre, no la plantilla del documento.
 * - Cada tabla guarda hasta `MAX_FILAS_CONGELADAS` filas y cuántas tenía
 *   (`filasTotales`); los totales son siempre los del reporte completo.
 * - Solo valores planos (texto, número, booleano, null): nada de objetos que
 *   la base o el renderizador tengan que interpretar.
 *
 * Sin imports de servidor ni del catálogo: lo usan la ruta, el cargador del
 * documento y los tests.
 */

import type { ContextoMoneda } from '@/lib/utils/moneda';
import type { GrupoMeta } from '../reportesCatalogo';
import type {
  GrupoReporte,
  LecturaReporte,
  PeriodoCierre,
  ReportData,
  ReportDefinition,
  ReporteColumna,
  ReporteKPI,
} from '../types';

export const FORMATO_SNAPSHOT = 1;
export const MAX_FILAS_CONGELADAS = 300;
/** Tarjetas de la portada: el primer KPI del primer reporte de cada capítulo. */
export const MAX_KPIS_PORTADA = 8;

export const PLANTILLAS_CIERRE = ['completo', 'contable', 'ventas-caja', 'personalizada'] as const;
export type PlantillaCierre = (typeof PLANTILLAS_CIERRE)[number];

export function esPlantillaCierre(valor: unknown): valor is PlantillaCierre {
  return typeof valor === 'string' && (PLANTILLAS_CIERRE as readonly string[]).includes(valor);
}

const GRUPOS_CONTABLE: ReadonlySet<GrupoReporte> = new Set<GrupoReporte>(['contabilidad', 'finanzas', 'compras']);
const GRUPOS_VENTAS_CAJA: ReadonlySet<GrupoReporte> = new Set<GrupoReporte>(['ventas']);
const EXTRA_VENTAS_CAJA: ReadonlySet<string> = new Set(['caja-bancos-diario', 'impuestos']);

/**
 * Reportes que entran al cierre según la plantilla, en el orden de
 * `disponibles` (que ya viene filtrado por plan y alcance de sucursal).
 * `personalizada` toma la selección, pero nunca algo fuera de `disponibles`.
 */
export function reportesDePlantilla(
  plantilla: PlantillaCierre,
  disponibles: readonly ReportDefinition[],
  seleccion: readonly string[] = [],
): ReportDefinition[] {
  switch (plantilla) {
    case 'completo':
      return [...disponibles];
    case 'contable':
      return disponibles.filter((d) => GRUPOS_CONTABLE.has(d.grupo));
    case 'ventas-caja':
      return disponibles.filter((d) => GRUPOS_VENTAS_CAJA.has(d.grupo) || EXTRA_VENTAS_CAJA.has(d.id));
    case 'personalizada': {
      const elegidos = new Set(seleccion);
      return disponibles.filter((d) => elegidos.has(d.id));
    }
  }
}

export type ValorCongelado = string | number | boolean | null;
export type FilaCongelada = Record<string, ValorCongelado>;

export interface TablaCongelada {
  id: string;
  titulo: string | null;
  columnas: ReporteColumna[];
  filas: FilaCongelada[];
  totales: FilaCongelada | null;
  /** Filas que tenía el reporte (puede ser mayor que `filas.length`). */
  filasTotales: number;
}

export interface ReporteCongelado {
  id: string;
  titulo: string;
  modulo: string;
  grupo: GrupoReporte;
  kpis: ReporteKPI[];
  principal: TablaCongelada;
  vistas: TablaCongelada[];
  lectura: Array<Pick<LecturaReporte, 'tono' | 'texto'>>;
  /** El cierre tiene franja horaria y este reporte se calcula por día completo. */
  sinFranja: boolean;
}

export interface CapituloCierre {
  grupo: GrupoReporte;
  titulo: string;
  reportes: ReporteCongelado[];
}

export interface ReporteFallido {
  reportId: string;
  titulo: string;
}

export interface SnapshotCierre {
  formato: typeof FORMATO_SNAPSHOT;
  periodo: PeriodoCierre;
  plantilla: PlantillaCierre;
  sucursal: { id: number; nombre: string } | null;
  moneda: ContextoMoneda | null;
  kpisPortada: ReporteKPI[];
  capitulos: CapituloCierre[];
  /** Reportes que fallaron al calcularse: el cierre sale sin ellos y lo dice. */
  errores: ReporteFallido[];
  generadoEn: string;
}

function valorPlano(valor: unknown): ValorCongelado {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string' || typeof valor === 'boolean') return valor;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
  return String(valor);
}

function filaPlana(fila: Record<string, unknown> | null | undefined, columnas: ReporteColumna[]): FilaCongelada {
  const resultado: FilaCongelada = {};
  for (const c of columnas) resultado[c.key] = valorPlano(fila?.[c.key]);
  return resultado;
}

function congelarTabla(
  id: string,
  titulo: string | null,
  columnas: ReporteColumna[],
  filas: Record<string, unknown>[],
  totales: Record<string, unknown> | undefined,
  maxFilas: number,
): TablaCongelada {
  const cols = columnas.map((c) => ({ key: c.key, titulo: c.titulo, tipo: c.tipo, ...(c.alinear ? { alinear: c.alinear } : {}) }));
  return {
    id,
    titulo,
    columnas: cols,
    filas: filas.slice(0, maxFilas).map((f) => filaPlana(f, cols)),
    totales: totales ? filaPlana(totales, cols) : null,
    filasTotales: filas.length,
  };
}

function kpiPlano(k: ReporteKPI): ReporteKPI {
  const valor = typeof k.valor === 'number' ? (Number.isFinite(k.valor) ? k.valor : 0) : String(k.valor ?? '');
  return { titulo: String(k.titulo), valor, ...(k.formato ? { formato: k.formato } : {}) };
}

export function congelarReporte(
  data: ReportData,
  def: Pick<ReportDefinition, 'grupo' | 'filtros'>,
  periodo: PeriodoCierre,
  maxFilas: number = MAX_FILAS_CONGELADAS,
): ReporteCongelado {
  const conFranja = !!(periodo.horaInicio && periodo.horaFin);
  return {
    id: data.id,
    titulo: data.titulo,
    modulo: data.modulo,
    grupo: def.grupo,
    kpis: (data.kpis ?? []).map(kpiPlano),
    principal: congelarTabla('principal', data.vistaPrincipal ?? null, data.columnas ?? [], data.filas ?? [], data.totales, maxFilas),
    vistas: (data.vistas ?? []).map((v) => congelarTabla(v.id, v.titulo, v.columnas, v.filas ?? [], v.totales, maxFilas)),
    lectura: (data.lectura ?? []).map((l) => ({ tono: l.tono, texto: String(l.texto) })),
    sinFranja: conFranja && !def.filtros.includes('franja'),
  };
}

export interface EntradaSnapshot {
  periodo: PeriodoCierre;
  plantilla: PlantillaCierre;
  sucursal: { id: number; nombre: string } | null;
  moneda: ContextoMoneda | null;
  /** Reportes pedidos, en el orden en que se muestran. */
  definiciones: readonly ReportDefinition[];
  /** Grupos del catálogo, en su orden: dan el orden y el nombre de los capítulos. */
  grupos: readonly Pick<GrupoMeta, 'id' | 'nombre'>[];
  resultados: readonly ReportData[];
  errores: ReadonlyArray<{ reportId: string; titulo: string }>;
  generadoEn: string;
  maxFilas?: number;
}

export function armarSnapshot(entrada: EntradaSnapshot): SnapshotCierre {
  const porId = new Map(entrada.resultados.map((r) => [r.id, r]));
  const capitulos: CapituloCierre[] = [];
  for (const grupo of entrada.grupos) {
    const reportes = entrada.definiciones
      .filter((d) => d.grupo === grupo.id)
      .map((d) => {
        const data = porId.get(d.id);
        return data ? congelarReporte(data, d, entrada.periodo, entrada.maxFilas) : null;
      })
      .filter((r): r is ReporteCongelado => r !== null);
    if (reportes.length > 0) capitulos.push({ grupo: grupo.id, titulo: grupo.nombre, reportes });
  }
  const kpisPortada = capitulos
    .map((c) => c.reportes.find((r) => r.kpis.length > 0)?.kpis[0])
    .filter((k): k is ReporteKPI => !!k)
    .slice(0, MAX_KPIS_PORTADA);
  return {
    formato: FORMATO_SNAPSHOT,
    periodo: entrada.periodo,
    plantilla: entrada.plantilla,
    sucursal: entrada.sucursal,
    moneda: entrada.moneda,
    kpisPortada,
    capitulos,
    errores: entrada.errores.map((e) => ({ reportId: e.reportId, titulo: e.titulo })),
    generadoEn: entrada.generadoEn,
  };
}

/** Ids de los reportes que quedaron en el snapshot (columna `report_closings.reportes`). */
export function idsDelSnapshot(s: SnapshotCierre): string[] {
  return s.capitulos.flatMap((c) => c.reportes.map((r) => r.id));
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Valida la forma mínima de un snapshot leído de la base. `null` si no es de
 * este formato (un cierre de la v1 no tiene snapshot con capítulos).
 */
export function leerSnapshot(valor: unknown): SnapshotCierre | null {
  if (!esObjeto(valor) || valor.formato !== FORMATO_SNAPSHOT) return null;
  if (!esObjeto(valor.periodo) || !Array.isArray(valor.capitulos) || !esPlantillaCierre(valor.plantilla)) return null;
  const capitulosValidos = valor.capitulos.every(
    (c) => esObjeto(c) && typeof c.titulo === 'string' && Array.isArray(c.reportes)
      && c.reportes.every((r) => esObjeto(r) && typeof r.titulo === 'string' && esObjeto(r.principal) && Array.isArray((r.principal as Record<string, unknown>).filas)),
  );
  if (!capitulosValidos) return null;
  return {
    ...(valor as unknown as SnapshotCierre),
    kpisPortada: Array.isArray(valor.kpisPortada) ? (valor.kpisPortada as ReporteKPI[]) : [],
    errores: Array.isArray(valor.errores) ? (valor.errores as ReporteFallido[]) : [],
    sucursal: esObjeto(valor.sucursal) ? (valor.sucursal as SnapshotCierre['sucursal']) : null,
    moneda: esObjeto(valor.moneda) ? (valor.moneda as unknown as ContextoMoneda) : null,
  };
}
