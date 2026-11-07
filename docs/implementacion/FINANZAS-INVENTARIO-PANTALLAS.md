# Finanzas: inventario de pantallas, Figma contra código

Fecha: 2026-11-07. Base: `main` local (último commit `57d05292e`). Fuente del diseño: la lista de secciones de
la página «07 Finanzas» de Figma (`EAvjINVRnlzFM70GVoWXgl`), las capturas `docs/design/figma/{52,71,72,73,74,76,79,82,83,84}-*.png`
y los documentos `docs/design/FINANZAS-{CONTABILIDAD,TESORERIA,DOCUMENTOS}-V2.md`,
`docs/design/CONTABILIDAD-TESORERIA-CUENTAS-AUTOMATICAS.md`, `docs/design/AUDITORIA-CONTADOR-MATRIZ-2026-11-07.md`,
`docs/implementacion/FINANZAS-R2-PLAN.md` y `docs/implementacion/REPORTES-FINANZAS-CONSOLIDACION.md`.

## Cómo se decidió el estado

- **Hecha según diseño**: la página y sus diálogos usan el kit `@/components/kit` (`PageHeader`, `DataTable`,
  `KpiStrip`, `Dialogo`, `EmptyState`…), sin clases `dark:` y con la estructura del frame (pestañas, columnas,
  diálogos, estados). Se juzgó leyendo el código, no en el navegador.
- **Parcial**: hay piezas del kit o la lógica nueva, pero conviven con `@/components/ui/*`, `Card` y `dark:`, o
  faltan frames del diseño. Se dice qué falta.
- **Interfaz vieja**: la pantalla existe y funciona, pero es la de antes del rediseño: `Card` + `ui/table` + muchas
  clases `dark:` y sin kit (el número de `dark:` va como evidencia).
- **No existe**: no hay ruta ni componente.
- **Movida a Reportes**: por política del dueño vive en `/app/reportes/...` (`src/lib/services/reportes/redireccionesFinanzas.ts`).
  Se aclara si el visor pinta el componente nuevo, el viejo de Finanzas o la tabla genérica.

Límites: **ninguna pantalla se recorrió en el navegador con sesión real** (`.env.local` apunta al proyecto
borrado). Las secciones «pantallas que faltaban» del 2026-11-06 no tienen capturas en el repo; esas filas se
compararon con su descripción en `CONTABILIDAD-TESORERIA-CUENTAS-AUTOMATICAS.md` §2, no con el frame.

## Conteo

| Área | Hecha | Parcial | Vieja | No existe | Movida a Reportes | Otro | Total |
|---|---|---|---|---|---|---|---|
| Contabilidad | 7 | 5 | 7 | 2 | 8 | — | 29 |
| Tesorería y bancos | 8 | 5 | 9 | 3 | 1 | — | 26 |
| Documentos y facturación electrónica | 3 | 2 | 4 | 4 | — | — | 13 |
| Facturas y cartera | 13 | — | — | 1 | 1 | — | 15 |
| Impuestos y tributario | 3 | 3 | 1 | 7 | — | — | 14 |
| Otros | — | — | 1 | — | 1 | 2 | 4 |
| **Total** | **34** | **15** | **22** | **17** | **11** | **2** | **101** |

De las 11 movidas a Reportes: 2 con el componente nuevo (kit), 4 con el **componente viejo de Finanzas** dentro
del visor (mayor, balance general, libro diario, auxiliar) y 5 con la tabla genérica del visor.

## 1. Contabilidad

