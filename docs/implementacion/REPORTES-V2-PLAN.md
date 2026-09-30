# Reportes v2 — plan de implementación

Fecha: 2026-09-30. Diseño: `docs/design/REPORTES-Y-CIERRES-V2.md` (PR #258,
Figma `EAvjINVRnlzFM70GVoWXgl`, páginas 14 Reportes y 09 Documentos).
Rama: `cursor/reportes-v2-implementacion-e475`, sobre #261 (alcance de sucursal
y rango del periodo) y #265 (retenciones). **#261 y #265 se fusionan antes.**

## 1. Alcance

Todo lo diseñado, en código:

| Pieza | Diseño | Código |
|---|---|---|
| Inicio del centro de reportes | `1274:6027` | `/app/reportes` |
| Lista de reportes por módulo (10 tarjetas + no contratados) | secciones 10–19 | `/app/reportes/[grupo]` |
| Visor único de reporte | `1279:6586` | `/app/reportes/[grupo]/[reporte]` |
| Favoritos · Cierres · Programados · Historial | `1382:43483` … `1382:43954` | pestañas de `/app/reportes?pestana=` |
| Diálogo «Generar cierre» | `1283:17` | `GenerarCierreDialog` |
| Diálogo «Programar envío» | `1390:44739` | `ProgramarEnvioDialog` |
| Gerente de una sede | `1382:44111` | mismo código: sucursal fija, candado y «Solicitar acceso» |
| Móvil | sección 21 | mismas rutas: `ListCard` y `PageHeader` móvil |
| Documento de cierre (carta, 80 mm) | 09 · `1242:7891` | motor de documentos, tipo `cierre-periodo` |
| Exportar un reporte (PDF) | — | motor de documentos, tipo `reporte` |

## 2. Decisiones de implementación

1. **Un solo catálogo.** `reportesCatalogo.ts` sigue siendo la fuente. Cada
   definición gana:
   - `grupo`: la tarjeta de la interfaz (10 grupos + 4 verticales), distinta
     de `modulo`, que decide si el plan lo incluye;
   - `filtros`: qué admite además del periodo (`comparativo`, `sucursal`,
     `franja`, `trabajador`, `centroCosto`). La UI solo habilita esos; el resto
     sale deshabilitado con el motivo («se calcula por día»);
   - `nuevo`: la etiqueta «Nuevo» de la lista.
2. **`ReportData` gana `vistas` y `lectura`.** Las vistas son las pestañas del
   visor (p. ej. Resumido · Por cuenta · Por sucursal); la lectura son las
   alertas del panel «Lectura rápida». El comparativo es genérico: el motor
   ejecuta el mismo reporte con el periodo anterior y calcula la variación de
   cada KPI.
3. **Retenciones: un solo reporte.** «Retenciones practicadas» con las vistas
   Por tipo y Por proveedor (esta con el enlace al certificado).
   `retenciones-por-proveedor` queda como alias que abre esa vista.
4. **El cierre corre en el servidor.** `POST /api/reportes/cierres` ejecuta los
   reportes con el cliente de la sesión (RLS y guardas de las `fn_reporte_*`),
   congela el resultado en `report_closings.snapshot` y le pone número. El
   documento se pinta desde el snapshot: descargarlo otra vez da el mismo
   documento con el mismo número.
5. **Versiones.** Recalcular un cierre emitido crea v2, v3… con el mismo
   número; la anterior pasa a «Reemplazado». Nada se borra.
6. **Numeración sin carrera.** `report_closing_counters` con
   `insert … on conflict do update … returning` dentro de la RPC que guarda.
   Formato `CIERRE-<TIPO>-<AAAAMM>-<NNN>`, con el mes del inicio del periodo.
7. **Firmar el mensual cierra el periodo contable** (`fiscal_periods`), con
   `finance.approve`. Reabrirlo exige `accounting.reverse` y deja un evento
   en el historial.
8. **La escritura del snapshot solo la hace el servidor.** `fn_cierre_guardar`
   no se concede a `authenticated`: la llama la ruta con el service role
   después de validar sesión, organización, permiso y sucursal. Así nadie
   puede guardar cifras que no salieron de los reportes.
9. **Favoritos:** `saved_reports` con `report_id`, `last_filters` y
   `last_used_at` (RLS propia, ya existe).
10. **Historial:** `report_executions.accion` y `branch_id`. Cada quien inserta
    sus eventos (RLS propia). La lectura de la organización es la RPC
    `fn_reportes_historial`: con acceso a todas las sucursales ve todo; si no,
    lo suyo y lo de sus sucursales.
11. **Envíos programados:** `scheduled_reports` gana reporte, filtros, formato,
    hora, zona y estado por destinatario. El cron
    `/api/cron/reportes-programados` firma un JWT corto por destinatario
    miembro (`SUPABASE_JWT_SECRET`, rol `authenticated`, `sub` = la persona):
    cada uno recibe lo que su alcance le deja ver. Si su alcance ya no cubre la
    sucursal del envío, se pausa para esa persona y se avisa a quien lo creó.
    Los correos externos salen solo aprobados por un administrador vigente y
    con el alcance de quien programó.
