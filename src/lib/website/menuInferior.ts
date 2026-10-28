/**
 * Menú inferior del celular, versión 2: un solo modelo para las pestañas tipo app (MobileTabs),
 * los botones de acción (`mobile_bottom_bar`, BarraMovilGiro) y el menú tipo app (`bottom_nav` v1).
 *
 * Se guarda en `mobile_header.bottom_nav` con `v: 2`. Sin `v: 2` la tienda pinta lo de siempre
 * (nada cambia sin una edición). `menuInicial` lee lo guardado de cada plantilla como sus botones
 * iniciales: el editor los muestra y solo escribe la versión 2 cuando alguien toca algo.
 *
 * Puro, sin imports: el ERP guarda una copia idéntica (scripts/verify-copias-erp.mjs).
 */

export const ACCIONES_MENU = [
  'home', 'categories_modal', 'categories_page', 'search', 'cart', 'account', 'menu',
  'call', 'whatsapp', 'location', 'booking', 'appointment', 'order', 'track_order', 'trial',
  'page', 'url',
] as const
export type AccionMenu = (typeof ACCIONES_MENU)[number]

export const ICONOS_MENU = [
  'home', 'grid', 'search', 'bag', 'cart', 'user', 'menu', 'phone', 'whatsapp', 'map-pin',
  'calendar', 'calendar-check', 'package', 'truck', 'tag', 'percent', 'star', 'heart', 'sparkles', 'link',
] as const
export type IconoMenu = (typeof ICONOS_MENU)[number]

export const VARIANTES_MENU = ['tabs', 'actions'] as const
export type VarianteMenu = (typeof VARIANTES_MENU)[number]
export const TEXTOS_MENU = ['always', 'never'] as const

export const MAX_BOTONES: Record<VarianteMenu, number> = { tabs: 5, actions: 4 }
export const MAX_TEXTO = 24

export interface BotonMenu {
  id: string
  action: AccionMenu
  label: string
  icon: IconoMenu
  visible: boolean
  /** Destino propio: teléfono, número de WhatsApp, ruta de página, URL o dirección. Vacío = el de la tienda. */
  target?: string
  /** WhatsApp: mensaje inicial. */
  message?: string
}

export interface EstiloMenu {
  labels: (typeof TEXTOS_MENU)[number]
  background?: string
  active?: string
  inactive?: string
  /** Pestañas: botón central destacado. */
  centerId?: string
  /** Acciones: el botón relleno (por defecto, el primero visible). */
  primaryId?: string
}

export interface MenuInferior {
  v: 2
  enabled: boolean
  variant: VarianteMenu
  items: BotonMenu[]
  style: EstiloMenu
}

/** Texto e ícono de cada acción cuando se agrega o se cambia. */
export const DEFECTO_ACCION: Record<AccionMenu, { label: string; icon: IconoMenu }> = {
  home: { label: 'Inicio', icon: 'home' },
  categories_modal: { label: 'Categorías', icon: 'grid' },
  categories_page: { label: 'Categorías', icon: 'grid' },
  search: { label: 'Buscar', icon: 'search' },
  cart: { label: 'Carrito', icon: 'bag' },
  account: { label: 'Cuenta', icon: 'user' },
  menu: { label: 'Menú', icon: 'menu' },
  call: { label: 'Llamar', icon: 'phone' },
  whatsapp: { label: 'WhatsApp', icon: 'whatsapp' },
  location: { label: 'Cómo llegar', icon: 'map-pin' },
  booking: { label: 'Reservar', icon: 'calendar' },
  appointment: { label: 'Agendar', icon: 'calendar-check' },
  order: { label: 'Pedir', icon: 'bag' },
  track_order: { label: 'Mi pedido', icon: 'truck' },
  trial: { label: 'Prueba gratis', icon: 'sparkles' },
  page: { label: 'Página', icon: 'link' },
  url: { label: 'Enlace', icon: 'link' },
}

/** Acciones que necesitan un destino escrito (no tienen uno de la tienda). */
export const ACCIONES_CON_DESTINO_OBLIGATORIO: readonly AccionMenu[] = ['page', 'url']

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function enLista<T extends string>(lista: readonly T[], v: unknown): T | undefined {
  return typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : undefined
}
function texto(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t.slice(0, max) : undefined
}
function color(v: unknown): string | undefined {
  return typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : undefined
}

