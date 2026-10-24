# Revisión de PRs previos: banners, categorías, listado y publicación visual

Revisión local, sin fusionar ni rebasar ramas. Base de integración: main en ambos repositorios. Las referencias citadas son los heads revisados, no una aprobación para desplegarlos.

| PR de goadmin-websites | Head revisado | Cobertura y decisión |
| --- | --- | --- |
| [#29](https://github.com/Palomo-dev/goadmin-websites/pull/29) | 49217d74 | Ya propone las cinco claves category_style del editor. Reaprovechar contrato y comportamiento móvil; conservar nuestro render con íconos Lucide y sin descartar categorías. No incorporar el plan de mosaico tal cual. |
| [#31](https://github.com/Palomo-dev/goadmin-websites/pull/31) | 31e27470 | Ya implementa las once distribuciones del inspector y su contrato distribucionBanner. Su rejilla por bloques y manejo de proporciones son más completos. Consolidar en un solo renderer, conservando los estilos individuales nuevos y las pruebas de render. No montar ambos componentes para la misma sección. |
| [#32](https://github.com/Palomo-dev/goadmin-websites/pull/32) | 9fa37e78 | Incluye fuentes de productos, consulta paginada real, cascarón global y ListRenderer para muchos tipos de sección. Tiene 107 archivos: requiere revisión separada de datos, índices y seguridad. Para el alcance actual se corrigieron límites y páginas sobre el catálogo existente, sin añadir otra API ni consultas. |
| [#35](https://github.com/Palomo-dev/goadmin-websites/pull/35) | fc34479e | El control de primera sección evita modificar el espacio de secciones intermedias. Se reaprovechó la distinción isFirst en la implementación actual. No se incorporó el cambio global de solape transparente ni se repitió el backfill anunciado en su descripción. |
| [#38](https://github.com/Palomo-dev/goadmin-websites/pull/38) | 10152104 | Tiene Paginacion y ControlesCarrusel compartidos, estilos globales, móvil, URL e historial. Superpone PaginacionListado. Una integración posterior debe elegir una sola implementación y conservar el markup predeterminado, el límite total y los tamaños por página ya probados. |

## Hallazgos prioritarios

1. **Alto, #29:** lib/website/estiloCategoria.ts:28–41 arma solo grupos completos y EstilosCategoria.tsx:174–193 recorta a la suma de esos grupos. Con cuatro categorías no pinta ninguna; con seis pinta cinco. No debe ocultar datos para completar un mosaico. El renderer actual conserva todas.
2. **Alto, #35:** el rollback SQL propuesto en el cuerpo elimina header_transparent_over_hero de todos los borradores que lo tengan, aunque el valor haya sido elegido después por el usuario. Antes de ejecutar una reversión se necesita recuperar la instantánea concreta del backfill y delimitar filas/versiones; no ejecutar esa sentencia genérica.
3. **Medio, #31:** BannersConfigurados.tsx:364–385 utiliza el estilo global para borde, forma, sombra y hover; no combina banner.banner_style. La alineación individual del banner tampoco participa en la línea 374. Conservar los overrides individuales añadidos en esta entrega.
4. **Medio, #29:** EstilosCategoria.tsx:112–135 usa Foto para minimal_icon. El diseño de íconos debe dibujar el ícono real de la categoría, no repetir otra tarjeta con foto.
5. **Medio, #32:** la descripción reconoce orden por precio y recorte de ofertas después del range, y filtros de marca/calificación en memoria sobre la página cargada. No equivalen a ordenar o filtrar el catálogo completo. Requieren pruebas de varias páginas antes de ampliar el alcance.
6. **Medio, #38:** usePaginaLista usa un único parámetro page para todos los listados de la ruta (listaCarrusel.tsx:45–84). Si una página contiene varios listados configurables, comprobar que avanzar uno no cambie inesperadamente los demás al restaurar la URL.

## Conflictos de consolidación

Los PRs #31 y #32 modifican PromoBannersGrid; #29, #32 y #38 modifican CategoriesGrid; #32 y #38 modifican ProductsGrid/ProductsCarousel. #35 y #32 modifican SectionWrapper y SectionRenderer. #35 y #38 modifican HeroSlider y OrganizationLayoutCliente. No aplicar todos sus parches de forma automática sobre estos cambios.

La entrega actual conserva los contratos existentes del inspector y añade pruebas del render real compartido por vista previa y tienda. No se ejecutaron migraciones ni backfills para estas áreas. La revisión de los PRs fue de código y pruebas locales; las capturas antiguas enlazadas en sus descripciones no prueban el resultado actual de la org 140.
