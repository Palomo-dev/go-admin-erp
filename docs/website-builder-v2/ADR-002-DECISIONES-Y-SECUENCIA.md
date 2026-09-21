# ADR-002 — Decisiones cerradas y re-secuenciación del plan V2

Estado: **vigente desde 2026-09-21**. Donde una fase diga «propuesto», «nombres no confirmados» o «definir en F00» sobre alguno de los puntos siguientes, manda este documento. Complementa a [ADR-001](ADR-001-ADICIONES-SIN-ALTERAR-LEGACY.md); no lo sustituye.

## Contexto

Revisión del 2026-09-21 de los cuatro planes previos (header, footer, editor, multi-outlet) y de la documentación V2. Datos de la base real ese día: `website_settings` con 146 columnas; 0 settings y 0 páginas con `branch_id`; 0 sucursales publicadas en web; 0 filas en `website_page_versions`; 148 menús nombrados conviviendo con 497 páginas que siguen usando `show_in_header`; los 3 UNIQUE legacy presentes.

Conclusiones de esa revisión: la arquitectura V2 es correcta; los problemas son (1) el valor visible llegaba en la fase 9 de 14, (2) cuatro decisiones bloqueantes seguían abiertas, (3) el catálogo no cubría plantillas de página, sidebar ni los giros que ya existen en el código, (4) dos hallazgos de seguridad no tenían dueño, y (5) F00 tenía condiciones de salida imposibles de cumplir con las herramientas disponibles.

## Decisiones

### D1 — Esquema V2

Tablas nuevas, aditivas, con RLS por organización y permisos resueltos en servidor:

| Tabla | Función | Unicidad |
|---|---|---|
| `website_site_states` | Una fila por sitio: organización, `branch_id` (NULL = sitio global), flag de adopción V2, puntero a revisión publicada, puntero a borrador | `(organization_id, COALESCE(branch_id, -1))` |
| `website_site_drafts` | Documento de borrador (jsonb), `schema_version`, versión optimista, autor, `updated_at` | Una por sitio |
| `website_site_revisions` | Snapshot inmutable publicado (jsonb), `schema_version`, autor, resumen, `published_at` | `(site_state_id, revision_number)` |

La publicación es una RPC transaccional (`publish_site_revision`) que valida permiso, alcance y versión esperada, inserta la revisión, mueve el puntero y encola la invalidación. La invalidación usa la infraestructura de outbox existente si la hay; si no, una tabla `website_publication_outbox`. Se decide en la etapa 1 tras verificar por MCP.

Lectura pública: exclusivamente la revisión publicada, a través de una función o vista que devuelva el DTO de presentación. Ninguna política `anon` sobre borradores. Las políticas `qual = true` de las tablas legacy no se replican.

Los nombres de columnas se fijan en la migración de la etapa 1, con su `.sql` y su rollback en el ERP. Se verifica por MCP que las FK nuevas no creen relaciones ambiguas en PostgREST antes de aplicar.

### D2 — Distribución del contrato entre repositorios

El contrato del documento (`SiteDocumentV2`, registro de secciones, variantes, campos, capacidades) vive en el ERP en `packages/site-contract/` como paquete TypeScript puro: sin React, sin Next, sin cliente de Supabase. Se publica como tarball versionado (`npm pack`) que `goadmin-websites` instala con versión exacta y checksum en su `package.json`. Cada repositorio declara la versión mínima y máxima que entiende; el ERP bloquea la publicación de un documento que use una capacidad que el renderer desplegado no declare.

El manifiesto de capacidades del sitio público se expone en una ruta registrable, `app/api/site-capabilities/route.ts`. La ruta actual bajo `_sections` no entra en el enrutador de Next.js y no se usa como fuente.

### D3 — Menús

En V2 los menús viven **dentro del documento del sitio**: `menus[]`, cada uno con id estable, nombre y `items[]` tipados (`page`, `entity` con categoría/producto/espacio, `custom`, `anchor`, `site` para enlazar a otro sitio de la organización). Header y footer referencian menús por su id en el documento. Un outlet tiene menús propios; puede copiar los del sitio principal, nunca compartirlos por referencia mutable.

