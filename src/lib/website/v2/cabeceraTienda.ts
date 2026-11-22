/**
 * Cabecera de la tienda: íconos, selector de moneda y cajón del carrito (Figma «16 Sitio web»,
 * sección 2747:57859, aprobada el 2026-11-22).
 *
 * Tres opciones nuevas del documento V2, cada una un objeto en `shell.header.opciones`
 * (OPCIONES_SHELL de mapeoAjustes.ts, sin columna en `website_settings`, ADR-002):
 * - `header_iconos`: estilo, tamaño, trazo, textos propios, contador del carrito y favoritos.
 * - `header_moneda`: estilo del selector, flecha, monedas visibles, moneda al entrar y celular.
 * - `header_carrito`: botón principal, enlace secundario, «Seguir comprando», título y envío gratis.
 *
 * La regla de siempre: sin la clave (o con un valor que no cumple), la tienda se ve como hoy.
 * Por eso cada lector devuelve el default de hoy y `configurado` dice si hay algo nuevo; quien
 * pinta sigue el camino viejo cuando no lo hay.
 *
 * Lo que ya existía se conserva y se reutiliza: «Solo ícono» y «Círculo» salen de
 * `header_icons_circle` / `header_icons_box` (no se guardan en `header_iconos.estilo`); el botón
 * del carrito lee `cart_button_mode` / `cart_button_texts` de la fila legacy cuando el documento
 * no trae `header_carrito.boton`.
 *
 * Código puro: lo usan el editor (ERP), la tienda y sus pruebas. goadmin-websites guarda una copia
 * IDÉNTICA en `lib/website/v2/cabeceraTienda.ts` (`npm run verify:copias` allá compara las dos).
 */

type Ajustes = Record<string, unknown> | null | undefined;

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const unoDe = <T extends string>(lista: readonly T[], v: unknown): T | null =>
  typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : null;

/** Texto recortado y con espacios simples; `null` si queda vacío o pasa de `max`. */
export function textoCorto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const limpio = v.trim().replace(/\s+/g, ' ');
  if (!limpio) return null;
  return limpio.length <= max ? limpio : limpio.slice(0, max).trimEnd();
}

// ─── Íconos ─────────────────────────────────────────────────────────────────────────────────

/**
 * Estilos que guarda `header_iconos.estilo`. «Solo ícono» y «Círculo» NO se guardan aquí: salen
 * del círculo de acento / la caja de íconos que ya tenía el sitio ({@link estiloIconosEfectivo}).
 * - `texto`: ícono con el texto debajo · `texto_lado`: ícono con el texto al lado, sin marco
 * - `pildora`: píldora con borde · `relleno`: botón relleno del color de la marca
 */
export const ESTILOS_ICONOS_NUEVOS = ['texto', 'texto_lado', 'pildora', 'relleno'] as const;
export type EstiloIconoNuevo = (typeof ESTILOS_ICONOS_NUEVOS)[number];
/** Los cinco estilos del editor (y `texto_lado`, variante de «Con texto»). */
export const ESTILOS_ICONOS = ['icono', 'texto', 'texto_lado', 'pildora', 'relleno', 'circulo'] as const;
export type EstiloIconos = (typeof ESTILOS_ICONOS)[number];

export const TAMANOS_ICONOS = ['s', 'm', 'l'] as const;
export type TamanoIcono = (typeof TAMANOS_ICONOS)[number];
/** Glifo en px (Figma: S 18 · M 22 · L 26). Sin tamaño, el de hoy (24 px o el de la caja). */
export const PX_TAMANO_ICONO: Readonly<Record<TamanoIcono, number>> = { s: 18, m: 22, l: 26 };

export const TRAZOS_ICONOS = ['fino', 'normal'] as const;
export type TrazoIcono = (typeof TRAZOS_ICONOS)[number];
/** Grosor del trazo (Figma: fino 1,5 · normal 2). Sin trazo, el de hoy. */
export const ANCHO_TRAZO_ICONO: Readonly<Record<TrazoIcono, number>> = { fino: 1.5, normal: 2 };

/** Contador del carrito: número (hoy), punto o ninguno. */
export const CONTADORES_CARRITO = ['numero', 'punto', 'oculto'] as const;
export type ContadorCarrito = (typeof CONTADORES_CARRITO)[number];

