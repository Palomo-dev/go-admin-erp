/**
 * Paginación y carrusel configurables. Sin React ni DOM.
 *
 * Si el documento y la sección no traen claves, `activo` es false y cada
 * componente sigue pintando lo de hoy. Una clave presente (global o de la
 * sección, con «usar el global» apagado) activa el componente nuevo.
 * La sección pisa al global solo en las claves que ella misma trae.
 *
 * `tema.paginacion` y `tema.carrusel` no se escriben hasta que el sitio publicado
 * acepte esas claves. El ajuste de una sección vive en su contenido y sí se puede
 * guardar: el sitio actual lo ignora.
 */
export function paginacionTemaDisponible(): boolean {
  return process.env.NEXT_PUBLIC_WEBSITE_PAGINACION === '1'
}

export const ESTILOS_PAGINACION = ['numerada', 'compacta', 'cargar_mas', 'infinito', 'anterior_siguiente'] as const
export type EstiloPaginacion = (typeof ESTILOS_PAGINACION)[number]
export const FORMAS_PAGINACION = ['cuadrado', 'semi', 'circulo', 'pildora'] as const
export type FormaPaginacion = (typeof FORMAS_PAGINACION)[number]
export const TAMANOS = ['sm', 'md', 'lg'] as const
export type TamanoControl = (typeof TAMANOS)[number]
export const ALINEACIONES = ['izq', 'centro', 'der'] as const
export type Alineacion = (typeof ALINEACIONES)[number]

export const INDICADORES = ['ninguno', 'puntos', 'barra', 'numeros', 'progreso', 'miniaturas'] as const
export type IndicadorCarrusel = (typeof INDICADORES)[number]
export const POSICIONES_INDICADOR = ['abajo_dentro', 'abajo_fuera'] as const
export type PosicionIndicador = (typeof POSICIONES_INDICADOR)[number]
export const ESTILOS_FLECHA = ['chevron', 'circulo', 'cuadrado', 'larga', 'hover'] as const
export type EstiloFlecha = (typeof ESTILOS_FLECHA)[number]
export const POSICIONES_FLECHA = ['lados_dentro', 'lados_fuera', 'titulo', 'indicador'] as const
export type PosicionFlecha = (typeof POSICIONES_FLECHA)[number]

export const TIPOS_PAGINACION = ['products_grid', 'offers', 'featured_products', 'categories_grid'] as const
export const TIPOS_CARRUSEL = ['products_grid', 'featured_products', 'promo_banners', 'testimonials', 'hero', 'categories_grid'] as const

export type LegadoPaginacion = 'grilla' | 'categoria'

export interface ParcialPaginacion {
  usar_global?: boolean
  porPaginaEscritorio?: number
  porPaginaMovil?: number
  estilo?: EstiloPaginacion
  forma?: FormaPaginacion
  colorActivo?: string
  colorInactivo?: string
  colorHover?: string
  tamano?: TamanoControl
  alineacion?: Alineacion
  mostrarExtremos?: boolean
  textoAnterior?: string
  textoSiguiente?: string
  textoCargarMas?: string
  mostrarContador?: boolean
}

export interface BasePaginacion {
  legado: LegadoPaginacion
  porPagina: number
}

export interface PaginacionResuelta extends ParcialPaginacion {
  activo: boolean
  legado: LegadoPaginacion
  porPagina: number
  porPaginaExplicito: boolean
  estilo: EstiloPaginacion
  forma: FormaPaginacion
  tamano: TamanoControl
  alineacion: Alineacion
  mostrarExtremos: boolean
  mostrarContador: boolean
  textoAnterior: string
  textoSiguiente: string
  textoCargarMas: string
}

export interface ParcialCarrusel {
  usar_global?: boolean
  indicador?: IndicadorCarrusel
  posicionIndicador?: PosicionIndicador
  alineacionIndicador?: Alineacion
  colorActivo?: string
  colorInactivo?: string
  tamanoIndicador?: TamanoControl
  flechasEscritorio?: boolean
  flechasMovil?: boolean
  estiloFlechas?: EstiloFlecha
  posicionFlechas?: PosicionFlecha
  fondoFlecha?: string
  bordeFlecha?: string
  sombraFlecha?: boolean
  colorIcono?: string
  tamanoFlecha?: TamanoControl
  autoplay?: boolean
  segundos?: number
  loop?: boolean
  pausaHover?: boolean
  visiblesEscritorio?: number
  visiblesTableta?: number
  visiblesMovil?: number
  arrastre?: boolean
  avance?: number
}

