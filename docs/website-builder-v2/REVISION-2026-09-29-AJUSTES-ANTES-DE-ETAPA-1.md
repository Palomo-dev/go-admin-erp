# Revisión 2026-09-29 — Ajustes al plan V2 antes de la etapa 1

Estado: **propuesta para incorporar a [ADR-002](ADR-002-DECISIONES-Y-SECUENCIA.md)**. No sustituye a ADR-001 ni a ADR-002; los complementa con cuatro ajustes bloqueantes y dos menores.

Autor: sesión que mantiene el sitio público (`goadmin-websites`: catálogo, checkout, promociones, tracking). La revisión mira el plan desde el renderer y los datos que el sitio público ya sirve en producción, no desde el editor.

## 1. Veredicto

La dirección del plan es correcta y no se reabre:

- Un sitio es un documento con borrador y revisión publicada separados; cada outlet es otro sitio (ADR-002 D1, D4).
- Menús dentro del documento, sin una tercera tabla de menús (D3).
- Piloto real hotel + restaurante en la etapa 3 (secuencia vigente).
- Aprobación por evidencia (compila, tests, captura, recorrido) y no por nota (D8).
- Recortes de opciones que solo añaden columnas a `website_settings` (D11).

Se aprueba **con los cuatro ajustes de la sección 2**, que deben cerrarse antes de escribir la primera migración de la etapa 1.

## 2. Ajustes bloqueantes

### A1 — Destino de la mitad operativa de `website_settings`

**Problema.** ADR-001 punto 6 deja la operación fuera del documento y ADR-002 D4 dice que un outlet nuevo «no escribe en `website_settings`». Pero esa tabla (146 columnas) no es solo presentación: al menos ~35 columnas son operativas o de integraciones, y el sitio público las lee hoy en el checkout y el layout.

| Grupo | Columnas (ejemplos reales, consultados por MCP el 2026-09-29) |
|---|---|
| Envío y entrega | `enable_shipping`, `shipping_flat_rate`, `free_shipping_threshold`, `shipping_flat_rate_title`, `shipping_flat_rate_description`, `available_delivery_types`, `enable_online_ordering` |
| Impuestos y moneda | `tax_included`, `tax_name`, `tax_rate`, `currency_position`, `currency_icon`, `show_currency_code` |
| Checkout | `checkout_mode`, `checkout_show_trust_badges`, `checkout_trust_badges`, `checkout_show_stock_warning`, `checkout_stock_warning_threshold`, `checkout_show_payment_logos`, `checkout_show_countdown`, `show_buy_now_button` |
| Integraciones | `custom_scripts` (aquí vive el Meta Pixel de varias tiendas), `analytics_id`, `chat_widget_enabled`, `chat_widget_public_key` |
| Urgencia comercial | `countdown_*` (10 columnas), `cart_button_mode`, `cart_button_texts` |

`custom_scripts` no aparece en ningún documento de `website-builder-v2`. Sin una decisión, el restaurante de un hotel no tiene de dónde sacar su envío, su pixel ni su analytics.

**Decisión propuesta (D12).** Antes de la migración de la etapa 1, producir `MAPEO-COLUMNAS-SETTINGS.md` que clasifique las 146 columnas en:

1. **Presentación** → campo del documento V2 (con su ruta en `SiteDocumentV2`).
2. **Operación por sitio** → se queda fuera del documento, pero con alcance por sitio (tabla nueva `website_site_operations` o columnas en `website_site_states`; se decide con el mapeo delante).
3. **Sin uso** → no se importa.

El importador legacy → borrador y el renderer V2 citan ese mapeo. Un sitio V2 nunca lee `website_settings` para operación sin pasar por esa capa.

### A2 — Capa de datos de las secciones en las etapas 1–2, no en la 4

**Problema.** Las secciones de catálogo del sitio público traen hasta 500 productos con sus embeds y ordenan en memoria. Evidencia reciente:

- 2026-09-14: una ráfaga de visitas a la portada de una tienda con 4.368 productos reinició Postgres (ver `lib/supabase/cache.ts` en websites).
- 2026-09-23: «Más vendidos» dejó fuera al producto más vendido de org 145 (152 ventas; nº 4.330 por antigüedad) porque la ventana de 500 candidatos se elegía por fecha. Se corrigió en websites `372d2e7` metiendo primero a los que tienen ventas, pero sigue siendo un parche en JS sobre una ventana fija.

F09-06 ya lo reconoce («no precargar 500 productos»), pero lo deja para la etapa 4. V2 multiplica las secciones con fuente de datos (ofertas, más vendidos, categoría, colección).

**Decisión propuesta (D13).** En la etapa 1 se definen las **fuentes de datos declaradas** del contrato (`source: offers | best_sellers | category | collection | manual`, con `limit` y orden) y se implementan en base de datos:

- RPC o vista de ranking de ventas web por producto de listado (sumando variantes a su padre).
- Ofertas y listados paginados y ordenados en SQL, no en memoria.
- Caché por sitio con invalidación en `publish_site_revision` y en los cambios de catálogo (etiqueta `catalogo-<org>` que websites ya usa vía `/api/revalidate`).

