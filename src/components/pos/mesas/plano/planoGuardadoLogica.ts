/**
 * Contrato del editor del plano con la base (puro, para Jest):
 * - el cuerpo de la RPC transaccional `guardar_plano_sede` (migración
 *   20261008140014_plano_guardar_sede) a partir de lo que cambió en el editor;
 * - la lectura de `restaurant_floor_elements` (migración 20261008133820).
 *
 * El test de contrato (`__tests__/planoContratoSql.test.ts`) comprueba que
 * cada clave que se manda aquí la lee la función SQL, y que los tipos de
 * elemento son los del CHECK de la tabla.
 */
import type { FormaMesa } from './estadoMesaPlano';
import {
  cajaDeZona,
  elementosDeZona,
  esTipoElemento,
  mesasDeZona,
  normalizarRotacion,
  limitarLado,
  type CambiosPlano,
  type ElementoEnPlano,
  type EstadoEditor,
  type MesaEnPlano,
} from './planoMesasLogica';

export const RPC_GUARDAR_PLANO = 'guardar_plano_sede';
export const TABLA_ELEMENTOS = 'restaurant_floor_elements';
export const COLUMNAS_ELEMENTOS = 'id, zone_name, kind, label, position_x, position_y, width, height, rotation, show_on_web, sort_order';

export const FORMA_BD: Record<FormaMesa, 'square' | 'round' | 'long' | 'bar'> = { cuadrada: 'square', redonda: 'round', larga: 'long', barra: 'bar' };

export interface MesaRpc {
  name: string;
  zone: string | null;
  capacity: number;
  shape: 'square' | 'round' | 'long' | 'bar';
  size: 's' | 'm' | 'l';
  position_x: number;
  position_y: number;
  rotation: number;
  is_web_bookable: boolean;
  web_min_party: number | null;
  web_max_party: number | null;
}

export interface ZonaRpc {
  zone_name: string;
  /** Nombre en la base: si cambió, la RPC renombra el recuadro, las mesas y los elementos. */
  original: string | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  color: string;
  sort_order: number;
}

export interface ElementoRpc {
  /** uuid si ya existe; ausente si es nuevo (entonces va `clave`). */
  id?: string;
  clave?: string;
  zone_name: string | null;
  kind: string;
  label: string | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  show_on_web: boolean;
  sort_order: number;
}

/** Cuerpo de `guardar_plano_sede(p_branch_id, p_cambios)`. Los borrados no van aquí (ver la migración). */
export interface CuerpoGuardarPlano {
  mesas_nuevas: Array<MesaRpc & { clave: string }>;
  mesas_editadas: Array<MesaRpc & { id: string }>;
  zonas: ZonaRpc[];
  elementos: ElementoRpc[];
}

export function mesaRpc(m: MesaEnPlano): MesaRpc {
  return {
    name: m.nombre.trim(),
    zone: m.zona || null,
    capacity: m.capacidad,
    shape: FORMA_BD[m.forma],
    size: m.tamano,
    position_x: Math.round(m.x),
    position_y: Math.round(m.y),
    rotation: normalizarRotacion(m.rotacion),
    is_web_bookable: m.reservableWeb,
    web_min_party: m.webMin,
    web_max_party: m.webMax,
  };
}

export function elementoRpc(e: ElementoEnPlano): ElementoRpc {
  return {
    ...(e.nuevo ? { clave: e.id } : { id: e.id }),
    zone_name: e.zona || null,
    kind: e.tipo,
    label: e.etiqueta.trim() || null,
    position_x: Math.max(0, Math.round(e.x)),
    position_y: Math.max(0, Math.round(e.y)),
    width: limitarLado(e.ancho),
    height: limitarLado(e.alto),
    rotation: normalizarRotacion(e.rotacion),
    show_on_web: e.enSitio,
    sort_order: e.orden,
  };
}

/** Zonas con el recuadro ajustado a sus mesas y elementos (como antes, todas en cada guardado). */
export function zonasRpc(estado: EstadoEditor): ZonaRpc[] {
  return estado.zonas.map((z) => {
    const caja = cajaDeZona(mesasDeZona(estado.mesas, z.nombre), elementosDeZona(estado.elementos, z.nombre)) ?? { x: 0, y: 0, w: 200, h: 150 };
    return {
      zone_name: z.nombre.trim(),
      original: z.original,
      position_x: Math.round(caja.x),
      position_y: Math.round(caja.y),
      width: Math.round(caja.w),
      height: Math.round(caja.h),
      color: z.color,
      sort_order: z.orden,
    };
  });
}

export function cuerpoGuardarPlano(cambios: CambiosPlano, estado: EstadoEditor): CuerpoGuardarPlano {
  return {
    mesas_nuevas: cambios.nuevas.map((m) => ({ clave: m.id, ...mesaRpc(m) })),
    mesas_editadas: cambios.editadas.map((m) => ({ id: m.id, ...mesaRpc(m) })),
    zonas: zonasRpc(estado),
    elementos: [...cambios.elementosNuevos, ...cambios.elementosEditados].map(elementoRpc),
  };
}

/** ¿Hay algo que mandar a la RPC? (con solo borrados no hace falta llamarla). */
export function hayQueGuardar(c: CuerpoGuardarPlano): boolean {
  return c.mesas_nuevas.length + c.mesas_editadas.length + c.zonas.length + c.elementos.length > 0;
}

/** Fila de `restaurant_floor_elements` → elemento del editor; null si no es válida. */
export function elementoDesdeFila(f: Record<string, unknown>): ElementoEnPlano | null {
  if (typeof f.id !== 'string' || !esTipoElemento(f.kind)) return null;
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    id: f.id,
    tipo: f.kind,
    etiqueta: typeof f.label === 'string' ? f.label : '',
    zona: typeof f.zone_name === 'string' && f.zone_name.trim() ? f.zone_name : null,
    x: n(f.position_x, 0),
    y: n(f.position_y, 0),
    ancho: limitarLado(n(f.width, 60)),
    alto: limitarLado(n(f.height, 60)),
    rotacion: normalizarRotacion(n(f.rotation, 0)),
    enSitio: f.show_on_web !== false,
    orden: n(f.sort_order, 0),
  };
}
