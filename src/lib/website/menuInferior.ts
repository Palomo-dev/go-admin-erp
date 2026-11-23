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
  'home', 'categories_modal', 'categories_page', 'search', 'cart', 'favorites', 'account', 'menu',
  'call', 'whatsapp', 'location', 'booking', 'appointment', 'order', 'track_order', 'trial',
  'page', 'url',
] as const
export type AccionMenu = (typeof ACCIONES_MENU)[number]

/**
 * `store`, `list`, `basket`, `user-circle` y `gift` (2026-11-23, Figma 2843:70263 «Ítems
 * configurables»): otros dibujos para los mismos accesos (Tienda, Lista, Canasta, En círculo, Regalo).
 */
export const ICONOS_MENU = [
  'home', 'grid', 'search', 'bag', 'cart', 'user', 'menu', 'phone', 'whatsapp', 'map-pin',
  'calendar', 'calendar-check', 'package', 'truck', 'tag', 'percent', 'star', 'heart', 'sparkles', 'link',
  'store', 'list', 'basket', 'user-circle', 'gift',
] as const
export type IconoMenu = (typeof ICONOS_MENU)[number]

/**
 * `floating` (2026-11-07, Figma «Editor · Encabezado píldora…» P4): píldora flotante de pestañas
 * separada del borde, con vidrio opcional. Las dos primeras son las barras fijas de siempre.
 * `icons` y `split` (2026-11-23, Figma 2840:69984 N2 y N4): solo íconos con el texto del activo en
 * una píldora, e isla flotante con un botón aparte en su propio círculo (`style.splitId`).
 */
export const VARIANTES_MENU = ['tabs', 'actions', 'floating', 'icons', 'split'] as const
export type VarianteMenu = (typeof VARIANTES_MENU)[number]
export const TEXTOS_MENU = ['always', 'never'] as const

/** En `split`, 4 en la isla + 1 aparte. */
export const MAX_BOTONES: Record<VarianteMenu, number> = { tabs: 5, actions: 4, floating: 5, icons: 5, split: 5 }
/** Píldora flotante: ancho del contenido o casi todo el ancho; marca del activo. */
export const ANCHOS_FLOTANTE = ['content', 'full'] as const
export const INDICADORES_FLOTANTE = ['fill', 'dot', 'line'] as const
/**
 * Marca del activo (Figma E1 «Marca del activo»): las de la píldora flotante más `none` (sin marca,
 * lo de Pestañas hoy) y `slide` (N1: una píldora suave que se desliza al activo). Vale en
 * Pestañas, Píldora flotante e Isla. Sin la clave: Pestañas `none`, Píldora e Isla `fill`.
 */
export const INDICADORES_MENU = ['none', 'fill', 'dot', 'line', 'slide'] as const
export type IndicadorMenu = (typeof INDICADORES_MENU)[number]
/** Forma del botón destacado de Pestañas (N3): el círculo de hoy o uno más grande con muesca. */
export const FORMAS_CENTRO = ['circle', 'notch'] as const
/**
 * Colores (Figma E1): `header` el fondo y los íconos del encabezado (Pestañas y Solo íconos hoy),
 * `light` el fondo y el texto del tema del sitio (Acciones, Píldora e Isla hoy), `custom` los
 * colores propios (`background`, `active`, `inactive`). Sin la clave, el de cada estilo.
 */
export const TEMAS_MENU = ['header', 'light', 'custom'] as const
export type TemaMenu = (typeof TEMAS_MENU)[number]
/** Contador de Carrito y Favoritos (Figma 2841:70098): número, punto u oculto. */
export const CONTADORES_MENU = ['number', 'dot', 'hidden'] as const
export type ContadorMenu = (typeof CONTADORES_MENU)[number]
/** Al bajar la página (Figma 2841:70360): siempre visible (hoy) o se esconde y vuelve al subir. */
export const SCROLL_MENU = ['always', 'hide'] as const
/** Ficha de producto con la barra fija de compra a la vista (Figma 2844:70510 F1/F2). */
export const PAGINA_FICHA_MENU = ['hide', 'stack'] as const
/**
 * Efecto del activo (Figma 2860:71598 «10a»). Sin la clave, el de la marca del activo
 * (`indicator`): `fill` → `pill`, `dot` → `dot`, `line` → `underline`, `slide` → `slide`; Solo íconos
 * usa `label`.
 */
