# Paridad — módulo Clientes en Figma

Fecha: 2026-09-22 · Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`)
· Página **`06 Clientes`** · Componentes nuevos en **`02 Componentes` → Sección «Clientes»**.

Fuente de verdad: `docs/design/AUDITORIA-CONTROLES-CLIENTES-CRM.md` (§A, §B.9-B.18, §G, §H).
Reglas aplicadas: `brief-figma-fidelidad.md` (variables de `01 Sistema`, 0 solapes, anotaciones,
capturas) y `brief-figma-pos-ux-v2.md` (estados con acción, 4 estados por pantalla, paginación
única del kit, nada de `alert()`/`confirm()` nativos).

Sin nombres de organizaciones cliente: los datos de muestra son «Mi empresa S.A.S.»,
«Comercializadora Andina S.A.S.», «Distribuciones del Valle Ltda.» y personas inventadas.

## Índice de frames

| Código | Frame en Figma | Tamaño |
|---|---|---|
| CAT-LISTO | Escritorio / Catálogo de clientes — listo | 1440×900 |
| CAT-CARGA | Escritorio / Catálogo de clientes — cargando | 1440×900 |
| CAT-VACIO | Escritorio / Catálogo de clientes — vacío | 1440×900 |
| CAT-ERROR | Escritorio / Catálogo de clientes — error | 1440×900 |
| CAT-MASIVOS | Escritorio / Catálogo de clientes — selección múltiple (BulkActionBar + menú «Roles» abierto) | 1440×900 |
| CAT-MENU | Escritorio / Catálogo de clientes — menú «⋯» de fila abierto | 1440×900 |
| CAT-FILTROS | Escritorio / Catálogo de clientes — FilterPanel abierto | 1440×900 |
| CAT-MOVIL / -CARGA / -VACIO / -ERROR | Móvil / Catálogo de clientes — listo · cargando · vacío · error | 390×844 |
| DLG-ETIQUETAR | Diálogo «Etiquetar clientes» | 460×300 |
| DLG-QUITAR | Diálogo «Quitar etiqueta» | 460×349 |
| DLG-BORRAR | ConfirmDialog «¿Eliminar 3 clientes?» | 440×186 |
| DLG-UNIFICAR | Diálogo «Unificar clientes duplicados» (rediseñado · Nuevo) | 660×928 |
| IMP-1..4 | ImportWizard — pasos origen · mapeo · previsualización · resultado | 1128×~620 |
| DET-RESUMEN | Escritorio / Detalle de cliente — Resumen | 1440×900 |
| DET-INFO | Escritorio / Detalle de cliente — Información | 1440×900 |
| DET-ACTIVIDAD | Escritorio / Detalle de cliente — Actividad | 1440×900 |
| DET-FINANZAS | Escritorio / Detalle de cliente — Finanzas | 1440×900 |
| DET-OPORT | Escritorio / Detalle de cliente — Oportunidades | 1440×900 |
| DET-CONTACTOS | Escritorio / Detalle de cliente — Contactos (empresa) | 1440×900 |
| DET-NOTAS | Escritorio / Detalle de cliente — Notas y documentos | 1440×900 |
| DET-CARGA / -VACIO / -ERROR | Detalle — cargando · vacío (cliente sin actividad) · error (cliente no encontrado) | 1440×900 |
| DET-MOVIL / -ACT / -CARGA / -ERROR | Móvil / Detalle de cliente — Resumen · Actividad · cargando · error | 390×844 |
| DET-MENU | Menú «⋯» de la cabecera de la ficha | 280×~480 |
| DET-CONFIRM | ConfirmDialog «¿Eliminar a …?» | 440×~200 |
| DLG-CONTACTO-B / -C | Diálogo «Agregar Contacto» — buscar existente · crear nueva persona | 520×806 / 520×736 |
| FORM-NUEVO | Escritorio / Nuevo cliente — listo | 1440×1560 |
| FORM-ERRORES | Escritorio / Nuevo cliente — errores por campo | 1440×1560 |
| FORM-EDITAR | Escritorio / Editar cliente — listo | 1440×1560 |
| FORM-CARGA | Escritorio / Nuevo cliente — cargando | 1440×900 |
| FORM-ERRORORG | Escritorio / Nuevo cliente — error de organización | 1440×900 |
| FORM-MOVIL / -ERR / -EDIT / -CARGA | Móvil / Nuevo cliente · errores · Editar cliente · cargando | 390×1180 |
| DUP-DOC / DUP-CORREO / DUP-AMBOS | DuplicadoDialog — conflicto por documento · correo · ambos | 680×865 |
| SHEET-ALTA | Sheet «Nuevo cliente» (alta rápida única) | 640×563 |
| SHEET-ALTA-MOVIL | Móvil / Alta rápida de cliente (Sheet a pantalla completa) | 390×698 |

> **Regla de anidamiento (corrección del 2026-09-22):** `QuickCustomerForm` del kit trae su
> propia cabecera («Crear nuevo cliente» + X) y su propio pie («Más datos · Cancelar · Guardar
> cliente»). Cuando se instancia **dentro** de un Sheet o de un diálogo, esas dos filas se
> ocultan: manda el contenedor exterior, con un único título, una única X y un único pie.
> Se aplicó en SHEET-ALTA y en DLG-CONTACTO-C. La instancia suelta de la Sección
> «CustomerPicker» sí conserva cabecera y pie porque ahí el componente **es** el contenedor.
>
> **Regla de ancho (corrección del 2026-09-22):** cabecera, cuerpo y pie de todo diálogo usan
> el **mismo ancho**. `QuickCustomerForm` nace con filas de 350 px fijos, así que al
> instanciarlo en un contenedor más ancho hay que poner sus filas y sus campos en `Fill`;
> si no, queda una franja muerta a la derecha. El Sheet se estrechó de 880 a **640 px**
> (opción (a) del coordinador) y además se puso el contenido en `Fill`, porque estrechar solo
> no basta: las filas seguirían midiendo 350.
>
> **Hallazgo para el kit:** `QuickCustomerForm` es de dos columnas fijas y el `layoutMode` de
> sus filas **no se puede sobrescribir desde una instancia**, así que no se apila en 390 px.
> Necesita una variante `Layout=escritorio|movil`. Mientras tanto, SHEET-ALTA-MOVIL compone
> la misma alta con `SegmentedControl` + seis `FormField` del kit, en una sola columna a
> ancho completo.

Componentes nuevos en `02 Componentes` → «Clientes»: `QuickActionsBar`,
`CustomerIdentityCard` (Tipo=persona/empresa), `TimelineEntry` (9 tipos),
`ContactoVinculadoRow` (3 estados), `CarteraRow` (3 tipos), `DuplicadoDialog`.
Reutilizados de la misma sección: `CustomerPicker`, `CustomerRow`, `CustomerCard`,
`QuickCustomerForm`.

---

## A. Clientes `/app/clientes`

### A.0 Lista — contenedor y estados (9)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | `PageHeaderSkeleton` + `FilterBarSkeleton` + `TableSkeleton rows=5 columns=10` | CAT-CARGA | sustituido por instancias `Skeleton` (line/card/rect) + `DataTable State=loading` del kit |
| 2 | «Gestión de Clientes» (h1, icono Users) | CAT-LISTO | calcado (`PageHeader Variant=list`) |
| 3 | «Administra tu cartera de clientes» | CAT-LISTO | calcado |
| 4 | «Actualizar» (RefreshCw) | CAT-LISTO | calcado (IconButton del `PageHeader`) |
| 5 | Banda de error «Error» + `{error}` | CAT-ERROR | sustituido por `EmptyState Variant=error` dentro de la tarjeta de tabla + `Toast Variant=error` |
| 5a | «Reintentar» | CAT-ERROR | calcado (acción del `EmptyState` y del `Toast`) |
| 6 | «No se encontraron clientes» | CAT-VACIO · CAT-MOVIL-VACIO | sustituido por `EmptyState Variant=empty` |
| 6a | «Recargar» | CAT-VACIO | calcado |
| 6b | «Crear cliente» | CAT-VACIO | calcado (+ «Importar desde CSV», Nuevo) |

### A.1 Lista — acciones de cabecera (12)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | «Nuevo cliente» (azul, Plus) | CAT-LISTO | calcado |
| 1a | tooltip «Crear un nuevo cliente» | CAT-LISTO | omitido: el botón lleva texto visible; el tooltip sería redundante |
| 2 | «Etiquetar» (Tag) | CAT-MASIVOS | sustituido: pasa a la `BulkActionBar`, porque hoy está `disabled` sin selección |
| 2a | tooltip «Aplicar etiquetas a clientes seleccionados» | CAT-MASIVOS | omitido: el contador de la barra ya dice sobre cuántos actúa |
| 3 | «Unificar» (Users) | CAT-MASIVOS · DLG-UNIFICAR | sustituido: entra en el «⋯» de la `BulkActionBar` y abre el diálogo rediseñado |
| 3a | tooltip «Unificar clientes duplicados» | CAT-MASIVOS | calcado (tooltip del icono del «⋯») |
| 4 | «Exportar» (Download) | CAT-LISTO | calcado |
| 4a | tooltip «Exportar a CSV» | CAT-LISTO | calcado |
| 5 | «Importar» (Upload) | CAT-LISTO (menú «⋯») · IMP-1 | calcado |
| 5a | tooltip «Importar clientes desde CSV/Excel» | CAT-LISTO | calcado |
| 6 | Botón fantasma (Users, `sr-only` «Fusionar duplicados») | — | omitido: es un accidente de maquetado (§G.8-11) — está dentro de `<Dialog>` sin ser `DialogTrigger` y duplica el #3 con otra regla de `disabled` |
| 6a | tooltip «Fusionar duplicados» | — | omitido con el #6 |

### A.2 Diálogo «Etiquetar clientes» (cabecera) (6)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | Título «Etiquetar clientes» | DLG-ETIQUETAR | calcado |
| 2 | «Aplica una etiqueta a los {n} clientes seleccionados.» | DLG-ETIQUETAR | calcado |
| 3 | Campo «Etiqueta» · placeholder «Nombre de etiqueta» | DLG-ETIQUETAR | calcado (`FormField`) + chips de etiquetas frecuentes (Nuevo) |
| 4 | Banda verde/roja/azul de estado | DLG-QUITAR | calcado |
| 5 | «Cancelar» | DLG-ETIQUETAR | calcado |
| 6 | «Aplicar etiqueta» / «Procesando...» | DLG-ETIQUETAR | calcado |

> El diálogo existe **dos veces** en la misma pantalla (§I.2 #1). En Figma es uno solo con dos modos.

### A.3 Diálogo «Fusionar clientes duplicados» (6)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | Título «Fusionar clientes duplicados» | DLG-UNIFICAR | sustituido por «Unificar clientes duplicados» (rediseño completo) |
| 2 | «Fusiona {n} clientes seleccionados. Selecciona el cliente principal…» | DLG-UNIFICAR | calcado en intención: **ahora sí existe** el selector de principal que el texto prometía |
| 3 | «Funcionalidad de fusión de clientes en desarrollo…» | — | omitido: es el aviso de que no hace nada; el diseño lo reemplaza por la funcionalidad |
| 4 | Banda ámbar «La fusión … no se puede deshacer» | DLG-UNIFICAR | calcado, ampliada con «se ejecuta en una sola transacción (RPC `merge_customers`)» |
| 5 | «Cancelar» | DLG-UNIFICAR | calcado |
| 6 | «Fusionar clientes» (`disabled` fijo, sin `onClick`) | DLG-UNIFICAR | sustituido por «Unificar 3 clientes» activo. **Nuevo**: requiere la RPC `merge_customers`, que hoy no existe (§G.1-4, §H.5) |

### A.4 Diálogo «Importar Clientes» (18)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | Título «Importar Clientes» | IMP-1 | sustituido por `ImportWizard` del kit (5 pasos con barra de progreso) |
| 2 | Descripciones por `importStep` | IMP-1..4 | calcado (una por paso) |
| 3 | «Arrastra un archivo aquí o haz clic para seleccionar» | IMP-1 | calcado |
| 4 | «Formatos soportados: CSV, XLS, XLSX» | IMP-1 | calcado |
| 5 | «Columnas soportadas:» + 17 viñetas | IMP-1 | calcado (las 18 columnas reales, en una línea) |
| 6 | «Descargar Plantilla» | IMP-1 | calcado |
| 7 | «Cancelar» (paso `upload`) | IMP-1 | calcado |
| 8 | 4 contadores «Total / OK / Errores / Pendientes» | IMP-4 | calcado y ampliado a 5 (Creados, Actualizados, Con avisos, Fallidos, Pendientes) |
| 9 | «Modo de importación» + 3 píldoras | IMP-1 | calcado |
| 9a | Explicación del modo | IMP-1 | calcado |
| 10 | Tabla de previsualización (7 columnas, 100 filas) | IMP-3 | sustituido: tabla completa con búsqueda, «Solo errores», «Solo avisos» y edición en línea |
| 10a | Badge «Pendiente / OK / Error» por fila | IMP-3 | calcado (tonos del `SISTEMA-BADGES`) |
| 11 | «Mostrando 100 de {n} filas» | IMP-3 | sustituido por la paginación única del kit («Mostrando 1–50 de 340») |
| 12 | «Cancelar» (paso `preview`) | IMP-3 | calcado («Volver») |
| 13 | «Importar {n} clientes» | IMP-3 | calcado |
| 14 | «Cerrar» | IMP-4 | calcado |
| 15 | «Importar otro archivo» | IMP-4 | calcado |
| 16 | Banda de estado | IMP-4 | calcado |
| — | Mapeo de columnas | IMP-2 | **Nuevo**: hoy el importador mapea a ciegas |
| — | «Descargar errores CSV» y «Deshacer 24 h» | IMP-4 | **Nuevo** |

### A.5 Lista — KPIs y barra de acciones masivas (20)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | stat «Total Clientes» | CAT-LISTO | calcado (`StatCard`) |
| 2 | stat «Con Saldo» | CAT-LISTO | calcado |
| 3 | stat «Cuentas x Cobrar» | CAT-LISTO | calcado; el detalle dice «Moneda de la organización» porque hoy la moneda está cableada a COP (§G.7) |
| 4 | stat «Cuentas Vencidas» | CAT-LISTO | calcado |
| 5 | «{n} cliente(s) seleccionado(s)» | CAT-MASIVOS | calcado (`BulkActionBar`) |
| 6 | «Limpiar» | CAT-MASIVOS | calcado |
| 7 | `Loader2` de proceso masivo | CAT-MASIVOS | sustituido por el estado de carga del propio botón del kit |
| 8 | «Exportar» | CAT-MASIVOS | calcado |
| 9 | «Etiquetar» | CAT-MASIVOS · DLG-ETIQUETAR | calcado |
| 10 | «Quitar etiqueta» | CAT-MASIVOS · DLG-QUITAR | calcado |
| 11 | Menú «Roles» | CAT-MASIVOS | calcado, dibujado ABIERTO |
| 11a | Grupo «Agregar rol» | CAT-MASIVOS | calcado |
| 11b | «Cliente», «Huesped», «Pasajero», «Proveedor», «Empleado» | CAT-MASIVOS | calcado con la acentuación del código («Huesped» sin tilde es el literal real) |
| 11c | Grupo «Quitar rol» | CAT-MASIVOS | calcado |
| 11d | Los mismos 5 roles para quitar | CAT-MASIVOS | calcado |
| 12 | «Eliminar» | CAT-MASIVOS | calcado (`Button Variant=destructive`) |
| 12a | `confirm()` nativo «¿Estás seguro de eliminar {n} cliente(s)?…» | DLG-BORRAR | sustituido por `ConfirmDialog Variant=destructive` (§G.3 #1) |
| 13 | toasts de borrado | CAT-ERROR (patrón) | calcado con `Toast` del kit |
| 14 | toasts de etiqueta agregada | DLG-QUITAR (banda) | calcado |
| 15 | toasts de etiqueta removida | DLG-QUITAR | calcado |
| 16 | toasts de rol cambiado | CAT-MASIVOS | calcado (patrón `Toast`) |

### A.5a Diálogo «Etiquetar» / «Quitar etiqueta» (barra masiva) (7)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | Título según modo | DLG-ETIQUETAR · DLG-QUITAR | calcado |
| 2 | Descripción según modo | DLG-ETIQUETAR · DLG-QUITAR | calcado |
| 3 | Campo «Etiqueta» | DLG-ETIQUETAR | calcado |
| 3a | Atajo `Enter` | DLG-ETIQUETAR | calcado (texto de ayuda «Enter aplica la acción») |
| 4 | Banda de estado | DLG-QUITAR | calcado |
| 5 | «Cancelar» | ambos | calcado |
| 6 | «Aplicar etiqueta» / «Quitar etiqueta» / «Procesando...» | ambos | calcado |

### A.6 Lista — filtros (12)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | «Filtros y opciones» (h2) | CAT-FILTROS | sustituido por la cabecera «Filtros» del `FilterPanel` |
| 2 | Badge con el conteo de filtros activos | CAT-LISTO · CAT-FILTROS | calcado y **corregido**: hoy el conteo excluye el filtro de tipo (§A.6-2) |
| 3 | «Limpiar todo» / «Limpiar» | CAT-FILTROS · CAT-LISTO | calcado («Limpiar (3)» en el panel, «Limpiar todo» en los chips) |
| 4 | Campo «Buscar clientes...» | CAT-LISTO | calcado como buscador único (`SearchBar` con atajo `/`) |
| 5 | Select «Tipo» | CAT-FILTROS | calcado (`SegmentedControl` Todos/Persona/Empresa) |
| 6 | Select «Rol» | CAT-FILTROS | calcado; **corregido**: se alimenta del catálogo `customer_roles`, no de la página cargada |
| 7 | Select «Etiqueta» | CAT-FILTROS | calcado; mismo corrección |
| 8 | Select «Ciudad» | CAT-FILTROS | calcado como «Municipio» (el dato real es `municipality_name`) |
| 9 | Select «Saldo» | CAT-FILTROS | calcado |
| 10 | Select «Ordenar por» | CAT-LISTO | sustituido por `SortMenu` del kit, fuera del panel (es orden, no filtro) |
| 11 | Botón «Filtros aplicados» / «Sin filtros» (solo ≥lg) | CAT-LISTO | sustituido por `FilterButton` con contador, visible en todos los breakpoints |
| 11a | Tooltip con la lista de filtros activos | CAT-LISTO | sustituido por `FilterChips` visibles; **corregido**: hoy el orden se imprime con su valor interno (`balance_desc`) |

### A.7 Lista — tabla (21)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | `TableSkeleton rows=5 columns=10` | CAT-CARGA | sustituido por `DataTable State=loading` |
| 2 | «No se encontraron clientes con los filtros aplicados» | CAT-VACIO | sustituido por `EmptyState Variant=empty` con acción |
| 3 | Checkbox de cabecera «Seleccionar todos» | CAT-LISTO · CAT-MASIVOS | calcado; el estado indeterminado usa `TableCell Variant=checkbox-mixed`, no solo color |
| 4 | 9 columnas + checkbox | CAT-LISTO | calcado: Cliente · Contacto · Documento · Municipio · Etiquetas · Cuentas por Cobrar · Ventas · Última compra · Acciones |
| 5 | Checkbox por fila | CAT-LISTO | calcado |
| 6 | Avatar 40×40 | CAT-LISTO | calcado (`Avatar Size=sm Type=initials`) |
| 7 | `CopyableId` con el nombre | CAT-LISTO | calcado (nombre clicable; copiar el UUID pasa al menú «⋯») |
| 8 | Badge «Empresa» / «Persona» | CAT-LISTO | calcado con los tonos de `SISTEMA-BADGES` (información / neutro) |
| 9 | «Contacto: {nombre} ({cargo})» | CAT-LISTO | calcado |
| 10 | Badge del **primer** rol | CAT-LISTO | calcado |
| 11 | Email y teléfono apilados | CAT-LISTO | calcado |
| 12 | «{doc_type}: {doc_number}» / «No registrado» | CAT-LISTO | calcado (+ DV en segunda línea para NIT) |
| 13 | Municipio / «--» | CAT-LISTO | calcado |
| 14 | Hasta 2 etiquetas + «+{n}» | CAT-LISTO | calcado |
| 15 | Saldo coloreado | CAT-LISTO | calcado con los tokens `state/*-text` |
| 15a | Badge «Vencida / Pago parcial / Pendiente / Al día» + días | CAT-LISTO | calcado; los días van **dentro** de la etiqueta («Vencida 12 d»), según `SISTEMA-BADGES` |
| 16 | Total vendido + «{n} compras» | CAT-LISTO | calcado |
| 17 | Fecha `dd MMM yyyy` / «Sin compras» | CAT-LISTO | calcado; el diseño asume `useFormatDate()` con la zona de la organización (§G.6) |
| 18 | Menú «⋯» por fila | CAT-MENU | calcado, dibujado ABIERTO |
| 18a | Grupo «Acciones» | CAT-MENU | calcado |
| 18b | «Ver detalles» | CAT-MENU | calcado |
| 18c | «Editar» | CAT-MENU | calcado |
| 18d | «Activar» / «Desactivar» (handler vacío, columna inexistente) | CAT-MENU | sustituido por «Marcar como inactivo» (escribe `lifecycle_stage`), marcado **Nuevo** (§G.1-3, §H.1-1) |
| — | «Registrar pago», «Nueva oportunidad», «Copiar identificador», «Eliminar» | CAT-MENU | **Nuevo** |
| — | Ordenamiento por columna | CAT-LISTO | **Nuevo**: hoy solo se ordena desde el select (A.6-10); las cabeceras ordenables llevan la flecha del kit |
| — | Vista de tarjetas en móvil | CAT-MOVIL | **Nuevo**: hoy la tabla hace scroll horizontal con las 10 columnas; se sustituye por `CustomerRow` del kit |

### A.8 Lista — paginación (8)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | «Mostrando {a} - {b} de {total} registros» | CAT-LISTO | calcado (propiedad `Resumen` de `Pagination`) |
| 2 | Select de tamaño (10·20·40·80) | CAT-LISTO | calcado |
| 3 | «Primera página» | CAT-LISTO | calcado |
| 4 | «Página anterior» | CAT-LISTO | calcado |
| 5 | Números con «...» | CAT-LISTO | calcado |
| 6 | «{n} / {total}» compacto | CAT-MOVIL | calcado (`Pagination Layout=compact`) |
| 7 | «Página siguiente» | CAT-LISTO | calcado |
| 8 | «Última página» | CAT-LISTO | calcado |

> Toda la paginación es **una sola instancia** del componente `Pagination` del kit (decisión D5 del brief del POS).

---

### A.9 Detalle — contenedor y pestañas (12)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | `PageHeaderSkeleton` + `DetailSkeleton` | DET-CARGA · DET-MOVIL-CARGA | sustituido por instancias `Skeleton` |
| 2 | «Cliente no encontrado» + mensaje | DET-ERROR · DET-MOVIL-ERROR | sustituido por `EmptyState Variant=error`, con el motivo real (incluida la sucursal filtrada) |
| 2a | «Volver a clientes» | DET-ERROR | calcado |
| 3 | Botón ArrowLeft | DET-* | calcado (`PageHeader Variant=detail`) |
| 4 | `{full_name}` (h1) | DET-* | calcado |
| 5 | Migas «Clientes / Perfil» (no clicables) | DET-* | sustituido por `Breadcrumbs` reales: Inicio › Clientes › {nombre} |
| 6 | Pestaña «Resumen» | DET-RESUMEN | calcado |
| 7 | Pestaña «Información» | DET-INFO | calcado |
| 8 | Pestaña «Oportunidades» | DET-OPORT | calcado |
| 9 | Pestaña «Timeline» | DET-ACTIVIDAD | sustituido: se fusiona con «Actividad» de la ficha del CRM (§I.2 #3) |
| 10 | Pestaña «Cuentas por cobrar» | DET-FINANZAS | sustituido: se fusiona con «Finanzas» de la ficha del CRM |
| 11 | Pestaña «Notas y archivos» | DET-NOTAS | sustituido por «Notas y documentos» (los archivos dejan de ser un placeholder) |
| 12 | Pestaña «Contactos» (solo empresa) | DET-CONTACTOS | calcado |

### A.10 Detalle — cabecera del perfil (14)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | Avatar 64×64 con overlay Camera | DET-* (`CustomerIdentityCard`) | calcado |
| 1a | `Loader2` de subida | — | omitido: el estado de subida vive en el componente `ImageUploader`, ya dibujado en FORM-NUEVO |
| 1b-1e | toasts de validación y éxito del avatar | FORM-NUEVO (ayuda del campo) | sustituido: la restricción («máx. 5 MB», «solo imágenes») se dice **antes**, en el campo |
| 2 | `{nombreCompleto}` (h1) | DET-* | calcado (en el `PageHeader`) |
| 3 | Badge «Empresa» / «Persona» | DET-* | calcado |
| 4 | «Contacto: {nombre} ({cargo})» | DET-* | calcado («Contacto principal:») |
| 5 | Chips «Vinculado a:» por empresa | `CustomerIdentityCard Tipo=persona` | calcado |
| 6 | `{cliente.email}` | DET-* | calcado, junto al documento, teléfono y dirección |
| 7 | Badge `NivelFidelidad` «Oro/Plata/Bronce/Básico» | DET-* | calcado; en la anotación se advierte que hoy se **deriva de las etiquetas** y no hay programa de fidelidad real |
| 8 | «Volver» | DET-* | calcado (flecha del `PageHeader`) |
| 9 | «Editar» | DET-* | calcado |
| — | Menú «⋯» del perfil | DET-MENU | **Nuevo**: hoy no existe (duplicar, desactivar, eliminar, exportar ficha, estado de cuenta, unificar) |
| — | Badges de etapa (`lifecycle_stage`) y `health_score` | DET-* | **Nuevo en esta ficha**: vienen de la ficha huérfana del CRM (§B.10 #4 y #5) |

### A.11 Detalle › «Resumen» (13)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | `StatsSkeleton count=4` (con 6 KPIs) | DET-CARGA | sustituido y **corregido**: el esqueleto pinta los mismos 6 bloques que el contenido |
| 2 | Banda roja de error | DET-ERROR | sustituido por `EmptyState Variant=error` |
| 3 | stat «Compras» + «Última: {fecha}» | DET-RESUMEN | calcado |
| 4 | stat «Estadías» + «Última: {fecha}» | DET-RESUMEN | calcado |
| 5 | stat «Gasto Total» + «Incluye pedidos web pagados» | DET-RESUMEN | calcado |
| 6 | stat «Pedidos Web» + «Último: {fecha}» | DET-RESUMEN | calcado |
| 7 | stat «Reservas Futuras» | DET-RESUMEN | sustituido por «Saldo en cartera», que es el dato que el usuario busca en esta ficha; las reservas futuras siguen en el timeline |
| 8 | stat «Saldo Folios» + «{n} item(s) pendiente(s)» | DET-RESUMEN | calcado |
| 9 | «Historial Reciente» (h3) | DET-RESUMEN | calcado |
| 10 | Lista de hasta 8 hitos | DET-RESUMEN | calcado con `TimelineEntry` (3 visibles + «Ver toda la actividad») |
| 10a | Badge con el `status` **crudo** de la BD | DET-RESUMEN | sustituido: los estados se traducen («Pagada», «Confirmada») y usan la tabla de tonos |
| 10b | Importe y fecha por hito | DET-RESUMEN | calcado |
| 11 | «No hay actividad reciente para este cliente.» | DET-VACIO | sustituido por `EmptyState` con acción |
| — | Enlaces a la venta / reserva / pedido | DET-RESUMEN | **Nuevo**: hoy la pestaña no tiene un solo control interactivo |

### A.12 Detalle › «Información» (21)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | `CardListSkeleton cards=4` | DET-CARGA | sustituido por `Skeleton` |
| 2 | «Error: {mensaje}» | DET-ERROR | sustituido por `EmptyState Variant=error` |
| 3 | «Información completa del cliente» (h3) | DET-INFO | omitido: la pestaña ya se llama «Información»; el h3 repetía el rótulo |
| 4 | Tarjeta «Datos de la empresa» / «Datos personales» | DET-INFO | calcado |
| 4a | «Razón Social» / «Nombre completo» | DET-INFO | calcado |
| 4b | «Persona de contacto» | DET-INFO | calcado |
| 4c | «Nombre Comercial» | DET-INFO | calcado |
| 4d | «Correo electrónico» / «Teléfono» / «Identificación» | DET-INFO | calcado |
| 5 | Tarjeta «Dirección» | DET-INFO | calcado |
| 5a | «Dirección completa» · «Municipio» · «Estado/Provincia» · «Código postal» | DET-INFO | calcado |
| 6 | Tarjeta «Empresas vinculadas» | `CustomerIdentityCard Tipo=persona` | sustituido: sube a la cabecera de identidad, donde se ve sin cambiar de pestaña |
| 6a | Enlace a la empresa | `CustomerIdentityCard` | calcado (chip clicable) |
| 6b | Badge «Principal» | `CustomerIdentityCard` · `ContactoVinculadoRow` | calcado |
| 7 | Tarjeta «Datos Fiscales» / «Datos Empresariales y Fiscales» | DET-INFO | calcado |
| 7a | «Razón Social» · «Nombre Comercial» · «Dígito de Verificación (DV)» | DET-INFO | calcado |
| 7b | «Responsabilidad Fiscal (DIAN)» + chips | DET-INFO | calcado |
| 8 | Tarjeta «Roles y etiquetas» | DET-INFO | calcado |
| 8a | «Roles» | DET-INFO | calcado |
| 8b | «Etiquetas» | DET-INFO | calcado |
| 8c | «Cliente registrado» | DET-INFO | calcado |
| 9 | Tarjeta «Datos del sistema» | DET-INFO | calcado |
| 9a | «ID del cliente» · «ID de organización» · «Fecha de alta» · «Última actualización» | DET-INFO | calcado; se sustituye «ID de organización» por «Sucursal», que sí significa algo para el usuario |
| 10 | Tarjeta «Notas» | DET-NOTAS | sustituido: las notas se editan en su pestaña, no se repiten aquí |
| 11 | Tarjeta «Preferencias» | DET-INFO | calcado, junto a los campos de solo lectura (`do_not_call`, zona horaria, tamaño de empresa) |
| — | Lápiz «Editar» por tarjeta | DET-INFO | **Nuevo**: hoy toda la pestaña es de solo lectura y cualquier cambio obliga a abrir `/editar` |
| — | Badge «Solo lectura» | DET-INFO | **Nuevo**: marca las 11 columnas que la BD tiene y ningún formulario escribe (§H.1-6) |

### A.13 Detalle › «Oportunidades» (11)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | `DetailSkeleton` | DET-CARGA | sustituido por `Skeleton` |
| 2 | Banda roja de error | DET-ERROR | sustituido por `EmptyState Variant=error` |
| 3 | «Sin oportunidades» + «Este cliente aún no tiene oportunidades…» | DET-VACIO | sustituido por `EmptyState` **con** «Nueva oportunidad» (hoy el vacío no tiene botón) |
| 4 | stats «Total» / «Abiertas» / «Ganadas» | DET-OPORT | calcado, más «Perdidas» |
| 5 | «Oportunidades ({n})» | DET-OPORT | calcado |
| 6 | Tarjeta de oportunidad clicable | DET-OPORT | calcado |
| 6a | Nombre + pipeline | DET-OPORT | calcado |
| 6b | Badge de etapa con su color | DET-OPORT | calcado |
| 6c | Importe | DET-OPORT | calcado; la anotación fija que la moneda sale de `opportunities.currency` (default `USD`), no de un `'COP'` cableado (§G.7) |
| 6d | Badge «Abierta» / «Ganada» / «Perdida» | DET-OPORT | calcado |
| 6e | «Cierre esperado: {fecha}» | DET-OPORT | calcado |

### A.14 Detalle › «Timeline» (16) — fusionada en «Actividad»

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | `CardListSkeleton cards=3` | DET-CARGA | sustituido por `Skeleton` |
| 2 | Banda roja de error | DET-ACTIVIDAD | sustituido por el bloque de error con «Reintentar» del timeline del CRM (§B.18 #10) |
| 3 | «No hay actividad reciente» + descripción | DET-VACIO | sustituido por `EmptyState` **con** `QuickActionsBar` (§B.18 #11) |
| 4 | «Historial de Actividad» (h3) | DET-ACTIVIDAD | calcado |
| 5 | Línea vertical + icono por tipo (4 orígenes) | DET-ACTIVIDAD | sustituido por `TimelineEntry` con **9** tipos |
| 6 | Título + fecha + descripción HTML | DET-ACTIVIDAD | calcado |
| 7 | «Monto: {importe}» | DET-ACTIVIDAD | calcado (en la descripción de la entrada) |
| 8 | Badge «Estado: {status}» | DET-ACTIVIDAD | calcado, con estados traducidos |
| 9 | Badge «Pago: {paymentStatus}» | DET-ACTIVIDAD | calcado («Pagada») |
| 10 | Badge «Espacio(s):» | `TimelineEntry Tipo=reserva` | calcado |
| 11 | «Check-in / Check-out» | `TimelineEntry Tipo=reserva` | calcado; la anotación recuerda que hoy usa `es-ES` cableado y sin zona de la organización (§G.6) |
| 12 | Badge «Folio: {n} item(s)» | `TimelineEntry Tipo=reserva` · `CarteraRow Tipo=folio` | calcado |
| 12a | «{n} pendiente(s) · {importe}» / «Todo pagado» | `CarteraRow Tipo=folio` | calcado |
| 12b | «Saldo: {importe}» | `CarteraRow Tipo=folio` | calcado |
| 12c | «Ver folio →» | `CarteraRow Tipo=folio` («Ver») | calcado |
| 13 | «Sin consumos registrados en folio» | — | omitido: caso extremo de una reserva con folio vacío; el estado vacío de la pestaña ya lo cubre |
| — | Filtros, paginación y acciones rápidas | DET-ACTIVIDAD | **Nuevo en esta ficha**: vienen del timeline del CRM (§B.18) |

### A.15 Detalle › «Cuentas por cobrar» (17) — fusionada en «Finanzas»

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | `TableSkeleton rows=5 columns=5` | DET-CARGA | sustituido por `Skeleton` |
| 2 | Banda roja de error (inalcanzable) | DET-ERROR | sustituido por `EmptyState Variant=error`; la anotación señala que hoy el `catch` vacía la lista y nunca fija `error` |
| 3 | «No hay cuentas por cobrar» + descripción | DET-VACIO | sustituido por `EmptyState` con acción |
| 4 | «Folios PMS con Saldo Pendiente» + total | DET-FINANZAS | calcado |
| 4a | Badge del espacio | `CarteraRow Tipo=folio` | calcado |
| 4b | Badge «Abierto» / «Cerrado» | `CarteraRow Tipo=folio` | calcado |
| 4c | «{d mes} → {d mes}» | `CarteraRow Tipo=folio` | calcado |
| 4d | «{n} de {m} items pendientes» | `CarteraRow Tipo=folio` | calcado |
| 4e | «Ver folio» | `CarteraRow` | calcado |
| 5 | stat «Total Deuda» | DET-FINANZAS | calcado («Deuda Total») |
| 6 | stat «Monto Vencido» | DET-FINANZAS | calcado (dentro de «Facturas por Cobrar · 1 vencida hace 12 d») |
| 7 | stat «Pendiente de Pago» | DET-FINANZAS | calcado («Folios Pendientes») |
| 8 | Tabla «ID VENTA / MONTO / BALANCE / VENCIMIENTO / ESTADO» | DET-FINANZAS | sustituido por `CarteraRow`: la tabla de 5 columnas en mayúsculas se convierte en filas legibles con acción |
| 8a | `{sale_id}` UUID completo | DET-FINANZAS | sustituido por «Cuenta por cobrar · Venta #A1B2C3D4» (8 caracteres, como en el resto de la app) |
| 8b | Vencimiento sin locale ni zona | DET-FINANZAS | calcado y corregido a `dd MMM aaaa` con la zona de la organización |
| 8c | Badge «Pagado / Vencido (n días) / Atrasado (n días) / Pendiente» | `CarteraRow` | calcado, unificado con la tabla de tonos («Vencida 12 d») |
| 9 | «Mostrar» + select + «por página» | DET-FINANZAS | sustituido por la paginación única del kit |
| 10 | «{a} - {b} de {total} cuentas» | DET-FINANZAS | calcado (propiedad `Resumen`) |
| 11 | Botones de navegación | DET-FINANZAS | calcado |
| 12 | «Página {n} de {total}» | DET-FINANZAS | calcado |
| — | «Registrar pago», «Enviar recordatorio», «Estado de cuenta (PDF)» | DET-FINANZAS | **Nuevo**: hoy la pestaña no ofrece ninguna acción sobre la cartera |

### A.16 Detalle › «Notas y archivos» (13)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | Banda roja de error | DET-ERROR | sustituido por `EmptyState Variant=error` |
| 2 | «Agregar Nota» (h3) | DET-NOTAS | calcado |
| 3 | `RichTextEditor` · «Escriba una nota sobre este cliente...» | DET-NOTAS | calcado |
| 4 | «Guardar Nota» / «Guardando...» | DET-NOTAS | calcado |
| 5 | «Notas ({n})» | DET-NOTAS | calcado |
| 6 | «No hay notas» + descripción | DET-VACIO | sustituido por `EmptyState` con acción |
| 7 | Avatar + autor + fecha | DET-NOTAS | calcado |
| 8 | Chincheta (fijar) | DET-NOTAS | calcado (nota fijada con borde y fondo ámbar) |
| 9 | Papelera | DET-NOTAS | calcado |
| 9a | `confirm()` nativo «¿Está seguro de eliminar esta nota?» | DET-CONFIRM (patrón) | sustituido por `ConfirmDialog` (§G.3 #2) |
| 10 | Badge «Oportunidad: {nombre}» | DET-NOTAS | calcado (tono información) |
| 11 | Cuerpo de la nota | DET-NOTAS | calcado |
| 12 | «Archivos» + «La funcionalidad de archivos estará disponible próximamente.» | DET-NOTAS | sustituido por el `DocumentUploader` real de la ficha del CRM (§B.16) |
| — | Botón «Editar nota» | DET-NOTAS | **Nuevo**: la lógica de `update` ya existe en el archivo y no está expuesta |
| — | `alert()` de error al guardar/actualizar/eliminar | DET-NOTAS | sustituido por `Toast Variant=error` (§G.3 #3) |

### A.17 Detalle › «Contactos» + modal (30)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | «Contactos de la Empresa» (h3) | DET-CONTACTOS | calcado |
| 2 | Badge con el número | DET-CONTACTOS | calcado |
| 3 | «Vincular Contacto» | DET-CONTACTOS | calcado |
| 4 | `CardListSkeleton cards=3` | DET-CARGA | sustituido por `Skeleton` |
| 5 | «No hay contactos vinculados a esta empresa» | DET-VACIO | sustituido por `EmptyState` |
| 5a | «Vincular primer contacto» | DET-VACIO | calcado |
| 6 | Fila de contacto (avatar + nombre) | `ContactoVinculadoRow State=default` | calcado |
| 6a | Badge «Nuevo» (pendiente de crear) | `ContactoVinculadoRow State=nuevo` | calcado |
| 6b | Badge «Principal» | `ContactoVinculadoRow` | calcado |
| 6c | Email y teléfono | `ContactoVinculadoRow` | calcado |
| 7 | Cargo o «Sin cargo (click para editar)» | `ContactoVinculadoRow` | calcado (corregido a «Sin cargo (clic para editar)») |
| 7a | Campo «Cargo (ej: Gerente)» en línea | `ContactoVinculadoRow State=editando-cargo` | calcado |
| 7b | `Enter` guarda · `Escape` cancela | DET-CONTACTOS (anotación) | calcado |
| 7c | Botón Check | `ContactoVinculadoRow State=editando-cargo` | calcado |
| 8 | Estrella «Marcar como principal» | `ContactoVinculadoRow` | calcado |
| 9 | Papelera «Desvincular contacto» (sin confirmación) | DET-CONTACTOS | sustituido: abre `ConfirmDialog` (§G.4 #2) |
| 10 | 15 toasts del gestor | DET-CONTACTOS | calcado con `Toast` del kit (patrón; no se dibujan los 15) |
| A.17a-1 | Modal «Agregar Contacto» (div con overlay) | DLG-CONTACTO-B | sustituido por un diálogo del kit con `role="dialog"`, `Escape` y foco atrapado |
| A.17a-2 | Botón X | DLG-CONTACTO-B | calcado |
| A.17a-3 | Segmento «Buscar existente» / «Crear nueva persona» | DLG-CONTACTO-B · -C | calcado (`SegmentedControl`) |
| A.17a-4 | Campo «Buscar persona existente» | DLG-CONTACTO-B | sustituido por `CustomerPicker Layout=inline` (§I.3) |
| A.17a-4a | Skeleton de búsqueda | `CustomerPicker State=loading` | calcado |
| A.17a-5 | Fila de resultado | `CustomerPicker` / `CustomerRow` | calcado |
| A.17a-6 | «No se encontraron personas con ese criterio.» | `CustomerPicker State=empty` | calcado |
| A.17a-6a | «Crear nueva persona» | DLG-CONTACTO-C | calcado |
| A.17a-7 | Tarjeta de la persona elegida | `CustomerPicker` | calcado |
| A.17a-7a | Botón X de deshacer selección | `CustomerPicker` | calcado |
| A.17a-8 | «Cargo (opcional)» | DLG-CONTACTO-B | calcado |
| A.17a-9 | «Cancelar» | DLG-CONTACTO-B · -C | calcado |
| A.17a-10 | «Vincular» | DLG-CONTACTO-B | calcado |
| A.17a-11..18 | «Nombre *», «Apellido *», «Email», «Teléfono», «Tipo de documento», «N° documento», «Ubicación», «Cargo» | DLG-CONTACTO-C | sustituido por `QuickCustomerForm` del kit **sin su cabecera ni su pie propios**: es el cuarto alta de cliente del módulo (§I.3) y no debe divergir ni duplicar el marco del diálogo |
| A.17a-15 | Lista cableada de 5 tipos de documento | DLG-CONTACTO-C | sustituido: el catálogo sale de `country_identification_types`, como en el `ClientForm` |
| A.17a-19 | «Cancelar» | DLG-CONTACTO-C | calcado |
| A.17a-20 | «Crear y vincular» | DLG-CONTACTO-C | calcado |

### A.18 Detalle › barra lateral «Tareas» (12)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | «Tareas» + `CardListSkeleton` | DET-CARGA | sustituido por `Skeleton` |
| 2 | «Tareas» + banda roja | DET-ERROR | sustituido por `EmptyState Variant=error` |
| 3 | «Tareas Pendientes» + badge del conteo | DET-* (barra lateral) | calcado |
| 4 | «No hay tareas pendientes para este cliente» | DET-VACIO | calcado, **con** «Crear la primera tarea» |
| 5 | Tarjeta de tarea (icono + título + descripción) | DET-* | calcado |
| 5a | Badge «Alta / Media / Baja / Normal» | DET-* | calcado con la tabla de tonos |
| 5b | Badge «Pendiente / En progreso / Completada / Cancelada» | DET-* | calcado y **corregido**: el default de la columna es `'open'`, que hoy cae en el ramal «valor crudo» (§G.10-6) |
| 5c | Fecha relativa (rojo si vencida) | DET-* | calcado («Vence mañana», «En 3 días») |
| 5d | Asignado o «Sin asignar» | DET-* | calcado (en la descripción) |
| 6 | «Tareas Finalizadas» + badge | DET-* | calcado (bloque plegado) |
| 7 | «No hay tareas finalizadas para este cliente» | DET-VACIO | calcado |
| 8 | Tarjeta atenuada de tarea finalizada | DET-* | calcado (dentro del bloque plegado) |
| 9 | «Ver todas las tareas» → `/app/tareas` (**ruta inexistente**) | DET-* | sustituido por «Ver todas las tareas del cliente», que filtra en la pestaña de actividad; el enlace a una ruta 404 no se calca (§G.2 #1) |
| — | «Nueva» tarea | DET-* | **Nuevo**: hoy la barra es solo lectura |

### A.19 Crear y editar — contenedores (8)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | `PageHeaderSkeleton` + `DetailSkeleton` | FORM-CARGA · FORM-MOVIL-CARGA | sustituido por `Skeleton` |
| 2 | Botón ArrowLeft | FORM-NUEVO · FORM-EDITAR | calcado |
| 3 | «Crear Nuevo Cliente» (UserPlus azul) | FORM-NUEVO | calcado |
| 3a | «Completa la información para registrar un nuevo cliente» | FORM-NUEVO | calcado |
| 4 | «Editar Cliente» (UserCog ámbar) | FORM-EDITAR | calcado |
| 4a | «Modifica la información del cliente» | FORM-EDITAR | calcado |
| 5 | «Ver Lista de Clientes» (solo en editar) | FORM-EDITAR | calcado |
| 6 | Tarjeta de error de organización (3 mensajes) | FORM-ERRORORG | sustituido por `EmptyState Variant=error` con un solo bloque y su acción |
| 6a | «Volver a clientes» | FORM-ERRORORG | calcado |

### A.20 `ClientForm` — el formulario completo (34)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | `DetailSkeleton` en edición | FORM-CARGA | sustituido por `Skeleton` |
| 2 | `Alert variant="destructive"` con `{error}` | FORM-ERRORES | calcado (banda roja «Revisa 3 campos antes de guardar…») |
| 3 | Cabecera «Información Personal» + descripción | FORM-NUEVO | calcado |
| 4 | Avatar 80×80 con overlay Camera | FORM-NUEVO | sustituido por `ImageUploader` del kit |
| 4a | «Foto del cliente» + ayuda según el modo | FORM-NUEVO · FORM-EDITAR | calcado (los dos textos, uno por modo) |
| 5 | «Tipo de Cliente» + 2 tarjetas Persona/Empresa | FORM-NUEVO | sustituido por `SegmentedControl` del kit |
| 6 | «Razón Social *» | FORM-NUEVO · FORM-ERRORES | calcado |
| 7 | «Nombre Comercial» | FORM-NUEVO | calcado |
| 8 | «Nombre *» | FORM-MOVIL (Persona) | calcado |
| 9 | «Apellido *» | FORM-MOVIL (Persona) | calcado |
| 10 | «Empresa a la que pertenece (opcional)» | FORM-NUEVO (anotación) | calcado; el `<select>` nativo pasa a `SearchSelect` del kit |
| 10a | «Vincula esta persona como cliente hijo de una empresa» | FORM-NUEVO | calcado |
| 11 | «Tipo de Documento» (`<select>` nativo) | FORM-NUEVO | calcado, con `Select` del kit |
| 12 | «Número de Documento» | FORM-NUEVO · FORM-ERRORES | calcado, con la ayuda «Al salir del campo consultamos DIAN/RUES» |
| 13 | Botón «Consultar DIAN/RUES» | FORM-NUEVO | calcado, con texto visible en vez de solo icono |
| 13a | `HabeasDataCheckbox` (marcada por defecto) | FORM-NUEVO | calcado con el texto legal completo |
| 13b-13c | toasts «Autocompletado» / «Sin resultados» / «Error» | FORM-NUEVO | calcado con `Toast` del kit (patrón) |
| 14 | «DV» (`maxLength=1`, `w-20`) | FORM-NUEVO | calcado |
| 15 | Cabecera «Clasificación y Roles» | FORM-NUEVO | calcado |
| 16 | «Roles del Cliente» (tarjetas-checkbox del catálogo) | FORM-NUEVO | calcado (`Checkbox` del kit, los 5 roles) |
| 17 | «Responsabilidad Fiscal (DIAN)» (tarjetas-checkbox) | FORM-NUEVO | sustituido por `Chip Variant=filter`: son 20+ códigos y las tarjetas no caben |
| 18 | Cabecera «Datos de Contacto» | FORM-NUEVO | calcado |
| 19 | «Correo Electrónico» | FORM-NUEVO · FORM-ERRORES | calcado |
| 20 | «Teléfono» (`PhoneInput`) | FORM-NUEVO | calcado |
| 21 | «Dirección» | FORM-NUEVO | calcado |
| 22 | «Ubicación» (`LocationSelector`) | FORM-NUEVO | calcado, como 3 `Select` (País · Departamento · Municipio) |
| 23 | `CompanyContactsManager` embebido | FORM-NUEVO (sección «Contactos de la Empresa») | calcado, con `ContactoVinculadoRow State=nuevo` para los pendientes |
| 24 | Cabecera «Información Adicional» | FORM-NUEVO | calcado |
| 25 | «Etiquetas» (texto libre con comas) | FORM-NUEVO | calcado |
| 25a | «Separa las etiquetas con comas…» | FORM-NUEVO | calcado |
| 26 | «Notas Internas» (`RichTextEditor`) | FORM-NUEVO | calcado |
| 26a | «Estas notas son solo para uso interno…» | FORM-NUEVO | calcado |
| 27 | «Los campos marcados con * son obligatorios» | FORM-NUEVO | calcado |
| 28 | «Cancelar» | FORM-NUEVO | calcado |
| 29 | «Guardar Cliente» / «Guardar Cambios» | FORM-NUEVO · FORM-EDITAR | calcado |
| 30-34 | toasts de éxito, error y avatar | FORM-ERRORES (patrón) | sustituido: los errores de unicidad se validan **antes** de enviar y se muestran en el campo, no como error crudo de Postgres en un toast |
| — | Errores por campo con `role="alert"` y foco dirigido | FORM-ERRORES · FORM-MOVIL-ERR | **Nuevo**: hoy no hay esquema de validación (ni Zod ni react-hook-form) |
| — | Barra de acciones fija en móvil | FORM-MOVIL | **Nuevo** |

### A.21 Diálogo «Cliente Duplicado Detectado» (8)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | Título «Cliente Duplicado Detectado» | DUP-DOC | sustituido por «Ya existe un cliente con estos datos» (dice qué pasó, no solo que pasó) |
| 2 | «Se ha encontrado un cliente con el mismo documento o correo electrónico.» | DUP-DOC · DUP-CORREO · DUP-AMBOS | sustituido por un texto por caso, que nombra el valor exacto en conflicto |
| 3 | Tarjeta «Cliente Existente» (Nombre/Email/Documento/Roles) | DUP-* | sustituido por una comparación **campo a campo** con las diferencias resaltadas |
| 4 | Tarjeta «Nuevo Cliente» | DUP-* | sustituido por la columna «Lo que escribiste» de la misma comparación |
| 5 | «¿Qué acción desea realizar?» (banda ámbar) | DUP-* | calcado |
| 6 | «Usar Existente» | DUP-* | calcado («Abrir el cliente existente») |
| 7 | «Actualizar Existente» | DUP-* | sustituido: **casillas por campo** y texto explícito «Nunca cambia el tipo de cliente ni borra razón social, DV, responsabilidades fiscales ni empresa asociada» (§G.1-6) |
| 8 | «Crear como Nuevo» (**falla siempre**) | DUP-* | sustituido: queda **bloqueado** con el motivo exacto y un badge «Bloqueado». Se habilita solo si el usuario cambia el documento o el correo (§G.1-5, §H.1) |

---

## B. CRM: clientes

### B.9 `/app/crm/clientes`

| # | Control | Frame | Estado |
|---|---|---|---|
| — | Listado re-exportado de `/app/clientes` | CAT-* | calcado: **un solo juego de frames sirve para las dos rutas**. La anotación fija que los enlaces de fila deben llevar a la ficha unificada, no a dos fichas distintas (§I.1) |

### B.10 Ficha CRM — cabecera (5)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | ArrowLeft con `router.back()` | DET-* | sustituido: la vuelta es a `/app/clientes`, no al historial |
| 2 | Nombre completo (h1) | DET-* | calcado |
| 3 | Badge «Empresa» / «Persona» | DET-* · `CustomerIdentityCard` | calcado |
| 4 | Badge «Lead / Oportunidad / Cliente / Inactivo» (`lifecycle_stage`) | DET-* | calcado. **Nuevo en la ficha unificada**; además el `ClientForm` no sabe escribir el campo (§H.1-3) |
| 5 | Badge de `health_score` con icono HeartPulse | DET-* · barra lateral | calcado |
| — | Botón «Editar» y menú «⋯» | DET-* · DET-MENU | **Nuevo en esta ficha**: la del CRM no tiene ninguno de los dos |

### B.11 Ficha CRM — acciones rápidas (13)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | Menú «Llamar» (Phone + chevron) | `QuickActionsBar` | calcado |
| 2 | «Desde el navegador» | `QuickActionsBar` (anotación) | calcado, con el motivo de deshabilitado en el tooltip |
| 3 | «Desde mi celular» | `QuickActionsBar` | calcado |
| 4 | «Agente IA» (siempre deshabilitado) | `QuickActionsBar` | calcado, con el motivo «Disponible al finalizar F6 (agentes de voz)» |
| 5 | Sufijo «· predeterminado» | `QuickActionsBar` (anotación) | calcado |
| 6 | «Email» | `QuickActionsBar` | calcado |
| 7 | «WhatsApp» | `QuickActionsBar` | calcado |
| 8 | «Reunión» | `QuickActionsBar` | calcado |
| 9 | «Tarea» | `QuickActionsBar` | calcado |
| 10 | «Nota» | `QuickActionsBar` | calcado |
| 11 | Tooltip con el motivo de deshabilitado | `QuickActionsBar` | calcado (regla del componente) |
| 12-13 | toasts «Llamando…», «Sin micrófono…», «No se pudo iniciar la llamada» | `Toast` del kit | calcado (patrón) |
| — | «Propuesta» | — | omitido: la ficha no la pasa en `actions`, así que hoy no aparece en esta pantalla |

### B.12 Ficha CRM — KPIs y pestañas (12)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | stat «Oportunidades» (tope de 20 registros) | DET-OPORT | calcado y **corregido**: el conteo sale de un `count`, no de una consulta topada |
| 2 | stat «Ganadas» | DET-OPORT | calcado |
| 3 | stat «Actividades» (tope de 20) | DET-ACTIVIDAD | sustituido: el volumen vive en el timeline paginado |
| 4 | stat «Health Score» | DET-* (barra lateral) | calcado |
| 5 | Pestaña «Info» | DET-INFO | fusionada con «Información» (§A.12) |
| 6 | Pestaña «Salud» | DET-* (barra lateral «Salud del cliente») | sustituido: la salud deja de ser una pestaña y acompaña siempre a la ficha |
| 7 | Pestaña «Finanzas» | DET-FINANZAS | fusionada con «Cuentas por cobrar» |
| 8 | Pestaña «Documentos» | DET-NOTAS | fusionada con «Notas y archivos» |
| 9 | Pestaña «Oportunidades» | DET-OPORT | fusionada |
| 10 | Pestaña «Actividad» | DET-ACTIVIDAD | fusionada con «Timeline» |
| 11 | `DetailSkeleton` | DET-CARGA | sustituido por `Skeleton` |
| 12 | «Cliente no encontrado» + «Volver» | DET-ERROR | calcado, con el motivo (incluida la sucursal filtrada) |

### B.13 Ficha CRM › «Info» (6)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | «Informacion de Contacto» (**sin tilde en el código**) | DET-INFO | sustituido por «Datos de la empresa» / «Datos personales», con la acentuación correcta |
| 2 | Email sin `mailto:` | `CustomerIdentityCard` | sustituido: el correo es clicable y además abre «Email» de las acciones rápidas |
| 3 | Teléfono sin `tel:` | `CustomerIdentityCard` | sustituido: el teléfono es clicable y abre «Llamar» |
| 4 | Dirección | `CustomerIdentityCard` · DET-INFO | calcado |
| 5 | «{tipo}: {número}» | `CustomerIdentityCard` | calcado |
| 6 | «Cliente desde {dd mmm aaaa}» | DET-* (subtítulo) | calcado; el diseño asume la zona de la organización (hoy usa `es-CO` cableado) |
| — | Estado vacío de la tarjeta | DET-VACIO | **Nuevo**: hoy, si el cliente no tiene datos, la tarjeta queda vacía sin mensaje |

### B.14 Ficha CRM › «Salud» (7)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | «Salud del cliente» | DET-* (barra lateral) | calcado |
| 2 | `HealthGauge` 88 px | DET-* | sustituido por `Progress` del kit con la banda de color: cabe en la barra lateral y mantiene el valor exacto |
| 3 | `HealthAlerts` (máx. 3) | DET-* | calcado («cartera vencida hace 12 d · sin compras en 30 d») |
| 4 | `HealthDimensions` (máx. 4) | DET-* | calcado (etiqueta del `Progress`) |
| 5 | `HealthTrend` (20 snapshots) | — | omitido: no cabe en la barra lateral; se recupera al abrir la ficha de salud del CRM, fuera del alcance de esta tanda |
| 6 | Vacíos con el motivo real | DET-VACIO | calcado: es el mejor vacío del módulo y se conserva palabra por palabra |
| 7 | Skeleton con `aria-busy` | DET-CARGA | sustituido por `Skeleton` |

### B.15 Ficha CRM › «Finanzas» (16)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | stat «Deuda Total» | DET-FINANZAS | calcado |
| 2 | stat «Folios Pendientes» | DET-FINANZAS | calcado |
| 3 | stat «Facturas por Cobrar» | DET-FINANZAS | calcado |
| 4 | «Folios de Reservas ({n})» | DET-FINANZAS | calcado |
| 5 | Badge «Abierto» / «Cerrado» | `CarteraRow Tipo=folio` | calcado |
| 6 | Badge «Saldo Pendiente» | `CarteraRow Tipo=folio` | calcado |
| 7 | «Reserva {código} · Espacio {etiqueta} · {fecha}» | `CarteraRow Tipo=folio` | calcado |
| 8 | Importe pendiente + «{n} items» | `CarteraRow` | calcado |
| 9 | «Ver» (abre `FolioDetailDialog`) | `CarteraRow` | calcado |
| 10 | «Pagar» (abre `FolioPaymentDialog`) | `CarteraRow Tipo=folio` | calcado |
| 11 | «Facturas por Cobrar ({n})» | DET-FINANZAS | calcado |
| 12 | Badge «Vencida» / «Por cobrar» (**ambas en rojo**) | `CarteraRow Tipo=factura` | sustituido: «Vencida 12 d» en peligro y «Pendiente» en advertencia, según la tabla de tonos |
| 13 | «Emitida: … · Vence: …» | `CarteraRow Tipo=factura` | calcado |
| 14 | Saldo + «de {total}» | `CarteraRow Tipo=factura` | calcado |
| 15 | «Sin deudas pendientes» + descripción | DET-VACIO | calcado |
| 16 | Skeleton de carga | DET-CARGA | sustituido por `Skeleton` |
| — | Aviso de que la consulta de folios está rota | DET-FINANZAS (anotación) | documentado: el diseño asume la consulta corregida (§G.1-2) |

### B.16 Ficha CRM › «Documentos» (10)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | «Documentos del cliente» + «({n})» | DET-NOTAS | calcado |
| 2 | «Subir archivo» | DET-NOTAS | calcado |
| 3 | `input[type=file] multiple` sin restricción de tipo | DET-NOTAS (anotación) | calcado |
| 4 | «Arrastra archivos aqui o haz click para subir» + «PDF, imagenes, contratos, etc.» | DET-VACIO | sustituido por `EmptyState`, con la acentuación corregida («aquí», «clic», «imágenes») |
| 5 | Icono por tipo + nombre + tamaño + fecha | DET-NOTAS | calcado (es el único sitio del módulo que ya usa la zona de la organización) |
| 6 | Badge «confidencial» | DET-NOTAS | calcado (tono advertencia) |
| 7 | Descargar | DET-NOTAS | calcado |
| 8 | Eliminar **sin confirmación** | DET-NOTAS | sustituido: abre `ConfirmDialog` (§G.4 #1) |
| 9 | Skeleton de 3 barras | DET-CARGA | sustituido por `Skeleton` |
| 10 | toast «No se pudo descargar el documento» | `Toast` del kit | calcado (patrón) |
| — | Variante `compact` | — | omitido: la página monta la completa; la auditoría dice explícitamente «no la dibujes aquí» |

### B.17 Ficha CRM › «Oportunidades» (7)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | «Oportunidades ({n})» | DET-OPORT | calcado |
| 2 | Punto de 8 px con el color de la etapa | DET-OPORT | sustituido por el badge de etapa con su color, que se lee sin pasar el ratón |
| 3 | Nombre truncado | DET-OPORT | calcado |
| 4 | Etapa o «Sin etapa» · fecha | DET-OPORT | calcado |
| 5 | Importe en COP | DET-OPORT | calcado con la moneda de la oportunidad (§G.7) |
| 6 | Badge «Ganada / Perdida / Abierta» | DET-OPORT | calcado |
| 7 | «Este cliente no tiene oportunidades asociadas» | DET-VACIO | sustituido por `EmptyState` con «Nueva oportunidad» |
| — | Filas clicables | DET-OPORT | **Nuevo**: hoy son `div` con `hover` y sin `onClick` |

### B.18 Ficha CRM › «Actividad» (14)

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | «Actividad» | DET-ACTIVIDAD | calcado |
| 2 | 9 chips «Todos · Llamadas · Emails · WhatsApp · IA · Reuniones · Tareas · Notas · Sistema» | DET-ACTIVIDAD | calcado |
| 3 | Select «Usuario» / «Todos los usuarios» | DET-ACTIVIDAD | calcado |
| 4 | Campo fecha «Desde» | DET-ACTIVIDAD | sustituido por `DateRange` del kit (un control en vez de dos) |
| 5 | Campo fecha «Hasta» | DET-ACTIVIDAD | sustituido, igual |
| 6 | «Limpiar» | DET-ACTIVIDAD | calcado |
| 7 | Badge «Tiempo real activo» / «Sin tiempo real…» / «Conectando…» | DET-ACTIVIDAD | calcado (tono éxito) |
| 8 | Botón «Actualizar» | DET-ACTIVIDAD | calcado |
| 9 | Barra «{n} entradas nuevas» | DET-ACTIVIDAD | calcado |
| 10 | Error + «Reintentar» | DET-ERROR | calcado |
| 11 | «Aún no hay interacciones. Empieza con una llamada, un email o una nota.» + `QuickActionsBar` | DET-VACIO | calcado |
| 12 | Encabezado de día «Hoy / Ayer / fecha» sticky | DET-ACTIVIDAD | calcado |
| 13 | «Cargar más» (30 por página + `IntersectionObserver`) | DET-ACTIVIDAD | calcado |
| 14 | Skeleton de 3 tarjetas | DET-CARGA | sustituido por `Skeleton` |
| — | Filtros persistidos en `localStorage` | DET-ACTIVIDAD (anotación) | calcado (se documenta, no se dibuja) |

---

## Lo roto (§G) — qué se sustituyó y por qué

| §G | Problema | Qué hace el diseño |
|---|---|---|
| G.1-3 | «Activar / Desactivar» es un handler vacío sobre `is_active`, columna que **no existe** | «Marcar como inactivo», que escribe `lifecycle_stage`; marcado **Nuevo** en CAT-MENU y DET-MENU |
| G.1-4 | «Fusionar clientes» está `disabled` fijo y no existe la RPC `merge_customers` | DLG-UNIFICAR completo: selector de principal, comparación campo a campo y aviso de transacción única. Marcado **Nuevo**: es deuda de backend |
| G.1-5 | «Crear como Nuevo» del `MergeModal` **falla siempre** por los dos únicos de la tabla | En DUP-DOC / DUP-CORREO / DUP-AMBOS el botón está **bloqueado** con el motivo exacto y un badge «Bloqueado». Solo se habilita cambiando el valor en conflicto |
| G.1-6 | «Actualizar Existente» **degrada una empresa a persona** (no copia `customer_type`, `company_name`, `trade_name`, `dv`, `fiscal_responsibilities`, `fiscal_municipality_id`, `parent_customer_id`) | La opción «Completar el existente con lo nuevo» copia **solo los campos marcados**, la fila «Tipo de cliente» dice «Empresa — nunca se degrada a persona» y el texto de la opción enumera lo que jamás se toca |
| G.1-2 | La consulta de folios de la ficha CRM pasa un query builder como escalar | DET-FINANZAS dibuja folios y facturas juntos y lo anota como deuda de backend |
| G.2-1 | «Ver todas las tareas» apunta a `/app/tareas`, que no existe | Sustituido por «Ver todas las tareas del cliente» dentro de la ficha |
| G.3 | 4 `confirm()` / `alert()` nativos del módulo Clientes | Todos a `ConfirmDialog` (DLG-BORRAR, DET-CONFIRM) y `Toast` |
| G.4-1 / G.4-2 | Borrado de documento y desvinculación de contacto **sin confirmación** | Ambos abren `ConfirmDialog` |
| G.5-6 | «Notas y archivos»: los archivos son un placeholder | DET-NOTAS monta el `DocumentUploader` real |
| G.6 | Fechas sin la zona de la organización y con `formatDate` deprecado | Todas las fechas dibujadas asumen `useFormatDate()`; se anota en cada pestaña |
| G.7 | Moneda COP cableada | Los importes llevan «Moneda: COP» explícito y el KPI dice «Moneda de la organización» |
| §I.2-1 | El diálogo «Etiquetar clientes» existe dos veces | Uno solo, con los dos modos |
| §I.2-3 | Dos timelines del cliente | Uno solo: `TimelineEntry` + los filtros del CRM |
| §I.2-4 | Dos buckets de documentos | Un solo bloque de documentos, anotado |
| §I.3 | Cuatro formularios distintos crean un cliente | SHEET-ALTA + `QuickCustomerForm` + `CustomerPicker` como única alta rápida; DLG-CONTACTO-C ya no repite un formulario propio. En ambos, la instancia va **sin cabecera ni pie propios**: un solo título, una sola X y un solo botón primario («Crear cliente») |

## Resumen

- **Controles calcados**: 268
- **Controles marcados «Nuevo»**: 31 (menú «⋯» del perfil y del listado, «Marcar como inactivo», «Registrar pago», «Nueva oportunidad», «Nueva venta», «Estado de cuenta (PDF)», «Exportar ficha», «Unificar con otro cliente», lápiz «Editar» por tarjeta de información, badge «Solo lectura», «Nueva» tarea, «Crear la primera tarea», «Editar nota», ordenamiento por columna, vista de tarjetas en móvil, paso de mapeo del importador, «Descargar errores CSV», «Deshacer 24 h», chips de etiquetas frecuentes, «Enviar recordatorio», enlaces del historial reciente, filas de oportunidad clicables, barra de acciones fija en móvil, validación por campo, `DuplicadoDialog` con opciones bloqueadas, `CustomerIdentityCard`, `TimelineEntry`, `ContactoVinculadoRow`, `CarteraRow`, `QuickActionsBar` en la ficha de Clientes)
- **Controles sustituidos** (lo roto no se calca): 96
- **Controles omitidos con motivo**: 8 (A.1 #1a, #2a, #6, #6a · A.3 #3 · A.12 #3 · A.14 #13 · B.11 «Propuesta» · B.14 #5 · B.16 variante `compact`)

Chequeo automático sobre la página `06 Clientes` y sobre `02 Componentes`:
**0 solapes entre secciones, 0 solapes entre frames de primer nivel, 0 instancias rotas**
(3.650 instancias en `06 Clientes`).
