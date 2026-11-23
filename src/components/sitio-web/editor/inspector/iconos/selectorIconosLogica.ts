/**
 * Selector de íconos y «Estilo de los íconos» del editor (Figma «16 Sitio web» 2852:70951,
 * propuesta 8 aprobada el 2026-11-23). Lógica pura: filtra el catálogo, arma los sugeridos y los
 * cambios que el editor escribe en el documento V2 (sin columnas nuevas):
 * - Cabecera: `header_iconos.glifos[icono]` y `header_iconos.iconStyle`.
 * - Menú inferior: `items[].icon` como objeto (`glyph` al leer) y `style.iconStyle`.
 *
 * Lectura y defaults: `@/lib/website/v2/glifosTienda` y `catalogoIconos` (copias idénticas en la
 * tienda). Lo que queda «como hoy» no se escribe.
 */
import {
  ICONOS_CABECERA_GLIFO,
  PESOS_GLIFO,
  leerEstiloGlifos,
  leerRefGlifo,
  refAGuardar,
  estiloGlifosAGuardar,
  type EstiloGlifos,
  type IconoCabeceraGlifo,
  type PesoGlifo,
  type RefGlifo,
} from '@/lib/website/v2/glifosTienda';
import {
  CATEGORIAS_ICONOS,
  LETRA_CATEGORIA,
  coincideBusqueda,
  leerSugerido,
  nombreEspanol,
  normalizarBusqueda,
  sugeridosDe,
  type CategoriaIcono,
} from '@/lib/website/v2/catalogoIconos';
import type { FilaCatalogoPhosphor } from '@/lib/website/v2/catalogoPhosphor.generado';
import type { BotonMenu, IconoMenu, MenuInferior } from '@/lib/website/menuInferior';
import type { AccionEncabezado } from '@/lib/website/v2/iconosEncabezado';
import { cambioIconos } from '../cabeceraTiendaLogica';

type Ajustes = Record<string, unknown>;

/** Lo que devuelve el selector: un nombre de siempre (Lucide) o un ícono del catálogo nuevo. */
export type EleccionIcono = { tipo: 'clasico'; nombre: string } | { tipo: 'phosphor'; ref: RefGlifo };

/** Filtro de categorías del selector: todas, los de siempre o una categoría del catálogo. */
export type FiltroCategoria = 'todos' | 'clasicos' | CategoriaIcono;

/** Íconos que se pintan por tanda en la rejilla (al bajar se pinta la siguiente). */
export const PASO_REJILLA = 48;
/** Categorías que se ven antes de «Más…». */
export const CATEGORIAS_A_LA_VISTA = 6;

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// ─── Catálogo ────────────────────────────────────────────────────────────────────────────────

/** Filas que responden a la búsqueda y a la categoría (sin categoría: todas). */
export function filtrarCatalogo(filas: readonly FilaCatalogoPhosphor[], consulta: string, categoria: FiltroCategoria): FilaCatalogoPhosphor[] {
  const letra = categoria !== 'todos' && categoria !== 'clasicos' ? LETRA_CATEGORIA[categoria] : null;
  const q = normalizarBusqueda(consulta);
  return filas.filter((f) => (!letra || f[1].includes(letra)) && (!q || coincideBusqueda(f[3], q)));
}

/** Cuántos íconos tiene cada categoría (para los chips «Comercio 191»). */
export function contarCategorias(filas: readonly FilaCatalogoPhosphor[]): Record<CategoriaIcono, number> {
  const r = Object.fromEntries(CATEGORIAS_ICONOS.map((c) => [c, 0])) as Record<CategoriaIcono, number>;
  for (const f of filas) for (const c of CATEGORIAS_ICONOS) if (f[1].includes(LETRA_CATEGORIA[c])) r[c] += 1;
  return r;
}

