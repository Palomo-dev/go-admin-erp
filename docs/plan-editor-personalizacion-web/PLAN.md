# PLAN — Personalización avanzada del Editor Web + Sitio Público

**Módulos implicados:** `app-organ` (branding/editor), `inventario` (categorías/productos), `pos`/`pms` (reservas de mesa), `finanzas` (facturación/AR), repositorio `goadmin-websites`
**Repositorios:**
- ERP (editor): `C:\Users\USUARIO\CascadeProjects\go-admin-erp`
- Sitio público (consumidor): `C:\Users\USUARIO\goadmin-websites`
- BD compartida: Supabase `jgmgphmzusbluqhuqihj`

**Principio rector:** no romper lo que ya funciona. Todo campo nuevo es **opcional con default = comportamiento actual**. `content` y `settings` son `jsonb`, así que casi nada requiere migración.

---

## Índice de documentos

| Documento | Fases | Contenido |
|---|---|---|
| Este archivo | — | Análisis del estado actual, decisiones de arquitectura, orden y riesgos |
| [`FASE-0-FUNDACIONES.md`](./FASE-0-FUNDACIONES.md) | F0, F1, F2 | Schema extendido, controles nuevos, hotfix responsive, contrato de estilo y reparación de las 37 secciones |
| [`FASE-3-7-SECCIONES.md`](./FASE-3-7-SECCIONES.md) | F3–F7 | Hero, categorías, cards/badges, testimonios, banners promocionales |
| [`FASE-8-RESERVAS-MESA.md`](./FASE-8-RESERVAS-MESA.md) | F8 | Reserva de mesa de restaurante: hacerla funcional y personalizable |
| [`FASE-9-10-PAGINAS-Y-REVIEWS.md`](./FASE-9-10-PAGINAS-Y-REVIEWS.md) | F9, F10 | Páginas de detalle/flujo editables y sistema dual de reseñas (generadas + reales) |
| [`FASE-11-COMERCIO.md`](./FASE-11-COMERCIO.md) | F11 | Stock atómico, liberación de reservas, factura, AR, contabilidad, reembolsos |
| [`FASE-12-EDITOR-PRO.md`](./FASE-12-EDITOR-PRO.md) | F12 | Preview vivo, borradores/versionado, undo/redo, accesibilidad, SEO |

Estado de ejecución: [`PROGRESS.md`](../../PROGRESS.md) en la raíz del repo.

---

## PARTE A — ANÁLISIS DEL ESTADO ACTUAL

### A.1 Cómo funciona hoy

```
ERP (editor)                          Supabase                    goadmin-websites (público)
─────────────────────────────         ───────────────────         ──────────────────────────────
websitePageBuilderService.ts          website_pages               app/[[...slug]]/page.tsx
  SECTION_CATALOG (24 tipos)   ──►    website_page_sections  ──►    prefetch de data (categories,
  ContentFieldDef[]                     · section_type               products, offerProducts…)
       │                                · section_variant                  │
       ▼ genera formulario              · content  (jsonb)                 ▼
EditorSidebar.tsx (1565 líneas)         · settings (jsonb)          SectionRenderer.tsx
  · render declarativo                  · sort_order                  SECTION_MAP[type][variant]
  · + 7 editores AD-HOC                 · is_visible                   (37 tipos)
    hardcodeados por tipo                                                   │
       │                              website_settings (125 cols)           ▼
       ▼                                                             SectionWrapper
EditorPreview.tsx                                                    <div class="container mx-auto">
  <iframe src={urlRealDelSitio}>  ◄────── recarga completa ────────    <Componente content settings/>
                                          (key={refreshKey})
```

**Lo bueno (hay que apoyarse en esto, no reescribirlo):**
- El editor **es declarativo**: agregar un campo = agregar una entrada a `contentFields`. El formulario se genera solo (`EditorSidebar.tsx:416-541`).
- `SECTION_MAP` centralizado en `components/sections/SectionRenderer.tsx:132-342`.
- `ImagePickerDialog` ya tiene subida, galería, búsqueda y **generación con IA** sobre bucket `organization_images` + tabla `shared_images`.
- La tabla `categories` **ya tiene** `icon`, `color`, `image_url`, `parent_id`, `metadata`, `description`.
- `CategoriesGrid.tsx` (461 líneas) ya implementa `desktop_layout`, `desktop_columns`, `desktop_rows`, carrusel, búsqueda y paginación. Es el más maduro y sirve de referencia.
- **`restaurant_reservations` y `restaurant_tables` ya existen y están completas** en la BD (el ERP ya gestiona reservas de mesa).
- El flujo de venta web → ERP **sí existe y es correcto** en el camino feliz (`webOrderServerConfirmation.ts`).
- Ya hay 7 editores de items funcionando (galería, testimonios, FAQ, marcas, slides del hero, selector de categorías, opciones de categorías) y un `SectionSpacingEditor` global.

