'use client'

import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio'
import { useTimezoneFor } from '@/lib/context/OrganizationTimezoneContext'
import { conversionDesdeColumnas, type ConversionSitio, type ContadorConversion, type UbicacionContador, type UbicacionStock } from '@/lib/website/conversion'
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService'
import { FormField, SegmentedControl } from '@/components/kit'
import { CampoSeccion } from './CampoSeccion'

const UBICACIONES: UbicacionContador[] = ['topbar', 'carrito', 'checkout', 'producto', 'hero', 'seccion']
const UBICACIONES_URGENCIA: UbicacionStock[] = ['producto', 'carrito', 'checkout']
function vacio(): ConversionSitio {
  return conversionDesdeColumnas({ countdown_enabled: true, checkout_show_stock_warning: false, checkout_stock_warning_threshold: 5 })!
}

/** Controles del inspector nuevo: abrir el panel nunca escribe valores predeterminados. */
export function PanelUrgencia({ documento, onCambiarDocumento, deshabilitado, settings }: {
  documento: DocumentoSitio
  onCambiarDocumento: (cambiar: (d: DocumentoSitio) => DocumentoSitio) => void
  settings?: object | null
  deshabilitado?: boolean
}) {
  const { timezone } = useTimezoneFor()
  const conversion = documento.conversion ?? conversionDesdeColumnas((settings ?? {}) as Record<string, unknown>) ?? undefined
  const contador = conversion?.contadores[0]
  const primario = documento.tema.colores.primario
  const colorMarca = primario?.mode === 'value' ? primario.value : String((settings as { primary_color?: string } | null)?.primary_color || '#111827')
  const guardar = (siguiente: ConversionSitio) => onCambiarDocumento((d) => ({ ...d, conversion: siguiente }))
  const base = () => conversion ?? { ...vacio(), contadores: [] }
  const setContador = (parcial: Partial<ContadorConversion>) => {
    const actual = base()
    const c = actual.contadores[0] ?? vacio().contadores[0]
    guardar({ ...actual, contadores: [{ ...c, ...parcial, ...(parcial.activo === true && !c.ubicaciones.length ? { ubicaciones: ['producto', 'carrito', 'checkout'] as UbicacionContador[] } : {}) }] })
  }
  const campo = (def: ContentFieldDef, valor: unknown, cambiar: (valor: unknown) => void) => (
    <CampoSeccion key={def.key} campo={def} valor={valor} contenido={{}} onCambiar={cambiar} onCambiarContenido={() => {}} categorias={{ lista: [], cargando: false }} deshabilitado={deshabilitado} />
  )
  const activo = (etiqueta: string, valor: boolean, cambiar: (valor: boolean) => void) => (
    <FormField key={etiqueta} etiqueta={etiqueta}>
      {(props) => <SegmentedControl aria-labelledby={props.idEtiqueta} opciones={[{ valor: 'no', etiqueta: 'Apagado' }, { valor: 'si', etiqueta: 'Activo' }]} valor={valor ? 'si' : 'no'} onValorChange={(v) => cambiar(v === 'si')} tamano="sm" deshabilitado={deshabilitado} />}
    </FormField>
  )
  const stock = conversion?.urgencia.stockBajo ?? vacio().urgencia.stockBajo
  const viendo = conversion?.urgencia.personasViendo ?? { activo: false }
  const setStock = (parcial: Partial<typeof stock>) => { const actual = base(); guardar({ ...actual, urgencia: { ...actual.urgencia, stockBajo: { ...stock, ...parcial } } }) }
  const setViendo = (parcial: Partial<typeof viendo>) => { const actual = base(); guardar({ ...actual, urgencia: { ...actual.urgencia, personasViendo: { ...viendo, ...parcial } } }) }
  const opciones = (valores: readonly string[]) => valores.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))
  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="text-sm font-semibold text-fg">Urgencia y contador</h3>
      {activo('Contador regresivo', !!contador?.activo, (v) => setContador({ activo: v }))}
      {contador && <>
        {campo({ key: 'textoAntes', label: 'Texto antes', type: 'text' }, contador.textoAntes, (v) => setContador({ textoAntes: String(v) }))}
        {campo({ key: 'textoDespues', label: 'Texto después', type: 'text' }, contador.textoDespues, (v) => setContador({ textoDespues: String(v) }))}
        {campo({ key: 'modo', label: 'Modo', type: 'select', options: [{ value: 'diario', label: 'Diario' }, { value: 'fecha', label: 'Fecha de fin' }, { value: 'evergreen', label: 'Por sesión' }] }, contador.modo.tipo, (v) => setContador({ modo: v === 'fecha' ? { tipo: 'fecha', fin: '', zona: timezone } : v === 'evergreen' ? { tipo: 'evergreen', minutos: 15 } : { tipo: 'diario', hora: 0, zona: timezone } }))}
        {contador.modo.tipo === 'fecha' && campo({ key: 'fin', label: 'Fecha fin (ISO con zona)', type: 'text', placeholder: '2026-12-31T23:59:00-05:00' }, contador.modo.fin, (v) => setContador({ modo: { tipo: 'fecha', fin: String(v), zona: timezone } }))}
        {contador.modo.tipo === 'diario' && campo({ key: 'hora', label: 'Hora de reinicio', type: 'number', min: 0, max: 23 }, contador.modo.hora, (v) => setContador({ modo: { tipo: 'diario', hora: Math.max(0, Math.min(23, Number(v) || 0)), zona: timezone } }))}
        {contador.modo.tipo === 'evergreen' && campo({ key: 'minutos', label: 'Minutos por sesión', type: 'number', min: 1, max: 1440 }, contador.modo.minutos, (v) => setContador({ modo: { tipo: 'evergreen', minutos: Math.max(1, Math.min(1440, Number(v) || 15)) } }))}
        {campo({ key: 'ubicaciones', label: 'Mostrar contador en', type: 'checklist', options: opciones(UBICACIONES) }, contador.ubicaciones, (v) => setContador({ ubicaciones: v as UbicacionContador[] }))}
        {campo({ key: 'forma', label: 'Forma', type: 'select', options: opciones(['pastilla', 'cuadrado', 'redondo']) }, contador.estilo.forma, (v) => setContador({ estilo: { ...contador.estilo, forma: v as ContadorConversion['estilo']['forma'] } }))}
        {campo({ key: 'tamano', label: 'Tamaño', type: 'select', options: [{ value: 'sm', label: 'Pequeño' }, { value: 'md', label: 'Mediano' }, { value: 'lg', label: 'Grande' }] }, contador.estilo.tamano, (v) => setContador({ estilo: { ...contador.estilo, tamano: v as ContadorConversion['estilo']['tamano'] } }))}
        {campo({ key: 'cajas', label: 'Dígitos', type: 'select', options: [{ value: 'digito', label: 'En cajas' }, { value: 'linea', label: 'En línea' }] }, contador.estilo.cajas, (v) => setContador({ estilo: { ...contador.estilo, cajas: v as 'digito' | 'linea' } }))}
        {(['fondo', 'texto'] as const).map((key) => campo({ key, label: `Color de ${key}`, type: 'color' }, contador.estilo[key] ?? (key === 'fondo' ? colorMarca : '#FFFFFF'), (v) => setContador({ estilo: { ...contador.estilo, [key]: String(v) } })))}
        {activo('Borde del contador', !!contador.estilo.borde, (v) => setContador({ estilo: { ...contador.estilo, borde: v ? '#FFFFFF' : undefined } }))}
        {contador.estilo.borde && campo({ key: 'borde', label: 'Color de borde', type: 'color' }, contador.estilo.borde, (v) => setContador({ estilo: { ...contador.estilo, borde: String(v) } }))}
        {contador.estilo.forma === 'pastilla' && campo({ key: 'radio', label: 'Radio', type: 'number', min: 0, max: 48 }, contador.estilo.radio ?? 8, (v) => setContador({ estilo: { ...contador.estilo, radio: Math.max(0, Math.min(48, Number(v) || 0)) } }))}
        {activo('Sombra', contador.estilo.sombra, (v) => setContador({ estilo: { ...contador.estilo, sombra: v } }))}
        {(['dias', 'horas', 'minutos', 'segundos', 'etiquetas'] as const).map((key) => activo(`Mostrar ${key}`, contador.formato[key], (v) => setContador({ formato: { ...contador.formato, [key]: v } })))}
        {campo({ key: 'alTerminar', label: 'Al terminar', type: 'select', options: [{ value: 'ocultar', label: 'Ocultar' }, { value: 'mensaje', label: 'Mostrar mensaje' }] }, contador.alTerminar.tipo, (v) => setContador({ alTerminar: v === 'mensaje' ? { tipo: 'mensaje', texto: 'La oferta terminó' } : { tipo: 'ocultar' } }))}
        {contador.alTerminar.tipo === 'mensaje' && campo({ key: 'mensajeFinal', label: 'Mensaje final', type: 'text' }, contador.alTerminar.texto, (v) => setContador({ alTerminar: { tipo: 'mensaje', texto: String(v) } }))}
      </>}
      {activo('Aviso de stock bajo', stock.activo, (v) => setStock({ activo: v, ubicaciones: stock.ubicaciones.length ? stock.ubicaciones : UBICACIONES_URGENCIA }))}
      {stock.activo && <>
        {campo({ key: 'umbral', label: 'Umbral de existencias', type: 'number', min: 1, max: 999 }, stock.umbral, (v) => setStock({ umbral: Math.max(1, Math.min(999, Number(v) || 5)) }))}
        {campo({ key: 'stockTexto', label: 'Mensaje de stock ({n})', type: 'text' }, stock.plantilla, (v) => setStock({ plantilla: String(v) }))}
        {campo({ key: 'stockUbicaciones', label: 'Mostrar stock en', type: 'checklist', options: opciones(UBICACIONES_URGENCIA) }, stock.ubicaciones, (v) => setStock({ ubicaciones: v as UbicacionStock[] }))}
      </>}
      {activo('Personas viendo', viendo.activo, (v) => setViendo({ activo: v }))}
      {viendo.activo && <>
        {campo({ key: 'personasTexto', label: 'Mensaje de presencia ({n})', type: 'text' }, viendo.plantilla ?? '{n} personas viendo', (v) => setViendo({ plantilla: String(v) }))}
        {campo({ key: 'personasUbicaciones', label: 'Mostrar presencia en', type: 'checklist', options: opciones(UBICACIONES_URGENCIA) }, viendo.ubicaciones ?? UBICACIONES_URGENCIA, (v) => setViendo({ ubicaciones: v as UbicacionStock[] }))}
      </>}
      <p className="text-xs text-fg-secondary">Las existencias y las personas viendo provienen de datos reales. Sin datos, el mensaje se oculta.</p>
    </section>
  )
}
