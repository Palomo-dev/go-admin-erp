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
 *     `contentKeys === []`, se omite (pendiente de completar en F2). Si solo ALGUNAS variantes
 *     declaran (`variantsWithoutKeys`), `contentKeys` es la unión de esas: se verifican solo los
 *     campos limitados (`showIf.variantIn`) a variantes que declaran, porque lo demás puede leerlo
 *     un componente que no publica sus claves (p. ej. «Portada · Buscador» declara las suyas y
 *     «Pantalla completa» no).
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
  contentFields: { key: string; group?: string; type?: string; section?: string; showIf?: { variantIn?: string[] } }[]
}

/** Entrada del manifiesto del sitio. */
export interface ManifestEntry {
  type: string
  variants: string[]
  contentKeys: string[]
  /**
   * Variantes cuyo componente no declara `CONTENT_KEYS` cuando otras del mismo tipo sí (opcional:
   * el endpoint vivo no lo publica; el fixture lo deriva del mismo `SECTION_MAP`). Ausente = todas
   * declaran, o ninguna (`contentKeys: []`).
   */
  variantsWithoutKeys?: string[]
}

/**
 * Campos que lee el propio componente: los de contenido y datos, y los que el inspector agrupa en
 * un bloque con título (`section`, p. ej. «Pago» de la Cuenta de la mesa) aunque vivan en la
 * pestaña Diseño. Los avisos (`notice`) no guardan nada y no cuentan. El cascarón
 * (`section_header`, `section_background`) es el editor común: escribe un objeto dentro del
 * contenido y el sitio lo ignora hasta que lo lea. No es una clave de cada componente.
 * El inspector del boletín (`newsletter`) tampoco guarda su clave: escribe
 * `newsletter_layout` y `newsletter`.
 */
function esCampoDelComponente(f: CatalogEntry['contentFields'][number]): boolean {
  if (
    f.type === 'notice' ||
    f.type === 'section_header' ||
    f.type === 'section_background' ||
    f.type === 'newsletter'
  ) return false
  return !f.group || f.group === 'content' || f.group === 'data' || !!f.section
}

/**
 * Claves que un control escribe además de la suya. El constructor de la carta (`type: 'carta'`,
 * `HojaCartaEditor`) guarda la carta fija elegida en `carta_id`.
 */
const CLAVES_EXTRA_POR_CONTROL: Readonly<Record<string, readonly string[]>> = {
  carta: ['carta_id'],
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
      const sinClaves = mani.variantsWithoutKeys ?? []
      const parcial = sinClaves.length > 0
      // En un tipo parcial solo cuenta el campo que únicamente ven variantes que declaran sus claves.
      const verificable = (f: CatalogEntry['contentFields'][number]): boolean => {
        if (!parcial) return true
        const variantes = f.showIf?.variantIn
        return Array.isArray(variantes) && variantes.length > 0 && variantes.every((v) => !sinClaves.includes(v))
      }
      const contentOnlyFields = cat.contentFields.filter(esCampoDelComponente).filter(verificable)
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

      // contentKey del componente no declarada en el catálogo (warning). Cuenta cualquier campo,
      // también los de Diseño o Avanzado: un componente puede publicar en CONTENT_KEYS una opción
      // de diseño que lee él mismo («Línea de puntos»: leader_style) y el catálogo SÍ la declara.
      // En un tipo parcial la unión no dice de qué variante es cada clave: no se avisa.
      const contentFieldKeys = cat.contentFields.flatMap((f) => [f.key, ...(CLAVES_EXTRA_POR_CONTROL[f.type ?? ''] ?? [])])
      for (const ck of parcial ? [] : mani.contentKeys) {
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