export interface CarruselResuelto extends ParcialCarrusel {
  activo: boolean
  indicador: IndicadorCarrusel
  posicionIndicador: PosicionIndicador
  alineacionIndicador: Alineacion
  tamanoIndicador: TamanoControl
  flechas: boolean
  estiloFlechas: EstiloFlecha
  posicionFlechas: PosicionFlecha
  sombraFlecha: boolean
  tamanoFlecha: TamanoControl
  autoplay: boolean
  segundos: number
  loop: boolean
  pausaHover: boolean
  visibles: number
  arrastre: boolean
  avance: number
}

/** Lo que hace hoy el carrusel de productos: puntos alargados y flecha en círculo al pasar el mouse. */
export const BASE_CARRUSEL_PRODUCTO: ParcialCarrusel = {
  indicador: 'puntos',
  posicionIndicador: 'abajo_fuera',
  alineacionIndicador: 'centro',
  tamanoIndicador: 'md',
  flechasEscritorio: true,
  flechasMovil: true,
  estiloFlechas: 'hover',
  posicionFlechas: 'lados_dentro',
  sombraFlecha: true,
  tamanoFlecha: 'md',
  autoplay: false,
  segundos: 5,
  loop: false,
  pausaHover: true,
  visiblesEscritorio: 4,
  visiblesTableta: 3,
  visiblesMovil: 2,
  arrastre: true,
  avance: 1,
}

/** El hero no muestra flechas salvo que el contenido ya lo pida; los puntos son los suyos. */
export const BASE_CARRUSEL_HERO: ParcialCarrusel = {
  ...BASE_CARRUSEL_PRODUCTO,
  flechasEscritorio: false,
  flechasMovil: false,
  estiloFlechas: 'circulo',
  autoplay: true,
  loop: true,
  segundos: 5,
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function deLista<T extends string>(lista: readonly T[], valor: unknown): T | undefined {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor) ? (valor as T) : undefined
}

function entero(valor: unknown, min: number, max: number): number | undefined {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() ? Number(valor) : NaN
  if (!Number.isFinite(n)) return undefined
  const r = Math.round(n)
  return r >= min && r <= max ? r : undefined
}

function booleano(valor: unknown): boolean | undefined {
  if (typeof valor === 'boolean') return valor
  if (valor === 'true') return true
  if (valor === 'false') return false
  return undefined
}

function color(valor: unknown): string | undefined {
  return typeof valor === 'string' && HEX.test(valor.trim()) ? valor.trim() : undefined
}

function texto(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined
  const t = valor.trim().slice(0, 40)
  return t ? t : undefined
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null
}

export function sanitizarPaginacion(valor: unknown): ParcialPaginacion | null {
  const o = objeto(valor)
  if (!o) return null
  const p: ParcialPaginacion = {}
  if (typeof o.usar_global === 'boolean') p.usar_global = o.usar_global
  const esc = entero(o.porPaginaEscritorio, 4, 60)
  const mov = entero(o.porPaginaMovil, 4, 60)
  if (esc) p.porPaginaEscritorio = esc
  if (mov) p.porPaginaMovil = mov
  const estilo = deLista(ESTILOS_PAGINACION, o.estilo)
  const forma = deLista(FORMAS_PAGINACION, o.forma)
  const tamano = deLista(TAMANOS, o.tamano)
  const alineacion = deLista(ALINEACIONES, o.alineacion)
  if (estilo) p.estilo = estilo
  if (forma) p.forma = forma
  if (tamano) p.tamano = tamano
  if (alineacion) p.alineacion = alineacion
  const extremos = booleano(o.mostrarExtremos)
  const contador = booleano(o.mostrarContador)
  if (extremos !== undefined) p.mostrarExtremos = extremos
  if (contador !== undefined) p.mostrarContador = contador
  const ca = color(o.colorActivo)
  const ci = color(o.colorInactivo)
  const ch = color(o.colorHover)
  if (ca) p.colorActivo = ca
  if (ci) p.colorInactivo = ci
  if (ch) p.colorHover = ch
  const ta = texto(o.textoAnterior)
  const ts = texto(o.textoSiguiente)
  const tc = texto(o.textoCargarMas)
  if (ta) p.textoAnterior = ta
  if (ts) p.textoSiguiente = ts
  if (tc) p.textoCargarMas = tc
  return Object.keys(p).length ? p : null
}

