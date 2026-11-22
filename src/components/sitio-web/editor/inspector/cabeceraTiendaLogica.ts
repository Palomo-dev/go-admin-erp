/**
 * Cambios de las vistas «Encabezado › Íconos», «Selector de moneda» y «Carrito» (Figma 2754:59674,
 * 2757:60344 y 2754:60110). Lógica pura: arma el cambio de ajustes que el editor escribe en el
 * documento V2 (`shell.header.opciones.header_iconos | header_moneda | header_carrito`) o, en un
 * sitio sin borrador, en la fila legacy. Nada se escribe al abrir: sin cambios, la tienda no cambia.
 *
 * Lectura y defaults: `@/lib/website/v2/cabeceraTienda` (el mismo archivo que lee la tienda).
 */
import {
  ESTILOS_ICONOS_NUEVOS,
  MAX_TEXTOS_BOTON_CARRITO,
  textosBotonLimpios,
  type BotonCarrito,
  type EstiloIconos,
  type IconoConTexto,
} from '@/lib/website/v2/cabeceraTienda';
import { cambioForma } from './encabezadoCapacidades';

type Ajustes = Record<string, unknown>;

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Quita `null`, `undefined` y objetos vacíos (así un valor «como hoy» no se guarda). */
function limpiar(o: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) continue;
    const hijo = objeto(v);
    if (hijo) {
      const limpio = limpiar(hijo);
      if (Object.keys(limpio).length > 0) salida[k] = limpio;
      continue;
    }
    salida[k] = v;
  }
  return salida;
}

/** Mezcla `parte` en el objeto guardado de `clave`. Vacío = `null` (la tienda de hoy). */
function mezclar(a: Ajustes, clave: string, parte: Record<string, unknown>): Ajustes {
  const actual = objeto(a[clave]) ?? {};
  const siguiente = limpiar({ ...actual, ...parte });
  return { [clave]: Object.keys(siguiente).length > 0 ? siguiente : null };
}

// ─── Íconos ─────────────────────────────────────────────────────────────────────────────────

export function cambioIconos(a: Ajustes, parte: Record<string, unknown>): Ajustes {
  return mezclar(a, 'header_iconos', parte);
}

/**
 * Estilo de los íconos. «Solo ícono» y «Círculo» reutilizan lo que ya existía (círculo de acento
 * o caja de íconos, `cambioForma`) y quitan el estilo nuevo; los demás se guardan en
 * `header_iconos.estilo`.
 */
export function cambioEstiloIconos(a: Ajustes, estilo: EstiloIconos): Ajustes {
  if ((ESTILOS_ICONOS_NUEVOS as readonly string[]).includes(estilo)) return cambioIconos(a, { estilo });
  return { ...cambioIconos(a, { estilo: null }), ...cambioForma(a, estilo === 'circulo' ? 'circle' : 'none') };
}

/** Texto propio de un ícono. Vacío = el texto por defecto. */
export function cambioTextoIcono(a: Ajustes, icono: IconoConTexto, texto: string): Ajustes {
  const textos = { ...(objeto(objeto(a.header_iconos)?.textos) ?? {}) };
  const limpio = texto.trim() === '' ? null : texto.slice(0, 24);
  textos[icono] = limpio;
  return cambioIconos(a, { textos });
}

// ─── Moneda ─────────────────────────────────────────────────────────────────────────────────

export function cambioMoneda(a: Ajustes, parte: Record<string, unknown>): Ajustes {
  return mezclar(a, 'header_moneda', parte);
}

/**
 * Marca o desmarca una moneda visible. La base siempre se ve (no se desmarca). Si quedan
 * marcadas todas las disponibles, se guarda «todas» (`null`): así una moneda nueva en la tienda
 * aparece sola, como hoy.
 */
export function cambioMonedaVisible(a: Ajustes, codigo: string, visible: boolean, disponibles: readonly string[], base: string): Ajustes {
  const b = base.toUpperCase();
  const actuales = Array.isArray(objeto(a.header_moneda)?.visibles)
    ? ((objeto(a.header_moneda)?.visibles as unknown[]).filter((c) => typeof c === 'string') as string[]).map((c) => c.toUpperCase())
    : disponibles.map((c) => c.toUpperCase());
  const c = codigo.toUpperCase();
  if (c === b) return {};
  const conjunto = new Set(actuales);
  if (visible) conjunto.add(c);
  else conjunto.delete(c);
  conjunto.add(b);
  const todas = disponibles.every((d) => conjunto.has(d.toUpperCase()));
  const lista = disponibles.map((d) => d.toUpperCase()).filter((d) => conjunto.has(d));
  return cambioMoneda(a, { visibles: todas ? null : lista });
}

// ─── Carrito ────────────────────────────────────────────────────────────────────────────────

export function cambioCarrito(a: Ajustes, parte: Record<string, unknown>): Ajustes {
  return mezclar(a, 'header_carrito', parte);
}

/** Columnas legacy del botón (`fixed` usa el primer texto: el fijo va primero). */
export function columnasLegacyBoton(boton: BotonCarrito): { cart_button_mode: 'fixed' | 'dynamic'; cart_button_texts: string[] } {
  const textos = textosBotonLimpios(boton.textos);
  if (boton.modo === 'fijo') {
    const primero = (boton.texto ?? '').trim().replace(/\s+/g, ' ').slice(0, 30) || textos[0];
    const resto = textos.filter((t) => t.toLowerCase() !== (primero ?? '').toLowerCase());
    return { cart_button_mode: 'fixed', cart_button_texts: primero ? [primero, ...resto].slice(0, MAX_TEXTOS_BOTON_CARRITO) : textos };
  }
  return { cart_button_mode: 'dynamic', cart_button_texts: textos };
}

/**
 * Botón principal del carrito. En el borrador V2 va a `header_carrito.boton` (la fila legacy
 * queda como respaldo, sin tocar). En un sitio sin borrador, a las columnas de siempre
 * (`cart_button_mode` / `cart_button_texts`), que son las que ese sitio lee.
 */
export function cambioBotonCarrito(a: Ajustes, boton: BotonCarrito, enBorrador: boolean): Ajustes {
  const guardar: Record<string, unknown> = { modo: boton.modo, textos: textosBotonLimpios(boton.textos) };
  if (boton.orden) guardar.orden = boton.orden;
  // Sin recortar: la tienda recorta al leer y así el campo no se come el espacio que se escribe.
  if (boton.texto && boton.texto.trim()) guardar.texto = boton.texto.slice(0, 30);
  const cambio = cambioCarrito(a, { boton: guardar });
  return enBorrador ? cambio : { ...cambio, ...columnasLegacyBoton(boton) };
}

/** Mueve un texto de la lista (arrastrar para ordenar). */
export function moverTexto(lista: readonly string[], desde: number, hasta: number): string[] {
  const copia = [...lista];
  if (desde < 0 || desde >= copia.length || hasta < 0 || hasta >= copia.length) return copia;
  const [item] = copia.splice(desde, 1);
  copia.splice(hasta, 0, item);
  return copia;
}
