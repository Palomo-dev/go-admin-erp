/**
 * Piezas comunes de los widgets de «Módulos» del inicio para Ventas, Logística
 * y Transporte (Figma `03` › Inicio, sección 2915:45356; aprobado por el dueño
 * el 2026-11-23). Mismo kit aprobado: `ModuloResumenFila` · `ModuloPanel` ·
 * `KpiModulo` · `AtencionItem` · `BarraDesglose` · `ModuloEstado`.
 *
 * Regla pura, sin red. Las claves de texto (`clave`) son del namespace
 * `inicioWidgets`; las cifras se formatean en el cliente (`CifraModulo`).
 */
import type { CifraModulo, TextoModulo, TonoModulo } from './resumenModulos';
import type { SegmentoFila } from './finanzasInicio';

export type { SegmentoFila };

/** Estado del panel: sin ningún movimiento nunca, al día o con cosas por atender. */
export type EstadoWidget = 'sinDatos' | 'alDia' | 'atencion';

/** Badge, tono y línea de la fila plegada (`ModuloResumenFila`). */
export interface FilaWidget {
  tono: TonoModulo;
  badge: TextoModulo | null;
  resumen: SegmentoFila[];
}

/** Tarjeta de cifra del panel (`KpiModulo`). La cifra entera navega a la lista filtrada. */
export interface KpiWidget {
  id: string;
  etiqueta: TextoModulo;
  cifra: CifraModulo | null;
  /** Texto de la cifra cuando no hay número que mostrar («—»). */
  sinCifra?: boolean;
  detalle?: TextoModulo;
  /** Variación frente a la base de comparación (null = sin base: no se pinta). */
  delta?: number | null;
  /**
   * Unidad de la variación: porcentaje («+8 %», por defecto), puntos porcentuales («+5 pp») o
   * cantidad absoluta («+2»).
   */
  unidadDelta?: 'porcentaje' | 'puntos' | 'absoluto';
  /**
   * Qué dirección es buena (colorea el badge de la variación). Por defecto `sube`; en
   * «Atrasados» subir es malo (`baja`).
   */
  deltaMejor?: 'sube' | 'baja';
  /** Contra qué se compara («vs. cierre de ayer»), junto al badge de la variación. */
  comparadoCon?: TextoModulo;
  /**
   * Mini-gráfica bajo la cifra (`MiniaturaSerie`), en orden cronológico y con el último punto =
   * la cifra de ahora. Con menos de dos puntos no se pinta.
   */
  serie?: number[];
  tono?: TonoModulo;
  href?: string | null;
}

/** Icono del renglón de «Requiere atención» (se traduce a lucide en el cliente). */
export type IconoAtencion = 'reloj' | 'alerta' | 'ubicacion' | 'billetera' | 'dinero' | 'ruta' | 'documento' | 'escudo' | 'llave' | 'retraso';

/** Un renglón de «Requiere atención» (`AtencionItem`): qué · detalle · importe · acción. */
export interface AtencionWidget {
  id: string;
  icono: IconoAtencion;
  tono: TonoModulo;
  titulo: TextoModulo;
  detalle?: TextoModulo;
  importe?: CifraModulo | null;
  accion: TextoModulo;
  href: string;
}

/** Un tramo de la barra de desglose (`BarraDesglose`). */
export interface TramoDesglose {
  id: string;
  /** Texto del tramo; `nombre` cuando es un dato (nombre de la sede). */
  etiqueta: TextoModulo | { nombre: string };
  /** Cifra que se muestra a la derecha (importe o número). */
  cifra: CifraModulo;
  /** Porcentaje entero 0–100 sobre el total del desglose. */
  porcentaje: number;
}

export interface DesgloseWidget {
  id: string;
  titulo: TextoModulo;
  total: CifraModulo;
  tramos: TramoDesglose[];
}

/** Botón de acción del panel («Abrir POS», «Configurar zonas de domicilio»…). */
export interface AccionWidget {
  id: string;
  etiqueta: TextoModulo;
  href: string | null;
  /** Acción que se resuelve en el cliente (abrir el diálogo existente). */
  dialogo?: 'pedidoManual';
  principal?: boolean;
}

/**
 * Enlace a una pantalla con su filtro en la URL («5 atrasados» → Por despachar con
 * `?atrasados=1`). La pantalla ya se validó contra el menú de la persona (`href` del armado):
 * sin ella, `null`.
 */
export function hrefConFiltro(base: string | null, filtro: Record<string, string>): string | null {
  if (!base) return null;
  const q = new URLSearchParams(filtro).toString();
  return q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base;
}

/** Número finito, entero ≥ 0. */
export function entero(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Número finito (puede ser negativo o decimal). */
export function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Porcentajes enteros que suman exactamente 100 (método del mayor resto), para
 * que la leyenda y la barra cuadren. Sin total, todos en 0.
 */
export function porcentajes(valores: readonly number[]): number[] {
  const limpios = valores.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = limpios.reduce((s, v) => s + v, 0);
  if (total <= 0) return limpios.map(() => 0);
  const exactos = limpios.map((v) => (v / total) * 100);
  const base = exactos.map((x) => Math.floor(x));
  let resto = 100 - base.reduce((s, v) => s + v, 0);
  const orden = exactos
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of orden) {
    if (resto <= 0) break;
    if (limpios[i] <= 0) continue;
    base[i] += 1;
    resto -= 1;
  }
  return base;
}

/** Variación % (null sin base de comparación). */
export function variacionPct(actual: number, anterior: number): number | null {
  if (!Number.isFinite(anterior) || anterior <= 0 || !Number.isFinite(actual)) return null;
  return ((actual - anterior) / anterior) * 100;
}

const PESO: Record<TonoModulo, number> = { peligro: 0, advertencia: 1, informacion: 2, exito: 3, neutro: 4 };

/** Orden de «Requiere atención»: lo más grave arriba; a igual tono, el orden de entrada. */
export function ordenarAtencion(items: readonly AtencionWidget[]): AtencionWidget[] {
  return items
    .map((a, i) => ({ a, i }))
    .sort((x, y) => PESO[x.a.tono] - PESO[y.a.tono] || x.i - y.i)
    .map(({ a }) => a);
}
