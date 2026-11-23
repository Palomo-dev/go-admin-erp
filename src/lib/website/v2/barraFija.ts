/**
 * Barra fija de compra de la ficha de producto («sticky cart»), en el celular y en el computador
 * (Figma «16 Sitio web», propuesta 9 de la sección 2836:69391; nota «Qué se guarda» 2859:71821;
 * aprobada por el dueño el 2026-11-23).
 *
 * Vive en el contenido del bloque `product_actions` de la plantilla de la ficha, dentro del
 * documento del sitio (sin columnas nuevas ni migraciones, ADR-002), junto a `sticky_mobile`, que
 * se conserva tal cual (encendida/apagada en el celular):
 *
 *   sticky = {
 *     style: 'flat' | 'floating' | 'glass', thumb, qty, buyNow, fav, label,
 *     trigger: 'scroll' | 'pass', addFx: 'check' | 'fly', haptic,
 *     desktop: { enabled, position: 'top' | 'replace' | 'bottom', style, thumb, price, variant,
 *                qty, buyNow, fav, trigger },
 *   }
 *
 * Todas las claves son opcionales. Sin ninguna = LO DE HOY: en el celular, barra plana abajo con
 * «Agregar al carrito» + corazón, que aparece a los 400 px de scroll y se pone verde con check al
 * agregar; en el computador, sin barra. `label` y `addFx` valen para las dos barras.
 *
 * «Al pasar el botón» (`trigger: 'pass'`) se mide con el propio botón de la ficha
 * (IntersectionObserver), no con un número fijo; sin botón que medir, vuelve a los 400 px.
 *
 * Código puro: lo usan el editor (ERP), la tienda y sus pruebas. goadmin-websites guarda una copia
 * IDÉNTICA en `lib/website/v2/barraFija.ts` (`npm run verify:copias` allá compara las dos).
 */

// ─── Catálogo ───────────────────────────────────────────────────────────────────────────────

export const ESTILOS_BARRA_FIJA = ['flat', 'floating', 'glass'] as const;
export type EstiloBarraFija = (typeof ESTILOS_BARRA_FIJA)[number];

/** `scroll`: a los {@link UMBRAL_BARRA_FIJA_PX} px (hoy) · `pass`: cuando el botón de la ficha sale de la pantalla. */
export const APARICIONES_BARRA_FIJA = ['scroll', 'pass'] as const;
export type AparicionBarraFija = (typeof APARICIONES_BARRA_FIJA)[number];

/** `check`: verde con «Agregado» (hoy) · `fly`: además, la miniatura vuela al ícono del carrito. */
export const EFECTOS_AGREGAR_BARRA_FIJA = ['check', 'fly'] as const;
export type EfectoAgregarBarraFija = (typeof EFECTOS_AGREGAR_BARRA_FIJA)[number];

/** `top`: bajo la cabecera (sugerida) · `replace`: en lugar de la cabecera · `bottom`: abajo, flotante. */
export const POSICIONES_BARRA_ESCRITORIO = ['top', 'replace', 'bottom'] as const;
export type PosicionBarraEscritorio = (typeof POSICIONES_BARRA_ESCRITORIO)[number];

/** Claves en el contenido de `product_actions`. */
export const CLAVE_BARRA_FIJA = 'sticky' as const;
export const CLAVE_BARRA_CELULAR = 'sticky_mobile' as const;
export const CLAVE_BARRA_ESCRITORIO = 'desktop' as const;

/** Hoy la barra aparece cuando la página baja más de 400 px. */
export const UMBRAL_BARRA_FIJA_PX = 400;
/** «Hasta 28 letras» (K-E1). */
export const MAX_TEXTO_BARRA_FIJA = 28;
/** Lo que dice el botón sin texto propio (el sitio público está en español). */
export const TEXTO_BARRA_FIJA = 'Agregar al carrito';
/** Corto, cuando la miniatura comparte la fila con el botón (B1). */
export const TEXTO_CORTO_BARRA_FIJA = 'Agregar';
/** La burbuja del chat sube sobre la barra: alto real + 12 px (B5). */
export const SEPARACION_CHAT_BARRA_PX = 12;

export interface OpcionesBarraCelular {
  /** `sticky_mobile` (hoy: encendida). */
  encendida: boolean;
  estilo: EstiloBarraFija;
  /** Miniatura, nombre y precio. */
  miniatura: boolean;
  /** Cantidad compacta (− 1 +). */
  cantidad: boolean;
  comprarAhora: boolean;
  favorito: boolean;
  /** Texto propio del botón; `null` = {@link TEXTO_BARRA_FIJA}. */
  texto: string | null;
  aparece: AparicionBarraFija;
  alAgregar: EfectoAgregarBarraFija;
  vibracion: boolean;
}

export interface OpcionesBarraEscritorio {
  encendida: boolean;
  posicion: PosicionBarraEscritorio;
  estilo: EstiloBarraFija;
  /** Miniatura y nombre. */
  miniatura: boolean;
  precio: boolean;
  /** Variante compacta (un desplegable por atributo). */
  variante: boolean;
  cantidad: boolean;
  comprarAhora: boolean;
  favorito: boolean;
  aparece: AparicionBarraFija;
}