export function sanitizarCarrusel(valor: unknown): ParcialCarrusel | null {
  const o = objeto(valor)
  if (!o) return null
  const c: ParcialCarrusel = {}
  if (typeof o.usar_global === 'boolean') c.usar_global = o.usar_global
  const indicador = deLista(INDICADORES, o.indicador)
  const posI = deLista(POSICIONES_INDICADOR, o.posicionIndicador)
  const ali = deLista(ALINEACIONES, o.alineacionIndicador)
  const tamI = deLista(TAMANOS, o.tamanoIndicador)
  const estilo = deLista(ESTILOS_FLECHA, o.estiloFlechas)
  const posF = deLista(POSICIONES_FLECHA, o.posicionFlechas)
  const tamF = deLista(TAMANOS, o.tamanoFlecha)
  if (indicador) c.indicador = indicador
  if (posI) c.posicionIndicador = posI
  if (ali) c.alineacionIndicador = ali
  if (tamI) c.tamanoIndicador = tamI
  if (estilo) c.estiloFlechas = estilo
  if (posF) c.posicionFlechas = posF
  if (tamF) c.tamanoFlecha = tamF
  const fe = booleano(o.flechasEscritorio)
  const fm = booleano(o.flechasMovil)
  const sombra = booleano(o.sombraFlecha)
  const auto = booleano(o.autoplay)
  const loop = booleano(o.loop)
  const pausa = booleano(o.pausaHover)
  const arrastre = booleano(o.arrastre)
  if (fe !== undefined) c.flechasEscritorio = fe
  if (fm !== undefined) c.flechasMovil = fm
  if (sombra !== undefined) c.sombraFlecha = sombra
  if (auto !== undefined) c.autoplay = auto
  if (loop !== undefined) c.loop = loop
  if (pausa !== undefined) c.pausaHover = pausa
  if (arrastre !== undefined) c.arrastre = arrastre
  const seg = entero(o.segundos, 1, 15)
  const ve = entero(o.visiblesEscritorio, 1, 8)
  const vt = entero(o.visiblesTableta, 1, 6)
  const vm = entero(o.visiblesMovil, 1, 3)
  const avance = entero(o.avance, 1, 8)
  if (seg) c.segundos = seg
  if (ve) c.visiblesEscritorio = ve
  if (vt) c.visiblesTableta = vt
  if (vm) c.visiblesMovil = vm
  if (avance) c.avance = avance
  const fondo = color(o.fondoFlecha)
  const borde = color(o.bordeFlecha)
  const icono = color(o.colorIcono)
  const ca = color(o.colorActivo)
  const ci = color(o.colorInactivo)
  if (fondo) c.fondoFlecha = fondo
  if (borde) c.bordeFlecha = borde
  if (icono) c.colorIcono = icono
  if (ca) c.colorActivo = ca
  if (ci) c.colorInactivo = ci
  return Object.keys(c).length ? c : null
}

function sinUsarGlobal<T extends { usar_global?: boolean }>(p: T | null): T | null {
  if (!p) return null
  const { usar_global: _u, ...resto } = p
  return Object.keys(resto).length ? (resto as T) : null
}

function mezclar<T extends object>(base: T, ...capas: Array<Partial<T> | null>): T {
  const salida = { ...base }
  for (const capa of capas) {
    if (!capa) continue
    for (const [k, v] of Object.entries(capa)) {
      if (v !== undefined) (salida as Record<string, unknown>)[k] = v
    }
  }
  return salida
}