| Pantalla (Figma) | Ruta en código | Estado | Evidencia |
|---|---|---|---|
| Contabilidad inicio (con avisos, todo en orden, cargando) | `/app/finanzas/contabilidad` | Interfaz vieja. Tiene `AlertasContables` y la tarjeta «Reportes contables», pero sobre `Card` | `ContabilidadHomePage.tsx`: 0 kit, 68 `dark:` |
| Libro diario: listo, filtros, cargando, vacío, sin resultados, error, sin permiso | `/contabilidad/asientos` | Interfaz vieja | `asientos/AsientosPage.tsx`: 712 líneas, `ui/table`, 91 `dark:`, del kit solo `SearchInput` |
| Nuevo asiento: cuadra, no cuadra, periodo cerrado, vacío, publicado | diálogo dentro de `AsientosPage` | Interfaz vieja. La regla de tercero obligatorio en 2365/2367/2368 sí está | `f9a6f2b88` |
| Revertir asiento: normal, periodo cerrado, ya revertido, resultado | diálogo en `AsientoDetailPage` | Parcial: la reversa completa e idempotente está; el diálogo es `ui/dialog` viejo | `4dd58527c` |
| Detalle de asiento: automático, descuadre, manual, revertido, contra-asiento, borrador, no encontrado | `/contabilidad/asientos/[id]` | Parcial: `DatosAsiento`, `OrigenCompraAsiento` y el aviso de redondeo usan el kit, pero dentro de la página vieja | `AsientoDetailPage.tsx`: `Card`, 52 `dark:` |
| Salud contable: pendientes, descuadres, huérfanos, estructura, vacío feliz, sin permiso | propuesta `/contabilidad/salud` | No existe. «Pendientes contables» cubre solo la pestaña de pendientes | sin ruta ni componente |
| Control contable: pendientes contables (lista y detalle) | `/contabilidad/pendientes`, `/pendientes/[id]` | Hecha según diseño | `d998f9ffe`; `PendientesContablesPage.tsx` con `DataTable`, `KpiStrip`, `EmptyState` |
| Reglas contables: lista por módulo, editar con vista previa, vacío | `/finanzas/reglas-contables` | Parcial: `PageHeader`, `RowActionsMenu` y `Dialogo` del kit; la tabla es `ui/table` y la edición no tiene la vista previa del asiento (cuadra, agrupadora, inexistente) | `ReglasContablesPage.tsx` |
| Control contable: reglas con cuentas inválidas | misma página | Hecha (disparador y bloqueo en pantalla) | `54e2d29a4` |
| Control contable: redondeo en línea propia | detalle de asiento | Parcial: el aviso existe, pero en el detalle viejo | `4dd58527c` |
| Periodos: rejilla del año, cerrar con avisos o bloqueado, reabrir | `/contabilidad/periodos-fiscales` | Interfaz vieja. La lógica de bloqueo y motivo de reapertura sí está | `PeriodosFiscalesPage.tsx`: 25 `dark:`; `716569971` |
| Generar períodos fiscales y cerrar ejercicio | misma página | Interfaz vieja (botones «Generar Períodos» y «Cerrar ejercicio» sobre `Card`) | `PeriodosFiscalesPage.tsx` |
| Plan de cuentas: árbol, búsqueda, nueva cuenta, no se puede eliminar, auxiliares en línea, móvil | `/contabilidad/plan-cuentas` | Hecha según diseño | `521283e43`; `PlanCuentasPage.tsx` y `FilaPlanCuenta.tsx` con kit, 0 `dark:` |
| Actualizar PUC con vista previa | `/contabilidad/actualizar-puc` | Interfaz vieja | `ActualizarPucPage.tsx`: 0 kit, 31 `dark:` |
| Cuentas automáticas: en facturas, producto, categoría, egreso, por defecto, por categoría, por sector, reclasificar IVA | `/finanzas/configuracion-contable` y formularios | Hecha según diseño | `e6f1a850c`; `ConfiguracionContablePage.tsx`, `CampoCuentaAutomatica` en el kit |
| Centros de costo: árbol, plantilla de centros, nueva distribución | `/finanzas/centro-costos` | Interfaz vieja. La función está completa (árbol, plantillas, distribución) | `CentroCostosPage.tsx`: `ui/card` y `ui/dialog`, sin `PageHeader` ni estados del kit |
| Plantillas de asientos: nueva, usar | `/contabilidad/plantillas` | Hecha según diseño (ronda 2, F3 y F4) | `609093167` |
| Comprobante de contabilidad | `/contabilidad/asientos/[id]/comprobante` | Parcial: página imprimible propia, no pasa por el motor de documentos; sin captura para comparar | `ComprobanteImprimible.tsx` |
| Activos fijos: lista, nuevo, vacío, depreciación | `/finanzas/activos-fijos` | Hecha según diseño | `609093167`, línea recta en `4e165d212` |
| Presupuestos: lista, nuevo, editor de líneas | `/finanzas/presupuestos`, `/presupuestos/[id]` | Hecha según diseño. Faltan la RPC transaccional y cerrar la RLS de `budgets` | `609093167`; `FINANZAS-R2-PLAN.md`, frente D |
| Tableta y móvil de Contabilidad v2 (libro, nuevo asiento, detalle, salud, hub) | — | No existe, salvo el móvil del plan de cuentas | — |
| Mayor contable: listo, sin cuenta, móvil | `/app/reportes/contabilidad/mayor-cuenta` (la ruta vieja redirige) | Movida a Reportes con **interfaz vieja**: el visor pinta `MayorContablePage` de Finanzas | `MayorContablePage.tsx`: 0 kit, 52 `dark:`; `src/components/reportes/especiales/registro.tsx` |
| Balance de prueba: nivel cuenta o clase, no cuadra | `/app/reportes/contabilidad/balance-prueba` | Movida a Reportes, tabla genérica del visor. Se perdió el selector de nivel PUC | `REPORTES-FINANZAS-CONSOLIDACION.md` |
| Estado de resultados comparativo y estado del resultado integral | `/app/reportes/contabilidad/estado-resultados` | Movida a Reportes, componente nuevo (kit) | `EstadoResultadosPage.tsx`: `AvisoTonal`, `Tarjeta`, 0 `dark:` |
| Balance general y estado de situación financiera NIIF comparativo | `/app/reportes/contabilidad/balance-general` | Movida a Reportes con **interfaz vieja** | `BalanceGeneralPage.tsx`: 0 kit, 54 `dark:` |
| Libro diario (informe) | `/app/reportes/contabilidad/libro-diario` | Movida a Reportes con **interfaz vieja** | `LibroDiarioPage.tsx`: 0 kit, 20 `dark:` |
| Auxiliar por tercero | `/app/reportes/contabilidad/auxiliar-tercero` | Movida a Reportes con **interfaz vieja** | `AuxiliarTerceroPage.tsx`: 0 kit, 35 `dark:` |
| Flujo de efectivo indirecto, cambios en el patrimonio, notas, certificación, indicadores, libros contables | `/app/reportes/contabilidad/...` | Movida a Reportes, componentes nuevos (kit) | `ec4a21ca4`; `contabilidad/estados/*.tsx`, 0 `dark:` |
| Presupuesto contra real | `/app/reportes/contabilidad/presupuesto-vs-real` | Movida a Reportes, tabla genérica del visor | misma RPC `fn_reporte_presupuesto_vs_real` |

