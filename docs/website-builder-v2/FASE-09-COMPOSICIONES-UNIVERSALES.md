# Fase 09 — Biblioteca universal de secciones y composiciones

Estado: pendiente; **etapa 4**. Depende del piloto de la etapa 3 (F05 en producción), no de F08. Incluye la familia T (plantillas de página), P07, C24 y E13, y las acciones «ampliar/fusionar» del [mapeo de tipos legacy](MAPEO-TIPOS-LEGACY.md). Resultado: construir páginas variadas combinando piezas coherentes y funcionales, sin duplicar código por cada plantilla.

## Alcance y UX

Implementar las familias P (incluida P07), T, HR, C (incluida C24), G y D del [catálogo](CATALOGO-COMPOSICIONES.md), junto a H/F de F05. La biblioteca ofrece «crear página desde plantilla» (T) y «desde cero». Biblioteca con miniaturas generadas por renderer, filtros por propósito, búsqueda, favoritos y presets propios. Cada variante se prueba antes de insertarse; explicar si necesita datos, imagen/video o una capacidad habilitada.

El sitio admite varias instancias de historia, galería, FAQ, CTA o testimonios con contenidos independientes. Guardar una composición captura contenido y diseño. «Duplicar», «guardar preset» y «vincular sección compartida» son acciones distintas; la primera entrega puede usar copias, pero no debe presentarlas como sincronizadas.

## Componentes y backend

- F09-01. Crear composiciones `VerticalPage`, `SplitPanelPage`, `EditorialGridPage`, `CompactPage` y `QrMenuPage` como propuestas reutilizables. Ranuras limitadas, orden responsive y accesibilidad definidos en contrato. Una composición dividida puede conservar visual en escritorio y apilar contenido en móvil.
- F09-02. Implementar variantes reales de hero: imagen, video, dividido, editorial, tipográfico con collage, producto recortado, carrusel, reserva y arco. No registrar nombres diferentes sobre un componente que ignore la variante.
- F09-03. Ampliar historia, colecciones, galería, equipo, reseñas, reconocimientos, métricas, preguntas, artículos, newsletter, contacto, horarios, pasos y CTA. Un mismo componente base admite formas diferentes mediante layouts explícitos.
- F09-04. Añadir decoraciones declarativas: separadores, texturas, máscaras, recortes, sellos, marca grande y movimiento controlado. Mantener capas decorativas fuera del árbol semántico y sin interceptar clics.
- F09-05. Eliminar la sincronización de «última galería/FAQ/testimonio gana» sobre settings globales en V2. Cualquier proyección legacy es explícita y no modifica el documento de otras instancias.
- F09-06. Fuentes de datos declaradas con límites y consultas compartidas por render; paginación/load-more para colecciones. No precargar 500 productos por encontrar una sección que solo muestra cuatro tarjetas.
- F09-07. Definir registro de acciones: navegar, ancla, abrir modal, reservar, comprar, contactar y enviar formulario. Cada una tiene adaptador real o de preview; los componentes no improvisan llamadas operativas.
- F09-08. Generar fixtures públicos sintéticos, miniaturas y escenas visuales desde el mismo catálogo versionado. Cambiar de variante mantiene campos compatibles y conserva contenido que deja de mostrarse.

## Base de datos

No tabla por sección o variante: persistencia en documentos/presets versionados. Reutilizar infraestructura de artículos, formularios y entidades si existe y está autorizada; verificar por MCP antes de definir adaptadores. Si una capacidad no existe, implementarla como subentrega explícita y no publicar un botón sin destino real.

Presets privados con organización/RLS. Presets de sistema se distribuyen como catálogo versionado con recursos de F06. Secciones compartidas vinculadas, si se implementan, tienen revisión y alcance; nunca una referencia mutable que cambie lo publicado fuera de F03.

## Orden interno

Primero P/HR y texto/galería; después colecciones/confianza/formularios; finalmente decoraciones y movimiento. Cada lote cierra controles, móvil y acciones antes de aumentar el número de variantes.

## Aceptación y reversión

- [ ] Cada entrada del catálogo tiene preview, esquema, renderer y prueba de sus controles.
- [ ] Una página con tres galerías y dos FAQ conserva cinco conjuntos independientes al guardar, duplicar, publicar y restaurar.
- [ ] Carruseles, pestañas, acordeones y lightbox tienen interacción real, foco y estados vacíos.
- [ ] Datos compartidos no multiplican consultas por tarjeta; documentar presupuestos medidos.
- [ ] Movimiento reducido, imagen ausente y texto largo mantienen contenido legible.

Reversión: retirar variantes de nuevas inserciones mediante catálogo, conservando renderer para documentos que ya las usan. No borrar definiciones publicadas; un fallback compatible mantiene contenido y navegación.