/** Etiqueta de un ícono: la de la fila, el nombre en español o el nombre separado en palabras. */
export function etiquetaIcono(nombre: string, fila?: FilaCatalogoPhosphor): string {
  if (fila) return fila[2];
  return nombreEspanol(nombre) ?? nombre.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/** Sugeridos de una acción como referencias (con su peso propio si lo traen, «Heart:fill»). */
export function sugeridosRef(accion: string): RefGlifo[] {
  return sugeridosDe(accion)
    .map((s) => {
      const { name, weight } = leerSugerido(s);
      return leerRefGlifo({ set: 'phosphor', name, weight });
    })
    .filter((r): r is RefGlifo => r !== null);
}

/** Clave estable de un ícono elegido (para marcar el seleccionado en la rejilla). */
export function claveEleccion(e: EleccionIcono | null): string {
  if (!e) return '';
  return e.tipo === 'clasico' ? `l:${e.nombre}` : `p:${e.ref.name}:${e.ref.weight ?? ''}`;
}

/** El ícono con un peso del selector: Línea no se guarda (sigue el estilo general). */
export function refConPeso(nombre: string, peso: PesoGlifo): RefGlifo {
  return peso === 'regular' ? { set: 'phosphor', name: nombre } : { set: 'phosphor', name: nombre, weight: peso };
}

// ─── Estilo de los íconos ────────────────────────────────────────────────────────────────────

/** Estilo con un cambio aplicado y limpio; `null` si quedó como hoy. */
export function estiloConCambio(actual: EstiloGlifos | null | undefined, parte: Partial<EstiloGlifos>): EstiloGlifos | null {
  const siguiente: Record<string, unknown> = { ...(actual ?? {}) };
  for (const [k, v] of Object.entries(parte)) {
    if (v === undefined || v === null) delete siguiente[k];
    else siguiente[k] = v;
  }
  return leerEstiloGlifos(siguiente);
}

// ─── Cabecera ────────────────────────────────────────────────────────────────────────────────

/** Ícono de la cabecera de cada acción del contrato de siempre. */
export const ICONO_DE_ACCION: Readonly<Record<AccionEncabezado, IconoCabeceraGlifo>> = {
  search: 'buscar',
  cart: 'carrito',
  account: 'cuenta',
  currency: 'moneda',
};

/** Acción de los sugeridos para cada ícono de la cabecera. */
export const SUGERIDOS_CABECERA: Readonly<Record<IconoCabeceraGlifo, string>> = {
  buscar: 'search',
  favoritos: 'favorites',
  carrito: 'cart',
  cuenta: 'account',
  moneda: 'currency',
};

/** Dibujo del catálogo nuevo de un ícono de la cabecera (`null` quita el dibujo: vuelve el de siempre). */
export function cambioGlifoCabecera(a: Ajustes, icono: IconoCabeceraGlifo, ref: RefGlifo | null): Ajustes {
  const actual = { ...(objeto(objeto(a.header_iconos)?.glifos) ?? {}) };
  actual[icono] = ref ? refAGuardar(ref) : null;
  // Solo las claves conocidas: lo demás que hubiera en `glifos` no se arrastra.
  const glifos: Record<string, unknown> = {};
  for (const k of ICONOS_CABECERA_GLIFO) if (actual[k] !== undefined) glifos[k] = actual[k];
  return cambioIconos(a, { glifos });
}

/** «Estilo de los íconos» de la cabecera; `null` = como hoy (se borra la clave). */
export function cambioEstiloGlifosCabecera(a: Ajustes, estilo: EstiloGlifos | null): Ajustes {
  return cambioIconos(a, { iconStyle: estiloGlifosAGuardar(estilo) });
}

// ─── Menú inferior ───────────────────────────────────────────────────────────────────────────

/** El botón con el ícono elegido: uno de siempre quita el del catálogo nuevo, y al revés. */
export function botonConIcono(b: BotonMenu, e: EleccionIcono): BotonMenu {
  const resto: BotonMenu = { ...b };
  delete resto.glyph;
  if (e.tipo === 'clasico') return { ...resto, icon: e.nombre as IconoMenu };
  return { ...resto, glyph: e.ref };
}

/** El menú con su «Estilo de los íconos» (sin estilo, sin la clave: lo de hoy). */
export function conEstiloGlifos(m: MenuInferior, estilo: EstiloGlifos | null): MenuInferior {
  const style = { ...m.style };
  delete style.iconStyle;
  const limpio = leerEstiloGlifos(estilo);
  return { ...m, style: limpio ? { ...style, iconStyle: limpio } : style };
}

/**
 * Peso propio de un botón («Propio» en su tarjeta). Con peso, el estilo general pasa a «Propio por
 * botón» para que se vea; `null` vuelve a «Igual que todos» en ese botón.
 */
export function conPesoPropio(m: MenuInferior, id: string, peso: PesoGlifo | null): MenuInferior {
  const items = m.items.map((b) => {
    if (b.id !== id || !b.glyph) return b;
    const ref: RefGlifo = { set: 'phosphor', name: b.glyph.name };
    return { ...b, glyph: peso ? { ...ref, weight: peso } : ref };
  });
  const siguiente = { ...m, items };
  if (!peso || m.style.iconStyle?.scope === 'item') return siguiente;
  return conEstiloGlifos(siguiente, estiloConCambio(m.style.iconStyle, { scope: 'item' }) ?? { scope: 'item' });
}

/** ¿El peso del botón es propio (se ve con «Propio por botón»)? */
export function pesoPropioBoton(m: MenuInferior, b: BotonMenu): PesoGlifo | null {
  return b.glyph?.weight && (m.style.iconStyle?.scope === 'item' || !m.style.iconStyle?.weight) ? b.glyph.weight : null;
}

/** Los pesos que ofrece «Propio» (las cuatro tarjetas del estilo). */
export const PESOS_PROPIOS: readonly PesoGlifo[] = ['regular', 'fill', 'duotone', 'bold'];

/** `true` si el valor es un peso de Phosphor. */
export function esPesoGlifo(v: unknown): v is PesoGlifo {
  return typeof v === 'string' && (PESOS_GLIFO as readonly string[]).includes(v);
}
