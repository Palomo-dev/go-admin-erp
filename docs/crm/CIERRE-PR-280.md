# Cierre de revisión del PR 280 — CRM Go Admin

Registro: 3 de octubre de 2026, UTC. [PR 280](https://github.com/Palomo-dev/go-admin-erp/pull/280), rama `feat/crm-flujo-completo`.

La revisión anterior de 50 referencias no cubría el alcance visual solicitado. Este cierre incluye **los 135 IDs del inventario**, con comparación de **132 renders locales de componentes reales** y **tres contratos de interfaz del sistema operativo**. El [registro individual](VERIFICACION-VISUAL-135.md) y su [manifiesto de hashes](VERIFICACION-VISUAL-135.json) identifican las referencias, capturas, fuentes y límites. Las tres notificaciones/menú de Electron necesitan comprobación visual en un sistema operativo real; los contratos no sustituyen esa comprobación.

## Cambios para revisión

- **Sistema visual:** jerarquía, tipografía Inter, espaciado, colores semánticos, controles, tablas, tarjetas, paneles y estados de carga/vacío/error adaptados al manual de Figma. Se reutilizan el kit y el shell existentes con variantes optativas. Las traducciones cubren español, inglés, francés y portugués. Esta ronda conserva los layouts previamente trabajados de Pipeline, Oportunidades, Leads y el encabezado de Clientes.
- **Telefonía web, móvil y Electron:** estados, teclado, permisos, contexto y cierre único de llamada; el resultado se guarda mediante el escritor canónico. La opción «no volver a llamar» queda en la misma transacción que la disposición y el historial. El puente móvil exige organización/sesión vigentes y prueba de inicio de grabación; la caché se separa por organización, usuario y sucursal.
- **Llamadas:** listado de ocho columnas y ficha con audio, notas, transcripción y análisis independientes. La reproducción móvil conserva el segmento real. El polling sólo empieza con una grabación persistida en procesamiento, se cancela al cambiar de contexto y se detiene ante 401/403/404, estados terminales o cinco minutos; permite actualizar manualmente. Una grabación habilitada sin inicio no aparece como trabajo pendiente.
- **Agentes IA y Automatizaciones:** editores completos con borrador, guardado, herramientas obligatorias y prueba en seco sobre la revisión guardada. Los guiones por etapas conservan cambios al navegar. Las métricas agregadas tienen caché y concurrencia limitada y no presentan lecturas parciales como totales. Las plantillas de automatización describen la regla efectiva que entregan al editor.
- **Plantillas y Secuencias:** editor, catálogo, versiones, aprobación y vista de inscripciones usan los motores existentes. El paso actual se resuelve desde `current_step_id` contra el catálogo de la misma secuencia; un paso histórico desconocido permanece sin nombre inventado.
- **Segmentos y Campañas:** constructor de reglas, vista previa y asistente multicanal conectados a los contratos existentes. Las campañas de correo preparan contacto, correo y actividad de forma atómica, verifican permisos y sucursales actuales y mantienen una clave estable por correo ante timeout. Cambios de remitente/contenido o resultados inciertos fuerzan conciliación antes de otro efecto. Los correos manuales asociados a una campaña conservan su recorrido habitual.
- **Referidos y Partners:** formularios, detalle, tablas y acciones comerciales coherentes con el núcleo existente. Los ajustes de comisión requieren permiso administrativo, UUID de intención y recibo auditable; la sugerencia y el importe confirmado quedan separados. Repetir la misma intención no duplica el deal. Registrar una recompensa pagada no ejecuta una transferencia de dinero.
- **Equipo, Objeciones, Salud e Identidades:** filtros, selección, asignación, catálogo, detalle, configuración y estados móviles adaptados sin inventar estadísticas. Las alternativas de objeciones siguen siendo un borrador que requiere Guardar. La fusión conserva campos editables, errores y auditoría del motor actual.
- **Pronóstico:** usa la tabla aprobada `stages` y su `probability` como porcentaje. El mensual lee el alcance completo y las categorías distinguen una oportunidad abierta al 100 % de una venta ganada. Los ajustes y metas trimestrales conservan su período.

## Verificación de este cierre

| Comprobación | Resultado actual |
| --- | --- |
| Jest global UTC | 18.906 casos y 1.118 suites aprobados; ocho casos y una suite omitidos existentes. Salida 0, 124,856 s. |
| TypeScript global | Salida 0 después de los últimos ajustes; Node 24.19.0, heap 8192. |
| ESLint del delta | 240 archivos TypeScript/TSX, cero errores y advertencias. |
| Matriz de fechas | 809 casos y 26 suites por zona; UTC, Bogotá, México, Madrid, Santiago y Katmandú aprobadas. |
| Build de publicación | Salida 0, 367 páginas estáticas; copia filtrada como Vercel, Next 15.5.9 / Node 24.19.0 / heap 6144. Código de producción idéntico por SHA-256 a la fuente final; sólo documentos se completaron después. |
| Figma | 135 IDs inventariados individualmente; 132 PNG comparados y tres contratos OS; cero sesión autenticada. Sin referencias faltantes, duplicadas, hashes inconsistentes ni errores de ejecución inesperados. |

Jest conserva un aviso de worker forzado a cerrar tras finalizar, y las advertencias de npm/deprecación de cifrado de las pruebas. La compilación registra las advertencias conocidas de configuración/runtime y del parche opcional SWC. Estos avisos no se presentan como corregidos.

La evidencia visual usa datos sintéticos y transportes simulados en los componentes reales; no contiene una sesión CRM autenticada ni acredita entrega de correo/WhatsApp, llamadas externas o dispositivos físicos. Doce referencias usadas tienen export reducido y conservan también el hash/dimensiones del export canónico. Los deltas de fuente posteriores a una captura se documentan por separado, sin sustituir hashes históricos ni afirmar igualdad píxel a píxel.

## SQL compatible aplicado en esta ronda

Aplicación exclusiva por MCP, con SQL exacto y rollback en el mismo cambio. Las comprobaciones DDL/catálogo no invocaron RPC comerciales ni crearon clientes, llamadas o envíos de prueba. No se activaron las 59 policies restrictivas pendientes.

| Versión real | Cambio | SHA-256 SQL | SHA-256 rollback |
| --- | --- | --- | --- |
| `20261002230703` | Disposición y baja humana atómicas | `c14fc62039d195fae12cdf73c2409fe63185fc2859db00d5719972003e9e25c3` | `bb117458092a09c76d86f0fa1a01b233f5c2a1b14968b776a3d502d4473a6401` |
| `20261002233747` | Deal y comisión auditables | `736431a099c5ba028be7734f18c58e24780942a56a8a1eba144fa93ea4bf20c8` | `f229cce21119ed5465f8ed9a27043a73a6462ce9c06c343304f7688f7d52b0b1` |
| `20261003000008` | Puente atómico de campañas de correo | `d3c71bcc1f56a0d4ba74e5824ed4d02365e1a674e1d62ac39deccae30f0a1a81` | `5c6712bb4809d3691805b5bd4052ab50096ed910bc74af4f27eea05900b76529` |

La RPC de disposición autenticada conserva autorización interna. Las RPC de comisión y campañas son exclusivamente de servicio, con organización validada y `search_path` explícito; se verificaron los grants posteriores. La conciliación de correo evita bloquear/reescribir recibos terminales idénticos; el conteo canónico todavía lee los contactos de la campaña. El rollback de comisiones/correo conserva recibos e historia publicados y exige revertir el runtime coordinadamente.

## Publicación e integración real

El código del PR y sus checks se distinguen del despliegue coordinado de producción. El conector Vercel devuelve 403 por alcance de equipo, no por el rol administrador dentro del ERP; todavía no se acredita configuración del secreto de callbacks en Next y WS ni publicación de ambos consumidores desde este cierre. Railway conserva un runtime anterior y cambios staged; el usuario identificó su cambio manual como `VOICE_CALLBACK_SECRET`.

Las restricciones de Secuencias15, Calendario9 y llamadas/derivados/tags/Storage35 se activan después de publicar y acreditar los escritores compatibles y retirar clientes/réplicas anteriores. Las guardas compatibles de Secuencias ya están aplicadas; este orden no requiere una nueva autorización del usuario.

Quedan por acreditar la sesión real con organización elegida, el recorrido contra proveedores y los dispositivos. El dominio de correo verificado no prueba un envío desde el CRM. El Portal del partner sigue definido como propuesta sin backend/enlace revocable; SMS y algunas condiciones de salida/planificación de Figma no existen en el motor de Secuencias. Los [límites por módulo](VERIFICACION-VISUAL-135.md) explican esas diferencias funcionales sin presentar controles inertes como capacidades disponibles.

## Incidentes comprobados


**Supabase:** las pruebas de API de Actividades de la fase 59 provocaron 52.811 errores `40001` entre el 1 de octubre, 20:40:47.325 y 20:49:35.511 en America/Bogota. Una colisión deliberada de clave se había clasificado como serialización transitoria y PostgREST multiplicó las transacciones. Los scripts eran finitos; la inspección local posterior encontró cero procesos vivos ejecutándolos. La corrección inicial permitió devolver 409. La revisión posterior encontró otros **17 RAISE deterministas en nueve RPC** y los cambió a `P0001`, mapeado por la API a 409.

Ese delta está aplicado por MCP como **`20261002131611`**, SQL MD5 `f1761fc00b6173ad2696f340d1d38618`, rollback `89ef8a680f9246785838b7ee85539902`. Pasó 98 aserciones acotadas en 1,9 segundos, sin invocar RPC comerciales ni HTTP. Conserva cuerpos salvo SQLSTATE, permisos, propietario, search_path y defaults; sólo normaliza posiciones del parser al comparar el AST de defaults. El guardrail estático impide nuevos RAISE manuales de serialización y admite las migraciones históricas únicamente por hash exacto. Su rollback técnico reintroduce el defecto y no sirve como recuperación de producción.

La prueba pesada de historial con agregaciones globales y locks a las 04:14 UTC precedió a errores de Realtime desde las 04:16 UTC. Puede haber contribuido a la carga o los bloqueos; faltan métricas históricas para demostrar causalidad. Se retiraron las agregaciones globales. El detalle y la atribución parcial de los errores posteriores constan en `INCIDENTE-SUPABASE-2026-10-02.md`.

**Railway:** el despliegue de `master`, commit `edba4148`, falló el 1 de octubre a las 18:54 de Bogotá: el servidor de voz no pudo cargar `resend` y no superó `/health`. El commit fallido no incluía esa dependencia en `ws-server/package.json`. Railway acredita un despliegue posterior **SUCCESS**, commit `e892e819`, creado a las 19:25 de Bogotá; su mensaje indica la incorporación de ese paquete. La consulta fue sólo de lectura, con una recuperación acotada de logs. Sin el correo original no se asegura que ese fallo sea exactamente el aviso recibido. El historial no acredita un despliegue de los cambios finales locales de este PR.
