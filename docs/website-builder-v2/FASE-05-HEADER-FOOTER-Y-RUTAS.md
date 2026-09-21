# Fase 05 — Header, footer y continuidad entre páginas

Estado: pendiente; **etapa 2**. Depende de F04. Menús según [ADR-002 D3](ADR-002-DECISIONES-Y-SECUENCIA.md): viven en el documento; header y footer los referencian por id. Resultado: el diseño seleccionado acompaña al visitante durante todo el sitio, incluidos detalles y reservas.

## UX y componentes

Reutilizar `HeaderLayoutSelector`, `HeaderOptionsPanel`, `MobileHeaderPanel`, `FooterLayoutSelector`, `FooterOptionsPanel`, `MobileFooterPanel`, `MenuGroupManager` y `MenuTreeEditor`. Reemplazar progresivamente mockups desconectados por muestras generadas con componentes reales.

Ofrecer los patrones H01–H08 y F01–F06 del [catálogo](CATALOGO-COMPOSICIONES.md). Separar composición, posición y estado del header: en flujo, superpuesto, flotante, dentro de panel; fondo inicial/al hacer scroll/con menú abierto. Logo claro/oscuro y CTA por estado. Para footer, ranuras ordenables de marca, menú, horarios, contacto, mapa, newsletter y legal, con familias visuales coherentes.

La página puede heredar el shell o establecer una excepción identificable: header sólido en detalle, footer mínimo en reserva, navegación compacta en QR. No duplicar toda la configuración para cambiar un atributo.

## Backend y websites

- F05-01. Unificar `SiteHeader.tsx`, `header/HeaderShared.tsx`, variantes de header y `SiteFooter.tsx` sobre la identidad/tema efectivos. Todas las rutas usan el mismo `SiteShell` propuesto, construido desde la revisión capturada.
- F05-02. Editor de menús del sitio sobre el documento: crear, anidar, reordenar, items tipados, mega-menú con columnas e imagen/badge. Un outlet puede copiar los menús del sitio principal; nunca compartirlos por referencia mutable. Reutiliza `MenuGroupManager`/`MenuTreeEditor` adaptados al documento.
- F05-03. Crear un único generador de enlaces internos: inicio, página, colección, entidad, reserva y sitio relacionado. Conserva prefijo o dominio del outlet y trata externos, teléfono, correo y anclas de forma explícita.
- F05-04. Revisar `app/[[...slug]]/page.tsx`, `app/productos/[id]/page.tsx`, `app/categorias/[slug]/page.tsx`, `app/espacios/[id]/page.tsx` y APIs dependientes. Resolver todos los segmentos posteriores al prefijo, no solo el primero. Centralizar resolución de tipo de ruta y reutilizar las vistas existentes.
- F05-05. Definir prefijos reservados, colisiones entre slug global/outlet, URLs canónicas, redirects existentes, sitemap, Open Graph y 404. No cambiar URLs activas incidentalmente; mantener redirección probada si se decide una modificación.
- F05-06. En detalles, buscar plantilla por sitio y tipo con precedencia local/heredada. Producto/categoría/habitación reciben árbol de navegación, footer y contexto completos.

## Base de datos

Decidido en ADR-002 D3: los menús son parte del documento (`menus[]` con items `page | entity | custom | anchor | site`). Los menús legacy se importan al adoptar V2. No se crea tabla de asignaciones.

No derivar pertenencia de una categoría/producto/espacio únicamente del enlace. Comprobar entidad autorizada y sucursal según las reglas operativas existentes. Alinear dominios/rutas verificados con el contexto de F02.

## Pruebas y reversión

- [ ] Cada combinación publicada de estrategia URL —prefijo, subdominio, dominio propio— supera inicio → listado → detalle → reserva/carrito → regreso.
- [ ] Si una estrategia aún no está implementada, no se ofrece como funcional en UI.
- [ ] Header/footer mantienen menú, identidad, fondo y CTA en todas las rutas, con excepciones declaradas.
- [ ] Menú móvil se opera con teclado, cierra con Escape y devuelve foco; enlaces y foco visibles.
- [ ] Canonical/sitemap no indexan otro outlet ni borradores y no duplican home por errores de precedencia.
- [ ] Una URL ajena o entidad de otra organización no obtiene datos por service role.

Activación por sitio y revisión. Recuperación al shell anterior compatible, conservando resolución segura de rutas. No volver a filtros globales como atajo de rollback.
