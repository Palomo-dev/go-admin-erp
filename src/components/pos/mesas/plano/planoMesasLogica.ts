/**
 * Lógica del plano de mesas (Figma «POS — Mesas: cuadrícula y plano», 870:103527
 * plano, 870:104583 editor de mesa, 870:580140 editor de zona). Pura, para Jest:
 * posiciones por defecto, recuadro de cada zona, zoom «Ajustar», deshacer y
 * rehacer, y qué cambió para «Guardar cambios (n)».
 */
import { tamanoEnPlanoBase, type FormaMesa, type VistaMesaPlano } from './estadoMesaPlano';

/** Rejilla del editor (px a escala 1): las mesas se ajustan a ella al soltarlas. */
export const REJILLA = 20;
/** Separación entre mesas en la colocación automática. */
const PASO_X = 152;
const PASO_Y = 176;
/** Margen del recuadro de la zona alrededor de sus mesas (arriba deja sitio a la etiqueta). */
export const MARGEN_ZONA = { x: 24, arriba: 40, abajo: 24 };
/** Seis tonos del manual de marca para las zonas (870:580140 «Color (6 tonos del manual)»). */
export const COLORES_ZONA = ['#4361EE', '#16A34A', '#F59E0B', '#8B5CF6', '#EC4899', '#0EA5E9'] as const;

export const ROTACIONES = [0, 90, 180, 270] as const;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2;

export function ajustarARejilla(v: number): number {
  return Math.round(v / REJILLA) * REJILLA;
}

export function limitarZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
}

