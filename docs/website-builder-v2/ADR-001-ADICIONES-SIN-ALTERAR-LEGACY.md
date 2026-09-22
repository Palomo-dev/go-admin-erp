# ADR-001 — Añadir V2 conservando estructura y ventas actuales

Estado: decisión de diseño vigente por instrucción explícita del usuario; implementación pendiente. Fecha: 2026-09-19.

## Contexto

El usuario exige solo mejoras aditivas y conservar las páginas activas que venden. Eligió trabajar con la base de producción y eliminó la branch de ensayo. La auditoría MCP confirma `UNIQUE (organization_id)` en `website_settings` y `UNIQUE (organization_id, slug)` en `website_pages`. Las consultas globales y relaciones anidadas de ambos proyectos dependen de esa cardinalidad; también checkout y servicios ajenos al editor.

Las tablas actuales tienen políticas de lectura anónima amplias. Una prueba de lectura con rol `anon` contó 1.064 páginas visibles, incluidas 7 no publicadas, sin extraer contenido. No se debe guardar en ellas un borrador V2 que se anuncie como privado.

## Decisión

1. Conservar tablas, columnas, restricciones, filas y políticas legacy durante esta ampliación. No retirar UNIQUE ni cambiar el significado de los JSON actuales. No reutilizar servicios que borren páginas para aplicar una plantilla.
2. Añadir almacenamiento V2 separado: estado del sitio, borrador y revisiones completas, con organización, alcance global/outlet y políticas propias. Nombres y estructura final se verifican en F02/F03; esta decisión no aplica SQL.
3. Leer legacy para construir un documento en memoria o un borrador nuevo, sin escrituras de vuelta. Las páginas de outlets V2 viven dentro del documento del sitio; no insertarlas en `website_pages` para eludir su unicidad.
4. Una FK nueva a organizaciones o sucursales puede añadir relaciones detectables por PostgREST. Verificar ambigüedad, cascadas y dependencias antes de aplicar, aunque se conserven los UNIQUE. "Aditivo" no significa "sin riesgo".
5. Fijar ámbito en servidor. Los documentos no autorizan por sí mismos acceso a entidades, recursos o sucursales. Un UUID válido de otra organización sigue siendo inválido para el sitio solicitado.
6. Separar capacidades de presentación y operación. Los documentos V2 no sustituyen precios, impuestos, existencias, pedidos, pagos ni reservas; siguen usando los servicios operativos actuales.
7. Activar V2 expresamente por sitio y solo con un renderer compatible. Antes de habilitar la lectura V2, la aplicación pública mantiene la ruta legacy. La desactivación no borra datos nuevos ni exige revertir restricciones antiguas.
8. Elegir una sola fuente de presentación por respuesta: legacy o revisión V2. No combinar un footer nuevo y una portada antigua por fallos parciales. La estrategia de último snapshot válido y fallos de lectura debe definirse y probarse antes del despliegue.
9. Distinguir recuperación del sitio global adoptado y del outlet creado solo en V2. El primero puede volver a su publicación legacy preservada. El segundo no tiene ese respaldo: mantener su última revisión V2 válida y, si está despublicado o no hay ninguna revisión válida accesible, responder sitio no publicado/404. No caer silenciosamente al hotel u otra sucursal. La caché y el resolver deben respetar la despublicación.

## Consecuencias y límites

- Se añade almacenamiento de presentación, no una implementación paralela de ventas o reservas.
- Las importaciones necesitan pruebas de ida/vuelta, aliases y campos desconocidos, y no pueden sembrar plantillas sobre sitios existentes.
- El editor existente permanece disponible para sitios legacy. Al adoptar V2, el nuevo flujo debe impedir escrituras que omitan su borrador sin modificar el comportamiento de quienes no lo adoptaron.
- El caso de coexistencia con checkout necesita una integración acotada: conservar sus parámetros comerciales legacy mientras la presentación del sitio adopta V2. El cambio de shell no autoriza modificar la lógica del checkout.
- No se hacen pruebas destructivas ni operaciones reales de compra/reserva para demostrar compatibilidad. Pruebas locales con fixtures no certifican por sí solas una migración real.
- Hallazgos de seguridad anteriores se registran por separado. No se revocan permisos globales a ciegas durante esta fase; tampoco se replica su política en las tablas nuevas.
- Se descarta el reemplazo de UNIQUE contemplado inicialmente en F02. Esta decisión y la instrucción del usuario prevalecen sobre esas propuestas históricas.

## Entrega verificable

Antes de una activación: hashes de archivos críticos protegidos, migración aditiva revisada, SQL/rollback exactos, pruebas de contrato, prueba de aislamiento, renderer compatible, comparación del sitio legacy, verificación de consultas y caché y recuperación ensayada al nivel permitido. Ninguna casilla se considera cumplida por la mera existencia de este ADR.