## 2. Tesorería y bancos

| Pantalla (Figma) | Ruta en código | Estado | Evidencia |
|---|---|---|---|
| Movimientos unificado: listo, cargando, vacío, sin resultados, error, sin permiso, tableta, móvil | propuesta `/finanzas/tesoreria/movimientos` | No existe. Siguen tres listas separadas | `FINANZAS-TESORERIA-V2.md` §1.3 |
| Ingresos: lista (también la de la propuesta tributaria) | `/finanzas/ingresos` | Interfaz vieja | `IngresosPage.tsx`: `Card` y `ui/table`, 52 `dark:` |
| Egresos: lista | `/finanzas/egresos` | Interfaz vieja | `EgresosPage.tsx`: 52 `dark:` |
| Nuevo ingreso o egreso: en caja, egreso que supera el disponible, sin caja abierta | diálogo `FormularioMovimientoTesoreria` | Parcial: categorías y subcategorías, tercero y centro de costo están. Faltan «Efecto en la cuenta», el selector de cuenta de dinero con opciones deshabilitadas y su motivo, y el bloqueo en bancos. Los campos son `ui/*` | `FormularioMovimientoTesoreria.tsx`; `859112d9f` |
| Consignar caja a banco | — | No existe | `AUDITORIA-CONTADOR-MATRIZ-2026-11-07.md`, «Sin construir» |
| Anular movimiento | lista y detalle | Hecha (`DialogoMotivo`) | `IngresosPage.tsx`, `DetalleMovimientoTesoreria.tsx` |
| Detalle de movimiento y egreso anulado | `/ingresos/[id]`, `/egresos/[id]` | Hecha según el diseño de la ronda 2 (G2): estado real y kit. No tiene la cadena turno → asiento → conciliación de la v2 | `609093167`; `DetalleMovimientoTesoreria.tsx` |
| Cuentas de dinero: listo, cierre ciego, vacío, móvil | `/finanzas/bancos` | Parcial: pestañas del kit Cuentas · Conciliación · Alertas. KPIs y tarjetas siguen viejos (`BankStatsCards`, `BankAccountsGrid`), las cajas no aparecen y no hay cierre ciego | `BancosPage.tsx`: `TabBar` más `Card`, 10 `dark:` |
| Alertas: lista, marcar revisada | `/finanzas/bancos?tab=alertas` | Hecha según diseño | `bancos/alertas/*`; `609093167` |
| Nueva cuenta bancaria | `/bancos/cuentas/nuevo` | Interfaz vieja: página en lugar de panel lateral | `NuevaCuentaForm.tsx`: 0 kit, 37 `dark:` |
| Detalle de cuenta bancaria y sus movimientos | `/bancos/cuentas/[id]`, `/[id]/movimientos` | Interfaz vieja | `CuentaDetailPage.tsx`: 70 `dark:`; `MovimientosPage.tsx`: 56 `dark:` |
| Cuenta bancaria sin cuenta contable | detalle de cuenta | Parcial: el aviso «Sin cuenta contable» existe, pero en la pantalla vieja | `CuentaDetailPage.tsx`, línea 235 |
| Tesorería consolidada (pestaña «Posición») | `/finanzas/bancos/tesoreria` | Interfaz vieja y fuera del menú: solo se llega desde Conectar banco | `TesoreriaPage.tsx`: 76 `dark:` |
| Conectar banco: sin conectar, conectado, autorizaciones, revocar | `/finanzas/open-finance` | Hecha según diseño | `ConectarBancoPage.tsx`; `609093167` |
| Cobros y dispersiones: lista, detalle, cuenta de abono, nueva cuenta | `/finanzas/payfac/*` | Hecha según diseño | `payfac/*`; `609093167` |
| Categorías de tesorería y nueva categoría | `/finanzas/categorias-tesoreria` | Hecha según diseño. La tabla es `ui/table`, no `DataTable` | `CategoriasTesoreriaPage.tsx`; `54e2d29a4` |
| Reporte por categoría | `/app/reportes/finanzas/categorias-tesoreria` | Movida a Reportes, tabla genérica y paginada | `REPORTES-FINANZAS-CONSOLIDACION.md` |
| Conciliación bancaria: lista | `/finanzas/conciliacion-bancaria` | Interfaz vieja | `ConciliacionPage.tsx`: 54 `dark:` |
| Conciliación bancaria: nueva | `/conciliacion-bancaria/nuevo` | Interfaz vieja | `NuevaConciliacionForm.tsx`: 34 `dark:` |
| Conciliación: emparejar, extracto, sugerencias | `/conciliacion-bancaria/[id]` | Parcial: KPIs, partidas e importar extracto con kit. Las pestañas son `ui/tabs` y hay `Card` | `ConciliacionDetailPage.tsx`, `PartidasConciliacion.tsx` |
| Cerrar conciliación con partida pendiente | diálogo en el detalle | Hecha según diseño | `CerrarConciliacionDialog.tsx`; `d998f9ffe` |
| Transferencias: lista, nueva, detalle | `/finanzas/transferencias`, `/[id]` | Interfaz vieja | `TransferenciasPage.tsx`: 56 `dark:`; `TransferenciaDetalle.tsx`: 51; `NuevaTransferenciaDialog.tsx`: 25 |
| Métodos de pago: listo, agregar, editar, Cobros QR, móvil | `/finanzas/metodos-pago` | Parcial: cabecera, pestañas, Cobros QR, formulario y «desactivar en vez de borrar» están hechos. La tabla sigue en `ui/table`, y el mapeo contable y las pasarelas son viejos | `PaymentMethodsList.tsx`; `AccountMappingForm.tsx` con 34 `dark:` |
| Monedas y tasas: tres pestañas, agregar, tasa manual, histórico, móvil | `/finanzas/monedas` | Hecha según diseño. La tasa manual todavía no la leen facturas ni contabilidad | `609093167`; `FINANZAS-R2-PLAN.md`, frente C |
| Comisiones por pagar y pagar comisiones | `/finanzas/comisiones` | Interfaz vieja | `comisiones/*`: 0 kit salvo `SearchInput`, `ComisionesList` con 24 `dark:` |
| Mapa de menú y rutas de Tesorería v2 | `src/lib/navigation/catalog.ts` | No existe: el menú sigue con Ingresos, Egresos, Transferencias y Bancos por separado | `catalog.ts`, líneas 478–485 |

