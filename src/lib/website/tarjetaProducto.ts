/**
 * Estilo de la tarjeta de producto (`product_card_style`).
 *
 * Vive en el tema del sitio (`tema.tarjetaProducto`) y se puede reemplazar en
 * una sección (`contenido.product_card_style`). Sin objeto, o con el preset
 * `actual` y sin más claves, la tarjeta se pinta como hoy.
 *
 * Código puro: sin React ni alias, para que el script de verificación lo cargue.
 */

/**
 * El sitio público rechaza `tema.tarjetaProducto` hasta que su contrato lo acepte
 * (cae a legacy). Apagado: el editor no escribe esa clave. El estilo de una sección
 * vive en `contenido.product_card_style` y el sitio actual lo ignora.
 */
export function tarjetaProductoTemaDisponible(): boolean {
  return process.env.NEXT_PUBLIC_WEBSITE_TARJETA_PRODUCTO === '1'
}

export const PRESETS_TARJETA = ['actual', 'minimal', 'boxed', 'overlay', 'compact', 'rich'] as const
export type PresetTarjeta = (typeof PRESETS_TARJETA)[number]

export const ESTILOS_BOTON = ['solid', 'outline', 'ghost', 'gradient', 'icon_only'] as const
export const FORMAS_BOTON = ['square', 'rounded', 'semi', 'pill', 'circle'] as const
export const TAMANOS_BOTON = ['sm', 'md', 'lg'] as const
export const ANCHOS_BOTON = ['full', 'auto'] as const
export const POSICIONES_BOTON = ['bottom', 'over_image_bottom', 'over_image_corner', 'inline_price'] as const
export const VISIBILIDAD_BOTON = ['always', 'hover'] as const
export const LADOS_ICONO = ['left', 'right'] as const
export const ICONOS_BOTON = ['Plus', 'ShoppingBag', 'ShoppingCart', 'Heart', 'Eye', 'ArrowRight', 'Zap', 'Star'] as const

export const FORMAS_ETIQUETA = ['square', 'rounded', 'semi', 'pill', 'circle'] as const
export const ESTILOS_ETIQUETA = ['solid', 'soft', 'outline', 'gradient'] as const
export const POSICIONES_ETIQUETA = ['top_left', 'top_right', 'bottom_left', 'bottom_right', 'over_title'] as const

export const ALINEACIONES = ['left', 'center', 'right'] as const
export const POSICIONES_PRECIO = ['below_title', 'above_title', 'beside_button', 'over_image'] as const
export const TAMANOS_TEXTO = ['sm', 'md', 'lg'] as const
export const POSICIONES_RESENA = ['above_title', 'below_title', 'over_image'] as const
export const ESTILOS_RESENA = ['stars', 'number_star'] as const
export const PESOS_TITULO = ['normal', 'medium', 'semibold', 'bold'] as const
export const SOMBRAS_TARJETA = ['none', 'sm', 'md', 'lg', 'xl', 'hover'] as const
export const RATIOS_IMAGEN = ['1:1', '4:5', '3:4', '4:3', '16:9'] as const
export const AJUSTES_IMAGEN = ['contain', 'cover', 'fill'] as const
export const HOVER_IMAGEN = ['none', 'zoom', 'second'] as const

export const TIPOS_SECCION_TARJETA = ['products_grid', 'featured_products', 'offers'] as const

/** En celular el botón con visibilidad `hover` se ve siempre. */
export const CLASE_BOTON_HOVER_MOVIL =
  'max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity'

export const CLASE_PESO_TITULO: Record<(typeof PESOS_TITULO)[number], string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}

export const CLASE_TAMANO_TITULO: Record<(typeof TAMANOS_TEXTO)[number], string> = {
  sm: 'text-xs sm:text-sm',
  md: 'text-sm sm:text-base',
  lg: 'text-base sm:text-lg',
}