`website_menus`, `website_menu_items`, `show_in_header`, `show_in_footer`, `parent_page_id` y `linked_category_id` se leen una sola vez al adoptar V2 (importación a borrador) y quedan como legacy. No se crea una tabla de asignaciones de menú ni se añade `branch_id` a las tablas de menús.

### D4 — Adopción por sitio y fuente única de presentación

Un sitio adopta V2 mediante una acción explícita: importar su estado legacy a un borrador, revisarlo en el preview y publicar. Hasta ese momento el sitio público sigue sirviéndose desde legacy sin cambios. El sitio principal de una organización **no cambia** por el hecho de que sus outlets adopten V2. Un outlet nuevo nace en V2 y no escribe en `website_pages` ni `website_settings`.

Cada respuesta pública sale de una sola fuente: legacy o revisión V2. No se combinan.

### D5 — Niveles del catálogo

Se añaden dos niveles a [CATALOGO-COMPOSICIONES.md](CATALOGO-COMPOSICIONES.md):

- **T — Plantillas de página**: puntos de partida al crear una página (Inicio, Nosotros, Contacto, Carta, Reserva, Habitaciones, Detalle de habitación, Galería, Eventos, Listado de productos, Detalle de producto, Políticas, Carta QR, Landing, Servicios, Planes, FAQ, Journal, Sedes). Una plantilla de página = composición + secciones con contenido inicial reemplazable. «Crear desde cero» es la misma biblioteca sin preset.
- **P07 — Página con barra lateral**: listados con filtros, carta con índice fijo, documentación. Se apila en móvil.

Y una familia **V — Giros operativos existentes** (gimnasio, transporte, parqueadero) para que los 65 tipos actuales tengan destino. El mapeo completo está en [MAPEO-TIPOS-LEGACY.md](MAPEO-TIPOS-LEGACY.md).

### D6 — Herencia y tema

Se confirma el modelo de F01/F04: `{mode: inherit | value | clear}` por campo autorizado; tema por sitio con tokens; overrides por página y por sección; sin clonado de settings al crear un outlet. La revisión inicial de un sitio adoptado conserva sus valores actuales como explícitos; la herencia es una decisión posterior del editor.

### D7 — Qué pasa con el código multi-outlet F1–F6 que ya está en `main`

| Pieza | Decisión |
|---|---|
| `lib/outlet/resolver.ts`, `middleware.ts` (host, subdominio, prefijo) | **Se reutiliza** como base de F02-03; se corrige el catch-all para resolver todos los segmentos tras el prefijo |
| `lib/outlet/theme-merge.ts`, `getEffectiveSettings` | **Se retira** en sitios V2; la revisión publicada ya trae el tema efectivo. Se conserva para lectores legacy |
| `websiteSettingsService` copia de settings por outlet (`applyBranchFilter`, upsert) | **Se congela**: no se amplía; no se usa para crear outlets nuevos |
| Columnas `branch_id` en settings/pages/sections/categories y sus 6 triggers | **Se conservan** sin uso nuevo. `categories.branch_id` sigue siendo válido para el catálogo por sucursal |
| Índices únicos `COALESCE(branch_id, -1)` | Se conservan; no sustituyen a los UNIQUE legacy, que no se tocan |
| `OutletSelector`, `EditorHeader` indicador de outlet | **Se reutilizan** como selector de sitio de F02, ampliados a sitios en borrador |
| `BranchForm` identidad web, `webIdentityValidation.ts`, `branchService.setWebPublished` | **Se reutilizan** para identidad del outlet (F04) y publicación |
| `sectionsByBranchType.ts` | Pasa a ser recomendación por giro, no lista rígida (D5) |
| `getCartKey` con `branchId`, `/api/orders` con `branch_id` | **Se reutilizan** sin cambios |

### D8 — Evidencia en lugar de nota numérica

El ciclo `/loop` sigue con builder, tester y QA, pero una entrega se aprueba por tabla de evidencia, no por nota mínima 9,5:

| Evidencia | Qué prueba |
|---|---|
| Compila | `tsc` en ambos repos (con heap ampliado en el ERP) |
| Tests | `npx jest` verde en lo tocado; `guardrails` y `sectionContract` verdes |
| Captura | Comparación visual en 390 y 1440 px de al menos dos organizaciones reales, antes y después |
| Recorrido | Editar → preview → guardar → recargar → publicar → sitio público → restaurar |