## 3. Documentos y facturación electrónica

| Pantalla (Figma) | Ruta en código | Estado | Evidencia |
|---|---|---|---|
| Facturación electrónica como servicio y configuración: sin configurar, pruebas, producción, pasar a producción, error, sin permiso, cargando, pendiente, activo | Configuración › Facturación › Servicio (`/finanzas/facturacion-electronica/configuracion` redirige) | Hecha según diseño. El móvil no se revisó | `ConfiguracionServicioFE.tsx` con kit; `2ee27a2b6`, `224b982fa` |
| Bandeja de envíos DIAN: listo, lote, detalle del envío, reintentar, vacíos, servicio pendiente, retenido, rechazado, tableta, móvil | `/finanzas/facturacion-electronica` | Interfaz vieja. Reintentar sí funciona | `page.tsx` (385 líneas, `Card`), `JobsTable.tsx`, `JobDetailDialog.tsx` con 42 `dark:` |
| RADIAN (fase 2) | — | No existe | — |
| Plataforma de facturación electrónica: organizaciones, cargar credenciales | consola de plataforma | No existe, tampoco en `go-admin-super` | búsqueda en ambos repos |
| Resoluciones y numeración | Configuración › Facturación | Interfaz vieja | `RangosDianSection.tsx`, `RangoEditForm.tsx`: `ui/card`, 0 kit |
| Documentos soporte: listado con estados, nuevo, editar borrador, detalle aceptado o rechazado, enviar, eliminar borrador, móvil | `/finanzas/documentos-soporte`, `/nuevo`, `/[id]` | Interfaz vieja | `SupportDocumentsTable.tsx`: 25 `dark:`; `SupportDocumentDetail.tsx`: 38; `SupportDocumentForm.tsx`: 13 |
| Notas crédito: listado, detalle, anular nota aceptada por la DIAN | `/finanzas/notas-credito`, `/[id]` | Parcial: el listado usa `ChipDocumento`, `StatusBadge` y `RowActionsMenu`, pero sobre `Card` y `ui/table`. El detalle es viejo | `NotasCreditoPage.tsx`: 50 `dark:`; `NotaCreditoDetalle.tsx`: 70 |
| Nota crédito desde la factura, por líneas | detalle de factura de venta | Hecha según diseño | `NotaCreditoVentaDialog.tsx`, `SeleccionLineasNota.tsx` |
| Notas débito: detalle y diálogo | — | No existe. Solo está la API `/api/factus/debit-note` | — |
| Cotizaciones: listado con estados, detalle enviada, vencida o convertida, convertir en factura, enviar, nueva, móvil | `/finanzas/cotizaciones`, `/nuevo`, `/[id]`, `/[id]/editar` | Interfaz vieja. Convertir funciona (`fn_cotizacion_convertir`) | `CotizacionesTable.tsx` en `ui/table`; `DetalleCotizacion.tsx`: 74 `dark:`; `NuevaCotizacionForm.tsx`: 44 |
| Saldos a favor: listo, detalle, aplicar, devolver, anular anticipo, registrar anticipo | `/finanzas/saldos-a-favor` | Parcial: la lista usa `StatCard`, `EmptyState` y `StatusBadge` sobre `ui/table`. Registrar y aplicar son diálogos viejos. Faltan el detalle, devolver y anular | `SaldosAFavorPage.tsx`, `AplicarSaldoFavorDialog.tsx` |
| Registrar pago (componente único) | factura de venta, CxC, CxP | Hecha según diseño | `RegistrarPagoDialog` del kit; `pagos/RegistrarPagoConectado.tsx` |
| Tableta de Documentos v2 | — | No existe | — |

