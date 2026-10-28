/**
 * Un solo control para el espaciado (Estilo › Espaciado) y para el ancho (Estilo › Ancho).
 * Funciones puras: leen las claves de antes como respaldo y nunca las borran.
 */
import type { AnchoSeccion, EstiloSeccion } from '@/lib/website/v2/estiloSeccion';
import { ATAJOS_RELLENO, type EspacioSeccion, type LadoEspacio } from '@/lib/website/espacioSeccion';

type Obj = Record<string, unknown>;
const objeto = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
// Igual que parseBool de HeroSlider: false, 'false', '0', '' y 0 apagan.
const falso = (v: unknown) => v != null && (typeof v === 'string' ? v === 'false' || v === '0' || v === '' : !v);

export type AtajoEspaciado = keyof typeof ATAJOS_RELLENO;
export const ATAJOS_ESPACIADO = Object.keys(ATAJOS_RELLENO) as AtajoEspaciado[];

/** Atajo que coincide con el relleno que se ve hoy (arriba y abajo, en los dos dispositivos); si no, ninguno. */
export function atajoActual(espacio: EspacioSeccion | undefined): AtajoEspaciado | null {
  if (!espacio) return null;
  const igual = (l: LadoEspacio, a: AtajoEspaciado) => l.celular === ATAJOS_RELLENO[a].celular && l.computador === ATAJOS_RELLENO[a].computador;
  // Primera sección / solapa: arriba manda el hueco del header; el atajo se lee solo abajo.
  return ATAJOS_ESPACIADO.find((a) => (espacio.arribaFijo || igual(espacio.rellenoArriba, a)) && igual(espacio.rellenoAbajo, a)) ?? null;
}

/** Elegir un atajo escribe los px de la escala (los mismos de antes) en el relleno de la sección. */
export function aplicarAtajo(fondo: unknown, a: AtajoEspaciado, espacio?: EspacioSeccion): Obj {
  const p = ATAJOS_RELLENO[a];
  const siguiente: Obj = { ...objeto(fondo), padding_bottom: p.computador, padding_bottom_mobile: p.celular };
  // Como antes con la escala: en la primera sección o con solapa, el atajo no suma relleno al hueco del header.
  if (!espacio?.arribaFijo) Object.assign(siguiente, { padding_top: p.computador, padding_top_mobile: p.celular });
  return siguiente;
}

/**
 * Cambia el relleno o el margen de un dispositivo y fija el otro con lo que se ve hoy.
 * Vaciar un dispositivo quita solo su clave.
 */
export function cambioEspacio(
  fondo: Obj,
  tipo: 'padding' | 'margin',
  lado: 'top' | 'bottom',
  dispositivo: 'celular' | 'computador',
  valor: number | undefined,
  actual: LadoEspacio | undefined,
): Obj {
  const kComp = `${tipo}_${lado}`;
  const kCel = `${kComp}_mobile`;
  const siguiente = { ...fondo };
  const propioK = dispositivo === 'celular' ? kCel : kComp;
  const otroK = dispositivo === 'celular' ? kComp : kCel;
  if (valor == null) delete siguiente[propioK];
  else {
    siguiente[propioK] = valor;
    if (siguiente[otroK] == null && actual) siguiente[otroK] = dispositivo === 'celular' ? actual.computador : actual.celular;
  }
  // Celular igual a computador: no se guarda aparte (la tienda usa el de computador para los dos).
  if (siguiente[kCel] != null && siguiente[kCel] === siguiente[kComp]) delete siguiente[kCel];
  return siguiente;
}

/** ¿La portada pinta su propio contenedor (HeroSlider con `full_width`)? */
const esCarrusel = (tipo: string, variante: string | null | undefined) => tipo === 'hero' && variante === 'slider';

/** Ancho que la tienda aplica hoy (mismo cálculo que SectionWrapperBase + estiloSeccionPublico + HeroSlider). */
export function anchoEfectivo(contenido: Obj, ancho: AnchoSeccion | undefined, tipo: string, variante?: string | null): AnchoSeccion {
  const bg = objeto(contenido.section_background).width;
  let caja: boolean;
  if (bg === 'full') caja = true;
  else if (bg === 'content') caja = false;
  else {
    const libre = contenido.full_bleed === undefined && contenido.container_width === undefined;
    caja = contenido.full_bleed === true || contenido.container_width === 'full' || (libre && (ancho ? ancho === 'completo' : tipo === 'hero'));
  }
  const carrusel = !esCarrusel(tipo, variante) || !falso(contenido.full_width);
  return caja && carrusel ? 'completo' : 'contenedor';
}

/** Un solo «Ancho»: escribe Estilo › Ancho y ajusta lo de antes que lo taparía (sin borrar claves). */
export function cambioAncho(
  contenido: Obj,
  estilo: EstiloSeccion,
  nuevo: AnchoSeccion,
  tipo: string,
  variante?: string | null,
): { contenido: Obj; estilo: EstiloSeccion } {
  // Elegir lo que ya se ve no guarda nada.
  if (anchoEfectivo(contenido, estilo.ancho, tipo, variante) === nuevo) return { contenido, estilo };
  const completo = nuevo === 'completo';
  const c: Obj = { ...contenido };
  const bg = objeto(c.section_background);
  if (bg.width === 'full' || bg.width === 'content') c.section_background = { ...bg, width: completo ? 'full' : 'content' };
  if (c.full_bleed !== undefined || c.container_width !== undefined) {
    c.full_bleed = completo;
    if (!completo && c.container_width === 'full') c.container_width = 'lg';
  }
  // Portada carrusel: «Ancho completo» del contenido sigue la misma opción (ausente = completo, como hoy).
  if (esCarrusel(tipo, variante) && completo && falso(c.full_width)) c.full_width = true;
  return { contenido: c, estilo: { ...estilo, ancho: nuevo } };
}