Una fase sin las cuatro filas queda «en progreso», no «aprobada». Las notas históricas de agosto no se reinterpretan.

### D9 — Cierre de F00

F00 se cierra con dos riesgos declarados que las herramientas disponibles no pueden verificar: existencia y alcance del respaldo de Supabase (el MCP no expone backups) y correspondencia entre código local y despliegues (el conector de Vercel responde 403). Ambos los comprueba el dueño desde los paneles antes de la primera migración de la etapa 1. No bloquean el trabajo local de las etapas 1 y 2.

Pendientes de F00 que pasan a otras fases: captura de línea base visual → primera tarea de la etapa 1 (es la base de D8); verificación de tracking → fuera de V2.

### D10 — Trabajo fuera de V2, con dueño

| Tema | Acción | Cuándo |
|---|---|---|
| `POST /api/templates/apply` (websites): sin autenticación, borra las páginas de la organización del body, sin llamadores | Desactivar el POST (410) y dejar el GET de listado | Inmediato (hecho el 2026-09-21) |
| Políticas `anon` con `qual = true` en `website_pages`, `website_settings`, `website_page_sections` (7 páginas no publicadas legibles) | No se tocan hasta tener lectores V2; se corrigen en la etapa 1 junto con la función de lectura pública, con prueba de lectores | Etapa 1 |
| `sectionContract.test.ts` en rojo (fixture desincronizado) | Regenerar el fixture desde el renderer y volver a poner el test como compuerta | Etapa 1 (F01-06) |
| Enlaces que pierden el prefijo del outlet; `getWebsitePageByType` con `.single()` sin sucursal; `BrandingPagesTab` sin `branchId` | Se resuelven dentro de F02/F05, no como parches sueltos | Etapas 1–2 |
| `verify:tracking` | Reescribir para que use MCP o un cliente autorizado; fuera de este plan | Sin fecha |

### D11 — Recortes

No se continúan: H12A–C del header (iconos, orden de acciones, estilo del CTA), backend del newsletter, `mobile_breakpoint` y opciones similares que añaden columnas a `website_settings`. Si vuelven, lo hacen como campos del documento V2.

## Secuencia vigente

| Etapa | Fases | Entrega visible al dueño |
|---|---|---|
| 1. Fundación | F01 contrato · F02 + F03 (sitio, borrador, publicación) · línea base visual | Un outlet se crea en borrador, se importa un sitio legacy y se publica sin que cambie nada público |
| 2. Sitio propio | F04 identidad y tema · F05 header, footer, menús y rutas | Hotel y restaurante con logo, colores, tipografía, header, footer y menús distintos en todas sus páginas |
| 3. Piloto | Organización real: principal + un outlet de giro distinto, cuatro páginas cada uno, con las secciones que ya existen | Recorrido completo en producción con adopción explícita |
| 4. Biblioteca | F09 composiciones y secciones (incluye T y P07) · F06 multimedia en paralelo | Las secciones nuevas y las mejoras de las existentes; presets con recursos |
| 5. Giros | F10 hotel · F11 gastronomía · F12 comercio y servicios (incluye V) | Plantillas completas por tipo de negocio |
| 6. Editor | F07 preview vivo · F08 edición sobre el lienzo | Cambios sin recargar, selección desde el canvas, texto inline |
| Transversal | F13 validación por etapa, no al final | Cada etapa cierra con la tabla de D8 |

Cambios respecto al orden anterior: F09 ya no depende de F08; F07 y F08 se posponen porque mejoran la experiencia pero no condicionan la independencia de los sitios; el piloto se adelanta de la etapa 10 a la 3; F13 deja de ser una fase final y se ejecuta por etapa.

## Consecuencias

- Los documentos de fase se actualizan para citar este ADR en los puntos afectados; su contenido detallado sigue siendo válido.
- Los cuatro planes anteriores quedan marcados como antecedentes en su propio `PLAN.md`.
- `PROGRESS.md` registra esta ronda por anexión.
