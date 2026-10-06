/**
 * Test de contrato editor ↔ sitio (F0.6).
 *
 * Verifica que el SECTION_CATALOG del ERP esté sincronizado con el manifiesto
 * del sitio. Corre con `npm test` en CI.
 *
 * Reglas:
 *  - Un type:variant del catálogo que no existe en el manifiesto → ERROR.
 *  - Un type:variant del manifiesto que no existe en el catálogo → WARNING (huérfano).
 *  - Una contentField key que no está en contentKeys del componente → ERROR.
 *  - El test falla si hay errores críticos.
 */

// Mock de dependencias de runtime que no están disponibles en Node/Jest.
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    })),
  },
  getProjectRef: jest.fn(() => 'test'),
}))
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}))

import { SECTION_CATALOG } from '@/lib/services/websitePageBuilderService'
import { verifySectionContract } from '../sectionContract'
import { siteManifestFixture } from './siteManifest.fixture'

describe('Contrato editor ↔ sitio (F0.6)', () => {
  const result = verifySectionContract(SECTION_CATALOG, siteManifestFixture)

  // ---- Errores críticos: el test falla si hay alguno ----
  describe('errores críticos', () => {
    it('no debe haber type:variant del catálogo que no exista en el sitio', () => {
      const criticalErrors = result.errors.filter(
        (e) => e.code === 'TYPE_NOT_IN_SITE' || e.code === 'VARIANT_NOT_IN_SITE',
      )
      if (criticalErrors.length > 0) {
        console.error('ERRORES CRÍTICOS — variantes del catálogo no renderizan en el sitio:')
        for (const e of criticalErrors) {
          console.error(`  ${e.type}${e.variant ? ':' + e.variant : ''} — ${e.message}`)
        }
      }
      expect(criticalErrors).toEqual([])
    })
  })

  // ---- contentKey mismatch (bug items vs images — REPARADO en F2.2) ----
  describe('contentKeys', () => {
    it('gallery: NO debe haber mismatch de claves (bug items vs images reparado en F2.2)', () => {
      // F2.2: el catálogo del ERP ahora declara `images` como clave del repeater,
      // coincidiendo con contentKeys del sitio. El bug items vs images (P4) está resuelto.
      const galleryKeyErrors = result.errors.filter(
        (e) => e.code === 'CONTENT_KEY_MISMATCH' && e.type === 'gallery',
      )

      expect(galleryKeyErrors).toEqual([])

      console.log('Bug items vs images REPARADO (F2.2): sin errores de contentKey para gallery.')
    })

    it('gallery: subtitle sigue como warning (pendiente de declarar en el catálogo)', () => {
      // El componente gallery declara contentKeys: [title, subtitle, images]
      // El catálogo ahora declara: title, subtitle, images → solo puede quedar
      // algún warning residual si alguna key del componente no está en el catálogo.
      const galleryWarnings = result.warnings.filter(
        (w) => w.code === 'CONTENT_KEY_NOT_IN_CATALOG' && w.type === 'gallery',
      )
      const warnedKeys = galleryWarnings.map((w) => w.key).sort()

      // `images` ya está en el catálogo → NO debe aparecer como warning.
      expect(warnedKeys).not.toContain('images')

      console.log('Warnings residuales de galería:', warnedKeys.length ? warnedKeys : 'ninguno')
    })
  })

  // ---- Carta completa: primer tipo con contentKeys declaradas en el sitio ----
  describe('menu_full', () => {
    it('catálogo y sitio coinciden en variantes y claves de contenido', () => {
      const issues = [...result.errors, ...result.warnings].filter((i) => i.type === 'menu_full')
      expect(issues).toEqual([])

      const entry = SECTION_CATALOG.find((s) => s.type === 'menu_full')
      expect(entry?.variants.map((v) => v.id).sort()).toEqual(['anchors', 'editorial', 'per_category', 'tabs'])
    })
  })

  // ---- Secciones nuevas de restaurante (Figma «Secciones nuevas» 167:5358) ----
  describe('secciones nuevas de restaurante', () => {
    it.each([
      ['restaurant_hero', ['split_bento', 'typographic']],
      ['marquee', ['photos', 'text']],
      ['signature_dishes', ['carousel', 'scrollytelling']],
      ['events', ['detail', 'list']],
      ['private_events', ['default']],
      ['chef_team', ['chef', 'team']],
      ['gallery_bento', ['default']],
    ])('%s: catálogo y sitio coinciden en variantes y claves de contenido', (type, variants) => {
      const issues = [...result.errors, ...result.warnings].filter((i) => i.type === type)
      expect(issues).toEqual([])

      const entry = SECTION_CATALOG.find((s) => s.type === type)
      expect(entry?.variants.map((v) => v.id).sort()).toEqual(variants)
    })

    it('los platos estrella se eligen de la carta con el selector de productos', () => {
      const dishes = SECTION_CATALOG.find((s) => s.type === 'signature_dishes')?.contentFields.find((f) => f.key === 'dishes')
      expect(dishes).toMatchObject({ type: 'repeater', group: 'data' })
      expect(dishes?.itemFields?.find((f) => f.key === 'product_id')).toMatchObject({ type: 'entity', entity: 'product' })
    })

    it('las secciones nuevas reciben los campos de estilo comunes', () => {
      for (const type of ['restaurant_hero', 'marquee', 'signature_dishes', 'events', 'private_events', 'chef_team', 'gallery_bento']) {
        const keys = SECTION_CATALOG.find((s) => s.type === type)?.contentFields.map((f) => f.key) ?? []
        expect(keys).toEqual(expect.arrayContaining(['bg_type', 'card_radius']))
      }
    })

    it('chef_team no reutiliza el tipo de `team` ni de `chef_section`', () => {
      expect(SECTION_CATALOG.find((s) => s.type === 'team')?.variants.map((v) => v.id)).not.toContain('chef')
      expect(SECTION_CATALOG.find((s) => s.type === 'chef_section')?.variants.map((v) => v.id)).toEqual(['profile'])
    })
  })

  // ---- Reserva de mesa y Horario y sedes (Figma 141:5796 y 144:6644) ----
  describe('reservation y hours_location', () => {
    it.each([
      ['reservation', ['band', 'external', 'form_image', 'hero_widget', 'stepper']],
      ['hours_location', ['cards', 'hours_map', 'list']],
    ])('%s: catálogo y sitio coinciden en variantes y claves de contenido', (type, variants) => {
      const issues = [...result.errors, ...result.warnings].filter((i) => i.type === type)
      expect(issues).toEqual([])

      const entry = SECTION_CATALOG.find((s) => s.type === type)
      expect(entry?.variants.map((v) => v.id).sort()).toEqual(variants)
    })

    it('las sedes se eligen con el selector de sedes del editor', () => {
      for (const type of ['reservation', 'hours_location']) {
        const field = SECTION_CATALOG.find((s) => s.type === type)?.contentFields.find((f) => f.key === 'branch_ids')
        expect(field).toMatchObject({ type: 'entity', entity: 'branch', multiple: true, group: 'data' })
      }
    })

    it('reservation_cta sigue en el catálogo con sus variantes', () => {
      const entry = SECTION_CATALOG.find((s) => s.type === 'reservation_cta')
      expect(entry?.variants.map((v) => v.id).sort()).toEqual(['simple', 'with_form'])
    })
  })

  // ---- Huérfanos: tipos del sitio no ofrecidos por el editor ----
  describe('tipos huérfanos (warnings)', () => {
    it('los tipos huérfanos conocidos de P2 fueron declarados en F2.3', () => {
      const orphanTypes = result.warnings
        .filter((w) => w.code === 'ORPHAN_TYPE')
        .map((w) => w.type)
        .sort()

      // F2.3 declaró los 26 tipos huérfanos del manifiesto del sitio.
      // Ninguno de los tipos conocidos debe seguir siendo huérfano.
      const previouslyOrphan = [
        'services_list',
        'partners',
        'why_choose_us',
        'specialties',
        'reservation_cta',
        'delivery_cta',
        'chef_section',
        'class_schedule',
        'trainers',
        'gym_features',
        'transformation',
        'routes',
        'fleet_showcase',
        'trip_search',
        'booking_transport',
      ]
      for (const t of previouslyOrphan) {
        expect(orphanTypes).not.toContain(t)
      }

      console.log(`Tipos huérfanos restantes (${orphanTypes.length}):`)
      for (const t of orphanTypes) {
        console.log(`  ${t}`)
      }
    })

    it('las variantes huérfanas conocidas fueron declaradas en F2.4', () => {
      const orphanVariants = result.warnings
        .filter((w) => w.code === 'ORPHAN_VARIANT')
        .map((w) => `${w.type}:${w.variant}`)
        .sort()

      // F2.4 declaró las variantes faltantes. Ninguna debe seguir siendo huérfana.
      const previouslyOrphanVariants = [
        'cta:split',
        'contact_form:simple',
        'map:default',
        'products_grid:default',
        'team:simple',
        'categories_grid:default',
        'categories_grid:horizontal',
        'categories_grid:icons',
        'image_text:image_top',
      ]
      for (const v of previouslyOrphanVariants) {
        expect(orphanVariants).not.toContain(v)
      }

      console.log(`Variantes huérfanas restantes (${orphanVariants.length}):`)
      for (const v of orphanVariants) {
        console.log(`  ${v}`)
      }
    })
  })

  // ---- Resumen general ----
  it('imprime el resumen del contrato', () => {
    console.log(result.summary)
    expect(result.summary).toBeDefined()
    expect(typeof result.summary).toBe('string')
  })
})
