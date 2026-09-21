# Fase 01 — Contrato versionado y compatibilidad

Estado: pendiente; **etapa 1**. Depende de F00 (cerrada). Decisiones que la gobiernan: [ADR-002 D2](ADR-002-DECISIONES-Y-SECUENCIA.md) (paquete `packages/site-contract/` en el ERP, tarball versionado con checksum, ruta `api/site-capabilities`) y D5 (niveles T y P07). El registro incluye los 65 tipos actuales según [MAPEO-TIPOS-LEGACY.md](MAPEO-TIPOS-LEGACY.md). Resultado: editor y sitio interpretan el mismo documento y conservan las composiciones guardadas.

## UX y componentes

Cada entrada de biblioteca debe tener nombre en español, propósito, miniatura real, variantes, controles admitidos y capacidades necesarias. Diferenciar tema, plantilla completa, composición de página, sección y bloque. No mostrar controles que el renderer ignore.

ERP: evolucionar `src/lib/services/website/sectionContract.ts`, `sectionFieldGroups.ts`, `sectionsByBranchType.ts`, `websitePageBuilderService.ts`, `AddSectionDialog.tsx` y `fields/FieldRenderer.tsx`. Websites: `components/sections/SectionRenderer.tsx` y `app/api/_sections/manifest/route.ts`.

## Documento lógico propuesto

`SiteDocumentV2` contiene versión de esquema, referencia validable de sitio, identidad pública, tema, shell de header/footer, menús materializados, páginas, plantillas de detalle, secciones con ID estable, bloques y referencias multimedia. El estado de selección/zoom del editor queda fuera del documento público.

Una sección contiene `id`, tipo, variante, versión, contenido, diseño, visibilidad responsive y fuente de datos declarada. La fuente describe filtros admitidos, orden y límite; no contiene SQL ni claves de acceso. Los precios/stock/disponibilidad operativos no se copian a un snapshot de diseño.

Herencia editorial: `{mode: inherit | value | clear}` en campos autorizados. La ausencia de un override V2 significa heredar; un adaptador conserva la interpretación histórica de `null` en documentos viejos. No reinterpretar datos guardados de forma masiva.

## Backend y entrega

- F01-01. Definir esquema validable, serialización determinista y migradores puros entre versiones. Limitar longitud, número de bloques, tamaño de documento y profundidad de ranuras.
- F01-02. Crear la fuente única del contrato en `packages/site-contract/` del ERP: TypeScript puro, sin React, Next ni cliente de Supabase. Distribución decidida en ADR-002 D2: tarball `npm pack` versionado; websites lo instala con versión exacta y checksum en `package.json`. Cada repositorio declara versión mínima y máxima que entiende. Sin dependencia remota mutable en runtime.
- F01-03. Adaptar las filas actuales a documento de lectura sin reescribirlas. Conservar IDs, orden, visibilidad, contenido y configuración. Un tipo desconocido debe producir diagnóstico y conservar sus datos, no borrarlos al guardar.
- F01-04. Mantener los 65 tipos y aliases históricos. Los 50 usos observados de `categories_grid` con `grid`, `horizontal`, `icons` requieren adaptador/pruebas; no retirarlos por no aparecer en el selector.
- F01-05. Versionar manifiesto y compatibilidad mínima/máxima. El ERP bloquea la publicación de una capacidad que el renderer desplegado no soporte y explica cuál falta. La ruta de capacidades es `app/api/site-capabilities/route.ts` (registrable); la actual bajo `_sections` no cuenta.
- F01-06. Generar controles/manifiesto desde el registro y pruebas que confirmen consumo de campos por variante. Regenerar el fixture de `sectionContract.test.ts` desde el renderer (incluye los 3 tipos `product_*` que faltan y los 3 aliases de `categories_grid`) y volver a dejar ese test como compuerta verde; no cambiar expectativas para ocultar un fallo.

### Condiciones verificadas en F00 que debe resolver el contrato

