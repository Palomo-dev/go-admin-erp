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
})
