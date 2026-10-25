/**
 * Distribución de banners promocionales (`banner_layout` + `banner_style`).
 *
 * Sin esas claves, la sección se pinta como hoy (cuadrícula, carrusel o
 * apilado del campo `layout`). Este módulo no importa React ni alias.
 */

export const DISTRIBUCIONES = [
  'grid',
  'hero_plus_2',
  '2_plus_hero',
  'hero_plus_4',
  'split_50',
  'triple_center',
  'masonry',
  'full_stack',
  'carousel',
  'circles',
  'side_text',
] as const

export type Distribucion = (typeof DISTRIBUCIONES)[number]

export const MOVIL_BANNER = ['same', 'carousel', 'stack'] as const
export const FORMAS_BANNER = ['rect', 'rounded', 'semi', 'circle', 'arch'] as const
export const SOMBRAS_BANNER = ['none', 'sm', 'md', 'lg'] as const
export const HOVER_BANNER = ['none', 'zoom', 'lift', 'darken', 'reveal', 'second'] as const
export const AJUSTES_BANNER = ['cover', 'contain'] as const
export const FOCALES = ['center', 'top', 'bottom', 'left', 'right'] as const
export const ALINEACIONES = ['left', 'center', 'right'] as const
export const VALIGN = ['top', 'center', 'bottom'] as const
export const OVERLAY_POS = ['bottom', 'left', 'full'] as const
export const ESTILOS_BOTON = ['solid', 'outline', 'ghost', 'gradient', 'icon_only'] as const
export const FORMAS_BOTON = ['square', 'rounded', 'semi', 'pill', 'circle'] as const
export const TAMANOS_BOTON = ['sm', 'md', 'lg'] as const
export const POSICIONES_BOTON = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'] as const

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export interface CeldaBanner {
  index: number
  col: number
  row: number
  colSpan: number
  rowSpan: number
  /** El del centro en `triple_center` es más alto. */
  destacada?: boolean
}

export interface BloqueBanner {
  columnas: number
  filas: number
  plantilla: string
  celdas: CeldaBanner[]
}

export interface EstiloBanners {
  mobile_layout?: (typeof MOVIL_BANNER)[number]
  last_full?: boolean
  columns_desktop?: number
  columns_tablet?: number
  columns_mobile?: number
  slides?: number
  autoplay?: boolean
  interval_ms?: number
  show_arrows?: boolean
  show_dots?: boolean
  show_overlay_text?: boolean
  text_align?: (typeof ALINEACIONES)[number]
  text_valign?: (typeof VALIGN)[number]
  title_size?: 'sm' | 'md' | 'lg'
  title_weight?: 'normal' | 'medium' | 'semibold' | 'bold'
  text_color?: string
  overlay?: 'none' | 'solid' | 'gradient'
  overlay_color?: string
  overlay_color_2?: string
  overlay_angle?: number
  overlay_opacity?: number
  overlay_position?: (typeof OVERLAY_POS)[number]
  button_on?: boolean
  button_style?: (typeof ESTILOS_BOTON)[number]
  button_shape?: (typeof FORMAS_BOTON)[number]
  button_size?: (typeof TAMANOS_BOTON)[number]
  button_position?: (typeof POSICIONES_BOTON)[number]
  button_bg?: string
  button_color?: string
  button_border?: string
  button_hover?: string
  button_gradient_1?: string
  button_gradient_2?: string
  button_gradient_angle?: number
  banner_shape?: (typeof FORMAS_BANNER)[number]
  banner_radius?: number
  border_width?: number
  border_color?: string
  shadow?: (typeof SOMBRAS_BANNER)[number]
  gap?: number
  section_margin?: number
  section_bg?: string
  section_bg_2?: string
  section_bg_angle?: number
  hover?: (typeof HOVER_BANNER)[number]
}

export interface ConfigBanners {
  layout: Distribucion
  estilo: EstiloBanners
  /** Sobra uno: ocupa toda la fila. Por defecto sí, para no dejar un hueco. */
  ultimoAncho: boolean
}