## 4. Facturas y cartera

| Pantalla (Figma) | Ruta en código | Estado | Evidencia |
|---|---|---|---|
| Facturas de venta: listado (B.1) | `/finanzas/facturas-venta` | Hecha según diseño | `ListadoFacturasVenta.tsx`; `35ab1f4a1` |
| Factura de venta: detalle (B.2) con registrar pago, anular, nota crédito, emitir y origen | `/facturas-venta/[id]` | Hecha según diseño | `DetalleFacturaVenta.tsx` con kit, 0 `dark:` |
| Factura de venta: nueva y editar v2. Reemplaza los 8 frames de la versión anterior | `/facturas-venta/nuevo`, `/[id]/editar` | Hecha según diseño | `FormularioFacturaVenta.tsx`; `315ef2fd5`, `e6f1a850c` |
| Facturas de compra: listado (B.5) | `/finanzas/facturas-compra` | Hecha según diseño | `FacturasCompraListado.tsx`; `c554ce342` |
| Factura de compra: detalle (B.6) con pago a proveedor, recepcionar y anular | `/facturas-compra/[id]` | Hecha según diseño | `DetalleFacturaCompraV2.tsx` |
| Factura de compra: nueva y editar v2 | `/facturas-compra/nuevo`, `/[id]/editar` | Hecha según diseño | `FormularioFacturaCompra.tsx` |
| Productos por peso en facturas | formularios de factura | Hecha | `DocumentoLineas.tsx` del kit, `cantidadLinea` |
| Cuentas por cobrar: listado | `/finanzas/cuentas-por-cobrar` | Hecha según diseño | `ListadoCartera.tsx`; `5afa9f94c` |
| Cuentas por cobrar: detalle con cuotas y pago de cuota | `/cuentas-por-cobrar/[id]` | Hecha según diseño | `DetalleCuentaCartera.tsx` |
| Cartera del cliente, pago de varias facturas y estado de cuenta | `/cuentas-por-cobrar/cliente/[customerId]` | Hecha según diseño | `CarteraCliente.tsx`, `EstadoCuentaDialog.tsx` |
| Cuentas por pagar: listado | `/finanzas/cuentas-por-pagar` | Hecha según diseño | `CuentasPorPagarListado.tsx` |
| Cuentas por pagar: detalle y plan de cuotas | `/cuentas-por-pagar/[id]` (`/cuotas` redirige a `#cuotas`) | Hecha según diseño | `CuentaPorPagarDetalle.tsx`; `698f9cde9` |
| Diálogos compartidos: abono, recordatorio, plan de cuotas, programar pago | CxC y CxP | Hecha según diseño | `PlanCuotasDialog` y `RegistrarPagoDialog` del kit; `ProgramarPagoDialog.tsx` |
| Diálogo «Ajustar saldo» (castigo de cartera) | — | No existe. Está en fase 2 hasta que el Contador fije la cuenta de castigo | `FACTURAS-VENTA-CXC-PLAN.md`, D12 |
| Cartera por edades | `/app/reportes/finanzas/cxc-aging` y `cxp-aging` | Movida a Reportes, tabla genérica | `4e165d212`, `REPORTES-FINANZAS-CONSOLIDACION.md` |