/** Hoy, en el celular. */
export const CELULAR_POR_DEFECTO: Readonly<OpcionesBarraCelular> = Object.freeze({
  encendida: true,
  estilo: 'flat',
  miniatura: false,
  cantidad: false,
  comprarAhora: false,
  favorito: true,
  texto: null,
  aparece: 'scroll',
  alAgregar: 'check',
  vibracion: false,
});

/** El computador: apagada (hoy no existe). Al encenderla, así arranca (K-E2). */
export const ESCRITORIO_POR_DEFECTO: Readonly<OpcionesBarraEscritorio> = Object.freeze({
  encendida: false,
  posicion: 'top',
  estilo: 'flat',
  miniatura: true,
  precio: true,
  variante: true,
  cantidad: true,
  comprarAhora: true,
  favorito: true,
  aparece: 'pass',
});

export interface BarraFijaLeida {
  celular: OpcionesBarraCelular;
  escritorio: OpcionesBarraEscritorio;
  /** `false` = no hay `sticky` guardado (todo como hoy). */
  configurado: boolean;
}

// ─── Lectura ────────────────────────────────────────────────────────────────────────────────

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const unoDe = <T extends string>(lista: readonly T[], v: unknown, defecto: T): T =>
  typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : defecto;

const booleano = (v: unknown, defecto: boolean): boolean => (typeof v === 'boolean' ? v : defecto);

/** Texto recortado y con espacios simples; `null` si queda vacío. Pasado del máximo, se corta. */
export function textoBarraLimpio(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const limpio = v.trim().replace(/\s+/g, ' ');
  if (!limpio) return null;
  return limpio.length <= MAX_TEXTO_BARRA_FIJA ? limpio : limpio.slice(0, MAX_TEXTO_BARRA_FIJA).trimEnd();
}

/** Contenido de `product_actions` → opciones de las dos barras. Nunca lanza. */
export function leerBarraFija(contenido: Record<string, unknown> | null | undefined): BarraFijaLeida {
  const c = objeto(contenido) ?? {};
  const s = objeto(c[CLAVE_BARRA_FIJA]);
  const d = objeto(s?.[CLAVE_BARRA_ESCRITORIO]);
  const cel = CELULAR_POR_DEFECTO;
  const esc = ESCRITORIO_POR_DEFECTO;
  const celular: OpcionesBarraCelular = {
    // Hoy: solo `false` la apaga.
    encendida: c[CLAVE_BARRA_CELULAR] !== false,
    estilo: unoDe(ESTILOS_BARRA_FIJA, s?.style, cel.estilo),
    miniatura: booleano(s?.thumb, cel.miniatura),
    cantidad: booleano(s?.qty, cel.cantidad),
    comprarAhora: booleano(s?.buyNow, cel.comprarAhora),
    favorito: booleano(s?.fav, cel.favorito),
    texto: textoBarraLimpio(s?.label),
    aparece: unoDe(APARICIONES_BARRA_FIJA, s?.trigger, cel.aparece),
    alAgregar: unoDe(EFECTOS_AGREGAR_BARRA_FIJA, s?.addFx, cel.alAgregar),
    vibracion: booleano(s?.haptic, cel.vibracion),
  };
  const escritorio: OpcionesBarraEscritorio = {
    encendida: d?.enabled === true,
    posicion: unoDe(POSICIONES_BARRA_ESCRITORIO, d?.position, esc.posicion),
    estilo: unoDe(ESTILOS_BARRA_FIJA, d?.style, esc.estilo),
    miniatura: booleano(d?.thumb, esc.miniatura),
    precio: booleano(d?.price, esc.precio),
    variante: booleano(d?.variant, esc.variante),
    cantidad: booleano(d?.qty, esc.cantidad),
    comprarAhora: booleano(d?.buyNow, esc.comprarAhora),
    favorito: booleano(d?.fav, esc.favorito),
    aparece: unoDe(APARICIONES_BARRA_FIJA, d?.trigger, esc.aparece),
  };
  return { celular, escritorio, configurado: s !== null };
}

/** La barra del celular se ve exactamente como hoy (sin contar si está encendida). */
export function celularComoHoy(op: OpcionesBarraCelular): boolean {
  const base = CELULAR_POR_DEFECTO;
  return (
    op.estilo === base.estilo &&
    op.miniatura === base.miniatura &&
    op.cantidad === base.cantidad &&
    op.comprarAhora === base.comprarAhora &&
    op.favorito === base.favorito &&
    op.texto === base.texto &&
    op.alAgregar === base.alAgregar
  );
}

/** Texto del botón «Agregar» de la barra. */
export function textoBotonBarra(texto: string | null): string {
  return texto || TEXTO_BARRA_FIJA;
}

// ─── Escritura (editor) ─────────────────────────────────────────────────────────────────────

