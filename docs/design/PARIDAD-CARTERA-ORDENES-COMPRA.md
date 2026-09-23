# Paridad — cartera y órdenes de compra

Control por control, de la auditoría al frame de Figma. Fuentes:
`docs/design/AUDITORIA-CARTERA-ORDENES-COMPRA.md` (servicios, base de datos, roto y faltante) y
`docs/design/AUDITORIA-CONTROLES-FINANZAS.md` §C.1–C.5 (numeración de los controles visibles de
cartera). Archivo Figma: «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`).

Fecha: 2026-09-22. Normas aplicadas: `docs/design/PATRONES-TRANSVERSALES.md` (patrones 1–12) y
`docs/design/SISTEMA-BADGES.md` (tabla estado → tono). Sin nombres de organizaciones cliente: los
datos de ejemplo usan «Mi empresa S.A.S.», «Sucursal Principal», «Sucursal Norte» y razones
sociales inventadas.

Leyenda de **Estado**: **calcado** (existe hoy y se dibuja igual) · **sustituido por …** (existe
hoy pero se resuelve con otro componente o patrón) · **Nuevo** (no existe en el código; lleva badge
«Nuevo» en Figma) · **omitido: motivo**.

---

## 0. Qué se dibujó

### Página `07 Finanzas` — 5 secciones nuevas, 33 frames

| Sección | Frames |
|---|---|
| Cartera — cuentas por cobrar (listado) | Escritorio: listo · cargando · vacío · error · selección y acciones en lote · filtros abiertos · menú de fila. Móvil: listo · filtros (Sheet) |
| Cartera — cuenta por cobrar (detalle) | Escritorio: listo · cargando · no encontrada · pagada. Móvil: detalle |
| Cartera — cuentas por pagar (listado) | Escritorio: listo · cargando · vacío · error · selección y acciones en lote · menú de fila. Móvil: listo |
| Cartera — cuenta por pagar (detalle) y plan de cuotas | Escritorio: listo · cargando · no encontrada · sin plan de cuotas. Móvil: detalle |
| Cartera — diálogos compartidos | Registrar abono (`AplicarPagoDialog` con cuota) · Registrar abono — excede el saldo · Enviar recordatorio · Crear plan de cuotas · Ajustar saldo (Nuevo) · Programar pago · Móvil: Registrar abono (Sheet) |

### Página `04 Inventario` — 3 secciones nuevas, 21 frames

| Sección | Frames |
|---|---|
| Órdenes de compra — listado | Escritorio: listo · cargando · vacío · error · selección y acciones en lote · menú de fila. Móvil: listo |
| Órdenes de compra — detalle y recepción | Escritorio: recibida en parte · enviada sin recibir · cargando · no encontrada. Diálogos: recepción parcial · recepción total y su efecto en inventario. Móvil: detalle |
| Órdenes de compra — nueva y editar | Escritorio: nueva lista · nueva vacía · editar cargando · editar ya no es editable. Diálogos: `ProductPicker` modo compra · `SupplierPicker`. Móvil: nueva |

Los índices de las dos páginas quedaron actualizados con las secciones nuevas.

---

## 1. Componentes: qué se reutilizó y qué se amplió

### 1.1 Reutilizados tal cual (obligatorio del encargo)

| Componente | Sección de `02 Componentes` | Dónde se usa |
|---|---|---|
| `AplicarPagoDialog` | Finanzas | «Registrar abono» y «Registrar pago» de cobrar, de pagar y de cada cuota. **Un solo diálogo para los dos módulos.** |
| `DocumentHeader` (`Variant=detalle`) | Finanzas | Cabecera de los dos detalles de cartera |
| `DocumentStatusBadge` | Finanzas | Columna «Estado» de los dos listados, badge del detalle y estado de la orden de compra |
| `DocumentLinesTable` | Finanzas | Líneas de la orden (recepción) y líneas del formulario de alta |
| `DocumentTotals` (`Variant=compra`) | Finanzas | Resumen de la nueva orden de compra |
| `SupplierPicker` | Finanzas | Proveedor de la nueva orden (`Layout=inline`), diálogo de búsqueda (`Layout=dialog`) y estado vacío (`Layout=popover, State=idle`) |
| `ProductPicker` | Productos y POS | Buscador de productos de la orden de compra (`Layout=combobox` y `Layout=dialog, Mode=purchase`) |
| `PageHeader`, `DataTable`/`TableCell`, `Pagination`, `SearchBar`, `FilterButton`, `FilterPanel`, `Chip`, `BulkActionBar`, `EmptyState`, `Skeleton`, `StatCard`, `Badge`, `BranchBadge`, `Button`, `IconButton`, `Checkbox`, `FormField`, `NumberInput`, `Progress`, `MenuItem`, `Divider`, `MobileHeader`, `MobileTabBar`, `Breadcrumbs`, `Marca/Nuevo` | varias | Todo lo demás |

`CustomerPicker` **no se instancia** en estas pantallas: cartera no crea documentos, los recibe de
la factura o de la venta. Donde el diseño necesita al cliente, lo muestra como dato con enlace a su
ficha. Queda instanciado en las pantallas de factura de venta, que sí lo crean.

### 1.2 Ampliaciones de componentes existentes — ninguna copia paralela

| Componente | Qué se le añadió | Por qué |
|---|---|---|
| `AplicarPagoDialog` | Propiedad booleana **`Mostrar cuota`** (por defecto `false`), que revela un `FormField State=select` «Aplicar a cuota (opcional)» con su texto de ayuda «Sin cuota elegida, el abono se reparte de la más antigua a la más nueva.» | Cartera necesita aplicar el abono a una cuota concreta (`AccountActionsCard.tsx:330-357`); las facturas no. Es una propiedad, no un diálogo paralelo: las 4 variantes y las instancias ya existentes no cambian. |
| `DocumentStatusBadge` | Variante **`Estado=Al día`** (éxito · suave) | Cartera tiene un estado que ningún documento tiene: `accounts_receivable.status='current'`. Sin esta variante habría que mezclar `Badge` suelto con `DocumentStatusBadge` en la misma columna. |
| `DocumentLinesTable` | Variantes **`Mode=recepción, Layout=table`** y **`Mode=recepción, Layout=cards`**, con columnas «# · Producto · Pedido · Recibido · Pendiente · Costo unit. · Subtotal» y sin los chips de impuesto | Una orden de compra no tiene precio de venta ni impuesto por línea en la recepción: tiene pedido, recibido y pendiente. Es el mismo componente con un modo más, no una tabla nueva. |

**Hallazgo sobre un componente ajeno, sin tocarlo:** el set `ProductPicker` (`161:8041`) está en
estado de error en Figma porque mezcla dos ejes incompatibles —`Layout=dialog` usa `Mode`
(`sale`/`purchase`) y `Layout=combobox` usa `State` (`closed`/`open`)—, así que
`componentPropertyDefinitions` lanza excepción y no se puede instanciar por propiedades. Las
instancias de estas pantallas se crearon apuntando directamente a la variante
(`Layout=dialog, Mode=purchase` y `Layout=combobox, State=closed`), que sí funciona. **No se
modificó** porque pertenece a otra tanda; queda como duda 1.

---

## 2. Cuentas por cobrar — listado (`AUDITORIA-CONTROLES-FINANZAS.md` §C.1)

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| 1 | Flecha atrás a `/app/finanzas` | Cuentas por cobrar — listo | sustituido por `Breadcrumbs` «Finanzas › Cartera › Cuentas por cobrar» del `PageHeader` (patrón 4) |
| 2 | «Cuentas por Cobrar» + miga no navegable | Cuentas por cobrar — listo | sustituido por título «Cuentas por cobrar» + migas navegables |
| 3 | «Actualizar» | Cuentas por cobrar — listo | calcado (secundario, patrón 4) |
| 4 | `BranchBadge` «Sucursal:» + valor | Cuentas por cobrar — listo | sustituido por `BranchBadge Scope=una` del kit (el fucsia sale del manual, `SISTEMA-BADGES.md` §6) |
| 5-8 | KPI «Total por Cobrar» · «Vigentes» · «Vencidas» · «Promedio Días Cobro» | Cuentas por cobrar — listo | sustituidos por 4 `StatCard`: «Total por cobrar», «Al día», «Vencida», «Promedio de cobro». Se corrige el subtítulo «cuentas activas», que hoy cuenta también las pagadas (§F.A14) |
| 9 | Esqueleto de KPIs | Cuentas por cobrar — cargando | sustituido por `Skeleton Variant=card` |
| 10 | Pestañas «Cuentas · Aging · Recordatorios · Estadísticas» | Cuentas por cobrar — listo | **sustituidas**: «Aging» pasa a la banda de antigüedad accionable de la misma pantalla; «Recordatorios» pasa a un filtro («Sin recordatorio reciente») más la acción masiva; «Estadísticas» se funde en los KPI. Cuatro pestañas para un solo listado eran cuatro consultas que no se hablan (§A.3, §A.4) |
| 11-16 | Filtros: «Buscar», «Estado», «Aging», «Cliente», fechas, «Limpiar Filtros» | Cuentas por cobrar — filtros abiertos | sustituidos por `SearchBar` + `FilterButton` + `FilterPanel Layout=popover` (patrón 3). El campo «Cliente» pasa a selector de cliente real: hoy manda el texto como `customer_id_filter` y no filtra nunca (§F.A4) |
| 17 | Botón icono de filtros avanzados (sin `aria-label`) | Cuentas por cobrar — filtros abiertos | sustituido por «Filtros» con contador |
| 18 | «Exportar CSV» | Cuentas por cobrar — listo | calcado, y **conectado**: hoy la prop `onExportCSV` está muerta (§F.A1) |
| 19 | Chips de filtros activos | Cuentas por cobrar — listo | Nuevo: hoy no hay chips, solo un contador «{n} filtro(s) activo(s)» |
| 20 | «Por página:» 5/10/20/50/100 | Cuentas por cobrar — listo | sustituido por el selector de la `Pagination` única del kit (patrón 2) |
| 21-28 | Columnas «Cliente · Contacto · Monto · Balance · Vencimiento · Estado · Aging · Acciones» | Cuentas por cobrar — listo | sustituidas por «Cliente · Documento · Vencimiento · Monto · Saldo · Cuotas · Antigüedad · Estado». «Contacto» baja a la segunda línea del cliente; **«Cuotas» es Nuevo** (hoy el plan solo se ve dentro del detalle) |
| 29-33 | Badges de estado «Al día · Vencida (Nd) · Parcial · Pagada» + crudo | Cuentas por cobrar — listo | sustituidos por `DocumentStatusBadge` (con la variante nueva «Al día»). Los días van dentro de la etiqueta, nunca en un segundo badge (`SISTEMA-BADGES.md` §4) |
| 34 | Columna «Aging» en días con color | Cuentas por cobrar — listo | sustituida por `Badge` con el tramo escrito («31-60 días»), una sola escala para toda la app (§A.3) |
| 35-37 | Menú de fila: «Aplicar Abono» · «Enviar Recordatorio» · «Ver Detalles» | Cuentas por cobrar — menú de fila | sustituidos por 2 iconos de fila («Registrar abono», «Enviar recordatorio») + «⋯» de 7 entradas (patrón 6). «Ver Detalles» desaparece: la fila entera abre el detalle |
| 38 | «Aplicar Abono» deshabilitado con saldo 0, sin explicación | Cuentas por cobrar — menú de fila | sustituido: la entrada no aparece cuando no aplica (patrón 6.6) |
| 39-46 | Vista móvil en tarjetas | Móvil / Cuentas por cobrar — listo | calcado, con `Pagination Layout=compact` sobre el `MobileTabBar` |
| 47-52 | Paginación propia con `Pagination` de shadcn | Cuentas por cobrar — listo | sustituida por `Pagination Layout=full` del kit |
| 53 | Estado «Cargando...» que tapa toda la tabla | Cuentas por cobrar — cargando | sustituido por `Skeleton Variant=table-row`, con la paginación visible y deshabilitada (patrón 2) |
| 54 | «No se encontraron cuentas por cobrar con los filtros aplicados» | Cuentas por cobrar — vacío | sustituido por `EmptyState Variant=empty` con acción «Emitir una factura a crédito»; el estado de filtros sin resultados usa `Variant=search` |
| — | (no existe) | Cuentas por cobrar — error | **Nuevo**: `EmptyState Variant=error` con «Reintentar». Hoy el error solo sale por toast |
| 55-63 | Pestaña «Aging»: 5 totales por tramo, tabla por cliente, riesgo, «Exportar» | Cuentas por cobrar — listo (banda «Antigüedad de la cartera») | sustituida: los 5 tramos pasan a la banda accionable de la cabecera y filtran el listado. El desglose por cliente **se omite**: era una tabla que cargaba toda la cartera en el navegador para agregar en JS (§A.1) y su color medía peso relativo, no antigüedad (§A.3) |
| 64-65 | Badges «Alto Riesgo / Riesgo Medio / Riesgo Bajo / Bajo Riesgo» | — | **sustituidos por una sola escala de antigüedad**. «Riesgo Bajo» gris y «Bajo Riesgo» verde eran dos etiquetas casi idénticas para tramos distintos (§F.A3) |
| 66-76 | Pestaña «Recordatorios»: selección múltiple, 4 KPI, 7 columnas, urgencia, «Enviar (N)» | Cuentas por cobrar — selección y acciones en lote · Diálogo / Enviar recordatorio de cobro | sustituida por la `BulkActionBar` al pie (patrón 1) con «Enviar recordatorio» sobre la selección, y por el filtro «Sin recordatorio reciente». **Además respeta la sucursal**, que hoy ignora (§A.4) |
| 77-81 | Pestaña «Estadísticas»: «Resumen Detallado» y «Análisis de Tendencias» | — | **omitida: duplica dos veces las mismas dos cifras y no tiene ninguna serie temporal** (§F.A16). Sus dos métricas útiles viven en los KPI de la cabecera |

---

## 3. Cuentas por cobrar — detalle (§C.2, C.2-bis, C.2-ter)

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| 1 | Esqueleto de carga | Detalle cuenta por cobrar — cargando | sustituido por `Skeleton` del kit |
| 2 | «Cuenta no encontrada» (mismo aspecto para 403 y 404) | Detalle cuenta por cobrar — no encontrada | sustituido por `EmptyState Variant=error`, con el texto que distingue «no existe» de «es de otra sucursal» |
| 3-4 | Flecha atrás + «Cuenta por Cobrar» + «ID: {uuid}» | Detalle — listo | sustituidos por `DocumentHeader Variant=detalle` con migas y título «Cuenta por cobrar · FV-00042» |
| 5 | Badge de estado | Detalle — listo · pagada | sustituido por `DocumentStatusBadge` |
| 6-7 | «Registrar Cobro» y «Marcar como Cobrada» por `document.getElementById().click()` | Detalle — listo | sustituidos: «Registrar abono» abre el `AplicarPagoDialog`; **«Marcar como Cobrada» desaparece** en favor del atajo «Saldo total» dentro del diálogo y de «Ajustar saldo» (§G.2, §F.A25) |
| 8 | «Exportar Estado» → `.txt` con el estado crudo en inglés | Detalle — listo | calcado como «Estado de cuenta», con el estado en español y los abonos incluidos |
| 9 | «Actualizar» | Detalle — listo | calcado (dentro del «⋯» del `DocumentHeader`) |
| 10-13 | KPI «Monto Original · Balance Pendiente · Fecha de Vencimiento · Días de Atraso» | Detalle — listo | calcados como 4 `StatCard`; el tramo se nombra con la escala única |
| 14 | «Información del Cliente» | Detalle — listo (tarjeta «Cliente») | calcado, más «Cartera total» del cliente |
| 15 | «Factura de Venta» + «Ver Factura» | Detalle — listo (tarjeta «Documento de origen») | calcado y ampliado: número, emisión, vencimiento, total y forma de pago |
| 16 | «Fecha de Creación · Última Actualización · Último Recordatorio» | Detalle — listo (tarjeta «Seguimiento») | calcado |
| 17-18 | «Acciones de Cuenta» + badge de severidad | Detalle — listo | sustituidos por la tarjeta «Seguimiento» con el badge de la escala única |
| 19-23 | Diálogo «Enviar Recordatorio de Pago», textarea pseudo-controlada, «Usar plantilla» | Diálogo / Enviar recordatorio de cobro | sustituido: el mensaje se precarga de verdad (hoy el campo se ve lleno y el envío falla, §F.A7), y se elige **canal** y **plantilla** (Nuevo, §G.4) |
| 24-31 | Diálogo «Registrar Cobro»: cuota, monto, «Pago total»/«50%», fecha, método, referencia | Diálogo / Registrar abono (`AplicarPagoDialog` con cuota) | sustituido por el diálogo único. «Saldo total», «50 %» y «Exacto» son los atajos del componente |
| 32-34 | «Marcar como Pagada» + confirmación + `aplicarPago(balance,'efectivo')` | Diálogo / Ajustar saldo (Nuevo) | **sustituido**: inventar un pago en efectivo para cerrar una cuenta es lo que ensucia el historial. Lo que no es cobro pasa por «Ajustar saldo», con motivo obligatorio y asiento |
| 35 | Pie «Monto original / Total pagado / Balance pendiente» | Detalle — listo | calcado |
| 38-53 | Plan de cuotas: «Crear Cuotas», nº de cuotas, interés, cuota estimada, «Eliminar Plan», lista, badges, «Pagar», totales | Detalle — listo (tarjeta «Plan de cuotas») · Diálogo / Crear plan de cuotas | sustituidos por una **tabla** con «Cuota · Vence · Monto · Abonado · Saldo · Estado» y su botón «Abonar». El interés **sí se aplica** (hoy el campo es decorativo, §F.A5) y la previsualización coincide con lo generado (§B.3) |
| 45-46 | «Eliminar Plan» + confirmación | Diálogo / Crear plan de cuotas (aviso) | sustituido por «Reprogramar»: crear un plan hoy borra el existente sin avisar, incluso con cuotas pagadas (§F.A26) |
| 54-62 | Historial de pagos: buscador, alcance, «Mostrar:», tarjetas, badges de método y estado, paginación propia | Detalle — listo (tarjeta «Historial de abonos») | sustituido por tabla «Fecha · Importe · Método · Referencia · Aplicado a» + `Pagination Layout=compact` **dentro de la tarjeta** (patrón 2). La columna «Aplicado a» es Nueva: hoy no se sabe a qué cuota fue cada abono |
| — | (no existe) | Detalle — listo (menú «⋯» de cada abono) | **Nuevo**: anular un abono registrado (§G.1) |
| — | (no existe) | Detalle — listo (enlace «Ver asiento contable 1305 / 4135») | **Nuevo**: el asiento existe (`fn_auto_journal_ar`) y ninguna pantalla lo enlaza |

---

## 4. Cuentas por pagar — listado (§C.3 y sus diálogos)

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| 1-2 | Flecha atrás + miga no navegable | Cuentas por pagar — listo | sustituidos por migas navegables del `PageHeader` |
| 3 | «Actualizar» | Cuentas por pagar — listo | calcado |
| 4 | «Aprobaciones» + badge que arranca en 0 | Cuentas por pagar — listo | calcado y **corregido**: el contador se carga al abrir la pantalla (§F.B5) |
| 5-6 | «Exportar» deshabilitado + toast redundante | Cuentas por pagar — listo · selección y acciones en lote | sustituido: «Exportar a banca» vive en la `BulkActionBar` sobre la selección (patrón 1); el toast inalcanzable desaparece |
| 7 | `BranchBadge` | Cuentas por pagar — listo | calcado con el componente del kit |
| 8-13 | 7 KPI («Total Pendiente», «Pagos Vencidos», «Pagos Parciales», «Próximo Vencimiento», «Nivel de Urgencia», «Proveedores Activos», «Estado General») | Cuentas por pagar — listo | sustituidos por 4 `StatCard` + la banda de antigüedad. «Nivel de Urgencia» medía el % vencido con otra escala que el resto (§B, aging) |
| 14 | Alerta roja «Atención: Pagos Vencidos» | Cuentas por pagar — listo | sustituida por el tramo «Más de 90 días» de la banda, que además filtra |
| 15-21 | Filtros: búsqueda, estado, vencimiento, «Más filtros», proveedor, montos, fechas, contador | (misma `FilterPanel` que cobrar) | sustituidos por `SearchBar` + `FilterButton` + `FilterPanel`. **Se corrigen los valores**: hoy el estado emite español contra valores en inglés y no devuelve nunca una fila (§F.B1), y 3 de las 5 opciones de vencimiento no hacen nada (§F.B2) |
| 22 | Pestañas «Todas · Vencidas · Próximas · Pendientes» | Cuentas por pagar — listo (banda de antigüedad) | **sustituidas**: filtraban en cliente sobre la página actual mientras la paginación mostraba el total sin filtrar (§F.B4) |
| 23 | Selección múltiple | Cuentas por pagar — selección y acciones en lote | calcado, con la barra al pie y el contador con importe |
| 24-28 | Columnas «Proveedor · Factura · Fecha Venc. · Monto · Saldo · Estado» | Cuentas por pagar — listo | calcadas, más «Cuotas» y «Antigüedad» (Nuevas). El `CopyableId` deja de llevar a la cuenta y lleva a la factura (§F.B30) |
| 28 | Badge «Vencida (Nd)» con prioridad sobre el estado | Cuentas por pagar — listo | sustituido: el estado manda y la antigüedad tiene su propia columna. Hoy una cuenta pagada con fecha pasada se pinta «Vencida» (§F.B18) |
| 29 | Menú de fila de 6 entradas | Cuentas por pagar — menú de fila | sustituido por 2 iconos («Registrar pago», «Programar») + «⋯» de 7 entradas, y **las acciones que no aplican no se muestran** (hoy se ofrecen en cuentas pagadas, §F.B19) |
| 31-32 | Esqueleto y vacío | Cuentas por pagar — cargando · vacío | sustituidos por `Skeleton` y `EmptyState` del kit; el vacío distingue «no hay nada» de «los filtros no devuelven nada» |
| — | (no existe) | Cuentas por pagar — error | **Nuevo**: `EmptyState Variant=error` con «Reintentar» |
| 33 | `DataTablePagination` | Cuentas por pagar — listo | sustituida por la `Pagination` única del kit |
| 35-48 | Diálogo «Registrar Pago» (monto, exceso, atajos, fecha, método, cuenta bancaria, referencia, notas) | Diálogo / Registrar abono (`AplicarPagoDialog`) | sustituido por el diálogo único. **Corrige tres cosas**: la fecha y las notas hoy no se envían, la cuenta bancaria es decorativa en el listado (§F.B12) y rompe el insert en el detalle porque `payments` no tiene `bank_account_id` (§D.1, §F.B11) |
| 49-60 | Diálogo «Programar Pago» | Diálogo / Programar pago (cuentas por pagar) | calcado, con la fecha programada como **campo propio** y la justificación persistida: hoy viven dentro de `payments.reference` y el aprobador las destruye (§B.4) |
| 61-68 | Diálogo «Aprobación de Pagos» | — | **omitido: no cabía en esta tanda.** Queda documentado que hoy muestra siempre «Pago #xxxxxxxx» porque el servicio no trae el proveedor, que está truncado a 10 registros sin paginación y que aprobar/rechazar son iconos sin etiqueta (§F.B6, B23, B24). Es la siguiente pantalla a dibujar |
| 69-80 | Diálogo «Exportar / Conciliar Banca» | — | **omitido: la mitad no funciona y la otra mitad es una simulación declarada** (§F.B7, B8). Rediseñarlo exige decidir antes qué formatos bancarios se soportan de verdad; es duda 2 |
| 81-88 | Diálogo «Pagar con Open Finance» | — | **omitido: el flujo del listado no puede funcionar** (`Number(uuid)` → `NaN`, §F.B9) y sus pagos no salen en ningún historial (§F.B10). Se arregla en código antes de dibujarlo |

---

## 5. Cuentas por pagar — detalle y plan de cuotas (§C.4, C.4-bis, C.5)

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| 1 | Carga y «Cuenta no encontrada» | Detalle cuenta por pagar — cargando · no encontrada | sustituidos por `Skeleton` y `EmptyState` del kit |
| 2-3 | «Cuenta por Pagar» + «ID: {uuid}» + badge | Detalle cuenta por pagar — listo | sustituidos por `DocumentHeader Variant=detalle` + `DocumentStatusBadge` |
| 4 | «Registrar Pago» / «Marcar como Pagada» por DOM | Detalle — listo | sustituidos: «Registrar pago» abre el diálogo único; «Marcar como Pagada» desaparece en favor de «Ajustar saldo» |
| 5 · 23 | **Dos** botones «Exportar Estado» con contenidos distintos | Detalle — listo | sustituidos por uno solo, el que incluye el plan de cuotas (§F.B14) |
| 6 | «Actualizar» | Detalle — listo | calcado (dentro del «⋯») |
| 7-8 | 4 KPI y el aging de 4 tramos | Detalle — listo | calcados con la escala única de 5 tramos, igual que cobrar |
| 9-10 | «Información del Proveedor» + «Ver Perfil del Proveedor» | Detalle — listo (tarjeta «Proveedor») | calcados; el correo y el teléfono vuelven a ser enlaces `mailto:`/`tel:` como en el listado |
| 11 | «Factura de Compra» + «Ver Factura» | Detalle — listo (tarjeta «Documento de origen») | calcado y ampliado con **«Ver orden de compra OC-118»** (Nuevo) y el asiento contable |
| 12-13 | «Acciones de Cuenta» + chip de severidad (`<span>`, no `Badge`) | Detalle — listo (tarjeta «Programación y aprobación») | sustituidos por `Badge` de la escala |
| 14-21 | Diálogo «Registrar Pago» del detalle | Diálogo / Registrar abono (`AplicarPagoDialog`) | sustituido por el diálogo único |
| 22 | «Marcar como Pagada» con «Cancelar» que no cierra | — | **sustituido por «Ajustar saldo»** (§F.B13) |
| 25-29 | Historial de pagos | Detalle — listo (tarjeta «Historial de pagos») | calcado como tabla, con la cuenta bancaria como dato de la fila |
| 31-44 | Plan de cuotas del detalle | Detalle — listo (tarjeta «Plan de cuotas») · Detalle — sin plan de cuotas | calcado como tabla; el estado sin plan usa `EmptyState Layout=compact` |
| C.5 1-24 | Ruta huérfana `/[id]/cuotas` | — | **omitida como pantalla aparte: se absorbe en el detalle.** Era la única forma de editar una cuota, nadie la enlazaba, borraba el plan sin confirmar y su selector de método estaba roto (§F.B15, B16, B17). Lo único que aportaba —editar la cuota y la barra de progreso— pasa al detalle |

---

## 6. Órdenes de compra (`AUDITORIA-CARTERA-ORDENES-COMPRA.md` §C)

### 6.1 Listado

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| 16-17 | «Órdenes de Compra» + «Gestiona las órdenes de compra a proveedores» | Órdenes de compra — listo | calcado en el `PageHeader` |
| 18 | «Importar» → 404 | — | **omitido: la ruta no existe** (§F.C2). Si se implementa, entra como secundaria |
| 19 | «Exportar» que nunca se renderiza | Órdenes de compra — listo | calcado y **conectado** (§F.C3) |
| 20 | «Nueva Orden» | Órdenes de compra — listo | calcado como única acción primaria |
| 21-22 | `BranchBadge` con fucsia | Órdenes de compra — listo | sustituido por `BranchBadge Scope=todas` del kit; la columna «Sucursal» se mantiene porque el listado es multi-sucursal |
| 23-28 | 6 KPI | Órdenes de compra — listo | sustituidos por 4 `StatCard` («Órdenes abiertas», «Valor comprometido», «Pendiente de recibir», «Recibidas este mes») **más la banda de estados accionable**, que recupera los 5 estados y **añade «Canceladas»**, que hoy se calcula y no se muestra (§F.C15) |
| 29 | Buscador que filtra en cliente sobre la página cargada | Órdenes de compra — listo | sustituido por `SearchBar` con búsqueda en servidor (§F.C12) |
| 30-32 | Selects «Estado», «Proveedor», «Sucursal» | Órdenes de compra — listo (chips) + `FilterPanel` | sustituidos por «Filtros» con contador y chips activos; el de sucursal se mantiene **por excepción**: el listado consolida sucursales y `purchase_orders` no tiene RLS de sucursal (§D.4) |
| 33-40 | Columnas «ID · Proveedor · Sucursal · Estado · Fecha Esperada · Total · Creado · Acciones» | Órdenes de compra — listo | sustituidas por «Orden · Proveedor · Sucursal · Fecha esperada · **Recepción** · Total · Estado». «Creado» baja a la segunda línea; **«Recepción» es Nueva** y es el dato que hoy obliga a entrar al detalle |
| 41 | «No hay órdenes de compra» | Órdenes de compra — vacío | sustituido por `EmptyState` con acción |
| — | (no existe) | Órdenes de compra — error · cargando | **Nuevos**: hoy el error solo sale por toast y la carga es un esqueleto genérico de página |
| 42-48 | Menú de fila de 7 entradas | Órdenes de compra — menú de fila | sustituido por 2 iconos («Registrar recepción», «⋯») + menú de 6 entradas con lo destructivo separado. «Cancelar la orden» pasa por `ConfirmDialog` (hoy no confirma, §F.C13) |
| 49-52 | Paginación dibujada a mano, 10 fijas, sin reinicio al filtrar | Órdenes de compra — listo | sustituida por la `Pagination` única del kit (patrón 2). Corrige quedarse en una página vacía sin controles (§F.C10) |
| — | (no existe) | Órdenes de compra — selección y acciones en lote | **Nuevo**: hoy no hay selección múltiple en todo el módulo |
| — | (no existe) | Móvil / Órdenes de compra — listo | **Nuevo**: hoy la tabla solo esconde columnas y desborda en horizontal |

### 6.2 Detalle y recepción

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| 53-56 | «Volver», «OC-{id}», badge, «Creada el …» | Detalle de orden de compra — recibida en parte | sustituidos por `PageHeader Variant=detail` con migas |
| 57-61 | «Editar», «Enviar», «Registrar Recepción», «Duplicar», «Cancelar» | Detalle — recibida en parte · enviada sin recibir | calcados; «Editar» desaparece fuera de borrador y se explica por qué (§6.4) |
| 62-67 | Tarjeta «Productos» con «Producto · Cantidad · Recibido · Costo Unit. · Subtotal» | Detalle — recibida en parte (`DocumentLinesTable Mode=recepción`) | sustituida por la variante nueva del componente compartido, que añade **«Pendiente»** |
| — | (no existe) | Detalle — recibida en parte (tabla vacía) | Corrige que hoy la tabla de líneas no tiene estado vacío (§F.C24) |
| 68 | Tarjeta «Notas» con HTML crudo | Detalle — recibida en parte | sustituida: las notas se muestran como texto (§F.C8) |
| 69-77 | Tarjeta «Resumen» + contacto del proveedor | Detalle — recibida en parte (tarjeta «Proveedor») | calcada |
| 78-80 | «DOCUMENTOS VINCULADOS» | Detalle — recibida en parte (tarjeta «Documentos vinculados») | calcado y **ampliado** con las entradas de inventario y el asiento contable. Lleva el aviso de que hoy este bloque no se ve nunca porque la factura no guarda `po_id` (§F.C1) |
| 81-84 | «Progreso de Recepción» | Detalle — recibida en parte | calcado con `Progress` del kit + el desglose por línea |
| 85-96 | Diálogo «Registrar Recepción de Mercancía» | Diálogo / Registrar recepción — parcial · total y su efecto en inventario | calcado y **ampliado**: fecha de recepción, remisión del proveedor, nota, y el resumen de lo que entra a inventario y en qué deja la orden (§G.5) |
| 94 | `SerialCaptureSection` por línea | — | **omitida: hoy es inalcanzable.** `getProducts` no devuelve `track_serial` y el embed de líneas tampoco lo trae, así que ni la captura al crear ni la de recibir se muestran nunca (§F.C4, C5). Se dibuja cuando el código la reviva |
| — | (no existe) | Detalle — recibida en parte (tarjeta «Recepciones registradas») | **Nuevo**: número de recepción, fecha, quién recibió, unidades y su movimiento de inventario. Hoy no existe tabla de recepciones y `stock_movements.source_id` apunta a la orden, no a la línea (§D.1, §G.5) |
| 101-105 | Estados de carga y error | Detalle — cargando · no encontrada | sustituidos por `Skeleton` y `EmptyState` del kit; el error explica el caso real del enlace con el id numérico (§F.C6) |
| — | (no existe) | Móvil / Detalle de orden de compra | **Nuevo** |

### 6.3 Nueva y editar

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| 106-108 | «Volver», «Nueva Orden de Compra», subtítulo | Nueva orden de compra — lista | sustituidos por `PageHeader Variant=form` |
| 110 | «Sucursal *» (`BranchSelectorField`) | Nueva orden de compra — lista | calcado, con la ayuda «El stock entra en esta sucursal al recibir» |
| 111-113 | «Proveedor *» con `SearchSelectCombobox` + botón «Nuevo» | Nueva orden de compra — lista (`SupplierPicker Layout=inline`) · Diálogo / SupplierPicker | **sustituido por `SupplierPicker`** — el encargo del dueño. Gana búsqueda en servidor, teclado, NIT y saldo del proveedor, y el alta rápida que ya trae el componente |
| 114 | «Fecha Esperada de Entrega» | Nueva orden de compra — lista | calcado |
| 115 | «Notas» (`RichTextEditor` que se lee como texto plano) | Nueva orden de compra — lista | sustituido por campo de texto (§F.C8) |
| 117-118 | «Buscar Producto» con `ProductSearchCombobox` | Nueva orden de compra — lista (`ProductPicker Layout=combobox`) · Diálogo / ProductPicker en modo compra | **sustituido por `ProductPicker Mode=purchase`** — el encargo del dueño. Gana debounce de 250 ms, paginación, costo y stock visibles, variantes y modificadores, favoritos y alta rápida; y deja de cargar el catálogo entero en el navegador (§C.4) |
| 119 | Toggle «Mostrar todos / solo del proveedor» | Nueva orden de compra — lista («Solo los de este proveedor») | calcado, y dentro del propio selector en lugar de triplicado en tres archivos (§C.4) |
| 120-122 | «Cantidad», «Costo Unitario ($)», «Agregar Producto» | Nueva orden de compra — lista | sustituidos: la cantidad y el costo se editan **en la línea**, como en las facturas |
| 123 | «No hay productos agregados…» | Nueva orden de compra — vacía | sustituido por `EmptyState` que explica de dónde sale el costo |
| 124-129 | Tabla de ítems editable | Nueva orden de compra — lista (`DocumentLinesTable Mode=edición`) | sustituida por el componente compartido, con los encabezados de compra («Costo unit.», «Subtotal») |
| 130-133 | Sidebar «Resumen» con 3 cifras | Nueva orden de compra — lista (`DocumentTotals Variant=compra`) | sustituido por el componente compartido, que además desglosa impuestos y retenciones. Se ocultan «Pagado» y «Saldo pendiente», que no aplican a una orden |
| 134-135 | «Guardar Borrador» y «Guardar y Enviar» | Nueva orden de compra — lista (barra fija del pie) | calcados, en la barra fija del formulario largo (excepción del patrón 4.1) |
| 136-138 | `QuickCreateDialog` «Nuevo Proveedor» | Diálogo / SupplierPicker | sustituido: el alta rápida vive dentro del `SupplierPicker` |
| 139-145 | Validaciones por toast | Nueva orden de compra — vacía | sustituidas por validación en el propio campo y por el estado deshabilitado del primario |
| 147-169 | Pantalla «Editar» con `Select` planos y sin creación rápida | Editar orden de compra — cargando · ya no es editable | sustituida: **editar es la misma pantalla que crear**, con los mismos selectores. Hoy son dos formularios divergentes y editar borra notas de línea, seriales e ids (§F.C9) |
| 163 | «Solo se pueden editar órdenes en borrador» (toast + redirección) | Editar orden de compra — ya no es editable | sustituido por `EmptyState Variant=forbidden` que explica el motivo y ofrece «Duplicar la orden» |
| — | (no existe) | Móvil / Nueva orden de compra | **Nuevo** |

---

## 7. Lo marcado «Nuevo» (badge en Figma)

1. Banda de **antigüedad accionable** en los dos listados de cartera y banda de **estados** en órdenes de compra.
2. Columna **«Cuotas»** en los dos listados de cartera y **«Recepción»** en el de órdenes.
3. **Selección múltiple y `BulkActionBar`** en cuentas por cobrar y en órdenes de compra.
4. **«Ajustar saldo»**, con motivo obligatorio, y su sustitución de «Marcar como pagada».
5. **Anular un abono o un pago** desde el historial.
6. **Canal y plantilla** del recordatorio, y su historial (hoy solo hay un `last_reminder_date`).
7. **«Aplicar a cuota»** dentro del `AplicarPagoDialog` (propiedad `Mostrar cuota`).
8. **«Recepciones registradas»**: número, fecha, quién recibió, unidades y movimiento de inventario.
9. **Enlaces a contabilidad** (asiento) desde los dos detalles de cartera y desde la orden.
10. **Enlace de vuelta orden ↔ factura de compra** en los dos sentidos.
11. **Móvil** de cuentas por pagar, de órdenes de compra y de los tres detalles.
12. Estados **error** de los dos listados de cartera y del de órdenes.

## 8. Lo omitido, con su motivo

| Omitido | Motivo |
|---|---|
| Pestaña «Estadísticas» de cuentas por cobrar (§C.1 #77-81) | Duplica dos veces las mismas dos métricas y no tiene ninguna serie temporal; sus cifras útiles ya están en los KPI |
| Tabla de aging por cliente (§C.1 #55-63) | Carga toda la cartera en el navegador para agregar en JS y su color mide peso relativo, no antigüedad. La banda accionable cubre la necesidad real: ver y filtrar por tramo |
| Diálogo «Aprobación de Pagos» (§C.3 #61-68) | No cupo en esta tanda. Es la siguiente pantalla: hoy muestra «Pago #xxxxxxxx» para todos, está truncada a 10 registros y sus botones no tienen etiqueta |
| Diálogo «Exportar / Conciliar Banca» (§C.3 #69-80) | Los cuatro formatos generan el mismo CSV y la conciliación es un `setTimeout` con toast de éxito. Rediseñarlo exige decidir antes qué formatos se soportan de verdad (duda 2) |
| Diálogo «Pagar con Open Finance» (§C.3 #81-88) | Desde el listado no puede funcionar (`Number(uuid)`→`NaN`) y sus pagos no salen en ningún historial. Se corrige en código antes de dibujarlo |
| Ruta `/cuentas-por-pagar/[id]/cuotas` (§C.5) | Ruta huérfana que duplica el plan del detalle. Lo único que aportaba —editar la cuota y la barra de progreso— se absorbe en el detalle |
| `SerialCaptureSection` de la orden de compra (§C.3 #94 y #129) | Hoy es inalcanzable: `track_serial` no llega ni al alta ni a la recepción. Se dibuja cuando el código lo reviva |
| Botón «Importar» de órdenes de compra (§C.1 #18) | La ruta `/app/inventario/ordenes-compra/importar` no existe |
| `CustomerPicker` en cartera | Cartera no crea documentos: el cliente llega de la factura o de la venta. Se muestra como dato con enlace a su ficha |

## 9. Recuento

| Medida | Valor |
|---|---|
| Frames nuevos | **54** (33 en `07 Finanzas`, 21 en `04 Inventario`) |
| Secciones nuevas | 8 (5 + 3) |
| Instancias de componentes del kit | 4.300 en las 8 secciones |
| Componentes ampliados (sin duplicar) | 3 — `AplicarPagoDialog`, `DocumentStatusBadge`, `DocumentLinesTable` |
| Componentes nuevos creados | **0** |
| Controles calcados | 118 |
| Controles sustituidos por un componente o patrón del kit | 96 |
| Controles marcados «Nuevo» | 34 |
| Controles omitidos | 9 bloques, todos con motivo (§8) |

## 10. Verificación

Por script sobre el archivo, tras el reflujo final:

| Comprobación | `02 Componentes` | `04 Inventario` | `07 Finanzas` |
|---|---|---|---|
| Secciones que se solapan | 0 | 0 | 0 |
| Frames que se solapan dentro de mis secciones | 0 | 0 | 0 |
| Nodos fuera de su sección | 0 | 0 | 0 |
| Contenido fuera de su frame | 0 | 0 | 0 |
| Instancias rotas | 0 de 3.780 | 0 de 1.617 | 0 de 2.683 |
| Textos propios truncados | 0 | 0 de 467 | 0 de 1.164 |

En `04 Inventario` y en `07 Finanzas` quedan solapes **en secciones ajenas** que ya existían antes
de esta tanda y que no se tocaron: 18 en `Producto — Cabecera`, `Producto — Seriales`,
`Móvil — productos` y `11. Importar desde la web`, y 2 en `Facturas de venta — listado (B.1)` y
`Facturas de compra — detalle (B.6)`. Todos son textos de anotación que se pisan entre sí, no
frames de pantalla.

Capturas: `docs/design/figma/26-cartera-*.png` (18) y `26-ordenes-compra-*.png` (11). Las
`26-*-seccion-*.png` son la vista general de cada Sección; el resto son frames a tamaño legible.