/** Color de una zona: el guardado o, si no tiene, el de la marca (Figma: todas azules). */
export function colorDeZona(_nombre: string, guardado?: string | null): string {
  if (guardado && /^#[0-9a-f]{6}$/i.test(guardado)) return guardado;
  return COLORES_ZONA[0];
}

/** Lo editable de una mesa en el plano. */
export interface MesaEnPlano {
  id: string;
  nombre: string;
  zona: string | null;
  capacidad: number;
  forma: FormaMesa;
  tamano: 's' | 'm' | 'l';
  x: number;
  y: number;
  rotacion: number;
  /** Mesa nueva del editor (aún no está en la base). */
  nueva?: boolean;
}

export interface ZonaEnPlano {
  nombre: string;
  color: string;
  orden: number;
  /** Nombre en la base (para renombrar): null si la zona es nueva. */
  original: string | null;
}

/** Tamaño de la mesa en el plano, girado si la rotación es 90 o 270. */
export function cajaMesa(m: Pick<MesaEnPlano, 'forma' | 'tamano' | 'rotacion'>): { w: number; h: number } {
  const t = tamanoEnPlanoBase(m.forma, m.tamano);
  const girada = Math.abs(m.rotacion % 180) === 90;
  return girada ? { w: t.h, h: t.w } : t;
}

/**
 * Posiciones de partida: las guardadas; las que faltan, en filas de `columnas`
 * dentro de su zona (debajo de las que ya tienen sitio). Una zona sin ninguna
 * mesa colocada va debajo de todo lo anterior, para que en «Todas» no se pisen.
 */
export function colocarMesas(vistas: readonly VistaMesaPlano[], ordenZonas: readonly (string | null)[] = [], columnas = 6): MesaEnPlano[] {
  const porZona = new Map<string | null, VistaMesaPlano[]>();
  for (const v of vistas) porZona.set(v.zona ?? null, [...(porZona.get(v.zona ?? null) ?? []), v]);
  const orden = [...ordenZonas.filter((z) => porZona.has(z)), ...[...porZona.keys()].filter((z) => !ordenZonas.includes(z))];
  const salida: MesaEnPlano[] = [];
  const base = (v: VistaMesaPlano) => ({ id: v.id, nombre: v.nombre, zona: v.zona, capacidad: v.capacidad, forma: v.forma, tamano: v.tamano, rotacion: v.rotacion });
  // Fondo de lo ya colocado (mesas con posición guardada de todas las zonas).
  const colocadas = vistas.filter((v) => v.x != null && v.y != null);
  let fondo = colocadas.length > 0 ? Math.max(...colocadas.map((v) => (v.y ?? 0) + tamanoEnPlanoBase(v.forma, v.tamano).h)) + MARGEN_ZONA.abajo : 0;
  for (const zona of orden) {
    const lista = porZona.get(zona) ?? [];
    const conSitio = lista.filter((v) => v.x != null && v.y != null);
    const sinSitio = lista.filter((v) => v.x == null || v.y == null);
    for (const v of conSitio) salida.push({ ...base(v), x: v.x as number, y: v.y as number });
    if (sinSitio.length === 0) continue;
    let x0 = MARGEN_ZONA.x;
    let y0: number;
    if (conSitio.length > 0) {
      x0 = Math.min(...conSitio.map((v) => v.x as number));
      y0 = Math.max(...conSitio.map((v) => (v.y as number) + PASO_Y));
    } else {
      y0 = fondo + MARGEN_ZONA.arriba + (fondo > 0 ? 40 : 0);
    }
    let cursor = x0;
    sinSitio.forEach((v, i) => {
      if (i % columnas === 0) cursor = x0;
      salida.push({ ...base(v), x: cursor, y: y0 + Math.floor(i / columnas) * PASO_Y });
      cursor += Math.max(PASO_X, tamanoEnPlanoBase(v.forma, v.tamano).w + 42);
    });
    const ultimaFila = y0 + Math.floor((sinSitio.length - 1) / columnas) * PASO_Y;
    fondo = Math.max(fondo, ultimaFila + 110 + MARGEN_ZONA.abajo);
  }
  return salida;
}

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Recuadro punteado de la zona: rodea sus mesas con margen. */
export function cajaDeZona(mesas: readonly MesaEnPlano[]): Caja | null {
  if (mesas.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const m of mesas) {
    const c = cajaMesa(m);
    x1 = Math.min(x1, m.x);
    y1 = Math.min(y1, m.y);
    x2 = Math.max(x2, m.x + c.w);
    y2 = Math.max(y2, m.y + c.h);
  }
  return { x: x1 - MARGEN_ZONA.x, y: y1 - MARGEN_ZONA.arriba, w: x2 - x1 + MARGEN_ZONA.x * 2, h: y2 - y1 + MARGEN_ZONA.arriba + MARGEN_ZONA.abajo };
}

/** Lienzo: todas las cajas, empezando en 0,0. */
export function cajaTotal(cajas: readonly (Caja | null)[]): Caja {
  const v = cajas.filter((c): c is Caja => !!c);
  if (v.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x1 = Math.min(0, ...v.map((c) => c.x));
  const y1 = Math.min(0, ...v.map((c) => c.y));
  const x2 = Math.max(...v.map((c) => c.x + c.w));
  const y2 = Math.max(...v.map((c) => c.y + c.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Zoom de «Ajustar»: que todo quepa en el área visible (sin pasar de 100 %). */
export function zoomAjustar(caja: Caja, ancho: number, alto: number, margen = 32): number {
  if (caja.w <= 0 || caja.h <= 0 || ancho <= 0 || alto <= 0) return 1;
  const z = Math.min((ancho - margen * 2) / caja.w, (alto - margen * 2) / caja.h, 1);
  return Math.max(ZOOM_MIN, Math.floor(z * 10) / 10);
}

// ── Editor: deshacer / rehacer ──────────────────────────────────────────────

export interface EstadoEditor {
  mesas: MesaEnPlano[];
  zonas: ZonaEnPlano[];
  /** Ids de mesas borradas en el editor (las nuevas no cuentan). */
  borradas: string[];
}

export interface HistorialEditor {
  pasado: EstadoEditor[];
  presente: EstadoEditor;
  futuro: EstadoEditor[];
}

export function iniciarHistorial(estado: EstadoEditor): HistorialEditor {
  return { pasado: [], presente: estado, futuro: [] };
}

export function aplicar(h: HistorialEditor, siguiente: EstadoEditor): HistorialEditor {
  return { pasado: [...h.pasado, h.presente].slice(-50), presente: siguiente, futuro: [] };
}

export function deshacer(h: HistorialEditor): HistorialEditor {
  if (h.pasado.length === 0) return h;
  return { pasado: h.pasado.slice(0, -1), presente: h.pasado[h.pasado.length - 1], futuro: [h.presente, ...h.futuro] };
}

export function rehacer(h: HistorialEditor): HistorialEditor {
  if (h.futuro.length === 0) return h;
  return { pasado: [...h.pasado, h.presente], presente: h.futuro[0], futuro: h.futuro.slice(1) };
}

export function actualizarMesa(e: EstadoEditor, id: string, cambio: Partial<MesaEnPlano>): EstadoEditor {
  return { ...e, mesas: e.mesas.map((m) => (m.id === id ? { ...m, ...cambio } : m)) };
}

export function quitarMesa(e: EstadoEditor, id: string): EstadoEditor {
  const m = e.mesas.find((x) => x.id === id);
  return { ...e, mesas: e.mesas.filter((x) => x.id !== id), borradas: m && !m.nueva ? [...e.borradas, id] : e.borradas };
}

/** Siguiente nombre libre «Mesa N» (el mayor número + 1). */
export function siguienteNombre(mesas: readonly { nombre: string }[], prefijo: string): string {
  const n = mesas.reduce((max, m) => {
    const r = m.nombre.match(/(\d+)\s*$/);
    return r ? Math.max(max, Number(r[1])) : max;
  }, 0);
  return `${prefijo} ${n + 1}`;
}

/** Copia de la mesa a la derecha (o debajo si no cabe), con nombre nuevo. */
export function duplicarMesa(e: EstadoEditor, id: string, idNuevo: string, prefijo: string): EstadoEditor {
  const m = e.mesas.find((x) => x.id === id);
  if (!m) return e;
  const c = cajaMesa(m);
  const copia: MesaEnPlano = { ...m, id: idNuevo, nombre: siguienteNombre(e.mesas, prefijo), x: m.x + c.w + 40, y: m.y, nueva: true };
  return { ...e, mesas: [...e.mesas, copia] };
}

/** Mesas nuevas, editadas y borradas respecto al estado guardado. */
export interface CambiosPlano {
  nuevas: MesaEnPlano[];
  editadas: MesaEnPlano[];
  borradas: string[];
  zonas: ZonaEnPlano[];
}

const igualMesa = (a: MesaEnPlano, b: MesaEnPlano) =>
  a.nombre === b.nombre &&
  a.zona === b.zona &&
  a.capacidad === b.capacidad &&
  a.forma === b.forma &&
  a.tamano === b.tamano &&
  a.x === b.x &&
  a.y === b.y &&
  a.rotacion === b.rotacion;

const igualZona = (a: ZonaEnPlano, b: ZonaEnPlano) => a.nombre === b.nombre && a.color === b.color && a.orden === b.orden;

export function cambiosPlano(guardado: EstadoEditor, actual: EstadoEditor): CambiosPlano {
  const base = new Map(guardado.mesas.map((m) => [m.id, m]));
  const nuevas = actual.mesas.filter((m) => m.nueva);
  const editadas = actual.mesas.filter((m) => !m.nueva && base.has(m.id) && !igualMesa(base.get(m.id)!, m));
  const zonasBase = new Map(guardado.zonas.map((z) => [z.original ?? `nueva:${z.nombre}`, z]));
  const zonas = actual.zonas.filter((z) => {
    const b = zonasBase.get(z.original ?? `nueva:${z.nombre}`);
    return !b || !igualZona(b, z) || z.original === null;
  });
  return { nuevas, editadas, borradas: actual.borradas, zonas };
}

export function totalCambios(c: CambiosPlano): number {
  return c.nuevas.length + c.editadas.length + c.borradas.length + c.zonas.length;
}

/** Mueve una zona en el orden de las pestañas (870:580140 «Pestaña 2 de 4» ↑↓). */
export function moverZona(zonas: readonly ZonaEnPlano[], nombre: string, delta: -1 | 1): ZonaEnPlano[] {
  const orden = [...zonas].sort((a, b) => a.orden - b.orden);
  const i = orden.findIndex((z) => z.nombre === nombre);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= orden.length) return orden;
  [orden[i], orden[j]] = [orden[j], orden[i]];
  return orden.map((z, k) => ({ ...z, orden: k }));
}

/** Mesas de una zona, colocadas para que su recuadro empiece arriba a la izquierda. */
export function mesasDeZona(mesas: readonly MesaEnPlano[], zona: string | null): MesaEnPlano[] {
  return mesas.filter((m) => (m.zona ?? null) === zona);
}