export function resolverPaginacion(
  base: BasePaginacion,
  global: unknown,
  seccion: unknown,
  movil: boolean,
): PaginacionResuelta {
  const g = sinUsarGlobal(sanitizarPaginacion(global))
  const s0 = sanitizarPaginacion(seccion)
  const usarGlobal = s0?.usar_global !== false
  const s = usarGlobal ? null : sinUsarGlobal(s0)
  const activo = !!(g || s)
  const capa: ParcialPaginacion = { ...(g ?? {}), ...(s ?? {}) }
  const explicito = movil
    ? capa.porPaginaMovil ?? capa.porPaginaEscritorio
    : capa.porPaginaEscritorio ?? capa.porPaginaMovil
  return {
    legado: base.legado,
    activo,
    porPaginaExplicito: explicito !== undefined,
    porPagina: explicito ?? base.porPagina,
    estilo: capa.estilo ?? 'numerada',
    forma: capa.forma ?? 'semi',
    tamano: capa.tamano ?? 'md',
    alineacion: capa.alineacion ?? 'centro',
    mostrarExtremos: capa.mostrarExtremos ?? true,
    mostrarContador: capa.mostrarContador ?? false,
    textoAnterior: capa.textoAnterior ?? '',
    textoSiguiente: capa.textoSiguiente ?? '',
    textoCargarMas: capa.textoCargarMas ?? 'Cargar más',
    colorActivo: capa.colorActivo,
    colorInactivo: capa.colorInactivo,
    colorHover: capa.colorHover,
    porPaginaEscritorio: capa.porPaginaEscritorio,
    porPaginaMovil: capa.porPaginaMovil,
  }
}

export function resolverCarrusel(
  base: ParcialCarrusel,
  global: unknown,
  seccion: unknown,
  movil: boolean,
): CarruselResuelto {
  const g = sinUsarGlobal(sanitizarCarrusel(global))
  const s0 = sanitizarCarrusel(seccion)
  const usarGlobal = s0?.usar_global !== false
  const s = usarGlobal ? null : sinUsarGlobal(s0)
  const activo = !!(g || s)
  const capa = mezclar(base, g, s)
  const flechas = movil ? (capa.flechasMovil ?? true) : (capa.flechasEscritorio ?? true)
  const visibles = movil
    ? (capa.visiblesMovil ?? 1)
    : (capa.visiblesEscritorio ?? 4)
  return {
    ...capa,
    activo,
    indicador: capa.indicador ?? 'puntos',
    posicionIndicador: capa.posicionIndicador ?? 'abajo_fuera',
    alineacionIndicador: capa.alineacionIndicador ?? 'centro',
    tamanoIndicador: capa.tamanoIndicador ?? 'md',
    flechas,
    estiloFlechas: capa.estiloFlechas ?? 'hover',
    posicionFlechas: capa.posicionFlechas ?? 'lados_dentro',
    sombraFlecha: capa.sombraFlecha ?? true,
    tamanoFlecha: capa.tamanoFlecha ?? 'md',
    autoplay: capa.autoplay ?? false,
    segundos: capa.segundos ?? 5,
    loop: capa.loop ?? false,
    pausaHover: capa.pausaHover ?? true,
    visibles,
    arrastre: capa.arrastre ?? true,
    avance: capa.avance ?? 1,
  }
}