export const CLASE_TAMANO_PRECIO: Record<(typeof TAMANOS_TEXTO)[number], string> = {
  sm: 'text-xs sm:text-sm',
  md: 'text-sm sm:text-lg',
  lg: 'text-base sm:text-xl',
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export interface EstiloBotonTarjeta {
  button_style?: (typeof ESTILOS_BOTON)[number]
  button_shape?: (typeof FORMAS_BOTON)[number]
  button_size?: (typeof TAMANOS_BOTON)[number]
  button_width?: (typeof ANCHOS_BOTON)[number]
  button_position?: (typeof POSICIONES_BOTON)[number]
  button_visibility?: (typeof VISIBILIDAD_BOTON)[number]
  bg?: string
  text?: string
  border?: string
  hover?: string
  gradient_1?: string
  gradient_2?: string
  gradient_angle?: number
  icon?: string
  icon_side?: (typeof LADOS_ICONO)[number]
  show?: boolean
}

export interface EstiloEtiquetaTarjeta {
  show?: boolean
  bg?: string
  text?: string
  border?: string
  gradient_1?: string
  gradient_2?: string
  gradient_angle?: number
}

export interface EstiloTarjetaProducto {
  card_preset?: PresetTarjeta
  add?: EstiloBotonTarjeta
  buy?: EstiloBotonTarjeta
  choose?: EstiloBotonTarjeta
  label_shape?: (typeof FORMAS_ETIQUETA)[number]
  label_style?: (typeof ESTILOS_ETIQUETA)[number]
  label_position?: (typeof POSICIONES_ETIQUETA)[number]
  label_new?: EstiloEtiquetaTarjeta
  label_shipping?: EstiloEtiquetaTarjeta
  label_discount?: EstiloEtiquetaTarjeta
  label_sold_out?: EstiloEtiquetaTarjeta
  text_align?: (typeof ALINEACIONES)[number]
  price_position?: (typeof POSICIONES_PRECIO)[number]
  price_size?: (typeof TAMANOS_TEXTO)[number]
  price_color?: string
  show_compare_price?: boolean
  show_reviews?: boolean
  reviews_position?: (typeof POSICIONES_RESENA)[number]
  reviews_style?: (typeof ESTILOS_RESENA)[number]
  title_lines?: 1 | 2 | 3
  title_weight?: (typeof PESOS_TITULO)[number]
  title_size?: (typeof TAMANOS_TEXTO)[number]
  show_brand?: boolean
  show_category?: boolean
  card_layout?: 'vertical' | 'horizontal'
  card_radius?: number
  card_border_width?: number
  card_border_color?: string
  card_shadow?: (typeof SOMBRAS_TARJETA)[number]
  card_bg?: string
  card_bg_2?: string
  card_bg_angle?: number
  card_padding?: number
  card_gap?: number
  image_ratio?: (typeof RATIOS_IMAGEN)[number]
  image_fit?: (typeof AJUSTES_IMAGEN)[number]
  image_bg?: string
  image_padding?: number
  image_radius?: number
  hover_image?: (typeof HOVER_IMAGEN)[number]
}

const CLAVES_BOTON = ['add', 'buy', 'choose'] as const
const CLAVES_ETIQUETA = ['label_new', 'label_shipping', 'label_discount', 'label_sold_out'] as const

type ClaveBoton = (typeof CLAVES_BOTON)[number]
type ClaveEtiqueta = (typeof CLAVES_ETIQUETA)[number]

function enLista<T extends string>(lista: readonly T[], valor: unknown): T | undefined {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor) ? (valor as T) : undefined
}

function entero(valor: unknown, min: number, max: number): number | undefined {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() ? Number(valor) : NaN
  if (!Number.isFinite(n)) return undefined
  const r = Math.round(n)
  if (r < min || r > max) return undefined
  return r
}

function bandera(valor: unknown): boolean | undefined {
  if (valor === true || valor === false) return valor
  return undefined
}

function color(valor: unknown): string | undefined {
  if (valor === 'transparent') return 'transparent'
  if (typeof valor !== 'string') return undefined
  const t = valor.trim()
  return HEX.test(t) ? t : undefined
}

function icono(valor: unknown): string | undefined {
  if (valor === '') return ''
  return enLista(ICONOS_BOTON, valor)
}