const CLAVES_BANNER_NUEVAS = [
  'image_url_mobile',
  'focal_point',
  'alt',
  'kicker',
  'show_overlay_text',
  'image_url_hover',
  'text_align',
  'text_valign',
] as const

function enLista<T extends string>(lista: readonly T[], valor: unknown): T | undefined {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor) ? (valor as T) : undefined
}

function entero(valor: unknown, min: number, max: number): number | undefined {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() ? Number(valor) : NaN
  if (!Number.isFinite(n)) return undefined
  const r = Math.round(n)
  return r >= min && r <= max ? r : undefined
}

function bandera(valor: unknown): boolean | undefined {
  return valor === true || valor === false ? valor : undefined
}

function color(valor: unknown): string | undefined {
  if (valor === 'transparent') return 'transparent'
  if (typeof valor !== 'string' || !HEX.test(valor.trim())) return undefined
  return valor.trim()
}

/** Cuántos banners completan un grupo. 0 = cualquier cantidad. */
export function grupoDistribucion(layout: Distribucion): number {
  if (layout === 'hero_plus_2' || layout === '2_plus_hero' || layout === 'triple_center') return 3
  if (layout === 'hero_plus_4') return 5
  if (layout === 'split_50') return 2
  return 0
}

export function normalizarEstiloBanners(crudo: unknown): EstiloBanners | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null
  const o = crudo as Record<string, unknown>
  const e: EstiloBanners = {}
  const movil = enLista(MOVIL_BANNER, o.mobile_layout)
  if (movil) e.mobile_layout = movil
  const ultimo = bandera(o.last_full)
  if (ultimo != null) e.last_full = ultimo
  const cd = entero(o.columns_desktop, 1, 6)
  if (cd != null) e.columns_desktop = cd
  const ct = entero(o.columns_tablet, 1, 4)
  if (ct != null) e.columns_tablet = ct
  const cm = entero(o.columns_mobile, 1, 2)
  if (cm != null) e.columns_mobile = cm
  const slides = entero(o.slides, 1, 4)
  if (slides != null) e.slides = slides
  const auto = bandera(o.autoplay)
  if (auto != null) e.autoplay = auto
  const intervalo = entero(o.interval_ms, 1500, 20000)
  if (intervalo != null) e.interval_ms = intervalo
  const flechas = bandera(o.show_arrows)
  if (flechas != null) e.show_arrows = flechas
  const puntos = bandera(o.show_dots)
  if (puntos != null) e.show_dots = puntos
  const texto = bandera(o.show_overlay_text)
  if (texto != null) e.show_overlay_text = texto
  const align = enLista(ALINEACIONES, o.text_align)
  if (align) e.text_align = align
  const valign = enLista(VALIGN, o.text_valign)
  if (valign) e.text_valign = valign
  const tam = enLista(['sm', 'md', 'lg'] as const, o.title_size)
  if (tam) e.title_size = tam
  const peso = enLista(['normal', 'medium', 'semibold', 'bold'] as const, o.title_weight)
  if (peso) e.title_weight = peso
  const tc = color(o.text_color)
  if (tc && tc !== 'transparent') e.text_color = tc
  const overlay = enLista(['none', 'solid', 'gradient'] as const, o.overlay)
  if (overlay) e.overlay = overlay
  const oc = color(o.overlay_color)
  if (oc) e.overlay_color = oc
  const oc2 = color(o.overlay_color_2)
  if (oc2 && oc2 !== 'transparent') e.overlay_color_2 = oc2
  const ang = entero(o.overlay_angle, 0, 360)
  if (ang != null) e.overlay_angle = ang
  const op = entero(o.overlay_opacity, 0, 100)
  if (op != null) e.overlay_opacity = op
  const opos = enLista(OVERLAY_POS, o.overlay_position)
  if (opos) e.overlay_position = opos
  const bon = bandera(o.button_on)
  if (bon != null) e.button_on = bon
  const bs = enLista(ESTILOS_BOTON, o.button_style)
  if (bs) e.button_style = bs
  const bf = enLista(FORMAS_BOTON, o.button_shape)
  if (bf) e.button_shape = bf === 'circle' && bs !== 'icon_only' ? 'pill' : bf
  const bt = enLista(TAMANOS_BOTON, o.button_size)
  if (bt) e.button_size = bt
  const bp = enLista(POSICIONES_BOTON, o.button_position)
  if (bp) e.button_position = bp
  const bbg = color(o.button_bg)
  if (bbg) e.button_bg = bbg
  const bcol = color(o.button_color)
  if (bcol && bcol !== 'transparent') e.button_color = bcol
  const bbor = color(o.button_border)
  if (bbor) e.button_border = bbor
  const bh = color(o.button_hover)
  if (bh) e.button_hover = bh
  const g1 = color(o.button_gradient_1)
  if (g1 && g1 !== 'transparent') e.button_gradient_1 = g1
  const g2 = color(o.button_gradient_2)
  if (g2 && g2 !== 'transparent') e.button_gradient_2 = g2
  const ga = entero(o.button_gradient_angle, 0, 360)
  if (ga != null) e.button_gradient_angle = ga
  const forma = enLista(FORMAS_BANNER, o.banner_shape)
  if (forma) e.banner_shape = forma
  const radio = entero(o.banner_radius, 0, 48)
  if (radio != null) e.banner_radius = radio
  const borde = entero(o.border_width, 0, 8)
  if (borde != null) e.border_width = borde
  const bc = color(o.border_color)
  if (bc && bc !== 'transparent') e.border_color = bc
  const sombra = enLista(SOMBRAS_BANNER, o.shadow)
  if (sombra) e.shadow = sombra
  const gap = entero(o.gap, 0, 64)
  if (gap != null) e.gap = gap
  const margen = entero(o.section_margin, 0, 80)
  if (margen != null) e.section_margin = margen
  const sbg = color(o.section_bg)
  if (sbg) e.section_bg = sbg
  const sbg2 = color(o.section_bg_2)
  if (sbg2 && sbg2 !== 'transparent') e.section_bg_2 = sbg2
  const sang = entero(o.section_bg_angle, 0, 360)
  if (sang != null) e.section_bg_angle = sang
  const hover = enLista(HOVER_BANNER, o.hover)
  if (hover) e.hover = hover
  return Object.keys(e).length > 0 ? e : null
}