### A.2 Problemas de fondo (causa raíz, con evidencia)

| # | Problema | Causa raíz | Evidencia |
|---|---|---|---|
| **P1** | El hero no ocupa toda la pantalla y en tablet el sitio se ve corrido | `SectionWrapper` envuelve **toda** sección en `<div class="container mx-auto">`. En Tailwind v3 `container` es **ancho fijo por breakpoint** (768px en `md`). Para simular full-bleed, `HeroFullscreen` usa el hack `-mx-4 sm:-mx-6 lg:-mx-8 -mt-16 md:-mt-24`: margen negativo **constante** (16–32px) contra un margen de container **variable** (a 887px de ancho sobran ~59px por lado). Nunca coinciden → desalineación + scroll horizontal. | `SectionWrapper.tsx:84`; `HeroFullscreen.tsx`; `tailwind.config.ts` sin `container.center/padding/screens` |
| **P2** | **15 tipos de sección se renderizan en producción pero no existen en el editor** | El catálogo (24 tipos) vive solo en el ERP; el `SECTION_MAP` (37 tipos) solo en el sitio. Nadie valida que coincidan. Huérfanos: `reservation_cta`, `specialties`, `chef_section`, `delivery_cta`, `partners`, `why_choose_us`, `features_grid`, `how_it_works`, `services_list`, `pricing_table`, `demo_cta`, `parking_zones`, `parking_pricing`, `parking_features`, `parking_availability`, `parking_pass_plans`. **No se pueden agregar ni editar.** | `websitePageBuilderService.ts:83-483` vs `SectionRenderer.tsx:132-342` vs `select distinct section_type from website_page_sections` |
| **P3** | Variantes declaradas que el editor no deja elegir | El catálogo omite variantes que el sitio sí renderiza: `hero:video`, `categories_grid:{default,horizontal,icons}`, `contact_form:split`, `gallery:masonry`, `faq:two_columns`, `testimonials:{grid,quotes,minimal}`, `cta:{split,with_image}`, `newsletter:{banner,with_image}`. | mismo par de archivos |
| **P4** | **La galería no funciona: el editor y el sitio usan claves distintas** | `GalleryItemsEditor` guarda en **`content.items`** (`EditorSidebar.tsx:560-567`), pero los 4 componentes de galería leen **`content.images`** (`GalleryGrid.tsx:10`, `GalleryCarousel.tsx:12`, `GalleryFullscreen.tsx:12`, `GalleryMasonry.tsx:11`). Además `GalleryMasonry` usa `organization.website_settings.gallery_images` (global). Misma clase de bug: el editor guarda testimonios con `company`, `TestimonialsGrid` lee `item.role`. | comparación directa de archivos |
| **P5** | El catálogo está a medio construir | Mediana de **2 campos** por sección; **10 de 24 tipos exponen solo `title`**. Ver matriz A.3. Parcheado a mano con 7 editores ad-hoc dentro de `EditorSidebar.tsx` → inconsistente y no escala. | conteo sobre `SECTION_CATALOG` |
| **P6** | No se puede cambiar fondo, borde, radio ni sombra en casi ninguna sección | `SectionSpacingEditor` (`EditorSidebar.tsx:666`) **sí** expone padding y margen en todas. Pero `settings.bg_color` y `settings.text_color`, que `SectionWrapper` **ya lee** (`SectionWrapper.tsx:72-80`), **no se exponen en ninguna parte** → campos muertos. Borde, radio y sombra solo existen en `hero`. | `SectionWrapper.tsx:44-84` vs catálogo (grep `bg_color` = 0) |
| **P7** | Cada sección reinventa sus estilos | No hay contrato de estilo. `border`, `shadow`, `rounded-xl`, badges y botones están hardcodeados dentro de cada card. Hay **4 implementaciones distintas** de card de producto. | `CategoryPageClient.tsx:351-533`, `RelatedProducts.tsx:118-183`, `CategoriesGrid.tsx:56-91`, `FavoriteProductCard.tsx` |
| **P8** | Datos no editables en secciones clave | Promo banners viven hardcodeados en `content` y el editor solo expone `title`. Los reviews de producto se generan en el cliente con `seededRandom` (**decisión del negocio: se mantienen tal cual**, ver E.1). | `retail/PromoBannersGrid.tsx`, `components/site/ProductReviews.tsx:9-100` |
| **P9** | **La reserva de mesa es un formulario decorativo** | `ReservationCtaForm.tsx` (64 líneas) pinta fecha/hora/personas pero **no tiene `onSubmit`, no llama a ninguna API y no valida disponibilidad**: solo redirige. Mientras tanto, `restaurant_reservations` y `restaurant_tables` existen completas en la BD y `/api/reservations` ya acepta `{date, time, guests}` sin que nadie lo use. | `restaurant/ReservationCtaForm.tsx:1-64`; `app/api/reservations/route.ts` |
| **P10** | Las páginas de detalle no son editables | Las 480 filas de `website_pages` son todas `page_type='builtin'` sobre 23 slugs de **listado**. No existe plantilla para detalle de producto, detalle de categoría, carrito, checkout, confirmación, espacio/reserva ni mi-cuenta: son JSX hardcodeado y no aparecen en el selector del editor. | `select page_type, slug from website_pages`; `app/productos/[id]`, `app/checkout`, `app/carrito` |
| **P11** | El preview no es "en vivo" | Cambiar un campo no actualiza nada hasta guardar; al guardar se recarga el iframe entero (`key={refreshKey}`). No hay `postMessage` ni selección de sección desde el canvas. | `EditorPreview.tsx:103-117`, `editor/[pageId]/page.tsx:65,456` |
| **P12** | Se edita directo sobre producción | No hay borrador/publicación por página ni versionado. | `website_pages` sin columnas de draft |