function boton(crudo: unknown): EstiloBotonTarjeta | undefined {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return undefined
  const o = crudo as Record<string, unknown>
  const b: EstiloBotonTarjeta = {}
  const estilo = enLista(ESTILOS_BOTON, o.button_style)
  const forma = enLista(FORMAS_BOTON, o.button_shape)
  if (estilo) b.button_style = estilo
  if (forma) b.button_shape = forma === 'circle' && estilo !== 'icon_only' ? 'pill' : forma
  const tam = enLista(TAMANOS_BOTON, o.button_size)
  if (tam) b.button_size = tam
  const ancho = enLista(ANCHOS_BOTON, o.button_width)
  if (ancho) b.button_width = ancho
  const pos = enLista(POSICIONES_BOTON, o.button_position)
  if (pos) b.button_position = pos
  const vis = enLista(VISIBILIDAD_BOTON, o.button_visibility)
  if (vis) b.button_visibility = vis
  const bg = color(o.bg)
  if (bg) b.bg = bg
  const text = color(o.text)
  if (text) b.text = text
  const border = color(o.border)
  if (border) b.border = border
  const hover = color(o.hover)
  if (hover) b.hover = hover
  const g1 = color(o.gradient_1)
  if (g1) b.gradient_1 = g1
  const g2 = color(o.gradient_2)
  if (g2) b.gradient_2 = g2
  const ang = entero(o.gradient_angle, 0, 360)
  if (ang != null) b.gradient_angle = ang
  if ('icon' in o) {
    const ic = icono(o.icon)
    if (ic != null) b.icon = ic
  }
  const lado = enLista(LADOS_ICONO, o.icon_side)
  if (lado) b.icon_side = lado
  const show = bandera(o.show)
  if (show != null) b.show = show
  return Object.keys(b).length > 0 ? b : undefined
}

function etiqueta(crudo: unknown): EstiloEtiquetaTarjeta | undefined {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return undefined
  const o = crudo as Record<string, unknown>
  const e: EstiloEtiquetaTarjeta = {}
  const show = bandera(o.show)
  if (show != null) e.show = show
  const bg = color(o.bg)
  if (bg) e.bg = bg
  const text = color(o.text)
  if (text) e.text = text
  const border = color(o.border)
  if (border) e.border = border
  const g1 = color(o.gradient_1)
  if (g1) e.gradient_1 = g1
  const g2 = color(o.gradient_2)
  if (g2) e.gradient_2 = g2
  const ang = entero(o.gradient_angle, 0, 360)
  if (ang != null) e.gradient_angle = ang
  return Object.keys(e).length > 0 ? e : undefined
}

