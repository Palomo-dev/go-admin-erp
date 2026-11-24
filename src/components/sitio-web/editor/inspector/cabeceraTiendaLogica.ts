/**
 * Cambios de las vistas «Encabezado › Íconos», «Selector de moneda», «Carrito» y «Favoritos»
 * (Figma 2754:59674, 2757:60344, 2754:60110, 2773:62797 y 2772:62317). Lógica pura: arma el
 * cambio de ajustes que el editor escribe en el documento V2
 * (`shell.header.opciones.header_iconos | header_moneda | header_carrito | header_favoritos`) o,
 * en un sitio sin borrador, en la fila legacy. Nada se escribe al abrir: sin cambios, la tienda no cambia.
 *
 * Lectura y defaults: `@/lib/website/v2/cabeceraTienda` (el mismo archivo que lee la tienda).
 */
import {
  CLAVES_LINEAS_BENEFICIOS,
  ESTILOS_ICONOS_NUEVOS,
  LARGO_BOTON_CUENTA,
  LARGO_LINEA_BENEFICIO,
  LARGO_TEXTO_ICONO,
  LARGO_TITULO_BENEFICIOS,
  LARGO_TEXTO_REGLA_BOTON,
  LARGO_TITULO_CUENTA,
  LARGO_TEXTOS_FAVORITOS,
  MAX_TEXTOS_BOTON_CARRITO,
  REGLAS_BOTON_CARRITO,
  TEXTOS_REGLAS_BOTON_CARRITO,
  segundosValidos,
  textosBotonLimpios,
  type BotonCarrito,
  type ClaveLineaBeneficio,
  type ClaveTextoRegla,
  type EstiloIconos,
  type FormaIcono,
  type IconoCabecera,
  type IconoConTexto,
  type IconosEnCelular,
  type TrazoUnificado,
  type ModoBotonCarrito,
  type TextoFavoritos,
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

/**
 * Trazo único (Figma decisiones 2830:85479). Fino y Normal guardan el grosor en
 * `header_iconos.trazo` y dejan `header_icons_weight` en contorno; Relleno escribe
 * `header_icons_weight` = relleno y limpia el grosor. Elegir uno limpia el otro.
 */
export function cambioTrazoUnificado(a: Ajustes, trazo: TrazoUnificado): Ajustes {
  if (trazo === 'relleno') {
    const conGrosor = objeto(a.header_iconos)?.trazo !== undefined;
    return { ...(conGrosor ? cambioIconos(a, { trazo: null }) : {}), header_icons_weight: 'relleno' };
  }
  return { ...cambioIconos(a, { trazo }), header_icons_weight: 'contorno' };
}

/** Forma en el celular. «Automático» (lo de hoy) no se guarda. */
export function cambioIconosEnCelular(a: Ajustes, movil: IconosEnCelular): Ajustes {
  return cambioIconos(a, { movil: movil === 'auto' ? null : movil });
}

/** Forma propia de un ícono; `null` = «Volver a como los demás». */
export function cambioFormaIcono(a: Ajustes, icono: IconoCabecera, forma: FormaIcono | null): Ajustes {
  const actual = { ...(objeto(objeto(a.header_iconos)?.por_icono) ?? {}) };
  actual[icono] = forma ? { estilo: forma } : null;
  return cambioIconos(a, { por_icono: actual });
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

/**
 * Columnas legacy del botón (`fixed` usa el primer texto: el fijo va primero). La fila solo sabe
 * de fijo y dinámico; los modos nuevos (que un sitio sin borrador no puede elegir) van a dinámico.
 */
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
 * Forma que se guarda del botón: modo y textos limpios, y solo los campos que el modo usa o que ya
 * traía (se conservan al cambiar de modo para no perder lo escrito). Los textos se guardan sin
 * recortar del todo: la tienda recorta al leer y así el campo no se come el espacio que se escribe.
 */
export function botonGuardable(boton: BotonCarrito): Record<string, unknown> {
  const guardar: Record<string, unknown> = { modo: boton.modo, textos: textosBotonLimpios(boton.textos) };
  if (boton.orden) guardar.orden = boton.orden;
  if (boton.texto && boton.texto.trim()) guardar.texto = boton.texto.slice(0, 30);
  const segundos = segundosValidos(boton.segundos);
  if (segundos !== null) guardar.segundos = segundos;
  if (boton.transicion) guardar.transicion = boton.transicion;
  if (typeof boton.pausar === 'boolean') guardar.pausar = boton.pausar;
  if (boton.reglas) {
    const reglas: Record<string, string> = {};
    for (const clave of [...REGLAS_BOTON_CARRITO, 'porDefecto'] as const) {
      const v = boton.reglas[clave];
      if (typeof v === 'string') reglas[clave] = v.slice(0, LARGO_TEXTO_REGLA_BOTON);
    }
    if (Object.keys(reglas).length > 0) guardar.reglas = reglas;
  }
  return guardar;
}

/**
 * Botón principal del carrito. En el borrador V2 va a `header_carrito.boton` (la fila legacy
 * queda como respaldo, sin tocar). En un sitio sin borrador, a las columnas de siempre
 * (`cart_button_mode` / `cart_button_texts`), que son las que ese sitio lee.
 */
export function cambioBotonCarrito(a: Ajustes, boton: BotonCarrito, enBorrador: boolean): Ajustes {
  const cambio = cambioCarrito(a, { boton: botonGuardable(boton) });
  return enBorrador ? cambio : { ...cambio, ...columnasLegacyBoton(boton) };
}

/** Los modos nuevos solo los lee el documento V2: un sitio sin borrador elige entre fijo y al abrir. */
export function modoDisponible(modo: ModoBotonCarrito, enBorrador: boolean): boolean {
  return enBorrador || modo === 'fijo' || modo === 'al_abrir';
}

/**
 * Pasa el botón a otro modo. «Al abrir» arranca al azar; «Según el carrito» escribe los textos de
 * sus reglas (los por defecto) para que se vean en los campos y se puedan vaciar (vacío = saltar).
 */
export function botonEnModo(boton: BotonCarrito, modo: ModoBotonCarrito): BotonCarrito {
  const siguiente: BotonCarrito = { ...boton, modo };
  if (modo === 'al_abrir' && !siguiente.orden) siguiente.orden = 'azar';
  if (modo === 'segun_carrito') {
    const reglas: Partial<Record<ClaveTextoRegla, string>> = { ...(boton.reglas ?? {}) };
    for (const clave of [...REGLAS_BOTON_CARRITO, 'porDefecto'] as const) {
      if (typeof reglas[clave] !== 'string') reglas[clave] = TEXTOS_REGLAS_BOTON_CARRITO[clave];
    }
    siguiente.reglas = reglas;
  }
  return siguiente;
}

/**
 * «Usar lo mismo en «Comprar» del carrito completo» (Figma 2777:64932). Encendido (por defecto) no
 * se guarda; al apagarlo, el botón de la página arranca como copia del del cajón.
 */
export function cambioUsarEnPagina(a: Ajustes, usar: boolean, botonCajon: BotonCarrito): Ajustes {
  if (usar) return cambioCarrito(a, { usarEnPagina: null });
  const actual = objeto(objeto(a.header_carrito)?.botonPagina);
  return cambioCarrito(a, { usarEnPagina: false, botonPagina: actual ?? botonGuardable(botonCajon) });
}

/** Botón propio de la página /carrito (con «Usar lo mismo» apagado). */
export function cambioBotonPagina(a: Ajustes, boton: BotonCarrito): Ajustes {
  return cambioCarrito(a, { botonPagina: botonGuardable(boton) });
}

/** Mueve un texto de la lista (arrastrar para ordenar). */
export function moverTexto(lista: readonly string[], desde: number, hasta: number): string[] {
  const copia = [...lista];
  if (desde < 0 || desde >= copia.length || hasta < 0 || hasta >= copia.length) return copia;
  const [item] = copia.splice(desde, 1);
  copia.splice(hasta, 0, item);
  return copia;
}

// ─── Favoritos ──────────────────────────────────────────────────────────────────────────────

export function cambioFavoritos(a: Ajustes, parte: Record<string, unknown>): Ajustes {
  return mezclar(a, 'header_favoritos', parte);
}

/** Texto propio de favoritos. Vacío = el texto por defecto (el gris del campo). */
export function cambioTextoFavoritos(a: Ajustes, clave: TextoFavoritos, texto: string | null): Ajustes {
  const textos = { ...(objeto(objeto(a.header_favoritos)?.textos) ?? {}) };
  textos[clave] = texto === null || texto.trim() === '' ? null : texto.slice(0, LARGO_TEXTOS_FAVORITOS[clave]);
  return cambioFavoritos(a, { textos });
}

/** «También te puede gustar»: mostrar y de dónde salen. Los valores por defecto no se guardan. */
export function cambioSugerenciasFavoritos(a: Ajustes, parte: { mostrar?: boolean; fuente?: string }): Ajustes {
  const actual = { ...(objeto(objeto(a.header_favoritos)?.sugerencias) ?? {}) };
  if (parte.mostrar !== undefined) actual.mostrar = parte.mostrar ? null : false;
  if (parte.fuente !== undefined) actual.fuente = parte.fuente === 'categorias' ? null : parte.fuente;
  return cambioFavoritos(a, { sugerencias: actual });
}

/** Interruptor de favoritos cuyo valor por defecto es «sí»: encendido no se guarda. */
export function cambioInterruptorFavoritos(a: Ajustes, campo: 'contador' | 'avisoSesion' | 'compartir' | 'corazonTarjetas' | 'corazonFicha', valor: boolean): Ajustes {
  return cambioFavoritos(a, { [campo]: valor ? null : false });
}

// ─── Cuenta ─────────────────────────────────────────────────────────────────────────────────

/** Texto escrito o `null` (vacío = el texto por defecto, que no se guarda). */
const textoOpcional = (v: string | null, max: number): string | null => (v && v.trim() ? v.slice(0, max) : null);

export interface CambioCuenta {
  modo?: string;
  titulo?: string | null;
  boton?: string | null;
  beneficios?: boolean;
  ventanaDestino?: string;
  despues?: string;
  /** «Con tu cuenta puedes» propio (Figma E-A1 2839:69662). */
  beneficiosTitulo?: string | null;
  /** Líneas de los beneficios: `beneficio1`, `beneficio2`, `beneficio3`. */
  lineas?: Partial<Record<ClaveLineaBeneficio, string | null>>;
  /** Texto del ícono con sesión («Hola, {nombre}»). */
  textoSesion?: string | null;
}

/**
 * Opciones de «Al tocar el ícono de cuenta» (`header_cuenta`, Figma 2839:69662). Los valores por
 * defecto no se guardan: «Página», el título y el botón de siempre, beneficios encendidos y con
 * sus textos de siempre, el panel desde la ventana, quedarse en la página y «Hola, {nombre}».
 */
export function cambioCuenta(a: Ajustes, parte: CambioCuenta): Ajustes {
  const limpio: Record<string, unknown> = {};
  if (parte.beneficiosTitulo !== undefined) limpio.beneficiosTitulo = textoOpcional(parte.beneficiosTitulo, LARGO_TITULO_BENEFICIOS);
  for (const k of CLAVES_LINEAS_BENEFICIOS) {
    const v = parte.lineas?.[k];
    if (v !== undefined) limpio[k] = textoOpcional(v, LARGO_LINEA_BENEFICIO);
  }
  if (parte.textoSesion !== undefined) limpio.textoSesion = textoOpcional(parte.textoSesion, LARGO_TEXTO_ICONO);
  if (parte.modo !== undefined) limpio.modo = parte.modo === 'pagina' ? null : parte.modo;
  if (parte.titulo !== undefined) limpio.titulo = parte.titulo && parte.titulo.trim() ? parte.titulo.slice(0, LARGO_TITULO_CUENTA) : null;
  if (parte.boton !== undefined) limpio.boton = parte.boton && parte.boton.trim() ? parte.boton.slice(0, LARGO_BOTON_CUENTA) : null;
  if (parte.beneficios !== undefined) limpio.beneficios = parte.beneficios ? null : false;
  if (parte.ventanaDestino !== undefined) limpio.ventanaDestino = parte.ventanaDestino === 'panel' ? null : parte.ventanaDestino;
  if (parte.despues !== undefined) limpio.despues = parte.despues === 'quedarse' ? null : parte.despues;
  return mezclar(a, 'header_cuenta', limpio);
}
