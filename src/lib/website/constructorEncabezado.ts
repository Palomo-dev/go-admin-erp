/**
 * Constructor del encabezado. Sin `header_builder` y con `search_style` en
 * icon | bar | hidden (o ausente), devuelve null: el header, el círculo de
 * acento y el buscador de hoy. El contenedor de íconos y los menús extra
 * solo aparecen cuando el documento los trae.
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
/** Estilos de la barra. `bar` sin variante sigue siendo la barra de hoy. */
export const VARIANTES_BARRA = ['outline', 'pill', 'soft', 'underline', 'filled'] as const
export type VarianteBarra = (typeof VARIANTES_BARRA)[number]
export type BuscadorNuevo = (typeof BUSCADORES_NUEVOS)[number] | 'bar'

export const ACCIONES_BOTON = ['link', 'whatsapp', 'call', 'cart', 'search', 'menu', 'modal', 'category', 'download'] as const
export const ESTILOS_BOTON = ['solid', 'outline', 'ghost', 'gradient', 'icon_only'] as const
export const FORMAS = ['square', 'rounded', 'semi', 'pill', 'circle'] as const

export interface ElementoZona {
  id: string
  type: TipoElemento
  label?: string
  buttonId?: string
  menuId?: string
  desktop: boolean
  tablet: boolean
  mobile: boolean
}

export const FORMAS_CONTENEDOR = ['none', 'circle', 'square', 'rounded', 'semi', 'squircle'] as const
export const OBJETIVOS_ICONO = ['cart', 'account', 'currency', 'favorites', 'search'] as const

export interface ContenedorIconos {
  shape: (typeof FORMAS_CONTENEDOR)[number]
  radius?: number
  box?: number
  icon?: number
  padding?: number
  background?: string
  gradient1?: string
  gradient2?: string
  angle?: number
  opacity?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: 'solid' | 'dotted'
  shadow?: 'none' | 'sm' | 'md' | 'lg'
  shadowColor?: string
  hoverColor?: string
  hoverBackground?: string
  hoverScale?: number
  hoverShadow?: 'none' | 'sm' | 'md' | 'lg'
  activeColor?: string
  iconColor?: string
  weight?: 'contorno' | 'relleno' | 'duotono'
  stroke?: number
  /** `all` pinta igual cada ícono. `each` deja que `targets` lo pise. */
  scope: 'all' | 'each'
  targets?: Partial<Record<(typeof OBJETIVOS_ICONO)[number], ContenedorIconos>>
  badgeShape?: 'circle' | 'pill'
  badgeColor?: string
  badgePosition?: 'top-right' | 'top-left'
}

export interface ItemMenuHeader {
  label: string
  href: string
  kind: 'link' | 'dropdown' | 'mega'
  icon?: string
  badge?: string
}

export interface MenuConstruido {
  id: string
  name: string
  zone: ZonaHeader
  type: 'links' | 'mega' | 'mixed'
  mobile: boolean
  mobileOrder: number
  size?: number
  weight?: 'normal' | 'medium' | 'semibold' | 'bold'
  color?: string
  hover?: string
  active?: string
  indicator?: 'underline' | 'pill' | 'background' | 'none'
  gap?: number
  uppercase?: boolean
  /** `sans` hereda la del sitio. `serif` y `mono` cambian solo este menú. */
  font?: 'sans' | 'serif' | 'mono'
  items: ItemMenuHeader[]
}

/** El botón del menú móvil cuando el encabezado se arma solo con menús. */
export const MENU_MOVIL = '__movil__'

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
  variante?: VarianteBarra
}

