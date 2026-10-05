/**
 * GO Asistente — tarjeta de reporte dentro de una respuesta (Figma Reportes
 * 22-03 / 22-05: gráfico pequeño, tabla corta y «Exportar · Programar envío ·
 * Ir al reporte»).
 *
 * El servidor la arma con el resultado REAL de `consultar_reporte` (nunca con
 * cifras que escriba el modelo) y la manda como evento `reporte` del stream; el
 * panel la valida aquí antes de pintarla. Va acotada a propósito: unas pocas
 * filas y columnas para leer de un vistazo; el detalle completo está a un clic,
 * en el visor.
 *
 * Módulo hoja: sin React ni Supabase, para el servidor, el panel y las pruebas.
 */

import type { ReporteColumna, TipoColumna } from '@/lib/services/reportes/types';

export const MAX_FILAS_TARJETA = 6;
export const MAX_COLUMNAS_TARJETA = 3;
export const MAX_PUNTOS_SERIE = 62;

const TIPOS: readonly TipoColumna[] = ['texto', 'numero', 'moneda', 'porcentaje', 'fecha'];
const RE_ID = /^[\w-]{1,80}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ColumnaTarjeta {
  key: string;
  titulo: string;
  tipo: TipoColumna;
}

export type CeldaTarjeta = string | number | boolean | null;

export interface TarjetaReporte {
  reporteId: string;
  /** Tarjeta del centro de reportes, para armar la ruta del visor. */
  grupo: string;
  titulo: string;
  periodo: {
    tipo: string;
    fechaInicio: string;
    fechaFin: string;
    horaInicio: string | null;
    horaFin: string | null;
    etiqueta: string;
  };
  /** `null` = consolidado (ya validado en el servidor). */
  sucursalId: number | null;
  vista: string | null;
  columnas: ColumnaTarjeta[];
  /** Las filas más relevantes (ordenadas por la cifra principal, de mayor a menor). */
  filas: Array<Record<string, CeldaTarjeta>>;
  /** Serie del gráfico pequeño en el orden del reporte; vacía si no es temporal. */
  serie: number[];
  /** Título de la columna de la serie, para el texto accesible del gráfico. */
  serieTitulo: string | null;
  /** Filas que tiene el reporte completo. */
  totalFilas: number;
}

export interface MetaTarjeta {
  reporteId: string;
  grupo: string;
  titulo: string;
  periodo: TarjetaReporte['periodo'];
  sucursalId: number | null;
  vista: string | null;
}

const esCifra = (c: Pick<ReporteColumna, 'tipo'>) => c.tipo === 'numero' || c.tipo === 'moneda';

function aNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function aCelda(v: unknown): CeldaTarjeta {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  return String(v).slice(0, 120);
}

/**
 * Arma la tarjeta con el resultado de un reporte (o de una de sus vistas).
 *
 * - Columnas: la primera (la dimensión: fecha, sucursal, vendedor…) y hasta
 *   dos cifras (número o moneda) en su orden.
 * - Filas: ordenadas por la primera columna de moneda (o la primera cifra) de
 *   mayor a menor, las `MAX_FILAS_TARJETA` primeras.
 * - Serie: solo si la dimensión es una fecha y hay al menos tres puntos; un
 *   gráfico de líneas sobre categorías sueltas (sucursales) mentiría una
 *   tendencia que no existe.
 */
export function armarTarjetaReporte(
  datos: { columnas: ReporteColumna[]; filas: Record<string, unknown>[] },
  meta: MetaTarjeta
): TarjetaReporte {
  const etiqueta = datos.columnas.find((c) => !esCifra(c) && c.tipo !== 'porcentaje') ?? datos.columnas[0];
  const cifras = datos.columnas.filter((c) => esCifra(c) && c !== etiqueta).slice(0, MAX_COLUMNAS_TARJETA - 1);
  const columnas = [etiqueta, ...cifras].filter((c): c is ReporteColumna => Boolean(c));
  const clave = cifras.find((c) => c.tipo === 'moneda') ?? cifras[0] ?? null;

  const ordenadas = clave
    ? [...datos.filas].sort((a, b) => (aNumero(b[clave.key]) ?? -Infinity) - (aNumero(a[clave.key]) ?? -Infinity))
    : datos.filas;
  const filas = ordenadas.slice(0, MAX_FILAS_TARJETA).map((f) => {
    const fila: Record<string, CeldaTarjeta> = {};
    for (const c of columnas) fila[c.key] = aCelda(f[c.key]);
    return fila;
  });

  const temporal = etiqueta?.tipo === 'fecha';
  const serie =
    temporal && clave
      ? datos.filas
          .map((f) => aNumero(f[clave.key]))
          .filter((n): n is number => n !== null)
          .slice(0, MAX_PUNTOS_SERIE)
      : [];

  return {
    ...meta,
    columnas: columnas.map((c) => ({ key: c.key, titulo: c.titulo, tipo: c.tipo })),
    filas,
    serie: serie.length >= 3 ? serie : [],
    serieTitulo: serie.length >= 3 && clave ? clave.titulo : null,
    totalFilas: datos.filas.length,
  };
}