/** Quita claves desconocidas y valores que no se pueden pintar. `null` si no queda nada. */
export function normalizarTarjeta(crudo: unknown): EstiloTarjetaProducto | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null
  const o = crudo as Record<string, unknown>
  const e: EstiloTarjetaProducto = {}
  const preset = enLista(PRESETS_TARJETA, o.card_preset)
  if (preset) e.card_preset = preset
  for (const k of CLAVES_BOTON) {
    const b = boton(o[k])
    if (b) e[k] = b
  }
  const forma = enLista(FORMAS_ETIQUETA, o.label_shape)
  if (forma) e.label_shape = forma
  const estiloEt = enLista(ESTILOS_ETIQUETA, o.label_style)
  if (estiloEt) e.label_style = estiloEt
  const posEt = enLista(POSICIONES_ETIQUETA, o.label_position)
  if (posEt) e.label_position = posEt
  for (const k of CLAVES_ETIQUETA) {
    const et = etiqueta(o[k])
    if (et) e[k] = et
  }
  const align = enLista(ALINEACIONES, o.text_align)
  if (align) e.text_align = align
  const precio = enLista(POSICIONES_PRECIO, o.price_position)
  if (precio) e.price_position = precio
  const tamPrecio = enLista(TAMANOS_TEXTO, o.price_size)
  if (tamPrecio) e.price_size = tamPrecio
  const colorPrecio = color(o.price_color)
  if (colorPrecio && colorPrecio !== 'transparent') e.price_color = colorPrecio
  const tachado = bandera(o.show_compare_price)
  if (tachado != null) e.show_compare_price = tachado
  const resenas = bandera(o.show_reviews)
  if (resenas != null) e.show_reviews = resenas
  const posRes = enLista(POSICIONES_RESENA, o.reviews_position)
  if (posRes) e.reviews_position = posRes
  const estRes = enLista(ESTILOS_RESENA, o.reviews_style)
  if (estRes) e.reviews_style = estRes
  const lineas = entero(o.title_lines, 1, 3)
  if (lineas === 1 || lineas === 2 || lineas === 3) e.title_lines = lineas
  const peso = enLista(PESOS_TITULO, o.title_weight)
  if (peso) e.title_weight = peso
  const tamTitulo = enLista(TAMANOS_TEXTO, o.title_size)
  if (tamTitulo) e.title_size = tamTitulo
  const marca = bandera(o.show_brand)
  if (marca != null) e.show_brand = marca
  const cat = bandera(o.show_category)
  if (cat != null) e.show_category = cat
  if (o.card_layout === 'horizontal' || o.card_layout === 'vertical') e.card_layout = o.card_layout
  const radio = entero(o.card_radius, 0, 48)
  if (radio != null) e.card_radius = radio
  const borde = entero(o.card_border_width, 0, 8)
  if (borde != null) e.card_border_width = borde
  const colorBorde = color(o.card_border_color)
  if (colorBorde && colorBorde !== 'transparent') e.card_border_color = colorBorde
  const sombra = enLista(SOMBRAS_TARJETA, o.card_shadow)
  if (sombra) e.card_shadow = sombra
  const fondo = color(o.card_bg)
  if (fondo) e.card_bg = fondo
  const fondo2 = color(o.card_bg_2)
  if (fondo2 && fondo2 !== 'transparent') e.card_bg_2 = fondo2
  const angFondo = entero(o.card_bg_angle, 0, 360)
  if (angFondo != null) e.card_bg_angle = angFondo
  const pad = entero(o.card_padding, 0, 48)
  if (pad != null) e.card_padding = pad
  const gap = entero(o.card_gap, 0, 64)
  if (gap != null) e.card_gap = gap
  const ratio = enLista(RATIOS_IMAGEN, o.image_ratio)
  if (ratio) e.image_ratio = ratio
  const fit = enLista(AJUSTES_IMAGEN, o.image_fit)
  if (fit) e.image_fit = fit
  const fondoImg = color(o.image_bg)
  if (fondoImg) e.image_bg = fondoImg
  const padImg = entero(o.image_padding, 0, 32)
  if (padImg != null) e.image_padding = padImg
  const radioImg = entero(o.image_radius, 0, 32)
  if (radioImg != null) e.image_radius = radioImg
  const hover = enLista(HOVER_IMAGEN, o.hover_image)
  if (hover) e.hover_image = hover
  return Object.keys(e).length > 0 ? e : null
}

function fusionarPlano<T extends object>(a?: T, b?: T): T | undefined {
  if (!a && !b) return undefined
  return { ...(a ?? ({} as T)), ...(b ?? ({} as T)) }
}

export function fusionarEstilos(a: EstiloTarjetaProducto, b: EstiloTarjetaProducto): EstiloTarjetaProducto {
  const out: EstiloTarjetaProducto = { ...a, ...b }
  for (const k of CLAVES_BOTON) out[k] = fusionarPlano(a[k], b[k])
  for (const k of CLAVES_ETIQUETA) out[k] = fusionarPlano(a[k], b[k])
  return out
}

const BOTON_AGREGAR: EstiloBotonTarjeta = {
  button_style: 'solid',
  button_shape: 'rounded',
  button_size: 'sm',
  button_width: 'full',
  button_position: 'bottom',
  button_visibility: 'always',
  icon_side: 'left',
}

const BOTON_COMPRAR: EstiloBotonTarjeta = {
  ...BOTON_AGREGAR,
  button_style: 'outline',
}

/**
 * Valores que el inspector muestra al elegir un preset. `actual` describe la
 * tarjeta de hoy; no se escribe en la tienda salvo que alguien edite una opción.
 */