export interface ConstructorEncabezado {
  zonas: Partial<Record<ZonaHeader, ElementoZona[]>> | null
  iconos: Partial<Record<string, IconoElemento>> | null
  botones: BotonHeader[] | null
  mega: MegaItem[] | null
  buscador: CromoBuscador | null
  contenedor: ContenedorIconos | null
  menus: MenuConstruido[] | null
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
const TOKENS_COLOR = ['primary', 'accent', 'secondary', 'transparent'] as const
/** Hex o un token del tema. Cualquier otro texto se descarta. */
function colorOToken(valor: unknown): string | undefined {
  const t = texto(valor, 20)
  if (!t) return undefined
  if ((TOKENS_COLOR as readonly string[]).includes(t)) return t
  return color(t)
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
    menuId: texto(o.menu_id, 40),
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

function leerContenedor(valor: unknown, profundidad = 0): ContenedorIconos | null {
  const o = objeto(valor)
  if (!o) return null
  const shape = enLista(FORMAS_CONTENEDOR, o.shape)
  if (!shape) return null
  const targets: ContenedorIconos['targets'] = {}
  if (profundidad === 0 && o.scope === 'each') {
    const crudos = objeto(o.targets)
    if (crudos) {
      for (const clave of OBJETIVOS_ICONO) {
        const hijo = leerContenedor(crudos[clave], 1)
        if (hijo) targets[clave] = hijo
      }
    }
  }
  return {
    shape,
    radius: entero(o.radius, 4, 16),
    box: entero(o.box, 24, 64),
    icon: entero(o.icon, 12, 40),
    padding: entero(o.padding, 0, 16),
    background: colorOToken(o.background),
    gradient1: color(o.gradient_1),
    gradient2: color(o.gradient_2),
    angle: entero(o.angle, 0, 360),
    opacity: entero(o.opacity, 0, 100),
    borderWidth: entero(o.border_width, 0, 4),
    borderColor: colorOToken(o.border_color),
    borderStyle: o.border_style === 'dotted' ? 'dotted' : o.border_style === 'solid' ? 'solid' : undefined,
    shadow: enLista(['none', 'sm', 'md', 'lg'] as const, o.shadow),
    shadowColor: colorOToken(o.shadow_color),
    hoverColor: colorOToken(o.hover_color),
    hoverBackground: colorOToken(o.hover_background),
    hoverScale: entero(o.hover_scale, 90, 120),
    hoverShadow: enLista(['none', 'sm', 'md', 'lg'] as const, o.hover_shadow),
    activeColor: colorOToken(o.active_color),
    iconColor: colorOToken(o.icon_color),
    weight: enLista(['contorno', 'relleno', 'duotono'] as const, o.weight),
    stroke: entero(o.stroke, 1, 4),
    scope: o.scope === 'each' ? 'each' : 'all',
    targets: Object.keys(targets).length ? targets : undefined,
    badgeShape: o.badge_shape === 'pill' ? 'pill' : o.badge_shape === 'circle' ? 'circle' : undefined,
    badgeColor: color(o.badge_color),
    badgePosition: o.badge_position === 'top-left' ? 'top-left' : o.badge_position === 'top-right' ? 'top-right' : undefined,
  }
}

/** El contenedor de un ícono: el suyo si el alcance es «cada uno», si no el común. */
export function contenedorDe(base: ContenedorIconos, clave: (typeof OBJETIVOS_ICONO)[number]): ContenedorIconos {
  const hijo = base.scope === 'each' ? base.targets?.[clave] : undefined
  if (!hijo) return base
  const mezclado: ContenedorIconos = { ...base, scope: 'all', targets: undefined }
  const destino = mezclado as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(hijo)) {
    if (v !== undefined && k !== 'targets' && k !== 'scope') destino[k] = v
  }
  return mezclado
}

/** Radio CSS de la forma. `none` no pinta caja. */
export function radioForma(shape: ContenedorIconos['shape'], radius?: number): string {
  if (shape === 'circle') return '9999px'
  if (shape === 'square') return '0px'
  if (shape === 'rounded') return `${radius ?? 8}px`
  if (shape === 'semi') return '14px'
  if (shape === 'squircle') return '30%'
  return '0px'
}

/** Token del tema o el hex tal cual. */
export function colorDeToken(
  token: string | undefined,
  colores: { primary: string; accent: string; secondary: string },
): string | undefined {
  if (!token) return undefined
  if (token === 'transparent') return 'transparent'
  if (token === 'primary') return colores.primary
  if (token === 'accent') return colores.accent
  if (token === 'secondary') return colores.secondary
  return token
}

export function sombraCaja(nivel: ContenedorIconos['shadow'], color?: string): string {
  if (!nivel || nivel === 'none') return 'none'
  const base = nivel === 'sm' ? '0 1px 2px' : nivel === 'md' ? '0 4px 10px' : '0 12px 28px'
  return `${base} ${color || 'rgba(15,23,42,.22)'}`
}

/**
 * Zonas que pinta el header. Sin menús, las de hoy.
 * Con menús y sin zonas, arma logo, carrito, cuenta y el botón del menú móvil
 * para que el encabezado no quede solo en enlaces.
 */
export function zonasConMenus(c: Pick<ConstructorEncabezado, 'zonas' | 'menus'>): ConstructorEncabezado['zonas'] {
  const menus = c.menus ?? []
  if (!menus.length) return c.zonas
  const zonas: Partial<Record<ZonaHeader, ElementoZona[]>> = {}
  if (c.zonas) {
    for (const zona of ZONAS) {
      const items = c.zonas[zona]
      if (items?.length) zonas[zona] = items.map((el) => ({ ...el }))
    }
  } else {
    zonas.header_left = [{ id: 'logo', type: 'logo', desktop: true, tablet: true, mobile: true }]
    zonas.header_right = [
      { id: 'carrito', type: 'cart', desktop: true, tablet: true, mobile: true },
      { id: 'cuenta', type: 'account', desktop: true, tablet: true, mobile: true },
    ]
    zonas.mobile_header = [
      { id: 'logo-movil', type: 'logo', desktop: true, tablet: true, mobile: true },
      { id: 'menu-movil', type: 'menu', menuId: MENU_MOVIL, desktop: false, tablet: true, mobile: true },
      { id: 'carrito-movil', type: 'cart', desktop: true, tablet: true, mobile: true },
    ]
  }
  for (const menu of menus) {
    const lista = zonas[menu.zone] ? [...zonas[menu.zone]!] : []
    if (lista.some((el) => el.type === 'menu' && el.menuId === menu.id)) continue
    const enCelular = menu.zone === 'mobile_header' || menu.zone === 'mobile_bottom'
    lista.push({
      id: `menu-${menu.id}`,
      type: 'menu',
      menuId: menu.id,
      desktop: !enCelular,
      tablet: true,
      mobile: enCelular,
    })
    zonas[menu.zone] = lista
  }
  return zonas
}

export const PRESETS_CONTENEDOR = {
  circulo_acento: null,
  cuadrado_suave: { shape: 'rounded', radius: 10, box: 40, icon: 18, padding: 8, background: 'accent', shadow: 'sm', weight: 'contorno', stroke: 2 },
  borde_fino: { shape: 'circle', box: 40, icon: 18, padding: 8, background: 'transparent', border_width: 1, border_style: 'solid', weight: 'contorno', stroke: 2 },
  sombra_flotante: { shape: 'circle', box: 44, icon: 18, padding: 10, background: 'primary', shadow: 'lg', weight: 'contorno', stroke: 2 },
  solo_icono: { shape: 'none', icon: 22, weight: 'contorno', stroke: 2 },
} as const

function leerItemMenu(valor: unknown): ItemMenuHeader | null {
  const o = objeto(valor)
  if (!o) return null
  const label = texto(o.label, 40)
  const href = texto(o.href, 300)
  if (!label || !href) return null
  return {
    label,
    href,
    kind: enLista(['link', 'dropdown', 'mega'] as const, o.kind) ?? 'link',
    icon: texto(o.icon, 40),
    badge: texto(o.badge, 16),
  }
}

function leerMenu(valor: unknown, i: number): MenuConstruido | null {
  const o = objeto(valor)
  if (!o) return null
  const name = texto(o.name, 40)
  const zone = enLista(ZONAS, o.zone)
  if (!name || !zone) return null
  const items = (Array.isArray(o.items) ? o.items : []).map(leerItemMenu).filter((x): x is ItemMenuHeader => !!x).slice(0, 12)
  return {
    id: texto(o.id, 40) ?? `menu-${i}`,
    name,
    zone,
    type: enLista(['links', 'mega', 'mixed'] as const, o.type) ?? 'links',
    mobile: o.mobile !== false,
    mobileOrder: entero(o.mobile_order, 0, 20) ?? i,
    size: entero(o.size, 10, 24),
    weight: enLista(['normal', 'medium', 'semibold', 'bold'] as const, o.weight),
    color: color(o.color),
    hover: color(o.hover),
    active: color(o.active),
    indicator: enLista(['underline', 'pill', 'background', 'none'] as const, o.indicator),
    gap: entero(o.gap, 0, 40),
    uppercase: o.uppercase === true,
    font: enLista(['sans', 'serif', 'mono'] as const, o.font),
    items,
  }
}

const PRESET_BARRA: Record<VarianteBarra, { border: CromoBuscador['border']; radius: CromoBuscador['radius']; shadow: boolean; background?: string }> = {
  outline: { border: 'thin', radius: 'rounded', shadow: false },
  pill: { border: 'thin', radius: 'pill', shadow: false },
  soft: { border: 'none', radius: 'rounded', shadow: false, background: '#F3F4F6' },
  underline: { border: 'none', radius: 'square', shadow: false },
  filled: { border: 'none', radius: 'rounded', shadow: true, background: '#EEF2FF' },
}

function leerBuscador(crudo: unknown, estiloSitio: unknown): CromoBuscador | null {
  const o = objeto(crudo) ?? {}
  const tipoNuevo = enLista(BUSCADORES_NUEVOS, o.type) ?? enLista(BUSCADORES_NUEVOS, estiloSitio)
  const variante = enLista(VARIANTES_BARRA, o.variant) ?? enLista(VARIANTES_BARRA, estiloSitio)
  const cromoExplicito = !!(
    variante || o.placeholder || o.border || o.radius || o.shadow === true || o.shadow === false
    || o.background || o.icon || o.icon_side || o.button || o.border_color
  )
  const tipoBarra = (o.type === 'bar' || estiloSitio === 'bar' || !!variante) && cromoExplicito
  if (!tipoNuevo && !tipoBarra) return null
  const preset = variante ? PRESET_BARRA[variante] : null
  return {
    tipo: tipoNuevo ?? 'bar',
    placeholder: texto(o.placeholder, 60),
    width: entero(o.width, 120, 960),
    border: enLista(['none', 'thin', 'thick'] as const, o.border) ?? preset?.border ?? 'thin',
    borderColor: color(o.border_color),
    radius: enLista(FORMAS, o.radius) ?? preset?.radius ?? (tipoNuevo === 'pill_floating' ? 'pill' : 'rounded'),
    shadow: o.shadow === false ? false : (o.shadow === true || tipoNuevo === 'pill_floating' || preset?.shadow === true),
    background: color(o.background) ?? preset?.background,
    icon: texto(o.icon, 40),
    iconSide: o.icon_side === 'right' ? 'right' : 'left',
    iconColor: color(o.icon_color),
    iconBackground: color(o.icon_background),
    button: enLista(['none', 'text', 'icon'] as const, o.button) ?? (tipoNuevo === 'mega' ? 'icon' : 'none'),
    mobile: enLista(['icon', 'bar', 'fullscreen'] as const, o.mobile) ?? 'icon',
    ...(variante ? { variante } : {}),
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
  const contenedor = builder ? leerContenedor(builder.icon_container) : null
  const menus = Array.isArray(builder?.menus)
    ? builder.menus.map(leerMenu).filter((x): x is MenuConstruido => !!x).slice(0, 6)
    : []
  if (!zonas && !buscador && !Object.keys(iconos).length && !botones.length && !mega.length && !contenedor && !menus.length) return null
  return {
    zonas,
    iconos: Object.keys(iconos).length ? iconos : null,
    botones: botones.length ? botones : null,
    mega: mega.length ? mega : null,
    buscador,
    contenedor,
    menus: menus.length ? menus : null,
  }
}

/** El buscador nuevo va en la barra (mini, mega, píldora, barra con cromo). El overlay va en el ícono. */
export function buscadorEnBarra(tipo: BuscadorNuevo | undefined): boolean {
  return !!tipo && tipo !== 'icon_overlay'
}

/**
 * Dónde va la barra dentro del encabezado. `null` = el lugar de hoy
 * (entre el menú y las acciones). `align` solo no enciende el cromo.
 */
export function alineacionBuscador(settings: unknown): 'left' | 'center' | 'right' | null {
  const search = objeto(objeto(objeto(settings)?.header_builder)?.search)
  const align = search?.align
  return align === 'left' || align === 'center' || align === 'right' ? align : null
}
