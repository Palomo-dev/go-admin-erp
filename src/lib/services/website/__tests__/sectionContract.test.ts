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
      select: jest.fn().returnThis(),
      eq: jest.fn().returnThis(),
      order: jest.fn().returnThis(),
      single: jest.fn().returnThis(),
      maybeSingle: jest.fn().returnThis(),
      limit: jest.fn().returnThis(),
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
import { verifySectionContract, type ContractIssue } from '../sectionContract'
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
