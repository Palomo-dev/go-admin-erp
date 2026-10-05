# Etapa 1 — Propuesta de base V2 (borrador para revisión)

Estado: **nada aplicado**. Fecha: 2026-10-05. Gobiernan: [ADR-001](ADR-001-ADICIONES-SIN-ALTERAR-LEGACY.md), [ADR-002](ADR-002-DECISIONES-Y-SECUENCIA.md) D1/D3/D4/D6, [FASE-01](FASE-01-CONTRATO-Y-COMPATIBILIDAD.md), [FASE-02](FASE-02-CONTEXTO-Y-AISLAMIENTO.md), [FASE-03](FASE-03-BORRADORES-Y-PUBLICACION.md) y la [revisión 2026-09-29](REVISION-2026-09-29-AJUSTES-ANTES-DE-ETAPA-1.md).

## Piezas

| Pieza | Archivo | Estado |
|---|---|---|
| D12: destino de las 146 columnas de `website_settings` | [D12-CLASIFICACION-COLUMNAS.md](D12-CLASIFICACION-COLUMNAS.md) | Propuesta |
| Contrato del documento (tipos, zod, `resolverCampo`) | `src/lib/website/contrato/documentoSitio.ts` + `__tests__/` | Código puro, 24 pruebas |
| Migración D1 | `supabase/migrations/20261005214150_v2_sitios_borradores_revisiones.sql` | **Aplicada el 2026-10-05** (permisos a roles 1 y 2, RESTRICT en sucursal) |
| Reversión D1 | `supabase/rollbacks/20261005214150_v2_sitios_borradores_revisiones_rollback.sql` | Lista |

## Qué hace el borrador de migración

Todo es aditivo: no altera ninguna tabla, política, UNIQUE ni fila existente, y no contiene `DROP`.

- **`website_site_states`**: una fila por sitio, con UNIQUE `(organization_id, COALESCE(branch_id, -1))`. `branch_id` NULL = sitio principal. Guarda `v2_adopted`, `published_revision_id`, `onboarding jsonb default '{}'` y `primary_domain_id` (FK a `organization_domains`, validado contra la organización). La sucursal se valida con el trigger existente `validate_branch_belongs_to_org`.
- **`website_site_drafts`**: un borrador por sitio (`document jsonb`, `schema_version`, `version`, `updated_by`, `updated_at`, `base_revision_id`). Un trigger impone compare-and-swap: si cambia el documento, `version` debe subir exactamente en 1. Guardar = `update … set document = $doc, version = $v + 1 where site_state_id = $id and version = $v`. 0 filas significa conflicto (409).
- **`website_site_revisions`**: snapshots inmutables (trigger que rechaza `UPDATE`, sin privilegio de escritura para `authenticated`), con `revision_number` correlativo por sitio, `note`, `published_by` y `published_at`.
- **`website_publication_outbox`**: cada publicación o cambio de adopción encola la invalidación. Se verificó por MCP que no existe un outbox reutilizable. Solo lo lee el service role.
- **Permisos** `website.sites.edit` y `website.sites.publish`. `organization_settings` cuenta como equivalente para que los administradores actuales no pierdan acceso el día uno. Se resuelven con `fn_tiene_permiso`/`fn_assert_acceso_org`, nunca por nombre de rol, a diferencia de las políticas legacy de `website_settings`.
- **RLS**: miembros activos leen. Escritura directa solo de `onboarding`/`primary_domain_id` y del documento del borrador, con permiso de edición (privilegios por columna). Sin ninguna política ni privilegio para `anon`.
- **RPC** (`SECURITY DEFINER`, `search_path` fijo, `revoke … from public, anon`):
  - `ensure_site_draft(p_org, p_branch, p_document, p_schema_version)` crea estado y borrador en una transacción. Es idempotente y nunca pisa un borrador existente.
  - `publish_site_revision(p_site, p_expected_version, p_note)` bloquea el sitio y valida permiso y versión. Copia el borrador a una revisión nueva, mueve el puntero y encola. Repetirla con la misma versión devuelve la misma revisión (`idempotente: true`).
  - `set_site_v2_adoption(p_site, p_adopted)` es la adopción explícita. Exige una revisión publicada.

Ensayado en un Postgres 16 local desechable, con stubs de `auth.uid()`, `organizations`, `branches`, `organization_members` y `permissions`: aplica dos veces sin error, la reversión deja 0 tablas y se puede volver a aplicar. Se comprobaron estos casos: sucursal de otra organización, otra organización, miembro sin permiso, `anon`, conflicto de versión, salto de versión, edición de revisión, adopción sin revisión, doble publicación idempotente y outbox. **No se ejecutó nada en la base real.**

## Adopción por sitio sin tocar las lecturas legacy

Regla de una sola fuente por respuesta (D4, ADR-001 §8):

```
estado = website_site_states(org, branch)
si estado existe y v2_adopted y published_revision_id   → servir SOLO la revisión publicada
si no, y branch es NULL (sitio principal)               → camino legacy actual, sin cambios
si no (outlet sin V2 publicado)                         → 404, nunca el sitio principal (ADR-001 §9)
```

