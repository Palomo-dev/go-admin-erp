# Objeciones: cierre de frecuencia, evidencia y registro

Fecha: 2026-10-02. Figma: biblioteca `1409:17`, detalle `1410:118018`, consulta móvil en llamada `1410:118600`, sin resultados `1410:835968` y carga `1410:836476`; anotaciones funcionales `1409:1155` y `1410:118599` del archivo `EAvjINVRnlzFM70GVoWXgl`.

## Comportamiento final

- Biblioteca y detalle usan el kit, traducciones es/en/fr/pt, estados de carga/error/vacío/sin resultados y controles de gestión derivados de los permisos del servidor. La ficha de oportunidad conserva el registro de notas y la restauración del foco, con textos traducidos, permiso de edición y reintento de lectura.
- La frecuencia cuenta llamadas distintas de los últimos 90 días, agrupadas por semana en la zona de la organización. Se identifica la objeción por su ID; los registros antiguos sin ID se unen sólo por título exacto. Varias detecciones en la misma llamada cuentan una sola vez.
- El avance exige un cambio histórico posterior al final de la llamada, hacia una posición superior del mismo pipeline de la oportunidad, excluyendo etapas perdidas. El resumen de oportunidades deduplica la misma oportunidad aunque tenga varias llamadas.
- Las respuestas derivadas proceden de una cita atribuida al cliente y el siguiente segmento atribuido al vendedor, en la última transcripción completada. El trabajo diario usa la infraestructura de cron existente, páginas limitadas y presupuesto explícito. Repetirlo no duplica ocurrencias y elimina evidencia que dejó de corresponder al análisis vigente; nunca modifica la respuesta recomendada manual ni invoca proveedores de IA.
- La consulta durante una llamada reutiliza el contexto real del teléfono y el vínculo comercial existente. Registrar y resolver usan una RPC auditada: organización, actor, permiso, sucursal, oportunidad de la ruta y referencias se validan de nuevo en la base. Archivar el catálogo conserva sus enlaces y la evidencia.
- Los enlaces de evidencia abren la llamada histórica mediante su API canónica, independientemente del filtro o página de la lista. `call` debe ser UUID; `start_ms` debe ser entero seguro no negativo. El único reproductor espera los metadatos, limita el salto a la duración y sincroniza la transcripción. Si no hay una cita localizable, se muestra que falta el momento y se omite el parámetro de salto.
- Cambiar de organización borra el catálogo, permisos y overlays. Lecturas y mutaciones antiguas no reintroducen filas de la organización anterior. Un error de consulta no se presenta como cero ni como una lista vacía válida.

## Base y reversibilidad

Esquema, columnas, CHECK, funciones de autorización y permisos caracterizados por MCP en `jgmgphmzusbluqhuqihj`. La tabla nueva es `objection_responses`; las fuentes reales son `call_analyses`, `call_transcripts`, `call_transcript_segments`, `opportunity_stage_history`, `stages` y `opportunity_objections`. El permiso real de visibilidad global de Calls es `crm.calls.view_all`; los miembros activos pueden consultar sus propias llamadas sin inventar otro permiso.

Propuesta aplicada por el coordinador: `20261002064622`, MD5 `78d20664c9e42004a312b492d3b5eca6`; rollback `fae7fb979b4fcd40214c57da7d847ca8`. El rollback quita los puntos de entrada nuevos y conserva las filas derivadas. No se modifican migraciones ya aplicadas.

Gate real en `BEGIN/ROLLBACK`: **26 contratos** verdes. Incluye doble aplicación, doble rollback y reapply conservando IDs y datos exactos; ACL con `SET ROLE authenticated/anon`; rechazo de minería/escritura directa desde el cliente; registro y auditoría atómicos; referencia ajena, límite de notas, versión obsoleta y resolución vinculada a la ruta; conteos deduplicados; avance posterior frente a cambio previo/retroceso/perdida; cita real frente a momento ausente; minería atribuida, idempotencia y retirada de evidencia obsoleta. La verificación externa tras rollback confirmó tabla nueva ausente, funciones nuevas 0 y fixtures 0, antes de la aplicación persistente del coordinador.

El delta de rendimiento `objeciones_rls_uid.sql` convierte las dos lecturas directas de `auth.uid()` de la política en `(SELECT auth.uid())`, preservando su contrato. MD5 propuesta `933debc96eee1b948a8dbafec140dcca`; rollback `dea1f56d65513fe85d6f20ce743ab6aa`. **6 contratos** de comparación real: miembro activo sin `view_all` ve exactamente su fila; actor de otra organización y miembro inactivo ven 0, antes y tras doble aplicación/doble rollback/reapply. ACL intacta y expresión original restaurada, MD5 `18ab068008188c64414d37cb961f056c`; módulo conserva sus cinco funciones y fixtures 0. El coordinador aplicó este delta por separado como `20261002124402` y confirmó que desapareció `auth_rls_initplan`.

## Verificación de código

- **214/214**, 12 suites: modelo, adaptadores RPC, errores de fuente, límites/organización/TZ, permisos y cuerpos de API, biblioteca y ficha en cuatro idiomas, estados y reintento, registro durante llamada, carreras al cambiar de organización, UUID/tiempos y reproductor tras `loadedmetadata`.
- **35/35**, 3 suites adicionales: tareas programadas, cron y regresión de consentimiento de las grabaciones.
- TypeScript focal completo y ESLint de los archivos afectados sin errores ni warnings. Guardarraíl de componentes ≤300 líneas también tras formatear a 100 columnas; accesibilidad y retorno de foco conservados.
- Equipo: cierre final **148/148** en 6 suites, incluido el promedio del equipo; gate SQL 23 documentado en `EQUIPO-TERRITORIOS-PRUEBAS.md`.

Estas pruebas combinan SQL real transaccional con contratos y render en jsdom. No acreditan comparación visual pixel a pixel ni llamadas, correos o cobros reales; no se activaron proveedores ni se desplegó desde este subalcance. No equivalen por sí solas a verificar las 135 pantallas del CRM.