### A.3 Matriz de auditoría: qué expone realmente el editor por sección

Conteo de `contentFields` en `SECTION_CATALOG` + editores ad-hoc existentes.

| Sección | Campos declarativos | Editor ad-hoc | Estado |
|---|---|---|---|
| `hero` | 13 | slides (solo variante slider) | Mejor cubierta; falta botones múltiples, flechas, intervalo, altura |
| `categories_grid` | 9 | selector de categorías + búsqueda/paginación | Buena; falta icono/color y carrusel en todas las variantes |
| `brands` | 5 | items de marcas | Funciona; falta estilo |
| `cta`, `image_text`, `countdown` | 5 | — | Aceptable; falta estilo |
| `gallery` | 1 | items **rotos** (clave `items` vs `images`) | **No funciona** |
| `testimonials` | 1 | items (parcial: `company` vs `role`) | Parcialmente roto |
| `faq` | 1 | items | Funciona |
| `newsletter` | 2 | — | Variantes `banner`/`with_image` sin sus campos (`image_url`, `button_text`, `disclaimer` existen en el componente y no se exponen) |
| `room_types`, `amenities`, `contact_form`, `text_block`, `products_grid`, `booking_cta`, `offers` | 2 | — | Solo textos |
| `map`, `stats`, `team`, `menu_preview`, `featured_products`, `promo_banners`, `membership_plans` | **1** | — | Solo el título |
| `reservation_cta`, `specialties`, `chef_section`, `delivery_cta`, `partners`, `why_choose_us`, `features_grid`, `how_it_works`, `services_list`, `pricing_table`, `demo_cta`, `parking_*` (6) | **0 — no existen en el editor** | — | **Invisibles: se renderizan pero no se pueden tocar** |

**Conclusión:** el problema no es que falten opciones en 3 secciones. Es que el catálogo cubre 24 de 37 tipos, con mediana de 2 campos, parcheado con 7 editores a mano, y con al menos 2 bugs de contrato de claves. La F2 debe cerrar esa brecha de forma **sistemática**, no sección por sección a demanda.

### A.4 Respuesta directa: ¿qué pasa cuando alguien compra en la web?

**Camino feliz (funciona):**