/** Íconos con texto propio. La moneda, sin texto propio, muestra el código («COP»). */
export const ICONOS_CON_TEXTO = ['cuenta', 'carrito', 'favoritos', 'moneda'] as const;
export type IconoConTexto = (typeof ICONOS_CON_TEXTO)[number];
export const TEXTOS_ICONOS_POR_DEFECTO: Readonly<Record<Exclude<IconoConTexto, 'moneda'>, string>> = {
  cuenta: 'Mi cuenta',
  carrito: 'Carrito',
  favoritos: 'Favoritos',
};
export const LARGO_TEXTO_ICONO = 24;

export interface OpcionesIconos {
  /** `true` si `header_iconos` trae al menos una opción válida. `false` = la cabecera de hoy. */
  configurado: boolean;
  estilo: EstiloIconos;
  /** `null` = el tamaño de hoy. */
  tamano: TamanoIcono | null;
  /** `null` = el trazo de hoy (contorno 2, relleno 1,25). */
  trazo: TrazoIcono | null;
  /** Texto visible junto al ícono (solo en los estilos con texto). */
  mostrarTexto: boolean;
  textos: Partial<Record<IconoConTexto, string>>;
  contador: ContadorCarrito;
  /** Ícono de favoritos en la cabecera (la tienda lo pinta solo si tiene favoritos). */
  favoritos: boolean;
}

/**
 * «Solo ícono» o «Círculo» según lo que ya tenía el sitio: el círculo de acento
 * (`header_icons_circle`) o una caja de íconos en forma de círculo (`header_icons_box`).
 */
export function estiloIconosHeredado(ajustes: Ajustes): 'icono' | 'circulo' {
  const a = ajustes ?? {};
  const caja = objeto(a.header_icons_box) ?? objeto(objeto(a.header_builder)?.icon_container);
  if (caja && typeof caja.shape === 'string') return caja.shape === 'circle' ? 'circulo' : 'icono';
  return a.header_icons_circle === true ? 'circulo' : 'icono';
}

/** Estilo efectivo: el nuevo de `header_iconos.estilo` o el que ya tenía el sitio. */
export function estiloIconosEfectivo(ajustes: Ajustes): EstiloIconos {
  const propio = unoDe(ESTILOS_ICONOS_NUEVOS, objeto((ajustes ?? {}).header_iconos)?.estilo);
  return propio ?? estiloIconosHeredado(ajustes);
}

/** El estilo lleva texto visible (con «Mostrar texto»). Solo ícono y Círculo, nunca. */
export function estiloConTexto(estilo: EstiloIconos): boolean {
  return estilo === 'texto' || estilo === 'texto_lado' || estilo === 'pildora' || estilo === 'relleno';
}

/** Dónde va el texto: debajo en «Con texto»; al lado en «Al lado», «Píldora» y «Relleno». */
export function posicionTextoIcono(estilo: EstiloIconos): 'debajo' | 'lado' | null {
  if (estilo === 'texto') return 'debajo';
  return estiloConTexto(estilo) ? 'lado' : null;
}

export function opcionesIconos(ajustes: Ajustes): OpcionesIconos {
  const crudo = objeto((ajustes ?? {}).header_iconos) ?? {};
  const estiloPropio = unoDe(ESTILOS_ICONOS_NUEVOS, crudo.estilo);
  const tamano = unoDe(TAMANOS_ICONOS, crudo.tamano);
  const trazo = unoDe(TRAZOS_ICONOS, crudo.trazo);
  const contador = unoDe(CONTADORES_CARRITO, crudo.contador);
  const mostrar = typeof crudo.mostrarTexto === 'boolean' ? crudo.mostrarTexto : null;
  const favoritos = crudo.favoritos === true;
  const textos: Partial<Record<IconoConTexto, string>> = {};
  const textosCrudos = objeto(crudo.textos) ?? {};
  for (const clave of ICONOS_CON_TEXTO) {
    const t = textoCorto(textosCrudos[clave], LARGO_TEXTO_ICONO);
    if (t) textos[clave] = t;
  }
  const estilo = estiloPropio ?? estiloIconosHeredado(ajustes);
  const configurado =
    estiloPropio !== null || tamano !== null || trazo !== null || contador !== null || mostrar !== null || favoritos || Object.keys(textos).length > 0;
  return {
    configurado,
    estilo,
    tamano,
    trazo,
    // Sin la opción, los estilos con texto lo muestran (por eso se eligen).
    mostrarTexto: estiloConTexto(estilo) && (mostrar ?? true),
    textos,
    contador: contador ?? 'numero',
    favoritos,
  };
}

