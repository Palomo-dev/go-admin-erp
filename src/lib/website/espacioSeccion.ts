/**
 * Espacio de una sección (relleno y margen, arriba y abajo) en celular y computador.
 *
 * Copia idéntica en goadmin-websites (`lib/website/espacioSeccion.ts`, `npm run verify:copias`):
 * - el editor lo usa para MOSTRAR el valor que la tienda aplica hoy (heredado o propio);
 * - la tienda lo usa para el margen en px por dispositivo (`section_background.margin_*`).
 *
 * Las escalas son las clases de Tailwind de SectionWrapperBase (pt-4 = 16 px, md:pt-6 = 24 px…).
 * Sin `section_background.margin_*` la tienda sigue con sus clases de siempre: nada cambia.
 *
 * Código puro: sin React, Next ni Supabase.
 */
import { heroSolapa, margenExplicito, offsetPrimeraPx, paddingExplicito, pxEnRango } from './espacioHeader'

export type Dispositivo = 'celular' | 'computador'
export interface ParDispositivo { celular: number; computador: number }

/** pt-* / pb-* de SectionWrapperBase: [celular, computador (md:)]. */
export const RELLENO_ESCALA_PX: Readonly<Record<string, ParDispositivo>> = {
  none: { celular: 0, computador: 0 },
  xs: { celular: 8, computador: 8 },
  sm: { celular: 16, computador: 24 },
  md: { celular: 32, computador: 48 },
  lg: { celular: 48, computador: 64 },
  xl: { celular: 64, computador: 96 },
}

/** mt-* / mb-* de SectionWrapperBase (iguales en los dos). */
export const MARGEN_ESCALA_PX: Readonly<Record<string, number>> = {
  none: 0, xs: 8, sm: 16, md: 32, lg: 48, xl: 64,
}

/** Espaciado del estilo de la sección → escala (como estiloSeccionPublico). */
const RELLENO_POR_ESPACIADO: Readonly<Record<string, string>> = { compacto: 'sm', normal: 'lg', amplio: 'xl' }

/** Secciones de la Carta QR sin relleno propio (SIN_RELLENO_POR_DEFECTO de SectionWrapperBase). */
const SIN_RELLENO: ReadonlySet<string> = new Set([
  'table_service', 'table_order', 'table_bill', 'visit_feedback', 'restaurant_hero:mesa',
])

export const MARGEN_MAX_PX = 200