Quedan componentes viejos sin uso (`facturas-compra/id/*`, `nueva-factura/*`, `cuentas-por-pagar/id/*`,
`CuentasPorPagarPage.tsx`) que no monta ninguna página. Es la limpieza F13 pendiente, no una pantalla vieja visible.

## 5. Impuestos y tributario

| Pantalla (Figma) | Ruta en código | Estado | Evidencia |
|---|---|---|---|
| Impuestos: listado de escritorio y móvil con estados (listo, cargando, vacío, sin resultados, error, sin permiso, menú de fila) | `/finanzas/impuestos` | Parcial: `PageHeader`, `TabBar` y tarifa por defecto son del kit. La pestaña de impuestos es la tabla vieja y no hay móvil propio | `TaxesIndexPage.tsx`; `TaxesTable.tsx`: `ui/table`, 69 `dark:` |
| Formulario de impuesto: nuevo y editar | diálogo | Interfaz vieja | `TaxForm.tsx`: 754 líneas, 72 `dark:` |
| Retenciones (Tesorería v2: impuestos con retenciones) | `/finanzas/impuestos`, pestaña Retenciones | Hecha según diseño | `RetencionesTable.tsx` con `DataTable` |
| Producto › Impuestos | formulario de producto de Inventario | Hecha (fuera de Finanzas) | `SeccionImpuestos.tsx` |
| Acción masiva «Asignar impuesto» | listado de productos | No existe | `inventario/productos/bulk/*` sin impuestos |
| Categorías de impuestos con subcategorías | `/finanzas/categorias-tesoreria` | Hecha | `54e2d29a4`, migración `..._tesoreria_impuestos_padre_y_subcategorias` |
| Nuevo egreso: pago de impuesto | diálogo de egreso | Parcial: la lógica está (rol de impuesto y cuenta obligatoria), con la interfaz `ui/*` del formulario | `FormularioMovimientoTesoreria.tsx`, líneas 183 y 229 |
| Perfil tributario | — | No existe | matriz del Contador, «Sin construir» |
| Centro tributario | — | No existe | íd. |
| Borrador de IVA (formulario 300) | — | No existe | íd. |
| Certificados de retención | desde CxP, factura y proveedor | Parcial: el certificado por proveedor y periodo existe en el motor de documentos. No hay pantalla de centro ni listado | `CertificadoRetencionesDialog.tsx`; `FACTURAS-COMPRA-CXP-PLAN.md` §8 |
| Consignaciones: lista, nueva nota, liquidación | — | No existe | matriz del Contador |
| Dinero de terceros | — | No existe | íd. |
| Anticipos a proveedores | — | No existe (los anticipos de clientes viven en Saldos a favor) | íd. |

