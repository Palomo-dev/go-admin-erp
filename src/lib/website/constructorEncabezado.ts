/**
 * Constructor del encabezado. Sin `header_builder` y con `search_style` en
 * icon | bar | hidden (o ausente), devuelve null: el header y el buscador de hoy.
 * Puro. El ERP guarda una copia idéntica.
 */

export const ZONAS = [
  'topbar_left', 'topbar_center', 'topbar_right',
  'header_left', 'header_center', 'header_right',
  'menu_left', 'menu_center', 'menu_right',
  'mobile_header', 'mobile_bottom',
] as const
export type ZonaHeader = (typeof ZONAS)[number]

export const TIPOS = ['logo', 'menu', 'search', 'currency', 'cart', 'account', 'favorites', 'whatsapp', 'phone', 'social', 'text', 'button'] as const
export type TipoElemento = (typeof TIPOS)[number]

export const BUSCADORES_NUEVOS = ['mini', 'icon_overlay', 'mega', 'pill_floating'] as const
export type BuscadorNuevo = (typeof BUSCADORES_NUEVOS)[number] | 'bar'

export const ACCIONES_BOTON = ['link', 'whatsapp', 'call', 'cart', 'search', 'menu', 'modal', 'category', 'download'] as const
export const ESTILOS_BOTON = ['solid', 'outline', 'ghost', 'gradient', 'icon_only'] as const
export const FORMAS = ['square', 'rounded', 'semi', 'pill', 'circle'] as const

export interface ElementoZona {
  id: string
  type: TipoElemento
  label?: string
  buttonId?: string
  desktop: boolean
  tablet: boolean
  mobile: boolean
}

export interface IconoElemento {
  icon?: string
  weight?: 'contorno' | 'relleno' | 'duotono'
  stroke?: number
  size?: number
  container?: 'none' | 'circle' | 'rounded' | 'square'
  color?: string
  background?: string
  border?: string
  hover?: string
  label?: string
  labelPos?: 'below' | 'side'
  badgeColor?: string
}

export interface BotonHeader {
  id: string
  text: string
  icon?: string
  iconSide?: 'left' | 'right'
  action: (typeof ACCIONES_BOTON)[number]
  href?: string
  message?: string
  style: (typeof ESTILOS_BOTON)[number]
  shape: (typeof FORMAS)[number]
  size: 'sm' | 'md' | 'lg'
  color?: string
  textColor?: string
  hover?: string
}

export interface ColumnaMega {
  title: string
  links: { label: string; href: string }[]
  image?: string
  imageHref?: string
  /** Categoría padre: sus hijas arman los enlaces si la lista manual viene vacía. */
  categoryId?: number
  text?: string
  products?: boolean
}

export interface MegaItem {
  href: string
  columns: number
  width: 'content' | 'full'
  open: 'hover' | 'click'
  animation: 'fade' | 'slide'
  background?: string
  shadow: boolean
  radius: number
  dividers: boolean
  columnas: ColumnaMega[]
}

export interface CromoBuscador {
  tipo: BuscadorNuevo
  placeholder?: string
  width?: number
  border: 'none' | 'thin' | 'thick'
  borderColor?: string
  radius: (typeof FORMAS)[number]
  shadow: boolean
  background?: string
  icon?: string
  iconSide: 'left' | 'right'
  iconColor?: string
  iconBackground?: string
  button: 'none' | 'text' | 'icon'
  mobile: 'icon' | 'bar' | 'fullscreen'
}

