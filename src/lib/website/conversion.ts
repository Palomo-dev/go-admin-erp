/**
 * Urgencia y contador del documento V2.
 * Sin `conversion`, estas funciones no sustituyen las columnas legacy.
 */

export type UbicacionContador = 'topbar' | 'carrito' | 'checkout' | 'producto' | 'hero' | 'seccion'
export type UbicacionStock = 'checkout' | 'producto' | 'carrito'

export interface ContadorConversion {
  id: string
  activo: boolean
  ubicaciones: UbicacionContador[]
  modo:
    | { tipo: 'fecha'; fin: string; zona: string }
    | { tipo: 'promocion'; promotionId: string }
    | { tipo: 'diario'; hora: number; zona: string }
    | { tipo: 'evergreen'; minutos: number }
  formato: { dias: boolean; horas: boolean; minutos: boolean; segundos: boolean; etiquetas: boolean }
  estilo: {
    forma: 'pastilla' | 'cuadrado' | 'redondo'
    fondo?: string
    texto?: string
    acento?: string
    borde?: string
    radio?: number
    sombra: boolean
    tamano: 'sm' | 'md' | 'lg'
    cajas: 'digito' | 'linea'
  }
  textoAntes: string
  textoDespues: string
  alTerminar: { tipo: 'ocultar' } | { tipo: 'mensaje'; texto: string }
}

export interface ConversionSitio {
  contadores: ContadorConversion[]
  urgencia: {
    stockBajo: { activo: boolean; umbral: number; plantilla: string; ubicaciones: UbicacionStock[] }
    reservaCarrito: { activo: boolean }
    personasViendo: { activo: false }
  }
}

const COLUMNAS = [
  'countdown_enabled', 'countdown_title', 'countdown_mode', 'countdown_end_date', 'countdown_timezone',
  'countdown_reset_hour', 'countdown_show_in_header', 'countdown_show_in_cart', 'countdown_show_in_product',
  'countdown_show_in_hero', 'checkout_show_countdown', 'checkout_show_stock_warning', 'checkout_stock_warning_threshold',
] as const

export function esColumnaConversion(columna: string): boolean {
  return (COLUMNAS as readonly string[]).includes(columna)
}

function estiloBase(): ContadorConversion['estilo'] {
  return { forma: 'pastilla', sombra: false, tamano: 'sm', cajas: 'linea' }
}

function formatoBase(): ContadorConversion['formato'] {
  return { dias: false, horas: true, minutos: true, segundos: true, etiquetas: true }
}

function urgenciaVacia(activo: boolean, umbral: number): ConversionSitio['urgencia'] {
  return {
    stockBajo: {
      activo,
      umbral: umbral >= 1 && umbral <= 999 ? umbral : 5,
      plantilla: 'Quedan {n}',
      ubicaciones: activo ? ['checkout'] : [],
    },
    reservaCarrito: { activo: false },
    personasViendo: { activo: false },
  }
}

/** Columnas legacy → documento. `null` si el contador y el aviso están apagados. */
export function conversionDesdeColumnas(fila: Record<string, unknown> | null | undefined): ConversionSitio | null {
  if (!fila) return null
  const activo = fila.countdown_enabled === true
  const aviso = fila.checkout_show_stock_warning === true
  if (!activo && !aviso) return null
  const ubicaciones: UbicacionContador[] = []
  if (fila.countdown_show_in_header === true) ubicaciones.push('topbar')
  if (fila.countdown_show_in_cart === true) ubicaciones.push('carrito')
  if (fila.checkout_show_countdown === true) ubicaciones.push('checkout')
  if (fila.countdown_show_in_product === true) ubicaciones.push('producto')
  if (fila.countdown_show_in_hero === true) ubicaciones.push('hero')
  const zona = typeof fila.countdown_timezone === 'string' && fila.countdown_timezone ? fila.countdown_timezone.slice(0, 64) : 'America/Bogota'
  const hora = Number(fila.countdown_reset_hour ?? 0)
  const modo: ContadorConversion['modo'] = fila.countdown_mode === 'custom'
    ? { tipo: 'fecha', fin: String(fila.countdown_end_date ?? '').slice(0, 40), zona }
    : { tipo: 'diario', hora: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : 0, zona }
  const umbral = Number(fila.checkout_stock_warning_threshold ?? 5)
  return {
    contadores: activo ? [{
      id: 'legacy',
      activo: true,
      ubicaciones,
      modo,
      formato: formatoBase(),
      estilo: estiloBase(),
      textoAntes: String(fila.countdown_title ?? '').slice(0, 200),
      textoDespues: '',
      alTerminar: { tipo: 'ocultar' },
    }] : [],
    urgencia: urgenciaVacia(aviso, umbral),
  }
}