function bannerTieneClaveNueva(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false
  const o = item as Record<string, unknown>
  return CLAVES_BANNER_NUEVAS.some((k) => o[k] != null && o[k] !== '')
}

/**
 * `null` = pintar la sección como hoy.
 * `grid` sin estilo y sin claves nuevas en los banners tampoco cambia nada.
 */
export function usarDistribucionNueva(content: unknown): ConfigBanners | null {
  if (!content || typeof content !== 'object') return null
  const c = content as Record<string, unknown>
  const layout = enLista(DISTRIBUCIONES, c.banner_layout)
  const estilo = normalizarEstiloBanners(c.banner_style)
  const lista = Array.isArray(c.banners) ? c.banners : []
  const algunoNuevo = lista.some(bannerTieneClaveNueva)
  if (!layout && !estilo && !algunoNuevo) return null
  if ((!layout || layout === 'grid') && !estilo && !algunoNuevo) return null
  return {
    layout: layout ?? 'grid',
    estilo: estilo ?? {},
    ultimoAncho: estilo?.last_full !== false,
  }
}

function celda(index: number, col: number, row: number, colSpan = 1, rowSpan = 1, destacada = false): CeldaBanner {
  return { index, col, row, colSpan, rowSpan, ...(destacada ? { destacada: true } : {}) }
}