1. `POST /api/orders` valida stock (`qty_on_hand - qty_reserved`), crea `web_orders` (`pending`) + `web_order_items` y **reserva stock** subiendo `stock_levels.qty_reserved`. No toca `qty_on_hand`.
2. `POST /api/checkout/init` genera la URL de la pasarela (Wompi, MercadoPago, PayU, Stripe, PayPal). No toca BD.
3. Webhook de pago aprobado → `web_orders.payment_status='paid'`, `status='confirmed'`, inserta en `payments`, y llama `notifyErpAutoConfirm(orderId)`.
4. ERP `webOrderServerConfirmation.confirmOrder()` hace el ciclo correcto:
   `sales` + `sale_items` → RPC `decrement_stock_with_recipe` (descuenta real, genera `stock_movements`, con explosión de receta) → **libera** `qty_reserved` → `invoice_sales` + `invoice_items` con numeración → `payments` vinculado a la factura → **`accounts_receivable`** (si hay `customer_id`) → `shipments` si es domicilio → escribe `web_orders.sale_id` (idempotencia).

**Sí: al pagar descuenta inventario, crea factura y crea cuenta por cobrar.** Los 6 huecos están detallados en [`FASE-11-COMERCIO.md`](./FASE-11-COMERCIO.md). Resumen:

| Severidad | Hueco |
|---|---|
| 🔴 | Reserva de stock **no atómica** (read-then-write sin transacción) → overselling |
| 🔴 | Pago fallido **no libera** `qty_reserved` |
| 🔴 | **No hay cron de expiración** de pedidos pendientes |
| 🟠 | **No se genera asiento contable** de la venta web |
| 🟠 | Reembolsos: no hay nota crédito ni devolución de stock |
| 🟡 | Sin `customer_id` no se crea AR ni cliente |

---

## PARTE B — DECISIONES DE ARQUITECTURA

Cuatro decisiones sostienen todo el plan. Están desarrolladas en [`FASE-0-FUNDACIONES.md`](./FASE-0-FUNDACIONES.md).

**B.1 Contrato de estilo compartido (`content.style`)** — en lugar de agregar `border_radius`, `shadow` y `bg` sección por sección, se define **un sub-objeto `style` idéntico para todas**, interpretado **una sola vez** en `SectionWrapper` y generado **una sola vez** por un grupo de campos reutilizable. Un cambio, 37 tipos beneficiados.

**B.2 Grupos de campos reutilizables + condicionales.** `contentFields` hoy es una lista plana; con 20+ opciones el sidebar se vuelve inusable. Se necesita `group` (acordeones), `showIf` (ocultar lo que no aplica a la variante — la causa de que promo banners "no se entienda"), `repeater` (arrays: slides, botones, banners), `entity` (selector conectado a BD), `icon` (icon picker real) y `responsive` (valor por breakpoint). Los 7 editores ad-hoc actuales se migran a `repeater` y desaparecen del `EditorSidebar`.

**B.3 Contrato verificado editor ↔ sitio.** El bug de la galería (P4) y los 15 tipos huérfanos (P2) demuestran que la sincronización manual ya falló. Solución de bajo costo: `GET /api/_sections/manifest` en el sitio que expone el `SECTION_MAP` y las claves de `content` que cada componente lee; en el ERP, un test de CI y un aviso en el editor que compara ambos catálogos en los dos sentidos.

**B.4 Preview vivo por `postMessage`.** Editor → iframe en cada cambio (debounce 150 ms), sin recargar; iframe → editor al hacer clic en una sección, para seleccionarla en el sidebar. Es lo que hace que se sienta sincronizado.

### B.5 Recomendaciones adicionales (no estaban en la lista original)

| Prioridad | Recomendación | Por qué |
|---|---|---|
| 🔴 | **Reserva de stock atómica vía RPC** con `FOR UPDATE` | Evita overselling real. |
| 🟠 | **Borrador / publicar / versionado** por página + "Restaurar versión" | Hoy cada guardado va a producción sin red de seguridad. |
| 🟠 | **Contraste accesible automático** (WCAG AA) sobre el color primario | En tu captura, el header amarillo con contenido claro es exactamente este problema: `primaryColor` se usa como fondo y como texto indistintamente. |
| 🟠 | **LCP del hero**: `next/image` con `priority` y `sizes` en vez de `<picture>` con `<img>` crudo | El hero es la primera imagen y la más pesada; hoy penaliza Core Web Vitals y SEO. |
| 🟠 | **JSON-LD** `Product`, `Offer`, `AggregateRating`, `BreadcrumbList`, `LocalBusiness`, `Restaurant` + `sitemap.xml` por organización | Sin esto las tiendas no salen en rich results ni en Google Shopping. |
| 🟡 | **Duplicar sección, copiar/pegar estilo, undo/redo** | Separa un editor usable de uno profesional. Barato con el patrón `pendingSectionUpdates` que ya existe. |
| 🟡 | **Guardar sección como plantilla** + presets por industria | Ya existe `lib/templates/presets.ts`; extenderlo a nivel de sección. |
| 🟡 | **Autosave + bloqueo optimista** (`updated_at` como etag) | Dos usuarios editando la misma página hoy se pisan sin aviso. |
| 🟡 | **Estados vacíos por sección** | Hoy varias secciones desaparecen o muestran un grid roto si no hay datos. |

