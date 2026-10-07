# Pendiente: interruptores del editor sin implementar en el sitio

Fecha: 2026-10-07 · Estado: **78 de 155 combinaciones implementadas en el sitio y visibles otra
vez en el inspector** (columna «Estado»). Quedan 41 pendientes, 12 sin fuente de datos y 24 que
no aplican.

## Contexto

El inspector del editor de sitio web (V2) guarda cada interruptor en `contenido[clave]`, y el sitio
(`goadmin-websites`) recibe ese objeto tal cual, en el lienzo y en el sitio publicado. Se cruzó
cada booleano del catálogo (`src/lib/services/websitePageBuilderService.ts`) con el componente de
cada variante (`components/sections/SectionRenderer.tsx` → `SECTION_MAP`). Resultado: 74
interruptores no tenían efecto en 155 combinaciones de sección y variante. El dueño los
apagaba o los encendía y no pasaba nada.

Mientras no se implementen, el inspector los oculta. El mapa está en
`src/lib/services/website/interruptoresSitio.ts` (`INTERRUPTORES_EN_SITIO`), y el test que lo fija
es `src/lib/services/website/__tests__/interruptoresOcultos.test.ts`.

- **Solo se ocultan.** Lo que ya esté guardado en el contenido no se borra ni se reescribe: los
  ítems de un repetidor conservan sus claves al editarse.
- **Prioridad:** alta si el control es visible y común (autoplay y flechas de carruseles, precio
  tachado, filtros de productos). «No aplica» cuando la variante no es un carrusel y el control no
  tiene sentido en ella: conviene dejarlo oculto para siempre.
- **Default que mostraba el ERP:** el estado en que se pintaba el switch con la clave ausente. Al
  implementar, «ausente» debe dejar el sitio como se ve hoy: hoy esos interruptores no hacen nada.
- **Estimación:** aproximada, en horas de una persona, sin contar revisión ni despliegue.

## Avance del 2026-10-07

Implementados en `goadmin-websites` (commits `feat(GO-sitio-web): carruseles, precio tachado y
filtros…` y `…lightbox de galerías, botones de portada y tarjeta…`) y probados en
`scripts/verify-interruptores.mjs` pintando los componentes reales (cada caso falla sin el
cambio). Con la clave ausente, cada componente pinta el mismo HTML que antes (comparado contra
`origin/main`), salvo nombres accesibles y foco visible en flechas y miniaturas.

- **Carruseles** (galería «Carrusel» y «Pantalla completa», aliados «Carrusel», marcas con
  distribución «Carrusel», carrusel de productos y de destacados): `autoplay`, `interval_ms`,
  `loop`, `pause_on_hover`, `show_arrows`, `show_dots`, `enable_swipe`. El avance automático
  es del cliente, no corre con `prefers-reduced-motion: reduce`, se pausa con la pestaña oculta,
  con el foco del teclado dentro y, si el interruptor lo pide, con el puntero encima.
  *Cambio deliberado:* el carrusel de aliados ya avanzaba solo (cada 3 s); ahora también
  respeta `prefers-reduced-motion` y se pausa con el foco y con la pestaña oculta.
- **Precio tachado** solo con el `compare_price` real de `product_prices` y si es mayor que el
  precio: destacados «Producto héroe», especialidades, planes de membresía (precio vigente del
  producto del plan) y el avance de la carta.
- **Filtros y buscador** sobre los productos ya cargados (ni una consulta por tecla): las cuatro
  variantes de productos, las tres de destacados y ofertas.
- **Lightbox** en las cuatro galerías, con el mismo diálogo de la galería bento.
- **Botones:** `buttons[].full_width` e `icon_only` de la portada; `card_buttons[].open_new_tab`
  y `full_width_mobile` de la tarjeta de producto.
- **Descripciones:** tarjetas de habitación, especialidades, pases de parqueadero e iconos de
  servicios.

Hallazgos que no se resolvieron aquí:
- `services_list` no recibe datos en el sitio público: `app/[[...slug]]/page.tsx` nunca carga
  `data.services`, así que la sección pinta «No hay servicios configurados aún». Sin eso no hay
  precio ni precio anterior que mostrar.