/** Primer contador de vuelta a las columnas que ya lee la tienda legacy. */
export function columnasDesdeConversion(conversion: ConversionSitio | null | undefined): Record<string, unknown> {
  if (!conversion) return {}
  const c = conversion.contadores[0]
  const ubicaciones = new Set(c?.ubicaciones ?? [])
  return {
    countdown_enabled: !!c?.activo,
    countdown_title: c?.textoAntes ?? '',
    countdown_mode: c?.modo.tipo === 'fecha' ? 'custom' : 'daily_reset',
    countdown_end_date: c?.modo.tipo === 'fecha' ? c.modo.fin : '',
    countdown_timezone: c?.modo.tipo === 'fecha' || c?.modo.tipo === 'diario' ? c.modo.zona : 'America/Bogota',
    countdown_reset_hour: c?.modo.tipo === 'diario' ? c.modo.hora : 0,
    countdown_show_in_header: ubicaciones.has('topbar'),
    countdown_show_in_cart: ubicaciones.has('carrito'),
    countdown_show_in_product: ubicaciones.has('producto'),
    countdown_show_in_hero: ubicaciones.has('hero'),
    checkout_show_countdown: ubicaciones.has('checkout'),
    checkout_show_stock_warning: conversion.urgencia.stockBajo.activo,
    checkout_stock_warning_threshold: conversion.urgencia.stockBajo.umbral,
  }
}

export function fusionarColumnasConversion(
  actual: ConversionSitio | null | undefined,
  cambios: Record<string, unknown>,
): ConversionSitio {
  const base = { ...columnasDesdeConversion(actual), ...cambios }
  return conversionDesdeColumnas(base) ?? {
    contadores: [],
    urgencia: urgenciaVacia(false, 5),
  }
}

/**
 * Aviso de stock real. `null` si no hay dato, si no queda nada o si supera el umbral.
 * No inventa reservas ni «personas viendo».
 */
export function avisoStock(stock: number | null | undefined, umbral: number, plantilla: string): string | null {
  if (stock == null || !Number.isFinite(stock)) return null
  const n = Math.floor(stock)
  if (n <= 0 || n > umbral) return null
  return plantilla.replaceAll('{n}', String(n))
}

export type EstadoContador = { tipo: 'cuenta'; fin: Date } | { tipo: 'oculto' } | { tipo: 'mensaje'; texto: string }

/**
 * `finPromocion` null = la promoción no está activa para la web o no tiene fin:
 * se aplica la acción al terminar.
 */
export function estadoContador(
  contador: ContadorConversion,
  ahora: Date,
  finPromocion: string | null,
): EstadoContador {
  const terminar = (): EstadoContador => contador.alTerminar.tipo === 'mensaje'
    ? { tipo: 'mensaje', texto: contador.alTerminar.texto }
    : { tipo: 'oculto' }
  if (!contador.activo) return { tipo: 'oculto' }
  if (contador.modo.tipo === 'evergreen') {
    return { tipo: 'cuenta', fin: new Date(ahora.getTime() + contador.modo.minutos * 60_000) }
  }
  let fin: Date | null = null
  if (contador.modo.tipo === 'fecha') {
    const d = new Date(contador.modo.fin)
    fin = Number.isNaN(d.getTime()) ? null : d
  } else if (contador.modo.tipo === 'promocion') {
    if (!finPromocion) return terminar()
    const d = new Date(finPromocion)
    fin = Number.isNaN(d.getTime()) ? null : d
  } else {
    fin = finDiario(ahora, contador.modo.zona, contador.modo.hora)
  }
  if (!fin || fin.getTime() <= ahora.getTime()) return terminar()
  return { tipo: 'cuenta', fin }
}

function finDiario(ahora: Date, zona: string, hora: number): Date | null {
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(ahora)
    const leer = (t: string) => partes.find((p) => p.type === t)?.value || '0'
    const y = leer('year')
    const m = leer('month')
    const d = leer('day')
    const h = Number(leer('hour'))
    const dia = h >= hora
      ? new Date(ahora.getTime() + 24 * 60 * 60 * 1000)
      : ahora
    const p2 = new Intl.DateTimeFormat('en-US', {
      timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23',
    }).formatToParts(dia)
    const leer2 = (t: string) => p2.find((p) => p.type === t)?.value || '0'
    const marca = `${h >= hora ? leer2('year') : y}-${h >= hora ? leer2('month') : m}-${h >= hora ? leer2('day') : d}T${String(hora).padStart(2, '0')}:00:00`
    const candidato = new Date(new Date(marca).toLocaleString('en-US', { timeZone: 'UTC' }))
    return Number.isNaN(candidato.getTime()) ? new Date(ahora.getTime() + 60 * 60 * 1000) : candidato
  } catch {
    return new Date(ahora.getTime() + 60 * 60 * 1000)
  }
}

export function contadoresEn(conversion: ConversionSitio | null | undefined, ubicacion: UbicacionContador): ContadorConversion[] | null {
  if (!conversion) return null
  return conversion.contadores.filter((c) => c.activo && c.ubicaciones.includes(ubicacion))
}
