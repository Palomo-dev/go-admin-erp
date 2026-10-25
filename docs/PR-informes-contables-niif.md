# Informes contables NIIF por organización

Los nuevos informes agregan comparativos, conciliaciones y borradores tributarios sobre una fuente de asientos contabilizados. El mayor carga todas las cuentas sin exigir una selección. Las diferencias de patrimonio, efectivo e inventario se muestran y se conservan al exportar; no se generan ajustes automáticos para ocultarlas.

Base: `main` (`7c789de2653a00181e36c7ad8d70c7d2d8c2665b` al crear la rama). Rama: `codex/informes-contables-niif`. [PR #460](https://github.com/Palomo-dev/go-admin-erp/pull/460) en borrador contra `main`, sin merge. `master` no se modificó.

## Cambios

- Estado de situación financiera y estado de resultados integral con el mismo periodo del año anterior, variación en pesos y porcentaje. ORI desde auxiliares de 38 marcados expresamente.
- Estado de cambios en el patrimonio, grupos 31–38, con utilidad del mismo motor de resultados y conciliación contra el balance.
- Flujo indirecto con depreciación y deterioro desde créditos de las acumuladas, movimientos de capital de trabajo, inversión y financiación, y diferencia contra efectivo y equivalentes. El flujo existente se conserva como directo.
- Notas editables por organización, detalle PUC a cuatro o seis dígitos, certificación del artículo 37 de la Ley 222 de 1995 y dictamen opcional del artículo 38 suministrado por su autor. Generar el documento no firma por sus titulares.
- Mayor consolidado por nivel PUC, auxiliares por cuenta y por centro de costo con saldo corrido, inventarios y balances de clases 1–3, kárdex ponderado por producto/sede y conciliación contra auxiliares de 1435.
- Indicadores comparativos, clasificación corriente/no corriente desde el PUC existente, punto de equilibrio y contribución por producto cuando las fuentes históricas permiten identificarla.
- Borradores de IVA 300 por tarifa histórica de factura, 350, ICA municipal, reteICA separado, exógena con parámetros por año y certificado 220 desde nómina. El certificado a proveedores extiende el flujo canónico existente con modo contabilizado, fechas exactas, sucursal, centro de costo y comparativo.
- Bases preliminares de conciliación fiscal 2516/2517, informe de gestión, registro de accionistas por organización y aportes PILA, con advertencias sobre información pendiente.

Las entradas están en Finanzas → Contabilidad y Reportes → Contabilidad. Los nuevos informes usan organización de la sesión, permisos en servidor, corte/rango, sucursal y centro de costo en la fuente contable, fechas de la zona de la organización y comparativo del año anterior. Las anulaciones y restauraciones se aplican según cada corte histórico.

Los informes anteriores conservan sus cálculos y valores predeterminados; el mayor se sustituye por la vista consolidada solicitada y conserva inicio anual y nivel auxiliar. La configuración nueva no se guarda al abrir o navegar. Sin configuración, los nuevos estados usan grupo 2 y plantillas predeterminadas; no se reclasifican cuentas ni se marcan ORI o equivalentes por backfill. Grupo 3 presenta situación financiera, resultados y notas sin ORI; patrimonio es opcional.

Los informes en COP presentan pesos enteros y conservan precisión interna. Otra moneda base se identifica con su código, sin convertirla con un cambio actual. Se puede generar un solo PDF con los estados requeridos por el grupo. Advertencias, diferencias y datos faltantes se conservan también en PDF y Excel.

## Trabajo previo reutilizado

Se revisaron los PR y su presencia en la base antes de implementar:

| PR | Reutilización y alcance de esta rama |
| --- | --- |
| [#397](https://github.com/Palomo-dev/go-admin-erp/pull/397), [#399](https://github.com/Palomo-dev/go-admin-erp/pull/399) | Se conserva la infraestructura contable y la configuración existentes. No se repiten sus migraciones ni siembras. |
| [#402](https://github.com/Palomo-dev/go-admin-erp/pull/402) | Se reutilizan niveles PUC y convenciones de libros/auxiliares. Se agrega el mayor consolidado porque el anterior exigía cuenta y limitaba el detalle. |
| [#450](https://github.com/Palomo-dev/go-admin-erp/pull/450) | Se reutilizan normalización de códigos, jerarquía por prefijos y `chart_of_accounts.presentacion_niif` como única clasificación corriente/no corriente. No se crea una segunda columna de clasificación. |
| [#269](https://github.com/Palomo-dev/go-admin-erp/pull/269) | Se reutilizan las entradas del visor de Reportes v2. El nuevo exportador atiende documentos compuestos y el paquete de estados. |
| [#265](https://github.com/Palomo-dev/go-admin-erp/pull/265) | Se conserva su cálculo, consecutivo, idempotencia y archivo. Se agregan sobrecargas opcionales del helper y las RPC canónicas para el modo contabilizado y los filtros nuevos, sin un segundo motor. Las firmas anteriores conservan JSON y cálculo para usuarios autorizados; su lectura consolidada ahora exige alcance sobre todas las sucursales. |
| [#456](https://github.com/Palomo-dev/go-admin-erp/pull/456) | Revisado como PR abierto. No se fusionó ni se duplicaron sus correcciones de asientos vacíos/defaults de caja. |

## Presentación

Las pantallas nuevas reutilizan `src/components/kit` y el sistema de diseño Figma [GO Admin — Sistema de diseño](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl): página 01 Sistema y 02 Componentes. Se consultaron contexto y capturas de tipografía `6:142`, Button `9:343`, PageHeader `109:4573`, DataTable `106:4777` y FormField `50:2685`.

La interfaz espera la zona horaria antes de inicializar fechas y conserva filtros en los enlaces de detalle. El resumen de reportes también usa la zona de la organización al mostrar fechas. Las bases de preparación cambian con el grupo si aún contienen el valor predeterminado; se conservan textos personalizados, incluidos vacíos intencionales. El guardado comprueba versión para evitar sobrescribir una edición concurrente y exige permiso de lectura además de autorización para modificar configuración. Un cambio de organización aborta consultas, descarta ediciones y bloquea respuestas o exportaciones de un snapshot anterior; lectura y guardado llevan el identificador de organización que el servidor contrasta con la sesión.

Verificación Chromium con componentes, kit e Inter del bundle productivo: 14 comprobaciones y [12 capturas en escritorio/celular](evidencia/informes-niif/README.md), con datos sintéticos. Se usaron API y contextos simulados; no corresponde a una sesión autenticada real del ERP.

## Base de datos: qué se ejecutó

Se verificó el esquema real y se aplicaron las migraciones exclusivamente por MCP de Supabase, proyecto `jgmgphmzusbluqhuqihj`.

### Configuración y anulaciones de informes

- Migración registrada: versión `20261024164238`, nombre `informes_niif`.
- SQL exacto: [supabase/migrations/20261024164238_informes_niif.sql](../supabase/migrations/20261024164238_informes_niif.sql).
- MD5 del archivo y de `schema_migrations.statements[1]`: `d1663299b5e8bfa3659bfb6fb2323024`.
- Rollback versionado: [supabase/rollbacks/20261024164238_informes_niif_rollback.sql](../supabase/rollbacks/20261024164238_informes_niif_rollback.sql).

La migración crea `financial_report_settings`, `financial_report_account_metadata` y `financial_report_config_audit`, con RLS. Agrega la RPC transaccional `fn_guardar_configuracion_informes(integer,jsonb)` para guardar configuración con permiso `finance.approve`, control de versión y auditoría; y `fn_informes_anulaciones(integer,timestamptz)` para consultar anulaciones con sesión, permiso de lectura y alcance de sucursales. No concede escritura directa a `authenticated` ni ejecución de estas funciones a `anon`.

Antes de aplicar se ejecutó el SQL completo dentro de `BEGIN`/`ROLLBACK`, con comprobaciones bajo rol autenticado: una organización ajena permanece invisible por RLS; el guardado autorizado incrementa versión; una versión obsoleta se rechaza; guardar en otra organización y escribir directamente en tablas se rechazan; `anon` no ejecuta las RPC. Toda esa prueba se revirtió.

Después se ejecutó `apply_migration` y se verificaron versión, hash, RLS y permisos. Las tres tablas quedaron en **0 filas**: no se ejecutó backfill ni se modificaron asientos o saldos históricos. Los asesores de seguridad no reportaron hallazgos nuevos relacionados con las tablas `financial_report_*`; permanecen hallazgos previos del proyecto fuera de este alcance.

La migración no cambia `chart_of_accounts.presentacion_niif`. La RPC solo lo actualiza cuando el usuario cambia expresamente esa clasificación; editar únicamente ORI, costo o plazo no la sobrescribe.

### Certificado de retenciones contabilizado

- Migración registrada: versión `20261024194901`, nombre `certificado_contabilizado`.
- SQL exacto: [supabase/migrations/20261024194901_certificado_contabilizado.sql](../supabase/migrations/20261024194901_certificado_contabilizado.sql).
- MD5 del archivo y de `schema_migrations.statements[1]`: `986dcda5d237ec1bbf06c5c4c77944be`.
- Rollback: [supabase/rollbacks/20261024194901_certificado_contabilizado_rollback.sql](../supabase/rollbacks/20261024194901_certificado_contabilizado_rollback.sql), MD5 `02882ad469048da0396352e6f9214e70`.

Extiende las funciones canónicas de retenciones, cálculo del certificado y expedición mediante sobrecargas con filtros opcionales. El modo nuevo usa solo asientos contabilizados, corte histórico de anulaciones/restauraciones, sucursal y centro de costo. Mantiene el mismo motor de consecutivos, archivo e idempotencia; la foto nueva conserva filtros y moneda base para reimpresión.

La nueva `fn_certificado_retenciones_acceso(integer,jsonb)` protege las RPC y la política de lectura de `withholding_certificates`. Un certificado anterior es consolidado, aunque tuviera una sucursal decorativa; leerlo exige alcance sobre todas las sucursales. Las firmas anteriores conservan JSON y cálculos para usuarios autorizados, con esta corrección de acceso.

Antes de aplicar se probaron dentro de una transacción revertida: JSON anterior idéntico antes/después, exclusión de borradores, rechazo de centro ajeno, expedición repetida con el mismo identificador, ausencia de ejecución para `anon` y lectura por UUID invisible para un usuario activo de otra organización. El corte temporal conserva la retención antes de anular, la excluye durante la anulación y la recupera al restaurar, incluido el caso de clon de restauración. Esa prueba no dejó certificados ni consumió consecutivos permanentes.

Se aplicó por `apply_migration` y se comprobaron versión, hash y permisos. `anon` no ejecuta la vista previa ni la guarda de acceso; `authenticated` ejecuta la vista previa y no el helper privado de filas. Después de las pruebas quedaron en cero las configuraciones, metadatos y auditorías nuevas, los certificados del modo nuevo y las facturas temporales de QA. No ejecuta backfill ni reescribe certificados archivados o asientos históricos. Revisión independiente de SQL, HTTP, expedición/reimpresión y RLS: 9.6/10, acotada a esas comprobaciones.

El asesor de seguridad señala `authenticated_security_definer_function_executable` en las RPC públicas de este alcance. Esa ejecución es intencional: las funciones comprueban sesión, membresía activa, permisos y sucursales, con negativos reales de otra organización. Los helpers de cálculo siguen privados y `anon` no ejecuta las RPC. El aviso no se silenció ni se presenta el proyecto completo como libre de advertencias.

## Cómo revertir

1. Restaurar primero el código previo de la aplicación, para que deje de consultar las tablas y RPC nuevas.
2. Exportar las tres tablas `financial_report_*` si ya hubo uso. El rollback elimina notas, firmantes, marcas ORI/equivalentes/costos, parámetros fiscales, anotaciones y auditoría guardados después de la instalación.
3. Ejecutar primero por MCP el contenido exacto de `supabase/rollbacks/20261024194901_certificado_contabilizado_rollback.sql`. Restaura las funciones anteriores y la política de lectura; conserva certificados, fotos de filtros y consecutivos. La política previa vuelve a permitir lectura por pertenencia activa a la organización, sin la nueva restricción de sucursal: revertir este endurecimiento tiene esa implicación de acceso.
4. Ejecutar después por MCP `supabase/rollbacks/20261024164238_informes_niif_rollback.sql`. Elimina las dos RPC de informes y luego auditoría, metadatos y configuración. No modifica asientos ni saldos.
5. Las ediciones explícitas de `chart_of_accounts.presentacion_niif` son datos posteriores del usuario y no se revierten automáticamente. Si se desea deshacerlas, revisar el antes/después exportado de `financial_report_config_audit` y preparar una reversión específica.

No ejecutar propuestas de backfills anteriores ni `supabase db push` como parte de esta reversión.

## Validación y límites pendientes

- Última ejecución integrada registrada: **29 suites, 324/324 pruebas**, incluidos motores nuevos, fuentes, API, configuración, interfaz y motor/rutas/reportes de retenciones existentes. Incluye patrimonio contra balance, flujo contra efectivo/equivalentes, kárdex contra 1435, grupos NIIF, rechazos de permisos/filtros, errores de inventario, moneda y cambio de organización. Los tests HTTP usan fuentes simuladas; las pruebas de RLS/RPC se ejecutaron en la base real dentro de transacciones revertidas. Revisión independiente HTTP y de guardia cliente: 9.6/10, acotada a sus comprobaciones documentadas.
- ESLint de **77 archivos nuevos/modificados**, con `--max-warnings 0`, y TypeScript focal con `npx tsc --noEmit -p tsconfig.informes-contables.json` en verde. Se generaron y leyeron archivos PDF/XLSX reales, incluido un paquete de seis documentos. La suite conserva advertencia de handles abiertos y usa `--forceExit`; no se afirma haber resuelto ese comportamiento del entorno de pruebas.
- Guardrails y zona horaria: **28 suites, 853/853 pruebas en UTC y 853/853 en America/Bogota**, después de retirar el literal de moneda del rótulo de la interfaz sin ampliar allow-lists.
- TypeScript global `npx tsc --noEmit -p tsconfig.json` pasó sobre el código final con heap de 12 GB, después de agregar la guarda de `pathname` nullable detectada por Next 15 en `useConfiguracionState`. El build de producción pasó con `NEXT_SKIP_TYPECHECK=1`, como el despliegue, y `NODE_OPTIONS=--max-old-space-size=12288`: compiló, generó las 369 páginas estáticas y terminó de optimizar/trazar las rutas, incluidas las cuatro API y las dos pantallas nuevas. Los tipos globales y ESLint se comprobaron por separado; no se silenciaron errores para declararlos aprobados.
- La ejecución Jest global con `--bail` se detuvo en `integracion-f2.test.ts` de POS: el mock previo no implementa `q.range`. Alcanzó seis suites (cinco pasaron, una falló) y 445 pruebas (421 pasaron, 17 fallaron y siete se omitieron). Los archivos implicados no se modifican en esta rama; no se declara verde la suite global.
- No se ha recorrido la interfaz con una sesión autenticada en navegador. Las 14 comprobaciones de Chromium con API/contextos simulados no sustituyen esa validación.
- `stock_movements` no ofrece asignación fiable por centro de costo. Con ese filtro, los libros contables sí se filtran, pero se omiten kárdex físico y conciliación de inventario y se explica el motivo. La conciliación por sede está implementada; no se compara inventario global con un saldo parcial de 1435.
- Si el historial de inventario contiene cantidades, costos o identificadores no verificables, se omiten kárdex, conciliación y contribución que dependan de él, con advertencia. Los estados contables siguen disponibles. Los errores de consulta o red se propagan; no se convierten en un inventario de costo cero ni en un historial aparentemente completo.
- Los indicadores no convierten saldos de cartera o proveedores en ventas a crédito o compras. Usan fuentes históricas vinculadas; bases faltantes o monedas sin conversión histórica se advierten. El equilibrio no suma unidades incompatibles ni distribuye gastos comunes por producto sin método configurado.
- Una venta de activos sin cobro identificable se advierte. El flujo permite anotar la actividad de cobros posteriores identificados y muestra la diferencia si no cuadra.
- Los borradores tributarios requieren revisión del contador. Si una factura no conserva la tarifa histórica o la distinción exento/excluido, se avisa; no se sustituye con la tarifa actual del producto.
- Los formularios colombianos usan la moneda de la jurisdicción desde el helper canónico. Si la moneda base de la organización es distinta o no está verificada, se omiten sus tablas y se explica que falta conversión histórica; no se etiquetan cifras extranjeras como pesos. Esta omisión afecta también los documentos preliminares de gestión y registro del paquete tributario actual.
- El certificado a proveedores nuevo exige asientos contabilizados y aplica el corte histórico de anulaciones/restauraciones. Las retenciones manuales sin base/tarifa verificables se muestran como pendientes y bloquean expedición; las asociaciones contables ambiguas o una conversión histórica no verificable se rechazan. Los certificados ya archivados no se reescriben.
- La tanda 3 entrega bases preliminares: la conciliación fiscal aún requiere distribuir diferencias en casillas del formato vigente; PILA requiere IBC, días, administradoras y novedades completas. No genera archivos oficiales DIAN ni del operador PILA. El registro de accionistas y la narración de gestión requieren revisión de sus responsables.

Las calificaciones de QA y su alcance se registran por ronda en `PROGRESS.md`. Las revisiones aprobadas de motores o componentes no equivalen a aprobación del recorrido completo con sesión ni a cierre de los límites anteriores.