El manifiesto actual de websites (`lib/sectionManifest.ts`) importa `SECTION_MAP` desde el renderer React y une las claves de contenido de todas las variantes de un tipo. Esa unión no prueba que una variante concreta consuma un campo. El contrato V2 debe declarar campos/capacidades por variante y separar sus metadatos puros de los imports de componentes; así el paquete compartido no arrastra React, Next.js ni clientes de datos. Ambos repositorios usan versiones distintas de Next.js y React, según sus `package.json`.

El fixture del ERP omite tres tipos de producto presentes en el renderer. Otro test exige que los aliases de categorías dejen de ser huérfanos del catálogo; el fixture sí los contiene. F01 debe distinguir las variantes heredadas que se pueden leer de las variantes ofrecidas para nuevas inserciones, sin retirar soporte a las primeras. Regenerar el manifiesto desde el artefacto validado evita repetir la transcripción manual, pero no resuelve por sí solo esa distinción. Fijar versión y checksum del artefacto consumido en cada repositorio; una actualización del contrato no actualiza automáticamente el renderer desplegado. El mecanismo de distribución y su verificación quedan pendientes de implementación en F01-02.

La comprobación visual legacy permite continuar cuando no hay manifiesto (`getSectionSyncStatus` en `sectionContract.ts`). Conservar esa conducta del editor existente. La publicación V2 necesita una comprobación independiente: manifiesto ausente, versión desconocida o capacidad no acreditada bloquean esa publicación con explicación y posibilidad de reintento; no se interpretan como compatibilidad demostrada.

La ruta declarada `app/api/_sections/manifest/route.ts` existe en las fuentes, pero no figura entre las 111 entradas de `.next/server/app-paths-manifest.json` del build aislado de F00; `routes-manifest.json` tampoco declara rewrites. Next.js excluye del enrutamiento los directorios cuyo nombre comienza por guion bajo, según su [documentación de estructura del proyecto](https://nextjs.org/docs/14/getting-started/project-structure). Esta evidencia local no determina la respuesta HTTP ni la versión desplegada en producción. F01 debe agregar una ruta realmente registrable para consultar capacidades, verificar su presencia en el artefacto y su respuesta HTTP, y conectar el consumidor V2 a ella. No asumir que la presencia del archivo actual demuestra que el endpoint funciona.

Verificación independiente: [reporte del tester F00](F00-REPORTE-TESTER.md), apartado del manifiesto no registrado, con ocho condiciones estáticas comprobadas. El detalle y los hashes de artefactos están en [verify-f01-manifest-route.json](C:/Users/USUARIO/AppData/Local/Temp/goadmin-website-f00-20260919/verify-f01-manifest-route.json); esa evidencia local permanece en TEMP y no acredita por sí sola el despliegue productivo.

## Base de datos

No requiere migración inmediata. Versionar el documento en memoria/artefactos primero. F03 persistirá el envelope y su `schema_version`. Cualquier nuevo campo en tablas actuales se verifica previamente por MCP y es aditivo. No reemplazar de una vez los JSON de secciones en producción.

## Aceptación y reversión

- [ ] Todas las combinaciones guardadas se leen y vuelven a serializar sin pérdida semántica.
- [ ] Una variante desconocida o demasiado nueva se conserva, se identifica y no se publica de manera incompleta.
- [ ] Cada campo editable está vinculado a validación y efecto renderizado.
- [ ] Presets incluyen contenido, diseño, configuración y referencias a recursos; copiar genera IDs nuevos.
- [ ] Contrato independiente del framework y de secretos; builds de ambos repositorios compatibles.
- [ ] Manifiesto de capacidades registrado como ruta y probado por HTTP; coincidencia explícita entre versión declarada y renderer desplegado.

Activación: lectura adaptada detrás de flag. Reversión: desactivar lectura V2 sin transformar filas antiguas. Entrega: contrato, adaptadores, matriz de variantes y pruebas de compatibilidad.
