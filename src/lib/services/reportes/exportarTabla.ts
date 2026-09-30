/**
 * Excel y CSV de un reporte congelado (`congelarReporte`). Lo usan el botón
 * «Exportar» del visor (en el navegador) y los envíos programados (en el
 * servidor): el mismo archivo sale por las dos vías.
 *
 * - Excel: hoja «Resumen» con el encabezado y los KPI, y una hoja por tabla
 *   (vista principal y adicionales). Los números quedan como números para
 *   que se puedan sumar; los porcentajes, en escala 0–100 como en el reporte.
 * - CSV: solo la vista pedida (o la principal), con BOM UTF-8 para que Excel
 *   respete las tildes.
 * - Si una tabla se truncó, la última fila lo dice.
 */
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { FilaCongelada, ReporteCongelado, SnapshotCierre, TablaCongelada } from './cierres/snapshot';

export interface EncabezadoExportacion {
  /** «Periodo: 01/09/2026 – 30/09/2026», ya en el idioma y formato de quien exporta. */
  lineas: string[];
  textos: { resumen: string; indicador: string; valor: string; truncado: (mostradas: number, total: number) => string };
}

type Celda = string | number | boolean | null;

function filasDeTabla(t: TablaCongelada, truncado: EncabezadoExportacion['textos']['truncado']): Celda[][] {
  const cabecera = t.columnas.map((c) => c.titulo);
  const fila = (f: FilaCongelada): Celda[] => t.columnas.map((c) => f[c.key] ?? null);
  const filas: Celda[][] = [cabecera, ...t.filas.map(fila)];
  if (t.totales) filas.push(fila(t.totales));
  if (t.filasTotales > t.filas.length) filas.push([truncado(t.filas.length, t.filasTotales)]);
  return filas;
}

const NO_PERMITIDOS_HOJA = /[\\/?*[\]:]/g;

function nombreHoja(titulo: string, usados: Set<string>): string {
  const base = titulo.replace(NO_PERMITIDOS_HOJA, ' ').trim().slice(0, 28) || 'Hoja';
  let nombre = base;
  for (let i = 2; usados.has(nombre.toLowerCase()); i++) nombre = `${base.slice(0, 26)} ${i}`;
  usados.add(nombre.toLowerCase());
  return nombre;
}

export function tablasDelReporte(r: ReporteCongelado, soloVista: string | null = null): TablaCongelada[] {
  const todas = [r.principal, ...r.vistas];
  if (!soloVista) return todas;
  const vista = todas.find((t) => t.id === soloVista);
  return vista ? [vista] : [r.principal];
}

export function reporteAExcel(r: ReporteCongelado, enc: EncabezadoExportacion, soloVista: string | null = null): Uint8Array {
  const libro = XLSX.utils.book_new();
  const usados = new Set<string>();
  const resumen: Celda[][] = [[r.titulo], ...enc.lineas.map((l) => [l]), []];
  if (r.kpis.length > 0) {
    resumen.push([enc.textos.indicador, enc.textos.valor]);
    for (const k of r.kpis) resumen.push([k.titulo, k.valor]);
  }
  for (const l of r.lectura) resumen.push([l.texto]);
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(resumen), nombreHoja(enc.textos.resumen, usados));
  for (const t of tablasDelReporte(r, soloVista)) {
    const hoja = XLSX.utils.aoa_to_sheet(filasDeTabla(t, enc.textos.truncado));
    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja(t.titulo ?? r.titulo, usados));
  }
  return new Uint8Array(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

export interface TextosCierreExcel {
  portada: string;
  indicador: string;
  valor: string;
  capitulo: string;
  reportes: string;
  errores: string;
  sinMovimientos: string;
  sinFranja: string;
  truncado: (mostradas: number, total: number) => string;
}

/**
 * Un libro del cierre completo: portada (periodo, indicadores, índice y
 * reportes que no se pudieron calcular) y una hoja por reporte congelado,
 * con sus indicadores y cada tabla. Los números quedan como números.
 */
export function cierreAExcel(s: SnapshotCierre, textos: TextosCierreExcel, lineas: string[]): Uint8Array {
  const libro = XLSX.utils.book_new();
  const usados = new Set<string>();
  const portada: Celda[][] = [...lineas.map((l) => [l]), []];
  if (s.kpisPortada.length > 0) {
    portada.push([textos.indicador, textos.valor]);
    for (const k of s.kpisPortada) portada.push([k.titulo, typeof k.valor === 'number' ? k.valor : String(k.valor ?? '')]);
    portada.push([]);
  }
  portada.push([textos.capitulo, textos.reportes]);
  for (const c of s.capitulos) portada.push([c.titulo, c.reportes.length]);
  if (s.errores.length > 0) {
    portada.push([]);
    portada.push([textos.errores]);
    for (const e of s.errores) portada.push([e.titulo]);
  }
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(portada), nombreHoja(textos.portada, usados));

  for (const cap of s.capitulos) {
    for (const r of cap.reportes) {
      const hoja: Celda[][] = [[cap.titulo], [r.titulo]];
      if (r.sinFranja) hoja.push([textos.sinFranja]);
      if (r.kpis.length > 0) {
        hoja.push([]);
        hoja.push([textos.indicador, textos.valor]);
        for (const k of r.kpis) hoja.push([k.titulo, typeof k.valor === 'number' ? k.valor : String(k.valor ?? '')]);
      }
      for (const l of r.lectura) hoja.push([l.texto]);
      for (const t of [r.principal, ...r.vistas]) {
        hoja.push([]);
        hoja.push([t.titulo ?? r.titulo]);
        if (t.filas.length === 0 && !t.totales) hoja.push([textos.sinMovimientos]);
        else hoja.push(...filasDeTabla(t, textos.truncado));
      }
      XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hoja), nombreHoja(r.titulo, usados));
    }
  }
  return new Uint8Array(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

export function reporteACsv(r: ReporteCongelado, enc: Pick<EncabezadoExportacion, 'textos'>, soloVista: string | null = null): string {
  const [tabla] = tablasDelReporte(r, soloVista);
  return `\uFEFF${Papa.unparse(filasDeTabla(tabla, enc.textos.truncado))}`;
}