- `OffersGrid` no pasa `card_buttons` ni `badges` a la tarjeta de producto: todos los botones de
  tarjeta configurados en «Ofertas» se ignoran (hay 8 guardados). Pasarlos cambiaría lo que ven
  esas tiendas: es una decisión aparte.
- `menu_preview` en `/menu` delega en `MenuFull` (carta completa), que no pinta el precio tachado.

## Interruptores ocultos (155)

| Sección | Variante | Clave | Qué haría en el sitio | Componente que tendría que leerla | Default que mostraba el ERP | Prioridad | Estimación | Estado |
|---|---|---|---|---|---|---|---|---|
| `brands` | `logos` | `autoplay` | Avanzar el carrusel solo cada N segundos | `components/sections/retail/BrandsLogos.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `brands` | `logos` | `enable_swipe` | Deslizar con el dedo en el celular | `components/sections/retail/BrandsLogos.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `brands` | `logos` | `loop` | Volver al primer elemento después del último | `components/sections/retail/BrandsLogos.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `brands` | `logos` | `pause_on_hover` | Pausar el avance automático con el puntero encima | `components/sections/retail/BrandsLogos.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `brands` | `logos` | `show_arrows` | Flechas anterior / siguiente | `components/sections/retail/BrandsLogos.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `brands` | `logos` | `show_dots` | Puntos de paginación | `components/sections/retail/BrandsLogos.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `categories_grid` | `default` | `full_width` | Sección a todo el ancho de la pantalla | `components/sections/products/CategoriesGrid.tsx` | apagado | Baja | 1 h | Pendiente |
| `categories_grid` | `grid` | `full_width` | Sección a todo el ancho de la pantalla | `components/sections/products/CategoriesGrid.tsx` | apagado | Baja | 1 h | Pendiente |
| `categories_grid` | `horizontal` | `full_width` | Sección a todo el ancho de la pantalla | `components/sections/products/CategoriesGrid.tsx` | apagado | Baja | 1 h | Pendiente |
| `categories_grid` | `icons` | `full_width` | Sección a todo el ancho de la pantalla | `components/sections/products/CategoriesGrid.tsx` | apagado | Baja | 1 h | Pendiente |
| `cta` | `centered` | `buttons[].full_width` | Sección a todo el ancho de la pantalla (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaCentered.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `banner` | `buttons[].full_width` | Sección a todo el ancho de la pantalla (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaBanner.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `with_image` | `buttons[].full_width` | Sección a todo el ancho de la pantalla (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaWithImage.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `split` | `buttons[].full_width` | Sección a todo el ancho de la pantalla (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaSplit.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `centered` | `buttons[].full_width_mobile` | Botón a todo el ancho en el celular (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaCentered.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `banner` | `buttons[].full_width_mobile` | Botón a todo el ancho en el celular (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaBanner.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `with_image` | `buttons[].full_width_mobile` | Botón a todo el ancho en el celular (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaWithImage.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `split` | `buttons[].full_width_mobile` | Botón a todo el ancho en el celular (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaSplit.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `centered` | `buttons[].icon_only` | Botón solo con icono, sin texto (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaCentered.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `banner` | `buttons[].icon_only` | Botón solo con icono, sin texto (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaBanner.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `with_image` | `buttons[].icon_only` | Botón solo con icono, sin texto (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaWithImage.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `split` | `buttons[].icon_only` | Botón solo con icono, sin texto (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaSplit.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `centered` | `buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaCentered.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `banner` | `buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaBanner.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `with_image` | `buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaWithImage.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `cta` | `split` | `buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/cta/CtaSplit.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `featured_products` | `carousel` | `autoplay` | Avanzar el carrusel solo cada N segundos | `components/sections/products/FeaturedProductsCarousel.tsx` | apagado | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `featured_products` | `grid` | `card_buttons[].full_width_mobile` | Botón a todo el ancho en el celular | `components/sections/products/FeaturedProducts.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `featured_products` | `carousel` | `card_buttons[].full_width_mobile` | Botón a todo el ancho en el celular | `components/sections/products/FeaturedProductsCarousel.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `featured_products` | `hero_product` | `card_buttons[].full_width_mobile` | Botón a todo el ancho en el celular | `components/sections/products/FeaturedProductsHero.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | Pendiente: «hero_product» no pinta botones (el campo se ve por las otras variantes) |
| `featured_products` | `grid` | `card_buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva | `components/sections/products/FeaturedProducts.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `featured_products` | `carousel` | `card_buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva | `components/sections/products/FeaturedProductsCarousel.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `featured_products` | `hero_product` | `card_buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva | `components/sections/products/FeaturedProductsHero.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | Pendiente: «hero_product» no pinta botones (el campo se ve por las otras variantes) |
| `featured_products` | `carousel` | `enable_swipe` | Deslizar con el dedo en el celular | `components/sections/products/FeaturedProductsCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `featured_products` | `hero_product` | `hide_if_no_reviews` | Ocultar las estrellas si no hay reseñas | `components/sections/products/FeaturedProductsHero.tsx` | encendido | Media | 2–3 h (reutilizar la tarjeta de producto) | Pendiente |
| `featured_products` | `carousel` | `loop` | Volver al primer elemento después del último | `components/sections/products/FeaturedProductsCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `featured_products` | `hero_product` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/products/FeaturedProductsHero.tsx` | encendido | Alta | 2 h (la tarjeta de producto ya lo hace: reutilizarla) | **Hecho 2026-10-07** |
| `featured_products` | `grid` | `show_filters` | Barra de filtros (categoría, precio) sobre la lista | `components/sections/products/FeaturedProducts.tsx` | apagado | Alta | 4–6 h (reutilizar los filtros de ProductsGrid) | **Hecho 2026-10-07** |
| `featured_products` | `carousel` | `show_filters` | Barra de filtros (categoría, precio) sobre la lista | `components/sections/products/FeaturedProductsCarousel.tsx` | apagado | Alta | 4–6 h (reutilizar los filtros de ProductsGrid) | **Hecho 2026-10-07** |
| `featured_products` | `hero_product` | `show_filters` | Barra de filtros (categoría, precio) sobre la lista | `components/sections/products/FeaturedProductsHero.tsx` | apagado | Alta | 4–6 h (reutilizar los filtros de ProductsGrid) | **Hecho 2026-10-07** |
| `featured_products` | `hero_product` | `show_rating` | Estrellas de valoración | `components/sections/products/FeaturedProductsHero.tsx` | apagado | Media | 2–3 h (reutilizar la tarjeta de producto) | Pendiente |
| `featured_products` | `grid` | `show_search` | Buscador sobre la lista | `components/sections/products/FeaturedProducts.tsx` | apagado | Media | 3–4 h | **Hecho 2026-10-07** |
| `featured_products` | `carousel` | `show_search` | Buscador sobre la lista | `components/sections/products/FeaturedProductsCarousel.tsx` | apagado | Media | 3–4 h | **Hecho 2026-10-07** |
| `featured_products` | `hero_product` | `show_search` | Buscador sobre la lista | `components/sections/products/FeaturedProductsHero.tsx` | apagado | Media | 3–4 h | **Hecho 2026-10-07** |
| `gallery` | `masonry` | `autoplay` | Avanzar el carrusel solo cada N segundos (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryMasonry.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `grid` | `autoplay` | Avanzar el carrusel solo cada N segundos (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryGrid.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `carousel` | `autoplay` | Avanzar el carrusel solo cada N segundos | `components/sections/gallery/GalleryCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `fullscreen` | `autoplay` | Avanzar el carrusel solo cada N segundos | `components/sections/gallery/GalleryFullscreen.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `masonry` | `enable_swipe` | Deslizar con el dedo en el celular (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryMasonry.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `grid` | `enable_swipe` | Deslizar con el dedo en el celular (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryGrid.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `carousel` | `enable_swipe` | Deslizar con el dedo en el celular | `components/sections/gallery/GalleryCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `fullscreen` | `enable_swipe` | Deslizar con el dedo en el celular | `components/sections/gallery/GalleryFullscreen.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `masonry` | `lightbox` | Abrir la foto ampliada al hacer clic | `components/sections/gallery/GalleryMasonry.tsx` | encendido | Media | 3–4 h | **Hecho 2026-10-07** |
| `gallery` | `grid` | `lightbox` | Abrir la foto ampliada al hacer clic | `components/sections/gallery/GalleryGrid.tsx` | encendido | Media | 3–4 h | **Hecho 2026-10-07** |
| `gallery` | `carousel` | `lightbox` | Abrir la foto ampliada al hacer clic | `components/sections/gallery/GalleryCarousel.tsx` | encendido | Media | 3–4 h | **Hecho 2026-10-07** |
| `gallery` | `fullscreen` | `lightbox` | Abrir la foto ampliada al hacer clic | `components/sections/gallery/GalleryFullscreen.tsx` | encendido | Media | 3–4 h | **Hecho 2026-10-07** |
| `gallery` | `masonry` | `loop` | Volver al primer elemento después del último (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryMasonry.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `grid` | `loop` | Volver al primer elemento después del último (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryGrid.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `carousel` | `loop` | Volver al primer elemento después del último | `components/sections/gallery/GalleryCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `fullscreen` | `loop` | Volver al primer elemento después del último | `components/sections/gallery/GalleryFullscreen.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `masonry` | `pause_on_hover` | Pausar el avance automático con el puntero encima (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryMasonry.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `grid` | `pause_on_hover` | Pausar el avance automático con el puntero encima (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryGrid.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `carousel` | `pause_on_hover` | Pausar el avance automático con el puntero encima | `components/sections/gallery/GalleryCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `fullscreen` | `pause_on_hover` | Pausar el avance automático con el puntero encima | `components/sections/gallery/GalleryFullscreen.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `masonry` | `show_arrows` | Flechas anterior / siguiente (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryMasonry.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `grid` | `show_arrows` | Flechas anterior / siguiente (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryGrid.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `carousel` | `show_arrows` | Flechas anterior / siguiente | `components/sections/gallery/GalleryCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `fullscreen` | `show_arrows` | Flechas anterior / siguiente | `components/sections/gallery/GalleryFullscreen.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `masonry` | `show_dots` | Puntos de paginación (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryMasonry.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `grid` | `show_dots` | Puntos de paginación (la variante no es un carrusel: dejarlo oculto) | `components/sections/gallery/GalleryGrid.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `gallery` | `carousel` | `show_dots` | Puntos de paginación | `components/sections/gallery/GalleryCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `gallery` | `fullscreen` | `show_dots` | Puntos de paginación | `components/sections/gallery/GalleryFullscreen.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `hero` | `fullscreen` | `buttons[].full_width` | Sección a todo el ancho de la pantalla | `components/sections/hero/HeroFullscreen.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `hero` | `minimal` | `buttons[].full_width` | Sección a todo el ancho de la pantalla | `components/sections/hero/HeroMinimal.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `hero` | `slider` | `buttons[].full_width` | Sección a todo el ancho de la pantalla | `components/sections/hero/HeroSlider.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `hero` | `split` | `buttons[].full_width` | Sección a todo el ancho de la pantalla | `components/sections/hero/HeroSplit.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `hero` | `video` | `buttons[].full_width` | Sección a todo el ancho de la pantalla | `components/sections/hero/HeroVideo.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `hero` | `fullscreen` | `buttons[].icon_only` | Botón solo con icono, sin texto | `components/sections/hero/HeroFullscreen.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `hero` | `minimal` | `buttons[].icon_only` | Botón solo con icono, sin texto | `components/sections/hero/HeroMinimal.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `hero` | `slider` | `buttons[].icon_only` | Botón solo con icono, sin texto | `components/sections/hero/HeroSlider.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `hero` | `split` | `buttons[].icon_only` | Botón solo con icono, sin texto | `components/sections/hero/HeroSplit.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `hero` | `video` | `buttons[].icon_only` | Botón solo con icono, sin texto | `components/sections/hero/HeroVideo.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `map` | `default` | `show_marker` | Marcador en el punto del mapa (el iframe de Google Maps no permite quitar el marcador: exige otro proveedor de mapa) | `components/sections/map/MapDefault.tsx` | encendido | Baja | 4 h | Pendiente: el iframe de Google Maps no permite quitar el marcador (exige otro proveedor) |
| `map` | `embedded` | `show_marker` | Marcador en el punto del mapa (el iframe de Google Maps no permite quitar el marcador: exige otro proveedor de mapa) | `components/sections/map/MapEmbedded.tsx` | encendido | Baja | 4 h | Pendiente: el iframe de Google Maps no permite quitar el marcador (exige otro proveedor) |
| `map` | `full_width` | `show_marker` | Marcador en el punto del mapa (el iframe de Google Maps no permite quitar el marcador: exige otro proveedor de mapa) | `components/sections/map/MapFullWidth.tsx` | encendido | Baja | 4 h | Pendiente: el iframe de Google Maps no permite quitar el marcador (exige otro proveedor) |
| `map` | `with_directions` | `show_marker` | Marcador en el punto del mapa (el iframe de Google Maps no permite quitar el marcador: exige otro proveedor de mapa) | `components/sections/map/MapWithDirections.tsx` | encendido | Baja | 4 h | Pendiente: el iframe de Google Maps no permite quitar el marcador (exige otro proveedor) |
| `membership_plans` | `pricing_table` | `plans[].highlighted` | Marcar el plan como destacado | `components/sections/gym/MembershipPlansPricing.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | Pendiente |
| `membership_plans` | `pricing_table` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/gym/MembershipPlansPricing.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | **Hecho 2026-10-07** |
| `menu_preview` | `tabs` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/restaurant/MenuPreviewTabs.tsx` | encendido | Alta | 2 h (la tarjeta de producto ya lo hace: reutilizarla) | **Hecho 2026-10-07 (el avance; en /menu la sección se pinta como carta completa, MenuFull, que no tacha)** |
| `offers` | `grid` | `card_buttons[].full_width_mobile` | Botón a todo el ancho en el celular | `components/sections/retail/OffersGrid.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | Pendiente: OffersGrid no pasa `card_buttons` a la tarjeta (pasarlos cambia 8 botones guardados) |
| `offers` | `grid` | `card_buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva | `components/sections/retail/OffersGrid.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | Pendiente: OffersGrid no pasa `card_buttons` a la tarjeta (pasarlos cambia 8 botones guardados) |
| `offers` | `grid` | `show_filters` | Barra de filtros (categoría, precio) sobre la lista | `components/sections/retail/OffersGrid.tsx` | apagado | Alta | 4–6 h (reutilizar los filtros de ProductsGrid) | **Hecho 2026-10-07** |
| `offers` | `grid` | `show_search` | Buscador sobre la lista | `components/sections/retail/OffersGrid.tsx` | apagado | Media | 3–4 h | **Hecho 2026-10-07** |
| `parking_pass_plans` | `cards` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/parking/ParkingPassPlansCards.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | Sin fuente: `parking_pass_types` no tiene precio anterior |
| `parking_pass_plans` | `cards` | `show_description` | Mostrar u ocultar la descripción de cada elemento | `components/sections/parking/ParkingPassPlansCards.tsx` | apagado | Media | 1 h si el dato existe · 3 h si hay que traerlo | **Hecho 2026-10-07** |
| `parking_pricing` | `cards` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/parking/ParkingPricingCards.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | Sin fuente: `parking_rates` no tiene precio anterior ni descripción |
| `parking_pricing` | `cards` | `show_description` | Mostrar u ocultar la descripción de cada elemento | `components/sections/parking/ParkingPricingCards.tsx` | apagado | Media | 1 h si el dato existe · 3 h si hay que traerlo | Sin fuente: `parking_rates` no tiene precio anterior ni descripción |
| `partners` | `logos` | `autoplay` | Avanzar el carrusel solo cada N segundos (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersLogos.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `cards` | `autoplay` | Avanzar el carrusel solo cada N segundos (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersCards.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `carousel` | `autoplay` | Avanzar el carrusel solo cada N segundos | `components/sections/partners/PartnersCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `partners` | `logos` | `enable_swipe` | Deslizar con el dedo en el celular (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersLogos.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `cards` | `enable_swipe` | Deslizar con el dedo en el celular (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersCards.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `carousel` | `enable_swipe` | Deslizar con el dedo en el celular | `components/sections/partners/PartnersCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `partners` | `logos` | `loop` | Volver al primer elemento después del último (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersLogos.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `cards` | `loop` | Volver al primer elemento después del último (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersCards.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `carousel` | `loop` | Volver al primer elemento después del último | `components/sections/partners/PartnersCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `partners` | `logos` | `pause_on_hover` | Pausar el avance automático con el puntero encima (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersLogos.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `cards` | `pause_on_hover` | Pausar el avance automático con el puntero encima (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersCards.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `carousel` | `pause_on_hover` | Pausar el avance automático con el puntero encima | `components/sections/partners/PartnersCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `partners` | `logos` | `show_arrows` | Flechas anterior / siguiente (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersLogos.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `cards` | `show_arrows` | Flechas anterior / siguiente (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersCards.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `carousel` | `show_arrows` | Flechas anterior / siguiente | `components/sections/partners/PartnersCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `partners` | `logos` | `show_dots` | Puntos de paginación (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersLogos.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `cards` | `show_dots` | Puntos de paginación (la variante no es un carrusel: dejarlo oculto) | `components/sections/partners/PartnersCards.tsx` | encendido | No aplica | — | No aplica (se queda oculto) |
| `partners` | `carousel` | `show_dots` | Puntos de paginación | `components/sections/partners/PartnersCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `pricing_table` | `three_columns` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/saas/PricingTableColumns.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | Sin fuente: los planes son contenido del editor, sin precio anterior |
| `product_actions` | `default` | `buttons[].full_width` | Sección a todo el ancho de la pantalla (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/product-detail/ProductActions.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `product_actions` | `default` | `buttons[].full_width_mobile` | Botón a todo el ancho en el celular (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/product-detail/ProductActions.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `product_actions` | `default` | `buttons[].icon_only` | Botón solo con icono, sin texto (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/product-detail/ProductActions.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `product_actions` | `default` | `buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/product-detail/ProductActions.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `products_grid` | `carousel` | `autoplay` | Avanzar el carrusel solo cada N segundos | `components/sections/products/ProductsCarousel.tsx` | apagado | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `products_grid` | `default` | `card_buttons[].full_width_mobile` | Botón a todo el ancho en el celular | `components/sections/products/ProductsGrid.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `products_grid` | `grid` | `card_buttons[].full_width_mobile` | Botón a todo el ancho en el celular | `components/sections/products/ProductsGrid.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `products_grid` | `carousel` | `card_buttons[].full_width_mobile` | Botón a todo el ancho en el celular | `components/sections/products/ProductsCarousel.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `products_grid` | `list` | `card_buttons[].full_width_mobile` | Botón a todo el ancho en el celular | `components/sections/products/ProductsList.tsx` | encendido | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `products_grid` | `default` | `card_buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva | `components/sections/products/ProductsGrid.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `products_grid` | `grid` | `card_buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva | `components/sections/products/ProductsGrid.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `products_grid` | `carousel` | `card_buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva | `components/sections/products/ProductsCarousel.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `products_grid` | `list` | `card_buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva | `components/sections/products/ProductsList.tsx` | apagado | Baja | 1–2 h por opción (HeroButtons o la tarjeta de producto como modelo) | **Hecho 2026-10-07** |
| `products_grid` | `carousel` | `enable_swipe` | Deslizar con el dedo en el celular | `components/sections/products/ProductsCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `products_grid` | `carousel` | `loop` | Volver al primer elemento después del último | `components/sections/products/ProductsCarousel.tsx` | encendido | Alta | 3–4 h por componente (todos los controles del carrusel juntos) | **Hecho 2026-10-07** |
| `products_grid` | `carousel` | `show_filters` | Barra de filtros (categoría, precio) sobre la lista | `components/sections/products/ProductsCarousel.tsx` | apagado | Alta | 4–6 h (reutilizar los filtros de ProductsGrid) | **Hecho 2026-10-07** |
| `products_grid` | `list` | `show_filters` | Barra de filtros (categoría, precio) sobre la lista | `components/sections/products/ProductsList.tsx` | apagado | Alta | 4–6 h (reutilizar los filtros de ProductsGrid) | **Hecho 2026-10-07** |
| `products_grid` | `default` | `show_search` | Buscador sobre la lista | `components/sections/products/ProductsGrid.tsx` | apagado | Media | 3–4 h | **Hecho 2026-10-07** |
| `products_grid` | `grid` | `show_search` | Buscador sobre la lista | `components/sections/products/ProductsGrid.tsx` | apagado | Media | 3–4 h | **Hecho 2026-10-07** |
| `products_grid` | `carousel` | `show_search` | Buscador sobre la lista | `components/sections/products/ProductsCarousel.tsx` | apagado | Media | 3–4 h | **Hecho 2026-10-07** |
| `products_grid` | `list` | `show_search` | Buscador sobre la lista | `components/sections/products/ProductsList.tsx` | apagado | Media | 3–4 h | **Hecho 2026-10-07** |
| `room_types` | `cards` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/hotel/SpacesCards.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | Sin fuente: `space_types` solo tiene `base_rate`, no hay precio anterior |
| `room_types` | `detailed` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/hotel/SpacesDetailed.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | Sin fuente: `space_types` solo tiene `base_rate`, no hay precio anterior |
| `room_types` | `cards` | `show_description` | Mostrar u ocultar la descripción de cada elemento | `components/sections/hotel/SpacesCards.tsx` | encendido | Media | 1 h si el dato existe · 3 h si hay que traerlo | **Hecho 2026-10-07** |
| `routes` | `cards` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/transport/RoutesCards.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | Sin fuente: `transport_routes` no tiene descripción ni precio anterior |
| `routes` | `cards` | `show_description` | Mostrar u ocultar la descripción de cada elemento | `components/sections/transport/RoutesCards.tsx` | apagado | Media | 1 h si el dato existe · 3 h si hay que traerlo | Sin fuente: `transport_routes` no tiene descripción ni precio anterior |
| `services_list` | `cards` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/services/ServicesListCards.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | **Hecho 2026-10-07** (la sección ya recibe sus servicios) |
| `services_list` | `grid` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/services/ServicesListGrid.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | **Hecho 2026-10-07** (la sección ya recibe sus servicios) |
| `services_list` | `icons_row` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/services/ServicesListIconsRow.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | No aplica: la fila de iconos no pinta precio (se queda oculto) |
| `services_list` | `list` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/services/ServicesListList.tsx` | encendido | Alta | 4–6 h (falta el precio anterior en la fuente de datos) | **Hecho 2026-10-07** (la sección ya recibe sus servicios) |
| `services_list` | `icons_row` | `show_description` | Mostrar u ocultar la descripción de cada elemento | `components/sections/services/ServicesListIconsRow.tsx` | encendido | Media | 1 h si el dato existe · 3 h si hay que traerlo | **Hecho 2026-10-07** |
| `specialties` | `featured` | `card_buttons[].full_width` | Sección a todo el ancho de la pantalla (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/restaurant/SpecialtiesFeatured.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `specialties` | `featured` | `card_buttons[].full_width_mobile` | Botón a todo el ancho en el celular (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/restaurant/SpecialtiesFeatured.tsx` | encendido | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `specialties` | `featured` | `card_buttons[].icon_only` | Botón solo con icono, sin texto (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/restaurant/SpecialtiesFeatured.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `specialties` | `featured` | `card_buttons[].open_new_tab` | Abrir el enlace del botón en una pestaña nueva (el componente no pinta el repetidor de botones: primero hay que pintarlo) | `components/sections/restaurant/SpecialtiesFeatured.tsx` | apagado | Baja | 1–2 h por opción + pintar los botones (3–4 h) | Pendiente |
| `specialties` | `featured` | `hide_if_no_reviews` | Ocultar las estrellas si no hay reseñas | `components/sections/restaurant/SpecialtiesFeatured.tsx` | encendido | Media | 2–3 h (reutilizar la tarjeta de producto) | Pendiente |
| `specialties` | `featured` | `show_compare_price` | Precio anterior tachado junto al precio actual | `components/sections/restaurant/SpecialtiesFeatured.tsx` | encendido | Alta | 2 h (la tarjeta de producto ya lo hace: reutilizarla) | **Hecho 2026-10-07** |
| `specialties` | `featured` | `show_description` | Mostrar u ocultar la descripción de cada elemento | `components/sections/restaurant/SpecialtiesFeatured.tsx` | apagado | Media | 1 h si el dato existe · 3 h si hay que traerlo | **Hecho 2026-10-07** |
| `specialties` | `featured` | `show_rating` | Estrellas de valoración | `components/sections/restaurant/SpecialtiesFeatured.tsx` | apagado | Media | 2–3 h (reutilizar la tarjeta de producto) | Pendiente |

## Caso que sigue visible aunque no funcione en una variante

- `featured_products` · `hero_product` · `card_buttons[].icon_only`, `full_width`,
  `full_width_mobile` y `open_new_tab`: la tarjeta de producto los lee en `grid` y `carousel`,
  pero `FeaturedProductsHero.tsx` no pinta botones. Un repetidor no conoce la variante de la sección, así que no se pueden ocultar solo en
  `hero_product`. Se resuelve pintando los botones de tarjeta en esa variante.

## Cómo volver a mostrar un interruptor

1. **Implementarlo en el sitio** (goadmin-websites), en el componente de la tabla. Con la clave
   ausente, el sitio debe verse como hoy; con la clave puesta, cambia solo lo que dice la etiqueta.
2. **Cubrirlo en `scripts/verify-interruptores.mjs`** del sitio: un caso que pinte el componente
   real con la clave ausente y con la clave puesta, y compruebe el efecto. El script debe fallar sin
   la implementación.
3. **Quitarlo del mapa de ocultos** en `src/lib/services/website/interruptoresSitio.ts`: añadir la
   variante a su lista en `INTERRUPTORES_EN_SITIO`, o borrar la entrada si ya la leen todas. Ajustar
   `defaultValue` (o `DEFAULT_POR_VARIANTE`) para que el switch muestre lo que el sitio hace con la
   clave ausente.
4. **Actualizar** `__tests__/interruptoresOcultos.test.ts` (la fila sale de `OCULTOS` o de
   `ITEMS_QUITADOS` y entra en «No se oculta de más») y esta tabla.
5. **Orden de despliegue:** primero el PR del sitio, y solo con él desplegado el del ERP. El ERP
   nunca debe mostrar un interruptor que el sitio desplegado todavía no lee.

## Avance del 2026-10-07 (2): servicios con datos

- El sitio carga `data.services` solo en las páginas con `services_list` (una consulta cacheada,
  `getServiciosDeSeccion` en `lib/website/datosSecciones.ts`), con la misma fuente que /servicios:
  `organization_services` activo en organizaciones de servicios (type_id 4) y productos activos
  con `unit_code = 'SV'` en las demás. Resuelve el hallazgo de arriba sobre `services_list`.
- `show_compare_price` funciona en tarjetas, grid y lista con el `compare_price` real; la fila de
  iconos no pinta precio y queda oculta. Con la clave ausente, sin tachar. `organization_services`
  no tiene descripción ni precio anterior: con esa fuente no hay ni lo uno ni lo otro.
- Las celdas «Estado» de las cuatro filas de `services_list` · `show_compare_price` se
  actualizaron: 3 hechas y 1 que no aplica (antes «Sin fuente»).
- Recuento tras este avance: 81 hechas, 41 pendientes, 8 sin fuente y 25 que no aplican (de 155).