export interface MargenPropio {
  margin_top?: number
  margin_bottom?: number
  margin_top_mobile?: number
  margin_bottom_mobile?: number
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Margen en px guardado por el editor en `section_background` (vacío = el de siempre). */
export function leerMargenPropio(contenido: unknown): MargenPropio {
  const f = objeto(objeto(contenido).section_background)
  const m: MargenPropio = {}
  for (const k of ['margin_top', 'margin_bottom', 'margin_top_mobile', 'margin_bottom_mobile'] as const) {
    const n = pxEnRango(f[k], 0, MARGEN_MAX_PX)
    if (n != null) m[k] = n
  }
  return m
}

export interface EntornoSeccion {
  tipo?: string | null
  variante?: string | null
  /** Primera sección visible de la página. */
  primera?: boolean
  /** Ajustes del sitio (solape del header y hueco de la primera sección). */
  ajustesSitio?: Record<string, unknown> | null
  /** `espaciado` del estilo de la sección (compacto / normal / amplio). */
  espaciado?: string | null
}

export interface LadoEspacio extends ParDispositivo {
  /** `true` si lo fijó el editor en esta sección; `false` = lo que la tienda pone sola. */
  propio: boolean
}

export interface EspacioSeccion {
  rellenoArriba: LadoEspacio
  rellenoAbajo: LadoEspacio
  margenArriba: LadoEspacio
  margenAbajo: LadoEspacio
}

const par = (n: number): ParDispositivo => ({ celular: n, computador: n })
const escalaRelleno = (k: string) => RELLENO_ESCALA_PX[k] ?? RELLENO_ESCALA_PX.lg

/**
 * Espacio que la tienda pinta hoy, con la misma regla que SectionWrapperBase.
 * `contenido` es el `content` guardado de la sección.
 */
export function espacioSeccion(contenidoGuardado: unknown, e: EntornoSeccion = {}): EspacioSeccion {
  const c = { ...objeto(contenidoGuardado) }
  // El estilo de la sección solo rellena lo que el Avanzado dejó vacío (estiloSeccionPublico).
  const vacio = (v: unknown) => v === undefined || v === null || v === ''
  const esc = e.espaciado ? RELLENO_POR_ESPACIADO[e.espaciado] : undefined
  if (esc) {
    if (vacio(c.padding_top)) c.padding_top = esc
    if (vacio(c.padding_bottom)) c.padding_bottom = esc
  }
  const tipo = e.tipo ?? ''
  const sinRelleno = SIN_RELLENO.has(tipo) || SIN_RELLENO.has(`${tipo}:${e.variante ?? ''}`)
  const cartaQr = tipo === 'menu_full' && e.variante === 'qr'
  const primera = e.primera === true
  const solapa = tipo === 'hero' && heroSolapa(e.ajustesSitio as never, c.overlap_header)
  const offset = primera ? offsetPrimeraPx(e.ajustesSitio as never) : 0
  const fondo = objeto(c.section_background)
  const fPt = pxEnRango(fondo.padding_top, 0, 200)
  const fPb = pxEnRango(fondo.padding_bottom, 0, 200)
  const ptExplicito = paddingExplicito(c.padding_top)
  const mtExplicitoEscala = margenExplicito(c.margin_top)
  const propio = leerMargenPropio(c)
  const mtPropio = propio.margin_top != null || propio.margin_top_mobile != null
  const mbPropio = propio.margin_bottom != null || propio.margin_bottom_mobile != null
  const ptPx = pxEnRango(c.padding_top_px, 0, 480)
  const pbPx = pxEnRango(c.padding_bottom_px, 0, 480)

  // ── Relleno arriba ──
  let rellenoArriba: LadoEspacio
  if (fPt != null) {
    const v = primera && !solapa && offset > 0 ? offset + fPt : fPt
    rellenoArriba = { ...par(v), propio: true }
  } else if (ptPx != null) {
    rellenoArriba = { ...par(ptPx), propio: true }
  } else {
    const clave = ptExplicito ? String(c.padding_top) : (sinRelleno || cartaQr ? 'none' : 'lg')
    let p = escalaRelleno(clave)
    if (solapa) p = ptExplicito && c.padding_top !== 'lg' ? escalaRelleno(clave) : RELLENO_ESCALA_PX.none
    if (primera && !ptExplicito && !solapa) p = par(offset)
    rellenoArriba = { ...p, propio: ptExplicito && !(esc && vacio(objeto(contenidoGuardado).padding_top)) }
  }

  // ── Relleno abajo ──
  let rellenoAbajo: LadoEspacio
  if (fPb != null) rellenoAbajo = { ...par(fPb), propio: true }
  else if (pbPx != null) rellenoAbajo = { ...par(pbPx), propio: true }
  else {
    const clave = !vacio(c.padding_bottom) ? String(c.padding_bottom) : (sinRelleno ? 'none' : 'lg')
    rellenoAbajo = { ...escalaRelleno(clave), propio: !vacio(objeto(contenidoGuardado).padding_bottom) }
  }

  // ── Margen arriba ──
  const mtEscala = MARGEN_ESCALA_PX[String(c.margin_top ?? 'none')] ?? 0
  let mtBase = solapa ? (mtExplicitoEscala ? mtEscala : 0) : mtEscala
  if (primera && !mtExplicitoEscala) mtBase = 0
  // El hueco de la primera sección va como margen cuando el relleno no lo lleva.
  if (primera && !mtExplicitoEscala && offset > 0 && (ptExplicito || ptPx != null || solapa) && fPt == null) mtBase = offset
  const margenArriba: LadoEspacio = mtPropio
    ? { celular: propio.margin_top_mobile ?? propio.margin_top ?? mtBase, computador: propio.margin_top ?? mtBase, propio: true }
    : { ...par(mtBase), propio: mtExplicitoEscala }

  // ── Margen abajo ──
  const mbBase = MARGEN_ESCALA_PX[String(c.margin_bottom ?? 'none')] ?? 0
  const margenAbajo: LadoEspacio = mbPropio
    ? { celular: propio.margin_bottom_mobile ?? propio.margin_bottom ?? mbBase, computador: propio.margin_bottom ?? mbBase, propio: true }
    : { ...par(mbBase), propio: margenExplicito(c.margin_bottom) }

  return { rellenoArriba, rellenoAbajo, margenArriba, margenAbajo }
}
