# Revisión e integración de PRs de banners, categorías y listados

`main` de `goadmin-websites`, en `7717631`, ya incorpora los PRs #29, #31, #32, #35 y #38. El trabajo de esta entrega se rebasó sobre esa base y consolidó las correcciones con las implementaciones existentes. Los heads de la tabla identifican el código revisado originalmente; no representan ramas pendientes de incorporar ni una validación del despliegue.

| PR incorporado en main | Head revisado originalmente | Resultado de la consolidación |
| --- | --- | --- |
| [#29](https://github.com/Palomo-dev/goadmin-websites/pull/29) | 49217d74 | Se conserva un solo `EstilosCategoria`, con su comportamiento móvil y sus campos existentes. Las cinco variantes del editor usan ese renderer. Se corrigió el mosaico para conservar categorías sobrantes y `minimal_icon` utiliza el ícono Lucide real. Se eliminó `CategoriesDiseno`, que duplicaba esta función. |
| [#31](https://github.com/Palomo-dev/goadmin-websites/pull/31) | 31e27470 | `PromoBannersGrid` conserva el render anterior cuando no hay claves nuevas y usa únicamente `BannersConfigurados` cuando las hay. Se mantienen sus once distribuciones, rejillas por bloques, proporciones, imágenes y destinos. Se agregaron los overrides de `banner.banner_style` y la alineación individual. Se eliminaron `BannersDiseno` y su CSS duplicado. |
| [#32](https://github.com/Palomo-dev/goadmin-websites/pull/32) | 9fa37e78 | Se conservaron el cascarón global, `ListRenderer`, las fuentes de productos, los filtros de categorías y subcategorías, la API y la paginación de servidor. Los límites combinan `max_items` y `products_limit` también al formar el pedido al servidor; no se sustituyó ese motor por un recorte exclusivo en memoria. |
| [#35](https://github.com/Palomo-dev/goadmin-websites/pull/35) | fc34479e | Se conservaron `isFirst`, los offsets y tamaños en píxeles, el solape explícito y la composición de `SectionWrapper` ya presentes en main. Las secciones intermedias mantienen su separación y los valores explícitos prevalecen. Esta entrega no repitió el backfill descrito en ese PR. |
| [#38](https://github.com/Palomo-dev/goadmin-websites/pull/38) | 10152104 | Se conservaron `Paginacion`, `ControlesCarrusel`, los ajustes globales y por dispositivo, y la navegación existente. `PaginacionListado` es un adaptador de las claves del listado al mismo componente `Paginacion`; no contiene otro renderer. Se mantienen el límite total, el tamaño por página y la precedencia del tamaño global forzado. |

## Hallazgos corregidos de los heads originales

- **#29:** `planBento` producía solo grupos completos y el renderer descartaba el resto: con cuatro categorías no mostraba ninguna y con seis mostraba cinco. Ahora el mosaico dibuja todas, incluidas las sobrantes. Las referencias originales eran `lib/website/estiloCategoria.ts:28–41` y `EstilosCategoria.tsx:174–193`.
- **#29:** `minimal_icon` utilizaba `Foto` en `EstilosCategoria.tsx:112–135`. Ahora dibuja el ícono de la categoría.
- **#31:** `BannersConfigurados.tsx:364–385` utilizaba únicamente el estilo global y su línea 374 ignoraba la alineación individual. La implementación consolidada combina los estilos individuales con los de la sección.

## Límites de la revisión

El rollback SQL incluido en la descripción original de #35 elimina `header_transparent_over_hero` de todos los borradores que lo tengan. Podría borrar decisiones posteriores del usuario. No se ejecutó: una reversión de ese backfill requiere delimitar sus filas y versiones con la instantánea correspondiente.

La descripción de #32 reconoce que el orden por precio y el recorte de ofertas ocurren después del `range`, y que los filtros de marca y calificación operan sobre la página cargada. Se conservaron esos comportamientos de main; esta entrega no los amplió ni los presenta como orden o filtro del catálogo completo.

#38 utiliza un único parámetro `page` por ruta. La interacción de varios listados configurables de una misma página al restaurar la URL requiere una comprobación específica; no se cambió ese contrato durante la consolidación.

La verificación de esta integración corresponde al código y a las pruebas locales del render compartido por vista previa y tienda. No acredita una publicación real ni el resultado visual de un despliegue remoto. Las capturas antiguas enlazadas en los PRs tampoco prueban el resultado actual de la org 140.

No se ejecutaron migraciones ni backfills para estas áreas durante esta entrega. La base ya contenía los cambios incorporados por los PRs anteriores.
