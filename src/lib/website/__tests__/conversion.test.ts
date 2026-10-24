import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio'
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService'
import {
  avisoStock,
  columnasDesdeConversion,
  conversionDesdeColumnas,
  estadoContador,
  type ContadorConversion,
} from '@/lib/website/conversion'
import { aplicarAjustesAlDocumento, ajustesDesdeDocumento } from '@/lib/website/v2/vistaEditor'

function documentoMinimo(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: {},
    tema: { colores: {}, tipografia: {} },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'default', menuPrincipalId: null, opciones: {} },
      footer: { composicion: 'default', menuIds: [], opciones: {} },
    },
    menus: [],
    paginas: [],
  })
  if (!r.ok) throw new Error(JSON.stringify(r.errores))
  return r.documento
}

function contador(parcial: Partial<ContadorConversion>): ContadorConversion {
  return {
    id: 'c1',
    activo: true,
    ubicaciones: ['checkout'],
    modo: { tipo: 'promocion', promotionId: '00000000-0000-4000-8000-000000000001' },
    formato: { dias: false, horas: true, minutos: true, segundos: true, etiquetas: false },
    estilo: { forma: 'pastilla', sombra: false, tamano: 'sm', cajas: 'linea' },
    textoAntes: 'Termina pronto',
    textoDespues: '',
    alTerminar: { tipo: 'mensaje', texto: 'Se acabó' },
    ...parcial,
  }
}

describe('conversion', () => {
  test('sin columnas de contador no hay documento de urgencia', () => {
    expect(conversionDesdeColumnas({ countdown_enabled: false, checkout_show_stock_warning: false })).toBeNull()
  })

  test('daily_reset y el aviso de stock pasan al documento', () => {
    const conversion = conversionDesdeColumnas({
      countdown_enabled: true,
      countdown_mode: 'daily_reset',
      countdown_timezone: 'America/Bogota',
      countdown_reset_hour: 0,
      countdown_title: 'Oferta',
      countdown_show_in_header: true,
      checkout_show_countdown: true,
      checkout_show_stock_warning: true,
      checkout_stock_warning_threshold: 5,
    })
    expect(conversion?.contadores[0]?.modo).toEqual({ tipo: 'diario', hora: 0, zona: 'America/Bogota' })
    expect(conversion?.contadores[0]?.ubicaciones).toEqual(['topbar', 'checkout'])
    expect(conversion?.urgencia.stockBajo).toMatchObject({ activo: true, umbral: 5 })
    expect(conversion?.urgencia.reservaCarrito.activo).toBe(false)
    expect(conversion?.urgencia.personasViendo.activo).toBe(false)
    const doc = documentoMinimo()
    expect(validarDocumentoSitio({ ...doc, conversion }).ok).toBe(true)
    expect(validarDocumentoSitio(doc).ok).toBe(true)
  })

  test('el aviso no sale sin stock real, en cero o por encima del umbral', () => {
    expect(avisoStock(null, 5, 'Quedan {n}')).toBeNull()
    expect(avisoStock(undefined, 5, 'Quedan {n}')).toBeNull()
    expect(avisoStock(0, 5, 'Quedan {n}')).toBeNull()
    expect(avisoStock(6, 5, 'Quedan {n}')).toBeNull()
    expect(avisoStock(3, 5, 'Quedan {n}')).toBe('Quedan 3')
  })

  test('una promoción caducada aplica la acción al terminar', () => {
    const c = contador({})
    const ahora = new Date('2026-10-22T12:00:00.000Z')
    expect(estadoContador(c, ahora, '2026-10-21T12:00:00.000Z')).toEqual({ tipo: 'mensaje', texto: 'Se acabó' })
    expect(estadoContador({ ...c, alTerminar: { tipo: 'ocultar' } }, ahora, null)).toEqual({ tipo: 'oculto' })
    expect(estadoContador(c, ahora, '2026-10-23T12:00:00.000Z').tipo).toBe('cuenta')
  })

  test('el inspector deja de descartar countdown_enabled y lo devuelve', () => {
    const previo = process.env.NEXT_PUBLIC_WEBSITE_URGENCIA
    process.env.NEXT_PUBLIC_WEBSITE_URGENCIA = '1'
    try {
      const { documento, noAplicadas } = aplicarAjustesAlDocumento(documentoMinimo(), {
        countdown_enabled: true,
        countdown_show_in_header: true,
        countdown_title: 'Hoy',
      })
      expect(noAplicadas).not.toContain('countdown_enabled')
      const ajustes = ajustesDesdeDocumento(documento, { organization_id: 120 } as WebsiteSettings, null).ajustes as unknown as Record<string, unknown>
      expect(ajustes.countdown_enabled).toBe(true)
      expect(ajustes.countdown_title).toBe('Hoy')
      expect(ajustes.countdown_show_in_header).toBe(true)
      expect(columnasDesdeConversion(documento.conversion).countdown_mode).toBe('daily_reset')
    } finally {
      if (previo === undefined) delete process.env.NEXT_PUBLIC_WEBSITE_URGENCIA
      else process.env.NEXT_PUBLIC_WEBSITE_URGENCIA = previo
    }
  })

  test('sin el interruptor, el contador no se escribe en el documento', () => {
    const previo = process.env.NEXT_PUBLIC_WEBSITE_URGENCIA
    delete process.env.NEXT_PUBLIC_WEBSITE_URGENCIA
    try {
      const { documento, noAplicadas } = aplicarAjustesAlDocumento(documentoMinimo(), {
        countdown_enabled: true,
      })
      expect(documento.conversion).toBeUndefined()
      expect(noAplicadas).toContain('countdown_enabled')
    } finally {
      if (previo === undefined) delete process.env.NEXT_PUBLIC_WEBSITE_URGENCIA
      else process.env.NEXT_PUBLIC_WEBSITE_URGENCIA = previo
    }
  })
})
