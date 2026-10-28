/**
 * Menú móvil, barra inferior tipo app y disposición del header en celular.
 *
 * Sin `mobile_header` y con `mobile_menu_style` en drawer | fullscreen | bottom_sheet | tabs
 * (o ausente), devuelve null: el sitio sigue con la variante de hoy.
 * Puro: sin React. El ERP guarda una copia idéntica.
 */

export const ESTILOS_LEGADO = ['drawer', 'fullscreen', 'bottom_sheet', 'tabs'] as const
export const ESTILOS_NUEVOS = ['drawer_left', 'drawer_right', 'top_dropdown', 'none'] as const
export const ESTILOS_MENU = [...ESTILOS_LEGADO, ...ESTILOS_NUEVOS] as const
export type EstiloMenuMovil = (typeof ESTILOS_MENU)[number]

export const ANIMACIONES = ['slide', 'fade', 'scale'] as const
export const FONDOS_PANEL = ['color', 'gradient', 'blur'] as const
export const LISTAS_CATEGORIA = ['accordion', 'list'] as const
export const DISPOSICIONES = ['menu-logo-acciones', 'logo-acciones-menu', 'logo-sobre-acciones', 'acciones-sobre-logo'] as const
export const LOGO_MOVIL = ['inherit', 'left', 'center', 'right'] as const
export const GLIFOS_MENU = ['lines3', 'lines2', 'dots', 'grid', 'text'] as const
export const ESTILOS_ICONO = ['plain', 'circle', 'border'] as const
export const BUSCADORES = ['icon', 'bar', 'fullscreen'] as const
export const INDICADORES = ['dot', 'line', 'pill'] as const
export const TIPOS_ITEM = ['home', 'categories', 'search', 'cart', 'account', 'favorites', 'offers', 'whatsapp', 'custom'] as const
export const ACCIONES_ITEM = ['link', 'menu', 'search', 'cart'] as const

export interface PanelMenu {
  width: number
  background: (typeof FONDOS_PANEL)[number]
  color?: string
  gradient1?: string
  gradient2?: string
  overlay: number
  animation: (typeof ANIMACIONES)[number]
  showLogo: boolean
  showSearch: boolean
  showSocial: boolean
  showContact: boolean
  categories: (typeof LISTAS_CATEGORIA)[number]
}

export interface ItemBarra {
  id: string
  kind: (typeof TIPOS_ITEM)[number]
  label: string
  icon: string
  showLabel: boolean
  action: (typeof ACCIONES_ITEM)[number]
  href?: string
}

export interface BarraApp {
  items: ItemBarra[]
  background?: string
  active?: string
  inactive?: string
  indicator: (typeof INDICADORES)[number]
  centerId?: string
  shadow: boolean
  border: boolean
  radius: number
  float: boolean
}

export interface DisposicionMovil {
  logo: (typeof LOGO_MOVIL)[number]
  arrangement: (typeof DISPOSICIONES)[number]
  logoSize?: number
  headerHeight?: number
  sticky: boolean
  hideOnScroll: boolean
  transparentHero: boolean
}

export interface IconosMovil {
  menu: (typeof GLIFOS_MENU)[number]
  showMenu: boolean
  showSearch: boolean
  showCart: boolean
  showAccount: boolean
  style: (typeof ESTILOS_ICONO)[number]
  color?: string
}

export interface PresentacionMovil {
  estilo: EstiloMenuMovil
  /** true = el header de hoy no sabe pintar esto y entra el cascarón nuevo. */
  usarHeaderNuevo: boolean
  panel: PanelMenu | null
  barra: BarraApp | null
  layout: DisposicionMovil | null
  iconos: IconosMovil | null
  buscador: (typeof BUSCADORES)[number] | null
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function enLista<T extends string>(lista: readonly T[], valor: unknown): T | undefined {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor) ? (valor as T) : undefined
}

function entero(valor: unknown, min: number, max: number): number | undefined {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() ? Number(valor) : NaN
  if (!Number.isFinite(n)) return undefined
  const r = Math.round(n)
  return r >= min && r <= max ? r : undefined
}

function color(valor: unknown): string | undefined {
  return typeof valor === 'string' && HEX.test(valor.trim()) ? valor.trim() : undefined
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null
}