export interface ConstructorEncabezado {
  zonas: Partial<Record<ZonaHeader, ElementoZona[]>> | null
  iconos: Partial<Record<string, IconoElemento>> | null
  botones: BotonHeader[] | null
  mega: MegaItem[] | null
  buscador: CromoBuscador | null
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function enLista<T extends string>(lista: readonly T[], valor: unknown): T | undefined {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor) ? (valor as T) : undefined
}
function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null
}
function texto(valor: unknown, max: number): string | undefined {
  if (typeof valor !== 'string') return undefined
  const t = valor.trim()
  return t ? t.slice(0, max) : undefined
}
function color(valor: unknown): string | undefined {
  return typeof valor === 'string' && HEX.test(valor.trim()) ? valor.trim() : undefined
}
function entero(valor: unknown, min: number, max: number): number | undefined {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() ? Number(valor) : NaN
  if (!Number.isFinite(n)) return undefined
  const r = Math.round(n)
  return r >= min && r <= max ? r : undefined
}
function bandera(valor: unknown, siFalta: boolean): boolean {
  return valor === true ? true : valor === false ? false : siFalta
}

function leerElemento(valor: unknown, i: number): ElementoZona | null {
  const o = objeto(valor)
  if (!o) return null
  const type = enLista(TIPOS, o.type)
  if (!type) return null
  return {
    id: texto(o.id, 40) ?? `${type}-${i}`,
    type,
    label: texto(o.label, 80),
    buttonId: texto(o.button_id, 40),
    desktop: bandera(o.desktop, true),
    tablet: bandera(o.tablet, true),
    mobile: bandera(o.mobile, true),
  }
}

function leerZonas(valor: unknown): ConstructorEncabezado['zonas'] {
  const o = objeto(valor)
  if (!o) return null
  const zonas: Partial<Record<ZonaHeader, ElementoZona[]>> = {}
  for (const zona of ZONAS) {
    if (!Array.isArray(o[zona])) continue
    const items = o[zona].map(leerElemento).filter((x): x is ElementoZona => !!x).slice(0, 12)
    if (items.length) zonas[zona] = items
  }
  return Object.keys(zonas).length ? zonas : null
}

function leerIcono(valor: unknown): IconoElemento | null {
  const o = objeto(valor)
  if (!o) return null
  const icono: IconoElemento = {
    icon: texto(o.icon, 40),
    weight: enLista(['contorno', 'relleno', 'duotono'] as const, o.weight),
    stroke: entero(o.stroke, 1, 3),
    size: entero(o.size, 12, 40),
    container: enLista(['none', 'circle', 'rounded', 'square'] as const, o.container),
    color: color(o.color),
    background: color(o.background),
    border: color(o.border),
    hover: color(o.hover),
    label: texto(o.label, 24),
    labelPos: enLista(['below', 'side'] as const, o.label_pos),
    badgeColor: color(o.badge_color),
  }
  return Object.values(icono).some((v) => v != null) ? icono : null
}

function leerBoton(valor: unknown, i: number): BotonHeader | null {
  const o = objeto(valor)
  if (!o) return null
  const text = texto(o.text, 40)
  if (!text && enLista(ESTILOS_BOTON, o.style) !== 'icon_only') return null
  return {
    id: texto(o.id, 40) ?? `boton-${i}`,
    text: text ?? '',
    icon: texto(o.icon, 40),
    iconSide: enLista(['left', 'right'] as const, o.icon_side) ?? 'left',
    action: enLista(ACCIONES_BOTON, o.action) ?? 'link',
    href: texto(o.href, 500),
    message: texto(o.message, 200),
    style: enLista(ESTILOS_BOTON, o.style) ?? 'solid',
    shape: enLista(FORMAS, o.shape) ?? 'rounded',
    size: enLista(['sm', 'md', 'lg'] as const, o.size) ?? 'md',
    color: color(o.color),
    textColor: color(o.text_color),
    hover: color(o.hover),
  }
}