function texto(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/**
 * Valida la tarjeta que llega por el stream. No se confía en su forma aunque
 * la mande nuestro servidor: un proxy, una versión vieja o un error no deben
 * romper el panel. `null` si no sirve.
 */
export function parsearTarjetaReporte(valor: unknown): TarjetaReporte | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  if (typeof v.reporteId !== 'string' || !RE_ID.test(v.reporteId)) return null;
  if (typeof v.grupo !== 'string' || !RE_ID.test(v.grupo)) return null;
  const titulo = texto(v.titulo, 120);
  if (!titulo) return null;

  const p = v.periodo as Record<string, unknown> | null;
  if (!p || typeof p !== 'object') return null;
  if (typeof p.fechaInicio !== 'string' || !RE_FECHA.test(p.fechaInicio)) return null;
  if (typeof p.fechaFin !== 'string' || !RE_FECHA.test(p.fechaFin)) return null;
  const conFranja = typeof p.horaInicio === 'string' && RE_HORA.test(p.horaInicio) && typeof p.horaFin === 'string' && RE_HORA.test(p.horaFin);

  const sucursalId = v.sucursalId === null ? null : typeof v.sucursalId === 'number' && Number.isSafeInteger(v.sucursalId) && v.sucursalId > 0 ? v.sucursalId : undefined;
  if (sucursalId === undefined) return null;

  const columnas = Array.isArray(v.columnas)
    ? (v.columnas as unknown[])
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
        .filter((c) => typeof c.key === 'string' && typeof c.titulo === 'string' && TIPOS.includes(c.tipo as TipoColumna))
        .slice(0, MAX_COLUMNAS_TARJETA)
        .map((c) => ({ key: String(c.key).slice(0, 60), titulo: String(c.titulo).slice(0, 60), tipo: c.tipo as TipoColumna }))
    : [];
  if (columnas.length === 0) return null;

  const filas = Array.isArray(v.filas)
    ? (v.filas as unknown[])
        .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object' && !Array.isArray(f))
        .slice(0, MAX_FILAS_TARJETA)
        .map((f) => {
          const fila: Record<string, CeldaTarjeta> = {};
          for (const c of columnas) fila[c.key] = aCelda(f[c.key]);
          return fila;
        })
    : [];

  const serie = Array.isArray(v.serie)
    ? (v.serie as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(0, MAX_PUNTOS_SERIE)
    : [];

  return {
    reporteId: v.reporteId,
    grupo: v.grupo,
    titulo,
    periodo: {
      tipo: typeof p.tipo === 'string' && /^[a-z]{3,20}$/.test(p.tipo) ? p.tipo : 'personalizado',
      fechaInicio: p.fechaInicio,
      fechaFin: p.fechaFin,
      horaInicio: conFranja ? (p.horaInicio as string) : null,
      horaFin: conFranja ? (p.horaFin as string) : null,
      etiqueta: texto(p.etiqueta, 80) ?? `${p.fechaInicio} – ${p.fechaFin}`,
    },
    sucursalId,
    vista: typeof v.vista === 'string' && RE_ID.test(v.vista) ? v.vista : null,
    columnas,
    filas,
    serie: serie.length >= 3 ? serie : [],
    serieTitulo: serie.length >= 3 ? texto(v.serieTitulo, 60) : null,
    totalFilas: typeof v.totalFilas === 'number' && Number.isSafeInteger(v.totalFilas) && v.totalFilas >= 0 ? v.totalFilas : filas.length,
  };
}

/**
 * Puntos del gráfico pequeño en un lienzo `ancho × alto` (SVG). Una serie
 * plana queda a media altura en vez de pegada al borde.
 */
export function puntosSparkline(serie: readonly number[], ancho: number, alto: number, margen = 2): string {
  if (serie.length < 2) return '';
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const rango = max - min;
  const paso = (ancho - margen * 2) / (serie.length - 1);
  return serie
    .map((n, i) => {
      const x = margen + i * paso;
      const y = rango === 0 ? alto / 2 : margen + (1 - (n - min) / rango) * (alto - margen * 2);
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}