export function valoresDePreset(preset: PresetTarjeta): EstiloTarjetaProducto {
  const base: EstiloTarjetaProducto = {
    card_preset: 'actual',
    add: { ...BOTON_AGREGAR },
    buy: { ...BOTON_COMPRAR },
    choose: { ...BOTON_AGREGAR },
    label_shape: 'pill',
    label_style: 'solid',
    label_position: 'top_left',
    label_discount: { show: true, bg: '#EF4444', text: '#FFFFFF' },
    label_sold_out: { show: true, bg: '#1F2937', text: '#FFFFFF' },
    label_new: { show: false, bg: '#10B981', text: '#FFFFFF' },
    label_shipping: { show: false, bg: '#3B82F6', text: '#FFFFFF' },
    text_align: 'left',
    price_position: 'below_title',
    price_size: 'md',
    show_compare_price: true,
    show_reviews: false,
    reviews_position: 'below_title',
    reviews_style: 'stars',
    title_lines: 2,
    title_weight: 'semibold',
    title_size: 'sm',
    show_brand: false,
    show_category: false,
    card_layout: 'vertical',
    card_radius: 12,
    card_border_width: 1,
    card_shadow: 'sm',
    image_ratio: '1:1',
    image_fit: 'cover',
    hover_image: 'zoom',
  }
  if (preset === 'actual') return base
  if (preset === 'minimal') {
    return fusionarEstilos(base, {
      card_preset: 'minimal',
      card_border_width: 0,
      card_shadow: 'none',
      card_radius: 0,
      card_bg: 'transparent',
      image_ratio: '4:5',
      text_align: 'center',
      hover_image: 'none',
      add: { button_style: 'ghost', button_shape: 'pill', button_width: 'auto' },
      buy: { show: false },
    })
  }
  if (preset === 'boxed') {
    return fusionarEstilos(base, {
      card_preset: 'boxed',
      card_radius: 16,
      card_border_width: 1,
      card_border_color: '#E5E7EB',
      card_shadow: 'sm',
      card_bg: '#FFFFFF',
    })
  }
  if (preset === 'overlay') {
    return fusionarEstilos(base, {
      card_preset: 'overlay',
      add: {
        button_position: 'over_image_bottom',
        button_visibility: 'hover',
        button_width: 'full',
        button_style: 'solid',
      },
      buy: { show: false },
    })
  }
  if (preset === 'compact') {
    return fusionarEstilos(base, {
      card_preset: 'compact',
      card_layout: 'horizontal',
      image_ratio: '1:1',
      add: { button_width: 'auto', button_size: 'sm' },
      buy: { button_width: 'auto', button_size: 'sm' },
    })
  }
  return fusionarEstilos(base, {
    card_preset: 'rich',
    show_reviews: true,
    show_compare_price: true,
    price_size: 'lg',
    label_shape: 'pill',
    label_new: { show: true },
    label_shipping: { show: true },
    label_discount: { show: true },
    label_sold_out: { show: true },
    add: { button_width: 'full', button_style: 'solid', button_size: 'md' },
    buy: { button_width: 'full', button_style: 'outline', button_size: 'md' },
  })
}

function soloPresetActual(e: EstiloTarjetaProducto): boolean {
  const claves = Object.keys(e).filter((k) => k !== 'card_preset')
  return e.card_preset === 'actual' && claves.length === 0
}

/**
 * Aplica el preset y deja que las claves escritas ganen. `null` si no hay nada
 * que cambiar respecto a la tarjeta de hoy.
 */
export function aplicarEstiloTarjeta(crudo: unknown): EstiloTarjetaProducto | null {
  const explicito = normalizarTarjeta(crudo)
  if (!explicito) return null
  if (soloPresetActual(explicito)) return null
  const preset = explicito.card_preset
  if (!preset || preset === 'actual') return explicito
  return fusionarEstilos(valoresDePreset(preset), explicito)
}

/** Sitio primero, sección después. `null` = pintar la tarjeta de hoy. */
export function resolverTarjetaProducto(sitio: unknown, seccion: unknown): EstiloTarjetaProducto | null {
  const a = aplicarEstiloTarjeta(sitio)
  const b = aplicarEstiloTarjeta(seccion)
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  const junto = fusionarEstilos(a, b)
  return soloPresetActual(junto) ? null : junto
}