### B.6 Sobre "banners promocionales" (tu duda concreta)

Hoy `PromoBannersGrid` **no tiene relación con productos ni categorías**: son 2 tarjetas de `content.banners[]` escritas a mano, con `title`, `subtitle`, `image_url`, `cta_text`, `cta_url`, `bg_color`, en un grid fijo de 2 columnas. Por eso no se entiende: es decorativo y el enlace lo escribes tú. La F7 lo convierte en un banner con **destino tipado** (`link_type: category | product | collection | url | page`) con selector real de categorías, `href` autogenerado y autocompletado de imagen/título desde la entidad.

---

## PARTE C — ORDEN DE EJECUCIÓN

```
F1 Responsive (hotfix, independiente)
        │
F0 Fundaciones ──► F2 Contrato de estilo + reparación de las 37 secciones ──┬─► F3 Hero
                                                                            ├─► F4 Categorías
                                                                            ├─► F5 Cards ──► F10 Reviews
                                                                            ├─► F6 Testimonios
                                                                            ├─► F7 Promo banners
                                                                            ├─► F8 Reservas de mesa
                                                                            ├─► F9 Páginas de detalle
                                                                            └─► F12 Editor pro

F11 Comercio (independiente, en paralelo desde el día 1)
```

| Fase | Nombre | Depende de | Impacto |
|---|---|---|---|
| **F1** | Responsive y full-bleed real (hotfix) | — | 🔴 Bug visible en producción |
| **F0** | Fundaciones del schema y controles | — | Habilitador de todo |
| **F2** | Contrato de estilo + reparación de las 37 secciones | F0 | 🔴 El de mayor relación esfuerzo/impacto |
| **F3** | Hero pro | F0, F1, F2 | Alto |
| **F4** | Categorías | F0, F2 | Alto |
| **F5** | Cards de producto y badges | F0, F2 | Alto |
| **F6** | Testimonios | F0, F2 | Medio |
| **F7** | Banners promocionales | F0, F2 | Medio |
| **F8** | Reservas de mesa | F0, F2 | 🔴 Hoy no funciona |
| **F9** | Páginas de detalle y flujo | F0, F2 | Alto |
| **F10** | Sistema dual de reseñas (generadas + reales, seleccionable) — **opcional / aplazada** | F5 | Opcional (ver E.1). Aditiva: no elimina las generadas actuales |
| **F11** | Comercio (stock/factura/AR) | — | 🔴 Riesgo operativo |
| **F12** | Editor profesional | F0 | Medio |

**Arranque recomendado:** F1 (hotfix corto) → F0 → F2, y **en paralelo** los 3 puntos críticos de F11. Sin la F2, las fases F3–F9 mejoran secciones sueltas mientras 15 tipos siguen invisibles y la galería sigue rota.

---

## PARTE D — CAMBIOS EN BD (resumen)

Todo lo demás es `jsonb`, sin migración.

| Tabla / objeto | Acción | Fase |
|---|---|---|
| `testimonials` | Crear + RLS | F6 |
| `promo_banners` | Crear + RLS | F7 |
| `restaurant_booking_settings` (o columnas en `website_settings`) | Crear | F8 |
| `restaurant_reservations` | **Ya existe** — solo usarla desde la web | F8 |
| `restaurant_tables` | **Ya existe** — solo usarla desde la web | F8 |
| `website_pages` | Nuevos `page_type`: `product_detail`, `category_detail`, `cart`, `checkout`, `order_confirmation`, `space_detail`, `account`; + `draft_content`, `published_at` | F9, F12 |
| `website_page_versions` | Crear | F12 |
| `product_reviews` | **Opcional** — solo si se decide activar reseñas reales; convive con el sistema actual | F10 |
| `reserve_stock_for_web_order` | Crear función RPC | F11 |
| `web_orders.status` | Admitir `'expired'` | F11 |
| `categories` | **Sin cambios** (`icon`, `color`, `image_url` ya existen) | F4 |

