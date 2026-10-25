# Publicación confirmada del sitio V2

El editor conservaba el estado «1 cambio sin publicar» al convertir una sección sin opciones en su vista editable: la vuelta al documento añadía valores por defecto. Ahora una sección y su SEO sin editar conservan su representación original. Los cambios reales se siguen guardando. Después de publicar, el comparador toma inmediatamente la instantánea publicada como base; las ediciones nuevas durante la publicación permanecen pendientes.

La publicación enviaba una invalidación de catálogo sin esperar respuesta. Ese endpoint no invalidaba el puntero V2 a la revisión publicada: el cambio dependía del cron de outbox y del TTL. Ahora el servidor del ERP espera que todos los despliegues configurados invaliden las etiquetas V2 y confirmen el mismo sitio y revisión mediante su lector público. Mientras tanto, la barra y el diálogo dicen «Publicando…». No se promete un tiempo fijo.

## Despliegue

1. Desplegar primero el cambio de `goadmin-websites` que amplía `POST /api/revalidate`.
2. Verificar que cada origen de `WEBSITES_BASE_URLS` en el ERP apunte al despliegue correspondiente y que comparta `CRON_SECRET` con la tienda. El secreto permanece exclusivamente en el servidor.
3. Desplegar después el ERP. Si falta configuración, hay un origen antiguo, la red falla o el lector sirve otra revisión, la API devuelve 503 con un mensaje explícito. La revisión ya guardada se conserva; publicar otra vez la misma versión es idempotente.
4. El cron `/api/revalidate/sitios-v2` y el outbox existentes permanecen como respaldo.
5. Los sitios sin V2 esperan la confirmación de invalidación estructural al guardar y publicar. No tienen revisiones: su confirmación no afirma un ID de versión. Los ajustes, páginas, categorías y menús llevan etiquetas por organización; publicar una tienda conserva caliente la caché de las demás. La versión de clave `estructura-org-v1` impide reutilizar entradas anteriores sin esas etiquetas.

No se ejecutaron migraciones ni backfills para esta parte. No se cambiaron contenido ni estilos de organizaciones.

## Verificación

- ERP: Jest de `siteDocumentService`, `revalidarPublicacionWeb`, `vistaEditor`, `sitiosV2Routes`, `useSitioV2.publicacion`, `atajosEditor`, `dialogosEditor` y `editorGuardar`.
- Tienda: `node scripts/verify-publicacion-confirmada.cjs` ejecuta el endpoint real con dependencias de caché y lector sustituidas: autenticación, validación, organización y sede, etiquetas y revisión exacta.
- Tienda: `node scripts/verify-cache-estructura.cjs` comprueba aislamiento de caché entre organizaciones, sede, `undefined` frente a `null`, TTL y resolución del argumento de organización en cada wrapper.
- No confundir estas pruebas con una publicación real, capturas ni confirmación visual de una tienda desplegada.

## Reversión

Revertir primero el commit del ERP que exige la confirmación y después, si hace falta, el de la tienda. La ampliación del endpoint es compatible con los avisos antiguos de catálogo, por lo que puede permanecer desplegada. La reversión de código no altera las revisiones guardadas, los borradores ni el contenido publicado. Para volver a un contenido anterior, restaurar y publicar su revisión desde el historial con los permisos normales.

Escape deja el cierre al popover o diálogo abierto y conserva la sección seleccionada y los paneles. Los demás atajos mantienen su comportamiento.