/** Lo que ve el inspector: el preset rellena las opciones y lo guardado queda encima. */
export function vistaEditorTarjeta(guardado: unknown, heredado: unknown): EstiloTarjetaProducto {
  const g = normalizarTarjeta(guardado)
  const h = normalizarTarjeta(heredado)
  const preset = g?.card_preset ?? h?.card_preset ?? 'actual'
  const efectivo = resolverTarjetaProducto(heredado, guardado)
  return fusionarEstilos(valoresDePreset(preset), efectivo ?? {})
}

/** Al elegir un preset se rellenan las opciones. `actual` no cambia el render. */
export function estiloAlElegirPreset(preset: PresetTarjeta): EstiloTarjetaProducto {
  if (preset === 'actual') return { card_preset: 'actual' }
  return valoresDePreset(preset)
}

function esGrupoBoton(clave: string): clave is ClaveBoton {
  return (CLAVES_BOTON as readonly string[]).includes(clave)
}

function esGrupoEtiqueta(clave: string): clave is ClaveEtiqueta {
  return (CLAVES_ETIQUETA as readonly string[]).includes(clave)
}

/** Escribe una clave (`add.button_style`, `card_radius`, `label_new.show`) sin rellenar el resto. */
export function guardarCambioTarjeta(guardado: unknown, ruta: string, valor: unknown): EstiloTarjetaProducto {
  const base = normalizarTarjeta(guardado) ?? {}
  if (ruta === 'card_preset' && enLista(PRESETS_TARJETA, valor)) {
    return estiloAlElegirPreset(valor as PresetTarjeta)
  }
  const partes = ruta.split('.')
  if (partes.length === 2 && (esGrupoBoton(partes[0]) || esGrupoEtiqueta(partes[0]))) {
    const grupo = partes[0]
    const previo = (base[grupo] && typeof base[grupo] === 'object' ? { ...base[grupo] } : {}) as Record<string, unknown>
    if (valor == null || valor === '') delete previo[partes[1]]
    else previo[partes[1]] = valor
    const siguiente = normalizarTarjeta({ ...base, [grupo]: previo })
    return siguiente ?? { card_preset: 'actual' }
  }
  const plano = { ...base } as Record<string, unknown>
  if (valor == null || valor === '') delete plano[ruta]
  else plano[ruta] = valor
  return normalizarTarjeta(plano) ?? { card_preset: 'actual' }
}

/**
 * Claves que la sección de productos guardaba sueltas en su contenido y que hoy edita el panel
 * «Tarjeta de producto». El sitio las sigue leyendo (product_card_style gana clave a clave).
 */
export const CLAVES_TARJETA_EN_SECCION = [
  'card_radius',
  'card_shadow',
  'card_border_width',
  'card_border_color',
  'card_bg',
  'card_padding',
  'image_fit',
  'image_ratio',
  'text_align',
  'title_lines',
  'price_color',
  'show_compare_price',
] as const

/** Lo que la sección ya tenía guardado con las claves sueltas, leído como estilo de tarjeta. */
export function tarjetaDesdeClavesSeccion(contenido: unknown): EstiloTarjetaProducto | null {
  if (!contenido || typeof contenido !== 'object') return null
  const c = contenido as Record<string, unknown>
  const plano: Record<string, unknown> = {}
  for (const k of CLAVES_TARJETA_EN_SECCION) if (c[k] != null && c[k] !== '') plano[k] = c[k]
  if (!Object.keys(plano).length) return null
  const e = normalizarTarjeta(plano)
  return e && Object.keys(e).length ? e : null
}

/**
 * Lo que la sección hereda en el inspector: sus claves sueltas de siempre y, encima, el estilo
 * del sitio (mismo orden que pinta la tarjeta publicada).
 */
export function heredadoTarjetaSeccion(contenido: unknown, sitio: unknown): EstiloTarjetaProducto | undefined {
  const legado = tarjetaDesdeClavesSeccion(contenido)
  const deSitio = aplicarEstiloTarjeta(sitio)
  if (!legado) return deSitio ?? (sitio as EstiloTarjetaProducto | undefined)
  return deSitio ? fusionarEstilos(legado, deSitio) : legado
}