/** Solo las claves distintas de lo de hoy (sin claves = como hoy). */
function serializarCelular(op: OpcionesBarraCelular): Record<string, unknown> {
  const base = CELULAR_POR_DEFECTO;
  const r: Record<string, unknown> = {};
  if (op.estilo !== base.estilo) r.style = op.estilo;
  if (op.miniatura !== base.miniatura) r.thumb = op.miniatura;
  if (op.cantidad !== base.cantidad) r.qty = op.cantidad;
  if (op.comprarAhora !== base.comprarAhora) r.buyNow = op.comprarAhora;
  if (op.favorito !== base.favorito) r.fav = op.favorito;
  const texto = textoBarraLimpio(op.texto);
  if (texto) r.label = texto;
  if (op.aparece !== base.aparece) r.trigger = op.aparece;
  if (op.alAgregar !== base.alAgregar) r.addFx = op.alAgregar;
  if (op.vibracion !== base.vibracion) r.haptic = op.vibracion;
  return r;
}

/** `enabled` siempre que haya algo; lo demás, solo lo distinto del arranque (K-E2). */
function serializarEscritorio(op: OpcionesBarraEscritorio): Record<string, unknown> | null {
  const base = ESCRITORIO_POR_DEFECTO;
  const r: Record<string, unknown> = {};
  if (op.posicion !== base.posicion) r.position = op.posicion;
  if (op.estilo !== base.estilo) r.style = op.estilo;
  if (op.miniatura !== base.miniatura) r.thumb = op.miniatura;
  if (op.precio !== base.precio) r.price = op.precio;
  if (op.variante !== base.variante) r.variant = op.variante;
  if (op.cantidad !== base.cantidad) r.qty = op.cantidad;
  if (op.comprarAhora !== base.comprarAhora) r.buyNow = op.comprarAhora;
  if (op.favorito !== base.favorito) r.fav = op.favorito;
  if (op.aparece !== base.aparece) r.trigger = op.aparece;
  // Apagada y sin nada propio: no se guarda (como hoy). Apagada CON opciones: se conservan.
  if (!op.encendida && Object.keys(r).length === 0) return null;
  return { enabled: op.encendida, ...r };
}

export interface CambioBarraFija {
  celular?: Partial<OpcionesBarraCelular>;
  escritorio?: Partial<OpcionesBarraEscritorio>;
}

/**
 * El contenido del bloque con la barra fija cambiada. Escribe `sticky_mobile` (encendida en el
 * celular) y `sticky` (lo demás, solo lo distinto de hoy; sin nada distinto, la clave se quita).
 * El resto de claves no se toca.
 */
export function contenidoConBarraFija(contenido: Record<string, unknown>, cambio: CambioBarraFija): Record<string, unknown> {
  const actual = leerBarraFija(contenido);
  const celular: OpcionesBarraCelular = { ...actual.celular, ...(cambio.celular ?? {}) };
  const escritorio: OpcionesBarraEscritorio = { ...actual.escritorio, ...(cambio.escritorio ?? {}) };
  const sticky = serializarCelular(celular);
  const desktop = serializarEscritorio(escritorio);
  if (desktop) sticky[CLAVE_BARRA_ESCRITORIO] = desktop;
  const siguiente: Record<string, unknown> = { ...contenido };
  if (cambio.celular && 'encendida' in cambio.celular) siguiente[CLAVE_BARRA_CELULAR] = celular.encendida;
  if (Object.keys(sticky).length > 0) siguiente[CLAVE_BARRA_FIJA] = sticky;
  else delete siguiente[CLAVE_BARRA_FIJA];
  return siguiente;
}

// ─── Cuándo se ve (tienda) ──────────────────────────────────────────────────────────────────

export interface EstadoScrollBarra {
  /** `window.scrollY`. */
  scrollY: number;
  /**
   * `true` = el botón principal de la ficha ya salió por arriba de la pantalla · `false` = se ve o
   * está más abajo · `null` = no hay botón que medir (vuelve a los 400 px).
   */
  botonPasado: boolean | null;
}

/** La barra se muestra según «Cuándo aparece». */
export function barraDebeVerse(aparece: AparicionBarraFija, estado: EstadoScrollBarra): boolean {
  if (aparece === 'pass' && estado.botonPasado !== null) return estado.botonPasado;
  return estado.scrollY > UMBRAL_BARRA_FIJA_PX;
}

/**
 * «En lugar de la cabecera»: al bajar la cabecera se esconde y la barra ocupa su lugar; al subir
 * vuelve la cabecera (y la barra se va). `bajando` = el último movimiento fue hacia abajo.
 */
export function barraReemplazaVisible(debeVerse: boolean, bajando: boolean): boolean {
  return debeVerse && bajando;
}

/** Cuánto sube la burbuja del chat: alto de la barra abajo + 12 px; 0 si la barra no está abajo o no se ve. */
export function empujeChatBarra(altoBarra: number, visible: boolean, abajo: boolean): number {
  if (!visible || !abajo || !(altoBarra > 0)) return 0;
  return Math.round(altoBarra + SEPARACION_CHAT_BARRA_PX);
}
