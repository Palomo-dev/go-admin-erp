# Mapeo de los 65 tipos de sección actuales al catálogo V2

Fecha: 2026-09-21. Fuente: `RAW_CATALOG` en `src/lib/services/websitePageBuilderService.ts` (65 tipos) y `SECTION_MAP` del renderer de websites. Decisión que lo exige: [ADR-002 D5](ADR-002-DECISIONES-Y-SECUENCIA.md). Regla de [F01-04](FASE-01-CONTRATO-Y-COMPATIBILIDAD.md): ningún tipo guardado deja de renderizarse; los aliases de variante (`categories_grid:grid|horizontal|icons`) se conservan.

«Destino» es el identificador del [catálogo](CATALOGO-COMPOSICIONES.md) que absorbe el tipo. «Acción» indica qué se hace con el componente en la etapa 4: **conservar** (se registra tal cual bajo el nuevo id, sin cambio visual), **ampliar** (mismo componente, gana variantes/controles/fuente declarada) o **fusionar** (varios tipos pasan a ser variantes o fuentes de una misma forma; los tipos viejos siguen leyéndose como alias).

## Universales (23)

| Tipo actual | Destino | Acción | Nota |
|---|---|---|---|
| `hero` | HR01–HR10 | ampliar | Las variantes actuales (`default`, `slider`, `video`, `fullscreen`, `split`…) se mapean a HR01/HR02/HR03/HR07; las demás formas son nuevas |
| `cta` | C16 | ampliar | Destino tipado del botón (página, entidad, reserva, externo) |
| `image_text` | C01 | ampliar | Alternancia y doble imagen |
| `text_block` | C02 | conservar | |
| `gallery` | G01–G05 | ampliar | Las cuatro variantes existentes ya cubren G01/G04/G05 y mosaico |
| `testimonials` | C10 | ampliar | Fuente: manual, tabla `testimonials`, reseñas reales (F10 del plan anterior) |
| `faq` | C09 | conservar | |
| `stats` | C07 | conservar | |
| `team` | C05 | conservar | |
| `brands`, `partners` | C08 | fusionar | Misma forma; `partners` queda como alias |
| `newsletter` | C12 | ampliar | Requiere destino real; sin backend no se publica como formulario |
| `contact_form` | C13 | ampliar | Destino validado en servidor |
| `map` | C14 | conservar | |
| `countdown` | E07 | ampliar | Solo con inicio/fin reales |
| `why_choose_us`, `features_grid` | C24 (nuevo: beneficios) | fusionar | Ver [catálogo](CATALOGO-COMPOSICIONES.md#c--contenido-confianza-y-conversión-f09-operación-f10f12) |
| `how_it_works` | C04 | conservar | |
| `services_list` | C23 | ampliar | |
| `pricing_table`, `membership_plans` | C20 | fusionar | `membership_plans` conserva su fuente de entidad (planes del gimnasio) |
| `integrations` | C21 | conservar | |
| `demo_cta` | C16 | fusionar | Variante de CTA con formulario |

## Hotel (3)

| Tipo actual | Destino | Acción |
|---|---|---|
| `room_types` | A01 | ampliar (tarjetas, filas editoriales, carrusel, destacado) |
| `amenities` | A03 | ampliar |
| `booking_cta` | A08 + HR08 | ampliar: la variante deja de ignorarse (`content.show_form` pasa a ser variante real) y el buscador se conecta al PMS |

## Gastronomía (5)

| Tipo actual | Destino | Acción |
|---|---|---|
| `menu_preview` | R01 / R02 / R03 | ampliar: tres comportamientos reales (lista, anclas, pestañas) en vez de un componente con nombre de pestañas |
| `specialties` | R04 | ampliar |
| `chef_section` | R05 | conservar |
| `reservation_cta` | R06 | ampliar: reutiliza el flujo funcional de F8 del plan anterior; solicitud ≠ confirmación |
| `delivery_cta` | R07 | conservar |

## Comercio (6 + 9 de detalle de producto + 5 de listado de categoría)

| Tipo actual | Destino | Acción |
|---|---|---|
| `products_grid`, `featured_products` | E01 | fusionar: misma forma, fuentes distintas (todos / destacados / colección) |
| `categories_grid` (+ aliases `grid`, `horizontal`, `icons`) | E02 | ampliar; los tres aliases se conservan como variantes legibles |
| `offers` | E06 / E07 | ampliar: fuente = productos con descuento vigente |
| `promo_banners` | E06 | ampliar: destino tipado ya implementado en F7 del plan anterior |
| `product_reviews` | C10 | fusionar: fuente «reseñas de producto» |
| `product_gallery`, `product_info`, `product_actions`, `product_benefits`, `product_description`, `related_products`, `product_specs`, `product_faq`, `product_shipping` | E05 (bloques de la plantilla T11) | conservar: son bloques del detalle de producto; `product_benefits` puede ser C24 con fuente de producto |
| `category_header`, `category_filters`, `category_products`, `category_subcategories`, `category_seo_text` | E13 (nuevo: listado de categoría; composición P07 con barra lateral) | conservar como bloques de la plantilla T10 |

## Gimnasio (4) — familia V

| Tipo actual | Destino | Acción |
|---|---|---|
| `class_schedule` | C17 con fuente «horario de clases» | fusionar |
| `gym_features` | C24 | fusionar |
| `trainers` | C05 con fuente «entrenadores» | fusionar |
| `transformation` | V06 (antes/después) | conservar |

## Transporte (5) — familia V

| Tipo actual | Destino | Acción |
|---|---|---|
| `trip_search`, `booking_transport` | V01 búsqueda y reserva de viaje | fusionar; la acción real sigue en su servicio |
| `routes` | V02 rutas | conservar |
| `fleet_showcase` | V03 flota (forma G07/E01) | conservar |
| `coverage_map` | C14 con fuente «cobertura» | fusionar |

## Parqueadero (5) — familia V

| Tipo actual | Destino | Acción |
|---|---|---|
| `parking_zones` | V04 zonas | conservar |
| `parking_availability` | V05 disponibilidad operativa | conservar; datos vivos, nunca en el snapshot |
| `parking_pricing`, `parking_pass_plans` | C20 con fuente «tarifas / planes de parqueo» | fusionar |
| `parking_features` | C24 | fusionar |

## Resumen

| Acción | Tipos |
|---|---|
| Conservar | 28 |
| Ampliar | 18 |
| Fusionar (pasan a variante o fuente de otra forma; el nombre viejo sigue leyéndose) | 19 |
| Sin destino | 0 |

Identificadores nuevos que este mapeo obliga a añadir al catálogo: **C24** (beneficios/características), **E13** (listado de categoría), **V01–V06** (giros operativos), **P07** (página con barra lateral) y la familia **T** (plantillas de página). Ninguno crea una tabla.

## Verificación al implementar (etapa 4)

- Cada fila de «fusionar» tiene un adaptador de lectura que convierte el `content` viejo al nuevo sin escribir en la fila original.
- El fixture de `sectionContract.test.ts` se regenera desde el renderer e incluye los 65 tipos y los 3 aliases.
- Una página guardada con cualquiera de los 57 pares tipo/variante observados en la base se abre en el editor V2 y se renderiza igual que en legacy (captura antes/después).
