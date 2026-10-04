# Salud CRM · lectura y pantallas

Fuente Figma revisada: archivo `EAvjINVRnlzFM70GVoWXgl`, panel `1415:19`, factores `1424:932`, detalle `1424:17`, vacío `1424:840685`, carga `1424:841103`, móvil `1424:841631`. Se revisó la anotación `1424:1606` antes de implementar el editor. Los ejemplos de clientes, montos y cinco factores del diseño no se persistieron: se presentan los indicadores reales configurados por organización.

`healthScoreService` es una fachada de fetch. `GET /api/crm/health` y `GET /api/crm/health/[customerId]` resuelven organización y permiso `crm.customers.view` en el servidor; `healthReadService` verifica `app_branch_access(integer)` y conserva errores de lecturas principales. Una falla del historial se devuelve como `trend_error` o `history_error` y tiene reintento independiente; no se representa como ausencia de datos.

`can_manage` resuelve `hasOrgAdminOrPermission(ctx)` en servidor, incluido `admin.full_access`; un fallo deniega. `can_measure` conserva la resolución de `crm.customers.edit` y no depende del permiso administrativo.

El editor usa la configuración cruda (con peso cero para factores desactivados), la validación compartida `healthFactorConfigSchema` y control de concurrencia `expected_updated_at`. La vista previa ejecuta `healthBands.scoreFromConfig` sobre el último snapshot guardado. Los puntajes y bandas del panel y del servidor reutilizan `composeHealthResult`. Los umbrales no se duplican. El total de pesos activos debe ser 100 y el límite saludable debe ser mayor que el de observación. La banda roja persistida continúa en cero.

Guardar y recalcular solicita una cola persistida al backend; la UI informa aceptación, sin simular que el trabajo terminó. La propuesta SQL, el escritor transaccional snapshot/puntaje y el consumidor del trabajo corresponden al backend de Salud y requieren su gate coordinado. Este cambio de UI no aplica DDL.

Las acciones de llamada, WhatsApp y tarea abren `AccionesRapidasCrm`, conservando consentimiento y los validadores existentes. Fechas de mediciones usan la zona de la organización y el idioma activo; montos usan la moneda de la organización. El exportador del listado aplica comillas CSV y neutraliza fórmulas. Todos los componentes de Salud quedan por debajo de 300 líneas y usan tokens semánticos y piezas del kit. El anillo y la tendencia son SVG calculados con mediciones reales y tienen etiquetas accesibles y tabla alternativa.

Validación focal: pruebas de fachada fetch, validación de factores, scoping por organización/sucursal, aislamiento de fallo de historial, render con proveedor real Intl en cuatro idiomas, conflicto de edición, respuesta tardía tras cambio de organización, navegación con teclado y regreso de foco. No se ejecutan proveedores, llamadas ni fixtures en datos reales. Las traducciones se entregaron al coordinador en `/tmp/health-i18n-{es,en,fr,pt}.json`; éste integra los archivos `messages`.
