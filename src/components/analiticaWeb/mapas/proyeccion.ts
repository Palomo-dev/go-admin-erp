/**
 * Proyección de las formas a trazos SVG (d3-geo). Se calcula una vez por
 * geometría: el SVG escala con `viewBox`, así que no depende del ancho real.
 *
 *  - Mundo: Natural Earth 1 (compromiso entre área y forma, habitual en mapas
 *    temáticos del mundo).
 *  - Colombia: Mercator ajustada al territorio continental; San Andrés y
 *    Providencia va en un recuadro (a escala real quedaría a 700 km, en el mar,
 *    y encogería el resto del país).
 */
import { geoMercator, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Forma } from './geometrias';

export interface FormaDibujada {
  codigo: string | null;
  nombre: string;
  /** Atributo `d` del `<path>`, en unidades del viewBox. */
  d: string;
  /** Centro de la forma (para el tooltip al enfocar con teclado). */
  centro: [number, number];
}

export interface Recuadro {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export const LIENZO_MUNDO = { ancho: 800, alto: 410 } as const;
export const LIENZO_COLOMBIA = { ancho: 400, alto: 480 } as const;

const coleccion = (fs: Forma[]): FeatureCollection<Geometry> => ({ type: 'FeatureCollection', features: fs.map((f) => f.geometria as Feature<Geometry>) });

function dibujar(formas: Forma[], proyeccion: GeoProjection): FormaDibujada[] {
  const trazo = geoPath(proyeccion);
  const salida: FormaDibujada[] = [];
  for (const f of formas) {
    const d = trazo(f.geometria);
    if (!d) continue;
    const [cx, cy] = trazo.centroid(f.geometria);
    salida.push({
      codigo: f.codigo,
      nombre: f.nombre,
      d,
      centro: [Number.isFinite(cx) ? Math.round(cx) : 0, Number.isFinite(cy) ? Math.round(cy) : 0],
    });
  }
  return salida;
}

export function dibujarMundo(formas: Forma[]): FormaDibujada[] {
  const { ancho, alto } = LIENZO_MUNDO;
  const proyeccion = geoNaturalEarth1().fitExtent(
    [
      [4, 4],
      [ancho - 4, alto - 4],
    ],
    coleccion(formas),
  );
  return dibujar(formas, proyeccion);
}

const ISLAS = 'CO-SAP';

export function dibujarColombia(formas: Forma[]): { formas: FormaDibujada[]; recuadro: Recuadro | null } {
  const { ancho, alto } = LIENZO_COLOMBIA;
  const continente = formas.filter((f) => f.codigo !== ISLAS);
  const islas = formas.filter((f) => f.codigo === ISLAS);
  const principal = geoMercator().fitExtent(
    [
      [8, 8],
      [ancho - 8, alto - 8],
    ],
    coleccion(continente),
  );
  const dibujadas = dibujar(continente, principal);
  if (islas.length === 0) return { formas: dibujadas, recuadro: null };

  const recuadro: Recuadro = { x: 8, y: 8, ancho: 56, alto: 72 };
  const inset = geoMercator().fitExtent(
    [
      [recuadro.x + 10, recuadro.y + 8],
      [recuadro.x + recuadro.ancho - 10, recuadro.y + recuadro.alto - 8],
    ],
    coleccion(islas),
  );
  return { formas: [...dibujadas, ...dibujar(islas, inset)], recuadro };
}