/** 1 2 … 17. Igual que el listado de categoría y la rejilla de productos. */
export function numerosDePagina(actual: number, total: number, extremos: boolean): Array<number | '…'> {
  if (total <= 1) return total === 1 ? [1] : []
  if (!extremos || total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const paginas: Array<number | '…'> = [1]
  if (actual > 3) paginas.push('…')
  const inicio = Math.max(2, actual - 1)
  const fin = Math.min(total - 1, actual + 1)
  for (let i = inicio; i <= fin; i++) paginas.push(i)
  if (actual < total - 2) paginas.push('…')
  paginas.push(total)
  return paginas
}

export const FOCO = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white'

const FORMA: Record<FormaPaginacion, string> = {
  cuadrado: 'rounded-none',
  semi: 'rounded-lg',
  circulo: 'rounded-full',
  pildora: 'rounded-full px-3',
}
const TAMANO_BOTON: Record<TamanoControl, string> = {
  sm: 'min-w-8 h-8 text-xs',
  md: 'min-w-9 h-9 text-sm',
  lg: 'min-w-11 h-11 text-base',
}
const ALINEAR: Record<Alineacion, string> = {
  izq: 'justify-start',
  centro: 'justify-center',
  der: 'justify-end',
}

export function clasesPaginacion(r: PaginacionResuelta): { contenedor: string; flecha: string; numero: string } {
  if (!r.activo) {
    if (r.legado === 'grilla') {
      return {
        contenedor: 'flex items-center justify-center gap-1 mt-8',
        flecha: `p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${FOCO}`,
        numero: `min-w-[36px] h-9 rounded-lg text-sm font-medium transition-all ${FOCO}`,
      }
    }
    return {
      contenedor: 'flex items-center justify-center gap-2 mt-10',
      flecha: `p-2 rounded-lg border dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${FOCO}`,
      numero: `min-w-[40px] h-10 rounded-lg text-sm font-medium transition-colors ${FOCO}`,
    }
  }
  return {
    contenedor: `flex flex-wrap items-center gap-2 mt-8 ${ALINEAR[r.alineacion]}`,
    flecha: `p-2 border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${FORMA[r.forma]} ${FOCO}`,
    numero: `${TAMANO_BOTON[r.tamano]} font-medium transition-colors border border-transparent ${FORMA[r.forma]} ${FOCO}`,
  }
}

export function clasesFlecha(estilo: EstiloFlecha, tamano: TamanoControl, sombra: boolean): string {
  const px = tamano === 'sm' ? 'w-8 h-8' : tamano === 'lg' ? 'w-12 h-12' : 'w-10 h-10'
  const sombraCls = sombra ? 'shadow-lg' : ''
  const base = `flex items-center justify-center transition-all ${px} ${sombraCls} ${FOCO}`
  if (estilo === 'chevron') return `${base} bg-transparent`
  if (estilo === 'cuadrado') return `${base} rounded-lg bg-white dark:bg-gray-800 border dark:border-gray-700`
  if (estilo === 'larga') return `${base} w-14 rounded-full bg-white dark:bg-gray-800 border dark:border-gray-700`
  if (estilo === 'hover') {
    return `${base} rounded-full bg-white dark:bg-gray-800 border dark:border-gray-700 opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100 hover:scale-110`
  }
  return `${base} rounded-full bg-white dark:bg-gray-800 border dark:border-gray-700 hover:scale-110`
}

export function clasesPunto(activo: boolean, tamano: TamanoControl, indicador: IndicadorCarrusel): string {
  const h = tamano === 'sm' ? 'h-1.5' : tamano === 'lg' ? 'h-2.5' : 'h-2'
  if (indicador === 'barra') return activo ? `w-8 ${h} rounded-full` : `w-4 ${h} rounded-full bg-gray-300 dark:bg-gray-600`
  if (indicador === 'puntos' && activo) return `w-6 ${h} rounded-full`
  if (indicador === 'puntos') return `w-2 ${h} rounded-full bg-gray-300 dark:bg-gray-600`
  return `rounded-full ${FOCO}`
}

/** Posición de las flechas respecto del carrusel. `hover` ya trae la opacidad. */
export function posicionFlecha(pos: PosicionFlecha, direccion: 'anterior' | 'siguiente'): string {
  if (pos === 'titulo' || pos === 'indicador') return ''
  const fuera = pos === 'lados_fuera'
  if (direccion === 'anterior') {
    return `absolute top-1/2 -translate-y-1/2 z-20 ${fuera ? '-left-5' : 'left-0 -translate-x-1/2'}`
  }
  return `absolute top-1/2 -translate-y-1/2 z-20 ${fuera ? '-right-5' : 'right-0 translate-x-1/2'}`
}

export function porPaginaDeCampo(campo: unknown, fallback: number): number {
  const o = objeto(campo)
  if (!o || o.mode !== 'value') return fallback
  const n = sanitizarPaginacion(o.value)
  return n?.porPaginaEscritorio ?? n?.porPaginaMovil ?? fallback
}

export function urlConPagina(pathname: string, actual: string, pagina: number): string {
  const params = new URLSearchParams(actual.startsWith('?') ? actual.slice(1) : actual)
  if (pagina <= 1) params.delete('page')
  else params.set('page', String(pagina))
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export function claveScroll(url: string): string {
  return `go-scroll:${url}`
}