## 6. Otros

| Pantalla (Figma) | Ruta en código | Estado | Evidencia |
|---|---|---|---|
| Finanzas inicio (ronda 2, G1) | `/app/finanzas` | Descartada por el dueño: redirige a la primera página activa. Los pendientes van al módulo Finanzas del Inicio (`83-inicio-finanzas-*`), que otra sesión está haciendo en el árbol (`ModulosInicio.tsx` e `inicio.server.ts` modificados, sin commit) y que espera aprobación | `ModuleRootRedirect`; `FINANZAS-R2-PLAN.md` |
| Centro de reportes financieros (ronda 2, C1) | `/app/reportes/finanzas` | Movida a Reportes (descartada en Finanzas) | `REPORTES-FINANZAS-CONSOLIDACION.md` |
| Periodos contables, página duplicada y huérfana | `/finanzas/periodos-contables` | Interfaz vieja y duplicada de `/contabilidad/periodos-fiscales`. La v2 (P-8) recomendaba retirarla | `PeriodosContablesPage.tsx`: 76 `dark:` |
| Nómina con cálculo incompleto (propuesta tributaria) | HRM | No se revisó en este inventario (es HRM). La lógica «Sin calcular bloquea el cierre» está hecha | `08eb352f8`; matriz del Contador, punto 9 |

## Lo que falta, por tandas

