/**
 * Un reporte congelado (`ReporteCongelado`) → secciones del motor de documentos.
 *
 * Lo usan el documento de un reporte suelto (`reporte`) y el cierre de
 * periodo (`cierre-periodo`), para que un reporte se vea igual en los dos.
 * Los rótulos del reporte viajan ya resueltos (`rotulo`, `tituloTexto`): son
 * contenido, no plantilla.
 *
 * Sin imports de servidor: lo prueban los tests del motor.
 */

import type { ReporteColumna, ReporteKPI } from '@/lib/services/reportes/types';
import type { ReporteCongelado, TablaCongelada, ValorCongelado } from '@/lib/services/reportes/cierres/snapshot';
import type { Campo, CeldaTabla, ColumnaTabla, NotaSeccion, SeccionTabla, TipoColumna, Tono } from './tipos';

const FECHA_PLANA = /^\d{4}-\d{2}-\d{2}$/;
const INSTANTE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * Tipo de columna del documento. Las columnas `fecha` de los reportes traen
 * a veces días planos y a veces instantes: se decide por los valores, y si no
 * son ni lo uno ni lo otro (ya vienen formateados) se pintan como texto.
 */
export function tipoColumnaDocumento(columna: ReporteColumna, filas: ReadonlyArray<Record<string, ValorCongelado>>): TipoColumna {
  switch (columna.tipo) {
    case 'moneda':
      return 'dinero';
    case 'numero':
      return 'numero';
    case 'porcentaje':
      return 'porcentaje';
    case 'fecha': {
      const valores = filas.map((f) => f[columna.key]).filter((v): v is string => typeof v === 'string' && v !== '');
      if (valores.length > 0 && valores.every((v) => FECHA_PLANA.test(v))) return 'fecha';
      if (valores.length > 0 && valores.every((v) => INSTANTE.test(v))) return 'instanteHora';
      return 'texto';
    }
    default:
      return 'texto';
  }
}

const ALINEAR: Record<NonNullable<ReporteColumna['alinear']>, ColumnaTabla['alinear']> = {
  left: 'izquierda',
  right: 'derecha',
  center: 'centro',
};

function celda(valor: ValorCongelado | undefined, tipo: TipoColumna): CeldaTabla {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'boolean') return valor ? '✓' : '—';
  if (tipo === 'texto' && typeof valor === 'number') return String(valor);
  return valor;
}

const TONO_LECTURA: Record<string, Tono> = { bien: 'exito', aviso: 'aviso', alerta: 'peligro', info: 'info' };

/** KPI del reporte → tarjeta del documento (rótulo congelado). */
export function campoDeKpi(k: ReporteKPI): Campo {
  if (typeof k.valor === 'number') {
    switch (k.formato) {
      case 'moneda':
        return { clave: 'kpi', rotulo: k.titulo, valor: { tipo: 'dinero', v: k.valor } };
      case 'porcentaje':
        return { clave: 'kpi', rotulo: k.titulo, valor: { tipo: 'porcentaje', v: k.valor } };
      default:
        return { clave: 'kpi', rotulo: k.titulo, valor: { tipo: 'numero', v: k.valor } };
    }
  }
  return { clave: 'kpi', rotulo: k.titulo, valor: { tipo: 'texto', v: k.valor } };
}

function seccionDeTabla(tabla: TablaCongelada, tituloTexto: string, maxFilas: number): SeccionTabla {
  const tipos = tabla.columnas.map((c) => tipoColumnaDocumento(c, tabla.filas));
  const columnas: ColumnaTabla[] = tabla.columnas.map((c, i) => ({
    clave: c.key,
    rotulo: c.titulo,
    tipo: tipos[i],
    ...(c.alinear ? { alinear: ALINEAR[c.alinear] } : {}),
  }));
  const filas = tabla.filas.slice(0, maxFilas).map((f) => tabla.columnas.map((c, i) => celda(f[c.key], tipos[i])));
  const pie = tabla.totales ? tabla.columnas.map((c, i) => celda(tabla.totales?.[c.key], tipos[i])) : undefined;
  const total = Math.max(tabla.filasTotales, tabla.filas.length);
  return {
    titulo: 'reporte',
    tituloTexto,
    columnas,
    filas,
    ...(pie ? { pie } : {}),
    vacio: 'reporteSinDatos',
    ...(total > filas.length ? { truncado: { mostradas: filas.length, total } } : {}),
  };
}

export interface OpcionesSecciones {
  /** Abre un capítulo con este título (primer reporte del capítulo en el cierre). */
  capitulo?: string;
  /** false en 80 mm: solo la vista principal. */
  incluirVistas: boolean;
  /** Tope de filas por tabla en el documento (menor en 80 mm). */
  maxFilas: number;
  /** Texto (ya traducido) de la nota «se calcula por día completo». */
  notaSinFranja: string;
  /** Solo esta vista (id); `principal` es la vista principal. */
  soloVista?: string | null;
}

export function seccionesDeReporte(r: ReporteCongelado, opciones: OpcionesSecciones): SeccionTabla[] {
  const tablas = [r.principal, ...(opciones.incluirVistas ? r.vistas : [])];
  const elegidas = opciones.soloVista
    ? [...r.vistas, r.principal].filter((v) => v.id === opciones.soloVista).slice(0, 1)
    : tablas;
  const lista = elegidas.length > 0 ? elegidas : [r.principal];

  const notas: NotaSeccion[] = r.lectura.map((l) => ({ tono: TONO_LECTURA[l.tono] ?? 'info', texto: l.texto }));
  if (r.sinFranja) notas.push({ tono: 'info', texto: opciones.notaSinFranja });

  return lista.map((tabla, i) => {
    const seccion = seccionDeTabla(tabla, i === 0 || !tabla.titulo ? r.titulo : `${r.titulo} · ${tabla.titulo}`, opciones.maxFilas);
    if (i === 0) {
      if (tabla.titulo) seccion.subtitulo = tabla.titulo;
      if (opciones.capitulo) seccion.capitulo = opciones.capitulo;
      if (r.kpis.length > 0) seccion.resumen = r.kpis.map(campoDeKpi);
      if (notas.length > 0) seccion.notas = notas;
    }
    return seccion;
  });
}