- Crear el sitio, importar legacy al borrador y publicar **no cambia nada público**: `publish_site_revision` no toca `v2_adopted`. Así el dueño revisa el preview con la revisión real antes de activar.
- `set_site_v2_adoption(sitio, true)` es el único interruptor. `false` devuelve el principal a legacy (preservado, porque nunca se escribió) y deja un outlet solo V2 en 404. No borra borradores ni revisiones.
- Las 146 columnas siguen siendo la fuente de **operación** (envío, impuestos, checkout, píxeles) también para sitios adoptados, hasta que exista la capa por sitio de D12. Leer operación de `website_settings` no rompe la regla de fuente única: esa regla es de presentación.

## Qué tiene que cambiar después (no incluido aquí)

**ERP** (PR propio, antes que websites):
1. `siteDocumentService` y las rutas `/api/website/sites/{siteRef}/draft|publications|revisions|restorations`, con `getServerOrgContext()`, errores 401/403/404/409/422 y `validarDocumentoSitio` antes de cada escritura y de cada publicación. El SQL solo valida forma y versión.
2. Importador legacy → documento (lectura pura, sin escribir en legacy). Usa D12, convierte con `campoExplicito` para el principal (D6) y con `campoDesdeLegacy` solo para filas de sede antiguas. Los menús se importan una vez a `menus[]` (D3).
3. Editor: para un sitio con estado V2, el guardado va al borrador. `handleSave`, `websiteSettingsService.updateSettings` y `websitePageBuilderService` rechazan con explicación las escrituras de presentación de un sitio adoptado. Los sitios legacy no cambian. `updateSettings` con `branchId` deja de clonar la fila global y lanza error (D7).
4. Selector de sitio con outlets en borrador (`OutletSelector` reutilizado). Inspector con «heredar / personalizar / vaciar» (`resolverCampoConOrigen`).
5. Despachador del outbox → `/api/revalidate` de websites, con reintento.

**goadmin-websites** (PR aparte, después del ERP desplegado):
1. Un lector `getSitioPublicado(org, branchId | null)` con `createAdminClient()` que aplica la regla de arriba. `null` explícito, nunca `undefined`, y `.maybeSingle()`. En el embed, nombrar la FK (`website_site_revisions!website_site_revisions_sitio_fk`), porque estado y revisión tienen dos relaciones.
2. Una rama nueva en `app/[[...slug]]`, detalles y layout. El `else` conserva exactamente el camino legacy. Para sitios V2 no se usa `getEffectiveSettings`/`theme-merge` (D7).
3. Una copia del contrato en `lib/site-contract/` con `VERSION` y hash (A4) y la ruta `app/api/site-capabilities`.
4. Claves de caché con `(org, branch, revision_id)`. Invalidación por el outbox.

## Riesgos

- **Permiso nuevo sin asignar**: solo los superadministradores y quienes tengan `organization_settings` (hoy 2 roles) podrán editar o publicar hasta que se asignen los códigos nuevos. Es intencional, pero hay que comunicarlo.
- **Dos FK entre estado y revisión**: los embeds de PostgREST sin nombre de FK fallan como ambiguos. Las tablas legacy no ganan relaciones nuevas entre sí. `organizations`, `branches` y `organization_domains` sí ganan una relación hacia tablas nuevas, sin ambigüedad.
- **`branches` con `ON DELETE RESTRICT`**: borrar físicamente una sucursal que tiene sitio V2 fallará. Se eligió así para no perder un sitio en silencio. Hay que confirmarlo con el flujo de baja de sucursales.
- **Validación del documento en Node**: el SQL limita el tamaño (2 MB) y comprueba `schemaVersion`. La forma completa la valida el servidor con zod. Un cliente con service role podría guardar un documento malformado, así que el renderer debe tolerar documentos inválidos (diagnóstico, no excepción).
- **Columnas sin efecto** (D12, hallazgo 1): importar tema y capacidades como explícitos hará que **empiecen** a tener efecto en V2. Hay que compararlo visualmente (D8) antes de adoptar.
- **Respaldo y release desplegado sin verificar** (ADR-002 D9): siguen siendo precondición de la primera migración de la etapa 1.
- Validado en Postgres 16 local. Producción es 15: `ON DELETE SET NULL (columna)` y `CREATE OR REPLACE TRIGGER` existen desde la 15 y la 14, respectivamente.

## Orden exacto para aplicar

1. El dueño confirma el respaldo y el release desplegado (D9) y aprueba D12 y este borrador.
2. Renombrar ambos archivos con el mismo `<timestamp>_v2_sitios_borradores_revisiones` (y `_rollback`), según la [política de migraciones](../POLITICA-MIGRACIONES.md).
3. Por MCP, solo lectura: volver a comprobar que no existen las tablas ni las funciones, y que `permissions`, `organization_domains`, `validate_branch_belongs_to_org`, `fn_tiene_permiso` y `fn_assert_acceso_org` conservan las firmas usadas.
4. Ensayar el archivo completo dentro de `begin; … rollback;` y correr las verificaciones del final del `.sql`.
5. `apply_migration` por MCP con el archivo exacto. Correr las verificaciones. `get_advisors` (security) sin hallazgos nuevos sobre `website_site_*`.
6. Commit con `.sql`, rollback, contrato y docs juntos. `push` y PR solo con autorización explícita.
7. ERP: servicio, rutas, importador y editor V2, detrás de la adopción por sitio. Desplegar.
8. websites: lector V2 con su `else` legacy. Desplegar.
9. Piloto (etapa 3): un sitio, importar → preview → publicar → `set_site_v2_adoption(true)` → comparar a 390 y 1440 px → probar `false` y volver a `true`.