export const EFECTOS_ACTIVO = ['color', 'pill', 'underline', 'dot', 'slide', 'fill', 'bounce', 'glow', 'label'] as const
export type EfectoActivo = (typeof EFECTOS_ACTIVO)[number]
/** Al tocar (Figma «10b»). Sin la clave, `none` (lo de hoy). */
export const EFECTOS_TOQUE = ['none', 'darken', 'scale', 'bounce', 'ripple', 'tilt'] as const
export type EfectoToque = (typeof EFECTOS_TOQUE)[number]
export const VELOCIDADES_EFECTO = ['fast', 'normal', 'slow'] as const
export type VelocidadEfecto = (typeof VELOCIDADES_EFECTO)[number]
/** Duración de cada velocidad, en ms. */
export const MS_VELOCIDAD: Record<VelocidadEfecto, number> = { fast: 150, normal: 240, slow: 360 }
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
  /** Píldora flotante: vidrio (blanco translúcido con desenfoque). Sin la clave, sí. */
  glass?: boolean
  /** Píldora flotante: separación con el borde inferior en px (0–32). Sin la clave, 16. */
  offset?: number
  /** Píldora flotante: ancho. Sin la clave, `content`. */
  width?: (typeof ANCHOS_FLOTANTE)[number]
  /** Marca del botón activo (Pestañas, Píldora flotante, Isla). Sin la clave, ver INDICADORES_MENU. */
  indicator?: IndicadorMenu
  /** Pestañas: forma del botón destacado. Sin la clave, `circle` (el de hoy). */
  centerShape?: (typeof FORMAS_CENTRO)[number]
  /** Isla: el botón que sale aparte, en su propio círculo. Sin la clave, el Carrito (o el último). */
  splitId?: string
  /** Colores del menú. Sin la clave, los de cada estilo (ver TEMAS_MENU). */
  theme?: TemaMenu
  /** Contadores. Sin la clave: carrito con número (Acciones, sin contador, como hoy) y favoritos con punto. */
  badges?: { cart?: ContadorMenu; favorites?: ContadorMenu }
  /** Al bajar la página. Sin la clave, `always`. */
  scroll?: (typeof SCROLL_MENU)[number]
  /** Páginas especiales. Sin la clave, en la ficha el menú se oculta mientras se ve la barra fija. */
  pages?: { product?: (typeof PAGINA_FICHA_MENU)[number] }
  /** La cabecera del celular no repite lo que ya está en el menú. Solo `true`; sin la clave, se repite. */
  dedupeHeader?: true
  activeEffect?: EfectoActivo
  pressEffect?: EfectoToque
  fxSpeed?: VelocidadEfecto
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
  favorites: { label: 'Favoritos', icon: 'heart' },
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
    ...(typeof o.glass === 'boolean' ? { glass: o.glass } : {}),
    ...(typeof o.offset === 'number' && Number.isInteger(o.offset) && o.offset >= 0 && o.offset <= 32 ? { offset: o.offset } : {}),
    ...(enLista(ANCHOS_FLOTANTE, o.width) ? { width: enLista(ANCHOS_FLOTANTE, o.width)! } : {}),
    ...(enLista(INDICADORES_MENU, o.indicator) ? { indicator: enLista(INDICADORES_MENU, o.indicator)! } : {}),
    ...leerEstiloNuevo(o, ids),
  }
}