export function esSeccionTarjetaProducto(tipo: string | null | undefined): boolean {
  return !!tipo && (TIPOS_SECCION_TARJETA as readonly string[]).includes(tipo)
}

/** Separación entre tarjetas. `undefined` = la rejilla de hoy (`gap-3 sm:gap-6` o `gap-4`). */
export function separacionTarjetas(estilo: EstiloTarjetaProducto | null | undefined): { gap: string } | undefined {
  if (!estilo || estilo.card_gap == null) return undefined
  return { gap: `${estilo.card_gap}px` }
}

/** Radio del botón según la forma. El círculo solo aplica a `icon_only`. */
export function radioForma(forma: string | undefined, soloIcono: boolean): number | undefined {
  if (!forma) return undefined
  if (forma === 'circle') return soloIcono ? 9999 : undefined
  if (forma === 'square') return 0
  if (forma === 'rounded') return 8
  if (forma === 'semi') return 14
  if (forma === 'pill') return 9999
  return undefined
}

/** Posición que ya entiende la tarjeta (`below`, `overlay_*`, `beside_price`). */
export function posicionBotonInterna(pos: EstiloBotonTarjeta['button_position'] | undefined): string | undefined {
  if (pos === 'bottom') return 'below'
  if (pos === 'over_image_bottom') return 'overlay_bottom'
  if (pos === 'over_image_corner') return 'overlay_bottom_right'
  if (pos === 'inline_price') return 'beside_price'
  return undefined
}

export function posicionEtiquetaInterna(pos: string | undefined): string {
  if (pos === 'top_right') return 'top-right'
  if (pos === 'bottom_left') return 'bottom-left'
  if (pos === 'bottom_right') return 'bottom-right'
  if (pos === 'over_title') return 'over_title'
  return 'top-left'
}

export interface EtiquetaPintada {
  type: string
  label: string
  position: string
  shape: string
  bg_color?: string
  text_color?: string
  extra_style?: Record<string, string>
}

const ETIQUETA_BASE: Record<string, { type: string; label: string; bg: string; text: string }> = {
  label_discount: { type: 'discount', label: '-{value}%', bg: '#EF4444', text: '#FFFFFF' },
  label_sold_out: { type: 'out_of_stock', label: 'Agotado', bg: '#1F2937', text: '#FFFFFF' },
  label_new: { type: 'new', label: 'Nuevo', bg: '#10B981', text: '#FFFFFF' },
  label_shipping: { type: 'free_shipping', label: 'Envío gratis', bg: '#3B82F6', text: '#FFFFFF' },
}

function mezclaSuave(hex: string): string {
  if (!HEX.test(hex) || hex.length !== 7) return hex
  return `color-mix(in srgb, ${hex} 16%, white)`
}

function estiloEtiqueta(
  modo: EstiloTarjetaProducto['label_style'],
  bg: string,
  text: string,
  g1?: string,
  g2?: string,
  angulo?: number,
): { bg_color?: string; text_color?: string; extra_style?: Record<string, string> } {
  if (modo === 'soft') {
    return { bg_color: mezclaSuave(bg), text_color: bg }
  }
  if (modo === 'outline') {
    return {
      bg_color: 'transparent',
      text_color: bg,
      extra_style: { border: `1px solid ${bg}`, backgroundColor: 'transparent' },
    }
  }
  if (modo === 'gradient' && g1 && g2) {
    const ang = angulo ?? 135
    return {
      bg_color: 'transparent',
      text_color: text,
      extra_style: { backgroundImage: `linear-gradient(${ang}deg, ${g1}, ${g2})`, color: text },
    }
  }
  return { bg_color: bg, text_color: text }
}

