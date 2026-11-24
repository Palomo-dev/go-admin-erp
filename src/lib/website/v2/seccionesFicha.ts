/**
 * Secciones de la ficha de producto: Beneficios, Reseñas, Productos relacionados y Descripción
 * (Figma «16 Sitio web», sección 2983:72501, aprobada por el dueño el 2026-11-24).
 *
 * Las opciones viven en el contenido de cada bloque de la plantilla `product_detail`, dentro del
 * documento del sitio (sin columnas nuevas, ADR-002), con claves planas propias (ver `CLAVES_*`).
 *
 * Regla de oro: SIN ninguna de las claves nuevas, cada sección se pinta EXACTAMENTE como hoy
 * (`conOpciones === false` → la tienda usa el marcado de siempre). Los valores por defecto de cada
 * lector son el aspecto de hoy: Beneficios = Lista, 2 columnas, multicolor, sin líneas; Reseñas =
 * Clásico; Relacionados = Carrusel; Descripción = Texto con «Ver más» (corte por letras).
 *
 * Claves que ya existían y se conservan con su significado: `items`, `columns` y `gap`
 * (beneficios), `title`, `max_items`, `source`, `columns`, `show_arrows`, `show_dots` y
 * `related_products_layout` (relacionados), `empty_state_*` (reseñas) y `max_height` (descripción).
 * `layout` de la descripción NO se lee: la tienda nunca lo aplicó y empezar a hacerlo cambiaría
 * fichas guardadas.
 *
 * Código puro: lo usan el editor (ERP), la tienda y sus pruebas. goadmin-websites guarda una copia
 * IDÉNTICA en `lib/website/v2/seccionesFicha.ts` (`npm run verify:copias` allá compara las dos).
 */

// ─── Utilidades ─────────────────────────────────────────────────────────────────────────────

type Contenido = Record<string, unknown> | null | undefined;

function uno<T extends string>(valor: unknown, opciones: readonly T[], porDefecto: T): T {
  return typeof valor === 'string' && (opciones as readonly string[]).includes(valor) ? (valor as T) : porDefecto;
}

function bool(valor: unknown, porDefecto: boolean): boolean {
  return typeof valor === 'boolean' ? valor : porDefecto;
}

