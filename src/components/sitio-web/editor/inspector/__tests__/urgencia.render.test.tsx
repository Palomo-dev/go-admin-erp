/** @jest-environment jsdom */
import { StrictMode } from 'react'
import { TextEncoder } from 'node:util'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { PanelUrgencia } from '../PanelUrgencia'
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio'
import { conversionDesdeColumnas, estadoContador, contadoresEn } from '@/lib/website/conversion'

jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useTimezoneFor: () => ({ timezone: 'America/Bogota' }) }))
jest.mock('@/components/kit/useIdiomaKit', () => ({ useKitT: () => (key: string) => key }))
jest.mock('@/components/kit', () => ({
  FormField: jest.requireActual('@/components/kit/FormField').FormField,
  SegmentedControl: jest.requireActual('@/components/kit/SegmentedControl').SegmentedControl,
}))
jest.mock('../CampoSeccion', () => ({ CampoSeccion: ({ campo, valor, onCambiar }: { campo: { label: string }; valor: unknown; onCambiar: (v: unknown) => void }) => <input aria-label={campo.label} value={typeof valor === 'string' ? valor : JSON.stringify(valor) ?? ''} onChange={(e) => onCambiar(Array.isArray(valor) ? JSON.parse(e.target.value) : e.target.value)} /> }))

Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true })

const documento = (): DocumentoSitio => {
  const d = validarDocumentoSitio({ schemaVersion: 1, identidad: {}, tema: { colores: {}, tipografia: {} }, seo: {}, contenido: {}, shell: { header: { composicion: 'default', menuPrincipalId: null, opciones: {} }, footer: { composicion: 'default', menuIds: [], opciones: {} } }, menus: [], paginas: [] })
  if (!d.ok) throw new Error(JSON.stringify(d.errores))
  return d.documento
}

test('abrir el inspector o navegar a él no agrega un cambio', () => {
  const cambiar = jest.fn()
  render(<StrictMode><PanelUrgencia documento={documento()} onCambiarDocumento={cambiar} /></StrictMode>)
  expect(cambiar).not.toHaveBeenCalled()
})

test('activar presencia escribe la opción y conserva contador/stock sin inventar métricas', () => {
  let actual = documento()
  const cambiar = jest.fn((fn: (d: DocumentoSitio) => DocumentoSitio) => { actual = fn(actual) })
  const vista = render(<PanelUrgencia documento={actual} onCambiarDocumento={cambiar} />)
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Personas viendo' })).getByRole('radio', { name: 'Activo' }))
  expect(actual.conversion?.urgencia.personasViendo.activo).toBe(true)
  expect(actual.conversion?.contadores).toEqual([])
  expect(actual.conversion?.urgencia.stockBajo.activo).toBe(false)
  expect(validarDocumentoSitio(actual).ok).toBe(true)
  vista.rerender(<PanelUrgencia documento={actual} onCambiarDocumento={cambiar} />)
  fireEvent.change(screen.getByLabelText('Mensaje de presencia ({n})'), { target: { value: 'Ahora: {n}' } })
  vista.rerender(<PanelUrgencia documento={actual} onCambiarDocumento={cambiar} />)
  fireEvent.change(screen.getByLabelText('Mostrar presencia en'), { target: { value: '["producto","checkout"]' } })
  expect(actual.conversion?.urgencia.personasViendo).toEqual({ activo: true, plantilla: 'Ahora: {n}', ubicaciones: ['producto', 'checkout'] })
  expect(validarDocumentoSitio(actual).ok).toBe(true)
})

test('activar el contador desde cero lo hace visible en producto, carrito y checkout', () => {
  let actual = documento()
  const cambiar = (fn: (d: DocumentoSitio) => DocumentoSitio) => { actual = fn(actual) }
  render(<PanelUrgencia documento={actual} onCambiarDocumento={cambiar} />)
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Contador regresivo' })).getByRole('radio', { name: 'Activo' }))
  for (const ubicacion of ['producto', 'carrito', 'checkout'] as const) expect(contadoresEn(actual.conversion, ubicacion)).toHaveLength(1)
  expect(validarDocumentoSitio(actual).ok).toBe(true)
})

test.each([
  ['America/Bogota', '2026-10-25T05:00:00.000Z'],
  ['Asia/Tokyo', '2026-10-24T15:00:00.000Z'],
  ['UTC', '2026-10-25T00:00:00.000Z'],
])('reinicio diario se calcula en %s', (zona, esperado) => {
  const contador = conversionDesdeColumnas({ countdown_enabled: true, countdown_mode: 'daily_reset', countdown_timezone: zona, countdown_reset_hour: 0 })!.contadores[0]
  const estado = estadoContador(contador, new Date('2026-10-24T12:00:00Z'), null)
  expect(estado.tipo).toBe('cuenta')
  if (estado.tipo === 'cuenta') expect(estado.fin.toISOString()).toBe(esperado)
})

test('salto de horario conserva la primera hora válida posterior', () => {
  const contador = conversionDesdeColumnas({ countdown_enabled: true, countdown_mode: 'daily_reset', countdown_timezone: 'America/New_York', countdown_reset_hour: 2 })!.contadores[0]
  const estado = estadoContador(contador, new Date('2026-03-08T05:00:00Z'), null)
  if (estado.tipo !== 'cuenta') throw new Error('El contador debe seguir activo')
  expect(estado.fin.toISOString()).toBe('2026-03-08T07:00:00.000Z')
})

test('rechaza ubicaciones desconocidas y plantillas sin límite', () => {
  const d = documento()
  const c = conversionDesdeColumnas({ countdown_enabled: true })!
  expect(validarDocumentoSitio({ ...d, conversion: { ...c, urgencia: { ...c.urgencia, personasViendo: { activo: true, ubicaciones: ['otra-org'] } } } }).ok).toBe(false)
  expect(validarDocumentoSitio({ ...d, conversion: { ...c, urgencia: { ...c.urgencia, personasViendo: { activo: true, plantilla: 'x'.repeat(201) } } } }).ok).toBe(false)
})