/** Texto de un ícono: el propio o el de siempre. La moneda, sin texto propio, su código. */
export function textoIcono(op: Pick<OpcionesIconos, 'textos'>, icono: IconoConTexto, codigoMoneda?: string): string {
  const propio = op.textos[icono];
  if (propio) return propio;
  if (icono === 'moneda') return codigoMoneda ?? '';
  return TEXTOS_ICONOS_POR_DEFECTO[icono];
}

/**
 * Lo que pinta el contador del carrito: el número (con «99+»), un punto o nada. Sin unidades,
 * nada (como hoy).
 */
export function contadorCarrito(cantidad: number, contador: ContadorCarrito): { tipo: 'numero'; texto: string } | { tipo: 'punto' } | null {
  if (!(cantidad > 0) || contador === 'oculto') return null;
  if (contador === 'punto') return { tipo: 'punto' };
  return { tipo: 'numero', texto: cantidad > 99 ? '99+' : String(Math.floor(cantidad)) };
}

// ─── Selector de moneda ───────────────────────────────────────────────────────────────────

/**
 * Estilo del selector (Figma B 2749:58324). Sin estilo: el de hoy (globo + código + flecha).
 * `codigo` «COP ⌄» · `bandera` bandera + código en píldora · `simbolo` «$» en círculo + código ·
 * `icono` solo el globo · `segmento` «COP | USD» y «+N» con el resto.
 */
export const ESTILOS_MONEDA = ['codigo', 'bandera', 'simbolo', 'icono', 'segmento'] as const;
export type EstiloMoneda = (typeof ESTILOS_MONEDA)[number];
/**
 * Moneda en el celular. `hoja` = lo de hoy: una fila en el menú que abre la hoja inferior;
 * `lateral` = la lista desplegable dentro del menú; `chips` = chips en el menú; `barra` =
 * bandera (o código) junto al carrito, que abre la hoja.
 */
export const MONEDA_MOVIL = ['hoja', 'lateral', 'chips', 'barra'] as const;
export type MonedaMovil = (typeof MONEDA_MOVIL)[number];
/** Moneda al entrar: la del país del visitante (hoy) o siempre la base. */
export const MONEDA_AL_ENTRAR = ['pais', 'base'] as const;
export type MonedaAlEntrar = (typeof MONEDA_AL_ENTRAR)[number];
export const MAX_MONEDAS_VISIBLES = 20;

export interface OpcionesMoneda {
  configurado: boolean;
  /** `null` = el selector de hoy. */
  estilo: EstiloMoneda | null;
  flecha: boolean;
  /** Códigos visibles; `null` = todas las disponibles (hoy). La base siempre se ve. */
  visibles: string[] | null;
  alEntrar: MonedaAlEntrar;
  movil: MonedaMovil;
}

const CODIGO_MONEDA = /^[A-Z]{3}$/;

export function opcionesMoneda(ajustes: Ajustes): OpcionesMoneda {
  const crudo = objeto((ajustes ?? {}).header_moneda) ?? {};
  const estilo = unoDe(ESTILOS_MONEDA, crudo.estilo);
  const flecha = typeof crudo.flecha === 'boolean' ? crudo.flecha : null;
  const alEntrar = unoDe(MONEDA_AL_ENTRAR, crudo.alEntrar);
  const movil = unoDe(MONEDA_MOVIL, crudo.movil);
  let visibles: string[] | null = null;
  if (Array.isArray(crudo.visibles)) {
    const codigos = crudo.visibles
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => CODIGO_MONEDA.test(c));
    const unicos = Array.from(new Set(codigos)).slice(0, MAX_MONEDAS_VISIBLES);
    if (unicos.length > 0) visibles = unicos;
  }
  return {
    configurado: estilo !== null || flecha !== null || alEntrar !== null || movil !== null || visibles !== null,
    estilo,
    flecha: flecha ?? true,
    visibles,
    alEntrar: alEntrar ?? 'pais',
    movil: movil ?? 'hoja',
  };
}

/**
 * Monedas que ve el cliente: la base primero y las demás por código. Con `visibles`, solo esas
 * (la base siempre, aunque no esté marcada). No muta la lista.
 */
