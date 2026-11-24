/**
 * Cabecera de la tienda: íconos, selector de moneda y cajón del carrito (Figma «16 Sitio web»,
 * sección 2747:57859, aprobada el 2026-11-22).
 *
 * Opciones nuevas del documento V2, cada una un objeto en `shell.header.opciones`
 * (OPCIONES_SHELL de mapeoAjustes.ts, sin columna en `website_settings`, ADR-002):
 * - `header_iconos`: estilo, tamaño, trazo, textos propios, contador del carrito y favoritos.
 * - `header_moneda`: estilo del selector, flecha, monedas visibles, moneda al entrar y celular.
 * - `header_carrito`: botón principal (4 modos), botón «Comprar» de /carrito, enlace secundario,
 *   «Seguir comprando», título, envío gratis y aviso de contraentrega (carrito y ficha).
 * - `header_favoritos`: corazón de la cabecera, panel lateral y página /favoritos (Figma 2762:61067).
 * - `header_cuenta`: qué abre el ícono de cuenta (página, panel, ventana o diálogo) y sus textos
 *   (Figma 2834:68670).
 *
 * Íconos en un solo lugar (Figma 2830:73206): `header_iconos.movil` (forma en el celular) y
 * `header_iconos.por_icono` (forma propia de cada ícono), y el trazo unificado con
 * `header_icons_weight` ({@link trazoUnificado}).
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

/**
 * Los cinco íconos de la cabecera, en el orden de la vista «Íconos» del editor (Figma «16 Sitio
 * web» 2830:73206, aprobado 2026-11-22). Cada uno puede tener su forma propia (`por_icono`).
 */
export const ICONOS_CABECERA = ['buscar', 'favoritos', 'carrito', 'cuenta', 'moneda'] as const;
export type IconoCabecera = (typeof ICONOS_CABECERA)[number];

/**
 * Forma propia de un ícono (`header_iconos.por_icono[icono].estilo`): las del menú «Forma»
 * (Figma A2b 2830:76085). Sin forma propia, «Como los demás» (el estilo general).
 */
export const FORMAS_ICONO = ['icono', 'circulo', 'texto', 'pildora', 'relleno'] as const;
export type FormaIcono = (typeof FORMAS_ICONO)[number];

/**
 * Forma de los íconos en el celular (`header_iconos.movil`, Figma 2831:68365). Solo cambia los
 * estilos que no caben en 390 px (Píldora, Relleno y «texto al lado»). `auto` = lo de hoy: solo
 * ícono o círculo según la caja que ya tiene el sitio.
 */
export const ICONOS_EN_CELULAR = ['auto', 'icono', 'circulo', 'texto'] as const;
export type IconosEnCelular = (typeof ICONOS_EN_CELULAR)[number];

/**
 * Trazo único del editor (Figma decisiones 2830:85479): Fino y Normal son el grosor
 * (`header_iconos.trazo`, con `header_icons_weight` = contorno); Relleno es el glifo relleno de
 * antes (`header_icons_weight` = relleno, sin `trazo`). Al leer, gana relleno.
 */
export const TRAZOS_UNIFICADOS = ['fino', 'normal', 'relleno'] as const;
export type TrazoUnificado = (typeof TRAZOS_UNIFICADOS)[number];