/** Claves de 2026-11-23 (Figma 2847:17). Todas opcionales: sin ellas, lo de hoy. */
function leerEstiloNuevo(o: Record<string, unknown>, ids: string[]): Partial<EstiloMenu> {
  const r: Partial<EstiloMenu> = {}
  const forma = enLista(FORMAS_CENTRO, o.centerShape)
  if (forma) r.centerShape = forma
  const aparte = texto(o.splitId, 40)
  if (aparte && ids.includes(aparte)) r.splitId = aparte
  const tema = enLista(TEMAS_MENU, o.theme)
  if (tema) r.theme = tema
  const b = objeto(o.badges)
  if (b) {
    const cart = enLista(CONTADORES_MENU, b.cart)
    const favorites = enLista(CONTADORES_MENU, b.favorites)
    if (cart || favorites) r.badges = { ...(cart ? { cart } : {}), ...(favorites ? { favorites } : {}) }
  }
  const scroll = enLista(SCROLL_MENU, o.scroll)
  if (scroll) r.scroll = scroll
  const product = enLista(PAGINA_FICHA_MENU, objeto(o.pages)?.product)
  if (product) r.pages = { product }
  if (o.dedupeHeader === true) r.dedupeHeader = true
  const activo = enLista(EFECTOS_ACTIVO, o.activeEffect)
  if (activo) r.activeEffect = activo
  const toque = enLista(EFECTOS_TOQUE, o.pressEffect)
  if (toque) r.pressEffect = toque
  const vel = enLista(VELOCIDADES_EFECTO, o.fxSpeed)
  if (vel) r.fxSpeed = vel
  return r
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

/**
 * `mobile_bottom_bar` como lo lee la tienda (normalizarOpcionShell de lib/website/v2/mapeoAjustes.ts):
 * ausente → `auto`; texto de la columna legacy («reservar», «whatsapp,llamar») → lista; una lista
 * vacía, repetida, de más de 4 o con una acción desconocida → `auto`. Así el primer guardado de v2
 * da exactamente la barra que se ve hoy.
 */
export function barraGuardada(valor: unknown): 'auto' | 'ninguna' | string[] {
  if (valor === null || valor === undefined) return 'auto'
  if (valor === 'auto' || valor === 'ninguna') return valor
  const lista = typeof valor === 'string' ? valor.split(',').map((v) => v.trim()).filter(Boolean) : valor
  const valida = Array.isArray(lista) && lista.length >= 1 && lista.length <= 4 && new Set(lista).size === lista.length
    && lista.every((v) => typeof v === 'string' && v in DE_ACCION_BARRA)
  return valida ? (lista as string[]) : 'auto'
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
  const barra = barraGuardada(s.mobile_bottom_bar)
  if (Array.isArray(barra)) {
    const items = barra.map((a) => boton(DE_ACCION_BARRA[a], DE_ACCION_BARRA[a]))
    return { menu: { v: 2, enabled: true, variant: 'actions', items, style: { labels: 'always' } }, fuente: 'acciones' }
  }
  if (opciones.restaurante && barra === 'auto') {
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
  if (typeof m.style.glass === 'boolean') st.glass = m.style.glass
  if (typeof m.style.offset === 'number' && Number.isInteger(m.style.offset) && m.style.offset >= 0 && m.style.offset <= 32) st.offset = m.style.offset
  if (m.style.width && (ANCHOS_FLOTANTE as readonly string[]).includes(m.style.width)) st.width = m.style.width
  if (m.style.indicator && (INDICADORES_MENU as readonly string[]).includes(m.style.indicator)) st.indicator = m.style.indicator
  // Las claves nuevas pasan por el mismo lector: lo que no vale no se escribe.
  Object.assign(st, leerEstiloNuevo(m.style as unknown as Record<string, unknown>, ids))
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
  /**
   * Favoritos: qué abre el botón, lo mismo que el corazón de la cabecera (`header_favoritos.alTocar`):
   * el panel lateral (sin la clave) o la página /favoritos.
   */
  favoritos?: 'panel' | 'pagina'
}

export type DestinoBoton =
  | { tipo: 'ruta'; href: string }
  | { tipo: 'externo'; href: string }
  | { tipo: 'evento'; evento: 'search' | 'categories' | 'cart' | 'menu' | 'favorites' }

const RUTA_FIJA: Partial<Record<AccionMenu, string>> = {
  home: '/', categories_page: '/categorias', account: '/auth', appointment: '/agendar', track_order: '/consultar-pedido', trial: '/membresias',
}

function digitos(t: string): string {
  return t.replace(/\D/g, '')
}

/** `tel:` desde un número escrito (10 dígitos = Colombia; 12 que empiezan por 57 = Colombia con indicativo). */
export function telDe(t: string): string | null {
  const d = digitos(t)
  if (d.length < 7) return null
  const mas = t.trim().startsWith('+') || (d.length === 12 && d.startsWith('57'))
  return `tel:${mas ? '+' : d.length === 10 ? '+57' : ''}${d}`
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
    case 'favorites': return d.favoritos === 'pagina' ? { tipo: 'ruta', href: '/favoritos' } : { tipo: 'evento', evento: 'favorites' }
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

// ─── Valores efectivos (2026-11-23, Figma 2836:69391 «Menú inferior: propuestas de mejora») ─────────

/** Marca del activo sin la clave: Pestañas sin marca (hoy); Píldora e Isla, relleno (hoy). */
export function indicadorMenu(m: MenuInferior): IndicadorMenu {
  return m.style.indicator ?? (m.variant === 'tabs' ? 'none' : 'fill')
}

const EFECTO_DE_INDICADOR: Record<IndicadorMenu, EfectoActivo | null> = { none: null, fill: 'pill', dot: 'dot', line: 'underline', slide: 'slide' }

/**
 * Efecto del activo que se pinta, o null (Pestañas sin marca: lo de hoy, el color `active` si lo
 * hay). Solo íconos marca con su píldora con texto (`label`) salvo que se elija otro efecto.
 */
export function efectoActivoMenu(m: MenuInferior): EfectoActivo | null {
  if (m.variant === 'actions') return null
  if (m.style.activeEffect) return m.style.activeEffect
  if (m.variant === 'icons') return 'label'
  return EFECTO_DE_INDICADOR[indicadorMenu(m)]
}

/** Colores sin la clave: Pestañas y Solo íconos, los del encabezado; los demás, los del tema. */
export function temaMenu(m: MenuInferior): TemaMenu {
  if (m.style.theme) return m.style.theme
  return m.variant === 'tabs' || m.variant === 'icons' ? 'header' : 'light'
}

/**
 * Contador del botón Carrito o Favoritos. Sin la clave: el carrito con número (en Acciones, sin
 * contador: los botones de acción nunca lo pintaron) y Favoritos con punto.
 */
export function contadorMenu(m: MenuInferior, cual: 'cart' | 'favorites'): ContadorMenu {
  const guardado = m.style.badges?.[cual]
  if (guardado) return guardado
  if (cual === 'favorites') return 'dot'
  return m.variant === 'actions' ? 'hidden' : 'number'
}

/** Lo que pinta un contador: el número (con «99+»), un punto o nada. Sin unidades, nada. */
export function pintaContador(cantidad: number, c: ContadorMenu): { tipo: 'numero'; texto: string } | { tipo: 'punto' } | null {
  if (!(cantidad > 0) || c === 'hidden') return null
  if (c === 'dot') return { tipo: 'punto' }
  return { tipo: 'numero', texto: cantidad > 99 ? '99+' : String(Math.floor(cantidad)) }
}

/** Isla: el botón aparte (por defecto el Carrito; si no hay, el último) entre los que se pintan. */
export function idBotonAparte(m: MenuInferior, ids: readonly string[]): string | null {
  if (m.variant !== 'split' || ids.length < 2) return null
  if (m.style.splitId && ids.includes(m.style.splitId)) return m.style.splitId
  const carrito = m.items.find((b) => b.action === 'cart' && ids.includes(b.id))
  return carrito ? carrito.id : ids[ids.length - 1]
}

// ─── Páginas especiales (Figma 2844:70510, para TODAS las tiendas) ──────────────────────────────

/**
 * Qué hace el menú de abajo en cada ruta (sin el prefijo de sede):
 * - `sin-menu`: checkout, carrito completo y confirmación del pedido. Nunca hay menú (F3).
 * - `ficha`: ficha de producto. El menú se oculta mientras se ve la barra fija de compra (F1), o
 *   se apila bajo ella con `style.pages.product = 'stack'` (F2).
 * - `normal`: el resto.
 */
export type PaginaMenu = 'sin-menu' | 'ficha' | 'normal'
const RUTAS_SIN_MENU = ['/checkout', '/carrito', '/pedido']

export function paginaMenu(ruta: string): PaginaMenu {
  const r = ruta.split(/[?#]/)[0] || '/'
  if (RUTAS_SIN_MENU.some((x) => r === x || r.startsWith(`${x}/`))) return 'sin-menu'
  if (r.startsWith('/productos/')) return 'ficha'
  return 'normal'
}

/** En la ficha, con la barra a la vista: `hide` (por defecto) o `stack`. */
export function fichaMenu(m: MenuInferior | null): 'hide' | 'stack' {
  return m?.style.pages?.product ?? 'hide'
}

/** Lo que la cabecera del celular puede dejar de repetir. */
export type AccesoRepetido = 'cart' | 'account' | 'search' | 'favorites'

/**
 * «No repetir arriba» (Figma 2843:70716, opcional y apagado por defecto): lo que la cabecera del
 * celular deja de pintar porque ya está en el menú. Vacío sin la opción, con el menú apagado o en
 * las rutas donde el menú no está siempre (checkout, carrito, ficha): ahí la cabecera lo conserva.
 */
export function repetidosArriba(m: MenuInferior | null, ruta: string): ReadonlySet<AccesoRepetido> {
  const s = new Set<AccesoRepetido>()
  if (!m || !m.enabled || m.style.dedupeHeader !== true || paginaMenu(ruta) !== 'normal') return s
  // Los botones de acción no salen en la cuenta ni al iniciar sesión (rutas con barra propia).
  if (m.variant === 'actions' && /^\/(mi-cuenta|auth)(\/|$)/.test(ruta)) return s
  for (const b of m.items.slice(0, MAX_BOTONES[m.variant])) {
    if (!b.visible) continue
    if (b.action === 'cart' || b.action === 'account' || b.action === 'search' || b.action === 'favorites') s.add(b.action)
  }
  return s
}