**Tanda 1. Tesorería del día a día** (bancos, tesorería, ingresos y egresos)
1. «Movimientos» unificado (ingresos, egresos, traslados y consignar caja a banco) con alta en panel, «Efecto en la
   cuenta» y selector de cuenta de dinero. Las rutas viejas redirigen. Menú según el mapa v2.
2. «Cuentas de dinero»: tarjetas de cajas y bancos, KPIs y cierre ciego. «Posición» (la tesorería consolidada de hoy)
   pasa a ser pestaña.
3. Nueva cuenta bancaria en panel lateral y detalle de cuenta con pestañas Movimientos · Extractos · Conciliaciones · Datos.
4. Conciliación: lista y nueva con el kit, y el detalle sin `ui/tabs`.
5. Transferencias: lista, nueva y detalle, si siguen aparte (decisión 5 del Contador).

**Tanda 2. Contabilidad**
1. Libro diario, nuevo asiento, detalle y revertir (v2), con tableta y móvil.
2. Hub de Contabilidad y Salud contable.
3. Periodos: rejilla, cerrar y reabrir, generar períodos y cerrar ejercicio.
4. Mayor contable, balance general, libro diario (informe) y auxiliar por tercero rehechos **dentro del visor de
   Reportes** con los frames v2 (mayor listo, sin cuenta, móvil). Recuperar el selector de nivel del balance de prueba.
5. Reglas con vista previa, Actualizar PUC y Centros de costo con el kit.

**Tanda 3. Documentos**
1. Cotizaciones completas (listado, detalle por estado, convertir, enviar, nueva, móvil).
2. Documentos soporte completos.
3. Bandeja DIAN (con detalle del envío, retenido y rechazado) y Resoluciones y numeración.
4. Notas crédito (listado y detalle) y notas débito (la API existe; falta la interfaz y confirmar el flujo).
5. Saldos a favor: detalle, devolver y anular.

**Tanda 4. Configuración financiera**
1. Impuestos: tabla y formulario con el kit, móvil y la acción masiva «Asignar impuesto».
2. Métodos de pago: tabla, mapeo contable y pasarelas.
3. Comisiones por pagar y pagar comisiones.

**Tanda 5. Tributario y nuevos procesos.** Necesitan backend nuevo antes de la interfaz.
Perfil y centro tributario, borrador de IVA 300, pantalla de certificados de retención, consignaciones, dinero de
terceros, anticipos a proveedores, plataforma de facturación electrónica (consola de la plataforma), RADIAN y
«Ajustar saldo» (cuando el Contador fije la cuenta de castigo).

**Transversal:** recorrer en el navegador con sesión real todo lo marcado como «Hecha». Hoy nada se ha visto
corriendo.

## Preguntas abiertas

1. **Mayor contable.** Hoy está en Reportes › Contabilidad › Mayor contable, con la pantalla vieja, y el menú de
   Finanzas ya no lo lista (solo la tarjeta «Reportes contables» del hub). ¿Basta con rehacerlo dentro del visor,
   o también hace falta un acceso directo desde Contabilidad?
2. **Movimientos unificado o listas separadas.** La v2 propone una sola pantalla. La propuesta tributaria del
   2026-11-06 dibujó «Ingresos lista». ¿Cuál manda?
3. **Salud contable.** ¿Se construye como página aparte (v2, P-1) o la reemplaza «Pendientes contables»?
4. **Plataforma de facturación electrónica.** ¿Va en `go-admin-super`? Hoy no existe en ningún repo.
5. **Notas débito.** ¿Entran en la tanda 3? La API existe y la interfaz no.
6. **`/finanzas/periodos-contables`.** ¿Se retira la página duplicada?
7. **Pantallas «que faltaban» del 2026-11-06** (centros de costo, actualizar PUC, comprobante, transferencias,
   conciliación): no hay capturas en `docs/design/figma/`. ¿Se exportan para compararlas frame contra código?
8. **Presupuestos y tasa manual.** Están en pantalla, pero falta la RPC y la RLS de presupuestos, y que
   facturas y contabilidad lean la tasa manual. ¿Van antes que las tandas nuevas?
