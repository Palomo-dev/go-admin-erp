# Fase 03 — Borradores, revisiones y publicación atómica

Estado: pendiente; **etapa 1, se ejecuta junto con F02**. Depende de F01. Esquema fijado en [ADR-002 D1](ADR-002-DECISIONES-Y-SECUENCIA.md); RPC `publish_site_revision`. Resultado: editar nunca cambia lo publicado hasta ejecutar la publicación del sitio.

## UX y componentes

`EditorHeader.tsx` presenta «Cambios locales», «Guardando», «Borrador guardado», «Conflicto» y «Publicado». Separar Guardar borrador, Vista previa y Publicar. Antes de publicar mostrar el alcance: páginas, identidad, menús y recursos modificados. El alcance inicial de publicación es **el sitio completo**; una publicación parcial necesitaría otro contrato y no debe aparecer como opción falsa.

Crear panel de historial de revisiones con fecha en timezone de la organización, autor autorizado y resumen. Restaurar genera un nuevo borrador desde una revisión anterior y permite revisarlo antes de publicarlo. Cambiar de página no borra pendientes silenciosamente. Cerrar durante una falla de guardado conserva cambios recuperables.

## Backend y contrato propuesto

Añadir un servicio de documentos del sitio, propuesto en `src/lib/services/website/siteDocumentService.ts`, y un flujo de editor V2 con su propio guardado. Conservar `websitePageBuilderService.ts`, sus firmas y el `handleSave` legacy para los sitios no adoptados; el importador V2 solo lee los datos anteriores. Todas las altas/bajas/reordenamientos V2 operan sobre el borrador y no llaman escritores de secciones vivas. La integración para un sitio expresamente adoptado debe dirigir su edición al flujo nuevo o rechazar una escritura legacy con explicación; esa condición no cambia cómo guardan los sitios que continúan en legacy.

API administrativa propuesta, con contexto de sesión en cada handler:

| Operación | Contrato |
|---|---|
| `GET /api/website/sites/{siteRef}/draft` | Documento, revisión base, versión del borrador y ETag |
| `PATCH /api/website/sites/{siteRef}/draft` | Cambios validados y versión esperada; respuesta con nueva versión |
| `POST /api/website/sites/{siteRef}/publications` | Versión esperada e idempotencia; crea publicación consistente |
| `GET /api/website/sites/{siteRef}/revisions` | Historial paginado sin datos operativos privados |
| `POST /api/website/sites/{siteRef}/restorations` | Revisión visible del mismo sitio → nuevo borrador |

Errores homogéneos `error.code/message/details`. 401 sin sesión, 403 sin permiso, 404 recurso no visible, 409 conflicto, 422 documento inválido. `siteRef` no es prueba de autorización.

- F03-01. Autoguardado con debounce, reintentos acotados y compare-and-swap. Dos pestañas no sobrescriben contenido: la segunda recibe conflicto y ofrece recargar o recuperar cambios.
- F03-02. Publicar con RPC transaccional: validar permisos/alcance/versión, bloquear el estado del sitio, insertar revisión inmutable, actualizar puntero público y anotar evento de invalidación. No usar una cadena de delete/upsert desde Node.
- F03-03. Snapshot completo de presentación: identidad, tokens, header/footer, `menus[]` del documento (ADR-002 D3), SEO, páginas, secciones y recursos. Las entidades de negocio permanecen referenciadas y se consultan con contexto autorizado.
- F03-04. Invalidación idempotente mediante outbox/reintento. Si falla el CDN después del commit, mostrar «publicado; actualización de caché pendiente», no deshacer parcialmente el snapshot. Cada render captura una revisión única para toda su presentación.
- F03-05. Migrar a V2 copiando el estado actual a una revisión inicial y un borrador, de manera idempotente y sin borrar legado. Congelar la herencia efectiva en cada publicación; detectar cambios del padre y proponer actualización en el borrador hijo.

## Base de datos propuesta

Añadir almacenamiento V2 según ADR-001, conservando las tablas actuales: `website_site_states` (alcance y punteros), `website_site_drafts` (documento/versionado optimista), `website_site_revisions` (snapshot inmutable) y outbox de publicación reutilizado o específico. **Nombres fijados por ADR-002 D1**; columnas en la migración de la etapa 1, con `.sql` y rollback en el ERP. La verificación F00 encontró lectura anónima amplia en `website_pages`; no reutilizar su `draft_content` como borrador privado V2. El versionado actual se conserva para legacy, sin migración destructiva.

Cada tabla de tenant lleva organización, alcance de sitio, FK consistentes, índices para lectura/historial, RLS y restricciones de tamaño/versión. Una fila de estado por sitio, incluido global NULL. La RPC no confía en la organización recibida; comprueba membresía y permisos. Si usa elevación, `search_path` controlado, privilegios mínimos y revocación de ejecución pública. La lectura pública solo obtiene el DTO de presentación publicado.

## Aceptación y recuperación

- [ ] Añadir/borrar/cambiar header en borrador no altera ninguna respuesta pública.
- [ ] Fallo inyectado antes del commit deja revisión anterior íntegra; doble petición de publicación no duplica efectos.
- [ ] Dos editores simultáneos producen conflicto visible, no pérdida silenciosa.
- [ ] Restaurar no borra historia y recupera todos los elementos de presentación anunciados.
- [ ] Fallo de invalidación se recupera sin mezclar menús nuevos con páginas viejas.
- [ ] Un sitio global adoptado puede volver a legacy preservado; un outlet solo V2 recupera una revisión propia y no hereda accidentalmente la portada pública global al fallar.

Revertir a una revisión compatible previamente publicada; conservar borradores/revisiones nuevos. Revertir código únicamente a una versión que comprenda los snapshots existentes. No borrar tablas para volver al editor anterior.