---

## PARTE E — PRINCIPIO DE NO REGRESIÓN, CRITERIOS Y RIESGOS

### E.0 Principio de no regresión (regla nº 1 del proyecto)

> **Lo que hoy funciona, se queda funcionando exactamente igual.** Todo lo nuevo es aditivo y opcional.

Reglas concretas que toda fase debe cumplir:

1. **Defaults = comportamiento actual.** Ningún campo nuevo cambia el aspecto de un sitio existente hasta que alguien lo modifique a propósito.
2. **Nada se elimina, se complementa.** Los componentes actuales se conservan; cuando se crea uno nuevo, el viejo queda registrado y funcional (`reservation_cta` sigue existiendo aunque llegue `restaurant_booking`; `cta_text`/`cta_url` siguen funcionando aunque llegue `buttons[]`).
3. **Refactor sin cambio visual.** Unificar componentes duplicados (cards, categorías) se hace conservando wrappers y defaults idénticos. Si hay duda entre unificar y duplicar, se duplica.
4. **Migraciones de datos no destructivas.** Cuando haya que renombrar una clave en `content`, se **escribe la nueva sin borrar la vieja**. Nunca un `content - 'clave'`.
5. **Fallback siempre.** Toda plantilla nueva (páginas de detalle) cae al layout hardcodeado actual si no existe configuración.
6. **Verificación obligatoria por fase:** capturas antes/después de 5 organizaciones reales de verticales distintas (retail, hotel, restaurante, parking, gym). Si hay una sola diferencia no intencionada, la fase no se aprueba.

### E.1 Decisiones de negocio registradas

| Decisión | Fecha | Implicación en el plan |
|---|---|---|
| **Sistema dual de reseñas.** Los reviews generados actuales **se mantienen tal cual** (no se eliminan ni se reemplazan) y se **añaden** reviews reales como segunda fuente. Cada organización elige desde el editor cuál usar: `generated` (default, = comportamiento actual), `real`, `mixed` o `auto`. | 2026-08-26 | La F10 es **aditiva y opcional**: conviven ambos proveedores bajo un orquestador común; `ProductReviews.tsx` se extrae sin reescribir su lógica. Default = `generated` ⇒ cero cambio visual en los 480 sitios existentes. Queda al final de la cola y no bloquea nada. Riesgo residual mitigado: `AggregateRating` en JSON-LD **solo** se emite cuando la fuente activa es real (regla 10.7 de la F10). |

### E.2 Criterios de aceptación que aplican a TODA fase
- Ningún sitio existente cambia de aspecto sin que el usuario toque un campo (defaults = comportamiento actual).
- `npm run lint` + `next build` limpios en ambos repos.
- Todo campo nuevo del editor tiene su lectura verificada en el sitio contra el manifiesto de contrato (B.3).
- Verificado en 375 / 834 / 1024 / 1440 px, sin scroll horizontal.
- Probado en al menos 2 organizaciones reales de verticales distintas.

| Riesgo | Mitigación |
|---|---|
| Romper sitios en producción al tocar `SectionWrapper` | Flags con default = comportamiento actual; capturas antes/después de 5 organizaciones (retail, hotel, restaurante, parking, gym). |
| El sidebar se vuelve inmanejable con 40 campos | Acordeones por `group` + `showIf` obligatorio desde la F0. |
| Nueva divergencia editor ↔ sitio | Manifiesto + verificación en CI desde la F0; el bug de la galería es la prueba de que sin esto vuelve a pasar. |
| `EditorSidebar.tsx` (1565 líneas) inmantenible | Extraer controles a `editor/fields/` como primera tarea de la F0. |
| Migración de testimonios/banners de JSON a tabla | `data_source='manual'` sigue funcionando; migración opt-in con botón "Importar a base de datos". |
| Tocar el flujo de pago/reserva | En carrito, checkout y reserva solo se personaliza estilo, textos y orden de bloques. La lógica transaccional no se toca. |

---

*Documento vivo. Última actualización del análisis: 2026-08-26.*
