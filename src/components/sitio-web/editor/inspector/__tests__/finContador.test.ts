import { partirFin, unirFin, desfaseZona } from '../finContador'

describe('fin del contador (URGENC-03)', () => {
  it('lee lo guardado a mano sin cambiarlo', () => {
    expect(partirFin('2026-12-24T18:30')).toEqual({ dia: '2026-12-24', hora: '18:30' })
    expect(partirFin('2026-12-24')).toEqual({ dia: '2026-12-24', hora: '' })
    expect(partirFin('mañana')).toEqual({ dia: '', hora: '' })
  })
  it('guarda con el desfase de la zona de la organización', () => {
    expect(unirFin('2026-12-24', '18:30', 'America/Bogota')).toBe('2026-12-24T18:30:00-05:00')
    expect(new Date(unirFin('2026-12-24', '18:30', 'America/Bogota')).toISOString()).toBe('2026-12-24T23:30:00.000Z')
    expect(unirFin('2026-07-01', '', 'Europe/Madrid')).toBe('2026-07-01T23:59:00+02:00')
    expect(desfaseZona('2026-01-01', '00:00', 'UTC')).toBe('Z')
    expect(unirFin('', '10:00', 'America/Bogota')).toBe('')
  })
  it('un valor con Z o desfase se lee en la zona de la sede y editar no corre el fin', () => {
    const viejo = '2026-12-25T04:59:00.000Z'
    const p = partirFin(viejo, 'America/Bogota')
    expect(p).toEqual({ dia: '2026-12-24', hora: '23:59' })
    expect(new Date(unirFin(p.dia, p.hora, 'America/Bogota')).getTime()).toBe(new Date(viejo).getTime())
    expect(partirFin('2026-12-24T18:30:00-05:00', 'America/Bogota')).toEqual({ dia: '2026-12-24', hora: '18:30' })
    expect(partirFin('2026-07-01T10:00:00+00:00', 'Europe/Madrid')).toEqual({ dia: '2026-07-01', hora: '12:00' })
    expect(partirFin('2026-12-24T18:30', 'America/Bogota')).toEqual({ dia: '2026-12-24', hora: '18:30' })
    expect(partirFin(viejo)).toEqual({ dia: '2026-12-25', hora: '04:59' })
  })
})

describe('desfaseZona en cambio de horario y segundos (QA fd02df326)', () => {
  test('el desfase es el de esa hora local, no el de horas antes (Nueva York, 8 mar 2026 y 1 nov 2026)', () => {
    expect(desfaseZona('2026-03-08', '03:30', 'America/New_York')).toBe('-04:00')
    expect(desfaseZona('2026-03-08', '01:30', 'America/New_York')).toBe('-05:00')
    expect(desfaseZona('2026-11-01', '03:00', 'America/New_York')).toBe('-05:00')
    expect(desfaseZona('2026-07-01', '12:00', 'Europe/Madrid')).toBe('+02:00')
    expect(desfaseZona('2026-12-24', '18:30', 'America/Bogota')).toBe('-05:00')
  })
  test('se conservan los segundos al editar día u hora', () => {
    const p = partirFin('2026-12-24T18:30:45-05:00', 'America/Bogota')
    expect(p).toEqual({ dia: '2026-12-24', hora: '18:30', seg: '45' })
    expect(unirFin('2026-12-25', p.hora, 'America/Bogota', p.seg)).toBe('2026-12-25T18:30:45-05:00')
    expect(partirFin('2026-12-24T18:30:00').seg).toBeUndefined()
  })
})