function patron(layout: Distribucion, inicio: number): BloqueBanner {
  if (layout === 'hero_plus_2') {
    return {
      columnas: 2,
      filas: 2,
      plantilla: '2fr 1fr',
      celdas: [
        celda(inicio, 1, 1, 1, 2),
        celda(inicio + 1, 2, 1),
        celda(inicio + 2, 2, 2),
      ],
    }
  }
  if (layout === '2_plus_hero') {
    return {
      columnas: 2,
      filas: 2,
      plantilla: '1fr 2fr',
      celdas: [
        celda(inicio, 1, 1),
        celda(inicio + 1, 1, 2),
        celda(inicio + 2, 2, 1, 1, 2),
      ],
    }
  }
  if (layout === 'hero_plus_4') {
    return {
      columnas: 4,
      filas: 2,
      plantilla: '2fr 2fr 1fr 1fr',
      celdas: [
        celda(inicio, 1, 1, 2, 2),
        celda(inicio + 1, 3, 1),
        celda(inicio + 2, 4, 1),
        celda(inicio + 3, 3, 2),
        celda(inicio + 4, 4, 2),
      ],
    }
  }
  if (layout === 'split_50') {
    return {
      columnas: 2,
      filas: 1,
      plantilla: '1fr 1fr',
      celdas: [celda(inicio, 1, 1), celda(inicio + 1, 2, 1)],
    }
  }
  return {
    columnas: 3,
    filas: 1,
    plantilla: '1fr 1.2fr 1fr',
    celdas: [celda(inicio, 1, 1), celda(inicio + 1, 2, 1, 1, 1, true), celda(inicio + 2, 3, 1)],
  }
}

function fila(indices: number[]): BloqueBanner {
  return {
    columnas: indices.length,
    filas: 1,
    plantilla: `repeat(${indices.length}, minmax(0, 1fr))`,
    celdas: indices.map((index, i) => celda(index, i + 1, 1)),
  }
}

/**
 * Grupos completos y, si sobra, una fila llena (o el último a todo el ancho).
 * Con `ultimoAncho` en falso, el sobrante no entra: así no queda un hueco ni un banner suelto.
 */
/** Con menos banners que el grupo, la pieza que hay ocupa su lugar (grande, mitad, centro) y no se estira a una fila igual. */
function parcial(layout: Distribucion, n: number): BloqueBanner {
  if (layout === 'split_50') {
    return {
      columnas: 2,
      filas: 1,
      plantilla: '1fr 1fr',
      celdas: Array.from({ length: n }, (_, i) => celda(i, i + 1, 1)),
    }
  }
  if (layout === 'triple_center') {
    if (n === 1) {
      return { columnas: 3, filas: 1, plantilla: '1fr 1.4fr 1fr', celdas: [celda(0, 2, 1, 1, 1, true)] }
    }
    return {
      columnas: 3,
      filas: 1,
      plantilla: '1fr 1.4fr 1fr',
      celdas: [celda(0, 1, 1), celda(1, 2, 1, 1, 1, true)].slice(0, n),
    }
  }
  if (layout === 'hero_plus_2' || layout === '2_plus_hero') {
    const derecha = layout === '2_plus_hero'
    const plantilla = derecha ? '1fr 2fr' : '2fr 1fr'
    if (n === 1) {
      return { columnas: 2, filas: 2, plantilla, celdas: [celda(0, derecha ? 2 : 1, 1, 1, 2)] }
    }
    return derecha
      ? { columnas: 2, filas: 2, plantilla, celdas: [celda(0, 1, 1), celda(1, 2, 1, 1, 2)] }
      : { columnas: 2, filas: 2, plantilla, celdas: [celda(0, 1, 1, 1, 2), celda(1, 2, 1)] }
  }
  if (layout === 'hero_plus_4') {
    const celdas = [celda(0, 1, 1, 2, 2)]
    for (let i = 1; i < n; i++) celdas.push(celda(i, 3 + ((i - 1) % 2), 1 + Math.floor((i - 1) / 2)))
    return { columnas: 4, filas: 2, plantilla: '2fr 2fr 1fr 1fr', celdas }
  }
  return fila(Array.from({ length: n }, (_, i) => i))
}