Las secciones legacy migran a esas fuentes en cuanto existan; no esperan a V2.

### A3 — Fecha de retiro del renderer legacy

**Problema.** D4 permite adopción sitio por sitio sin fecha de retiro. Es el mismo patrón que la revisión del 2026-09-21 criticó en los cuatro planes anteriores («compatibilidad sin fecha de retiro»). Mientras convivan dos renderers, cada arreglo se hace dos veces. Solo en la semana del 2026-09-21 se hicieron en el renderer legacy: motor de promociones en carrito/checkout, «vendidos» por variantes, botón «Elegir» para padres y AddToCart centralizado del pixel.

**Decisión propuesta (D14).** Tras el piloto de la etapa 3:

1. Importación automática de todos los sitios a borrador V2, con comparación visual D8 (390 y 1440 px) contra legacy.
2. Publicación por lotes de los sitios que pasen la comparación; lista de excepciones con dueño.
3. **Fecha objetivo para borrar el renderer legacy**, fijada al cerrar la etapa 3. Desde esa fecha no se aceptan arreglos nuevos en legacy salvo seguridad.

### A4 — Distribución real del contrato en Vercel

**Problema.** D2 distribuye `packages/site-contract/` como tarball `npm pack` instalado por websites con checksum. Vercel compila `goadmin-websites` sin acceso al repo del ERP: un `.tgz` generado en el ERP no existe en ese build.

**Decisión propuesta (enmienda a D2).** Elegir una de las dos, antes de F01-02:

- **GitHub Packages** (registro privado de la organización): el ERP publica `@goadmin/site-contract@x.y.z`; websites fija la versión exacta. Requiere token de lectura en Vercel.
- **Copia generada dentro de websites** (`lib/site-contract/`, con archivo `VERSION` y hash): el ERP la genera; CI de ambos repos falla si el hash no coincide con la versión declarada.

Recomendación: la copia generada, porque no añade secretos ni dependencia de un registro al build de 83 sitios.

## 3. Ajustes menores

**M1 — Reutilizar, no reescribir, las secciones de catálogo.** [MAPEO-TIPOS-LEGACY.md](MAPEO-TIPOS-LEGACY.md) marca 19 tipos para «fusionar». El renderer V2 debe envolver los componentes actuales del sitio público (`ProductCard`, `OffersGrid`, `CartEventTracker`, `useCartPromotions`) en lugar de reimplementarlos. Si no, se pierden comportamientos corregidos en producción: «Elegir» en padres sin `variant_count` (`isParentProduct`), contadores de ventas por padre, `content_ids` = SKU en el pixel, promociones por línea.

**M2 — Adelantar el cierre de las políticas `anon` de `website_*`.** D10 lo deja para la etapa 1. En `goadmin-websites` no hay lector anónimo de `website_pages`, `website_settings` ni `website_page_sections`: el servidor usa service role (desde `b7fbdd4`, `createPublicClient()` exige `SUPABASE_SERVICE_ROLE_KEY`) y los componentes de navegador solo importan sus tipos. Si en el ERP tampoco hay lector anónimo, las políticas `qual = true` se pueden cerrar ya, con su `.sql` y rollback, sin esperar a los lectores V2.

## 4. Riesgo de ejecución

- 14 fases sobre un árbol compartido con 6+ sesiones. El 2026-09-23 varios commits quedaron fuera de `main` por una rama suelta. Regla del dueño vigente: **trabajar siempre sobre `main`**, `git add` por ruta, sin `stash` ni `reset --hard`.
- **Una sola sesión es dueña de V2.** Las demás le avisan antes de tocar `website_*`, el editor o el renderer.
- El piloto de la etapa 3 es la prueba de aceptación. Si se alarga, se recorta alcance; no se añade documentación.

## 5. Qué hacer con este documento

1. Incorporar D12, D13, D14 y la enmienda a D2 en ADR-002 (o en un ADR-003 si se prefiere no editar el vigente).
2. Crear `MAPEO-COLUMNAS-SETTINGS.md` (A1) como primera tarea de la etapa 1, antes de la migración D1.
3. Añadir a F01 la sección «fuentes de datos declaradas» (A2) y a F13 la fecha de retiro (A3).
4. Registrar esta ronda en `PROGRESS.md` por anexión.

## Referencias

- Revisión y decisiones previas: [ADR-001](ADR-001-ADICIONES-SIN-ALTERAR-LEGACY.md), [ADR-002](ADR-002-DECISIONES-Y-SECUENCIA.md), [PLAN-MAESTRO](PLAN-MAESTRO.md), [MAPEO-TIPOS-LEGACY](MAPEO-TIPOS-LEGACY.md), [FASE-09](FASE-09-COMPOSICIONES-UNIVERSALES.md) (F09-06).
- Commits de websites citados: `ba54bc2` (promociones), `c31d6a1` y `372d2e7` (vendidos por variantes y candidatos por ventas), `3fb097b` («Elegir»), `06f4c25` (tracking), `b7fbdd4` (cliente público sin fallback a anon).