export function monedasVisibles<T extends { code: string }>(disponibles: readonly T[], visibles: readonly string[] | null, base: string): T[] {
  const b = (base || '').toUpperCase();
  const permitidas = visibles ? new Set(visibles.map((c) => c.toUpperCase())) : null;
  return disponibles
    .filter((m) => !permitidas || permitidas.has(m.code.toUpperCase()) || m.code.toUpperCase() === b)
    .slice()
    .sort((x, y) => {
      const xb = x.code.toUpperCase() === b;
      const yb = y.code.toUpperCase() === b;
      if (xb !== yb) return xb ? -1 : 1;
      return x.code.localeCompare(y.code, 'es');
    });
}

/**
 * Moneda con la que arranca la visita (sin elección guardada): la del país si está visible y
 * `alEntrar` es `pais`; si no, la base («si el país no tiene moneda visible, se usa la base»).
 */
export function monedaInicial(detectada: string | null, base: string, op: Pick<OpcionesMoneda, 'alEntrar' | 'visibles'>): string {
  if (op.alEntrar === 'base' || !detectada) return base;
  const d = detectada.toUpperCase();
  if (op.visibles && d !== base.toUpperCase() && !op.visibles.includes(d)) return base;
  return d;
}

/** Una elección guardada que ya no está visible vuelve a la base. */
export function monedaPermitida(codigo: string, base: string, visibles: readonly string[] | null): boolean {
  const c = codigo.toUpperCase();
  return !visibles || c === base.toUpperCase() || visibles.includes(c);
}

/**
 * «Segmento»: hasta `max` monedas a la vista (la base y la elegida siempre) y el resto en el
 * menú «+N».
 */
export function segmentoMonedas<T extends { code: string }>(lista: readonly T[], actual: string, max = 2): { vista: T[]; resto: T[] } {
  if (lista.length <= max) return { vista: [...lista], resto: [] };
  const vista = lista.slice(0, max);
  const elegida = lista.find((m) => m.code === actual);
  if (elegida && !vista.includes(elegida)) vista[vista.length - 1] = elegida;
  return { vista, resto: lista.filter((m) => !vista.includes(m)) };
}

export interface DatosMoneda {
  nombre: string;
  simbolo: string;
  /** País de la bandera (ISO 3166-1 alfa-2; `EU` para el euro). `null` = sin bandera: el código. */
  bandera: string | null;
}

/** Nombre, símbolo y bandera de las monedas que ofrece la tienda (tabla `countries` activa). */
export const CATALOGO_MONEDAS: Readonly<Record<string, DatosMoneda>> = {
  COP: { nombre: 'Peso colombiano', simbolo: '$', bandera: 'CO' },
  USD: { nombre: 'Dólar estadounidense', simbolo: '$', bandera: 'US' },
  EUR: { nombre: 'Euro', simbolo: '€', bandera: 'EU' },
  MXN: { nombre: 'Peso mexicano', simbolo: '$', bandera: 'MX' },
  PEN: { nombre: 'Sol peruano', simbolo: 'S/', bandera: 'PE' },
  BRL: { nombre: 'Real brasileño', simbolo: 'R$', bandera: 'BR' },
  CLP: { nombre: 'Peso chileno', simbolo: '$', bandera: 'CL' },
  ARS: { nombre: 'Peso argentino', simbolo: '$', bandera: 'AR' },
  CAD: { nombre: 'Dólar canadiense', simbolo: '$', bandera: 'CA' },
  GBP: { nombre: 'Libra esterlina', simbolo: '£', bandera: 'GB' },
  JPY: { nombre: 'Yen japonés', simbolo: '¥', bandera: 'JP' },
  AUD: { nombre: 'Dólar australiano', simbolo: '$', bandera: 'AU' },
};

export function datosMoneda(codigo: string, respaldoNombre?: string | null): DatosMoneda {
  const c = (codigo || '').toUpperCase();
  return CATALOGO_MONEDAS[c] ?? { nombre: respaldoNombre || c, simbolo: '$', bandera: null };
}

// ─── Cajón del carrito ─────────────────────────────────────────────────────────────────────

/**
 * Cómo elige su texto el botón principal. Forma extensible (decisión del dueño, 2026-11-22):
 * vendrán «cada N segundos» y quizá «según el carrito» sin migrar lo guardado.
 * - `fijo`: siempre `texto` (vacío = el primero de la lista o «Comprar ahora»).
 * - `al_abrir`: uno de `textos` cada vez que se abre el carrito (hoy, al azar).
 */
