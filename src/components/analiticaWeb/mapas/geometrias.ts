/**
 * Geometrías de los mapas de «De dónde entran» (TopoJSON → GeoJSON con código).
 *
 * Todo va dentro del repositorio: sin servicios externos, sin claves.
 *
 *  - Mundo: `world-atlas/countries-110m.json` (npm world-atlas 2.0.2, licencia
 *    ISC; datos de Natural Earth, dominio público). Ids = ISO 3166-1 numérico,
 *    que `alfa2DesdeNumerico` pasa a alfa-2. Se omite la Antártida.
 *  - Colombia: `geo/colombia-departamentos.topo.json`, derivado de Natural
 *    Earth 1:10m «Admin 1 – States, Provinces» (v5.1, dominio público,
 *    https://www.naturalearthdata.com/about/terms-of-use/). Se filtró Colombia,
 *    se corrigió Bogotá (Natural Earth la marca «CO-CUN»; aquí «CO-DC»), se quitó
 *    un islote sin departamento y se simplificó con mapshaper (10 %,
 *    keep-shapes, cuantización 1e4). Ids = ISO 3166-2 («CO-ANT»): 32
 *    departamentos + Bogotá D. C.
 *
 * Los JSON se importan de forma diferida: solo bajan al abrir la pantalla (el
 * mundo) o al elegir Colombia (los departamentos).
 */
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import { alfa2DesdeNumerico } from '@/lib/analiticaWeb/isoPaises';

export interface Forma {
  /** ISO 3166-1 alfa-2 (mundo) o ISO 3166-2 (departamentos). Null si no se conoce. */
  codigo: string | null;
  nombre: string;
  geometria: Feature<Geometry>;
}

type Props = { name?: string; nombre?: string };

function aFormas(topo: Topology, objeto: string, codigoDe: (f: Feature<Geometry, Props>) => string | null): Forma[] {
  const coleccion = topo.objects[objeto] as GeometryCollection<Props> | undefined;
  if (!coleccion) return [];
  const fc = feature(topo, coleccion);
  const features = 'features' in fc ? fc.features : [fc];
  return features.map((f) => ({
    codigo: codigoDe(f as Feature<Geometry, Props>),
    nombre: String(f.properties?.nombre ?? f.properties?.name ?? ''),
    geometria: f as Feature<Geometry>,
  }));
}

/** Países de world-atlas con su alfa-2 (sin la Antártida). */
export function formasMundo(topo: Topology): Forma[] {
  return aFormas(topo, 'countries', (f) => alfa2DesdeNumerico(f.id as string | number | undefined, f.properties?.name)).filter(
    (f) => f.codigo !== 'AQ',
  );
}

/** Departamentos de Colombia con su código ISO 3166-2. */
export function formasColombia(topo: Topology): Forma[] {
  return aFormas(topo, 'departamentos', (f) => (typeof f.id === 'string' ? f.id : null));
}

let mundo: Promise<Forma[]> | null = null;
let colombia: Promise<Forma[]> | null = null;

export function cargarMundo(): Promise<Forma[]> {
  mundo ??= import('world-atlas/countries-110m.json').then((m) => formasMundo((m.default ?? m) as unknown as Topology));
  mundo.catch(() => {
    mundo = null;
  });
  return mundo;
}

export function cargarColombia(): Promise<Forma[]> {
  colombia ??= import('./geo/colombia-departamentos.topo.json').then((m) => formasColombia((m.default ?? m) as unknown as Topology));
  colombia.catch(() => {
    colombia = null;
  });
  return colombia;
}
