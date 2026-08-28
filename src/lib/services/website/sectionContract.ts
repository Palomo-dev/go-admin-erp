/**
 * Verificación del contrato editor ↔ sitio (F0.6).
 *
 * Compara el `SECTION_CATALOG` del ERP con el manifiesto que devuelve el sitio
 * (`GET /api/_sections/manifest`). Detecta tres clases de desincronización:
 *
 *  1. **Error crítico** — un `type:variant` del catálogo no existe en el
 *     manifiesto del sitio → el usuario podría crear una sección que no
 *     renderiza.
 *
 *  2. **Warning (huérfano)** — un `type:variant` del manifiesto no existe en
 *     el catálogo → el sitio sabe renderizar algo que el editor no ofrece.
 *     (Los ~15-26 tipos huérfanos de P2.)
 *
 *  3. **Error de contentKey** — una clave de `contentFields` del catálogo no
 *     está en `contentKeys` del componente → el editor guarda un campo que el
 *     componente no lee (bug `items` vs `images` de P4). Solo se verifica
 *     cuando el componente declara `contentKeys` no vacío; si
 *     `contentKeys === []`, se omite (pendiente de completar en F2).
 *
 * El módulo es **puro**: no importa Supabase ni React, solo tipos, de modo que
 * puede ejecutarse en CI con Jest sin dependencias de runtime.
 */

// ============================================================
// TIPOS (espejo de los del ERP y del sitio — sin import runtime)
// ============================================================

/** Entrada del catálogo del ERP (subset de SectionTypeDefinition). */
export interface CatalogEntry {
  type: string
  variants: { id: string; label: string }[]
  contentFields: { key: string; group?: string; [k: string]: unknown }[]
}

/** Entrada del manifiesto del sitio. */
export interface ManifestEntry {
  type: string
  variants: string[]
  contentKeys: string[]
}

/** Manifiesto completo del sitio. */
export interface SectionManifest {
  version: string
  sections: ManifestEntry[]
}

// ============================================================
// RESULTADO
// ============================================================

export type IssueSeverity = 'error' | 'warning'

export interface ContractIssue {
  severity: IssueSeverity
  code: string
  message: string
  type: string
  variant?: string
  key?: string
}

export interface ContractResult {
  errors: ContractIssue[]
  warnings: ContractIssue[]
  /** true si hay al menos un error crítico. */
  hasErrors: boolean
  /** Resumen legible para logs/CI. */
  summary: string
}

// ============================================================
// LÓGICA
// ============================================================

/**
 * Verifica el contrato entre el catálogo del ERP y el manifiesto del sitio.
 *
 * @param catalog  — `SECTION_CATALOG` del ERP (o un fixture equivalente).
 * @param manifest — manifiesto devuelto por el sitio.
 * @returns resultado con errors (críticos) y warnings (huérfanos).
 */