/** `null` si el estilo no habla de etiquetas: se quedan las de hoy. */
export function etiquetasDeEstilo(estilo: EstiloTarjetaProducto | null | undefined): EtiquetaPintada[] | null {
  if (!estilo) return null
  const toca =
    estilo.label_shape != null ||
    estilo.label_style != null ||
    estilo.label_position != null ||
    estilo.label_new != null ||
    estilo.label_shipping != null ||
    estilo.label_discount != null ||
    estilo.label_sold_out != null
  if (!toca) return null
  const pos = posicionEtiquetaInterna(estilo.label_position)
  const shape = estilo.label_shape === 'rounded' ? 'rounded' : estilo.label_shape === 'semi' ? 'semi' : estilo.label_shape === 'square' ? 'square' : estilo.label_shape === 'circle' ? 'circle' : 'pill'
  const salida: EtiquetaPintada[] = []
  for (const clave of CLAVES_ETIQUETA) {
    const cfg = estilo[clave]
    const base = ETIQUETA_BASE[clave]
    const visiblePorDefecto = clave === 'label_discount' || clave === 'label_sold_out'
    const visible = cfg?.show ?? visiblePorDefecto
    if (!visible) continue
    const bg = cfg?.bg || base.bg
    const text = cfg?.text || base.text
    const pintado = estiloEtiqueta(estilo.label_style, bg, text, cfg?.gradient_1, cfg?.gradient_2, cfg?.gradient_angle)
    const forma = clave === 'label_discount' && estilo.label_shape === 'circle' ? 'circle' : shape
    salida.push({
      type: base.type,
      label: base.label,
      position: pos,
      shape: forma,
      ...pintado,
    })
  }
  return salida
}

/** Fondo de la tarjeta cuando hay dos colores. `undefined` = el fondo de siempre. */
export function fondoTarjeta(estilo: EstiloTarjetaProducto | null | undefined): Record<string, string> | undefined {
  if (!estilo?.card_bg || !estilo.card_bg_2) return undefined
  const ang = estilo.card_bg_angle ?? 180
  return { backgroundImage: `linear-gradient(${ang}deg, ${estilo.card_bg}, ${estilo.card_bg_2})` }
}

/** Claves con valor propio en la sección: las del estilo de tarjeta y las sueltas de siempre. */
export function clavesPropiasTarjeta(contenido: unknown): string[] {
  if (!contenido || typeof contenido !== 'object') return []
  const c = contenido as Record<string, unknown>
  const g = c.product_card_style && typeof c.product_card_style === 'object' ? (c.product_card_style as Record<string, unknown>) : {}
  const claves = Object.keys(g).filter((k) => k !== 'card_preset' && g[k] != null && g[k] !== '')
  for (const k of CLAVES_TARJETA_EN_SECCION) if (c[k] != null && c[k] !== '' && !claves.includes(k)) claves.push(k)
  return claves
}

/** Valores que se restablecen juntos (el fondo y su degradado son una sola opción). */
const GRUPO_RESTABLECER: Record<string, readonly string[]> = {
  card_bg: ['card_bg', 'card_bg_2', 'card_bg_angle'],
  card_bg_2: ['card_bg', 'card_bg_2', 'card_bg_angle'],
  card_bg_angle: ['card_bg', 'card_bg_2', 'card_bg_angle'],
}

/**
 * Restablece un valor: lo quita del estilo de tarjeta de la sección y, si es una de las claves
 * sueltas de siempre (CLAVES_TARJETA_EN_SECCION), también esa clave. Vuelve a mandar el preset
 * de la sección si tiene uno; si no, el estilo del sitio (o el de siempre). Lo demás no cambia.
 */
export function restablecerClaveTarjeta(contenido: Record<string, unknown>, clave: string): Record<string, unknown> {
  const siguiente = { ...contenido }
  const claves = GRUPO_RESTABLECER[clave] ?? [clave]
  for (const k of claves) if ((CLAVES_TARJETA_EN_SECCION as readonly string[]).includes(k)) delete siguiente[k]
  const g = siguiente.product_card_style
  if (g && typeof g === 'object') {
    const estilo = { ...(g as Record<string, unknown>) }
    for (const k of claves) delete estilo[k]
    if (Object.keys(estilo).length) siguiente.product_card_style = estilo
    else delete siguiente.product_card_style
  }
  return siguiente
}