export interface OpcionesIconos {
  /** `true` si `header_iconos` trae al menos una opción válida. `false` = la cabecera de hoy. */
  configurado: boolean;
  estilo: EstiloIconos;
  /** `null` = el tamaño de hoy. */
  tamano: TamanoIcono | null;
  /** `null` = el trazo de hoy (contorno 2, relleno 1,25). Con el glifo relleno, siempre `null`. */
  trazo: TrazoIcono | null;
  /** Texto visible junto al ícono (solo en los estilos con texto). */
  mostrarTexto: boolean;
  textos: Partial<Record<IconoConTexto, string>>;
  contador: ContadorCarrito;
  /** Ícono de favoritos en la cabecera (la tienda lo pinta solo si tiene favoritos). */
  favoritos: boolean;
  /** Forma en el celular de Píldora, Relleno y «al lado». `auto` = lo de hoy. */
  movil: IconosEnCelular;
  /** Forma propia de cada ícono; sin clave = «Como los demás». */
  porIcono: Partial<Record<IconoCabecera, FormaIcono>>;
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

/** Formas propias válidas de `header_iconos.por_icono` (`{ carrito: { estilo: 'relleno' } }`). */
export function formasPorIcono(valor: unknown): Partial<Record<IconoCabecera, FormaIcono>> {
  const crudo = objeto(valor) ?? {};
  const salida: Partial<Record<IconoCabecera, FormaIcono>> = {};
  for (const icono of ICONOS_CABECERA) {
    const forma = unoDe(FORMAS_ICONO, objeto(crudo[icono])?.estilo);
    if (forma) salida[icono] = forma;
  }
  return salida;
}

/** El sitio usa el glifo relleno de antes (`header_icons_weight` = relleno). */
export function iconosRellenos(ajustes: Ajustes): boolean {
  return (ajustes ?? {}).header_icons_weight === 'relleno';
}

/**
 * Trazo que muestra el editor: relleno si el sitio lo usa (gana sobre `trazo`); si no, el
 * grosor guardado. `null` = nada guardado (se ve «Normal», lo de hoy).
 */
export function trazoUnificado(ajustes: Ajustes): TrazoUnificado | null {
  if (iconosRellenos(ajustes)) return 'relleno';
  return unoDe(TRAZOS_ICONOS, objeto((ajustes ?? {}).header_iconos)?.trazo);
}

export function opcionesIconos(ajustes: Ajustes): OpcionesIconos {
  const crudo = objeto((ajustes ?? {}).header_iconos) ?? {};
  const estiloPropio = unoDe(ESTILOS_ICONOS_NUEVOS, crudo.estilo);
  const tamano = unoDe(TAMANOS_ICONOS, crudo.tamano);
  // Relleno gana: con el glifo relleno, el grosor guardado no se aplica.
  const trazo = iconosRellenos(ajustes) ? null : unoDe(TRAZOS_ICONOS, crudo.trazo);
  const contador = unoDe(CONTADORES_CARRITO, crudo.contador);
  const mostrar = typeof crudo.mostrarTexto === 'boolean' ? crudo.mostrarTexto : null;
  const favoritos = crudo.favoritos === true;
  const movil = unoDe(ICONOS_EN_CELULAR, crudo.movil);
  const porIcono = formasPorIcono(crudo.por_icono);
  const textos: Partial<Record<IconoConTexto, string>> = {};
  const textosCrudos = objeto(crudo.textos) ?? {};
  for (const clave of ICONOS_CON_TEXTO) {
    const t = textoCorto(textosCrudos[clave], LARGO_TEXTO_ICONO);
    if (t) textos[clave] = t;
  }
  const estilo = estiloPropio ?? estiloIconosHeredado(ajustes);
  const configurado =
    estiloPropio !== null || tamano !== null || trazo !== null || contador !== null || mostrar !== null || favoritos || Object.keys(textos).length > 0 ||
    (movil !== null && movil !== 'auto') || Object.keys(porIcono).length > 0;
  // «Mostrar texto» vale para el estilo general y para las formas propias con texto.
  const algunoConTexto = estiloConTexto(estilo) || Object.values(porIcono).some((f) => f !== undefined && estiloConTexto(f));
  return {
    configurado,
    estilo,
    tamano,
    trazo,
    // Sin la opción, los estilos con texto lo muestran (por eso se eligen).
    mostrarTexto: algunoConTexto && (mostrar ?? true),
    textos,
    contador: contador ?? 'numero',
    favoritos,
    movil: movil ?? 'auto',
    porIcono,
  };
}

/** Estilo de un ícono en el computador: su forma propia o el estilo general («Como los demás»). */
export function estiloDeIcono(op: Pick<OpcionesIconos, 'estilo' | 'porIcono'>, icono: IconoCabecera): EstiloIconos {
  return op.porIcono[icono] ?? op.estilo;
}

/** Estilos que no caben en el celular (390 px): en el editor llevan «Solo computador». */
export function estiloSoloComputador(estilo: EstiloIconos): boolean {
  return estilo === 'pildora' || estilo === 'relleno' || estilo === 'texto_lado';
}

/**
 * Estilo que se pinta. En el computador, el elegido. En el celular, Píldora, Relleno y «al lado»
 * (generales o propios) pasan a la forma de «En el celular»; con `auto`, a lo de hoy (`heredado`:
 * solo ícono o círculo según la caja del sitio). Solo ícono, Círculo y Con texto no cambian.
 */
export function estiloEnPantalla(estilo: EstiloIconos, movil: boolean, enCelular: IconosEnCelular, heredado: 'icono' | 'circulo'): EstiloIconos {
  if (!movil || !estiloSoloComputador(estilo)) return estilo;
  return enCelular === 'auto' ? heredado : enCelular;
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
 * Cómo elige su texto el botón principal (Figma 2773:62797 · 2774:63297 · 2774:64169 · 2775:64409,
 * aprobado 2026-11-22). La forma es la misma de siempre (`{ modo, textos, orden?, texto? }`) con
 * campos nuevos opcionales; un modo que esta versión no conoce cae a la fila legacy (lo de hoy).
 * - `fijo`: siempre `texto` (vacío = el primero de la lista o «Comprar ahora»).
 * - `al_abrir`: uno de `textos` cada vez que se abre el carrito, al azar (sin repetir el de la
 *   vez anterior) o en orden (el 1.º la primera vez, el 2.º la siguiente… y vuelve a empezar).
 * - `mientras_abierto`: rota cada `segundos` (2–10) mientras el cajón sigue abierto, con
 *   `transicion` y `pausar` al pasar el mouse. Con «reducir movimiento», cambia sin efecto.
 * - `segun_carrito`: el texto depende del carrito (`reglas`, por prioridad: falta para el envío
 *   gratis › hay productos en oferta › ya tiene envío gratis › por defecto).
 */
export const MODOS_BOTON_CARRITO = ['fijo', 'al_abrir', 'mientras_abierto', 'segun_carrito'] as const;
export type ModoBotonCarrito = (typeof MODOS_BOTON_CARRITO)[number];
export const ORDENES_BOTON_CARRITO = ['azar', 'orden'] as const;
export type OrdenBotonCarrito = (typeof ORDENES_BOTON_CARRITO)[number];
/** Transición del modo «mientras está abierto»: fundido (300 ms), deslizar o sin efecto. */
export const TRANSICIONES_BOTON_CARRITO = ['fundido', 'deslizar', 'ninguna'] as const;
export type TransicionBotonCarrito = (typeof TRANSICIONES_BOTON_CARRITO)[number];
/** Segundos entre textos del modo «mientras está abierto» (Figma: 2 a 10, 4 por defecto). */
export const SEGUNDOS_BOTON_CARRITO = { min: 2, max: 10, porDefecto: 4 } as const;

/** Reglas del modo «según el carrito», en orden de prioridad (gana la de número menor). */
export const REGLAS_BOTON_CARRITO = ['faltaEnvio', 'oferta', 'envioGratis'] as const;
export type ReglaBotonCarrito = (typeof REGLAS_BOTON_CARRITO)[number];
export type ClaveTextoRegla = ReglaBotonCarrito | 'porDefecto';
/** Textos por defecto de cada regla (Figma 2775:64409). `{monto}` = lo que falta. */
export const TEXTOS_REGLAS_BOTON_CARRITO: Readonly<Record<ClaveTextoRegla, string>> = {
  faltaEnvio: 'Te faltan {monto} para envío gratis',
  oferta: 'Aprovechar oferta',
  envioGratis: 'Comprar con envío gratis',
  porDefecto: 'Comprar ahora',
};
export const LARGO_TEXTO_REGLA_BOTON = 40;

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
  /** `mientras_abierto`: segundos entre textos (2–10). Sin valor, 4. */
  segundos?: number;
  /** `mientras_abierto`: transición. Sin valor, fundido. */
  transicion?: TransicionBotonCarrito;
  /** `mientras_abierto`: se detiene con el mouse encima (o el dedo, en el celular). Sin valor, sí. */
  pausar?: boolean;
  /**
   * `segun_carrito`: texto de cada regla. Clave ausente = el texto por defecto; texto vacío (`''`)
   * = la regla se salta y pasa a la siguiente («un campo vacío salta a la siguiente»).
   */
  reglas?: Partial<Record<ClaveTextoRegla, string>>;
}

export const ESTILOS_ENLACE_CARRITO = ['borde', 'enlace'] as const;
export type EstiloEnlaceCarrito = (typeof ESTILOS_ENLACE_CARRITO)[number];

export interface OpcionesCarrito {
  configurado: boolean;
  boton: BotonCarrito;
  /**
   * Botón «Comprar» de la página /carrito (Figma 2777:64932). `null` = el de hoy (uno de los
   * textos de siempre, al azar en cada visita). Con el botón del cajón configurado en el documento
   * y «Usar lo mismo en «Comprar» del carrito completo» encendido (por defecto), es el mismo
   * botón; apagado, el propio (`header_carrito.botonPagina`).
   */
  botonPagina: BotonCarrito | null;
  /** «Usar lo mismo en «Comprar» del carrito completo» (por defecto, sí). */
  usarEnPagina: boolean;
  /** «Ver carrito completo»: botón con borde (hoy) o enlace. */
  enlace: { mostrar: boolean; texto: string; estilo: EstiloEnlaceCarrito };
  seguirComprando: string;
  titulo: string;
  envioGratis: { barra: boolean; mensaje: string; logrado: string };
  /**
   * Aviso de contraentrega (Figma 3071:82659 y 3073:83426, aprobado el 2026-11-24): una línea
   * discreta en el cajón (debajo del total) y en la ficha (debajo del precio). Apagado por
   * defecto. Un solo dato que el editor cambia desde Encabezado › Carrito y desde la ficha del
   * producto. Encendido, sale solo si la sede ofrece contraentrega con condiciones.
   */
  avisoContraentrega: { carrito: boolean; ficha: boolean };
}

/** Marcador del monto que falta en el mensaje de envío gratis. */
export const MARCADOR_MONTO = '{monto}';

/** Lo que la tienda pinta sin configuración (textos de hoy). */
export const CARRITO_HOY: Readonly<Omit<OpcionesCarrito, 'configurado' | 'boton' | 'botonPagina' | 'usarEnPagina'>> = {
  enlace: { mostrar: true, texto: 'Ver carrito completo', estilo: 'borde' },
  seguirComprando: 'Continuar Comprando',
  titulo: 'Tu Carrito',
  envioGratis: {
    barra: true,
    mensaje: '¡Te faltan {monto} para envío gratis!',
    logrado: '¡Listo! Tu pedido tiene envío gratis',
  },
  avisoContraentrega: { carrito: false, ficha: false },
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

/** Segundos válidos (entero de 2 a 10); `null` si no es un número. */
export function segundosValidos(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(SEGUNDOS_BOTON_CARRITO.max, Math.max(SEGUNDOS_BOTON_CARRITO.min, Math.round(v)));
}

/** Textos de las reglas: la clave ausente no se guarda; el texto vacío se conserva (salta la regla). */
function reglasValidas(v: unknown): Partial<Record<ClaveTextoRegla, string>> | null {
  const o = objeto(v);
  if (!o) return null;
  const salida: Partial<Record<ClaveTextoRegla, string>> = {};
  for (const clave of [...REGLAS_BOTON_CARRITO, 'porDefecto'] as const) {
    const crudo = o[clave];
    if (typeof crudo !== 'string') continue;
    salida[clave] = textoCorto(crudo, LARGO_TEXTO_REGLA_BOTON) ?? '';
  }
  return Object.keys(salida).length > 0 ? salida : null;
}

/** Botón del documento (`header_carrito.boton`); `null` si no hay uno válido (modo desconocido incluido). */
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
  const segundos = segundosValidos(b.segundos);
  if (segundos !== null) boton.segundos = segundos;
  const transicion = unoDe(TRANSICIONES_BOTON_CARRITO, b.transicion);
  if (transicion) boton.transicion = transicion;
  if (typeof b.pausar === 'boolean') boton.pausar = b.pausar;
  const reglas = reglasValidas(b.reglas);
  if (reglas) boton.reglas = reglas;
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
  const botonPaginaDoc = botonCarritoDelDocumento(crudo.botonPagina);
  const usarEnPagina = crudo.usarEnPagina !== false;
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
  const aviso = objeto(crudo.avisoContraentrega) ?? {};
  const avisoCarrito = typeof aviso.carrito === 'boolean' ? aviso.carrito : null;
  const avisoFicha = typeof aviso.ficha === 'boolean' ? aviso.ficha : null;
  return {
    configurado:
      botonDoc !== null || botonPaginaDoc !== null || crudo.usarEnPagina === false || seguir !== null || titulo !== null ||
      enlaceMostrar !== null || enlaceTexto !== null || enlaceEstilo !== null || barra !== null || mensaje !== null || logrado !== null ||
      avisoCarrito !== null || avisoFicha !== null,
    boton: botonDoc ?? botonCarritoDesdeLegacy(a.cart_button_mode, a.cart_button_texts),
    botonPagina: usarEnPagina ? botonDoc : botonPaginaDoc,
    usarEnPagina,
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
    avisoContraentrega: {
      carrito: avisoCarrito ?? CARRITO_HOY.avisoContraentrega.carrito,
      ficha: avisoFicha ?? CARRITO_HOY.avisoContraentrega.ficha,
    },
  };
}

/** Lista con la que rota el botón (la propia o la de hoy). */
export function textosBotonCarrito(boton: BotonCarrito): readonly string[] {
  return boton.textos.length > 0 ? boton.textos : TEXTOS_BOTON_CARRITO_HOY;
}

/**
 * Índice del texto para una nueva apertura del cajón (`al_abrir`). `anterior` = el de la apertura
 * anterior (`null` la primera vez). «En orden»: el siguiente y vuelta a empezar. «Al azar»: uno
 * cualquiera, sin repetir el de la vez anterior (con un solo texto, ese). `azar` es inyectable.
 */
export function indiceAlAbrir(boton: BotonCarrito, anterior: number | null, azar: () => number = Math.random): number {
  const n = textosBotonCarrito(boton).length;
  if (n <= 1) return 0;
  if (boton.orden === 'orden') return anterior === null || anterior < 0 ? 0 : (anterior + 1) % n;
  if (anterior === null || anterior < 0 || anterior >= n) return Math.min(n - 1, Math.max(0, Math.floor(azar() * n)));
  // n-1 candidatos (todos menos el anterior).
  const i = Math.min(n - 2, Math.max(0, Math.floor(azar() * (n - 1))));
  return i >= anterior ? i + 1 : i;
}

/**
 * Texto del botón principal sin estado del carrito. `fijo`: el escrito, o el primero de la lista,
 * o «Comprar ahora». `al_abrir`: uno de la lista al azar (o el primero, en orden).
 * `mientras_abierto`: el primero (con el que arranca la rotación). `segun_carrito`: el de «por
 * defecto» (sin datos del carrito no se cumple ninguna regla). `azar` es inyectable.
 */
export function textoBotonCarrito(boton: BotonCarrito, azar: () => number = Math.random): string {
  const lista = textosBotonCarrito(boton);
  if (boton.modo === 'fijo') return boton.texto || lista[0] || TEXTO_BOTON_CARRITO_FIJO;
  if (boton.modo === 'segun_carrito') return textoRegla(boton, 'porDefecto') || TEXTO_BOTON_CARRITO_FIJO;
  if (boton.modo === 'mientras_abierto') return lista[0] || TEXTO_BOTON_CARRITO_FIJO;
  return lista[indiceAlAbrir(boton, null, azar)] || TEXTO_BOTON_CARRITO_FIJO;
}

/** Segundos de la rotación (`mientras_abierto`). */
export function segundosBotonCarrito(boton: BotonCarrito): number {
  return boton.segundos ?? SEGUNDOS_BOTON_CARRITO.porDefecto;
}

/** Transición efectiva: con «reducir movimiento» del visitante, siempre sin efecto. */
export function transicionBotonCarrito(boton: BotonCarrito, reducirMovimiento: boolean): TransicionBotonCarrito {
  if (reducirMovimiento) return 'ninguna';
  return boton.transicion ?? 'fundido';
}

/** Texto guardado de una regla: el propio, el de por defecto si no hay, o `''` si se dejó vacío. */
export function textoRegla(boton: Pick<BotonCarrito, 'reglas'>, clave: ClaveTextoRegla): string {
  const propio = boton.reglas?.[clave];
  return typeof propio === 'string' ? propio : TEXTOS_REGLAS_BOTON_CARRITO[clave];
}

/** Lo que sabe el cajón del carrito para el modo «según el carrito». */
export interface EstadoCarritoBoton {
  subtotal: number;
  /** Tope de envío gratis; 0 o negativo = la tienda no tiene tope. */
  topeEnvioGratis: number;
  /** Algún producto con precio anterior (o promoción aplicada). */
  hayOferta: boolean;
}

/**
 * Regla que gana en «según el carrito» y su texto (con `{monto}` sin reemplazar: quien pinta lo
 * formatea en la moneda del visitante con {@link partirMensajeMonto}). Prioridad: 1 falta para
 * el envío gratis, 2 hay productos en oferta, 3 ya tiene envío gratis; si no, «por defecto».
 * Una regla con texto vacío se salta.
 */
export function reglaBotonCarrito(
  boton: Pick<BotonCarrito, 'reglas'>,
  estado: EstadoCarritoBoton,
): { regla: ClaveTextoRegla; plantilla: string; monto: number | null } {
  const tope = estado.topeEnvioGratis > 0 ? estado.topeEnvioGratis : 0;
  const cumple: Record<ReglaBotonCarrito, boolean> = {
    faltaEnvio: tope > 0 && estado.subtotal < tope,
    oferta: estado.hayOferta,
    envioGratis: tope > 0 && estado.subtotal >= tope,
  };
  for (const regla of REGLAS_BOTON_CARRITO) {
    if (!cumple[regla]) continue;
    const plantilla = textoRegla(boton, regla);
    if (!plantilla) continue;
    return { regla, plantilla, monto: regla === 'faltaEnvio' ? Math.max(0, tope - estado.subtotal) : null };
  }
  return { regla: 'porDefecto', plantilla: textoRegla(boton, 'porDefecto') || TEXTO_BOTON_CARRITO_FIJO, monto: null };
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

// ─── Favoritos ─────────────────────────────────────────────────────────────────────────────

/**
 * Favoritos de la tienda (Figma «16 Sitio web» 2762:61067, aprobado 2026-11-22): corazón de la
 * cabecera, panel lateral y página pública /favoritos. Opción `header_favoritos` del documento V2
 * (`shell.header.opciones`, sin columna). «Mostrar el corazón» sigue siendo `header_iconos.favoritos`.
 *
 * Sin la clave: el panel al tocar el corazón, contador, aviso de sesión, «Compartir lista»,
 * sugerencias de las mismas categorías y los textos de abajo.
 */
export const AL_TOCAR_FAVORITOS = ['panel', 'pagina'] as const;
export type AlTocarFavoritos = (typeof AL_TOCAR_FAVORITOS)[number];
/** «También te puede gustar»: de las mismas categorías, los más vendidos o los destacados (ofertas y más vendidos). */
export const FUENTES_SUGERENCIAS_FAVORITOS = ['categorias', 'mas_vendidos', 'destacados'] as const;
export type FuenteSugerenciasFavoritos = (typeof FUENTES_SUGERENCIAS_FAVORITOS)[number];

export const TEXTOS_FAVORITOS = ['tituloPagina', 'tituloPanel', 'botonPrincipal', 'botonBorde', 'vacioTitulo', 'vacioTexto', 'avisoSesion'] as const;
export type TextoFavoritos = (typeof TEXTOS_FAVORITOS)[number];
/** Textos por defecto (los grises del editor, Figma 2772:62317). */
export const TEXTOS_FAVORITOS_POR_DEFECTO: Readonly<Record<TextoFavoritos, string>> = {
  tituloPagina: 'Mis favoritos',
  tituloPanel: 'Tus favoritos',
  botonPrincipal: 'Agregar todo al carrito',
  botonBorde: 'Ver todos los favoritos',
  vacioTitulo: 'Aún no tienes favoritos',
  vacioTexto: 'Toca el corazón en cualquier producto para guardarlo aquí.',
  avisoSesion: 'Tus favoritos se guardan en este dispositivo. Inicia sesión para verlos en cualquier lugar.',
};
/** Largo máximo de cada texto: los títulos y botones cortos; el vacío y el aviso, una frase. */
export const LARGO_TEXTOS_FAVORITOS: Readonly<Record<TextoFavoritos, number>> = {
  tituloPagina: 40,
  tituloPanel: 40,
  botonPrincipal: 40,
  botonBorde: 40,
  vacioTitulo: 60,
  vacioTexto: 140,
  avisoSesion: 160,
};

export interface OpcionesFavoritos {
  /** `true` si `header_favoritos` trae al menos una opción válida. */
  configurado: boolean;
  /** Al tocar el corazón de la cabecera: abrir el panel lateral o ir a /favoritos. */
  alTocar: AlTocarFavoritos;
  /** Contador de productos guardados sobre el corazón. */
  contador: boolean;
  textos: Record<TextoFavoritos, string>;
  sugerencias: { mostrar: boolean; fuente: FuenteSugerenciasFavoritos };
  /** Aviso «se guardan en este dispositivo» para el visitante sin sesión. */
  avisoSesion: boolean;
  /** Botón «Compartir lista». */
  compartir: boolean;
  /** Corazón en las tarjetas de producto (además de lo que diga el estilo de la tarjeta). */
  corazonTarjetas: boolean;
  /** Corazón en la ficha del producto. */
  corazonFicha: boolean;
}

const booleano = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

export function opcionesFavoritos(ajustes: Ajustes): OpcionesFavoritos {
  const crudo = objeto((ajustes ?? {}).header_favoritos) ?? {};
  const alTocar = unoDe(AL_TOCAR_FAVORITOS, crudo.alTocar);
  const contador = booleano(crudo.contador);
  const avisoSesion = booleano(crudo.avisoSesion);
  const compartir = booleano(crudo.compartir);
  const corazonTarjetas = booleano(crudo.corazonTarjetas);
  const corazonFicha = booleano(crudo.corazonFicha);
  const sug = objeto(crudo.sugerencias) ?? {};
  const sugMostrar = booleano(sug.mostrar);
  const sugFuente = unoDe(FUENTES_SUGERENCIAS_FAVORITOS, sug.fuente);
  const textosCrudos = objeto(crudo.textos) ?? {};
  const textos = { ...TEXTOS_FAVORITOS_POR_DEFECTO };
  let textosPropios = 0;
  for (const clave of TEXTOS_FAVORITOS) {
    const t = textoCorto(textosCrudos[clave], LARGO_TEXTOS_FAVORITOS[clave]);
    if (t) {
      textos[clave] = t;
      textosPropios++;
    }
  }
  return {
    configurado:
      alTocar !== null || contador !== null || avisoSesion !== null || compartir !== null || corazonTarjetas !== null ||
      corazonFicha !== null || sugMostrar !== null || sugFuente !== null || textosPropios > 0,
    alTocar: alTocar ?? 'panel',
    contador: contador ?? true,
    textos,
    sugerencias: { mostrar: sugMostrar ?? true, fuente: sugFuente ?? 'categorias' },
    avisoSesion: avisoSesion ?? true,
    compartir: compartir ?? true,
    corazonTarjetas: corazonTarjetas ?? true,
    corazonFicha: corazonFicha ?? true,
  };
}

/** Contador del corazón: «99+» desde 100; sin favoritos, nada. */
export function contadorFavoritos(cantidad: number, mostrar: boolean): string | null {
  if (!mostrar || !(cantidad > 0)) return null;
  return cantidad > 99 ? '99+' : String(Math.floor(cantidad));
}

// ─── Cuenta: iniciar sesión ───────────────────────────────────────────────────────────────

/**
 * Qué abre el ícono de cuenta (Figma «16 Sitio web» 2834:68670, aprobado 2026-11-22). Opción
 * `header_cuenta` del documento V2 (`shell.header.opciones`, sin columna, ADR-002).
 * - `pagina`: lo de hoy (y el valor sin clave): el ícono lleva a /auth, o a /mi-cuenta con sesión.
 * - `panel`: panel lateral a la derecha · `ventana`: ventana compacta colgada del ícono, sin
 *   beneficios · `dialogo`: diálogo centrado con pestañas Ingresar / Crear cuenta.
 * En el celular, todo modo distinto de `pagina` es una hoja inferior. Con sesión, el mismo modo
 * muestra el menú de cuenta (Hola {nombre}, Mis pedidos, Favoritos, Direcciones, Cerrar sesión).
 * /auth, /auth?tab=register, /auth/reset-password y /mi-cuenta siguen funcionando siempre.
 */
export const MODOS_CUENTA = ['pagina', 'panel', 'ventana', 'dialogo'] as const;
export type ModoCuenta = (typeof MODOS_CUENTA)[number];
/** Desde la ventana, «Crear cuenta» y «¿Olvidaste…?» abren el panel o la página. */
export const DESTINOS_VENTANA_CUENTA = ['panel', 'pagina'] as const;
export type DestinoVentanaCuenta = (typeof DESTINOS_VENTANA_CUENTA)[number];
/** Después de ingresar: quedarse donde estaba (carrito y pago incluidos) o ir a Mi cuenta. */
export const DESPUES_INGRESAR = ['quedarse', 'cuenta'] as const;
export type DespuesIngresar = (typeof DESPUES_INGRESAR)[number];

export const TEXTOS_CUENTA_POR_DEFECTO = { titulo: 'Ingresa a tu cuenta', boton: 'Ingresar' } as const;
export const LARGO_TITULO_CUENTA = 40;
export const LARGO_BOTON_CUENTA = 30;

/**
 * «Con tu cuenta puedes» del panel, el diálogo y la hoja (Figma E-A1 2839:69662, M2 2835:69308):
 * un título y tres líneas, cada uno editable. Se guardan en `header_cuenta.beneficiosTitulo` y
 * `header_cuenta.beneficio1|2|3`; vacío o sin la clave = el texto por defecto.
 */
export const BENEFICIOS_CUENTA_POR_DEFECTO = {
  titulo: 'Con tu cuenta puedes',
  lineas: [
    'Ver tus pedidos y en qué va cada uno',
    'Tener tus favoritos guardados en cualquier dispositivo',
    'Guardar tus direcciones para pagar más rápido',
  ],
} as const;
export const CLAVES_LINEAS_BENEFICIOS = ['beneficio1', 'beneficio2', 'beneficio3'] as const;
export type ClaveLineaBeneficio = (typeof CLAVES_LINEAS_BENEFICIOS)[number];
export const LARGO_TITULO_BENEFICIOS = 40;
export const LARGO_LINEA_BENEFICIO = 80;

/**
 * Texto del ícono de cuenta con la sesión iniciada (estilos con texto): `header_cuenta.textoSesion`.
 * `{nombre}` es el primer nombre del cliente; sin nombre conocido queda el texto sin sesión
 * (el propio de la tienda o «Mi cuenta»). Sin la clave, «Hola, {nombre}».
 */
export const MARCADOR_NOMBRE = '{nombre}';
export const TEXTO_SESION_CUENTA_POR_DEFECTO = 'Hola, {nombre}';
/** Largo del primer nombre dentro del ícono (el resto se corta con «…»). */
export const LARGO_NOMBRE_ICONO = 14;

export interface TextosBeneficiosCuenta {
  titulo: string;
  lineas: readonly [string, string, string];
}

export interface OpcionesCuenta {
  /** `true` si `header_cuenta` trae al menos una opción válida. */
  configurado: boolean;
  modo: ModoCuenta;
  titulo: string;
  boton: string;
  /** «Con tu cuenta puedes…» (panel, diálogo y hoja; la ventana nunca los muestra). */
  beneficios: boolean;
  /** Título y líneas de los beneficios (los propios o los de siempre). */
  textosBeneficios: TextosBeneficiosCuenta;
  /** Texto del ícono con sesión, con `{nombre}` sin reemplazar. */
  textoSesion: string;
  ventanaDestino: DestinoVentanaCuenta;
  despues: DespuesIngresar;
}

export function opcionesCuenta(ajustes: Ajustes): OpcionesCuenta {
  const crudo = objeto((ajustes ?? {}).header_cuenta) ?? {};
  const modo = unoDe(MODOS_CUENTA, crudo.modo);
  const titulo = textoCorto(crudo.titulo, LARGO_TITULO_CUENTA);
  const boton = textoCorto(crudo.boton, LARGO_BOTON_CUENTA);
  const beneficios = typeof crudo.beneficios === 'boolean' ? crudo.beneficios : null;
  const ventanaDestino = unoDe(DESTINOS_VENTANA_CUENTA, crudo.ventanaDestino);
  const despues = unoDe(DESPUES_INGRESAR, crudo.despues);
  const tituloBeneficios = textoCorto(crudo.beneficiosTitulo, LARGO_TITULO_BENEFICIOS);
  const lineasPropias = CLAVES_LINEAS_BENEFICIOS.map((k) => textoCorto(crudo[k], LARGO_LINEA_BENEFICIO));
  const textoSesion = textoCorto(crudo.textoSesion, LARGO_TEXTO_ICONO);
  const [l1, l2, l3] = BENEFICIOS_CUENTA_POR_DEFECTO.lineas;
  return {
    configurado:
      modo !== null || titulo !== null || boton !== null || beneficios !== null || ventanaDestino !== null || despues !== null ||
      tituloBeneficios !== null || lineasPropias.some((l) => l !== null) || textoSesion !== null,
    modo: modo ?? 'pagina',
    titulo: titulo ?? TEXTOS_CUENTA_POR_DEFECTO.titulo,
    boton: boton ?? TEXTOS_CUENTA_POR_DEFECTO.boton,
    beneficios: beneficios ?? true,
    textosBeneficios: {
      titulo: tituloBeneficios ?? BENEFICIOS_CUENTA_POR_DEFECTO.titulo,
      lineas: [lineasPropias[0] ?? l1, lineasPropias[1] ?? l2, lineasPropias[2] ?? l3],
    },
    textoSesion: textoSesion ?? TEXTO_SESION_CUENTA_POR_DEFECTO,
    ventanaDestino: ventanaDestino ?? 'panel',
    despues: despues ?? 'quedarse',
  };
}

/** Primer nombre para el ícono («Ana María» → «Ana»); largo, se corta con «…». Sin nombre, `null`. */
export function primerNombreIcono(nombre: string | null | undefined): string | null {
  const primero = (typeof nombre === 'string' ? nombre : '').trim().split(/\s+/)[0];
  if (!primero) return null;
  return primero.length <= LARGO_NOMBRE_ICONO ? primero : `${primero.slice(0, LARGO_NOMBRE_ICONO - 1)}…`;
}

/**
 * Texto del ícono de cuenta con sesión: la plantilla con el primer nombre en `{nombre}`. Si la
 * plantilla pide el nombre y no se conoce, `sinNombre` (el texto sin sesión: el de la tienda o
 * «Mi cuenta»). Una plantilla sin `{nombre}` se muestra tal cual.
 */
export function textoCuentaConSesion(plantilla: string, nombre: string | null | undefined, sinNombre: string): string {
  if (!plantilla.includes(MARCADOR_NOMBRE)) return plantilla;
  const primero = primerNombreIcono(nombre);
  return primero ? plantilla.split(MARCADOR_NOMBRE).join(primero) : sinNombre;
}

/** Vistas del acceso: ingresar, crear cuenta y recuperar la contraseña (con su confirmación). */
export const VISTAS_ACCESO = ['ingresar', 'registro', 'recuperar'] as const;
export type VistaAcceso = (typeof VISTAS_ACCESO)[number];

/** Página de cada vista (los enlaces de hoy, que siguen sirviendo para correos y favoritos). */
export function rutaAcceso(vista: VistaAcceso): string {
  if (vista === 'registro') return '/auth?tab=register';
  if (vista === 'recuperar') return '/auth?tab=forgot';
  return '/auth';
}

/**
 * Dónde se abre una vista. En la ventana, crear cuenta y recuperar abren el panel o la página
 * (lo elegido en el editor); lo demás se queda en el mismo modo.
 */
export function destinoVistaAcceso(op: Pick<OpcionesCuenta, 'modo' | 'ventanaDestino'>, vista: VistaAcceso): ModoCuenta {
  if (op.modo === 'ventana' && vista !== 'ingresar') return op.ventanaDestino;
  return op.modo;
}

/** El error de ingreso no dice si falló el correo o la contraseña (Figma S2, reglas 2840:70345). */
export const ERROR_INGRESO_GENERICO = 'Correo o contraseña incorrectos. Revisa los datos o recupera tu contraseña.';

/** Confirmación de «Recuperar»: la misma exista o no la cuenta. */
export function mensajeRecuperar(correo: string): string {
  const c = correo.trim();
  return `Si ${c || 'ese correo'} tiene una cuenta en esta tienda, te enviamos un código para crear una nueva contraseña.`;
}

/** Menú de cuenta con sesión: las rutas reales de /mi-cuenta. */
export const MENU_CUENTA = [
  { clave: 'pedidos', texto: 'Mis pedidos', href: '/mi-cuenta/pedidos' },
  { clave: 'favoritos', texto: 'Favoritos', href: '/mi-cuenta/favoritos' },
  { clave: 'direcciones', texto: 'Direcciones', href: '/mi-cuenta/direcciones' },
] as const;

/** «Hola, Ana»: el primer nombre; sin nombre, la parte del correo antes de la @; sin nada, «Hola». */
export function saludoCuenta(nombre: string | null | undefined, correo?: string | null): string {
  const primero = (nombre ?? '').trim().split(/\s+/)[0];
  if (primero) return `Hola, ${primero}`;
  const usuario = (correo ?? '').split('@')[0].trim();
  return usuario ? `Hola, ${usuario}` : 'Hola';
}