function texto(valor: unknown, max: number): string | undefined {
  if (typeof valor !== 'string') return undefined
  const t = valor.trim()
  return t ? t.slice(0, max) : undefined
}

export const ICONOS_ITEM = ['home', 'grid', 'search', 'bag', 'cart', 'user', 'heart', 'tag', 'whatsapp', 'link'] as const

const DEFECTO_ITEM: Record<(typeof TIPOS_ITEM)[number], Pick<ItemBarra, 'label' | 'icon' | 'action' | 'href'>> = {
  home: { label: 'Inicio', icon: 'home', action: 'link', href: '/' },
  categories: { label: 'Categorías', icon: 'grid', action: 'link', href: '/categorias' },
  search: { label: 'Buscar', icon: 'search', action: 'search' },
  cart: { label: 'Carrito', icon: 'bag', action: 'cart' },
  account: { label: 'Cuenta', icon: 'user', action: 'link', href: '/mi-cuenta' },
  favorites: { label: 'Favoritos', icon: 'heart', action: 'link', href: '/favoritos' },
  offers: { label: 'Ofertas', icon: 'tag', action: 'link', href: '/ofertas' },
  whatsapp: { label: 'WhatsApp', icon: 'whatsapp', action: 'link' },
  custom: { label: 'Enlace', icon: 'link', action: 'link', href: '/' },
}

export const ITEMS_BARRA_INICIALES: ItemBarra[] = (['home', 'search', 'cart', 'account'] as const).map((kind) => ({
  id: kind,
  kind,
  showLabel: true,
  ...DEFECTO_ITEM[kind],
}))

function leerItem(valor: unknown, i: number): ItemBarra | null {
  const o = objeto(valor)
  if (!o) return null
  const kind = enLista(TIPOS_ITEM, o.kind) ?? 'custom'
  const base = DEFECTO_ITEM[kind]
  const id = texto(o.id, 40) ?? `${kind}-${i}`
  const icono = enLista(ICONOS_ITEM, o.icon) ?? base.icon
  const accion = enLista(ACCIONES_ITEM, o.action) ?? base.action
  const href = texto(o.href, 300)
  return {
    id,
    kind,
    label: texto(o.label, 24) ?? base.label,
    icon: icono,
    showLabel: o.show_label === false ? false : true,
    action: accion,
    href: href ?? base.href,
  }
}

export function leerBarra(valor: unknown): BarraApp | null {
  const o = objeto(valor)
  if (!o || o.enabled !== true) return null
  const crudos = Array.isArray(o.items) ? o.items : []
  const items = crudos.map(leerItem).filter((x): x is ItemBarra => !!x).slice(0, 5)
  const lista = items.length >= 3 ? items : ITEMS_BARRA_INICIALES
  const center = texto(o.center_id, 40)
  return {
    items: lista,
    background: color(o.background),
    active: color(o.active),
    inactive: color(o.inactive),
    indicator: enLista(INDICADORES, o.indicator) ?? 'pill',
    centerId: center && lista.some((it) => it.id === center) ? center : undefined,
    shadow: o.shadow === true,
    border: o.border !== false,
    radius: entero(o.radius, 0, 28) ?? 0,
    float: o.float === true,
  }
}

function leerPanel(valor: unknown): PanelMenu | null {
  const o = objeto(valor)
  if (!o) return null
  const panel: PanelMenu = {
    width: entero(o.width, 70, 100) ?? 85,
    background: enLista(FONDOS_PANEL, o.background) ?? 'color',
    color: color(o.color),
    gradient1: color(o.gradient_1),
    gradient2: color(o.gradient_2),
    overlay: entero(o.overlay, 0, 90) ?? 50,
    animation: enLista(ANIMACIONES, o.animation) ?? 'slide',
    showLogo: o.show_logo === true,
    showSearch: o.show_search === true,
    showSocial: o.show_social === true,
    showContact: o.show_contact === true,
    categories: enLista(LISTAS_CATEGORIA, o.categories) ?? 'accordion',
  }
  const pidio = ['width', 'background', 'color', 'gradient_1', 'gradient_2', 'overlay', 'animation', 'show_logo', 'show_search', 'show_social', 'show_contact', 'categories']
    .some((k) => o[k] != null && o[k] !== '')
  return pidio ? panel : null
}