export const MODOS_BOTON_CARRITO = ['fijo', 'al_abrir'] as const;
export type ModoBotonCarrito = (typeof MODOS_BOTON_CARRITO)[number];
/** `orden` se acepta y se conserva; por ahora la tienda elige al azar en los dos casos. */
export const ORDENES_BOTON_CARRITO = ['azar', 'orden'] as const;
export type OrdenBotonCarrito = (typeof ORDENES_BOTON_CARRITO)[number];

/** Los textos de hoy: default de la columna `cart_button_texts` (verificado por MCP 2026-11-22). */
export const TEXTOS_BOTON_CARRITO_HOY: readonly string[] = ['Comprar Ahora', 'Aprovechar Oferta', 'Obtener Descuento', 'Comprar con Descuento'];
export const TEXTO_BOTON_CARRITO_FIJO = 'Comprar ahora';
export const MAX_TEXTOS_BOTON_CARRITO = 8;
export const LARGO_TEXTO_BOTON_CARRITO = 30;

export interface BotonCarrito {
  modo: ModoBotonCarrito;
  textos: string[];
  orden?: OrdenBotonCarrito;
  /** Texto del modo `fijo`. */
  texto?: string;
}

export const ESTILOS_ENLACE_CARRITO = ['borde', 'enlace'] as const;
export type EstiloEnlaceCarrito = (typeof ESTILOS_ENLACE_CARRITO)[number];

export interface OpcionesCarrito {
  configurado: boolean;
  boton: BotonCarrito;
  /** «Ver carrito completo»: botón con borde (hoy) o enlace. */
  enlace: { mostrar: boolean; texto: string; estilo: EstiloEnlaceCarrito };
  seguirComprando: string;
  titulo: string;
  envioGratis: { barra: boolean; mensaje: string; logrado: string };
}

/** Marcador del monto que falta en el mensaje de envío gratis. */
export const MARCADOR_MONTO = '{monto}';

/** Lo que la tienda pinta sin configuración (textos de hoy). */
export const CARRITO_HOY: Readonly<Omit<OpcionesCarrito, 'configurado' | 'boton'>> = {
  enlace: { mostrar: true, texto: 'Ver carrito completo', estilo: 'borde' },
  seguirComprando: 'Continuar Comprando',
  titulo: 'Tu Carrito',
  envioGratis: {
    barra: true,
    mensaje: '¡Te faltan {monto} para envío gratis!',
    logrado: '¡Listo! Tu pedido tiene envío gratis',
  },
};

const LARGO_TEXTO_CARRITO = 60;
const LARGO_MENSAJE_ENVIO = 120;

/** Lista de textos del botón: recortados, sin vacíos ni repetidos (sin importar mayúsculas), hasta 8. */
export function textosBotonLimpios(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const v of lista) {
    const t = textoCorto(v, LARGO_TEXTO_BOTON_CARRITO);
    if (!t || vistos.has(t.toLowerCase())) continue;
    vistos.add(t.toLowerCase());
    salida.push(t);
    if (salida.length >= MAX_TEXTOS_BOTON_CARRITO) break;
  }
  return salida;
}

/** Botón desde las columnas legacy (`dynamic` | `fixed` y la lista): lo que la tienda hace hoy. */
export function botonCarritoDesdeLegacy(modo: unknown, textos: unknown): BotonCarrito {
  const lista = textosBotonLimpios(textos);
  return {
    modo: modo === 'fixed' ? 'fijo' : 'al_abrir',
    textos: lista.length > 0 ? lista : [...TEXTOS_BOTON_CARRITO_HOY],
    orden: 'azar',
  };
}

/** Botón del documento (`header_carrito.boton`); `null` si no hay uno válido. */
export function botonCarritoDelDocumento(valor: unknown): BotonCarrito | null {
  const b = objeto(valor);
  if (!b) return null;
  const modo = unoDe(MODOS_BOTON_CARRITO, b.modo);
  if (!modo) return null;
  const textos = textosBotonLimpios(b.textos);
  const boton: BotonCarrito = { modo, textos: textos.length > 0 ? textos : [...TEXTOS_BOTON_CARRITO_HOY] };
  const orden = unoDe(ORDENES_BOTON_CARRITO, b.orden);
  if (orden) boton.orden = orden;
  const texto = textoCorto(b.texto, LARGO_TEXTO_BOTON_CARRITO);
  if (texto) boton.texto = texto;
  return boton;
}