function leerMega(valor: unknown): MegaItem | null {
  const o = objeto(valor)
  if (!o) return null
  const href = texto(o.href, 300)
  if (!href) return null
  const columnas: ColumnaMega[] = []
  for (const c of (Array.isArray(o.columns_data) ? o.columns_data : []).slice(0, 6)) {
    const col = objeto(c)
    if (!col) continue
    const links: { label: string; href: string }[] = []
    for (const l of (Array.isArray(col.links) ? col.links : []).slice(0, 12)) {
      const e = objeto(l)
      const label = e ? texto(e.label, 60) : undefined
      const destino = e ? texto(e.href, 300) : undefined
      if (label && destino) links.push({ label, href: destino })
    }
    columnas.push({
      title: texto(col.title, 60) ?? '',
      links,
      image: texto(col.image, 500),
      imageHref: texto(col.image_href, 300),
      categoryId: entero(col.category_id, 1, 1_000_000_000),
      text: texto(col.text, 240),
      products: col.products === true,
    })
  }
  return {
    href,
    columns: Math.min(6, Math.max(2, entero(o.columns, 1, 12) ?? (columnas.length || 2))),
    width: o.width === 'full' ? 'full' : 'content',
    open: o.open === 'click' ? 'click' : 'hover',
    animation: o.animation === 'slide' ? 'slide' : 'fade',
    background: color(o.background),
    shadow: o.shadow !== false,
    radius: entero(o.radius, 0, 24) ?? 12,
    dividers: o.dividers !== false,
    columnas,
  }
}

function leerBuscador(crudo: unknown, estiloSitio: unknown): CromoBuscador | null {
  const o = objeto(crudo) ?? {}
  const tipoNuevo = enLista(BUSCADORES_NUEVOS, o.type) ?? enLista(BUSCADORES_NUEVOS, estiloSitio)
  const tipoBarra = (o.type === 'bar' || estiloSitio === 'bar') && (o.placeholder || o.border || o.radius || o.shadow || o.background || o.icon || o.button)
  if (!tipoNuevo && !tipoBarra) return null
  return {
    tipo: tipoNuevo ?? 'bar',
    placeholder: texto(o.placeholder, 60),
    width: entero(o.width, 120, 960),
    border: enLista(['none', 'thin', 'thick'] as const, o.border) ?? 'thin',
    borderColor: color(o.border_color),
    radius: enLista(FORMAS, o.radius) ?? (tipoNuevo === 'pill_floating' ? 'pill' : 'rounded'),
    shadow: o.shadow === true || tipoNuevo === 'pill_floating',
    background: color(o.background),
    icon: texto(o.icon, 40),
    iconSide: o.icon_side === 'right' ? 'right' : 'left',
    iconColor: color(o.icon_color),
    iconBackground: color(o.icon_background),
    button: enLista(['none', 'text', 'icon'] as const, o.button) ?? (tipoNuevo === 'mega' ? 'icon' : 'none'),
    mobile: enLista(['icon', 'bar', 'fullscreen'] as const, o.mobile) ?? 'icon',
  }
}

/** null = header y buscador de hoy. */
export function leerConstructor(settings: unknown): ConstructorEncabezado | null {
  const s = objeto(settings) ?? {}
  const builder = objeto(s.header_builder)
  const buscador = leerBuscador(builder?.search, s.search_style)
  if (!builder && !buscador) return null
  const zonas = builder ? leerZonas(builder.zones) : null
  const iconosCrudos = objeto(builder?.icons)
  const iconos: Partial<Record<string, IconoElemento>> = {}
  if (iconosCrudos) {
    for (const [k, v] of Object.entries(iconosCrudos)) {
      const icono = leerIcono(v)
      if (icono) iconos[k] = icono
    }
  }
  const botones = Array.isArray(builder?.buttons)
    ? builder.buttons.map(leerBoton).filter((x): x is BotonHeader => !!x).slice(0, 8)
    : []
  const mega = Array.isArray(builder?.mega)
    ? builder.mega.map(leerMega).filter((x): x is MegaItem => !!x).slice(0, 12)
    : []
  if (!zonas && !buscador && !Object.keys(iconos).length && !botones.length && !mega.length) return null
  return {
    zonas,
    iconos: Object.keys(iconos).length ? iconos : null,
    botones: botones.length ? botones : null,
    mega: mega.length ? mega : null,
    buscador,
  }
}

/** El buscador nuevo va en la barra (mini, mega, píldora, barra con cromo). El overlay va en el ícono. */
export function buscadorEnBarra(tipo: BuscadorNuevo | undefined): boolean {
  return !!tipo && tipo !== 'icon_overlay'
}