function boton(id: string, action: AccionMenu, extra: Partial<BotonMenu> = {}): BotonMenu {
  return { id, action, ...DEFECTO_ACCION[action], visible: true, ...extra }
}

function leerBoton(v: unknown, i: number): BotonMenu | null {
  const o = objeto(v)
  if (!o) return null
  const action = enLista(ACCIONES_MENU, o.action)
  if (!action) return null
  const base = DEFECTO_ACCION[action]
  const target = texto(o.target, 300)
  const message = texto(o.message, 300)
  return {
    id: texto(o.id, 40) ?? `${action}-${i}`,
    action,
    label: typeof o.label === 'string' ? o.label.slice(0, MAX_TEXTO) : base.label,
    icon: enLista(ICONOS_MENU, o.icon) ?? base.icon,
    visible: o.visible !== false,
    ...(target ? { target } : {}),
    ...(message ? { message } : {}),
  }
}

function leerEstilo(v: unknown, ids: string[]): EstiloMenu {
  const o = objeto(v) ?? {}
  const centro = texto(o.centerId, 40)
  const principal = texto(o.primaryId, 40)
  return {
    labels: enLista(TEXTOS_MENU, o.labels) ?? 'always',
    ...(color(o.background) ? { background: color(o.background) } : {}),
    ...(color(o.active) ? { active: color(o.active) } : {}),
    ...(color(o.inactive) ? { inactive: color(o.inactive) } : {}),
    ...(centro && ids.includes(centro) ? { centerId: centro } : {}),
    ...(principal && ids.includes(principal) ? { primaryId: principal } : {}),
  }
}

/** Menú inferior guardado en la versión 2, o null (la tienda sigue con lo de siempre). */
export function leerMenuInferior(settings: unknown): MenuInferior | null {
  const b = objeto(objeto(objeto(settings)?.mobile_header)?.bottom_nav)
  if (!b || b.v !== 2) return null
  const variant = enLista(VARIANTES_MENU, b.variant) ?? 'tabs'
  const crudos = Array.isArray(b.items) ? b.items : []
  const vistos = new Set<string>()
  const items = crudos
    .map(leerBoton)
    .filter((x): x is BotonMenu => {
      if (!x || vistos.has(x.id)) return false
      vistos.add(x.id)
      return true
    })
    .slice(0, MAX_BOTONES[variant])
  return { v: 2, enabled: b.enabled === true, variant, items, style: leerEstilo(b.style, items.map((i) => i.id)) }
}

// ─── Botones iniciales: lo que cada plantilla pinta hoy, leído como versión 2 ─────────────────────

const PESTANAS: BotonMenu[] = [
  boton('home', 'home'),
  boton('categories', 'categories_modal'),
  boton('search', 'search'),
  boton('cart', 'cart'),
  boton('account', 'account'),
]

const DE_ACCION_BARRA: Record<string, AccionMenu> = {
  pedir: 'order', reservar: 'booking', agendar: 'appointment', prueba: 'trial',
  llamar: 'call', whatsapp: 'whatsapp', como_llegar: 'location',
}

const DE_TIPO_V1: Record<string, AccionMenu> = {
  home: 'home', categories: 'categories_page', search: 'search', cart: 'cart', account: 'account', whatsapp: 'whatsapp',
}

const DE_ICONO_V1: Record<string, IconoMenu> = {
  home: 'home', grid: 'grid', search: 'search', bag: 'bag', cart: 'cart', user: 'user', heart: 'heart', tag: 'tag', whatsapp: 'whatsapp', link: 'link',
}

export type FuenteMenu = 'v2' | 'v1' | 'tabs' | 'acciones' | 'restaurante' | 'ninguna'

/**
 * Botones iniciales de la tienda (lo que se ve hoy) para mostrarlos en el editor. No escribe nada.
 * `restaurante` = giro restaurante con `mobile_bottom_bar` en `auto`.
 */