function entero(valor: unknown, min: number, max: number): number | null {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function texto(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null;
  const t = valor.trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, max) : null;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function hexValido(valor: unknown): string | null {
  return typeof valor === 'string' && HEX.test(valor.trim()) ? valor.trim() : null;
}

function tieneAlguna(contenido: Contenido, claves: readonly string[]): boolean {
  if (!contenido || typeof contenido !== 'object') return false;
  return claves.some((c) => Object.prototype.hasOwnProperty.call(contenido, c) && (contenido as Record<string, unknown>)[c] !== undefined);
}

/** Contenido sin las claves dadas (para «Restablecer» una sección al aspecto de hoy). */
export function sinClaves(contenido: Record<string, unknown>, claves: readonly string[]): Record<string, unknown> {
  const siguiente = { ...contenido };
  for (const c of claves) delete siguiente[c];
  return siguiente;
}

/** Contenido con la clave cambiada; `undefined` la quita. */
export function conClave(contenido: Record<string, unknown>, clave: string, valor: unknown): Record<string, unknown> {
  const siguiente = { ...contenido };
  if (valor === undefined) delete siguiente[clave];
  else siguiente[clave] = valor;
  return siguiente;
}

// ─── Beneficios (`product_benefits`) ────────────────────────────────────────────────────────

export const ESTILOS_BENEFICIOS = ['lista', 'tarjetas', 'franja', 'insignias'] as const;
export type EstiloBeneficios = (typeof ESTILOS_BENEFICIOS)[number];

/** Set de 12 íconos elegibles (Figma 2985:72976), nombres de lucide. */
export const ICONOS_BENEFICIO = [
  'Truck',
  'ShieldCheck',
  'Wrench',
  'RefreshCw',
  'CreditCard',
  'Lock',
  'Clock',
  'MapPin',
  'PackageCheck',
  'BadgePercent',
  'Star',
  'Phone',
] as const;
export type IconoBeneficio = (typeof ICONOS_BENEFICIO)[number];
/** Nombres que ya guardaban los beneficios de antes (la tienda los sigue pintando). */
export const ICONOS_BENEFICIO_ANTERIORES = ['Shield', 'Package'] as const;

export const MODOS_COLOR_ICONO = ['marca', 'propio', 'multicolor'] as const;
export type ModoColorIcono = (typeof MODOS_COLOR_ICONO)[number];
export const COLORES_MARCA_ICONO = ['primario', 'secundario', 'acento'] as const;
export type ColorMarcaIcono = (typeof COLORES_MARCA_ICONO)[number];
export const FONDOS_ICONO = ['suave', 'solido', 'ninguno'] as const;
export type FondoIcono = (typeof FONDOS_ICONO)[number];
export const FORMAS_ICONO = ['circulo', 'cuadrado'] as const;
export type FormaIcono = (typeof FORMAS_ICONO)[number];
export const TAMANOS_ICONO = ['sm', 'md', 'lg'] as const;
export type TamanoIcono = (typeof TAMANOS_ICONO)[number];
export const BORDES_ITEM = ['ninguno', 'linea', 'sombra'] as const;
export type BordeItem = (typeof BORDES_ITEM)[number];
export const ALINEACIONES = ['izquierda', 'centro'] as const;
export type Alineacion = (typeof ALINEACIONES)[number];

export const CLAVES_BENEFICIOS = {
  estilo: 'benefits_style',
  columnasCelular: 'columns_mobile',
  alineacion: 'align',
  lineas: 'dividers',
  mostrarDescripcion: 'show_description',
  modoColor: 'icon_color_mode',
  colorMarca: 'icon_brand_color',
  colorPropio: 'icon_color',
  fondo: 'icon_bg',
  forma: 'icon_shape',
  tamano: 'icon_size',
  borde: 'item_border',
  fondoItem: 'item_bg',
} as const;
/** Claves nuevas: con alguna, la tienda usa el pintado con opciones. */
export const CLAVES_NUEVAS_BENEFICIOS: readonly string[] = Object.values(CLAVES_BENEFICIOS);

/** Los cuatro de siempre (DEFAULT_BENEFITS de la tienda). */
export const BENEFICIOS_POR_DEFECTO = [
  { icon: 'Truck', title: 'Envío rápido', description: '24-48 horas' },
  { icon: 'Shield', title: 'Garantía', description: '30 días' },
  { icon: 'Package', title: 'Empaque seguro', description: 'Protección total' },
  { icon: 'Star', title: 'Calidad', description: '100% original' },
] as const;

export const MAX_BENEFICIOS = 8;

/** Los cuatro tonos de «Multicolor» (como hoy): verde, azul, morado, amarillo. */
export const TONOS_MULTICOLOR = ['#16A34A', '#2563EB', '#9333EA', '#CA8A04'] as const;

export interface BeneficioFichaItem {
  icon: string;
  title: string;
  description: string;
  /** Color propio del ítem (solo con «Multicolor»). */
  color: string | null;
}

export interface OpcionesBeneficios {
  /** `true` si el contenido trae alguna clave nueva (si no, la tienda pinta lo de hoy). */
  conOpciones: boolean;
  estilo: EstiloBeneficios;
  columnas: number;
  /** `null` = como en escritorio (hoy). */
  columnasCelular: 1 | 2 | null;
  alineacion: Alineacion;
  lineas: boolean;
  mostrarDescripcion: boolean;
  /** `null` = 16 px (hoy, `gap-4`). */
  gap: number | null;
  modoColor: ModoColorIcono;
  colorMarca: ColorMarcaIcono;
  colorPropio: string;
  fondo: FondoIcono;
  forma: FormaIcono;
  tamano: TamanoIcono;
  borde: BordeItem;
  fondoItem: string | null;
}

export const COLOR_PROPIO_ICONO_POR_DEFECTO = '#2B3A4A';

export function leerItemsBeneficios(contenido: Contenido): BeneficioFichaItem[] {
  const crudos = contenido && Array.isArray(contenido.items) ? (contenido.items as unknown[]) : [];
  const items: BeneficioFichaItem[] = [];
  for (const crudo of crudos.slice(0, MAX_BENEFICIOS)) {
    if (!crudo || typeof crudo !== 'object') continue;
    const f = crudo as Record<string, unknown>;
    items.push({
      icon: typeof f.icon === 'string' && f.icon ? f.icon : 'Star',
      title: typeof f.title === 'string' ? f.title : '',
      description: typeof f.description === 'string' ? f.description : '',
      color: hexValido(f.color),
    });
  }
  return items;
}

export function leerOpcionesBeneficios(contenido: Contenido): OpcionesBeneficios {
  const c = (contenido ?? {}) as Record<string, unknown>;
  const k = CLAVES_BENEFICIOS;
  const celular = entero(c[k.columnasCelular], 1, 2);
  return {
    conOpciones: tieneAlguna(c, CLAVES_NUEVAS_BENEFICIOS),
    estilo: uno(c[k.estilo], ESTILOS_BENEFICIOS, 'lista'),
    columnas: entero(c.columns, 1, 4) ?? 2,
    columnasCelular: celular === 1 || celular === 2 ? celular : null,
    alineacion: uno(c[k.alineacion], ALINEACIONES, 'izquierda'),
    lineas: bool(c[k.lineas], false),
    mostrarDescripcion: bool(c[k.mostrarDescripcion], true),
    gap: typeof c.gap === 'number' && Number.isFinite(c.gap) ? Math.max(0, Math.min(64, c.gap)) : null,
    modoColor: uno(c[k.modoColor], MODOS_COLOR_ICONO, 'multicolor'),
    colorMarca: uno(c[k.colorMarca], COLORES_MARCA_ICONO, 'primario'),
    colorPropio: hexValido(c[k.colorPropio]) ?? COLOR_PROPIO_ICONO_POR_DEFECTO,
    fondo: uno(c[k.fondo], FONDOS_ICONO, 'suave'),
    forma: uno(c[k.forma], FORMAS_ICONO, 'circulo'),
    tamano: uno(c[k.tamano], TAMANOS_ICONO, 'md'),
    borde: uno(c[k.borde], BORDES_ITEM, 'linea'),
    fondoItem: hexValido(c[k.fondoItem]),
  };
}

/** Lado del cuadro del ícono y del ícono, en px, por tamaño (md = 40/20, el de hoy). */
export const MEDIDAS_ICONO: Readonly<Record<TamanoIcono, { caja: number; icono: number }>> = {
  sm: { caja: 32, icono: 16 },
  md: { caja: 40, icono: 20 },
  lg: { caja: 48, icono: 24 },
};

// ─── Reseñas (`product_reviews`) ───────────────────────────────────────────────────────────

export const ESTILOS_RESENAS = ['clasico', 'carrusel', 'compacta', 'fotos'] as const;
export type EstiloResenas = (typeof ESTILOS_RESENAS)[number];
export const POR_PAGINA_RESENAS = [5, 10, 20] as const;
export const ORDENES_RESENAS = ['recent', 'helpful', 'highest', 'lowest'] as const;
export type OrdenResenas = (typeof ORDENES_RESENAS)[number];
export const FILTROS_RESENAS = ['estrellas', 'fotos', 'verificada'] as const;
export type FiltroResenas = (typeof FILTROS_RESENAS)[number];
export const QUIEN_OPINA = ['cualquiera', 'compradores'] as const;
export type QuienOpina = (typeof QUIEN_OPINA)[number];
export const COLORES_ESTRELLA = ['amarillo', 'tienda'] as const;
export type ColorEstrella = (typeof COLORES_ESTRELLA)[number];
export const COLORES_BARRA = ['tienda', 'gris'] as const;
export type ColorBarra = (typeof COLORES_BARRA)[number];
export const ESTILOS_BOTON_RESENA = ['relleno', 'borde', 'enlace'] as const;
export type EstiloBotonResena = (typeof ESTILOS_BOTON_RESENA)[number];
export const TARJETAS_RESENA = ['borde', 'sin_borde', 'suave'] as const;
export type TarjetaResena = (typeof TARJETAS_RESENA)[number];
export const FONDOS_RESUMEN = ['suave', 'ninguno'] as const;
export type FondoResumen = (typeof FONDOS_RESUMEN)[number];
export const TAMANOS_TITULO = ['sm', 'md', 'lg'] as const;
export type TamanoTitulo = (typeof TAMANOS_TITULO)[number];

export const CLAVES_RESENAS = {
  estilo: 'reviews_style',
  porPagina: 'per_page',
  orden: 'sort_default',
  filtros: 'filters',
  fotos: 'show_photos',
  respuesta: 'show_reply',
  util: 'show_helpful',
  ciudad: 'show_city',
  titulo: 'title',
  textoBoton: 'write_button_text',
  quienOpina: 'who_can_review',
  colorEstrellas: 'star_color',
  colorBarras: 'bar_color',
  boton: 'write_button_style',
  tarjeta: 'review_card',
  resumen: 'summary_bg',
  avatar: 'avatar_initial',
  tamanoTitulo: 'title_size',
} as const;
export const CLAVES_NUEVAS_RESENAS: readonly string[] = Object.values(CLAVES_RESENAS);

export const TITULO_RESENAS_POR_DEFECTO = 'Opiniones de clientes';
export const BOTON_RESENAS_POR_DEFECTO = 'Escribir una opinión';

export interface OpcionesResenas {
  conOpciones: boolean;
  estilo: EstiloResenas;
  porPagina: number;
  orden: OrdenResenas;
  filtros: FiltroResenas[];
  fotos: boolean;
  respuesta: boolean;
  util: boolean;
  ciudad: boolean;
  titulo: string;
  textoBoton: string;
  quienOpina: QuienOpina;
  colorEstrellas: ColorEstrella;
  colorBarras: ColorBarra;
  boton: EstiloBotonResena;
  tarjeta: TarjetaResena;
  resumen: FondoResumen;
  avatar: boolean;
  tamanoTitulo: TamanoTitulo;
}

export function leerOpcionesResenas(contenido: Contenido): OpcionesResenas {
  const c = (contenido ?? {}) as Record<string, unknown>;
  const k = CLAVES_RESENAS;
  const porPagina = entero(c[k.porPagina], 1, 50);
  const filtros = Array.isArray(c[k.filtros])
    ? FILTROS_RESENAS.filter((f) => (c[k.filtros] as unknown[]).includes(f))
    : (['estrellas'] as FiltroResenas[]);
  return {
    conOpciones: tieneAlguna(c, CLAVES_NUEVAS_RESENAS),
    estilo: uno(c[k.estilo], ESTILOS_RESENAS, 'clasico'),
    porPagina: porPagina && (POR_PAGINA_RESENAS as readonly number[]).includes(porPagina) ? porPagina : 10,
    orden: uno(c[k.orden], ORDENES_RESENAS, 'recent'),
    filtros,
    fotos: bool(c[k.fotos], true),
    respuesta: bool(c[k.respuesta], true),
    util: bool(c[k.util], true),
    ciudad: bool(c[k.ciudad], true),
    titulo: texto(c[k.titulo], 120) ?? TITULO_RESENAS_POR_DEFECTO,
    textoBoton: texto(c[k.textoBoton], 60) ?? BOTON_RESENAS_POR_DEFECTO,
    quienOpina: uno(c[k.quienOpina], QUIEN_OPINA, 'cualquiera'),
    colorEstrellas: uno(c[k.colorEstrellas], COLORES_ESTRELLA, 'amarillo'),
    colorBarras: uno(c[k.colorBarras], COLORES_BARRA, 'tienda'),
    boton: uno(c[k.boton], ESTILOS_BOTON_RESENA, 'relleno'),
    tarjeta: uno(c[k.tarjeta], TARJETAS_RESENA, 'borde'),
    resumen: uno(c[k.resumen], FONDOS_RESUMEN, 'suave'),
    avatar: bool(c[k.avatar], true),
    tamanoTitulo: uno(c[k.tamanoTitulo], TAMANOS_TITULO, 'md'),
  };
}

/** Tamaño del título en px (md = 24, el `text-2xl` de hoy). */
export const PX_TITULO: Readonly<Record<TamanoTitulo, number>> = { sm: 20, md: 24, lg: 30 };

/** Orden de una lista de reseñas (copia ordenada; no muta). */
export function ordenarResenas<T extends { date: string; likes: number; rating: number }>(lista: readonly T[], orden: OrdenResenas): T[] {
  const copia = [...lista];
  if (orden === 'recent') copia.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  else if (orden === 'helpful') copia.sort((a, b) => b.likes - a.likes);
  else if (orden === 'highest') copia.sort((a, b) => b.rating - a.rating || b.likes - a.likes);
  else copia.sort((a, b) => a.rating - b.rating || b.likes - a.likes);
  return copia;
}

// ─── Productos relacionados (`related_products`) ───────────────────────────────────────────

export const ESTILOS_RELACIONADOS = ['carrusel', 'rejilla', 'lista', 'juntos'] as const;
export type EstiloRelacionados = (typeof ESTILOS_RELACIONADOS)[number];
export const FUENTES_RELACIONADOS = ['category', 'tag', 'manual', 'bought_together'] as const;
export type FuenteRelacionados = (typeof FUENTES_RELACIONADOS)[number];
export const CELULAR_RELACIONADOS = ['deslizable', 'dos'] as const;
export type CelularRelacionados = (typeof CELULAR_RELACIONADOS)[number];
export const FORMAS_FLECHA = ['circulo', 'cuadrado'] as const;
export type FormaFlecha = (typeof FORMAS_FLECHA)[number];
export const CAJAS_TOTAL = ['suave', 'borde'] as const;
export type CajaTotal = (typeof CAJAS_TOTAL)[number];

/** Clave de siempre del carrusel/rejilla (`defaultProductDetailSections`). */
export const CLAVE_LAYOUT_RELACIONADOS_ANTERIOR = 'related_products_layout';

export const CLAVES_RELACIONADOS = {
  estilo: 'related_style',
  celular: 'mobile_mode',
  verTodos: 'show_view_all',
  ocultarAgotados: 'hide_sold_out',
  alineacionTitulo: 'title_align',
  formaFlechas: 'arrow_shape',
  cajaTotal: 'bundle_box',
} as const;
export const CLAVES_NUEVAS_RELACIONADOS: readonly string[] = Object.values(CLAVES_RELACIONADOS);

export const TITULO_RELACIONADOS_POR_DEFECTO = 'Productos relacionados';
/** Productos de «Comprados juntos» además del de la ficha. */
export const MAX_COMPRADOS_JUNTOS = 3;

export interface OpcionesRelacionados {
  conOpciones: boolean;
  estilo: EstiloRelacionados;
  fuente: FuenteRelacionados;
  columnas: number;
  celular: CelularRelacionados;
  cantidad: number;
  flechas: boolean;
  puntos: boolean;
  verTodos: boolean;
  ocultarAgotados: boolean;
  titulo: string;
  alineacionTitulo: Alineacion;
  formaFlechas: FormaFlecha;
  cajaTotal: CajaTotal;
}

export function leerOpcionesRelacionados(contenido: Contenido): OpcionesRelacionados {
  const c = (contenido ?? {}) as Record<string, unknown>;
  const k = CLAVES_RELACIONADOS;
  const anterior = c[CLAVE_LAYOUT_RELACIONADOS_ANTERIOR] === 'grid' ? 'rejilla' : 'carrusel';
  return {
    conOpciones: tieneAlguna(c, CLAVES_NUEVAS_RELACIONADOS),
    estilo: uno(c[k.estilo], ESTILOS_RELACIONADOS, anterior),
    fuente: uno(c.source, FUENTES_RELACIONADOS, 'category'),
    columnas: entero(c.columns, 2, 6) ?? 4,
    celular: uno(c[k.celular], CELULAR_RELACIONADOS, 'deslizable'),
    cantidad: entero(c.max_items, 1, 24) ?? 8,
    flechas: bool(c.show_arrows, true),
    puntos: bool(c.show_dots, true),
    verTodos: bool(c[k.verTodos], false),
    ocultarAgotados: bool(c[k.ocultarAgotados], false),
    titulo: texto(c.title, 120) ?? TITULO_RELACIONADOS_POR_DEFECTO,
    alineacionTitulo: uno(c[k.alineacionTitulo], ALINEACIONES, 'izquierda'),
    formaFlechas: uno(c[k.formaFlechas], FORMAS_FLECHA, 'circulo'),
    cajaTotal: uno(c[k.cajaTotal], CAJAS_TOTAL, 'suave'),
  };
}

/** ¿La sección necesita los elegidos a mano o los comprados juntos? (la tienda solo los consulta entonces) */
export function relacionadosPideDatos(contenido: Contenido): { manual: boolean; juntos: boolean } {
  const o = leerOpcionesRelacionados(contenido);
  return {
    manual: o.fuente === 'manual',
    juntos: o.fuente === 'bought_together' || o.estilo === 'juntos',
  };
}

interface ConId {
  id: number | string;
}

/** Une listas sin repetir (por `id`), en orden de prioridad, sin el producto de la ficha. */
export function unirSinRepetir<T extends ConId>(listas: ReadonlyArray<readonly T[] | null | undefined>, excluirId: number | string | null, limite: number): T[] {
  const vistos = new Set<string>();
  if (excluirId !== null && excluirId !== undefined) vistos.add(String(excluirId));
  const salida: T[] = [];
  for (const lista of listas) {
    for (const p of lista ?? []) {
      const id = String(p.id);
      if (vistos.has(id)) continue;
      vistos.add(id);
      salida.push(p);
      if (salida.length >= limite) return salida;
    }
  }
  return salida;
}

/**
 * Productos a pintar según la fuente. Elegidos a mano primero y luego lo de siempre (categoría,
 * etiqueta, al azar). «Comprados juntos»: los elegidos a mano de ese tipo, después los calculados
 * con las ventas y, si aún faltan, los elegidos a mano como relacionados. Fuente «Misma
 * categoría» o «Misma etiqueta» = la lista de siempre (la página ya la ordena).
 */
export function productosRelacionados<T extends ConId>(
  fuente: FuenteRelacionados,
  datos: { siempre: readonly T[]; manuales?: readonly T[] | null; juntosManuales?: readonly T[] | null; juntosCalculados?: readonly T[] | null },
  productoId: number | string | null,
  limite: number,
): T[] {
  if (fuente === 'manual') return unirSinRepetir([datos.manuales, datos.siempre], productoId, limite);
  if (fuente === 'bought_together') {
    const juntos = unirSinRepetir([datos.juntosManuales, datos.juntosCalculados, datos.manuales], productoId, limite);
    return juntos.length > 0 ? juntos : unirSinRepetir([datos.siempre], productoId, limite);
  }
  return unirSinRepetir([datos.siempre], productoId, limite);
}

/** Productos de «Comprados juntos» (estilo): los de esa fuente, o los de la fuente elegida. */
export function productosCompradosJuntos<T extends ConId>(
  datos: { siempre: readonly T[]; manuales?: readonly T[] | null; juntosManuales?: readonly T[] | null; juntosCalculados?: readonly T[] | null },
  productoId: number | string | null,
): T[] {
  return productosRelacionados('bought_together', datos, productoId, MAX_COMPRADOS_JUNTOS);
}

/** Suma de los precios elegidos (los `null` no suman). */
export function sumaPrecios(precios: ReadonlyArray<number | null | undefined>): number {
  return precios.reduce<number>((suma, p) => suma + (typeof p === 'number' && Number.isFinite(p) ? p : 0), 0);
}

// ─── Descripción (`product_description`) ───────────────────────────────────────────────────

export const ESTILOS_DESCRIPCION = ['ver_mas', 'pestanas', 'acordeon', 'tabla'] as const;
export type EstiloDescripcion = (typeof ESTILOS_DESCRIPCION)[number];
export const PARTES_DESCRIPCION = ['descripcion', 'especificaciones', 'envio', 'preguntas'] as const;
export type ParteDescripcion = (typeof PARTES_DESCRIPCION)[number];
export const LINEAS_VER_MAS = [3, 5, 8] as const;
export const CELULAR_DESCRIPCION = ['igual', 'acordeon'] as const;
export type CelularDescripcion = (typeof CELULAR_DESCRIPCION)[number];
export const FILAS_FICHA = ['marca', 'referencia', 'medidas', 'peso', 'garantia', 'categoria'] as const;
export type FilaFicha = (typeof FILAS_FICHA)[number];
export const COLORES_PESTANA = ['tienda', 'texto'] as const;
export type ColorPestana = (typeof COLORES_PESTANA)[number];
export const VINETAS = ['punto', 'check', 'numero'] as const;
export type Vineta = (typeof VINETAS)[number];
export const TABLAS_FICHA = ['rayada', 'lineas', 'sin'] as const;
export type TablaFicha = (typeof TABLAS_FICHA)[number];
export const ANCHOS_TEXTO = ['comodo', 'completo'] as const;
export type AnchoTexto = (typeof ANCHOS_TEXTO)[number];
export const TAMANOS_TEXTO = ['sm', 'md', 'lg'] as const;
export type TamanoTexto = (typeof TAMANOS_TEXTO)[number];

export const CLAVES_DESCRIPCION = {
  estilo: 'description_style',
  partes: 'parts',
  abierta: 'open_first',
  lineas: 'lines_before_more',
  celular: 'mobile_mode',
  variasAbiertas: 'multi_open',
  tituloDescripcion: 'title_description',
  tituloEspecificaciones: 'title_specs',
  tituloEnvio: 'title_shipping',
  tituloPreguntas: 'title_faq',
  filas: 'spec_rows',
  ocultarVacias: 'hide_empty_rows',
  filasPropias: 'show_custom_rows',
  colorPestana: 'active_tab_color',
  vinetas: 'bullets',
  tabla: 'specs_table',
  ancho: 'text_width',
  tamanoTexto: 'text_size',
} as const;
export const CLAVES_NUEVAS_DESCRIPCION: readonly string[] = Object.values(CLAVES_DESCRIPCION);

export const TITULOS_PARTES_POR_DEFECTO: Readonly<Record<ParteDescripcion, string>> = {
  descripcion: 'Descripción',
  especificaciones: 'Especificaciones',
  envio: 'Envío y devoluciones',
  preguntas: 'Preguntas frecuentes',
};

export const ETIQUETAS_FILA_FICHA: Readonly<Record<FilaFicha, string>> = {
  marca: 'Marca',
  referencia: 'Referencia',
  medidas: 'Medidas (largo × ancho × alto)',
  peso: 'Peso',
  garantia: 'Garantía',
  categoria: 'Categoría',
};

export interface OpcionesDescripcion {
  conOpciones: boolean;
  estilo: EstiloDescripcion;
  partes: ParteDescripcion[];
  abierta: ParteDescripcion;
  /** `null` = corte por letras (hoy, `max_height` = 180). */
  lineas: number | null;
  letras: number;
  celular: CelularDescripcion;
  variasAbiertas: boolean;
  titulos: Record<ParteDescripcion, string>;
  filas: FilaFicha[];
  ocultarVacias: boolean;
  filasPropias: boolean;
  colorPestana: ColorPestana;
  vinetas: Vineta;
  tabla: TablaFicha;
  ancho: AnchoTexto;
  tamanoTexto: TamanoTexto;
}

export function leerOpcionesDescripcion(contenido: Contenido): OpcionesDescripcion {
  const c = (contenido ?? {}) as Record<string, unknown>;
  const k = CLAVES_DESCRIPCION;
  const estilo = uno(c[k.estilo], ESTILOS_DESCRIPCION, 'ver_mas');
  const partesCrudas = Array.isArray(c[k.partes]) ? (c[k.partes] as unknown[]) : null;
  const partes = partesCrudas
    ? (partesCrudas.filter((p, i) => (PARTES_DESCRIPCION as readonly unknown[]).includes(p) && partesCrudas.indexOf(p) === i) as ParteDescripcion[])
    : (['descripcion', 'especificaciones', 'envio'] as ParteDescripcion[]);
  const partesFinales: ParteDescripcion[] = partes.length > 0 ? partes : ['descripcion'];
  const abierta = uno(c[k.abierta], PARTES_DESCRIPCION, partesFinales[0]);
  const lineas = entero(c[k.lineas], 1, 20);
  const filasCrudas = Array.isArray(c[k.filas]) ? (c[k.filas] as unknown[]) : null;
  return {
    conOpciones: tieneAlguna(c, CLAVES_NUEVAS_DESCRIPCION),
    estilo,
    partes: partesFinales,
    abierta: partesFinales.includes(abierta) ? abierta : partesFinales[0],
    lineas: lineas && (LINEAS_VER_MAS as readonly number[]).includes(lineas) ? lineas : null,
    letras: entero(c.max_height, 20, 5000) ?? 180,
    celular: uno(c[k.celular], CELULAR_DESCRIPCION, 'igual'),
    variasAbiertas: bool(c[k.variasAbiertas], false),
    titulos: {
      descripcion: texto(c[k.tituloDescripcion], 60) ?? TITULOS_PARTES_POR_DEFECTO.descripcion,
      especificaciones: texto(c[k.tituloEspecificaciones], 60) ?? TITULOS_PARTES_POR_DEFECTO.especificaciones,
      envio: texto(c[k.tituloEnvio], 60) ?? TITULOS_PARTES_POR_DEFECTO.envio,
      preguntas: texto(c[k.tituloPreguntas], 60) ?? TITULOS_PARTES_POR_DEFECTO.preguntas,
    },
    filas: filasCrudas ? FILAS_FICHA.filter((f) => filasCrudas.includes(f)) : [...FILAS_FICHA],
    ocultarVacias: bool(c[k.ocultarVacias], true),
    filasPropias: bool(c[k.filasPropias], true),
    colorPestana: uno(c[k.colorPestana], COLORES_PESTANA, 'tienda'),
    vinetas: uno(c[k.vinetas], VINETAS, 'punto'),
    tabla: uno(c[k.tabla], TABLAS_FICHA, 'rayada'),
    ancho: uno(c[k.ancho], ANCHOS_TEXTO, 'comodo'),
    tamanoTexto: uno(c[k.tamanoTexto], TAMANOS_TEXTO, 'md'),
  };
}

/** Tamaño del texto en px (md = 15, Figma). */
export const PX_TEXTO: Readonly<Record<TamanoTexto, number>> = { sm: 14, md: 15, lg: 17 };

// ─── Filas propias de la ficha técnica (`products.specifications`) ─────────────────────────

export interface FilaFichaPropia {
  nombre: string;
  valor: string;
}

export const MAX_FILAS_PROPIAS = 30;
export const MAX_NOMBRE_FILA = 60;
export const MAX_VALOR_FILA = 200;

/** Filas válidas de `products.specifications` (nunca lanza; descarta las vacías). */
export function leerFilasPropias(valor: unknown): FilaFichaPropia[] {
  if (!Array.isArray(valor)) return [];
  const filas: FilaFichaPropia[] = [];
  for (const crudo of valor) {
    if (!crudo || typeof crudo !== 'object') continue;
    const f = crudo as Record<string, unknown>;
    const nombre = texto(f.nombre, MAX_NOMBRE_FILA);
    const v = texto(f.valor, MAX_VALOR_FILA);
    if (nombre && v) filas.push({ nombre, valor: v });
    if (filas.length >= MAX_FILAS_PROPIAS) break;
  }
  return filas;
}

/** Lo que se guarda en `products.specifications`: filas limpias o `null` si no queda ninguna. */
export function filasParaGuardar(filas: readonly { nombre: string; valor: string }[]): FilaFichaPropia[] | null {
  const limpias = leerFilasPropias(filas);
  return limpias.length > 0 ? limpias : null;
}

// ─── Etiquetas de la ficha (`product_info`) ─────────────────────────────────────────────────
//
// Figma «16 Sitio web», sección 3036:78040 (aprobada por el dueño el 2026-11-24): las etiquetas de
// la tarjeta de producto también en la ficha. A = sobre la foto (esquinas de la galería); B = una
// fila junto al título y el precio, donde «2 X 1» y «Precio por volumen» se tocan para explicarse.
// El dueño aprobó las dos: se elige A, B o ambas.
//
// Viven en el contenido del bloque `product_info` (Información del producto). Sin `labels_show:
// true` la ficha se pinta EXACTAMENTE como hoy. Cuándo sale cada etiqueta, su texto y su color los
// decide la misma regla de la tarjeta (`etiquetasProducto.ts` en la tienda): una etiqueta apagada
// en «Estilo de tarjeta › Etiquetas» tampoco sale en la ficha. Aquí solo se elige dónde, cuáles,
// en qué orden y esquina, y el estilo (forma, relleno, tamaño y colores propios opcionales).
// `labels_custom` (etiquetas propias de la ficha) tiene la forma de `labels_custom` del estilo de
// tarjeta y se normaliza con `tarjetaProducto.ts`; sin lista, la ficha usa las del sitio.

export const TIPOS_ETIQUETA_FICHA = ['free_shipping', 'discount', 'promotion', 'volume', 'sales_count', 'new', 'sold_out', 'custom'] as const;
export type TipoEtiquetaFicha = (typeof TIPOS_ETIQUETA_FICHA)[number];

/** `foto` = A (sobre la foto), `titulo` = B (junto al título), `ambas` = A y B. */
export const UBICACIONES_ETIQUETAS_FICHA = ['foto', 'titulo', 'ambas'] as const;
export type UbicacionEtiquetasFicha = (typeof UBICACIONES_ETIQUETAS_FICHA)[number];

export const ESQUINAS_ETIQUETA_FICHA = ['top_left', 'top_right', 'bottom_left', 'bottom_right'] as const;
export type EsquinaEtiquetaFicha = (typeof ESQUINAS_ETIQUETA_FICHA)[number];

/** `tarjeta` = la forma o el relleno de «Estilo de tarjeta › Etiquetas». */
export const FORMAS_ETIQUETA_FICHA = ['tarjeta', 'pill', 'rounded', 'semi', 'square'] as const;
export type FormaEtiquetaFicha = (typeof FORMAS_ETIQUETA_FICHA)[number];
export const RELLENOS_ETIQUETA_FICHA = ['tarjeta', 'solid', 'soft', 'outline'] as const;
export type RellenoEtiquetaFicha = (typeof RELLENOS_ETIQUETA_FICHA)[number];
export const TAMANOS_ETIQUETA_FICHA = ['sm', 'md'] as const;
export type TamanoEtiquetaFicha = (typeof TAMANOS_ETIQUETA_FICHA)[number];

export const CLAVES_ETIQUETAS_FICHA = {
  mostrar: 'labels_show',
  ubicacion: 'labels_placement',
  items: 'labels_items',
  forma: 'labels_shape',
  relleno: 'labels_style',
  tamano: 'labels_size',
  propias: 'labels_custom',
} as const;
export const CLAVES_NUEVAS_ETIQUETAS: readonly string[] = Object.values(CLAVES_ETIQUETAS_FICHA);

/** Esquina de cada etiqueta en A (Figma 3037:78060). Las propias usan la suya. */
export const ESQUINA_ETIQUETA_POR_DEFECTO: Readonly<Record<TipoEtiquetaFicha, EsquinaEtiquetaFicha>> = {
  free_shipping: 'top_left',
  discount: 'top_left',
  promotion: 'top_right',
  volume: 'top_right',
  sales_count: 'bottom_left',
  new: 'top_left',
  sold_out: 'top_left',
  custom: 'top_right',
};

export interface EtiquetaFichaItem {
  id: TipoEtiquetaFicha;
  visible: boolean;
  /** Esquina en A (B es una fila: solo cuenta el orden). */
  esquina: EsquinaEtiquetaFicha;
  /** Colores propios de la ficha; null = los de la tarjeta. */
  bg: string | null;
  text: string | null;
}

export interface OpcionesEtiquetasFicha {
  /** `labels_show === true`. Sin él, la ficha de hoy. */
  mostrar: boolean;
  ubicacion: UbicacionEtiquetasFicha;
  /** Los 8 tipos, en el orden guardado (los que falten, al final en el orden por defecto). */
  items: EtiquetaFichaItem[];
  forma: FormaEtiquetaFicha;
  relleno: RellenoEtiquetaFicha;
  tamano: TamanoEtiquetaFicha;
  /** `labels_custom` tal cual (lo normaliza `tarjetaProducto.ts`); null = las del sitio. */
  propias: unknown[] | null;
}

export const UBICACION_ETIQUETAS_POR_DEFECTO: UbicacionEtiquetasFicha = 'titulo';

/** ¿La ubicación pinta A (foto) o B (título)? */
export function etiquetasEn(ubicacion: UbicacionEtiquetasFicha, donde: 'foto' | 'titulo'): boolean {
  return ubicacion === 'ambas' || ubicacion === donde;
}

/** Lista de etiquetas de la ficha: orden guardado y, al final, las que falten (visibles). */
export function leerItemsEtiquetasFicha(valor: unknown): EtiquetaFichaItem[] {
  const vistos = new Set<string>();
  const items: EtiquetaFichaItem[] = [];
  if (Array.isArray(valor)) {
    for (const crudo of valor) {
      if (!crudo || typeof crudo !== 'object') continue;
      const o = crudo as Record<string, unknown>;
      const id = typeof o.id === 'string' && (TIPOS_ETIQUETA_FICHA as readonly string[]).includes(o.id) ? (o.id as TipoEtiquetaFicha) : null;
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      items.push({
        id,
        visible: o.visible !== false,
        esquina: uno(o.corner, ESQUINAS_ETIQUETA_FICHA, ESQUINA_ETIQUETA_POR_DEFECTO[id]),
        bg: hexValido(o.bg),
        text: hexValido(o.text),
      });
    }
  }
  for (const id of TIPOS_ETIQUETA_FICHA) {
    if (!vistos.has(id)) items.push({ id, visible: true, esquina: ESQUINA_ETIQUETA_POR_DEFECTO[id], bg: null, text: null });
  }
  return items;
}

/** Lo que se guarda en `labels_items` (solo lo que difiere de lo de por defecto en cada item). */
export function itemsEtiquetasParaGuardar(items: readonly EtiquetaFichaItem[]): Array<Record<string, unknown>> {
  return items.map((i) => {
    const fila: Record<string, unknown> = { id: i.id };
    if (!i.visible) fila.visible = false;
    if (i.esquina !== ESQUINA_ETIQUETA_POR_DEFECTO[i.id]) fila.corner = i.esquina;
    if (i.bg) fila.bg = i.bg;
    if (i.text) fila.text = i.text;
    return fila;
  });
}

export function leerOpcionesEtiquetasFicha(contenido: Contenido): OpcionesEtiquetasFicha {
  const c = (contenido && typeof contenido === 'object' ? contenido : {}) as Record<string, unknown>;
  const k = CLAVES_ETIQUETAS_FICHA;
  return {
    mostrar: c[k.mostrar] === true,
    ubicacion: uno(c[k.ubicacion], UBICACIONES_ETIQUETAS_FICHA, UBICACION_ETIQUETAS_POR_DEFECTO),
    items: leerItemsEtiquetasFicha(c[k.items]),
    forma: uno(c[k.forma], FORMAS_ETIQUETA_FICHA, 'tarjeta'),
    relleno: uno(c[k.relleno], RELLENOS_ETIQUETA_FICHA, 'tarjeta'),
    tamano: uno(c[k.tamano], TAMANOS_ETIQUETA_FICHA, 'md'),
    propias: Array.isArray(c[k.propias]) ? (c[k.propias] as unknown[]) : null,
  };
}
