/**
 * Lógica del plano de mesas (Figma «POS — Mesas: cuadrícula y plano», 870:103527
 * plano, 870:104583 editor de mesa, 870:580140 editor de zona y 2261:977952
 * elementos fijos y «reservable en la web»). Pura, para Jest: posiciones por
 * defecto, recuadro de cada zona, zoom «Ajustar», deshacer y rehacer, elementos
 * fijos, rango de personas web y qué cambió para «Guardar cambios (n)».
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
  /** «Se puede reservar en la web» (restaurant_tables.is_web_bookable). */
  reservableWeb: boolean;
  /** Personas para reservarla en la web; null = de 1 a la capacidad. */
  webMin: number | null;
  webMax: number | null;
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
  const base = (v: VistaMesaPlano) => ({
    id: v.id,
    nombre: v.nombre,
    zona: v.zona,
    capacidad: v.capacidad,
    forma: v.forma,
    tamano: v.tamano,
    rotacion: v.rotacion,
    reservableWeb: v.reservableWeb ?? true,
    webMin: v.webMin ?? null,
    webMax: v.webMax ?? null,
  });
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

/** Recuadro punteado de la zona: rodea sus mesas (y sus elementos fijos) con margen. */
export function cajaDeZona(mesas: readonly MesaEnPlano[], elementos: readonly ElementoEnPlano[] = []): Caja | null {
  if (mesas.length === 0 && elementos.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  const cajas = [...mesas.map((m) => ({ x: m.x, y: m.y, ...cajaMesa(m) })), ...elementos.map((e) => ({ x: e.x, y: e.y, ...cajaElemento(e) }))];
  for (const c of cajas) {
    x1 = Math.min(x1, c.x);
    y1 = Math.min(y1, c.y);
    x2 = Math.max(x2, c.x + c.w);
    y2 = Math.max(y2, c.y + c.h);
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
  /** Elementos fijos del plano (columna, jardinera, barra…). */
  elementos: ElementoEnPlano[];
  /** Ids de elementos borrados en el editor (los nuevos no cuentan). */
  elementosBorrados: string[];
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

/** Mesas, zonas y elementos nuevos, editados y borrados respecto al estado guardado. */
export interface CambiosPlano {
  nuevas: MesaEnPlano[];
  editadas: MesaEnPlano[];
  borradas: string[];
  zonas: ZonaEnPlano[];
  elementosNuevos: ElementoEnPlano[];
  elementosEditados: ElementoEnPlano[];
  elementosBorrados: string[];
}

const igualMesa = (a: MesaEnPlano, b: MesaEnPlano) =>
  a.nombre === b.nombre &&
  a.zona === b.zona &&
  a.capacidad === b.capacidad &&
  a.forma === b.forma &&
  a.tamano === b.tamano &&
  a.x === b.x &&
  a.y === b.y &&
  a.rotacion === b.rotacion &&
  a.reservableWeb === b.reservableWeb &&
  a.webMin === b.webMin &&
  a.webMax === b.webMax;

const igualElemento = (a: ElementoEnPlano, b: ElementoEnPlano) =>
  a.tipo === b.tipo &&
  a.etiqueta === b.etiqueta &&
  a.zona === b.zona &&
  a.x === b.x &&
  a.y === b.y &&
  a.ancho === b.ancho &&
  a.alto === b.alto &&
  a.rotacion === b.rotacion &&
  a.enSitio === b.enSitio &&
  a.orden === b.orden;

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
  const elementosBase = new Map(guardado.elementos.map((e) => [e.id, e]));
  const elementosNuevos = actual.elementos.filter((e) => e.nuevo);
  const elementosEditados = actual.elementos.filter((e) => !e.nuevo && elementosBase.has(e.id) && !igualElemento(elementosBase.get(e.id)!, e));
  return { nuevas, editadas, borradas: actual.borradas, zonas, elementosNuevos, elementosEditados, elementosBorrados: actual.elementosBorrados };
}

export function totalCambios(c: CambiosPlano): number {
  return (
    c.nuevas.length +
    c.editadas.length +
    c.borradas.length +
    c.zonas.length +
    c.elementosNuevos.length +
    c.elementosEditados.length +
    c.elementosBorrados.length
  );
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

// ── Reserva en la web (2261:977952 «Se puede reservar en la web») ───────────

/** Error del rango de personas web de una mesa, o null si es válido. */
export type ErrorRangoWeb = 'minimo' | 'orden' | 'capacidad';

export function errorRangoWeb(m: Pick<MesaEnPlano, 'capacidad' | 'webMin' | 'webMax'>): ErrorRangoWeb | null {
  if ((m.webMin != null && m.webMin < 1) || (m.webMax != null && m.webMax < 1)) return 'minimo';
  if (m.webMin != null && m.webMax != null && m.webMin > m.webMax) return 'orden';
  if ((m.webMin != null && m.webMin > m.capacidad) || (m.webMax != null && m.webMax > m.capacidad)) return 'capacidad';
  return null;
}

/** Rango efectivo para reservar en la web: el guardado o de 1 a la capacidad. */
export function rangoWeb(m: Pick<MesaEnPlano, 'capacidad' | 'webMin' | 'webMax'>): { min: number; max: number } {
  return { min: m.webMin ?? 1, max: m.webMax ?? m.capacidad };
}

/** Mesas con un rango web que no se puede guardar (bloquea «Guardar cambios»). */
export function mesasConRangoInvalido(mesas: readonly MesaEnPlano[]): MesaEnPlano[] {
  return mesas.filter((m) => m.reservableWeb && errorRangoWeb(m) !== null);
}

// ── Elementos fijos (2261:977952 «+ Elemento fijo») ─────────────────────────

/** Mismos valores que el CHECK de restaurant_floor_elements.kind. */
export const TIPOS_ELEMENTO = ['column', 'planter', 'bar', 'wall', 'door', 'window', 'label'] as const;
export type TipoElemento = (typeof TIPOS_ELEMENTO)[number];

/** Tamaño de partida de cada tipo (px a escala 1). */
export const TAMANO_ELEMENTO: Record<TipoElemento, { w: number; h: number }> = {
  column: { w: 60, h: 80 },
  planter: { w: 140, h: 70 },
  bar: { w: 200, h: 40 },
  wall: { w: 240, h: 12 },
  door: { w: 80, h: 12 },
  window: { w: 120, h: 8 },
  label: { w: 120, h: 32 },
};

/** Límites del CHECK de la base (width/height between 4 and 4000). */
export const LADO_MIN = 4;
export const LADO_MAX = 4000;

export interface ElementoEnPlano {
  id: string;
  tipo: TipoElemento;
  /** Texto que se ve dentro del elemento (vacío: ninguno). */
  etiqueta: string;
  zona: string | null;
  /** Esquina superior izquierda de la caja ya girada (igual que las mesas). */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  rotacion: number;
  /** «Se ve en el sitio» (show_on_web). */
  enSitio: boolean;
  orden: number;
  /** Elemento nuevo del editor (aún no está en la base). */
  nuevo?: boolean;
}

export function esTipoElemento(v: unknown): v is TipoElemento {
  return typeof v === 'string' && (TIPOS_ELEMENTO as readonly string[]).includes(v);
}

export function limitarLado(v: number): number {
  return Math.min(LADO_MAX, Math.max(LADO_MIN, Math.round(v)));
}

/** Rotación en 0–359 (CHECK de la base). */
export function normalizarRotacion(r: number): number {
  return ((Math.round(r) % 360) + 360) % 360;
}

/** Caja del elemento girado: la que ocupa en el plano. */
export function cajaElemento(e: Pick<ElementoEnPlano, 'ancho' | 'alto' | 'rotacion'>): { w: number; h: number } {
  const r = (normalizarRotacion(e.rotacion) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  return { w: Math.round(e.ancho * cos + e.alto * sin), h: Math.round(e.ancho * sin + e.alto * cos) };
}

export function elementosDeZona(elementos: readonly ElementoEnPlano[], zona: string | null): ElementoEnPlano[] {
  return elementos.filter((e) => (e.zona ?? null) === zona);
}

/** Elemento nuevo del tipo, con su tamaño de partida, en la posición dada (ajustada a la rejilla). */
export function crearElemento(datos: { id: string; tipo: TipoElemento; etiqueta: string; zona: string | null; x: number; y: number; orden: number }): ElementoEnPlano {
  const t = TAMANO_ELEMENTO[datos.tipo];
  return {
    id: datos.id,
    tipo: datos.tipo,
    etiqueta: datos.etiqueta,
    zona: datos.zona,
    x: Math.max(0, ajustarARejilla(datos.x)),
    y: Math.max(0, ajustarARejilla(datos.y)),
    ancho: t.w,
    alto: t.h,
    rotacion: 0,
    enSitio: true,
    orden: datos.orden,
    nuevo: true,
  };
}

export function actualizarElemento(e: EstadoEditor, id: string, cambio: Partial<ElementoEnPlano>): EstadoEditor {
  return {
    ...e,
    elementos: e.elementos.map((x) => {
      if (x.id !== id) return x;
      const s = { ...x, ...cambio };
      return { ...s, ancho: limitarLado(s.ancho), alto: limitarLado(s.alto), rotacion: normalizarRotacion(s.rotacion), x: Math.max(0, s.x), y: Math.max(0, s.y) };
    }),
  };
}

export function quitarElemento(e: EstadoEditor, id: string): EstadoEditor {
  const el = e.elementos.find((x) => x.id === id);
  return {
    ...e,
    elementos: e.elementos.filter((x) => x.id !== id),
    elementosBorrados: el && !el.nuevo ? [...e.elementosBorrados, id] : e.elementosBorrados,
  };
}

/** Copia del elemento a la derecha. */
export function duplicarElemento(e: EstadoEditor, id: string, idNuevo: string): EstadoEditor {
  const el = e.elementos.find((x) => x.id === id);
  if (!el) return e;
  const c = cajaElemento(el);
  const orden = e.elementos.reduce((m, x) => Math.max(m, x.orden), 0) + 1;
  return { ...e, elementos: [...e.elementos, { ...el, id: idNuevo, x: ajustarARejilla(el.x + c.w + REJILLA), orden, nuevo: true }] };
}

/**
 * Cambia el tamaño arrastrando la esquina inferior derecha. El arrastre llega
 * en ejes de la pantalla (dx, dy) y se pasa a los ejes del elemento girado
 * (CSS `rotate` gira en el sentido del reloj con y hacia abajo).
 */
export function redimensionarElemento(el: Pick<ElementoEnPlano, 'ancho' | 'alto' | 'rotacion'>, dx: number, dy: number): { ancho: number; alto: number } {
  const r = (normalizarRotacion(el.rotacion) * Math.PI) / 180;
  const dw = dx * Math.cos(r) + dy * Math.sin(r);
  const dh = -dx * Math.sin(r) + dy * Math.cos(r);
  return { ancho: limitarLado(el.ancho + dw), alto: limitarLado(el.alto + dh) };
}