function leerLayout(valor: unknown): DisposicionMovil | null {
  const o = objeto(valor)
  if (!o) return null
  const logo = enLista(LOGO_MOVIL, o.logo)
  const logoDistinto = logo && logo !== 'inherit' ? logo : undefined
  const arrangement = enLista(DISPOSICIONES, o.arrangement)
  const logoSize = entero(o.logo_size, 24, 96)
  const headerHeight = entero(o.header_height, 48, 120)
  const sticky = o.sticky === false ? false : o.sticky === true ? true : undefined
  const hide = o.hide_on_scroll === true
  const transparente = o.transparent_hero === true
  if (!logoDistinto && !arrangement && logoSize == null && headerHeight == null && sticky == null && !hide && !transparente) return null
  return {
    logo: logoDistinto ?? 'inherit',
    arrangement: arrangement ?? 'logo-acciones-menu',
    logoSize,
    headerHeight,
    sticky: sticky !== false,
    hideOnScroll: hide,
    transparentHero: transparente,
  }
}

function leerIconos(valor: unknown): IconosMovil | null {
  const o = objeto(valor)
  if (!o) return null
  const menu = enLista(GLIFOS_MENU, o.menu)
  const style = enLista(ESTILOS_ICONO, o.style)
  const showMenu = o.show_menu === false ? false : o.show_menu === true ? true : undefined
  const showSearch = o.show_search === false ? false : o.show_search === true ? true : undefined
  const showCart = o.show_cart === false ? false : o.show_cart === true ? true : undefined
  const showAccount = o.show_account === false ? false : o.show_account === true ? true : undefined
  const tono = color(o.color)
  if (!menu && !style && showMenu == null && showSearch == null && showCart == null && showAccount == null && !tono) return null
  return {
    menu: menu ?? 'lines3',
    showMenu: showMenu !== false,
    showSearch: showSearch !== false,
    showCart: showCart !== false,
    showAccount: showAccount !== false,
    style: style ?? 'plain',
    color: tono,
  }
}

/** null = el header móvil de hoy, sin barra nueva. */
export function leerPresentacionMovil(settings: unknown): PresentacionMovil | null {
  const s = objeto(settings) ?? {}
  const estiloCrudo = typeof s.mobile_menu_style === 'string' ? s.mobile_menu_style : 'drawer'
  const estiloNuevo = enLista(ESTILOS_NUEVOS, estiloCrudo)
  const estilo = estiloNuevo ?? enLista(ESTILOS_LEGADO, estiloCrudo) ?? 'drawer'
  const header = objeto(s.mobile_header)
  const panel = header ? leerPanel(header.panel) : null
  const barra = header ? leerBarra(header.bottom_nav) : null
  const layout = header ? leerLayout(header.layout) : null
  const iconos = header ? leerIconos(header.icons) : null
  const buscador = header ? enLista(BUSCADORES, header.search) ?? null : null
  if (!estiloNuevo && !panel && !barra && !layout && !iconos && !buscador) return null
  // El encabezado lo decide solo el estilo del menú (o lo que solo el configurable sabe pintar:
  // panel, buscador a pantalla completa, menú inferior con pestañas). Logo, orden, tamaño, alto,
  // fijo, ocultar al bajar, transparente e íconos los pintan también los 4 encabezados de
  // plantilla: cambiar una opción suelta nunca cambia de encabezado (QA 28-oct).
  const usarHeaderNuevo = Boolean(estiloNuevo || panel || buscador || (barra && estilo === 'tabs'))
  return { estilo, usarHeaderNuevo, panel, barra, layout, iconos, buscador }
}

/** Orden de logo e íconos en el celular (`mobile_header.layout.arrangement`); sin clave, el de hoy. */
export function ordenMovil(settings: unknown): (typeof DISPOSICIONES)[number] {
  const layout = objeto(objeto(objeto(settings)?.mobile_header)?.layout)
  return enLista(DISPOSICIONES, layout?.arrangement) ?? 'logo-acciones-menu'
}