12. **Documentos:** `cierre-periodo` (carta y 80 mm) y `reporte` (carta) en el
    motor único. Los rótulos fijos del documento van por el namespace
    `documentos`; los del snapshot quedan congelados en el idioma en que se
    emitió.
13. **jsPDF sale.** `pdfExportService` y los componentes de la v1
    (`ReporteSheet`, `CierresHistorial`, `ReportesHeader`…) se retiran.

## 3. Esquema (migraciones)

| Migración | Qué hace |
|---|---|
| `…_reportes_v2_consultas_nuevas` | RPC de los reportes nuevos (§4) |
| `…_reportes_v2_cierres` | `report_closings`, `report_closing_counters`, `reporte_acceso_total`, `fn_cierre_guardar`, `fn_cierre_firmar`, `fn_cierre_reabrir` |
| `…_reportes_v2_favoritos_historial` | columnas en `saved_reports` y `report_executions`, `fn_reportes_historial` |
| `…_reportes_v2_programados` | columnas en `scheduled_reports` |

Todas aditivas, con su reversión en `supabase/rollbacks/`.

## 4. Reportes nuevos

| Reporte | Grupo | Fuente | Alcance |
|---|---|---|---|
| Balance de prueba | Contabilidad | `journal_lines` publicadas + `chart_of_accounts` | Org |
| Libro diario por origen | Contabilidad | `journal_entries.source` | Org |
| Gastos por naturaleza | Contabilidad | cuentas 5 y 6 del PUC | Org |
| Estado del periodo fiscal | Contabilidad | `fiscal_periods`, asientos sin publicar, cajas abiertas, conciliaciones | Org |
| Bancos y conciliación | Finanzas | `bank_accounts`, `bank_transactions`, `bank_reconciliations` | Sucursal |
| Caja y bancos: saldos diarios | Finanzas | `bank_transactions` por día | Sucursal |
| Movimiento de inventario valorizado | Inventario | `stock_movements` al costo | Sucursal |
| Compras por proveedor | Compras | `invoice_purchase` confirmadas | Sucursal |
| Órdenes de compra | Compras | `purchase_orders` + `purchase_order_items` | Sucursal |

Además, `fn_reporte_resultados_desglose` para las vistas Por sucursal, Por
centro de costo y Tendencia 12 meses del estado de resultados.

## 5. Rutas de servidor

| Ruta | Qué hace | Permiso |
|---|---|---|
| `POST /api/reportes/cierres` | genera (o recalcula) y congela un cierre | `reports.export` |
| `POST /api/reportes/cierres/[id]/firmar` | firma; el mensual cierra el periodo | `finance.approve` |
| `POST /api/reportes/cierres/[id]/reabrir` | reabre el periodo, auditado | `accounting.reverse` |
| `GET /api/reportes/destinatarios` | miembros con su alcance de sucursal | `reports.export` |
| `POST /api/reportes/programados` · `PATCH …/[id]` | crea, edita, pausa, aprueba externos | `reports.export` (aprobar: admin) |
| `POST /api/reportes/programados/[id]/prueba` | envío de prueba a quien lo pide | `reports.export` |
| `GET /api/cron/reportes-programados` | envíos vencidos | `CRON_SECRET` |
| `GET /api/documentos/cierre-periodo/[id]` · `…/reporte/[id]` | documentos | `reports.export` o `finance.view` |

## 6. Fases (un commit por cambio lógico)

1. Base: rango del periodo con el cliente de la sesión, periodos en fecha
   plana, topes que truncaban sumas.
2. Catálogo v2 y tipos.
3. RPC nuevas.
4. Esquema de cierres, favoritos, historial y programados.
5. Documentos `cierre-periodo` y `reporte`.
6. Rutas de servidor y cron.
7. UI: inicio, lista, visor, pestañas, diálogos, móvil, gerente de sede.
   Hecho en `src/components/reportes/` y en `/app/reportes`, `/app/reportes/[grupo]`
   y `/app/reportes/[grupo]/[reporte]`. No hay permiso de página: el módulo del
   plan abre el centro; cada reporte se bloquea por alcance o por plan.
8. i18n en es, en, pt y fr. Hecho: `reportes.*` y `kit.franja.*`. Los títulos,
   descripciones y columnas de cada reporte se quedan en español.
9. Retiro de la v1 y de jsPDF. Hecho. Siguen `ReporteKPIs`, `ReporteTabla`,
   `ReporteChart` y `ReportePagination` (la tabla del chat la importa) y
   `reportAgentService` (lo usa el asistente).
10. Pruebas, documentación, verificación y PR. Hecho en la rama
    `cursor/reportes-v2-implementacion-e475` (PR #269, sigue en borrador).
    El recorrido con sesión iniciada no se pudo hacer en este entorno.