export function bloquesDistribucion(layout: Distribucion, cantidad: number, ultimoAncho: boolean): BloqueBanner[] {
  const grupo = grupoDistribucion(layout)
  const n = Math.max(0, Math.floor(cantidad))
  if (n === 0 || grupo === 0) return []
  if (n < grupo) return [parcial(layout, n)]
  const grupos = Math.floor(n / grupo)
  const resto = n % grupo
  const bloques: BloqueBanner[] = []
  for (let g = 0; g < grupos; g++) bloques.push(patron(layout, g * grupo))
  if (resto > 0 && ultimoAncho) {
    const indices = Array.from({ length: resto }, (_, i) => grupos * grupo + i)
    bloques.push(resto === 1 ? fila(indices) : fila(indices))
  }
  return bloques
}

/** Todas las celdas del rectángulo, sin pisarse. */
export function cubreSinHuecos(bloque: BloqueBanner): boolean {
  const ocupado = new Set<string>()
  for (const c of bloque.celdas) {
    for (let x = c.col; x < c.col + c.colSpan; x++) {
      for (let y = c.row; y < c.row + c.rowSpan; y++) {
        if (x < 1 || y < 1 || x > bloque.columnas || y > bloque.filas) return false
        const clave = `${x},${y}`
        if (ocupado.has(clave)) return false
        ocupado.add(clave)
      }
    }
  }
  return ocupado.size === bloque.columnas * bloque.filas
}

export interface AvisoBanners {
  tipo: 'ok' | 'falta' | 'sobra'
  texto: string
}

/** Qué le dice el editor al armar la distribución. `null` si cualquier cantidad sirve. */
export function avisoDistribucion(layout: Distribucion, cantidad: number, ultimoAncho: boolean): AvisoBanners | null {
  const grupo = grupoDistribucion(layout)
  if (grupo === 0) return null
  const n = Math.max(0, Math.floor(cantidad))
  if (n === 0) return { tipo: 'falta', texto: `Esta distribución pide ${grupo} banners.` }
  if (n < grupo) {
    return { tipo: 'falta', texto: `Pide ${grupo} banners. Hay ${n}: faltan ${grupo - n}.` }
  }
  const resto = n % grupo
  if (resto === 0) return { tipo: 'ok', texto: `${n} banners, en grupos de ${grupo}.` }
  if (!ultimoAncho) {
    return {
      tipo: 'sobra',
      texto: `Pide grupos de ${grupo}. Sobran ${resto}: no se muestran, para no dejar un hueco.`,
    }
  }
  if (resto === 1) {
    return { tipo: 'sobra', texto: `Pide grupos de ${grupo}. Sobra 1: ocupa el ancho completo.` }
  }
  return { tipo: 'sobra', texto: `Pide grupos de ${grupo}. Sobran ${resto}: se acomodan en una fila, sin huecos.` }
}

export function radioBotonBanner(forma: string | undefined, soloIcono: boolean): number | undefined {
  if (!forma) return undefined
  if (forma === 'circle') return soloIcono ? 9999 : undefined
  if (forma === 'square') return 0
  if (forma === 'rounded') return 8
  if (forma === 'semi') return 14
  if (forma === 'pill') return 9999
  return undefined
}

/** `object-position` seguro. Acepta un nombre o «x% y%». */
export function posicionFocal(valor: unknown): string | undefined {
  const nombre = enLista(FOCALES, valor)
  if (nombre === 'center') return 'center'
  if (nombre === 'top') return 'center top'
  if (nombre === 'bottom') return 'center bottom'
  if (nombre === 'left') return 'left center'
  if (nombre === 'right') return 'right center'
  if (typeof valor !== 'string') return undefined
  const partes = valor.trim().split(/\s+/)
  if (partes.length !== 2) return undefined
  const ok = partes.every((p) => /^\d{1,3}%$/.test(p) && Number(p.slice(0, -1)) <= 100)
  return ok ? partes.join(' ') : undefined
}