export function menuInicial(settings: unknown, opciones: { restaurante?: boolean } = {}): { menu: MenuInferior; fuente: FuenteMenu } {
  const s = objeto(settings) ?? {}
  const guardado = leerMenuInferior(s)
  if (guardado) return { menu: guardado, fuente: 'v2' }
  const v1 = objeto(objeto(s.mobile_header)?.bottom_nav)
  if (v1 && Array.isArray(v1.items) && v1.items.length) {
    const items = v1.items
      .map((x, i): BotonMenu | null => {
        const o = objeto(x)
        if (!o) return null
        const href = texto(o.href, 300)
        const tipo = typeof o.kind === 'string' ? o.kind : 'custom'
        let action: AccionMenu = DE_TIPO_V1[tipo] ?? (href && /^https?:\/\//i.test(href) ? 'url' : 'page')
        if (o.action === 'search') action = 'search'
        else if (o.action === 'cart') action = 'cart'
        else if (o.action === 'menu') action = 'menu'
        const conDestino = action === 'page' || action === 'url' || (action === 'account' && href && href !== '/mi-cuenta')
        return {
          id: texto(o.id, 40) ?? `${action}-${i}`,
          action,
          label: texto(o.label, MAX_TEXTO) ?? DEFECTO_ACCION[action].label,
          icon: DE_ICONO_V1[String(o.icon)] ?? DEFECTO_ACCION[action].icon,
          visible: true,
          ...(conDestino && href ? { target: href } : action === 'page' ? { target: href ?? '/' } : {}),
        }
      })
      .filter((x): x is BotonMenu => !!x)
      .slice(0, MAX_BOTONES.tabs)
    const ids = items.map((i) => i.id)
    const sinTexto = v1.items.every((x) => objeto(x)?.show_label === false)
    return {
      menu: {
        v: 2,
        enabled: v1.enabled === true,
        variant: 'tabs',
        items,
        style: { ...leerEstilo({ background: v1.background, active: v1.active, inactive: v1.inactive, centerId: v1.center_id }, ids), labels: sinTexto ? 'never' : 'always' },
      },
      fuente: 'v1',
    }
  }
  if (s.mobile_menu_style === 'tabs') {
    return { menu: { v: 2, enabled: true, variant: 'tabs', items: PESTANAS.map((b) => ({ ...b })), style: { labels: 'always' } }, fuente: 'tabs' }
  }
  const barra = s.mobile_bottom_bar
  if (Array.isArray(barra) && barra.length) {
    const items = barra
      .map((a) => DE_ACCION_BARRA[String(a)])
      .filter((a): a is AccionMenu => !!a)
      .slice(0, MAX_BOTONES.actions)
      .map((a) => boton(a, a))
    if (items.length) return { menu: { v: 2, enabled: true, variant: 'actions', items, style: { labels: 'always' } }, fuente: 'acciones' }
  }
  if (opciones.restaurante && (barra == null || barra === 'auto')) {
    const items = (['booking', 'call', 'location', 'order'] as const).map((a) => boton(a, a))
    return { menu: { v: 2, enabled: true, variant: 'actions', items, style: { labels: 'always' } }, fuente: 'restaurante' }
  }
  return { menu: { v: 2, enabled: false, variant: 'tabs', items: PESTANAS.map((b) => ({ ...b })), style: { labels: 'always' } }, fuente: 'ninguna' }
}

/** Forma guardada (sin claves vacías). */
export function aGuardar(m: MenuInferior): Record<string, unknown> {
  const max = MAX_BOTONES[m.variant]
  const items = m.items.slice(0, max).map((b) => {
    const o: Record<string, unknown> = { id: b.id, action: b.action, label: b.label.slice(0, MAX_TEXTO), icon: b.icon, visible: b.visible }
    if (b.target && b.target.trim()) o.target = b.target.trim().slice(0, 300)
    if (b.message && b.message.trim() && b.action === 'whatsapp') o.message = b.message.trim().slice(0, 300)
    return o
  })
  const ids = items.map((i) => String(i.id))
  const st: Record<string, unknown> = { labels: m.style.labels }
  for (const k of ['background', 'active', 'inactive'] as const) if (color(m.style[k])) st[k] = m.style[k]
  if (m.style.centerId && ids.includes(m.style.centerId)) st.centerId = m.style.centerId
  if (m.style.primaryId && ids.includes(m.style.primaryId)) st.primaryId = m.style.primaryId
  return { v: 2, enabled: m.enabled, variant: m.variant, items, style: st }
}

// ─── A dónde lleva cada botón ────────────────────────────────────────────────────────────────────

/** Datos de la tienda que resuelve el servidor (teléfono de la sede u org, WhatsApp, dirección…). */
export interface DestinosTienda {
  llamar: string | null
  whatsapp: string | null
  comoLlegar: string | null
  reservar: string | null
  pedir: string | null
}

export type DestinoBoton =
  | { tipo: 'ruta'; href: string }
  | { tipo: 'externo'; href: string }
  | { tipo: 'evento'; evento: 'search' | 'categories' | 'cart' | 'menu' }

const RUTA_FIJA: Partial<Record<AccionMenu, string>> = {
  home: '/', categories_page: '/categorias', account: '/auth', appointment: '/agendar', track_order: '/consultar-pedido', trial: '/membresias',
}

function digitos(t: string): string {
  return t.replace(/\D/g, '')
}

/** `tel:` desde un número escrito (10 dígitos = Colombia). */
export function telDe(t: string): string | null {
  const d = digitos(t)
  if (d.length < 7) return null
  return `tel:${t.trim().startsWith('+') ? '+' : d.length === 10 ? '+57' : ''}${d}`
}

/** wa.me desde un número escrito y un mensaje opcional. */
export function whatsappDe(numero: string, mensaje?: string): string | null {
  const d = digitos(numero)
  if (d.length < 7) return null
  const n = d.length === 10 ? `57${d}` : d
  return `https://wa.me/${n}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`
}

function conMensaje(url: string, mensaje?: string): string {
  if (!mensaje) return url
  const sin = url.replace(/([?&])text=[^&]*(&|$)/, '$1').replace(/[?&]$/, '')
  return `${sin}${sin.includes('?') ? '&' : '?'}text=${encodeURIComponent(mensaje)}`
}

/** Destino del botón o null si no tiene (la tienda no lo pinta; el editor avisa qué falta). */
export function destinoBoton(b: BotonMenu, d: DestinosTienda): DestinoBoton | null {
  const t = b.target?.trim()
  switch (b.action) {
    case 'search': return { tipo: 'evento', evento: 'search' }
    case 'categories_modal': return { tipo: 'evento', evento: 'categories' }
    case 'cart': return { tipo: 'evento', evento: 'cart' }
    case 'menu': return { tipo: 'evento', evento: 'menu' }
    case 'call': {
      const href = t ? telDe(t) : d.llamar
      return href ? { tipo: 'externo', href } : null
    }
    case 'whatsapp': {
      const href = t ? whatsappDe(t, b.message) : d.whatsapp ? conMensaje(d.whatsapp, b.message) : null
      return href ? { tipo: 'externo', href } : null
    }
    case 'location': {
      if (t) return { tipo: 'externo', href: /^https?:\/\//i.test(t) ? t : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(t)}` }
      return d.comoLlegar ? { tipo: 'externo', href: d.comoLlegar } : null
    }
    case 'booking': {
      if (t) return t.startsWith('/') ? { tipo: 'ruta', href: t } : /^https?:\/\//i.test(t) ? { tipo: 'externo', href: t } : null
      return d.reservar ? { tipo: 'ruta', href: d.reservar } : null
    }
    case 'order': {
      if (t) return t.startsWith('/') ? { tipo: 'ruta', href: t } : /^https?:\/\//i.test(t) ? { tipo: 'externo', href: t } : null
      return d.pedir ? { tipo: 'ruta', href: d.pedir } : null
    }
    case 'page':
      return t && t.startsWith('/') ? { tipo: 'ruta', href: t } : null
    case 'url':
      return t && /^(https?:\/\/|mailto:|tel:)/i.test(t) ? { tipo: 'externo', href: t } : null
    default: {
      if (t && t.startsWith('/')) return { tipo: 'ruta', href: t }
      const fija = RUTA_FIJA[b.action]
      return fija ? { tipo: 'ruta', href: fija } : null
    }
  }
}

/** Botones que la tienda pinta: visibles y con destino. */
export function botonesVisibles(m: MenuInferior, d: DestinosTienda): { boton: BotonMenu; destino: DestinoBoton }[] {
  return m.items
    .filter((b) => b.visible)
    .map((b) => ({ boton: b, destino: destinoBoton(b, d) }))
    .filter((x): x is { boton: BotonMenu; destino: DestinoBoton } => !!x.destino)
    .slice(0, MAX_BOTONES[m.variant])
}