export function verifySectionContract(
  catalog: CatalogEntry[],
  manifest: SectionManifest,
): ContractResult {
  const errors: ContractIssue[] = []
  const warnings: ContractIssue[] = []

  // Índices para búsqueda O(1)
  const manifestIndex = new Map<string, ManifestEntry>()
  for (const m of manifest.sections) {
    manifestIndex.set(m.type, m)
  }

  const manifestVariantSet = new Set<string>()
  for (const m of manifest.sections) {
    for (const v of m.variants) {
      manifestVariantSet.add(`${m.type}:${v}`)
    }
  }

  const catalogTypes = new Set(catalog.map((c) => c.type))
  const catalogVariantSet = new Set<string>()
  for (const c of catalog) {
    for (const v of c.variants) {
      catalogVariantSet.add(`${c.type}:${v.id}`)
    }
  }

  // ---- 1. Catálogo → Manifiesto (errores críticos) ----
  for (const cat of catalog) {
    const mani = manifestIndex.get(cat.type)

    // type completo no existe en el sitio
    if (!mani) {
      errors.push({
        severity: 'error',
        code: 'TYPE_NOT_IN_SITE',
        message: `El tipo "${cat.type}" existe en el catálogo del ERP pero no en el manifiesto del sitio — las secciones de este tipo no renderizarán.`,
        type: cat.type,
      })
      continue
    }

    // variant no existe en el sitio
    for (const v of cat.variants) {
      if (!mani.variants.includes(v.id)) {
        errors.push({
          severity: 'error',
          code: 'VARIANT_NOT_IN_SITE',
          message: `La variante "${cat.type}:${v.id}" existe en el catálogo del ERP pero no en el manifiesto del sitio — no renderizará.`,
          type: cat.type,
          variant: v.id,
        })
      }
    }

    // ---- 3. contentFields → contentKeys (errores de key) ----
    // Solo se verifica si el componente declara contentKeys no vacío.
    // Se filtran los campos de estilo/layout/spacing (group !== 'content'|'data')
    // porque los lee SectionWrapper, no el componente directamente.
    if (mani.contentKeys.length > 0) {
      const contentOnlyFields = cat.contentFields.filter(
        (f) => !f.group || f.group === 'content' || f.group === 'data',
      )
      for (const field of contentOnlyFields) {
        if (!mani.contentKeys.includes(field.key)) {
          errors.push({
            severity: 'error',
            code: 'CONTENT_KEY_MISMATCH',
            message: `El campo "${field.key}" del catálogo no está en contentKeys del componente "${cat.type}" (esperadas: ${mani.contentKeys.join(', ')}).`,
            type: cat.type,
            key: field.key,
          })
        }
      }

      // contentKey del componente no declarada en el catálogo (warning)
      const contentFieldKeys = cat.contentFields
        .filter((f) => !f.group || f.group === 'content' || f.group === 'data')
        .map((f) => f.key)
      for (const ck of mani.contentKeys) {
        if (!contentFieldKeys.includes(ck)) {
          warnings.push({
            severity: 'warning',
            code: 'CONTENT_KEY_NOT_IN_CATALOG',
            message: `El componente "${cat.type}" lee "${ck}" pero el catálogo no lo declara — posible desincronización (ej. bug items vs images).`,
            type: cat.type,
            key: ck,
          })
        }
      }
    }
  }

  // ---- 2. Manifiesto → Catálogo (warnings / huérfanos) ----
  for (const m of manifest.sections) {
    if (!catalogTypes.has(m.type)) {
      warnings.push({
        severity: 'warning',
        code: 'ORPHAN_TYPE',
        message: `El tipo "${m.type}" existe en el manifiesto del sitio pero no en el catálogo del ERP — el editor no ofrece este tipo.`,
        type: m.type,
      })
      continue
    }

    for (const v of m.variants) {
      if (!catalogVariantSet.has(`${m.type}:${v}`)) {
        warnings.push({
          severity: 'warning',
          code: 'ORPHAN_VARIANT',
          message: `La variante "${m.type}:${v}" existe en el manifiesto del sitio pero no en el catálogo del ERP.`,
          type: m.type,
          variant: v,
        })
      }
    }
  }

  const hasErrors = errors.length > 0
  const summary = [
    `Contrato editor ↔ sitio: ${errors.length} error(s), ${warnings.length} warning(s).`,
    ...errors.map((e) => `  [ERROR] ${e.code}: ${e.message}`),
    ...warnings.map((w) => `  [WARN]  ${w.code}: ${w.message}`),
  ].join('\n')

  return { errors, warnings, hasErrors, summary }
}

// ============================================================
// HELPER PARA EL EDITOR (Part D)
// ============================================================

/**
 * Determina si una sección específica (type + variant) está desincronizada
 * respecto al manifiesto del sitio. Usado por el editor para mostrar un aviso
 * discreto (badge) en vez de fallar en silencio.
 */
export function getSectionSyncStatus(
  sectionType: string,
  sectionVariant: string,
  manifest: SectionManifest | null | undefined,
): { isOrphan: boolean; reason?: string } {
  if (!manifest) return { isOrphan: false }

  const entry = manifest.sections.find((s) => s.type === sectionType)
  if (!entry) {
    return { isOrphan: true, reason: 'Tipo no reconocido por el sitio' }
  }
  if (!entry.variants.includes(sectionVariant)) {
    return { isOrphan: true, reason: 'Variante no reconocida por el sitio' }
  }
  return { isOrphan: false }
}
