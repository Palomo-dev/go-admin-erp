import { ETIQUETA_LAYOUT, LAYOUTS_BOLETIN, precargaBoletin } from '../boletinPresets'

describe('presets del boletín', () => {
  it('cubre los ocho diseños y no pisa el título', () => {
    expect(LAYOUTS_BOLETIN).toHaveLength(8)
    for (const id of LAYOUTS_BOLETIN) {
      const precarga = precargaBoletin(id)
      expect(ETIQUETA_LAYOUT[id].length).toBeGreaterThan(0)
      expect(precarga).not.toHaveProperty('title')
      expect(precarga).not.toHaveProperty('subtitle')
      expect(precarga).not.toHaveProperty('button_text')
    }
  })

  it('el centrado no inventa fondo', () => {
    expect(precargaBoletin('centered')).toEqual({ align: 'center', form: { arrangement: 'inline' } })
  })

  it('la tarjeta flotante trae degradado y sombra', () => {
    const precarga = precargaBoletin('card_floating') as { background: { gradient_1: string }; container: { shadow: boolean } }
    expect(precarga.background.gradient_1).toMatch(/^#/)
    expect(precarga.container.shadow).toBe(true)
  })
})