/**
 * Opciones del cajón. El botón sale del documento; si no trae uno, de la fila legacy
 * (`cart_button_mode` / `cart_button_texts`), para no perder lo que cada tienda ya configuró.
 */
export function opcionesCarrito(ajustes: Ajustes): OpcionesCarrito {
  const a = ajustes ?? {};
  const crudo = objeto(a.header_carrito) ?? {};
  const botonDoc = botonCarritoDelDocumento(crudo.boton);
  const enlace = objeto(crudo.enlace) ?? {};
  const envio = objeto(crudo.envioGratis) ?? {};
  const seguir = textoCorto(crudo.seguirComprando, LARGO_TEXTO_CARRITO);
  const titulo = textoCorto(crudo.titulo, LARGO_TEXTO_CARRITO);
  const enlaceMostrar = typeof enlace.mostrar === 'boolean' ? enlace.mostrar : null;
  const enlaceTexto = textoCorto(enlace.texto, LARGO_TEXTO_CARRITO);
  const enlaceEstilo = unoDe(ESTILOS_ENLACE_CARRITO, enlace.estilo);
  const barra = typeof envio.barra === 'boolean' ? envio.barra : null;
  const mensaje = textoCorto(envio.mensaje, LARGO_MENSAJE_ENVIO);
  const logrado = textoCorto(envio.logrado, LARGO_MENSAJE_ENVIO);
  return {
    configurado:
      botonDoc !== null || seguir !== null || titulo !== null || enlaceMostrar !== null || enlaceTexto !== null ||
      enlaceEstilo !== null || barra !== null || mensaje !== null || logrado !== null,
    boton: botonDoc ?? botonCarritoDesdeLegacy(a.cart_button_mode, a.cart_button_texts),
    enlace: {
      mostrar: enlaceMostrar ?? CARRITO_HOY.enlace.mostrar,
      texto: enlaceTexto ?? CARRITO_HOY.enlace.texto,
      estilo: enlaceEstilo ?? CARRITO_HOY.enlace.estilo,
    },
    seguirComprando: seguir ?? CARRITO_HOY.seguirComprando,
    titulo: titulo ?? CARRITO_HOY.titulo,
    envioGratis: {
      barra: barra ?? CARRITO_HOY.envioGratis.barra,
      mensaje: mensaje ?? CARRITO_HOY.envioGratis.mensaje,
      logrado: logrado ?? CARRITO_HOY.envioGratis.logrado,
    },
  };
}

/**
 * Texto del botón principal. `fijo`: el escrito, o el primero de la lista, o «Comprar ahora».
 * `al_abrir`: uno de la lista; se llama una vez cada vez que se abre el carrito y se queda
 * mientras esté abierto (decisión del dueño). `azar` es inyectable para las pruebas.
 */
export function textoBotonCarrito(boton: BotonCarrito, azar: () => number = Math.random): string {
  const lista = boton.textos.length > 0 ? boton.textos : TEXTOS_BOTON_CARRITO_HOY;
  if (boton.modo === 'fijo') return boton.texto || lista[0] || TEXTO_BOTON_CARRITO_FIJO;
  const i = Math.min(lista.length - 1, Math.max(0, Math.floor(azar() * lista.length)));
  return lista[i] || TEXTO_BOTON_CARRITO_FIJO;
}

/**
 * Parte el mensaje de envío gratis alrededor de `{monto}` para pintar el monto con su formato
 * (moneda del visitante). Sin el marcador, el monto va al final.
 */
export function partirMensajeMonto(plantilla: string): { antes: string; despues: string } {
  const i = plantilla.indexOf(MARCADOR_MONTO);
  if (i < 0) return { antes: `${plantilla.trimEnd()} `, despues: '' };
  return { antes: plantilla.slice(0, i), despues: plantilla.slice(i + MARCADOR_MONTO.length).split(MARCADOR_MONTO).join('') };
}

/** Mensaje con el monto ya formateado (vista previa del editor, pruebas). */
export function mensajeEnvioGratis(plantilla: string, monto: string): string {
  const { antes, despues } = partirMensajeMonto(plantilla);
  return `${antes}${monto}${despues}`;
}

/** Avance hacia el envío gratis, de 0 a 1. Sin tope (0 o negativo), 0. */
export function avanceEnvioGratis(subtotal: number, tope: number): number {
  if (!(tope > 0)) return 0;
  return Math.max(0, Math.min(1, subtotal / tope));
}
