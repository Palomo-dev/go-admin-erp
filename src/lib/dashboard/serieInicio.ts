/**
 * Series del inicio (Figma 445:137185): la gráfica «Ventas del periodo»
 * (periodo actual frente al anterior, dentro de la tarjeta) y las miniaturas
 * de «Tienda web» (`463:15529` «Miniatura (serie real)»).
 *
 * Regla pura, sin React. Las series las calcula la base
 * (`fn_inicio_ventas_rango` y `fn_inicio_tienda_web`, migración
 * `20260930230100_inicio_series_diarias`): una fila por hora (rangos de hasta
 * dos días: Hoy, Ayer) o por día, con la hora/día LOCAL de la regla única
 * (`fn_timezone_for`, sucursal → organización) y los huecos en 0. Aquí solo
 * se leen con tolerancia, se alinean por posición y se dibujan.
 *
 * `b` llega como `YYYY-MM-DD` (día) o `YYYY-MM-DDTHH` (hora) y ya es la fecha
 * local: nunca se convierte con la zona del navegador.
 */
import { formatDateInTz, plainDateToInstant } from '@/lib/utils/dateDisplay';
import { filasACsv } from '@/lib/utils/csv';

export type Granularidad = 'hora' | 'dia';

export interface PuntoSerie {
  /** Hora o día local: `YYYY-MM-DDTHH` o `YYYY-MM-DD`. */
  b: string;
  v: number;
}

export interface PuntoComparado {
  indice: number;
  /** Etiqueta del periodo actual (o del anterior si el actual es más corto). */
  b: string;
  actual: number | null;
  anterior: number | null;
}

const RE_BUCKET = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}))?$/;

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

export function leerGranularidad(v: unknown): Granularidad {
  return v === 'hora' ? 'hora' : 'dia';
}

/**
 * `[{b, <campo>}]` de la base → puntos válidos. Tolerante: una fila rara se
 * descarta, un número como texto se acepta, sin serie devuelve `[]` (una
 * versión anterior de la función no la traía: el inicio no pinta la gráfica).
 */
export function leerSerie(crudo: unknown, campo = 'v'): PuntoSerie[] {
  if (!Array.isArray(crudo)) return [];
  const salida: PuntoSerie[] = [];
  for (const x of crudo) {
    if (!x || typeof x !== 'object') continue;
    const b = (x as Record<string, unknown>).b;
    if (typeof b !== 'string' || !RE_BUCKET.test(b)) continue;
    salida.push({ b, v: numero((x as Record<string, unknown>)[campo]) });
  }
  return salida;
}

/**
 * Alinea las dos series por posición (hora 1 con hora 1, día 1 con día 1):
 * «Hoy» contra «ayer a esta misma hora», «30 días» contra los 30 anteriores.
 * Si una es más larga, a la otra le falta ese punto (`null`), no un cero.
 */
export function compararSeries(actual: readonly PuntoSerie[], anterior: readonly PuntoSerie[]): PuntoComparado[] {
  const n = Math.max(actual.length, anterior.length);
  const salida: PuntoComparado[] = [];
  for (let i = 0; i < n; i++) {
    salida.push({
      indice: i,
      b: actual[i]?.b ?? anterior[i]?.b ?? '',
      actual: actual[i] ? actual[i].v : null,
      anterior: anterior[i] ? anterior[i].v : null,
    });
  }
  return salida;
}

/** ¿Hay algo que dibujar? (una serie toda en cero no se dibuja). */
export function serieConDatos(serie: readonly { v: number }[]): boolean {
  return serie.some((p) => p.v !== 0);
}

/**
 * Etiqueta de un punto: «8 h» (hora) o «1 sep» (día, en el idioma de la
 * interfaz). El día es una fecha plana: se lleva al instante de medianoche
 * en `zona` y se formatea en la misma zona, así nunca se corre un día.
 */
export function etiquetaPunto(b: string, g: Granularidad, locale: string, zona: string): string {
  const m = RE_BUCKET.exec(b);
  if (!m) return '';
  if (g === 'hora') return m[2] ? `${Number(m[2])} h` : '';
  return formatDateInTz(plainDateToInstant(m[1], zona), zona, { locale, day: 'numeric', month: 'short' }).replace('.', '');
}

/** «1 sep — 22 sep» o «8 h — 17 h»: primer y último punto de la serie. */
export function rangoSerie(serie: readonly PuntoSerie[], g: Granularidad, locale: string, zona: string): string {
  if (serie.length === 0) return '';
  const a = etiquetaPunto(serie[0].b, g, locale, zona);
  const z = etiquetaPunto(serie[serie.length - 1].b, g, locale, zona);
  return a === z ? a : `${a} — ${z}`;
}

/**
 * Trazos SVG de una miniatura (línea y área bajo ella) en un lienzo de
 * `ancho` × `alto`, con `margen` arriba para que el pico no toque el borde.
 * Un solo punto se dibuja como línea plana. `null` si no hay puntos.
 */
export function trazoMiniatura(
  valores: readonly number[],
  ancho: number,
  alto: number,
  margen = 2,
): { linea: string; area: string } | null {
  if (valores.length === 0) return null;
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const rango = max - min || 1;
  const util = alto - margen;
  const x = (i: number) => (valores.length === 1 ? (i === 0 ? 0 : ancho) : (i * ancho) / (valores.length - 1));
  const y = (v: number) => margen + util - ((v - min) / rango) * util;
  const puntos = valores.length === 1 ? [valores[0], valores[0]] : [...valores];
  const coords = puntos.map((v, i) => `${redondo(x(i))},${redondo(y(v))}`);
  const linea = `M${coords.join(' L')}`;
  const area = `${linea} L${redondo(x(puntos.length - 1))},${alto} L0,${alto} Z`;
  return { linea, area };
}

const redondo = (n: number) => Math.round(n * 100) / 100;

/** Conversión por punto (pagados / visitantes · 100); sin visitas, 0. */
export function conversionPorPunto(visitantes: readonly number[], pagados: readonly number[]): number[] {
  return visitantes.map((v, i) => (v > 0 ? ((pagados[i] ?? 0) / v) * 100 : 0));
}

/**
 * «Exportar CSV» del detalle de «Ventas del periodo» (Figma 448:196680): una
 * fila por hora/día con el periodo actual y el anterior (utilidad única de
 * CSV del repo: `;`, BOM y sin fórmulas).
 */
export function csvVentasPeriodo(
  puntos: readonly PuntoComparado[],
  cabecera: { punto: string; actual: string; anterior: string },
): string {
  return filasACsv(
    [cabecera.punto, cabecera.actual, cabecera.anterior],
    puntos.map((p) => [p.b, p.actual, p.anterior]),
  );
}
