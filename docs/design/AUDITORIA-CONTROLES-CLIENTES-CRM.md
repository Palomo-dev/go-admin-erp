# Auditoría control por control — Clientes y CRM

Insumo para que el diseñador **calque la realidad** en Figma («GO Admin — Sistema de diseño»,
`EAvjINVRnlzFM70GVoWXgl`). Hermano de `docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md`:
mismo formato, misma leyenda, mismo nivel de detalle. Aquí va **cada control** —botón, menú,
pestaña, campo, toggle, chip, badge, tabla, diálogo, tooltip, atajo, estado— del módulo
Clientes / CRM, con su etiqueta exacta, lo que hace, cuándo aparece y `archivo:línea`.

Fecha: 2026-09-22. Solo lectura de código; el esquema (§H) se verificó con `SELECT` por el
MCP de Supabase (`jgmgphmzusbluqhuqihj`) contra `information_schema` y `pg_constraint`.
Sin nombres de organizaciones cliente. Rutas relativas a `src/` salvo que se indique.

**Alcance**: las 30 rutas encargadas — `/app/clientes` (×4) y `/app/crm` (×26). El módulo tiene
además siete rutas que **no** entran aquí y que siguen sin auditar: `/app/crm/segmentos` (+ `[id]`,
`nuevo`), `/app/crm/secuencias`, `/app/crm/salud`, `/app/crm/referidos` y
`/app/crm/propuestas/[id]/imprimir`.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip · atajo ·
estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast · cálculo (regla sin
control visible). **Etiqueta exacta** es el literal del código con su acentuación (o su falta);
**nada** de este módulo pasa por `messages/es.json` —ni una clave—, así que todos los textos
están cableados en el JSX y se citan tal cual, mayúsculas incluidas.
**Cuándo aparece**: «Siempre» = incondicional dentro de su pantalla; breakpoints Tailwind
(`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).

Índice: A. Clientes (`/app/clientes`, detalle con 7 pestañas, editar, nuevo, `ClientForm`) ·
B. CRM: dashboard y clientes · C. Oportunidades, pipeline y pronóstico · D. Actividades,
llamadas y plantillas · E. Campañas, identidades y objeciones · F. Leads, equipo, partners,
automatizaciones y agentes IA · G. Lo roto o sin efecto · H. Esquema real · I. Duplicidades y
divergencias · J. Conteo de controles · K. Recomendación de rediseño.

---

## A. Clientes `/app/clientes`

Cuatro rutas reales: `app/clientes/page.tsx` (lista), `app/clientes/[id]/page.tsx` (perfil con
7 pestañas + barra lateral), `app/clientes/[id]/editar/page.tsx` y `app/clientes/new/page.tsx`.
Las dos últimas montan **el mismo** `ClientForm` con `mode` distinto.

### A.0 Lista — contenedor y estados `app/clientes/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `FilterBarSkeleton` + `TableSkeleton rows={5} columns={10}` | Esqueleto de toda la página | Mientras `isLoading && !organizationId` | page.tsx:897-905 |
| 2 | texto | «Gestión de Clientes» (h1, icono Users en cuadro azul) | Título | Siempre | page.tsx:912-917 |
| 3 | texto | «Administra tu cartera de clientes» | Subtítulo | Siempre | page.tsx:918-920 |
| 4 | botón | «Actualizar» (icono RefreshCw, gira si carga) | `loadCustomers(organizationId)` | Siempre; `disabled` mientras carga | page.tsx:923-932 |
| 5 | estado | «Error» + `{error}` (tarjeta roja, icono AlertTriangle) | Banda de error | Si `error` | page.tsx:942-950 |
| 5a | botón | «Reintentar» | Reintenta `loadCustomers`; si no hay organización hace `window.location.reload()` | Dentro de la banda de error | page.tsx:951-970 |
| 6 | estado | «No se encontraron clientes» (icono Users 12×12) | Vacío de la tarjeta de tabla | Si `customers.length===0 && !isLoading` | page.tsx:1173-1175 |
| 6a | botón | «Recargar» | `loadCustomers` | En el vacío | page.tsx:1177-1184 |
| 6b | botón | «Crear cliente» (azul) | `window.location.href = '/app/clientes/new'` (recarga entera, no `router.push`) | En el vacío | page.tsx:1185-1190 |

Layout: `p-6 space-y-6`, cabecera `flex-col` → `md:flex-row`. La carga es **toda cliente**
(`supabase` del navegador, l.5) y la organización sale de `useOrganization()`, no de la sesión
de servidor. El filtro de sucursal global (`useBranch`) se aplica a `customers.branch_id`
(l.182-185).

### A.1 Lista — acciones de cabecera `components/clientes/ClientesActions.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «Nuevo cliente» (azul, icono Plus) | `router.push('/app/clientes/new')` | Siempre | ClientesActions.tsx:524-532 |
| 1a | tooltip | «Crear un nuevo cliente» | — | Hover/focus | ClientesActions.tsx:534 |
| 2 | botón | «Etiquetar» (icono Tag) | Abre el diálogo «Etiquetar clientes» de **este** componente (A.2) | Siempre; `disabled` si no hay selección | ClientesActions.tsx:539-548 |
| 2a | tooltip | «Aplicar etiquetas a clientes seleccionados» | — | Hover | ClientesActions.tsx:550 |
| 3 | botón | «Unificar» (icono Users) | Abre «Fusionar clientes duplicados» | Siempre; `disabled` si no hay selección | ClientesActions.tsx:555-564 |
| 3a | tooltip | «Unificar clientes duplicados» | — | Hover | ClientesActions.tsx:566 |
| 4 | botón | «Exportar» (icono Download) | Llama `onExportCSV` del padre | Siempre | ClientesActions.tsx:571-579 |
| 4a | tooltip | «Exportar a CSV» | — | Hover | ClientesActions.tsx:581 |
| 5 | botón | «Importar» (icono Upload) | `resetImport()` y abre el asistente de importación (A.3) | Siempre | ClientesActions.tsx:586-594 |
| 5a | tooltip | «Importar clientes desde CSV/Excel» | — | Hover | ClientesActions.tsx:596 |
| 6 | botón | (icono Users, `sr-only` «Fusionar duplicados») | Abre el mismo diálogo de fusión. **Botón fantasma**: está dentro de `<Dialog>` pero **no** es `DialogTrigger`, así que se renderiza suelto en la fila de acciones | `disabled` si `selectedCustomers.length < 2` | ClientesActions.tsx:671-679 |
| 6a | tooltip | «Fusionar duplicados» | — | Hover | ClientesActions.tsx:681-683 |

Layout: `flex flex-wrap gap-2`, botones `min-h-[40px]`. Los cinco botones se muestran **siempre**,
sin comprobar permisos: no hay ninguna llamada a un resolutor de permisos en todo el archivo.

### A.2 Diálogo «Etiquetar clientes» (cabecera) `ClientesActions.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | Título «Etiquetar clientes» | `sm:max-w-[425px] mx-4` | Al pulsar «Etiquetar» | ClientesActions.tsx:600-603 |
| 2 | texto | «Aplica una etiqueta a los {n} clientes seleccionados.» | Descripción | Siempre en el diálogo | ClientesActions.tsx:604-606 |
| 3 | campo | Label «Etiqueta» · placeholder «Nombre de etiqueta» | Texto libre, `min-h-[44px]` | Siempre | ClientesActions.tsx:611-619 |
| 4 | estado | Banda verde/roja/azul con `statusMessage.message` | Éxito (CheckCircle) / error (AlertCircle) / progreso (Loader2) | Si hay `statusMessage` | ClientesActions.tsx:623-639 |
| 5 | botón | «Cancelar» | Cierra | Siempre; `disabled` mientras procesa | ClientesActions.tsx:642-649 |
| 6 | botón | «Aplicar etiqueta» / «Procesando...» (Loader2) | `handleApplyTag` | `disabled` si la etiqueta está vacía o procesa | ClientesActions.tsx:650-661 |

Ojo: **este diálogo está duplicado** con el de `page.tsx` (A.5a), que además sabe quitar
etiquetas. Ver §I.

### A.3 Diálogo «Fusionar clientes duplicados» `ClientesActions.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | Título «Fusionar clientes duplicados» | `sm:max-w-[500px]` | Al pulsar «Unificar» | ClientesActions.tsx:686-688 |
| 2 | texto | «Fusiona {n} clientes seleccionados. Selecciona el cliente principal que conservará toda la información.» | Descripción | Siempre | ClientesActions.tsx:689-691 |
| 3 | texto | «Funcionalidad de fusión de clientes en desarrollo. Esta función permitirá combinar datos de clientes duplicados preservando el historial de transacciones.» | Aviso de que no hace nada | Siempre | ClientesActions.tsx:695-698 |
| 4 | estado | «La fusión de clientes es una operación que no se puede deshacer» (banda ámbar, AlertCircle) | Aviso | Siempre | ClientesActions.tsx:700-703 |
| 5 | botón | «Cancelar» | Cierra | Siempre | ClientesActions.tsx:707-713 |
| 6 | botón | «Fusionar clientes» | **`disabled` fijo**, sin `onClick`. No existe RPC `merge_customers` en la BD | Siempre, inerte | ClientesActions.tsx:714-719 |

**No hay** selector de cliente principal, ni comparación campo a campo, ni previsualización:
el diálogo está vacío de contenido funcional.

### A.4 Diálogo «Importar Clientes» (asistente de 4 pasos) `ClientesActions.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | Título «Importar Clientes» (icono Upload azul) | `sm:max-w-[700px] max-h-[90vh]` con scroll | Al pulsar «Importar» | ClientesActions.tsx:726-731 |
| 2 | texto | «Selecciona un archivo CSV o Excel para importar clientes» / «Revisa los datos antes de importar» / «Importando clientes...» / «Importación completada» | Descripción según `importStep` (`upload`/`preview`/`importing`/`complete`) | Siempre | ClientesActions.tsx:732-737 |
| 3 | botón | «Arrastra un archivo aquí o haz clic para seleccionar» (zona punteada, icono FileSpreadsheet) — o el nombre del archivo ya elegido | Abre el `input[type=file]` oculto (`accept=".csv,.xls,.xlsx"`) | Paso `upload` | ClientesActions.tsx:743-760 |
| 4 | texto | «Formatos soportados: CSV, XLS, XLSX» | — | Paso `upload` | ClientesActions.tsx:751-753 |
| 5 | texto | «Columnas soportadas:» + 17 viñetas | Lista fija: «Tipo de Cliente», «Nombre», «Apellido», «Razón Social», «Nombre Comercial», «Email», «Teléfono», «Tipo Documento», «Número Documento», «DV», «Dirección», «Ciudad», «Notas», «Etiquetas», «Roles», «Preferencias», «Responsabilidades Fiscales», «Documento Empresa Padre» | Paso `upload` | ClientesActions.tsx:763-784 |
| 6 | botón | «Descargar Plantilla» (icono Download) | `downloadClientTemplate()` | Paso `upload` | ClientesActions.tsx:788-791 |
| 7 | botón | «Cancelar» | Cierra el diálogo | Paso `upload` | ClientesActions.tsx:792-794 |
| 8 | stat | «Total» / «OK» / «Errores» / «Pendientes» (4 tarjetas: gris, verde, roja, amarilla) | Contadores de `importStats` | Pasos `preview`, `importing`, `complete`; `grid-cols-2` → `sm:grid-cols-4` | ClientesActions.tsx:803-820 |
| 9 | toggle | «Modo de importación:» + 3 píldoras: «Crear y actualizar», «Solo crear nuevos», «Solo actualizar existentes» | Segmento (la activa en azul) | Solo en paso `preview` | ClientesActions.tsx:824-861 |
| 9a | texto | «Los clientes nuevos se crearán y los existentes se actualizarán.» / «Solo se crearán clientes con documento nuevo. Los existentes se omitirán.» / «Solo se actualizarán clientes que ya existan. Los nuevos se omitirán.» | Explicación del modo | Pasos `preview`…`complete` (el texto se muestra también fuera de `preview`) | ClientesActions.tsx:863-867 |
| 10 | tabla | Columnas: «#», «Tipo», «Nombre», «Doc», «Email», «Tel», «Estado» | Previsualización, cabecera fija, `max-h-[300px]`, primeras 100 filas | Pasos `preview`…`complete` | ClientesActions.tsx:870-902 |
| 10a | badge | «Pendiente» (amarillo) / «OK» (verde) / «Error» (rojo, `title` con el mensaje) | Estado por fila | Según `row.status` | ClientesActions.tsx:895-897 |
| 11 | texto | «Mostrando 100 de {n} filas» | — | Si `importPreview.length > 100` | ClientesActions.tsx:904-906 |
| 12 | botón | «Cancelar» (icono X) | `resetImport()` — vuelve al paso `upload` | Paso `preview` | ClientesActions.tsx:912-915 |
| 13 | botón | «Importar {n} clientes» (icono Upload) / «Importando...» (Loader2) | `handleImportClients` | Paso `preview`; `disabled` mientras procesa | ClientesActions.tsx:916-928 |
| 14 | botón | «Cerrar» | Reinicia y cierra | Paso `complete` | ClientesActions.tsx:933-935 |
| 15 | botón | «Importar otro archivo» (icono Upload) | `resetImport()` | Paso `complete` | ClientesActions.tsx:936-939 |
| 16 | estado | Banda verde/roja/azul con `statusMessage` | Igual que A.2 | Si hay `statusMessage` | ClientesActions.tsx:946-957 |

**No hay** barra de progreso durante `importing` (solo los 4 contadores), ni mapeo de columnas
del CSV a campos, ni descarga del informe de errores.

### A.5 Lista — KPIs y barra de acciones masivas `app/clientes/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «Total Clientes» (icono Users azul) | `stats.totalClientes` | Siempre | page.tsx:978-990 |
| 2 | stat | «Con Saldo» (icono DollarSign ámbar) | `stats.clientesConSaldo` | Siempre | page.tsx:991-1003 |
| 3 | stat | «Cuentas x Cobrar» (icono ShoppingCart verde) | `formatCurrency(stats.totalCuentasPorCobrar)` — **`Intl.NumberFormat('es-CO', {currency:'COP'})` cableado**, sin la moneda de la organización | Siempre | page.tsx:1004-1018 · 889-895 |
| 4 | stat | «Cuentas Vencidas» (icono AlertTriangle rojo) | `stats.clientesVencidos` | Siempre | page.tsx:1019-1031 |
| 5 | texto | «{n} cliente(s) seleccionado(s)» | Contador de la barra azul | Si `selectedIds.length > 0` | page.tsx:1040-1042 |
| 6 | botón | «Limpiar» (icono X) | `setSelectedIds([])` | Con selección | page.tsx:1043-1051 |
| 7 | estado | `Loader2` girando | Proceso masivo en curso | Si `isBulkLoading` | page.tsx:1054 |
| 8 | botón | «Exportar» (icono Download) | `handleBulkExport` → CSV de los seleccionados; toast «{n} cliente(s) exportado(s)» | Con selección | page.tsx:1055-1064 · 754 |
| 9 | botón | «Etiquetar» (icono Tag) | `openTagDialog('add')` | Con selección | page.tsx:1065-1074 |
| 10 | botón | «Quitar etiqueta» (icono Tags) | `openTagDialog('remove')` | Con selección | page.tsx:1075-1084 |
| 11 | menú | Trigger «Roles» (icono Users + ChevronDown) | Abre el menú de roles masivos | Con selección | page.tsx:1085-1096 |
| 11a | menú | Etiqueta de grupo «Agregar rol» | — | En el menú | page.tsx:1099 |
| 11b | menú | «Cliente», «Huesped», «Pasajero», «Proveedor», «Empleado» (icono UserPlus verde) | `handleBulkChangeRole(role,'add')`. **Lista cableada** de 5 roles, no sale de `customer_roles` | En el menú | page.tsx:1100-1105 |
| 11c | menú | Etiqueta de grupo «Quitar rol» | — | En el menú | page.tsx:1107 |
| 11d | menú | Los mismos 5 (icono UserMinus rojo) | `handleBulkChangeRole(role,'remove')` | En el menú | page.tsx:1108-1113 |
| 12 | botón | «Eliminar» (icono Trash2, borde rojo) | `handleBulkDelete` | Con selección | page.tsx:1116-1125 |
| 12a | diálogo | **`confirm()` nativo**: «¿Estás seguro de eliminar {n} cliente(s)? Esta acción no se puede deshacer.» | Confirmación del borrado masivo | Al pulsar «Eliminar» | page.tsx:665 |
| 13 | toast | «{n} cliente(s) eliminado(s) correctamente» / «Error al eliminar clientes» | Resultado | Tras el borrado | page.tsx:678 · 683 |
| 14 | toast | «Etiqueta "{tag}" agregada a {n} cliente(s)» / «Error al agregar etiqueta» | Resultado | Tras etiquetar | page.tsx:789 · 799 |
| 15 | toast | «Etiqueta "{tag}" removida de {n} cliente(s)» / «Error al remover etiqueta» | Resultado | Tras quitar etiqueta | page.tsx:823 · 833 |
| 16 | toast | «Rol "{role}" {agregado\|removido} en {n} cliente(s)» / «Error al cambiar roles» | Resultado | Tras cambiar roles | page.tsx:864 · 869 |

Layout: KPIs `grid-cols-2 md:grid-cols-4`. La barra masiva es `flex-col` → `sm:flex-row`.

### A.5a Diálogo «Etiquetar clientes» / «Quitar etiqueta» (barra masiva) `app/clientes/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | Título «Etiquetar clientes» o «Quitar etiqueta» | Según `tagDialogMode` | Al pulsar «Etiquetar»/«Quitar etiqueta» de la barra | page.tsx:1201-1203 |
| 2 | texto | «Aplica una etiqueta a los {n} clientes seleccionados.» / «Quita una etiqueta de los {n} clientes seleccionados.» | Descripción | Siempre | page.tsx:1204-1208 |
| 3 | campo | Label «Etiqueta» · placeholder «Nombre de etiqueta» | Texto libre; `Enter` dispara la acción | Siempre | page.tsx:1213-1226 |
| 3a | atajo | `Enter` dentro del campo | Aplica o quita, según el modo | Si el campo no está vacío | page.tsx:1221-1225 |
| 4 | estado | Banda verde/roja/azul con `tagDialogStatus.message` | Éxito/error/progreso | Si hay estado | page.tsx:1230-1241 |
| 5 | botón | «Cancelar» | Cierra | `disabled` mientras procesa | page.tsx:1244-1251 |
| 6 | botón | «Aplicar etiqueta» / «Quitar etiqueta» / «Procesando...» | Ejecuta la acción del modo | `disabled` si el campo está vacío | page.tsx:1252-1263 |

### A.6 Lista — filtros `components/clientes/ClientesFilter.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Filtros y opciones» (h2) | — | Siempre | ClientesFilter.tsx:113 |
| 2 | badge | `{n}` (azul) | Cuenta filtros activos. **Bug**: el conteo excluye `typeFilter` (l.116) aunque `hasActiveFilters` sí lo mira (l.107) | Si hay algún filtro activo | ClientesFilter.tsx:114-118 |
| 3 | botón | «Limpiar todo» (`≥sm`) / «Limpiar» (`<sm`) | `handleClearFilters()` — resetea los 7 filtros | Si hay filtros activos | ClientesFilter.tsx:120-130 |
| 4 | campo | placeholder «Buscar clientes...» · `aria-label` «Buscar clientes por nombre, documento o email» (icono Search) | Búsqueda global, `type="search"`, `h-11 sm:h-12` | Siempre | ClientesFilter.tsx:134-144 |
| 5 | campo | Select placeholder «Tipo» | «Todos los tipos» · «Persona» (icono User) · «Empresa» (icono Building2) | Siempre | ClientesFilter.tsx:150-168 |
| 6 | campo | Select placeholder «Rol» | «Todos los roles» + los roles **presentes en la página cargada** (`Set` sobre `customers[].roles`), no el catálogo | Siempre | ClientesFilter.tsx:173-190 · 65-73 |
| 7 | campo | Select placeholder «Etiqueta» | «Todas las etiquetas» + etiquetas presentes en la página | Siempre | ClientesFilter.tsx:195-212 · 75-83 |
| 8 | campo | Select placeholder «Ciudad» | «Todos los municipios» + `municipality_name` presentes | Siempre | ClientesFilter.tsx:217-234 · 85-94 |
| 9 | campo | Select placeholder «Saldo» | «Todos los saldos» · «Con saldo pendiente» · «Sin saldo pendiente» | Siempre | ClientesFilter.tsx:239-253 |
| 10 | campo | Select placeholder «Ordenar por» | «Sin orden específico» · «Última compra (más reciente)» · «Última compra (más antigua)» · «Mayor saldo» · «Menor saldo» | Siempre | ClientesFilter.tsx:258-274 |
| 11 | botón | «Filtros aplicados» (azul) / «Sin filtros» (icono Filter) | Limpia todo; `disabled` si no hay filtros | Solo `≥lg` (`hidden lg:block`) | ClientesFilter.tsx:278-290 |
| 11a | tooltip | Lista de filtros activos: «• Búsqueda: "…"», «• Tipo: Empresa/Persona», «• Rol: …», «• Etiqueta: …», «• Municipio: …», «• Saldo: Con pendientes/Sin pendientes», «• Orden: {valor crudo}» + «Click para limpiar todo» | El orden se imprime con su **valor interno** (`latest_purchase`, `balance_desc`…), no traducido | Hover sobre el botón 11 | ClientesFilter.tsx:292-303 |

Layout de los selects: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7`. La rejilla
declara 7 columnas pero solo hay 6 selects + el botón, y el botón se oculta bajo `lg`: en
`lg` quedan dos filas de 3.

### A.7 Lista — tabla `components/clientes/ClientesTable.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `TableSkeleton rows={5} columns={10}` | Carga | Si `isLoading` | ClientesTable.tsx:136-138 |
| 2 | estado | «No se encontraron clientes con los filtros aplicados» | Vacío tras filtrar | Si `customers.length===0` | ClientesTable.tsx:142-147 |
| 3 | toggle | Checkbox de cabecera, `aria-label` «Seleccionar todos» | Selecciona/deselecciona la página actual; estado indeterminado marcado solo por color | Siempre | ClientesTable.tsx:154-161 |
| 4 | tabla | Columnas: «Cliente», «Contacto», «Documento», «Municipio», «Etiquetas», «Cuentas por Cobrar», «Ventas», «Última compra», «Acciones» (9 + la de checkbox = 10) | `min-w-max` con scroll horizontal: **ninguna columna se oculta en móvil** | Siempre | ClientesTable.tsx:162-171 |
| 5 | toggle | Checkbox por fila, `aria-label` «Seleccionar {full_name}» | Selección individual; la fila se pinta azul | Siempre | ClientesTable.tsx:180-184 |
| 6 | texto | Avatar 40×40: `avatar_url` o inicial del `full_name` sobre círculo azul | — | Siempre | ClientesTable.tsx:189-203 |
| 7 | botón | `CopyableId` con `label={full_name}` y `copyValue={id}` | Clic → `/app/clientes/{id}`; icono copia el UUID | Siempre | ClientesTable.tsx:206-211 |
| 8 | badge | «Empresa» (azul, Building2) / «Persona» (gris, User) | Según `customer_type` | Siempre | ClientesTable.tsx:212-222 |
| 9 | texto | «Contacto: {nombre} ({cargo})» | Contacto principal de la empresa | Si `customer_type==='company'` y hay `primary_contact_name` | ClientesTable.tsx:225-229 |
| 10 | badge | `{rol}` (azul) | **Solo el primer rol** (`roles.slice(0,1)`); los demás no se ven | Si hay roles | ClientesTable.tsx:236-244 |
| 11 | texto | Email y teléfono apilados | Columna «Contacto» | Si existen | ClientesTable.tsx:249-262 |
| 12 | texto | «{doc_type}: {doc_number}» / «No registrado» | Columna «Documento» | Siempre | ClientesTable.tsx:263-273 |
| 13 | texto | `{municipality_name}` / «--» | Columna «Municipio» | Siempre | ClientesTable.tsx:274-286 |
| 14 | badge | Hasta 2 etiquetas (outline) + «+{n-2}» / «--» | Columna «Etiquetas» | Siempre | ClientesTable.tsx:287-313 |
| 15 | texto | Saldo en COP, coloreado: rojo (`overdue` o >30 d), naranja (`partial`), ámbar (`pending` o >0 d), verde (al día) | Columna «Cuentas por Cobrar» | Siempre | ClientesTable.tsx:314-318 · 95-100 |
| 15a | badge | «Vencida» / «Pago parcial» / «Pendiente» / «Al día» + « {n}d» | Estado de cartera | Solo si `balance > 0` | ClientesTable.tsx:319-335 · 103-108 |
| 16 | texto | Total vendido + «{n} compra» / «{n} compras» | Columna «Ventas» | Siempre | ClientesTable.tsx:338-347 |
| 17 | texto | Fecha `dd MMM yyyy` (`date-fns`, locale `es`) / «Sin compras» / «Fecha inválida» | Columna «Última compra». **Sin timezone de organización** | Siempre | ClientesTable.tsx:348-355 · 75-83 |
| 18 | menú | Trigger «…» (MoreHorizontal), `aria-label` «Acciones para cliente {full_name}», `sr-only` «Abrir menú» | Menú de fila | Siempre | ClientesTable.tsx:357-368 |
| 18a | menú | Etiqueta de grupo «Acciones» | — | En el menú | ClientesTable.tsx:370 |
| 18b | menú | «Ver detalles» | `/app/clientes/{id}` | Siempre | ClientesTable.tsx:371-373 |
| 18c | menú | «Editar» | `/app/clientes/{id}/editar` | Siempre | ClientesTable.tsx:374-376 |
| 18d | menú | «Activar» (verde) / «Desactivar» (rojo) | **`onClick` vacío** (`{ /* Implementar cambio de estado */ }`). Además `customers` **no tiene** columna `is_active` (§H) | Siempre; el texto depende de `is_active === false`, que nunca llega | ClientesTable.tsx:377-382 |

**No hay** ordenamiento por columna (el orden solo se cambia desde el select de A.6-10), ni
redimensionado, ni vista de tarjetas en móvil: se hace scroll horizontal. **No hay** columna de
estado del cliente ni de última interacción CRM.

### A.8 Lista — paginación `components/clientes/ClientesPagination.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Mostrando {a} - {b} de {total} registros» | Rango | Si `totalItems > 0` (si es 0 el componente devuelve `null`) | ClientesPagination.tsx:90-98 · 82-84 |
| 2 | campo | Select de tamaño + «por página» | Opciones 10 · 20 · 40 · 80 | Si `showPageSizeSelector && onPageSizeChange` | ClientesPagination.tsx:100-120 · 36 |
| 3 | botón | (ChevronsLeft) `title` «Primera página» | Página 0 | `disabled` en la primera | ClientesPagination.tsx:126-135 |
| 4 | botón | (ChevronLeft) `title` «Página anterior» | −1 | `disabled` en la primera | ClientesPagination.tsx:138-147 |
| 5 | paginación | Números de página, con «...» | Máx. 5 visibles + primera y última; la activa en azul | Solo `≥sm` | ClientesPagination.tsx:150-172 · 46-80 |
| 6 | texto | «{n} / {total}» | Indicador compacto | Solo `<sm` | ClientesPagination.tsx:174-177 |
| 7 | botón | (ChevronRight) `title` «Página siguiente» | +1 | `disabled` en la última | ClientesPagination.tsx:180-189 |
| 8 | botón | (ChevronsRight) `title` «Última página» | Última | `disabled` en la última | ClientesPagination.tsx:192-201 |

### A.9 Detalle — contenedor y pestañas `app/clientes/[id]/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `DetailSkeleton` | Carga | Mientras `loading` | page.tsx:89-96 |
| 2 | estado | «Cliente no encontrado» (h1) + «{error}» o «No se pudo encontrar el cliente solicitado» | Error o cliente inexistente | Si `error \|\| !cliente` | page.tsx:98-119 |
| 2a | botón | «Volver a clientes» (borde rojo) | `/app/clientes` | En el estado de error | page.tsx:111-115 |
| 3 | botón | (ArrowLeft, `ghost`, `size=icon`) | `/app/clientes` | Siempre | page.tsx:125-129 |
| 4 | texto | `{cliente.full_name}` (h1, icono User azul) | — | Siempre | page.tsx:131-134 |
| 5 | texto | «Clientes / Perfil» | Migas de pan planas (no clicables) | Siempre | page.tsx:135-137 |
| 6 | pestaña | «Resumen» | `ResumenTab` | Siempre; activa por defecto | page.tsx:150 · 161-163 |
| 7 | pestaña | «Información» | `InfoTab` | Siempre | page.tsx:151 · 165-167 |
| 8 | pestaña | «Oportunidades» | `OportunidadesTab` | Siempre | page.tsx:152 · 169-171 |
| 9 | pestaña | «Timeline» | `TimelineTab` | Siempre | page.tsx:153 · 173-175 |
| 10 | pestaña | «Cuentas por cobrar» | `CuentasTab` | Siempre | page.tsx:154 · 177-179 |
| 11 | pestaña | «Notas y archivos» | `NotasArchivosTab` | Siempre | page.tsx:155 · 181-183 |
| 12 | pestaña | «Contactos» | `CompanyContactsManager` | **Solo si `cliente.customer_type === 'company'`** | page.tsx:156-158 · 185-189 |

Layout: `grid-cols-1 lg:grid-cols-3`; pestañas 2/3 y `TareasSidebar` 1/3. La `TabsList` es
`grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7`: con 7 pestañas y 4 columnas en `md`
quedan dos filas. La consulta del cliente **no filtra por `organization_id`** (l.62-66): se apoya
solo en RLS.

### A.10 Detalle — cabecera del perfil `components/clientes/id/ClienteHeader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | Avatar 64×64 (`UserAvatar`), overlay con icono Camera al pasar el ratón | Abre el selector de archivo; sube a `storage/profiles/customers/{id}/avatar.{ext}` y escribe `customers.avatar_url` | Siempre | ClienteHeader.tsx:192-208 · 131-178 |
| 1a | estado | `Loader2` girando sobre el avatar | Subida en curso | Si `uploadingAvatar` | ClienteHeader.tsx:195-199 |
| 1b | toast | «Error» / «Solo se permiten imágenes» | Validación de tipo | Si el archivo no es imagen | ClienteHeader.tsx:135-138 |
| 1c | toast | «Error» / «La imagen no debe superar 5MB» | Validación de tamaño | Si >5 MB | ClienteHeader.tsx:139-142 |
| 1d | toast | «Avatar actualizado» / «La foto del cliente se actualizó correctamente.» | Éxito | Tras subir | ClienteHeader.tsx:170 |
| 1e | toast | «Error» / «No se pudo subir la imagen» | Fallo | Si falla | ClienteHeader.tsx:173 |
| 2 | texto | `{nombreCompleto}` (h1) | — | Siempre | ClienteHeader.tsx:212 |
| 3 | badge | «Empresa» (azul, Building2) / «Persona» (gris, User) | Según `customer_type` | Siempre | ClienteHeader.tsx:213-223 |
| 4 | texto | «Contacto: {nombre} ({cargo})» | Contacto principal desde `customer_company_links` (`is_primary` primero) | Si es empresa y hay contacto | ClienteHeader.tsx:227-231 · 67-96 |
| 5 | chip | «Vinculado a:» + un enlace por empresa (Building2, píldora azul, `·` si es la principal) | `/app/clientes/{company.id}` | Si es persona y tiene empresas en `customer_company_links` | ClienteHeader.tsx:234-251 · 99-123 |
| 6 | texto | `{cliente.email}` | — | Si hay email | ClienteHeader.tsx:254-258 |
| 7 | badge | `NivelFidelidad` con «Oro» / «Plata» / «Bronce» / «Básico» | **Derivado de las etiquetas**: busca `oro`, `plata`, `bronce` en `tags`; si no, «Básico». No hay programa de fidelidad real | Siempre | ClienteHeader.tsx:260 · 180-187 |
| 8 | botón | «Volver» (SVG de flecha, fondo gris) | `/app/clientes` | Siempre | ClienteHeader.tsx:267-275 |
| 9 | botón | «Editar» (SVG de lápiz, fondo `primary`) | `/app/clientes/{id}/editar` | Siempre | ClienteHeader.tsx:278-286 |

Layout: `flex-col` → `md:flex-row`. **No hay** menú «…» en el perfil: nada de duplicar,
desactivar, eliminar, fusionar, exportar ficha, ni llamar/escribir desde aquí.

### A.11 Detalle › pestaña «Resumen» `components/clientes/id/ResumenTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `StatsSkeleton count={4}` | Carga (aunque los KPIs son 6) | Mientras `loading` | ResumenTab.tsx:287-293 |
| 2 | estado | Banda roja con `{error}` | Error | Si `error` | ResumenTab.tsx:296-304 |
| 3 | stat | «Compras» (ShoppingBag) + «Última: {fecha}» / «Sin compras» | Ventas + pedidos web pagados + folios cerrados | Siempre | ResumenTab.tsx:242-247 |
| 4 | stat | «Estadías» (Home) + «Última: {fecha}» / «Sin estadías» | `reservations` del cliente | Siempre (también sin PMS: no mira el módulo) | ResumenTab.tsx:248-253 |
| 5 | stat | «Gasto Total» (DollarSign) + «Incluye pedidos web pagados» | Ventas + web pagadas + folios cerrados | Siempre | ResumenTab.tsx:254-259 |
| 6 | stat | «Pedidos Web» (ShoppingBag) + «Último: {fecha}» / «Sin pedidos web» | `web_orders` | Siempre | ResumenTab.tsx:260-267 |
| 7 | stat | «Reservas Futuras» (CalendarClock) + «Próxima: {d mes}» / «Sin reservas futuras» | `checkin > now` y estado `confirmed`/`tentative` | Siempre | ResumenTab.tsx:268-275 |
| 8 | stat | «Saldo Folios» (Receipt) + «{n} item(s) pendiente(s)» / «Sin saldo pendiente» | Suma `folios.balance` de folios `open` | Siempre | ResumenTab.tsx:276-283 |
| 9 | texto | «Historial Reciente» (h3) | — | Siempre | ResumenTab.tsx:335-337 |
| 10 | tabla | Lista de hasta 8 hitos: «Venta #{8 chars}» / «Reserva {d mes}» / «Pedido #{order_number}» con icono verde/azul/morado | Unifica ventas, reservas y pedidos web ordenados por fecha | Si hay historial | ResumenTab.tsx:340-369 · 187-206 |
| 10a | badge | `{status}` **crudo de la BD** (`paid`, `cancelled`, `reserva`…) en verde/rojo/amarillo | Sin traducción a español | Por hito | ResumenTab.tsx:360 · 346-353 |
| 10b | texto | Importe (si >0) y fecha `d mes` | — | Por hito | ResumenTab.tsx:363-366 |
| 11 | estado | «No hay actividad reciente para este cliente.» | Vacío | Si no hay hitos | ResumenTab.tsx:371-375 |

Layout: KPIs `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`. **No hay** ningún control interactivo
en toda la pestaña: ni enlaces a la venta, ni filtro de periodo, ni «ver todo».

### A.12 Detalle › pestaña «Información» `components/clientes/id/InfoTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `CardListSkeleton cards={4} columns="1"` | Carga | Mientras `loading` | InfoTab.tsx:131-137 |
| 2 | estado | «Error: {mensaje}» / «No se pudo cargar la información del cliente» | Error | Si `error \|\| !clienteInfo` | InfoTab.tsx:139-145 |
| 3 | texto | «Información completa del cliente» (h3) | — | Siempre | InfoTab.tsx:167 |
| 4 | texto | Tarjeta «Datos de la empresa» / «Datos personales» + descripción «Información de la empresa y contacto» / «Información básica de contacto e identificación» | Según `customer_type` | Siempre | InfoTab.tsx:172-175 |
| 4a | texto | «Razón Social» / «Nombre completo» → `full_name` o «No especificado» | — | Siempre | InfoTab.tsx:178-181 |
| 4b | texto | «Persona de contacto» → nombre (cargo), email y teléfono | Contacto principal | Si es empresa y hay contacto | InfoTab.tsx:183-194 |
| 4c | texto | «Nombre Comercial» → `trade_name` | — | Si es empresa y tiene `trade_name` | InfoTab.tsx:196-201 |
| 4d | texto | «Correo electrónico» / «Teléfono» / «Identificación» («{tipo}: {número}») → «No especificado» | — | Siempre | InfoTab.tsx:203-216 |
| 5 | texto | Tarjeta «Dirección» + «Datos de ubicación» | — | Siempre | InfoTab.tsx:224-225 |
| 5a | texto | «Dirección completa» · «Municipio» · «Estado/Provincia» · «Código postal» → «No especificado» | Municipio, estado y CP salen de `municipalities`, no de `customers.city` | Siempre | InfoTab.tsx:229-247 |
| 6 | texto | Tarjeta «Empresas vinculadas» (Building2) + «Empresas con las que este contacto está asociado» | — | Solo si **no** es empresa y hay vínculos | InfoTab.tsx:254-261 |
| 6a | botón | `{company.name}` (enlace azul subrayado) + cargo | `/app/clientes/{company.id}` | Por empresa vinculada | InfoTab.tsx:272-277 |
| 6b | badge | «Principal» (azul) | — | Si `is_primary` | InfoTab.tsx:280-284 |
| 7 | texto | Tarjeta «Datos Fiscales» / «Datos Empresariales y Fiscales» + «Información fiscal y comercial» | — | Si es empresa **o** hay `company_name`, `trade_name`, `dv` o responsabilidades | InfoTab.tsx:292-297 |
| 7a | texto | «Razón Social» · «Nombre Comercial» · «Dígito de Verificación (DV)» | — | Dentro de la tarjeta | InfoTab.tsx:302-316 |
| 7b | badge | «Responsabilidad Fiscal (DIAN)» + un chip por código, o «No especificado» | — | Dentro de la tarjeta | InfoTab.tsx:319-325 |
| 8 | texto | Tarjeta «Roles y etiquetas» + «Clasificación del cliente» | — | Siempre | InfoTab.tsx:336-337 |
| 8a | texto | «Roles» → lista separada por comas o «No especificado» | — | Siempre | InfoTab.tsx:342-345 |
| 8b | badge | «Etiquetas» → chips, o «Sin etiquetas» | — | Siempre | InfoTab.tsx:347-360 |
| 8c | texto | «Cliente registrado» → «Sí» / «No» | `customers.is_registered` | Siempre | InfoTab.tsx:364-367 |
| 9 | texto | Tarjeta «Datos del sistema» + «Información técnica» | — | Siempre | InfoTab.tsx:375-376 |
| 9a | texto | «ID del cliente» · «ID de organización» · «Fecha de alta» · «Última actualización» | Fechas con `formatDate` de `@/utils/Utils` (**deprecado**, §G) | Siempre | InfoTab.tsx:381-397 · 148-149 |
| 10 | texto | Tarjeta «Notas» + «Información adicional sobre el cliente» → HTML o «No hay notas disponibles para este cliente.» | Campo `customers.notes` | Siempre | InfoTab.tsx:407-416 |
| 11 | texto | Tarjeta «Preferencias» + «Preferencias personalizadas del cliente» → o «No hay preferencias registradas para este cliente.» | `customers.preferences` | Siempre | InfoTab.tsx:424-433 |

Layout: `grid-cols-1 md:grid-cols-2`; las tarjetas 6, 7, 10 y 11 van a ancho completo debajo.
**Toda la pestaña es de solo lectura**: no hay un solo botón de editar en línea; para cambiar
cualquier dato hay que ir a `/editar` (formulario completo).

### A.13 Detalle › pestaña «Oportunidades» `components/clientes/id/OportunidadesTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `DetailSkeleton` | Carga | Mientras `loading` | OportunidadesTab.tsx:84-86 |
| 2 | estado | Banda roja con `{error}` | Error | Si `error` | OportunidadesTab.tsx:88-94 |
| 3 | estado | «Sin oportunidades» (h3, icono TrendingUp) + «Este cliente aún no tiene oportunidades en el pipeline.» | Vacío. **Sin botón de crear** | Si no hay oportunidades | OportunidadesTab.tsx:96-108 |
| 4 | stat | «Total» / «Abiertas» (azul) / «Ganadas» (verde) | Conteos sobre `opportunities.status` | Si hay oportunidades; `grid-cols-1 sm:grid-cols-3` | OportunidadesTab.tsx:117-130 |
| 5 | texto | «Oportunidades ({n})» (h3) | — | Siempre que haya | OportunidadesTab.tsx:134-136 |
| 6 | botón | Tarjeta de oportunidad (bloque clicable) | `/app/crm/oportunidades/{id}` | Por oportunidad | OportunidadesTab.tsx:139-143 |
| 6a | texto | `{opp.name}` (h4) + nombre del pipeline | — | Por fila | OportunidadesTab.tsx:146-154 |
| 6b | badge | `{stage.name}` con el color de la etapa (`stages.color` al 20 % de fondo) | — | Si hay etapa | OportunidadesTab.tsx:155-162 |
| 6c | texto | Importe con `formatCurrency(amount, currency ?? 'COP')` | — | Si `amount > 0` | OportunidadesTab.tsx:166-170 |
| 6d | badge | «Abierta» (azul) / «Ganada» (verde) / «Perdida» (rojo) | Según `status` | Siempre | OportunidadesTab.tsx:74-78 · 171 |
| 6e | texto | «Cierre esperado: {fecha}» | `formatDate` de `@/utils/Utils` | Si hay `expected_close_date` | OportunidadesTab.tsx:174-178 |

**Nota de moneda**: aquí el fallback es `'COP'` aunque la columna `opportunities.currency` tiene
**default `'USD'`** en la BD (§H). Una oportunidad creada sin tocar la moneda se guarda en USD y
se muestra en pesos.

### A.14 Detalle › pestaña «Timeline» `components/clientes/id/TimelineTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `CardListSkeleton cards={3} columns="1"` | Carga | Mientras `loading` | TimelineTab.tsx:306-312 |
| 2 | estado | Banda roja con `{error}` | Error | Si `error` | TimelineTab.tsx:315-323 |
| 3 | estado | «No hay actividad reciente» (h3) + «Este cliente no tiene actividades, ventas o reservaciones registradas en el sistema.» | Vacío. **Sin botón de registrar actividad** | Si no hay hitos | TimelineTab.tsx:326-340 |
| 4 | texto | «Historial de Actividad» (h3) | — | Siempre que haya | TimelineTab.tsx:346 |
| 5 | texto | Línea vertical + icono por tipo: venta (verde), reserva (azul), actividad (ámbar), pedido web (morado) | 4 orígenes: `sales`, `reservations`, `activities`, `web_orders` | Por hito | TimelineTab.tsx:348-383 |
| 6 | texto | `{item.title}` + fecha (`formatDate`) + descripción HTML (`HtmlContentRenderer`) | — | Por hito | TimelineTab.tsx:388-396 |
| 7 | texto | «Monto: {importe}» | — | Si hay importe | TimelineTab.tsx:398-404 |
| 8 | badge | «Estado: {status}» — verde si contiene `complete`, amarillo si `pending`, azul en otro caso | — | Si hay estado | TimelineTab.tsx:406-416 |
| 9 | badge | «Pago: {paymentStatus}» — verde `paid`, azul `partial`, morado `refunded`, amarillo el resto | — | Solo en hitos de venta | TimelineTab.tsx:418-429 |
| 10 | badge | «Espacio(s):» + un chip por espacio, con `· {tipo}` | Habitaciones/espacios de la reserva | Solo en reservas con espacios | TimelineTab.tsx:435-445 |
| 11 | texto | «Check-in: {fecha}» → «Check-out: {fecha}» (`toLocaleDateString('es-ES')`) | **Formato `es-ES` cableado y sin timezone de la organización** | Reservas con ambas fechas | TimelineTab.tsx:448-454 |
| 12 | badge | «Folio: {n} item(s)» (azul) | — | Si el folio tiene items | TimelineTab.tsx:458-461 |
| 12a | badge | «{n} pendiente(s) · {importe}» (ámbar) / «Todo pagado» (verde) | — | Según items pendientes | TimelineTab.tsx:462-470 |
| 12b | badge | «Saldo: {importe}» (rojo) | — | Si `folioBalance > 0` | TimelineTab.tsx:471-475 |
| 12c | botón | «Ver folio →» | `/app/pms/folios?reservation={id}` (la ruta existe) | Reservas con folio | TimelineTab.tsx:476-481 |
| 13 | texto | «Sin consumos registrados en folio» | — | Reserva con folio vacío | TimelineTab.tsx:486-490 |

**No hay** filtros por tipo de hito, ni paginación, ni «cargar más», ni acciones rápidas
(llamar, escribir, nota) sobre la línea de tiempo: es un lienzo de solo lectura. El módulo CRM
tiene un timeline mucho más rico (`components/crm/timeline/**`) que esta pestaña **no** usa.

### A.15 Detalle › pestaña «Cuentas por cobrar» `components/clientes/id/CuentasTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `TableSkeleton rows={5} columns={5}` | Carga | Mientras `loading` | CuentasTab.tsx:283-285 |
| 2 | estado | Banda roja con `{error}` | Error. **Inalcanzable**: el `catch` vacía la lista en vez de fijar `error` (l.232-240) | Si `error` | CuentasTab.tsx:288-296 |
| 3 | estado | «No hay cuentas por cobrar» (h3) + «Este cliente no tiene deudas, pagos pendientes ni folios con saldo registrados en el sistema.» | Vacío | Si no hay cuentas ni folios | CuentasTab.tsx:300-314 |
| 4 | texto | «Folios PMS con Saldo Pendiente» (h3, icono Receipt ámbar, borde izquierdo ámbar) + total a la derecha | Bloque de folios abiertos | Si `folios.length > 0` | CuentasTab.tsx:320-330 |
| 4a | badge | `{space_label}` (gris) | Espacio del folio | Si hay etiqueta | CuentasTab.tsx:337-341 |
| 4b | badge | «Abierto» (azul) / «Cerrado» (gris) | `folios.status` | Por folio | CuentasTab.tsx:342-348 |
| 4c | texto | «{d mes} → {d mes}» | Check-in/out (`toLocaleDateString('es-ES')`) | Si hay fechas | CuentasTab.tsx:350-354 |
| 4d | texto | «{n} de {m} items pendientes» | — | Por folio | CuentasTab.tsx:355-357 |
| 4e | botón | «Ver folio» (icono ExternalLink) | `/app/pms/folios?reservation={id}` | Por folio | CuentasTab.tsx:363-368 |
| 5 | stat | «Total Deuda» | `resumen.totalDeuda` | Si hay cuentas; `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` | CuentasTab.tsx:380-385 |
| 6 | stat | «Monto Vencido» (rojo) | `resumen.totalVencido` | Si hay cuentas | CuentasTab.tsx:387-392 |
| 7 | stat | «Pendiente de Pago» (azul) | `resumen.totalPendiente` | Si hay cuentas | CuentasTab.tsx:394-399 |
| 8 | tabla | Columnas: «ID VENTA», «MONTO», «BALANCE», «VENCIMIENTO», «ESTADO» (todas en mayúsculas por CSS `uppercase`) | Cuentas por cobrar del RPC `obtener_cuentas_por_cobrar_cliente` | Si hay cuentas | CuentasTab.tsx:407-426 |
| 8a | texto | `{sale_id}` **UUID completo sin acortar** / «-» | — | Por fila | CuentasTab.tsx:430-432 |
| 8b | texto | Vencimiento con `new Date(...).toLocaleDateString()` **sin locale ni timezone** | — | Por fila | CuentasTab.tsx:439-441 |
| 8c | badge | «Pagado» (verde) / «Vencido ({n} días)» (rojo, >30 d) / «Atrasado ({n} días)» (ámbar, >0 d) / «Pendiente» (azul) | — | Por fila | CuentasTab.tsx:443-445 · 249-281 |
| 9 | campo | «Mostrar» + select + «por página» | Tamaño de página | Si hay cuentas | CuentasTab.tsx:460-473 |
| 10 | texto | «{a} - {b} de {total} cuentas» | Rango | Siempre | CuentasTab.tsx:479 |
| 11 | botón | `title` «Primera página» / «Página anterior» / «Página siguiente» / «Última página» | Navegación | Siempre | CuentasTab.tsx:491 · 501 · 519 · 529 |
| 12 | texto | «Página {n} de {total}» (el número actual en azul) | — | Siempre | CuentasTab.tsx:509 |

**No hay** ninguna acción sobre la cartera desde aquí: ni registrar pago, ni enviar recordatorio,
ni abrir la venta o la factura, ni exportar el estado de cuenta.

### A.16 Detalle › pestaña «Notas y archivos» `components/clientes/id/NotasArchivosTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Banda roja con `{error}` | Error | Si `error` | NotasArchivosTab.tsx:255-264 |
| 2 | texto | «Agregar Nota» (h3) | — | Siempre | NotasArchivosTab.tsx:270-272 |
| 3 | campo | `RichTextEditor` · placeholder «Escriba una nota sobre este cliente...» · `minHeight={100}` | Editor enriquecido | Siempre | NotasArchivosTab.tsx:274-280 |
| 4 | botón | «Guardar Nota» / «Guardando...» | Inserta en `notes` con `related_type='customer'`; `disabled` si el editor está vacío | Siempre | NotasArchivosTab.tsx:282-288 · 115-170 |
| 5 | texto | «Notas ({n})» (h3) | — | Siempre | NotasArchivosTab.tsx:295-297 |
| 6 | estado | «No hay notas» (h4) + «Todavía no se han agregado notas para este cliente.» | Vacío | Si no hay notas | NotasArchivosTab.tsx:299-310 |
| 7 | texto | Avatar + nombre del autor + fecha (`formatDate`) | Autor resuelto contra `profiles` | Por nota | NotasArchivosTab.tsx:320-328 |
| 8 | botón | Chincheta (SVG), ámbar si está fijada | `togglePinNote` → `notes.is_pinned`; la nota fijada se pinta con borde y fondo ámbar | Por nota | NotasArchivosTab.tsx:331-340 · 172-192 |
| 9 | botón | Papelera (SVG) | `handleDeleteNote` | Por nota | NotasArchivosTab.tsx:341-348 |
| 9a | diálogo | **`confirm()` nativo**: «¿Está seguro de eliminar esta nota?» | Confirmación | Al pulsar la papelera | NotasArchivosTab.tsx:195 |
| 10 | badge | «Oportunidad: {nombre}» (morado) | Nota atada a una oportunidad | Si la nota tiene `opportunity_name` | NotasArchivosTab.tsx:351-357 |
| 11 | texto | Cuerpo de la nota (`HtmlContentRenderer`) | — | Por nota | NotasArchivosTab.tsx:358 |
| 12 | estado | «Archivos» (h4) + «La funcionalidad de archivos estará disponible próximamente.» | **Bloque placeholder**: la pestaña se llama «Notas y archivos» y los archivos no existen | Siempre | NotasArchivosTab.tsx:366-376 |

**No hay** botón de editar nota (aunque sí hay lógica de `update` en el archivo), ni adjuntos,
ni menciones, ni filtro por autor.

### A.17 Detalle › pestaña «Contactos» `components/clientes/CompanyContactsManager.tsx`

Solo aparece si `customer_type === 'company'`. El **mismo** componente se embebe dentro del
`ClientForm` cuando el tipo es empresa (A.20-31), en dos modos: con `companyId` escribe directo en
`customer_company_links`; sin él acumula contactos pendientes y los crea tras el insert.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Contactos de la Empresa» (h3, icono Building2) | — | Siempre | CompanyContactsManager.tsx:404-405 |
| 2 | badge | `{n}` (azul) | Número de contactos | Si hay contactos | CompanyContactsManager.tsx:406-410 |
| 3 | botón | «Vincular Contacto» (icono Plus, outline) | Abre el modal «Agregar Contacto» | Siempre | CompanyContactsManager.tsx:412-421 |
| 4 | estado | `CardListSkeleton cards={3} columns="1"` | Carga | Mientras `loading` | CompanyContactsManager.tsx:424-427 |
| 5 | estado | «No hay contactos vinculados a esta empresa» (tarjeta punteada, icono User) | Vacío | Si no hay contactos | CompanyContactsManager.tsx:428-434 |
| 5a | botón | «Vincular primer contacto» (icono Plus) | Abre el modal | En el vacío | CompanyContactsManager.tsx:435-444 |
| 6 | texto | Fila de contacto: avatar 40×40 + nombre completo | — | Por contacto | CompanyContactsManager.tsx:511-523 |
| 6a | badge | «Nuevo» (verde) | Contacto pendiente de crear (modo creación) | Si `isNew` | CompanyContactsManager.tsx:524-528 |
| 6b | badge | «Principal» (ámbar, estrella rellena) | — | Si `is_primary` | CompanyContactsManager.tsx:529-534 |
| 6c | texto | Email (icono Mail) y teléfono (icono Phone) | — | Si existen | CompanyContactsManager.tsx:536-549 |
| 7 | botón | `{cargo}` o «Sin cargo (click para editar)» | Entra en edición en línea | Por contacto | CompanyContactsManager.tsx:583-589 |
| 7a | campo | placeholder «Cargo (ej: Gerente)» (`h-7`, `autoFocus`) | Edita el cargo | En edición | CompanyContactsManager.tsx:552-568 |
| 7b | atajo | `Enter` guarda · `Escape` cancela y restaura | — | En edición | CompanyContactsManager.tsx:558-567 |
| 7c | botón | (icono Check) | Guarda el cargo | En edición | CompanyContactsManager.tsx:569-580 |
| 8 | botón | Estrella, `title` «Marcar como principal» | `handleTogglePrimary`: quita el flag al anterior y lo pone en este | **Solo si no es ya el principal** (no se puede desmarcar) | CompanyContactsManager.tsx:594-603 |
| 9 | botón | Papelera, `title` «Desvincular contacto» | Borra la fila de `customer_company_links` (no borra la persona) | Por contacto. **Sin confirmación** | CompanyContactsManager.tsx:604-611 |
| 10 | toast | «Error al cargar contactos» · «Error al vincular contacto» · «Contacto vinculado correctamente» · «Contacto agregado» · «Nombre y apellido son obligatorios» · «Error al crear persona» · «Persona creada y vinculada» · «{nombre} desvinculado» · «{nombre} removido» · «Error al desvincular contacto» · «Error al actualizar contacto principal» · «Error al establecer contacto principal» · «Contacto principal actualizado» · «Error al actualizar cargo» · «Cargo actualizado» | `sonner` | Según la acción | CompanyContactsManager.tsx:124 · 189-192 · 210 · 218 · 244 · 259-262 · 285 · 324-336 · 351-363 · 384-386 |

#### A.17a Modal «Agregar Contacto» (no es `Dialog` de shadcn: div a pantalla completa)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | Título «Agregar Contacto» | Overlay `fixed inset-0 bg-black/50`, panel `max-w-lg max-h-[85vh]`. Cierra al hacer clic fuera | Al pulsar «Vincular Contacto» | CompanyContactsManager.tsx:664-670 |
| 2 | botón | (icono X) | Cierra | Siempre | CompanyContactsManager.tsx:671-677 |
| 3 | toggle | Segmento «Buscar existente» (icono Search) / «Crear nueva persona» (icono UserPlus) | Cambia `addMode` | En modo `search` sin persona elegida, y siempre en modo `create` | CompanyContactsManager.tsx:682-700 · 845-862 |
| 4 | campo | Label «Buscar persona existente» · placeholder «Nombre, apellido o email...» (icono Search, `autoFocus`) | Busca personas de la organización | Modo `search`, sin selección | CompanyContactsManager.tsx:707-721 |
| 4a | estado | `Skeleton` circular dentro del campo | Búsqueda en curso | Si `searching` | CompanyContactsManager.tsx:718-720 |
| 5 | botón | Fila de resultado: avatar 32×32 + nombre + email | Selecciona la persona | Por resultado, `max-h-64` con scroll | CompanyContactsManager.tsx:726-753 |
| 6 | estado | «No se encontraron personas con ese criterio.» | Vacío de búsqueda | Si `searchTerm.length >= 2`, sin buscar y sin resultados | CompanyContactsManager.tsx:757-761 |
| 6a | botón | «Crear nueva persona» (icono UserPlus) | Cambia a modo `create` | En el vacío | CompanyContactsManager.tsx:762-771 |
| 7 | texto | Tarjeta azul con la persona elegida (avatar + nombre + email) | — | Modo `search` con selección | CompanyContactsManager.tsx:777-791 |
| 7a | botón | (icono X) | Deshace la selección | Con selección | CompanyContactsManager.tsx:792-798 |
| 8 | campo | Label «Cargo (opcional)» · placeholder «Ej: Gerente, Director, Asistente...» (`autoFocus`) | Cargo del vínculo | Modo `search` con selección | CompanyContactsManager.tsx:801-812 |
| 9 | botón | «Cancelar» | Cierra | Con selección | CompanyContactsManager.tsx:815-823 |
| 10 | botón | «Vincular» (icono Plus / Loader2) | `handleAddExistingContact` | Con selección; `disabled` mientras añade | CompanyContactsManager.tsx:824-836 |
| 11 | campo | Label «Nombre *» · placeholder «Ej: Juan» (`autoFocus`) | — | Modo `create` | CompanyContactsManager.tsx:866-876 |
| 12 | campo | Label «Apellido *» · placeholder «Ej: Pérez» | — | Modo `create` | CompanyContactsManager.tsx:877-886 |
| 13 | campo | Label «Email» · placeholder «ejemplo@correo.com» (`type=email`) | — | Modo `create` | CompanyContactsManager.tsx:890-897 |
| 14 | campo | Label «Teléfono» · `PhoneInput` · placeholder «300 123 4567» | — | Modo `create` | CompanyContactsManager.tsx:899-906 |
| 15 | campo | Label «Tipo de documento» · `<select>` nativo | «Cédula» · «NIT» · «Pasaporte» · «ID Extranjero» · «Otro». **Lista cableada**, no sale de `country_identification_types` | Modo `create` | CompanyContactsManager.tsx:910-923 |
| 16 | campo | Label «N° documento» · placeholder «Ej: 12345678» | — | Modo `create` | CompanyContactsManager.tsx:924-931 |
| 17 | campo | Label «Ubicación» · `LocationSelector` con `layout="stacked"` | País / departamento / municipio | Modo `create` | CompanyContactsManager.tsx:935-944 |
| 18 | campo | Label «Cargo (opcional)» · placeholder «Ej: Gerente, Director, Asistente...» | — | Modo `create` | CompanyContactsManager.tsx:946-953 |
| 19 | botón | «Cancelar» | Cierra | Modo `create` | CompanyContactsManager.tsx:957-965 |
| 20 | botón | «Crear y vincular» (icono UserPlus / Loader2) | `handleAddNewContact`; valida solo nombre y apellido | Modo `create` | CompanyContactsManager.tsx:966-978 |

**No hay** `Escape` para cerrar, ni foco atrapado, ni `role="dialog"`: es un `div` con overlay.
Accesibilidad a revisar en el rediseño.

### A.18 Detalle › barra lateral «Tareas» `components/clientes/id/TareasSidebar.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Tareas» (h3) + `CardListSkeleton cards={3}` | Carga | Mientras `loading` | TareasSidebar.tsx:226-233 |
| 2 | estado | «Tareas» (h3) + banda roja con `{error}` | Error | Si `error` | TareasSidebar.tsx:236-245 |
| 3 | texto | «Tareas Pendientes» (h3) + badge con el conteo | — | Siempre | TareasSidebar.tsx:250-257 |
| 4 | estado | «No hay tareas pendientes para este cliente» (icono de portapapeles) | Vacío | Si no hay pendientes | TareasSidebar.tsx:259-270 |
| 5 | texto | Tarjeta de tarea: icono de estado + título + descripción HTML | Lista con `max-h-[300px]` y scroll | Por tarea | TareasSidebar.tsx:272-292 |
| 5a | badge | «Alta» / «Media» / «Baja» / «Normal» (color por prioridad) | `tasks.priority` | Por tarea | TareasSidebar.tsx:294-296 · 195-206 |
| 5b | badge | «Pendiente» / «En progreso» / «Completada» / «Cancelada» / (el valor crudo si no encaja) | `tasks.status`. **Ojo**: el default de la columna es `'open'`, que cae en el ramal «valor crudo» | Por tarea | TareasSidebar.tsx:298-300 · 209-222 |
| 5c | badge | Fecha relativa (rojo si vencida, azul si no) | `formatRelativeDate(due_date)` | Si hay `due_date` | TareasSidebar.tsx:302-310 |
| 5d | texto | Nombre del asignado o «Sin asignar» / «Usuario» | Resuelto contra `profiles` | Por tarea | TareasSidebar.tsx:313-317 · 186-193 |
| 6 | texto | «Tareas Finalizadas» (h3) + badge con el conteo | — | Siempre | TareasSidebar.tsx:324-331 |
| 7 | estado | «No hay tareas finalizadas para este cliente» | Vacío | Si no hay finalizadas | TareasSidebar.tsx:333-339 |
| 8 | texto | Tarjeta atenuada (`opacity-75`) con título y badge de estado | Lista con `max-h-[200px]` | Por tarea finalizada | TareasSidebar.tsx:341-362 |
| 9 | botón | «Ver todas las tareas» | `/app/tareas` — **la ruta no existe** (§G) | Siempre | TareasSidebar.tsx:366-368 |

**No hay** botón de crear tarea, ni de completar una desde aquí: la barra es solo lectura con
un enlace roto al final.

### A.19 Crear y editar — contenedores `app/clientes/new/page.tsx` · `app/clientes/[id]/editar/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `DetailSkeleton` | Carga de la organización | Mientras `isLoading` | new/page.tsx:70-77 · editar/page.tsx:73-80 |
| 2 | botón | (ArrowLeft, outline, `h-10 w-10`) | `/app/clientes` (nuevo) · `/app/clientes/{id}` (editar) | Siempre | new/page.tsx:84-88 · editar/page.tsx:87-95 |
| 3 | texto | «Crear Nuevo Cliente» (h1, icono UserPlus en cuadro azul) | — | Ruta `new` | new/page.tsx:90-95 |
| 3a | texto | «Completa la información para registrar un nuevo cliente» | — | Ruta `new` | new/page.tsx:96-98 |
| 4 | texto | «Editar Cliente» (h1, icono UserCog en cuadro ámbar) | — | Ruta `editar` | editar/page.tsx:97-102 |
| 4a | texto | «Modifica la información del cliente» | — | Ruta `editar` | editar/page.tsx:103-105 |
| 5 | botón | «Ver Lista de Clientes» (outline) | `/app/clientes` | **Solo en editar** (en `new` no existe) | editar/page.tsx:108-116 |
| 6 | estado | «Error» + mensaje: «No hay sesión activa. Por favor inicie sesión para continuar.» / «No se encontró una organización asociada a tu cuenta.» / «Error al cargar la información de tu organización» | Tarjeta roja | Si falla la resolución de organización | new/page.tsx:104-115 · editar/page.tsx:120-129 |
| 6a | botón | «Volver a clientes» (borde rojo) | `/app/clientes` | En el error | new/page.tsx:109-113 · editar/page.tsx:124-128 |

Ambas resuelven la sucursal por `is_main`, o la primera si no hay principal
(new/page.tsx:49-57 · editar/page.tsx:53-60), y pasan `branchId` al formulario.

### A.20 `ClientForm` — el formulario completo `components/clientes/new/ClientForm.tsx`

Cuatro secciones plegables (todas abiertas por defecto, l.132-137) más el bloque de contactos de
empresa. Las secciones se pliegan pulsando su cabecera entera, con un `ChevronDown` que rota.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `DetailSkeleton` | Carga del cliente en edición | Si `loadingData` (solo `mode='edit'`) | ClientForm.tsx:745-751 |
| 2 | estado | `Alert variant="destructive"` con `{error}` | Error de guardado o de carga | Si `error` | ClientForm.tsx:771-775 |
| 3 | botón | Cabecera «Información Personal» + «Datos básicos de identificación del cliente» (icono User azul) | Pliega/despliega | Siempre | ClientForm.tsx:780-794 |
| 4 | botón | Avatar 80×80 con overlay Camera | En edición sube ya; en creación solo previsualiza (`URL.createObjectURL`) | Siempre | ClientForm.tsx:800-821 · 401-438 |
| 4a | texto | «Foto del cliente» + «Haz clic para cambiar la foto (máx. 5MB)» / «Puedes agregar una foto después de crear el cliente» | Según el modo | Siempre | ClientForm.tsx:822-827 |
| 5 | toggle | Label «Tipo de Cliente» (icono Users) + 2 tarjetas: «Persona» (User) y «Empresa» (Building2) | Segmento; la activa con borde y fondo azul | Siempre; `grid-cols-2 max-w-md` | ClientForm.tsx:831-861 |
| 6 | campo | Label «Razón Social *» (icono Building2) · placeholder «Ej: Empresa S.A.S.» · `required` | `company_name` | **Solo empresa** | ClientForm.tsx:867-880 |
| 7 | campo | Label «Nombre Comercial» · placeholder «Ej: Mi Negocio» | `trade_name` | Solo empresa | ClientForm.tsx:883-892 |
| 8 | campo | Label «Nombre *» · placeholder «Ej: Juan Carlos» · `required` | `first_name` | **Solo persona** | ClientForm.tsx:900-912 |
| 9 | campo | Label «Apellido *» · placeholder «Ej: García López» · `required` | `last_name` | Solo persona | ClientForm.tsx:915-927 |
| 10 | campo | Label «Empresa a la que pertenece (opcional)» (icono Building2) · `<select>` nativo con «Sin empresa asociada» + las empresas de la organización | `parent_customer_id` | Solo persona **y** si ya existe al menos una empresa | ClientForm.tsx:933-951 · 197-214 |
| 10a | texto | «Vincula esta persona como cliente hijo de una empresa» | Ayuda | Con el select | ClientForm.tsx:950 |
| 11 | campo | Label «Tipo de Documento» (icono CreditCard) · `<select>` nativo | Opciones de `country_identification_types` filtradas por el `country_code` de la organización y por persona/empresa; fallback `GEN`; si tampoco hay, 5 opciones internas: «Documento nacional», «ID Tributario / Fiscal», «Pasaporte», «ID Extranjero», «Otro» | Siempre | ClientForm.tsx:957-973 · 62-68 · 157-219 |
| 12 | campo | Label «Número de Documento» · placeholder «Ej: 12345678» | `identification_number`; al salir del campo (`onBlur`) consulta DIAN/RUES | Siempre | ClientForm.tsx:977-987 |
| 13 | botón | (icono Search o Loader2) `title`/`aria-label` «Consultar DIAN/RUES» | `POST /api/dian/lookup` y autocompleta razón social o nombres, DV, email, teléfono, dirección, ciudad y responsabilidades fiscales | `disabled` si no hay habeas data, ya consulta, o el documento tiene menos de 4 caracteres | ClientForm.tsx:988-1003 · 322-390 |
| 13a | toggle | `HabeasDataCheckbox` | Autorización de tratamiento de datos (Ley 1581/2012). **Marcada por defecto** (l.130) | Siempre | ClientForm.tsx:1005-1009 |
| 13b | toast | «Autocompletado» / «Datos obtenidos desde DIAN» (+ « (cache)») | Éxito | Tras consultar | ClientForm.tsx:380 |
| 13c | toast | «Sin resultados» / `{json.error}` · «Error» / «No se pudo consultar DIAN» | Fallo | Tras consultar | ClientForm.tsx:382 · 386 |
| 14 | campo | Label «DV» · placeholder «Ej: 3» · `maxLength={1}` · `w-20` | Dígito de verificación | Siempre (también para persona) | ClientForm.tsx:1012-1023 |
| 15 | botón | Cabecera «Clasificación y Roles» + «Roles y responsabilidades fiscales del cliente» (icono Users morado) | Pliega/despliega | Siempre | ClientForm.tsx:1031-1046 |
| 16 | toggle | Label «Roles del Cliente» (icono Users) + una tarjeta-checkbox por rol de `customer_roles` (`label` del catálogo) | Multiselección. Por defecto `['cliente','huesped']` | Siempre; `grid-cols-2 sm:grid-cols-3 md:grid-cols-5` | ClientForm.tsx:1051-1082 · 109 · 147 |
| 17 | toggle | Label «Responsabilidad Fiscal (DIAN)» (icono CreditCard) + una tarjeta-checkbox por código de `dian_fiscal_responsibilities`, mostrando «{código}» en negrita y «- {descripción}» | Multiselección. Por defecto `['R-99-PN']` | Siempre; `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` | ClientForm.tsx:1085-1123 · 113 · 148 |
| 18 | botón | Cabecera «Datos de Contacto» + «Información para comunicarnos con el cliente» (icono Phone verde) | Pliega/despliega | Siempre | ClientForm.tsx:1130-1145 |
| 19 | campo | Label «Correo Electrónico» (icono Mail) · placeholder «cliente@ejemplo.com» · `type=email` | `email` | Siempre | ClientForm.tsx:1152-1164 |
| 20 | campo | Label «Teléfono» (icono Phone) · `PhoneInput` (con prefijo de país) | `phone` | Siempre | ClientForm.tsx:1167-1179 |
| 21 | campo | Label «Dirección» (icono MapPin) · placeholder «Calle 123 #45-67, Apartamento 101» | `address` | Siempre | ClientForm.tsx:1183-1195 |
| 22 | campo | Label «Ubicación» (icono MapPin) · `LocationSelector` (país / departamento / municipio) | Fija `fiscal_municipality_id` | Siempre; `grid-cols-1 md:grid-cols-3` | ClientForm.tsx:1199-1213 |
| 23 | texto | Tarjeta con `CompanyContactsManager` completo (A.17) | En edición escribe ya en `customer_company_links`; en creación acumula en `pendingContacts` y los crea tras el insert | **Solo si el tipo es empresa** | ClientForm.tsx:1219-1238 · 571-620 |
| 24 | botón | Cabecera «Información Adicional» + «Etiquetas y notas para categorizar al cliente» (icono Tag morado) | Pliega/despliega | Siempre | ClientForm.tsx:1241-1256 |
| 25 | campo | Label «Etiquetas» (icono Tag) · placeholder «premium, frecuente, corporativo (separadas por comas)» | Texto libre separado por comas | Siempre | ClientForm.tsx:1261-1273 |
| 25a | texto | «Separa las etiquetas con comas para organizar mejor tus clientes» | Ayuda | Siempre | ClientForm.tsx:1274-1276 |
| 26 | campo | Label «Notas Internas» (icono FileText) · `RichTextEditor` · placeholder «Información relevante sobre el cliente, preferencias, historial, etc.» · `minHeight={150}` | `notes` | Siempre | ClientForm.tsx:1280-1291 |
| 26a | texto | «Estas notas son solo para uso interno y no son visibles para el cliente» | Ayuda | Siempre | ClientForm.tsx:1292-1294 |
| 27 | texto | «Los campos marcados con * son obligatorios» | Pie de la barra de acciones | Siempre | ClientForm.tsx:1306-1308 |
| 28 | botón | «Cancelar» (icono X) | `onCancel()` si está embebido, si no `router.back()` | Siempre; `disabled` mientras guarda | ClientForm.tsx:1310-1319 |
| 29 | botón | «Guardar Cliente» / «Guardar Cambios» (icono Save) · «Guardando...» / «Actualizando...» (Loader2) | Envía el formulario | `disabled` si falta la razón social (empresa) o el nombre/apellido (persona) | ClientForm.tsx:1321-1340 |
| 30 | toast | «Cliente creado con éxito» / «Se ha registrado la empresa {razón social}.» o «Se ha registrado a {nombre} {apellido} como cliente.» | Éxito de creación | Tras crear | ClientForm.tsx:622-628 |
| 31 | toast | «Cliente actualizado» / «Se ha actualizado la información de …» | Éxito de edición | Tras actualizar | ClientForm.tsx:523-529 |
| 32 | toast | «Error al crear cliente» / «Error al actualizar cliente» + mensaje, o «Ocurrió un error al procesar la solicitud» | Fallo | Si falla | ClientForm.tsx:642-646 |
| 33 | toast | «Error al cargar datos» + mensaje | Fallo al cargar en edición | Si falla | ClientForm.tsx:302-306 |
| 34 | toast | «Error» / «Solo se permiten imágenes» · «La imagen no debe superar 5MB» · «Avatar actualizado» | Avatar | Al subir | ClientForm.tsx:405 · 409 · 431 |

**Validación real**: no hay esquema (ni Zod ni react-hook-form). Solo el `required` de HTML en
tres campos y el `disabled` del botón de guardar. **No se valida** el formato del email (más allá
del `type=email`), ni el teléfono, ni que el DV corresponda al NIT, ni que el documento sea único
—esto último lo impide la BD con `UNIQUE (organization_id, identification_number)`, así que llega
como error crudo de Postgres al toast.

**Campos de `customers` que el formulario no expone** (existen en la BD, §H):
`city`, `lifecycle_stage`, `timezone`, `do_not_call`, `health_score`, `company_size`,
`branches_count`, `current_software`, `vertical_id`, `legal_organization_id`, `tribute_id`,
`preferences`, `is_registered`, `metadata`. Varios sí se muestran en la pestaña «Información»
(A.12), de modo que se pueden **ver** pero no **editar** desde la aplicación.

### A.21 Diálogo «Cliente Duplicado Detectado» `components/clientes/new/MergeModal.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | Título «Cliente Duplicado Detectado» (centrado) | `sm:max-w-md md:max-w-lg` | Solo en creación, si `checkDuplicates()` encuentra un cliente con el mismo documento o email | MergeModal.tsx:35-39 · ClientForm.tsx:756-768 · 441-484 |
| 2 | texto | «Se ha encontrado un cliente con el mismo documento o correo electrónico.» | Descripción | Siempre | MergeModal.tsx:39-41 |
| 3 | texto | Tarjeta «Cliente Existente» (azul): «Nombre:», «Email:», «Documento:», «Roles:» | — | Siempre; `grid-cols-1 md:grid-cols-2` | MergeModal.tsx:46-59 |
| 4 | texto | Tarjeta «Nuevo Cliente» (verde): «Nombre:», «Email:», «Documento:» | — | Siempre | MergeModal.tsx:61-71 |
| 5 | estado | «¿Qué acción desea realizar?» + «Seleccione cómo desea proceder con este cliente duplicado.» (banda ámbar) | — | Siempre | MergeModal.tsx:74-80 |
| 6 | botón | «Usar Existente» (outline) | `router.push('/app/clientes/{duplicado}')` sin crear nada | Siempre | MergeModal.tsx:83-89 · ClientForm.tsx:657-661 |
| 7 | botón | «Actualizar Existente» (secondary) | Fusiona nombre, apellido, teléfono, dirección, notas y **une** los roles; toast «Cliente actualizado» | Siempre | MergeModal.tsx:91-97 · ClientForm.tsx:663-690 |
| 8 | botón | «Crear como Nuevo» (primario) | Inserta un cliente nuevo con los mismos datos. **Falla siempre** si el duplicado se detectó por documento o email: la BD tiene `UNIQUE (organization_id, identification_number)` y `UNIQUE (organization_id, email)` (§G, §H) | Siempre | MergeModal.tsx:99-105 · ClientForm.tsx:692-728 |

La ruta «Actualizar Existente» **no** copia `customer_type`, `company_name`, `trade_name`, `dv`,
`fiscal_responsibilities`, `fiscal_municipality_id` ni `parent_customer_id`; la ruta «Crear como
Nuevo» tampoco. Si el duplicado era una empresa, la fusión la degrada a los campos de persona.

---

## B. CRM: dashboard y clientes

**Las tres rutas de este bloque no son lo que su nombre sugiere.** Antes de dibujar nada:

| Ruta | Lo que realmente es |
|---|---|
| `/app/crm` | **No hay dashboard.** `app/app/crm/page.tsx` son 11 líneas que montan `ModuleRootRedirect moduleCode="crm"`. Redirige a la primera página activa del módulo, que con la configuración vigente es `/app/crm/clientes` (`lib/config/modulePages.ts:17`; `/app/crm` está en `EXCLUDED_REDIRECT_HREFS`, `moduleRedirect.ts:19`). El panel de CRM se consolidó en `/app/inicio#crm` |
| `/app/crm/clientes` | **Re-export literal de `/app/clientes`.** 12 líneas: `import ClientesPage from "../../clientes/page"` y lo renderiza. Mismo árbol de componentes, misma cabecera «Gestión de Clientes», mismos enlaces. **Un solo frame de Figma sirve para las dos rutas** (ver §A) |
| `/app/crm/clientes/[id]` | **Ficha completamente distinta** de `/app/clientes/[id]`: otro archivo, otros componentes, otras pestañas. Cero código compartido |

### B.1 `/app/crm` — el redirect `app/app/crm/page.tsx` · `components/inicio/ModuleRootRedirect.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | cálculo | — | Resuelve la primera página activa del módulo `crm` y hace `router.replace()`; sin organización usa el fallback estático | Al montar | page.tsx:9-11 · ModuleRootRedirect.tsx:28-62 |
| 2 | estado | `PageHeaderSkeleton` | Esqueleto de cabecera mientras resuelve | Siempre, hasta que navega | ModuleRootRedirect.tsx:74-78 |
| 3 | estado | «No se pudo redirigir a la página del módulo.» | Texto plano centrado, **sin botón de reintento** | Solo si falla el resolutor y no hay fallback estático; para `crm` sí lo hay, así que en la práctica no se ve | ModuleRootRedirect.tsx:64-72 |

Layout `p-4 sm:p-6`, `min-h-screen`. Sin cabecera, sin migas, sin «volver». Dura milisegundos: para Figma basta un frame de esqueleto.

### B.2 La sección CRM de `/app/inicio#crm` — cabecera `components/inicio/ModuloSection.tsx` · `components/inicio/sections/CrmSection.tsx`

Es donde viven de verdad los componentes de `components/crm/dashboard/**`. **Único bloque del módulo cuyos textos salen de `messages/es.json`** (namespace `home.section.*`, es.json:342-358); el resto está cableado en español.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «CRM» (icono Users + chevron) | Colapsa/expande la sección (`aria-expanded`) | Siempre | ModuloSection.tsx:167-188 · CrmSection.tsx:220-232 |
| 2 | botón | «CSV» | Exporta los 8 KPIs y la tabla «Próximas a cerrar» | Siempre; `disabled` sin datos o exportando | ModuloSection.tsx:191-201 |
| 3 | botón | «PDF» | Igual, con los datos de la organización en la cabecera | Siempre; mismo `disabled` | ModuloSection.tsx:202-212 |
| 4 | pestaña | «Dashboard» (`home.section.dashboard`) | KPIs y gráficos | Siempre | ModuloSection.tsx:222-233 |
| 5 | pestaña | «Reportes» (`home.section.reports`) | Monta `ReportesPage` del CRM | Siempre | ModuloSection.tsx:234-245 · CrmSection.tsx:230 |
| 6 | pestaña | «Métricas» (`home.section.metrics`) | Monta `MetricasView` | Si se pasa `metricasContent`; CRM sí lo pasa | ModuloSection.tsx:246-259 · CrmSection.tsx:231 |
| 7 | badge | `BranchBadge` | Sucursal activa | Si `showBranchBadge` | ModuloSection.tsx:265-269 |
| 8 | estado | Barra de título + 4 tarjetas `animate-pulse` | Carga | Mientras `isLoading` | ModuloSection.tsx:270-280 |
| 9 | estado | «No se pudo cargar el panel de CRM» + mensaje + reintentar | `LoadErrorState` con reintento | Si falla el dashboard, los pipelines o la organización | CrmSection.tsx:234-241 |
| 10 | toast | «CSV exportado» / «PDF exportado» (con «{módulo} — {título}») | Confirmación | Tras exportar | ModuloSection.tsx:128 · 147 |
| 11 | toast | «No se pudo generar el CSV» / «No se pudo generar el PDF» | Error | Si falla la utilidad | ModuloSection.tsx:131 · 150 |
| 12 | toast | «Sin datos» / «No hay datos para exportar en esta sección» | Bloquea la exportación | Si no hay datos al pulsar | ModuloSection.tsx:118-121 · 138-141 |
| 13 | toast | «Error» / «No se pudo recargar el embudo de ventas: …» | Fallo al cambiar de pipeline | Al cambiar de pipeline | CrmSection.tsx:210 |

**No hay barra de filtros visible**: en `CrmSection.tsx:44-55` el periodo está fijo en los últimos 30 días, sin canal, sin pipeline y sin agente; lo único variable es `branchId`, del `BranchContext` global (l.133).

### B.3 KPIs del panel `components/crm/dashboard/CRMKPICards.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «Conversaciones Abiertas» + «{n} pendientes» (icono MessageSquare azul) | — | Siempre | CRMKPICards.tsx:92-98 |
| 2 | stat | «Tiempo Promedio Respuesta» + «SLA: {n}%» (icono Clock morado) | Valor formateado en `s`/`m`/`h` | Siempre | CRMKPICards.tsx:99-105 · 84-88 |
| 3 | stat | «Oportunidades Abiertas» + importe en COP (icono Target verde) | — | Siempre | CRMKPICards.tsx:106-112 |
| 4 | stat | «Pronóstico del Mes» + «Valor ponderado» (icono TrendingUp naranja) | — | Siempre | CRMKPICards.tsx:113-119 |
| 5 | stat | «Campañas Activas» (icono Megaphone rosa) | Sin subtítulo | Siempre | CRMKPICards.tsx:120-125 |
| 6 | stat | «Clientes Nuevos» + «Total: {n}» (icono UserPlus cian) | — | Siempre | CRMKPICards.tsx:126-132 |
| 7 | estado | 3 `Skeleton` de texto + uno cuadrado | Carga | Mientras `isLoading` | CRMKPICards.tsx:38-53 |

Rejilla `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`. **No hay flecha de tendencia**: `KPICard` la implementa (l.65-73) pero ninguno de los 6 pasa `trend`. Diseña las tarjetas sin delta.

### B.4 Embudo de ventas `components/crm/dashboard/CRMFunnelChart.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Embudo de Ventas» | Título | Siempre | CRMFunnelChart.tsx:95-97 |
| 2 | campo | Select placeholder «Seleccionar pipeline»; ítems «{nombre}» + « (default)» | Cambia el pipeline y recarga solo el embudo | Si `pipelines.length > 0` | CRMFunnelChart.tsx:99-114 |
| 3 | stat | «Valor total» + importe COP | Alineado a la derecha | Siempre | CRMFunnelChart.tsx:117-122 |
| 4 | texto | Barra por etapa: nombre a la izquierda (`w-28` con `truncate`), conteo y valor dentro | Ancho proporcional al conteo máximo; color del propio `stages.color` con `opacity: .9` | Por etapa | CRMFunnelChart.tsx:23-56 · 132-139 |
| 5 | tooltip | «{n}% probabilidad» | Pegado al borde derecho de la barra | Hover | CRMFunnelChart.tsx:51-53 |
| 6 | cálculo | — | Ancho mínimo forzado al 20 % aunque el conteo sea 0 | Siempre | CRMFunnelChart.tsx:24-26 |
| 7 | stat | «Valor ponderado (pronóstico)» + importe en verde | Fila inferior tras separador | Si hay etapas | CRMFunnelChart.tsx:140-149 |
| 8 | estado | «No hay etapas configuradas en el pipeline» | Vacío | Si `stages.length === 0` | CRMFunnelChart.tsx:126-129 |
| 9 | estado | Título skeleton + 5 barras de ancho decreciente (100 %, 85 %, 70 %…) | Carga | Mientras `isLoading` | CRMFunnelChart.tsx:69-85 |

### B.5 Actividad por día `components/crm/dashboard/CRMActivityChart.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Actividad por Día» | Título | Siempre | CRMActivityChart.tsx:111-113 |
| 2 | badge | «Conv.» (punto azul) · «Msg.» (verde) · «Oport.» (naranja) · «Act.» (morado) | Leyenda, solo lectura | Siempre | CRMActivityChart.tsx:115-130 |
| 3 | texto | Columna apilada de 4 segmentos, `h-32` fijo, `w-8` | — | Por día | CRMActivityChart.tsx:29-49 |
| 4 | tooltip | «Conv: {n}» / «Msg: {n}» / «Oport: {n}» / «Act: {n}» | Panel oscuro sobre la barra (`-top-24`) | Hover sobre la columna | CRMActivityChart.tsx:52-69 |
| 5 | texto | Día abreviado en español («lun», «mar»…), `capitalize` | Etiqueta bajo la columna | Siempre | CRMActivityChart.tsx:25 · 71-73 |
| 6 | cálculo | — | Solo se pintan los **últimos 14 días** del rango | Siempre | CRMActivityChart.tsx:105 |
| 7 | estado | «No hay datos de actividad en el periodo seleccionado» | Vacío | Si no hay días | CRMActivityChart.tsx:135-138 |
| 8 | estado | 7 columnas de 60/80/45/90/55/70/40 px | Carga | Mientras `isLoading` | CRMActivityChart.tsx:86-93 |

El contenedor es `overflow-x-auto`: en móvil las 14 columnas se desplazan, no se apilan.

### B.6 Mensajes por canal `components/crm/dashboard/CRMChannelsChart.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Mensajes por Canal» | Título | Siempre | CRMChannelsChart.tsx:84-86 |
| 2 | texto | Nombre del canal + conteo + barra de progreso | Icono y color por tipo: WhatsApp verde, Email azul, teléfono morado, web naranja, resto gris | Por canal | CRMChannelsChart.tsx:95-122 · 20-52 |
| 3 | texto | «{n}%» (ancho fijo `w-12`) | Porcentaje a la derecha | Por canal | CRMChannelsChart.tsx:119-121 |
| 4 | stat | «Total» + «{n} mensajes» | Fila inferior tras separador | Si hay canales | CRMChannelsChart.tsx:124-131 |
| 5 | estado | «No hay canales configurados» | Vacío | Si `data.length === 0` | CRMChannelsChart.tsx:89-92 |
| 6 | estado | 3 filas: cuadro 40 px + barra + chip | Carga | Mientras `isLoading` | CRMChannelsChart.tsx:55-77 |

### B.7 Listas Top `components/crm/dashboard/CRMTopLists.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Top Agentes» (icono User azul) | Título | Siempre | CRMTopLists.tsx:90-93 |
| 2 | badge | Círculo con el puesto (1, 2, 3…) | Oro el 1.º, gris el 2.º, bronce el 3.º, azul del 4.º en adelante | Por agente | CRMTopLists.tsx:107-115 |
| 3 | texto | Nombre + conversaciones, tiempo medio y resueltas (3 métricas con icono) | — | Por agente | CRMTopLists.tsx:116-134 |
| 4 | badge | «{n} conv.» (chip gris) | — | Oculto bajo `xs` (475 px, breakpoint propio declarado en `tailwind.config.js:12-14`) | CRMTopLists.tsx:135-137 |
| 5 | estado | «No hay datos de agentes» | Vacío | Lista vacía | CRMTopLists.tsx:96-99 |
| 6 | estado | 5 filas con avatar circular | Carga | Mientras `isLoading` | CRMTopLists.tsx:63-85 |
| 7 | texto | «Top Canales» (icono MessageSquare verde) | Título | Siempre | CRMTopLists.tsx:175-178 |
| 8 | texto | Cuadro de color por tipo + nombre + «{n} conversaciones» | — | Por canal | CRMTopLists.tsx:187-208 |
| 9 | badge | «{n} msg» (chip gris) | — | Siempre | CRMTopLists.tsx:209-211 |
| 10 | estado | «No hay canales configurados» | Vacío | Lista vacía | CRMTopLists.tsx:181-184 |
| 11 | estado | 3 filas | Carga | Mientras `isLoading` | CRMTopLists.tsx:148-170 |
| 12 | texto | «Próximas a Cerrar» (icono TrendingUp naranja) | Título | Siempre | CRMTopLists.tsx:249-252 |
| 13 | texto | Icono DollarSign teñido con el color de la etapa al 20 % + nombre + cliente + fecha «dd MMM» | El «•» separador y la fecha se ocultan bajo `xs` | Por oportunidad | CRMTopLists.tsx:261-291 |
| 14 | badge | «{n}%» con borde y texto del color de la etapa | Probabilidad | Siempre | CRMTopLists.tsx:292-301 |
| 15 | estado | «No hay oportunidades próximas a cerrar» | Vacío | Lista vacía | CRMTopLists.tsx:255-258 |
| 16 | estado | 5 filas | Carga | Mientras `isLoading` | CRMTopLists.tsx:222-244 |

Las tres listas se reparten en `grid-cols-1 lg:grid-cols-2` (CrmSection.tsx:244 · 255 · 260).

### B.8 Componentes de `crm/dashboard/**` que **no se renderizan** — no los dibujes

Exportados en `index.ts:8-9`, sin ningún consumidor (`CrmSection.tsx:13-31` solo monta KPIs, embudo, actividad, canales y las tres listas). Son ~500 líneas de UI muerta:

| # | Tipo | Etiqueta exacta | Qué haría | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | Select «Hoy» · «Ayer» · «Esta semana» · «Este mes» · «Últimos 30 días» · «Personalizado» | Presets de periodo | **Nunca** | CRMFilters.tsx:133-146 |
| 2 | diálogo | Popover «Desde» / «Hasta» con dos calendarios | Rango personalizado | Nunca | CRMFilters.tsx:148-212 |
| 3 | campo | Select «Todos los canales» | Filtro de canal | Nunca | CRMFilters.tsx:218-235 |
| 4 | campo | Select «Todos los pipelines» | Filtro de pipeline | Nunca | CRMFilters.tsx:238-255 |
| 5 | campo | Select «Todos los agentes» | Filtro de agente | Nunca | CRMFilters.tsx:258-275 |
| 6 | botón | «Limpiar» | Restablece filtros | Nunca | CRMFilters.tsx:281-291 |
| 7 | botón | «Actualizar» | Recarga | Nunca | CRMFilters.tsx:292-301 |
| 8 | menú | 13 tarjetas: «Bandeja» · «Pipeline» · «Oportunidades» · «Equipo» · «Pronóstico» · «Clientes» · «Actividades» · «Segmentos» · «Campañas» · «Reportes» · «Salud» · «Identidades» · «Configuración» | Navegación rápida | Nunca | CRMQuickNav.tsx:32-124 · 126-158 |
| 9 | botón | «Bandeja» / «Nueva Oportunidad» (móvil «Nueva») / «Oportunidades» / «Pronóstico» | Acciones rápidas | Nunca | CRMQuickNav.tsx:160-196 |

### B.9 `/app/crm/clientes` — idéntica a `/app/clientes`

`app/app/crm/clientes/page.tsx` (12 líneas) reexporta `ClientesPage`. Todos los controles son los de §A.0 a §A.8, sin una sola divergencia.

**Consecuencia grave para la navegación**: los enlaces de fila siguen apuntando a `/app/clientes/{id}` (ClientesTable.tsx:209 · 371 · 374). Desde `/app/crm/clientes` **nunca se llega a la ficha de CRM** de §B.10: al pulsar un cliente se sale del módulo y se abre la ficha de §A.9.

### B.10 `/app/crm/clientes/[id]` — cabecera `app/app/crm/clientes/[id]/page.tsx`

Ficha de CRM: otro archivo (480 líneas), otros componentes, 6 pestañas. Comparación con la ficha de §A.9:

| | `/app/crm/clientes/[id]` | `/app/clientes/[id]` |
|---|---|---|
| Componentes | `components/crm/**`: `CustomerFoliosSection`, `ClientHealthCard`, `DocumentUploader`, `QuickActionsBar`, `OpportunityTimeline` | `components/clientes/id/**` + `CompanyContactsManager` |
| Pestañas | «Info» · «Salud» · «Finanzas» · «Documentos» · «Oportunidades» · «Actividad» (6) | «Resumen» · «Información» · «Oportunidades» · «Timeline» · «Cuentas por cobrar» · «Notas y archivos» · «Contactos» (7) |
| Acciones rápidas | Sí (llamar, email, WhatsApp, reunión, tarea, nota) | No |
| Barra de tareas | No | Sí |
| Editar cliente | **No hay botón** | Sí |

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (ArrowLeft, sin texto) | `router.back()` — al historial, no a una ruta fija | Siempre | page.tsx:192-194 |
| 2 | texto | Nombre completo (h1, icono User en cuadro azul, `truncate`) | 18 px en móvil, 24 px desde `sm` | Siempre | page.tsx:195-201 |
| 3 | badge | «Empresa» (Building2) / «Persona» (outline, 10 px) | — | Si `customer_type` no es nulo | page.tsx:203-207 |
| 4 | badge | «Lead» · «Oportunidad» · «Cliente» · «Inactivo» (o el valor crudo) | `customers.lifecycle_stage` — **campo que el `ClientForm` no permite editar** (§A.20) | Si no es nulo | page.tsx:208-212 · 180-185 |
| 5 | badge | «{score}» (icono HeartPulse): verde ≥70, ámbar ≥40, rojo debajo | `customers.health_score` | Si no es nulo | page.tsx:213-222 |

Cabecera `flex-col sm:flex-row`. **No hay** botón «Editar», ni menú «…», ni eliminar.

### B.11 Ficha CRM — barra de acciones rápidas `components/crm/shared/QuickActionsBar.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | Trigger «Llamar» (icono Phone + chevron) | Despliega los modos; spinner mientras marca | Siempre (variante `detail`) | QuickActionsBar.tsx:173-187 · quickActionsConfig.ts:71-72 |
| 2 | menú | «Desde el navegador» | Softphone | `disabled` con motivo «Softphone no configurado en esta página» / «Softphone conectando…» / «no registrado» / «El cliente no tiene teléfono» | quickActionsConfig.ts:87-93 |
| 3 | menú | «Desde mi celular» | Abre `MobileCallDialog` (puente) | `disabled` con «El cliente no tiene teléfono» | quickActionsConfig.ts:94-96 |
| 4 | menú | «Agente IA» | — | **Siempre deshabilitado**: «Disponible al finalizar F6 (agentes de voz)» | quickActionsConfig.ts:97 |
| 5 | texto | «· predeterminado» (11 px, gris) | Sufijo del modo por defecto, que además va primero | Sobre `browser` o `mobile` | QuickActionsBar.tsx:198 · quickActionsConfig.ts:98-102 |
| 6 | botón | «Email» (icono Mail verde) | Abre `ComposeEmailDialog` | `disabled` con «El cliente no tiene email» | QuickActionsBar.tsx:208-232 · quickActionsConfig.ts:63-66 |
| 7 | botón | «WhatsApp» (icono MessageCircle esmeralda) | Abre `ComposeWhatsAppDialog` | `disabled` con «El cliente no tiene teléfono» | quickActionsConfig.ts:67-70 |
| 8 | botón | «Reunión» (icono Calendar morado) | Abre `MeetingDialog` | Si hay cliente | quickActionsConfig.ts:77-78 |
| 9 | botón | «Tarea» (icono CheckSquare índigo) | `TaskDialog` compacto, `relatedType='customer'` | Si hay cliente | QuickActionsBar.tsx:245-247 |
| 10 | botón | «Nota» (icono StickyNote ámbar) | `QuickNoteDialog` | Si hay cliente | QuickActionsBar.tsx:248-250 |
| 11 | tooltip | La etiqueta, o «{Etiqueta}: {motivo}» si está deshabilitado | El botón se envuelve en un `span` con `tabIndex=0` para que el motivo sea accesible | Hover/foco | QuickActionsBar.tsx:166-171 |
| 12 | toast | «Llamando…» + el número | — | Al iniciar llamada por navegador | QuickActionsBar.tsx:126 |
| 13 | toast | «Sin micrófono: llamamos desde tu celular» · «No se pudo iniciar la llamada» | — | Según el fallo | QuickActionsBar.tsx:121 · 129 |

Tarjeta blanca con `overflow-x-auto` (page.tsx:229-236): en móvil los 6 botones se desplazan. En variante `detail` llevan texto (`px-2.5 text-xs`, 32 px de alto). **No aparece** «Propuesta»: solo se muestra si se pasa en `actions`, y esta página no lo hace (`quickActionsConfig.ts:8-13`). Al completar cualquier acción la página salta a «Actividad» y recarga (page.tsx:234).

### B.12 Ficha CRM — KPIs y pestañas `app/app/crm/clientes/[id]/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «Oportunidades» (icono Target azul) | Conteo; la consulta tiene **tope de 20 registros** | Siempre | page.tsx:240-254 · 103 |
| 2 | stat | «Ganadas» (icono TrendingUp verde) | `status === 'won'` | Siempre | page.tsx:255-269 |
| 3 | stat | «Actividades» (icono Activity morado) | Conteo; **tope de 20** | Siempre | page.tsx:270-284 · 115 |
| 4 | stat | «Health Score» (icono HeartPulse rosa) | El valor o «—» | Siempre | page.tsx:285-299 |
| 5 | pestaña | «Info» (icono User) | Activa por defecto | Siempre | page.tsx:305-308 · 78 |
| 6 | pestaña | «Salud» (icono HeartPulse) | — | Siempre | page.tsx:309-312 |
| 7 | pestaña | «Finanzas» (icono Wallet) | — | Siempre | page.tsx:313-316 |
| 8 | pestaña | «Documentos» (icono FolderOpen) | — | Siempre | page.tsx:317-320 |
| 9 | pestaña | «Oportunidades» (icono Target) | — | Siempre | page.tsx:321-324 |
| 10 | pestaña | «Actividad» (icono Activity; valor interno `actividades`) | Destino automático tras una acción rápida | Siempre | page.tsx:325-328 · 234 |
| 11 | estado | `DetailSkeleton` | Carga de cliente, oportunidades y actividades | Mientras carga | page.tsx:161-167 |
| 12 | estado | «Cliente no encontrado» + botón «Volver» (`router.back()`) | Bloque centrado a `calc(100vh - 4rem)` | Si el cliente no existe, no es de la organización **o no es de la sucursal filtrada**; también si la consulta falla (el error se traga en `console.error`, l.151) | page.tsx:169-178 · 92 |

KPIs `grid-cols-2 sm:grid-cols-4`. La `TabsList` es `w-full justify-start overflow-x-auto`: en móvil se desplaza en una línea, no se pliega. Ninguna pestaña depende de permiso ni de plan. **No existe** estado «sin permiso».

### B.13 Ficha CRM › pestaña «Info» `app/app/crm/clientes/[id]/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Informacion de Contacto» (**sin tilde en el código**) | Título de la tarjeta | Siempre | page.tsx:335-337 |
| 2 | texto | Email (icono Mail, `truncate`) | Solo lectura, **sin `mailto:`** | Si hay email | page.tsx:341-346 |
| 3 | texto | Teléfono (icono Phone) | Solo lectura, **sin `tel:`** | Si hay teléfono | page.tsx:347-352 |
| 4 | texto | Dirección (icono MapPin, `truncate`) | — | Si hay dirección | page.tsx:353-358 |
| 5 | texto | «{tipo o "Doc"}: {número}» (icono FileText) | — | Si hay `doc_number` | page.tsx:359-366 |
| 6 | texto | «Cliente desde {dd mmm aaaa}» (icono Calendar) | `toLocaleDateString('es-CO')`, **sin timezone de la organización** | Si hay `created_at` | page.tsx:367-374 |

`grid-cols-1 sm:grid-cols-2`. Si el cliente no tiene ningún dato la tarjeta **queda vacía sin mensaje**: no hay estado vacío. Nada es editable.

### B.14 Ficha CRM › pestaña «Salud» `components/crm/health/ClientHealthCard.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Salud del cliente» (icono HeartPulse rosa) | Título | Si hay score | ClientHealthCard.tsx:93-96 |
| 2 | stat | `HealthGauge` tamaño `md` (88 px) | Medidor circular con la banda de color | Si hay score | ClientHealthCard.tsx:100 |
| 3 | badge | `HealthAlerts` | **Máximo 3 alertas** | Si hay score | ClientHealthCard.tsx:88 · 102 |
| 4 | stat | `HealthDimensions` | **Máximo 4 indicadores** | Si hay score e indicadores | ClientHealthCard.tsx:106-110 |
| 5 | stat | `HealthTrend` | Tendencia sobre los últimos 20 snapshots | Si hay score | ClientHealthCard.tsx:112-114 · 51 |
| 6 | estado | «La salud se mide solo para clientes; esta ficha es un lead/un prospecto/«{etapa}» con {n} factura(s). Cámbialo a cliente para medirlo.» · «…sin facturas.» · «Sin datos de salud para {nombre}: aún no tiene facturas ni actividad medibles.» | Vacío con el motivo real, según etapa y número de facturas | Si la RPC no devuelve score | ClientHealthCard.tsx:77-86 · 27-38 |
| 7 | estado | Título skeleton + círculo de 88 px + 3 líneas (`aria-busy`) | Carga | Mientras carga | ClientHealthCard.tsx:65-75 |

### B.15 Ficha CRM › pestaña «Finanzas» `components/crm/clientes/CustomerFoliosSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «Deuda Total» (ámbar, borde ámbar) | Folios pendientes + saldo de facturas | Siempre | CustomerFoliosSection.tsx:175-187 · 150-154 |
| 2 | stat | «Folios Pendientes» (azul) | Pendiente de folios **abiertos** | Siempre | CustomerFoliosSection.tsx:188-200 |
| 3 | stat | «Facturas por Cobrar» (rojo) | Saldos de `invoice_sales` con saldo > 0 | Siempre | CustomerFoliosSection.tsx:201-213 |
| 4 | texto | «Folios de Reservas ({n})» (icono Receipt) | Encabezado | Si hay folios | CustomerFoliosSection.tsx:219-222 |
| 5 | badge | «Abierto» (verde) / «Cerrado» (gris) | — | Por folio | CustomerFoliosSection.tsx:237-245 |
| 6 | badge | «Saldo Pendiente» (ámbar) | — | Si el folio tiene pendiente > 0 | CustomerFoliosSection.tsx:246-250 |
| 7 | texto | «Reserva {código} · Espacio {etiqueta} · {dd MMM aaaa}» | Separadores «·» condicionales | Por folio | CustomerFoliosSection.tsx:252-256 |
| 8 | stat | Importe pendiente (ámbar) + «{n} items» | Columna derecha | El importe solo si hay pendiente | CustomerFoliosSection.tsx:260-269 |
| 9 | botón | «Ver» (icono ExternalLink) | Abre `FolioDetailDialog`; al cerrar recarga | Por folio | CustomerFoliosSection.tsx:270-280 · 356-364 |
| 10 | botón | «Pagar» (icono Banknote, verde sólido) | Abre `FolioPaymentDialog`; al completar recarga | Solo si el folio tiene pendiente > 0 **y** está abierto | CustomerFoliosSection.tsx:281-293 · 366-376 |
| 11 | texto | «Facturas por Cobrar ({n})» (icono FileText) | Encabezado | Si hay facturas con saldo | CustomerFoliosSection.tsx:305-308 |
| 12 | badge | «Vencida» / «Por cobrar» | **Ambas en rojo**: no hay variante de color distinta | Por factura | CustomerFoliosSection.tsx:316-318 |
| 13 | texto | «Emitida: {dd MMM aaaa} · Vence: {dd MMM aaaa}» | «Vence» solo si hay `due_date` | Por factura | CustomerFoliosSection.tsx:321-324 |
| 14 | stat | Saldo en rojo + «de {total}» | Columna derecha | Por factura | CustomerFoliosSection.tsx:327-334 |
| 15 | estado | «Sin deudas pendientes» + «El cliente no tiene folios ni facturas con saldo pendiente.» (icono TrendingUp verde 48 px) | Vacío | Sin folios ni facturas | CustomerFoliosSection.tsx:343-353 |
| 16 | estado | 3 bloques de 96 px + 4 barras de 64 px | Carga | Mientras carga | CustomerFoliosSection.tsx:156-169 |

KPIs `grid-cols-1 md:grid-cols-3`. **Aviso**: la consulta de folios está rota (§G), así que en la práctica esta pestaña muestra solo facturas o el estado vacío.

### B.16 Ficha CRM › pestaña «Documentos» `components/crm/documents/DocumentUploader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Documentos del cliente» (icono Paperclip) + «({n})» | Título; el contador solo si hay documentos | Siempre | DocumentUploader.tsx:212-220 · page.tsx:397 |
| 2 | botón | «Subir archivo» (icono Upload; spinner mientras sube) | Abre el selector | Siempre; `disabled` subiendo | DocumentUploader.tsx:221-230 |
| 3 | campo | `input[type=file] multiple`, **sin restricción de tipo** | Oculto | Siempre | DocumentUploader.tsx:234-240 |
| 4 | estado | «Arrastra archivos aqui o haz click para subir» (**sin tildes en el código**) + «PDF, imagenes, contratos, etc.» | Zona punteada clicable | Si no hay documentos y no carga | DocumentUploader.tsx:243-254 |
| 5 | texto | Icono por tipo (imagen / PDF / genérico) + nombre + tamaño (B/KB/MB) + fecha «dd mmm» | **Único sitio del módulo** que formatea la fecha con la zona de la organización | Por documento | DocumentUploader.tsx:264-285 · 131-142 |
| 6 | badge | «confidencial» (ámbar, 10 px) | — | Si el documento la tiene | DocumentUploader.tsx:278-280 |
| 7 | botón | (icono Download) `title` «Descargar» | Descarga | Por documento | DocumentUploader.tsx:287-293 |
| 8 | botón | (icono Trash2 rojo) `title` «Eliminar» | Borra **sin pedir confirmación** | Por documento | DocumentUploader.tsx:294-300 |
| 9 | estado | 3 barras de 48 px | Carga | Mientras carga | DocumentUploader.tsx:256-261 |
| 10 | toast | «Error» / «No se pudo descargar el documento» | Fallo | Al fallar | DocumentUploader.tsx:122 |

La página monta la variante **completa**, no la `compact` (page.tsx:393-398). La compacta existe (l.144-208) con «{n} documento(s)», «Subir», tope de 5, «+{n} más...» y «Sin documentos»: **no la dibujes aquí**. Toda la pestaña desaparece si no hay `organization.id` (page.tsx:392).

### B.17 Ficha CRM › pestaña «Oportunidades» `app/app/crm/clientes/[id]/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Oportunidades ({n})» | Título | Siempre | page.tsx:406-408 |
| 2 | badge | Punto de 8 px con el color de la etapa (azul `#3b82f6` si no tiene) | — | Por oportunidad | page.tsx:422-425 |
| 3 | texto | Nombre (`truncate`, 12 px, seminegrita) | — | Por oportunidad | page.tsx:427-429 |
| 4 | texto | Nombre de la etapa o «Sin etapa» · fecha «dd mmm» (10 px) | La fecha solo si hay `expected_close_date` | Por oportunidad | page.tsx:430-437 |
| 5 | texto | Importe en COP | Columna derecha | Por oportunidad | page.tsx:440-442 |
| 6 | badge | «Ganada» (verde) · «Perdida» (rojo) · «Abierta» (azul), 9 px | — | Por oportunidad | page.tsx:443-452 |
| 7 | estado | «Este cliente no tiene oportunidades asociadas» (12 px, `py-6`) | Vacío | Lista vacía | page.tsx:411-414 |

**Las filas no son clicables**: son `div` con `hover:bg-gray-50`, sin `onClick` ni enlace. Desde aquí no se llega a la oportunidad, y no hay botón «Nueva oportunidad».

### B.18 Ficha CRM › pestaña «Actividad» `components/crm/timeline/OpportunityTimeline.tsx` · `TimelineFilters.tsx`

El timeline rico del CRM, que la pestaña «Timeline» de `/app/clientes/[id]` (§A.14) **no** usa.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Actividad» | Título de la tarjeta | Siempre | page.tsx:466 |
| 2 | chip | «Todos» · «Llamadas» · «Emails» · «WhatsApp» · «IA» · «Reuniones» · «Tareas» · «Notas» · «Sistema» (9) | Filtro por tipo; la activa en azul sólido, con `aria-pressed` | Siempre | TimelineFilters.tsx:54-71 · utils.ts:80-90 |
| 3 | campo | Select placeholder «Usuario»; «Todos los usuarios» + miembros activos (máx. 100) | Filtra por autor | Siempre | TimelineFilters.tsx:73-79 |
| 4 | campo | `type="date"`, `aria-label` «Desde» | Límite inferior a las 00:00:00 | Siempre | TimelineFilters.tsx:80 |
| 5 | campo | `type="date"`, `aria-label` «Hasta» | Límite superior a las 23:59:59 | Siempre | TimelineFilters.tsx:81 |
| 6 | botón | «Limpiar» (icono X) | Borra todos los filtros | Si hay alguno activo | TimelineFilters.tsx:82-86 |
| 7 | badge | `title` «Tiempo real activo» · «Sin tiempo real: actualizando cada 15 s» · «Conectando…» | Icono Wifi verde, WifiOff ámbar o spinner | Siempre | OpportunityTimeline.tsx:111-112 |
| 8 | botón | (icono RefreshCw) `aria-label` «Actualizar» | Recarga | Siempre | OpportunityTimeline.tsx:113 |
| 9 | botón | «{n} entrada nueva» / «{n} entradas nuevas» (icono ArrowUp, barra azul a lo ancho) | Inserta las nuevas y sube el scroll | Si llegaron entradas con el usuario abajo | OpportunityTimeline.tsx:120-124 |
| 10 | estado | Mensaje del error + «Reintentar» (caja roja) | Error | Si falla la carga | OpportunityTimeline.tsx:126-131 |
| 11 | estado | «Aún no hay interacciones. Empieza con una llamada, un email o una nota.» (icono Inbox) | Vacío; monta **otra** `QuickActionsBar` centrada, variante `drawer` | Sin entradas ni error | OpportunityTimeline.tsx:138-145 |
| 12 | texto | Encabezado de día («Hoy», «Ayer», fecha) en mayúsculas de 11 px, `sticky`, con la línea vertical a la izquierda | — | Por grupo de día | OpportunityTimeline.tsx:148-158 |
| 13 | botón | «Cargar más» (con spinner) | Página de 30 entradas; también se dispara solo por `IntersectionObserver` a 200 px del final | Si hay más | OpportunityTimeline.tsx:163-169 · 77-83 |
| 14 | estado | 3 tarjetas con 3 líneas skeleton, sangradas `pl-10` | Primera carga | Mientras carga | OpportunityTimeline.tsx:134-137 |

Los filtros se guardan en `localStorage` bajo `crm.timeline.filters` (l.40 · 64): la pestaña recuerda chips y fechas entre visitas. `flex-col` en móvil, `sm:flex-row sm:flex-wrap` desde 640. La barra de acciones rápidas **no se repite** arriba del timeline (`showComposer` es `false`); solo reaparece dentro del vacío.

---

## C. Oportunidades, pipeline y pronóstico

Es el bloque más grande del módulo (≈ 960 controles). Se numera en cinco sub-bloques para no perder la correspondencia con los archivos:
**CA** `/app/crm/oportunidades` · **CB** `/app/crm/oportunidades/[id]` · **CC** el formulario (`/nuevo` y `/[id]/editar`) · **CD** `/app/crm/pipeline` (+ `edit-opportunity`) · **CE** `/app/crm/pronostico`.

Nota común: **ninguna de estas pantallas usa `messages/es.json`** — no hay un solo `useTranslations` en los árboles auditados. El breakpoint `xs` existe y vale 475 px (`tailwind.config.ts:13`).

### CA.1 Lista — cabecera `app/app/crm/oportunidades/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Oportunidades» (h1, `text-xl sm:text-2xl`, bold) | Título | Siempre | page.tsx:218 |
| 2 | texto | «Gestiona todas las oportunidades de venta» | Subtítulo `text-sm` gris | Siempre | page.tsx:219-221 |
| 3 | estado | «No se pudieron cargar las oportunidades» + mensaje de `describeError` | Caja roja `role="alert"`; **no sustituye a la tabla**, se apila encima | `loadError !== null` | page.tsx:224-231 · LoadErrorState.tsx:32-43 |
| 4 | botón | «Reintentar» (RefreshCw, gira al reintentar) | `loadData()`; `disabled` mientras `isLoading` | En el bloque de error | LoadErrorState.tsx:44-54 |

Contenedor `p-3 sm:p-4 md:p-6`, `space-y-4 sm:space-y-6`, `min-h-screen`. **La cabecera no tiene acciones propias**: todas viven en la barra de filtros (CA.3).

### CA.2 Lista — tarjetas KPI `components/crm/oportunidades/OpportunitiesStats.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «Total Oportunidades» (Users, azul) | `stats.total` | Siempre | OpportunitiesStats.tsx:15-21 |
| 2 | stat | «Monto Total» (DollarSign, verde) | `formatCurrency(stats.totalAmount)` | Siempre | OpportunitiesStats.tsx:22-28 |
| 3 | stat | «Monto Ponderado» (Target, morado) | `formatCurrency(stats.weightedAmount)` | Siempre | OpportunitiesStats.tsx:29-35 |
| 4 | stat | «Tasa de Cierre» (Percent, naranja) | `${winRate.toFixed(1)}%` — **punto decimal y sin espacio** antes del `%` | Siempre | OpportunitiesStats.tsx:36-42 |
| 5 | stat | «Abiertas» (TrendingUp, azul) | `stats.open` | Siempre | OpportunitiesStats.tsx:89-95 |
| 6 | stat | «Ganadas» (TrendingUp, verde) | `stats.won` | Siempre | OpportunitiesStats.tsx:96-102 |
| 7 | stat | «Perdidas» (TrendingDown, rojo) | `stats.lost` | Siempre | OpportunitiesStats.tsx:103-109 |
| 8 | stat | «Promedio» (DollarSign, gris) | `formatCurrency(stats.avgDealSize)` | Siempre | OpportunitiesStats.tsx:110-116 |
| 9 | estado | 4 tarjetas con dos barras `animate-pulse` | **La fila secundaria de 4 KPIs no tiene esqueleto: desaparece durante la carga** | `isLoading` | OpportunitiesStats.tsx:45-60 |
| 10 | cálculo | `winRate` | `won / (won + lost) × 100` sobre el mismo listado filtrado | Siempre | opportunitiesService.ts:518-544 |

Rejilla `grid-cols-2 lg:grid-cols-4`, `gap-2 sm:gap-4`. Las 4 primeras son tarjetas independientes; las 4 secundarias viven dentro de **una sola** tarjeta que ocupa `col-span-2 lg:col-span-4`, subdividida en `grid-cols-2 sm:grid-cols-4`. Etiqueta `text-[10px] sm:text-sm`, cifra `text-lg sm:text-2xl`, todo con `truncate`.

### CA.3 Lista — búsqueda y acciones `components/crm/oportunidades/OpportunitiesFilters.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | placeholder «Buscar oportunidades...» (icono Search) | Escribe en `filters.search`. **Sin debounce**: cada tecla relanza las 5 consultas de `loadData` | Siempre | OpportunitiesFilters.tsx:74-82 · page.tsx:54-85 |
| 2 | botón | «Filtros» (icono Filter) | Despliega el panel CA.4; al abrirse se tiñe `bg-blue-50` con borde azul | Siempre | OpportunitiesFilters.tsx:83-98 |
| 3 | badge | «!» (píldora azul redonda) | Avisa de filtros activos | Si `pipelineId`, `stageId`, `status`, `customerId`, `dateFrom`, `dateTo` o `search` tienen valor | OpportunitiesFilters.tsx:93-97 |
| 4 | botón | «Exportar» (icono Download) | **Sin efecto real**: solo lanza un toast | Siempre | OpportunitiesFilters.tsx:102-112 · page.tsx:244 |
| 5 | botón | «Importar» (icono Upload) | **Sin efecto real**: solo lanza un toast | Siempre | OpportunitiesFilters.tsx:113-123 · page.tsx:245 |
| 6 | botón | «Nueva Oportunidad» (≥475 px) / «Nuevo» (<475 px), icono Plus, azul | `/app/crm/oportunidades/nuevo` | Siempre | OpportunitiesFilters.tsx:124-128 · page.tsx:194-196 |
| 7 | toast | «Info» / «Función de exportación próximamente» | Respuesta de 4 | Al pulsar «Exportar» | page.tsx:198-204 |
| 8 | toast | «Info» / «Función de importación próximamente» | Respuesta de 5 | Al pulsar «Importar» | page.tsx:206-212 |

`flex-col` en móvil, `sm:flex-row justify-between` desde 640. Buscador `flex-1` limitado a `sm:max-w-xs`. Las etiquetas «Exportar» e «Importar» usan `hidden xs:inline`: **bajo 475 px esos dos botones quedan solo con el icono**.

### CA.4 Lista — panel de filtros `OpportunitiesFilters.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | «Pipeline» · placeholder «Todos los pipelines» · «Todos los pipelines» + uno por registro | Fija `pipelineId` y **limpia `stageId`** | Panel abierto | OpportunitiesFilters.tsx:136-163 |
| 2 | campo | «Etapa» · placeholder «Todas las etapas» · «Todas las etapas» + una por etapa, con punto de color `stage.color` | Fija `stageId`; se filtran por el pipeline elegido | Panel abierto | OpportunitiesFilters.tsx:165-194 |
| 3 | campo | «Estado» · placeholder «Todos los estados» · «Todos los estados» · «Abierta» · «Ganada» · «Perdida» | Fija `status` | Panel abierto | OpportunitiesFilters.tsx:196-220 |
| 4 | campo | «Cliente» · placeholder «Todos los clientes» · «Todos los clientes» + uno por cliente; lista `max-h-60` con scroll | Fija `customerId` | Panel abierto | OpportunitiesFilters.tsx:222-245 |
| 5 | campo | «Fecha cierre desde» · botón «Seleccionar fecha» o `dd/MM/yyyy` (locale `es`) que abre un `Calendar` en `Popover` | Fija `dateFrom` como `yyyy-MM-dd` | Panel abierto | OpportunitiesFilters.tsx:247-281 |
| 6 | campo | «Fecha cierre hasta» · mismo patrón | Fija `dateTo` | Panel abierto | OpportunitiesFilters.tsx:283-317 |
| 7 | botón | «Limpiar filtros» (icono X) | `onFiltersChange({})` — borra también el texto del buscador | Solo con filtros activos | OpportunitiesFilters.tsx:320-332 |

Caja `p-4 rounded-lg` gris. Rejilla `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`: en `lg` las dos fechas caen en una segunda fila. «Limpiar filtros» va `justify-end`.

### CA.5 Lista — tabla `components/crm/oportunidades/OpportunitiesTable.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | tabla | «Nombre» (icono ArrowUpDown) | Ordena por `name` (`localeCompare`), alterna asc/desc | Siempre | OpportunitiesTable.tsx:182-184 |
| 2 | tabla | «Cliente» (no ordenable) | `customer.full_name` o «-» | **Oculta bajo 640 px** | OpportunitiesTable.tsx:185 |
| 3 | tabla | «Etapa» (no ordenable) | Punto `stage.color` (fallback `#3b82f6`) + nombre, o «-» | **Oculta bajo 768 px** | OpportunitiesTable.tsx:186 |
| 4 | tabla | «Monto» (ArrowUpDown) | Ordena por `amount`; celda con `formatCurrency` | Siempre | OpportunitiesTable.tsx:187-189 |
| 5 | tabla | «Prob.» (no ordenable) | `Math.round(stage.probability)` + `%`, o «-» | **Oculta bajo 1024 px** | OpportunitiesTable.tsx:190 |
| 6 | tabla | «Fecha Cierre» (ArrowUpDown) | Ordena por `expected_close_date`; celda `dd/MM/yyyy` | **Oculta bajo 1024 px** | OpportunitiesTable.tsx:191-193 |
| 7 | tabla | «Estado» (no ordenable) | Badge 11-14 | Siempre | OpportunitiesTable.tsx:194 |
| 8 | tabla | (vacía, `w-10`) | Aloja el menú «…» | Siempre | OpportunitiesTable.tsx:195 |
| 9 | botón | Nombre de la oportunidad (`CopyableId`, azul, `title` «Ver detalle») + icono de copiar (`title`/`aria-label` «Copiar») | El texto navega al detalle; el icono copia el **UUID** y muestra un check verde 2 s | Por fila | OpportunitiesTable.tsx:207-213 · CopyableId.tsx:39-70 |
| 10 | texto | Nombre del cliente bajo el de la oportunidad (`text-[10px]`) | Reposición de la columna «Cliente» | Solo bajo 640 px (`sm:hidden`) | OpportunitiesTable.tsx:214-216 |
| 11 | badge | «Abierta» (azul) | — | `status === 'open'` | OpportunitiesTable.tsx:102-107 |
| 12 | badge | «Ganada» (verde) | — | `status === 'won'` | OpportunitiesTable.tsx:108-113 |
| 13 | badge | «Perdida» (rojo) | — | `status === 'lost'` | OpportunitiesTable.tsx:114-119 |
| 14 | badge | `{status}` **crudo** (`secondary`) | Rama por defecto | Cualquier otro valor | OpportunitiesTable.tsx:120-121 |
| 15 | atajo | Clic en cualquier punto de la fila | Navega al detalle; el menú «…» hace `stopPropagation` | Siempre | OpportunitiesTable.tsx:200-204 |
| 16 | estado | Cabeceras **sin** botones de orden + 5 filas × 8 `Skeleton`. Las cabeceras de carga son texto plano y **todas visibles**, sin las clases `hidden …:table-cell` | Carga | `isLoading` | OpportunitiesTable.tsx:136-166 |
| 17 | estado | «No se encontraron oportunidades» (caja `p-8` centrada) | Sustituye a la tabla entera | Sin filas y sin carga | OpportunitiesTable.tsx:168-174 |
| 18 | cálculo | Orden por defecto | `created_at` descendente | Al montar | OpportunitiesTable.tsx:65-66 |

`rounded-md border overflow-hidden` con `overflow-x-auto` interno. Celdas `py-2 text-xs sm:py-3 sm:text-sm`. Bajo 640 px solo quedan 4 columnas: Nombre (con el cliente debajo), Monto, Estado y el menú. **No hay paginación ni selección múltiple**: se pinta todo lo que devuelve `getOpportunities`.

### CA.6 Lista — menú «…» por fila `OpportunitiesTable.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | Trigger (MoreHorizontal, `h-8 w-8` fantasma) | Abre el menú `align="end"` | Siempre | OpportunitiesTable.tsx:248-253 |
| 2 | menú | Etiqueta «Acciones» | Encabezado | Al abrir | OpportunitiesTable.tsx:258-260 |
| 3 | menú | «Ver detalle» (Eye) | `/app/crm/oportunidades/{id}` | Siempre | OpportunitiesTable.tsx:262-271 |
| 4 | menú | «Editar» (Edit) | `/app/crm/oportunidades/{id}/editar` | Siempre | OpportunitiesTable.tsx:272-281 |
| 5 | menú | «Duplicar» (Copy) | Clona nombre con sufijo « (copia)», pipeline, etapa, cliente, monto, moneda, fecha y **solo los productos** (no espacios ni conceptos); navega a la copia | Siempre | OpportunitiesTable.tsx:282-291 · opportunitiesService.ts:424-446 |
| 6 | menú | «Marcar ganada» (CheckCircle verde) | `updateOpportunity({status:'won'})` **directo**, sin ficha de handoff ni cierre financiero | **Solo si `status === 'open'`** | OpportunitiesTable.tsx:295-304 · opportunitiesService.ts:448-450 |
| 7 | menú | «Marcar perdida» (XCircle rojo) | Abre CA.7 | **Solo si `status === 'open'`** | OpportunitiesTable.tsx:305-314 |
| 8 | menú | «Eliminar» (Trash2 rojo) | **`confirm()` nativo** «¿Estás seguro de eliminar esta oportunidad?» y luego borra líneas de producto/espacio/concepto y la oportunidad | Siempre | OpportunitiesTable.tsx:318-327 · page.tsx:120-141 |
| 9 | toast | «Éxito» / «Oportunidad duplicada correctamente» · «Error» / «No se pudo duplicar la oportunidad» | — | Tras duplicar | page.tsx:103-114 |
| 10 | toast | «Éxito» / «Oportunidad eliminada correctamente» · «Error» / «No se pudo eliminar la oportunidad» | — | Tras eliminar | page.tsx:126-137 |
| 11 | toast | «Éxito» / «Oportunidad marcada como ganada» · «Éxito» / «Oportunidad marcada como perdida» · «Error» / «No se pudo actualizar la oportunidad» | — | Tras cerrar | page.tsx:147-188 |

Dos `DropdownMenuSeparator` parten el menú en tres bloques: navegación, cierre (solo en abiertas) y destrucción.

### CA.7 Diálogo «Registrar razón de pérdida» `components/crm/oportunidades/LossReasonDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Registrar razón de pérdida» | — | Al abrir | LossReasonDialog.tsx:95-97 |
| 2 | texto | «Por favor, indica el motivo por el cual se perdió esta oportunidad.» | Descripción | Siempre | LossReasonDialog.tsx:98-100 |
| 3 | campo | «Motivo de pérdida» · placeholder «Selecciona un motivo» · **7 opciones cableadas**: «Precio muy alto» · «Eligió a la competencia» · «Sin presupuesto» · «No es el momento adecuado» · «Sin respuesta del cliente» · «No cumple requisitos» · «Otro motivo» | Fija `lossReasonId` | Siempre | LossReasonDialog.tsx:104-120 · 32-40 |
| 4 | campo | Textarea «Describe el motivo» · placeholder «Escribe el motivo de la pérdida...» (3 filas) | Sustituye la etiqueta enviada | **Solo si el motivo es `other`** | LossReasonDialog.tsx:122-136 |
| 5 | campo | «Competidor» · placeholder «Nombre del competidor» | `competitor` | **Solo si el motivo es `competitor`** | LossReasonDialog.tsx:139-152 |
| 6 | campo | «Precio del competidor» · placeholder «0.00» (`type="number"`) | `competitorPrice` | **Solo si el motivo es `competitor`** | LossReasonDialog.tsx:154-168 |
| 7 | campo | «Fecha de recontacto (opcional)» (`type="date"`) | `recontactDate` | Siempre | LossReasonDialog.tsx:170-181 |
| 8 | campo | Textarea «Notas adicionales (opcional)» · placeholder «Notas sobre la pérdida...» (2 filas) | Se envía pero **no se guarda en columna propia**, solo en `metadata` | Siempre | LossReasonDialog.tsx:183-195 · opportunitiesService.ts:476-493 |
| 9 | botón | «Cancelar» | Limpia los seis campos y cierra | Siempre | LossReasonDialog.tsx:199-205 |
| 10 | botón | «Confirmar pérdida» / «Guardando...» (rojo) | `markAsLost`: escribe `status`, `loss_reason`, `loss_reason_value`, `competitor_name`, `competitor_price`, `missing_features`, `recontact_at` | `disabled` sin motivo, o con `other` sin texto, o al guardar | LossReasonDialog.tsx:206-212 |

`sm:max-w-md`. El cuerpo es `space-y-4 py-4` **sin scroll propio**: con «Eligió a la competencia» crece a 6 campos y puede desbordar en pantallas bajas, a diferencia de `StructuredLossDialog` (CD.20), que sí lleva `max-h-[60vh] overflow-y-auto`.

### CA.8 «Importar prospectos (Leads) desde CSV» — **componente huérfano** `ImportLeadsCsv.tsx`

**Ningún archivo lo importa.** El botón «Importar» de CA.3 lanza un toast, no este diálogo. Se documenta para que el diseño sepa que existe la pieza, y para que no la dibuje como si estuviera viva.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Importar prospectos (Leads) desde CSV» (icono Upload) | — | **Nunca** | ImportLeadsCsv.tsx:364-367 |
| 2 | texto | «Columnas esperadas: name, email, phone, company, source. Se creará un cliente y una oportunidad por cada fila.» | Descripción | — | ImportLeadsCsv.tsx:368-371 |
| 3 | campo | «Archivo CSV» (`type="file"`, `accept=".csv,text/csv"`) | Parsea el CSV; acepta alias en español e inglés («nombre», «correo», «teléfono», «empresa», «origen») | — | ImportLeadsCsv.tsx:378-389 · 66-72 |
| 4 | texto | «{archivo} - {n} fila(s)» (icono FileSpreadsheet) | Confirma el archivo leído | Tras elegir | ImportLeadsCsv.tsx:390-395 |
| 5 | botón | «Descargar plantilla» (Download) | CSV de ejemplo con cabecera `name,email,phone,company,source` y dos filas ficticias | — | ImportLeadsCsv.tsx:397-407 · 62-64 |
| 6 | tabla | «Vista previa ({n} filas)» · columnas «Nombre» · «Email» · «Teléfono» · «Empresa» · «Origen» | Las **50 primeras**; los nombres vacíos se pintan «(vacío)» en rojo | Con filas y sin resultado | ImportLeadsCsv.tsx:411-455 |
| 7 | texto | «Mostrando primeras 50 filas de {n}...» | Aviso de recorte | `rows.length > 50` | ImportLeadsCsv.tsx:449-453 |
| 8 | estado | Barra `Progress` azul + «Importando... {n}%» | Progreso fila a fila | `isImporting` | ImportLeadsCsv.tsx:459-466 |
| 9 | stat | «Total» · «Exitosos» (verde, CheckCircle) · «Errores» (rojo, XCircle) | Resumen en `grid-cols-3` | Tras importar | ImportLeadsCsv.tsx:471-492 |
| 10 | tabla | «Detalle de errores» con «Fila {n} - {nombre}: {error}» (`max-h-40`) | — | Si hubo errores | ImportLeadsCsv.tsx:494-518 |
| 11 | botón | «Cancelar» / «Cerrar» | Cierra y resetea; `disabled` al importar | El texto cambia según haya resultado | ImportLeadsCsv.tsx:524-531 |
| 12 | botón | «Importar {n} lead(s)» / «Importando...» (Loader2) | Crea un `customer` y una `opportunity` por fila, **en bucle secuencial** | Con filas y sin resultado | ImportLeadsCsv.tsx:532-550 |
| 13 | botón | «Importar otro archivo» | Resetea | Con resultado | ImportLeadsCsv.tsx:551-558 |
| 14 | toast | «Importación completada» / «{n} leads importados, {m} errores.» (`warning` si hubo errores, `success` si no) | — | Al terminar | ImportLeadsCsv.tsx:342-346 |
| 15 | cálculo | Orígenes válidos | `whatsapp`, `email`, `phone`, `web`, `referral`, `other` | — | ImportLeadsCsv.tsx:74 |

`sm:max-w-2xl`, cuerpo `max-h-[65vh] overflow-y-auto`.

### CA.9 «Calificación GOC» — **no se monta en esta pantalla** `ScoringSection.tsx`

Su único consumidor es la pestaña «Resumen» del drawer del pipeline (`pipeline/drawer/tabs/ResumenTab.tsx:12` · `:95`).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Calificación GOC» (icono Gauge azul) | Encabezado `h3` | Siempre | ScoringSection.tsx:179-181 |
| 2 | badge | «GOC {score}» + icono de temperatura | Rojo <40, ámbar 40–70, verde >70 | Solo si ya hay `score_total` | ScoringSection.tsx:182-184 |
| 3 | estado | `Skeleton h-32` | Carga de configuración y score | — | ScoringSection.tsx:151-161 |
| 4 | estado | «No hay configuración de scoring. Configura los indicadores en Configuración CRM.» (cursiva) | Vacío | `config` nulo o sin indicadores | ScoringSection.tsx:163-175 |
| 5 | texto | «{etiqueta del indicador}» + «({peso}%)» en gris | Uno por indicador de `scoring_configs` | Con configuración | ScoringSection.tsx:190-193 |
| 6 | chip | Una píldora por opción del indicador | La activa en `bg-blue-600 text-white` | Con configuración | ScoringSection.tsx:195-210 |
| 7 | botón | «Guardar Calificación» (Save / Loader2) | Calcula el score y escribe `score_total`, `temperature` y `score_data`; **si falla, reintenta guardando todo en `metadata`** | `disabled` al guardar | ScoringSection.tsx:215-227 · 117-135 |
| 8 | toast | «Calificación guardada» / «Score: {n} · Frío\|Tibio\|Caliente» · «Error al guardar» | — | Tras guardar | ScoringSection.tsx:139-145 |

### CB.1 Detalle — cabecera `components/crm/oportunidades/detail/DetailHeader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (ArrowLeft, `aria-label="Volver"`) | `router.back()` | Siempre | DetailHeader.tsx:48 |
| 2 | texto | `{opportunity.name}` (h1, `text-xl sm:text-2xl`, `truncate`) | — | Siempre | DetailHeader.tsx:51 |
| 3 | badge | Punto de temperatura de 10 px: azul `cold`, ámbar `warm`, rojo `hot` (`role="img"`, `aria-label` «Frío»/«Tibio»/«Caliente») | — | Si `temperature` normaliza a uno de los tres | DetailHeader.tsx:52 · TemperatureDot.tsx:17-21 · 42-56 |
| 4 | tooltip | «Frío» · «Tibio» · «Caliente» | Tooltip de Radix (`cursor-help`) | Hover sobre el punto | TemperatureDot.tsx:52-54 |
| 5 | badge | «Abierta» (azul) · «Ganada» (verde) · «Perdida» (rojo); otro `status` se pinta crudo sin clase | — | Siempre | DetailHeader.tsx:32-36 · 53 |
| 6 | texto | `{pipeline.name}` (icono Target) | — | Siempre | DetailHeader.tsx:56 |
| 7 | texto | `formatCurrency(displayAmount)` (icono DollarSign) | Ver CB.15-4 | Siempre | DetailHeader.tsx:58 |
| 8 | texto | Fecha `dd MMM yyyy` (locale `es`, icono Calendar) | — | Si hay `expected_close_date` | DetailHeader.tsx:59-61 |
| 9 | botón | «Ganar» (CheckCircle, verde sólido) | Abre `ClosedWonDialog` (CB.14) sin etapa destino | **Solo si `status === 'open'`**; `disabled` mientras `busy` | DetailHeader.tsx:66-68 |
| 10 | botón | «Perder» (XCircle, contorno rojo) | Abre `StructuredLossDialog` (CB.14) sin etapa destino | **Solo si `status === 'open'`** | DetailHeader.tsx:69 |
| 11 | botón | «Editar» (Edit) | `/app/crm/oportunidades/{id}/editar` | Siempre | DetailHeader.tsx:72 |
| 12 | botón | «Duplicar» (Copy) | `duplicateOpportunity` y navega a la copia | Siempre; `disabled` mientras `busy` | DetailHeader.tsx:73 |
| 13 | botón | (Trash2, `aria-label="Eliminar"`, contorno rojo) | **`confirm()` nativo** «¿Estás seguro de eliminar esta oportunidad?» y luego borra y vuelve al listado | Siempre | DetailHeader.tsx:74 · OpportunityDetail.tsx:117-128 |
| 14 | toast | «Oportunidad duplicada» · «Error» / «No se pudo duplicar» | — | Tras duplicar | OpportunityDetail.tsx:110 · 113 |
| 15 | toast | «Oportunidad eliminada» · «Error» / «No se pudo eliminar» | — | Tras eliminar | OpportunityDetail.tsx:122 · 125 |

Tarjeta `rounded-xl border shadow-sm p-5 sm:p-6`. Fila superior `flex-col lg:flex-row justify-between`: bajo 1024 px el grupo de botones cae bajo el título.

### CB.2 Detalle — embudo clicable `DetailHeader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Pipeline» (icono TrendingUp azul) | Título de la tarjeta | Siempre | DetailHeader.tsx:82 |
| 2 | chip | Una píldora por etapa: punto `stage.color` + nombre + «{probabilidad}%» | `PATCH /api/crm/opportunities/{id}/stage`; la activa `bg-blue-600 text-white` con sombra y `aria-current="step"` | Una por etapa | DetailHeader.tsx:86-100 |
| 3 | estado | Chips en `opacity-60 cursor-not-allowed` | **Deshabilitadas si `busy` o si `status !== 'open'`**; la etapa actual siempre lo está | Condición | DetailHeader.tsx:88 · 91-92 |
| 4 | cálculo | Conector `w-2 h-px` gris entre chips, salvo tras la última | — | Siempre | DetailHeader.tsx:97 |
| 5 | toast | «Etapa actualizada» · «No se pudo cambiar la etapa» / {mensaje} | El segundo solo para el fallo genérico (gate/won/lost abren diálogo) | Tras el PATCH | useStageFlow.tsx:28 · 32 |

Carril `flex items-center gap-1 overflow-x-auto pb-2`: con muchas etapas se desplaza lateralmente en cualquier ancho.

### CB.3 Detalle — acciones rápidas (variante `detail`) `QuickActionsBar.tsx`

Aquí se pasa `actions={[...ALL_QUICK_ACTIONS, 'proposal']}`, así que **sí aparece «Propuesta»**, a diferencia de la tarjeta Kanban, del drawer y de la ficha de cliente.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | Trigger «Llamar» (Phone azul) | Modos de llamada | Siempre; `disabled` también mientras `calling` | QuickActionsBar.tsx:173-187 |
| 2 | menú | «Desde el navegador» | Softphone | `disabled` con «Softphone no configurado en esta página» / «Softphone conectando…» / «Softphone no registrado» / «El cliente no tiene teléfono» | quickActionsConfig.ts:87-93 |
| 3 | menú | «Desde mi celular» | `MobileCallDialog` | `disabled` con «El cliente no tiene teléfono» | quickActionsConfig.ts:94-96 |
| 4 | menú | «Agente IA» | — | **Siempre deshabilitado**: «Disponible al finalizar F6 (agentes de voz)» | quickActionsConfig.ts:97 |
| 5 | badge | «· predeterminado» | Marca el modo por defecto resuelto por plataforma × preferencia × micrófono | Sobre `browser` o `mobile` | QuickActionsBar.tsx:198 |
| 6 | botón | «Email» (Mail verde) | `ComposeEmailDialog` | `disabled` con «El cliente no tiene email» | quickActionsConfig.ts:63-66 |
| 7 | botón | «WhatsApp» (MessageCircle esmeralda) | `ComposeWhatsAppDialog` | `disabled` con «El cliente no tiene teléfono» | quickActionsConfig.ts:67-70 |
| 8 | botón | «Reunión» (Calendar morado) | `MeetingDialog` | Con oportunidad o cliente | quickActionsConfig.ts:13 |
| 9 | botón | «Tarea» (CheckSquare índigo) | `TaskDialog` compacto | Ídem | quickActionsConfig.ts:13 |
| 10 | botón | «Nota» (StickyNote ámbar) | `QuickNoteDialog` | Ídem | quickActionsConfig.ts:13 |
| 11 | botón | «Propuesta» (FileText) | **No abre diálogo**: llama `onActionCompleted('proposal')`, que salta a la pestaña «Cierre» | Solo en el detalle; `disabled` con «Solo desde una oportunidad» | QuickActionsBar.tsx:221-222 · quickActionsConfig.ts:73-76 · OpportunityDetail.tsx:154 |
| 12 | tooltip | «{etiqueta}» o «{etiqueta}: {motivo}» | — | Sobre cada botón | QuickActionsBar.tsx:186 · 230 |
| 13 | estado | Todas deshabilitadas con «Sin oportunidad ni cliente» | — | Sin `opportunityId` ni `customerId` | quickActionsConfig.ts:61 |
| 14 | cálculo | Tras Email/WhatsApp/Reunión/Tarea/Nota, salta a «Actividad» e incrementa `refreshToken`. Tras «Llamar» **no** salta. Tras «Propuesta» va a «Cierre» | — | Siempre | OpportunityDetail.tsx:154 |

`role="toolbar"` con `aria-label="Acciones rápidas"`; en variante `detail` los botones llevan texto (`h-8 px-2.5 text-xs`) y `flex-wrap`.

### CB.4 Detalle — las 10 pestañas `OpportunityDetail.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | pestaña | «Actividad» (Activity) | Timeline unificado (CB.5) | Siempre · activa por defecto | OpportunityDetail.tsx:37 · 170 |
| 2 | pestaña | «Tareas» (ListTodo) | `TareasTab` | Siempre | OpportunityDetail.tsx:38 · 171 |
| 3 | pestaña | «Notas» (StickyNote) | `NotasTab` | Siempre | OpportunityDetail.tsx:39 · 172 |
| 4 | pestaña | «Documentos» (Paperclip) | `OpportunityDocuments` (CB.7) | Siempre | OpportunityDetail.tsx:40 · 173 |
| 5 | pestaña | «IA» (Bot) | `IATab` | Siempre | OpportunityDetail.tsx:41 · 174 |
| 6 | pestaña | «Productos ({n})» (Package) | `LineItemsTab kind="products"`; el contador solo si hay líneas cargadas | Siempre | OpportunityDetail.tsx:42 · 148 · 175 |
| 7 | pestaña | «Espacios ({n})» (BedDouble) | `LineItemsTab kind="spaces"` | Siempre | OpportunityDetail.tsx:43 · 176 |
| 8 | pestaña | «Conceptos ({n})» (FileText) | `LineItemsTab kind="custom"` | Siempre | OpportunityDetail.tsx:44 · 177 |
| 9 | pestaña | «Analítica» (BarChart3) | `AnalyticsTab` (CB.9) | Siempre | OpportunityDetail.tsx:45 · 178 |
| 10 | pestaña | «Cierre» (Handshake) | `ClosingTab` (CB.10) | Siempre | OpportunityDetail.tsx:47 · 179 |
| 11 | atajo | `?tab=…` en la URL | Abre esa pestaña si el valor está en el catálogo; al cambiar **conserva el resto de query params** | Al cargar y al navegar | OpportunityDetail.tsx:50 · 55 · 59 · 71-76 |

`TabsList` con `bg-transparent h-auto p-0 gap-1` dentro de un `overflow-x-auto`: **las 10 pestañas se desplazan lateralmente**, no envuelven. Cada trigger lleva el icono en un cuadro `p-1.5 rounded-lg bg-blue-100`, que pasa a `bg-primary` con icono blanco al activarse. La columna de pestañas ocupa `lg:col-span-2` de `grid-cols-1 lg:grid-cols-3`: bajo 1024 px el sidebar (CB.11) cae **debajo** del contenido.

### CB.5 Detalle › «Actividad» — timeline `OpportunityTimeline.tsx` · `TimelineFilters.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | chip | 9 filtros por tipo: «Todos» · «Llamadas» · «Emails» · «WhatsApp» · «IA» · «Reuniones» · «Tareas» · «Notas» · «Sistema» | Fija `kinds`; `aria-pressed`; el activo `bg-blue-600 text-white` | Siempre | TimelineFilters.tsx:54-71 · utils.ts:80-90 |
| 2 | campo | Select placeholder «Usuario» · «Todos los usuarios» + un ítem por miembro activo (nombre, o email, o «Usuario») | Fija `userId` | Siempre | TimelineFilters.tsx:73-79 |
| 3 | campo | `type="date"` `aria-label="Desde"` | ISO a las `00:00:00` locales | Siempre | TimelineFilters.tsx:80 |
| 4 | campo | `type="date"` `aria-label="Hasta"` | ISO a las `23:59:59` locales | Siempre | TimelineFilters.tsx:81 |
| 5 | botón | «Limpiar» (X) | Vacía los cuatro filtros | Con alguno activo | TimelineFilters.tsx:82-86 |
| 6 | cálculo | Persistencia | `localStorage['crm.timeline.filters']`, **compartido entre oportunidades y clientes** | Siempre | OpportunityTimeline.tsx:40-49 · 62-65 |
| 7 | badge | Wifi verde · WifiOff ámbar · Loader2 girando | Estado de la conexión en vivo | Siempre | OpportunityTimeline.tsx:112 |
| 8 | tooltip | «Tiempo real activo» · «Sin tiempo real: actualizando cada 15 s» · «Conectando…» | `title` del grupo | Hover | OpportunityTimeline.tsx:111 |
| 9 | botón | (RefreshCw, `aria-label="Actualizar"`) | `refresh()` | Siempre | OpportunityTimeline.tsx:113 |
| 10 | botón | «{n} entrada nueva» / «{n} entradas nuevas» (ArrowUp) | Inserta las retenidas y sube el scroll con `smooth` | Si `newCount > 0` | OpportunityTimeline.tsx:120-124 |
| 11 | estado | «{mensaje}» en caja roja + «Reintentar» | Error | `error !== null` | OpportunityTimeline.tsx:126-131 |
| 12 | estado | 3 tarjetas con 3 `Skeleton`, sangradas `pl-10` | Carga | `loading` y sin entradas | OpportunityTimeline.tsx:134-137 |
| 13 | estado | «Aún no hay interacciones. Empieza con una llamada, un email o una nota.» (Inbox) + una `QuickActionsBar` centrada | Vacío | Sin entradas ni error | OpportunityTimeline.tsx:138-145 |
| 14 | texto | Encabezado de día `sticky top-0`, `text-[11px]` en mayúsculas | Agrupa por día con etiqueta relativa | Con entradas | OpportunityTimeline.tsx:151 |
| 15 | botón | «Cargar más» (+ Loader2) | Pagina de 30 en 30; un `IntersectionObserver` con `rootMargin: 200px` lo dispara solo | Si `hasMore` | OpportunityTimeline.tsx:163-168 · 77-83 |

Filtros `flex-col` en modo compacto y `sm:flex-row sm:flex-wrap` en el detalle. El feed lleva `role="feed"` con `aria-busy` y una guía vertical de 1 px en `left-[13px]`.

### CB.6 Detalle › tarjeta de entrada del timeline `TimelineEntryCard.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | badge | Icono en círculo de 28 px con anillo blanco. **11 tipos**: `call` «Llamada» (verde, Phone) · `call_live` «Llamada en curso» (verde, PhoneCall, **con `animate-pulse`**) · `email` «Email» (azul, Mail) · `whatsapp` «WhatsApp» (esmeralda, MessageCircle) · `sms` «SMS» (cian, MessageSquare) · `ai_call` «Llamada IA» (violeta, Bot) · `task` «Tarea» (índigo, CheckSquare) · `note` «Nota» (ámbar, StickyNote) · `meeting` «Reunión» (morado, Calendar) · `system` «Sistema» (gris, RefreshCw) · `activity` «Actividad» (gris, Activity) | La etiqueta va en un `span.sr-only`: es el nombre accesible de la entrada | Una por entrada | TimelineEntryCard.tsx:39-51 · 96-98 · 102 |
| 2 | texto | Avatar del usuario (imagen o inicial) + nombre | — | Si la entrada tiene usuario | TimelineEntryCard.tsx:103-115 |
| 3 | texto | Hora relativa en `<time dateTime=…>` (`cursor-default`) | — | Siempre | TimelineEntryCard.tsx:120-122 |
| 4 | tooltip | Fecha y hora absolutas, lado `left`, retardo 300 ms | — | Hover sobre la hora | TimelineEntryCard.tsx:117-126 |
| 5 | cálculo | El cuerpo se delega por tipo a `CallEntry`, `EmailEntry`, `WhatsAppEntry`, `AiCallEntry`, `TaskEntry`, `NoteEntry`, `MeetingEntry`, `SystemEntry` y `GenericEntry` | — | Siempre | TimelineEntryCard.tsx:57-79 |
| 6 | cálculo | Las entradas `system` **no llevan tarjeta**: se pintan sueltas (`py-1`), sin borde ni fondo | — | `kind === 'system'` | TimelineEntryCard.tsx:99 |

### CB.7 Detalle › «Documentos» `OpportunityDocuments.tsx`

Tareas, Notas e IA comparten componente con el drawer del pipeline (CD.30, CD.31 y CD.33). Documentos, en cambio, es propio del detalle.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | «Nombre del documento» · placeholder «Nombre descriptivo...» | Se rellena solo con el nombre del archivo | Siempre | OpportunityDocuments.tsx:184-190 |
| 2 | botón | «Seleccionar archivo» o el nombre del archivo elegido (Paperclip) | Abre el selector nativo (`input type="file"` oculto, **sin `accept`**: acepta cualquier tipo) | Siempre | OpportunityDocuments.tsx:194-208 |
| 3 | botón | «Subir» (Upload / Loader2, azul) | Sube a Storage `crm` bajo `opportunity-docs/{id}/…` y registra la fila en `documents` | `disabled` sin archivo o al subir | OpportunityDocuments.tsx:209-217 |
| 4 | estado | Loader2 centrado `py-8` | Listando | — | OpportunityDocuments.tsx:222-225 |
| 5 | estado | «No hay documentos subidos» (FileText) | Vacío | Sin documentos | OpportunityDocuments.tsx:226-230 |
| 6 | texto | «{nombre}» + «{tamaño} · {dd mmm yyyy}» | Tamaño en B/KB/MB (o «—»); **la fecha sí usa `formatDateInTz`** | Por documento | OpportunityDocuments.tsx:242-245 · 37-42 |
| 7 | badge | Icono por MIME: ImageIcon azul, FileText rojo (PDF), FileText azul (Word), FileText verde (hoja de cálculo), File gris | — | Por documento | OpportunityDocuments.tsx:44-51 |
| 8 | botón | (Download, `title="Descargar"`) | URL firmada de 1 h en pestaña nueva | Por documento | OpportunityDocuments.tsx:248-254 |
| 9 | botón | (Trash2, `title="Eliminar"`) | **`confirm()` nativo** «¿Eliminar "{nombre}"?» y luego borra de Storage y de la tabla | Por documento | OpportunityDocuments.tsx:255-261 · 162-176 |
| 10 | toast | «Selecciona un archivo» (destructivo) · «Documento subido» · «Documento eliminado» · «Error al descargar» · «Error al eliminar» · «Error» / {mensaje} | — | Según el caso | OpportunityDocuments.tsx:95 · 131 · 170 · 158 · 173 · 138-142 |

**Divergencia**: el detalle usa este componente (bucket `crm`, tabla `documents` escrita desde el navegador) mientras el drawer del pipeline usa `DocumentUploader` con el bucket privado `crm-documents` (CD.32). **Lo subido en un sitio no se ve en el otro.**

### CB.8 Detalle › «Productos» · «Espacios» · «Conceptos» `detail/LineItemsTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «No hay productos cotizados» (Package) · «No hay espacios cotizados» (BedDouble) · «No hay conceptos personalizados» (FileText) | Vacío `py-8` | Sin ítems en esa familia | LineItemsTab.tsx:12-16 · 34-35 |
| 2 | texto | Producto: «{nombre o 'Producto'}» y «{cantidad} x {precio unitario}» | Solo lectura | Por línea | LineItemsTab.tsx:20 |
| 3 | texto | Espacio: «{etiqueta o 'Espacio'}» y «{n} noche/noches x {tarifa}» | Pluraliza | Por línea | LineItemsTab.tsx:21 |
| 4 | texto | Concepto: «{concepto}» y «{cantidad} x {precio unitario}» | Solo lectura | Por línea | LineItemsTab.tsx:22-23 |
| 5 | badge | Cuadro de 36 px con el icono de la familia: azul, morado o ámbar | — | Por línea | LineItemsTab.tsx:13-15 · 41 |
| 6 | stat | «Subtotal productos» · «Subtotal espacios» · «Subtotal conceptos» + importe | `Σ total_price` | Si hay ítems | LineItemsTab.tsx:47-50 |

**Estas tres pestañas son de solo lectura**: para añadir o quitar líneas hay que ir a «Editar» (CC).

### CB.9 Detalle › «Analítica» `detail/AnalyticsTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `Skeleton h-40 w-full` | Carga perezosa: solo consulta al activar la pestaña | `active` y sin datos | AnalyticsTab.tsx:36 |
| 2 | stat | «Días abierta» (azul) | `ceil((ahora − created_at) / 86 400 000)` — **días de calendario UTC, no de la zona de la organización** | Siempre | AnalyticsTab.tsx:40 · 49 |
| 3 | stat | «Tareas completadas» (verde) | «{hechas}/{total}» sobre `tasks.status === 'done'` | Siempre | AnalyticsTab.tsx:38 · 50 |
| 4 | stat | «Probabilidad» (morado) | `stage.probability.toFixed(0)` + `%` | Siempre | AnalyticsTab.tsx:41 · 51 |
| 5 | stat | «Actividades» (ámbar) | Total de filas de `activities` ligadas a la oportunidad | Siempre | AnalyticsTab.tsx:42 · 52 |
| 6 | texto | «Progreso de tareas» + «{n}%» + barra verde | `round(hechas / total × 100)` | Si hay tareas | AnalyticsTab.tsx:39 · 54-59 |
| 7 | texto | «Distribución de actividades» + una barra azul por tipo. **10 etiquetas**: «Llamada» · «Email» · «Reunión» · «Nota» · «Tarea» · «WhatsApp» · «Visita» · «Sistema» · «Llamada IA» · «SMS»; los desconocidos se pintan crudos | Escala relativa al tipo más frecuente | Si hay actividades | AnalyticsTab.tsx:14 · 60-73 |
| 8 | texto | «Estado en pipeline» con «Etapa actual», «Valor estimado», «Valor ponderado» y «Cierre estimado» | «Valor ponderado» = `displayAmount × (prob > 1 ? prob/100 : prob)`: tolera probabilidades guardadas como 0–1 o 0–100 | «Cierre estimado» solo si hay fecha | AnalyticsTab.tsx:74-82 |

4 KPIs en `grid-cols-2 md:grid-cols-4`. Las etiquetas de la distribución tienen ancho fijo `w-20` y el conteo `w-6` a la derecha.

### CB.10 Detalle › «Cierre» `detail/ClosingTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `DemoScheduler` | Agenda la demo; recibe el vertical y el asistente por defecto (nombre y email del cliente) | Siempre | ClosingTab.tsx:60-62 |
| 2 | texto | `ProposalGenerator` | Genera la propuesta; al cambiar informa el número, la validez y la moneda | Siempre | ClosingTab.tsx:64-66 |
| 3 | texto | «Contrato» (FileSignature azul) | Título `h2` | Siempre | ClosingTab.tsx:70 |
| 4 | botón | «Enviar a firma» | Abre `ContractSignDialog` con el HTML de la propuesta renderizado | **`disabled` sin propuesta generada** | ClosingTab.tsx:71 |
| 5 | tooltip | «Genera la propuesta primero» | `title` nativo | Solo cuando está deshabilitado | ClosingTab.tsx:71 |
| 6 | estado | «Sin contratos enviados. El contrato se firma electrónicamente sobre la propuesta aceptada.» | Vacío | `contracts.length === 0` | ClosingTab.tsx:73-74 |
| 7 | badge | **6 estados**: «Pendiente de envío» · «Enviado» · «Visto» · «Firmado» (verde `bg-green-600`) · «Rechazado» · «Vencido»; otro valor se pinta crudo | — | Por contrato | ClosingTab.tsx:31 · 79 |
| 8 | texto | Firmantes + «· firmado {fecha}» / «· enviado {fecha}» / «· creado {fecha}» | **Fecha y hora en la zona de la organización** (`useFormatDate`) | Por contrato | ClosingTab.tsx:80-81 |
| 9 | texto | «Pago en línea» (h2) | — | Siempre | ClosingTab.tsx:90 |
| 10 | texto | `PaymentLinkButton` | Enlace de pago sobre la cotización; se refresca con `refreshToken` | Siempre | ClosingTab.tsx:91 |

Cuatro `Card` apiladas, una por fase: demo → propuesta → contrato → pago.

### CB.11 Detalle — barra lateral `detail/DetailSidebar.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «Valor total» (mayúsculas por CSS) + importe `text-3xl` | Tarjeta con degradado azul y texto blanco | Siempre | DetailSidebar.tsx:28-31 |
| 2 | texto | «{n} item cotizados» / «{n} items cotizados» | Suma de líneas de las tres familias. **El singular dice «1 item cotizados»**: la `s` de «cotizados» no se pluraliza | Si hay al menos un ítem | DetailSidebar.tsx:32 |
| 3 | texto | «Productos» · «Espacios» · «Conceptos» con su importe | Desglose | Cada uno solo si su subtotal es > 0 | DetailSidebar.tsx:33-39 |
| 4 | stat | «Probabilidad» (Target morado) | `Math.round(stage.probability)` + `%`, o «-» | Siempre | DetailSidebar.tsx:45 |
| 5 | stat | «Cierre estimado» (Calendar azul) | `dd/MM/yyyy` o «-» | Siempre | DetailSidebar.tsx:46 |
| 6 | stat | «Creada» (Clock gris) | `dd/MM/yyyy` | Siempre | DetailSidebar.tsx:47 |
| 7 | texto | «Comisión de Vendedor» / «Comisión de Intermediación» (icono User) | Título de la tarjeta | **Solo si `commission_type` existe, no es `none` y `commission_rate > 0`** | DetailSidebar.tsx:51-56 |
| 8 | stat | «Tasa» + «{n}%» | — | Con comisión | DetailSidebar.tsx:59 |
| 9 | stat | «Monto» + importe azul | `displayAmount × commission_rate / 100` | Con comisión | DetailSidebar.tsx:60 |
| 10 | estado | «Comisión generada» (CheckCircle verde) | — | Con comisión y `status === 'won'` | DetailSidebar.tsx:61 |
| 11 | estado | «Se generará al marcar como ganada» (azul) | — | Con comisión y `status === 'open'` | DetailSidebar.tsx:62 |
| 12 | texto | «Cliente» (User azul) | Título | Siempre | DetailSidebar.tsx:71 |
| 13 | botón | «Editar» (Edit, fantasma `h-7`) | Abre `CustomerEditDialog` en modo edición | **Solo si hay `customer_id`** | DetailSidebar.tsx:72 · OpportunityDetail.tsx:186 |
| 14 | texto | Avatar circular con la inicial (o «?») + nombre | — | Con cliente | DetailSidebar.tsx:79-81 |
| 15 | badge | «Empresa» / «Persona» | Traduce `customer_type === 'company'` | Si hay `customer_type` | DetailSidebar.tsx:82 |
| 16 | texto | Email (Mail) · teléfono (Phone) · «{tipo doc o 'Doc'}: {número}» (IdCard) · dirección (MapPin) · ciudad (Building2) · empresa (Building2) | Filas `text-xs` con `truncate` | Cada una si su dato existe | DetailSidebar.tsx:85-90 |
| 17 | badge | Hasta **4** etiquetas del cliente (outline, icono Tag). **Las demás no se muestran ni se cuenta cuántas quedan** | — | Si `tags.length > 0` | DetailSidebar.tsx:91-93 |
| 18 | estado | «Sin cliente asignado» | Vacío | Sin cliente | DetailSidebar.tsx:95 |
| 19 | texto | «Razón de pérdida» + el texto guardado (tarjeta roja) | — | **Solo si `loss_reason` tiene valor** | DetailSidebar.tsx:106-113 |

Columna derecha de `lg:grid-cols-3`. Bajo 1024 px se apila bajo las pestañas, así que en móvil el «Valor total» queda **después** de todo el contenido de la pestaña activa.

### CB.12 Detalle — bloque «Objeciones» del sidebar `OpportunityObjectionsBlock.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Objeciones» (CircleAlert azul) | Título `h3` (`aria-labelledby`) | Siempre | OpportunityObjectionsBlock.tsx:124-126 |
| 2 | texto | «{n} pendiente» / «{n} pendientes» · «{n} resuelta» / «{n} resueltas» | Muestra pendientes si las hay; si no, el total de resueltas | Con objeciones vinculadas | OpportunityObjectionsBlock.tsx:127-131 |
| 3 | botón | «Registrar objeción» (Plus, azul `h-7`) | Abre CB.13 | Siempre | OpportunityObjectionsBlock.tsx:133-135 |
| 4 | estado | `Skeleton h-16` (`aria-busy`, `aria-label="Cargando objeciones"`) | Carga | — | OpportunityObjectionsBlock.tsx:138-141 |
| 5 | estado | «{error}.» en rojo (`role="alert"`) | — | Fallo de carga | OpportunityObjectionsBlock.tsx:142-143 |
| 6 | estado | «Ninguna todavía. Cuando el cliente diga «es muy caro» o «tengo que consultarlo», regístrala aquí y tendrás la respuesta a mano.» (borde discontinuo) | Vacío | Sin objeciones | OpportunityObjectionsBlock.tsx:144-147 |
| 7 | badge | CheckCircle2 esmeralda (resuelta) o CircleAlert ámbar (pendiente) + título; fallback «Objeción eliminada del catálogo» | — | Por objeción | OpportunityObjectionsBlock.tsx:44-48 |
| 8 | badge | Categoría (`CategoryBadge`) | — | Si sigue en el catálogo | OpportunityObjectionsBlock.tsx:50 |
| 9 | badge | «Resuelta» (esmeralda) / «Pendiente» (ámbar) | — | Por objeción | OpportunityObjectionsBlock.tsx:51-53 |
| 10 | texto | Nota de la objeción | — | Si se guardó | OpportunityObjectionsBlock.tsx:55 |
| 11 | botón | «Marcar resuelta» / «Guardando…» | Marca como resuelta; el ítem se desmonta y **el foco vuelve al ítem resuelto o a «Registrar objeción»** | **Solo en pendientes**; `disabled` al guardar | OpportunityObjectionsBlock.tsx:57-61 · 84-88 |
| 12 | texto | `ObjectionGuidance` (acordeón con respuesta y preguntas) | Se abre solo si la objeción se acaba de registrar | Solo en pendientes con catálogo | OpportunityObjectionsBlock.tsx:63-67 |
| 13 | toast | ««{título}» registrada» / «Abajo tienes la respuesta recomendada y las preguntas.» · ««{título}» resuelta» · «No se pudo registrar» / «No se pudo marcar como resuelta» | — | Según el caso | OpportunityObjectionsBlock.tsx:99 · 112 · 102 · 114 |

Cada objeción es un `li` con `tabIndex={-1}` e `id` propio (para el retorno de foco), borde ámbar si está pendiente y gris si está resuelta.

### CB.13 Diálogo «Registrar objeción» (desde la oportunidad) `RegisterObjectionDialog.tsx`

Es el mismo componente descrito en §E.15; aquí se documenta su montaje real.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Registrar objeción» + «Elige lo que dijo el cliente. Se registra al instante y verás cómo responder.» | — | Al abrir | RegisterObjectionDialog.tsx:53-56 |
| 2 | campo | `CommandInput` placeholder «Buscar por título o señal…» (`aria-label="Buscar objeción"`) | Filtra el catálogo | Siempre | RegisterObjectionDialog.tsx:59 |
| 3 | estado | «El catálogo está vacío: créalo en CRM › Objeciones.» / «Ninguna objeción coincide.» | — | Sin coincidencias | RegisterObjectionDialog.tsx:61-63 |
| 4 | menú | «{título}» + badge de categoría | **Registra al seleccionar: un clic, sin botón de confirmar** | Por objeción | RegisterObjectionDialog.tsx:64-87 |
| 5 | badge | «Ya registrada» (Check); la fila queda `disabled` | — | Si ya está pendiente en la oportunidad | RegisterObjectionDialog.tsx:80-84 |
| 6 | estado | Loader2 en la fila | Mientras registra esa objeción | — | RegisterObjectionDialog.tsx:79 |
| 7 | campo | «Nota (opcional)» · placeholder «Ej.: lo dijo al ver el precio anual» (`maxLength={280}`) | Se adjunta al registro | Siempre; `disabled` al registrar | RegisterObjectionDialog.tsx:91-100 |
| 8 | texto | «Vista previa: {título}» + la guía completa de la objeción resaltada | Previsualiza sin salir del diálogo | Con una fila resaltada | RegisterObjectionDialog.tsx:102-110 |

`sm:max-w-lg` con `p-0` y `overflow-hidden`. **No tiene botones de pie** y no se puede cerrar mientras hay un registro en vuelo.

### CB.14 Detalle — los cuatro diálogos del flujo de etapa `detail/useStageFlow.tsx`

Se montan siempre (`OpportunityDetail.tsx:185`) y se abren según el resultado del `PATCH /api/crm/opportunities/{id}/stage`.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Criterios incompletos» (título, lista de requisitos faltantes, «Cancelar», «Avanzar de todos modos») | Soft-gate | 409 con `reason:'gate'` | useStageFlow.tsx:69 · GateWarningDialog.tsx:32-91 |
| 2 | diálogo | `StructuredLossDialog` (CD.20). Catálogo dinámico con **8 motivos de reserva** si el servicio falla: «Precio muy alto» · «Eligió a la competencia» · «Faltan funcionalidades» · «Sin presupuesto» · «No es el momento adecuado» · «Sin respuesta del cliente» · «No cumple requisitos» · «Otro motivo» | Cierre perdido | Botón «Perder» o 409 `needs_lost` | useStageFlow.tsx:70 · StructuredLossDialog.tsx:30-39 |
| 3 | diálogo | «Cerrar como ganada — {nombre}» (`ClosedWonDialog`, CD.18). 9 campos, **solo «Qué compró *» obligatorio** | Ficha de handoff | Botón «Ganar» o 409 `needs_won` | useStageFlow.tsx:71 · ClosedWonDialog.tsx:99-139 |
| 4 | diálogo | «Cierre de oportunidad ganada: {nombre}» (`WonCloseModal`, CD.19). 7 acciones con checkbox | Cierre financiero | Tras confirmar 3 con éxito | useStageFlow.tsx:72 · WonCloseModal.tsx:145-283 |
| 5 | cálculo | Reintento tras «Ganar»: si el PATCH no aplica (gate, error o `needs_won` de nuevo), **no** se abre el modal de cierre sobre una oportunidad que no está ganada | — | Siempre | useStageFlow.tsx:56-65 |
| 6 | cálculo | Desde los botones «Ganar»/«Perder» de la cabecera no hay etapa objetivo, así que se llama a `markAsWon` / `markAsLost` del servicio | — | Botones de CB.1 | useStageFlow.tsx:45-54 · OpportunityDetail.tsx:78-82 |

### CB.15 Detalle — estados de pantalla `OpportunityDetail.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Círculo de 40 px + barra de 256 px, y debajo dos bloques `h-64` en `grid-cols-1 lg:grid-cols-3` | Esqueleto de cabecera y cuerpo | `loading` y sin oportunidad | OpportunityDetail.tsx:130-137 |
| 2 | estado | «{error}» o «Oportunidad no encontrada» | Mensaje centrado; sustituye a toda la pantalla | Sin oportunidad tras cargar | OpportunityDetail.tsx:138-145 |
| 3 | botón | «Volver» | `router.back()` | Junto al estado 2 | OpportunityDetail.tsx:142 |
| 4 | cálculo | `displayAmount` | Si la suma de productos + espacios + conceptos es > 0, se usa esa; si no, `opportunity.amount`. Alimenta cabecera, sidebar y analítica | Siempre | OpportunityDetail.tsx:99-104 |

### CC.1 Formulario — carcasa de las dos rutas `app/app/crm/oportunidades/nuevo/page.tsx` · `[id]/editar/page.tsx`

Ambas montan el mismo `OpportunityForm`. La diferencia es la prop `opportunity`: presente → edición; ausente → creación. El modal «Nueva Oportunidad» del pipeline monta el mismo componente con `hideHeader` (CD.5).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | atajo | `?pipeline={id}` en `/nuevo` | Preselecciona el pipeline sin tocar la etapa | Al cargar | nuevo/page.tsx:8-13 |
| 2 | estado | Panel vacío `p-6` con el fondo de la página | Fallback del `Suspense` mientras se resuelven los query params | Solo en `/nuevo` | nuevo/page.tsx:20 |
| 3 | estado | `Skeleton h-10 w-64` + `Skeleton h-96 w-full` | Carga de la oportunidad a editar | Solo en `/editar` | editar/page.tsx:31-38 |
| 4 | estado | «Oportunidad no encontrada» | Mensaje centrado; sustituye al formulario | `/editar` con id inexistente o sin acceso | editar/page.tsx:40-46 |

`/nuevo` usa `p-3 sm:p-4 md:p-6`; `/editar` usa `p-6` **fijo**, sin escalado por breakpoint.

### CC.2 Formulario — cabecera `components/crm/oportunidades/OpportunityForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (ArrowLeft, fantasma, `size="icon"`) | `onCancel` si se pasó, o `router.back()` | **Oculto si `hideHeader`** (modal del pipeline) | OpportunityForm.tsx:502-512 · 486-492 |
| 2 | texto | «Nueva Oportunidad» / «Editar Oportunidad» (h1 `text-2xl`, sin escalado) | — | Ídem | OpportunityForm.tsx:513-515 |

### CC.3 Formulario — «Información General» `OpportunityForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Información General» (`text-base`) | Título de tarjeta | Siempre | OpportunityForm.tsx:523 |
| 2 | campo | «Nombre de la oportunidad *» · placeholder «Ej: Venta de equipos para oficina» · `required` | `name` | Siempre; ocupa `sm:col-span-2` | OpportunityForm.tsx:528-539 |
| 3 | campo | `PipelineSearchSelect` «Pipeline *» (el asterisco lo añade el propio selector) | Al cambiar **vacía la etapa**; el pipeline por defecto es el `is_default` o el primero | Siempre | OpportunityForm.tsx:541-553 · PipelineSearchSelect.tsx:44-46 |
| 4 | campo | «Etapa inicial *» · placeholder «Selecciona una etapa»; cada opción es punto de color + «{nombre} ({probabilidad}%)» | `stage_id`. Al cargar las etapas, si no hay ninguna elegida se selecciona la de `position` más baja | Siempre | OpportunityForm.tsx:555-577 · 217-228 |
| 5 | campo | `CustomerSearchSelect` «Cliente» · buscador «Buscar cliente...» | `customer_id` (opcional) | Siempre | OpportunityForm.tsx:579-588 |
| 6 | campo | «Origen» · placeholder «Seleccionar origen» · **7 opciones**: «Sin especificar» (se envía vacío) · «WhatsApp» · «Email» · «Teléfono» · «Web» · «Referido» · «Otro» | `source` | Siempre | OpportunityForm.tsx:591-609 |
| 7 | campo | «Vertical» · placeholder «Seleccionar vertical» · «Sin vertical» + una por vertical de `verticalsService.list()` | `vertical_id`. **Si el servicio falla, la lista queda vacía sin avisar** | Siempre | OpportunityForm.tsx:612-629 · 123-135 |
| 8 | campo | «Próximo contacto» (`type="date"`) | `next_contact_at`. En edición se precarga con `toPlainDate(valor, timezone)`: **correcto, en la zona de la organización** | Siempre | OpportunityForm.tsx:632-644 · 111-115 |
| 9 | campo | «Fecha esperada de cierre» · botón «Seleccionar fecha» o `dd/MM/yyyy` (locale `es`, icono CalendarIcon) que abre un `Calendar` en `Popover` | `expected_close_date`, enviada como `yyyy-MM-dd` | Siempre | OpportunityForm.tsx:646-672 |
| 10 | campo | «Monto» · placeholder «0» (`type="number"`) | `amount` manual | **Solo si no hay líneas de producto** (`productLines.length === 0`) | OpportunityForm.tsx:676-691 |
| 11 | campo | «Moneda» · **3 opciones**: «COP - Peso Colombiano» · «USD - Dólar» · «EUR - Euro» | Por defecto `COP` | Junto a 10 | OpportunityForm.tsx:692-706 |

`Card` que ocupa `lg:col-span-2` de `grid-cols-1 lg:grid-cols-3`. Dentro, `grid-cols-1 sm:grid-cols-2` (el nombre a dos columnas). **«Monto» y «Moneda» desaparecen en cuanto se añade un producto**: el importe pasa a calcularse.

### CC.4 Formulario — selector de cliente `CustomerSearchSelect.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | Sin selección «Sin cliente» (icono User); con selección, avatar + nombre + email. Siempre con icono Search a la derecha (`role="combobox"`, `aria-expanded`) | Abre el desplegable | Siempre | CustomerSearchSelect.tsx:86-128 |
| 2 | botón | Aspa X sobre el cliente elegido (`role="button"`, `tabIndex=0`, responde a `Enter`) | Limpia la selección sin abrir el desplegable | Con cliente elegido | CustomerSearchSelect.tsx:111-119 |
| 3 | campo | placeholder «Buscar cliente...» (`autoFocus`) | Filtra **en memoria** por nombre, email o teléfono | Al abrir | CustomerSearchSelect.tsx:132-142 · 51-61 |
| 4 | menú | «Sin cliente» (avatar gris) | Deja la oportunidad sin cliente | Solo si `allowEmpty` (por defecto `true`) | CustomerSearchSelect.tsx:148-162 |
| 5 | menú | Avatar + nombre + email (Mail, `truncate` a 120 px) + teléfono (Phone) | Selecciona | Una por cliente filtrado | CustomerSearchSelect.tsx:167-203 |
| 6 | estado | «Buscando…» (Loader2) | Solo si el llamador pasa `onSearchChange` e `isSearching`; **el formulario no los pasa** | Nunca desde aquí | CustomerSearchSelect.tsx:205-209 |
| 7 | estado | «{searchError}» en rojo | Prop no usada desde el formulario | Nunca desde aquí | CustomerSearchSelect.tsx:210-213 |
| 8 | estado | «No se encontraron clientes» · «Escribe para buscar un cliente» (icono User) | El segundo solo en modo búsqueda contra servidor | Sin coincidencias | CustomerSearchSelect.tsx:214-221 |

Trigger `w-full min-h-[44px]` (respeta el objetivo táctil). Popover fijo `w-[350px]`; lista `max-h-[280px]` con scroll. El seleccionado se marca con fondo azul y borde.

### CC.5 Formulario — selector de pipeline `PipelineSearchSelect.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | Sin selección «Selecciona un pipeline» (icono Layers); con selección, cuadro azul con Layers + nombre. Icono Search a la derecha | Abre el desplegable | Siempre | PipelineSearchSelect.tsx:49-82 |
| 2 | badge | «Por defecto» (azul) | Marca `is_default` **en el trigger** | Si el elegido es el predeterminado | PipelineSearchSelect.tsx:66-70 |
| 3 | campo | placeholder «Buscar pipeline...» (`autoFocus`) | Filtra por nombre, en memoria | Al abrir | PipelineSearchSelect.tsx:86-95 |
| 4 | menú | Cuadro azul + nombre del pipeline | Selecciona | Uno por pipeline | PipelineSearchSelect.tsx:101-129 |
| 5 | badge | «Default» (azul) | Misma condición que 2 pero **con otro literal**: en la lista dice «Default», en el trigger «Por defecto» | En la lista | PipelineSearchSelect.tsx:119-123 |
| 6 | badge | Icono Check azul | Marca el pipeline elegido | En su fila | PipelineSearchSelect.tsx:126-128 |
| 7 | estado | «No se encontraron pipelines» (icono Layers) | Vacío | Sin coincidencias | PipelineSearchSelect.tsx:131-137 |

Trigger `w-full min-h-[44px]`; popover `w-[320px]` con `ScrollArea` de alto fijo `h-[220px]`.

### CC.6 Formulario — «Comisión (opcional)» `OpportunityForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Comisión (opcional)» (icono User azul) | Título de tarjeta | Siempre | OpportunityForm.tsx:717-720 |
| 2 | campo | «Comisionista» · placeholder «Seleccionar comisionista» · buscador «Buscar comisionista...» · opción vacía «Sin asignar» (`__none__`) | `salesperson_id`. Opciones: miembros con «{nombre} {apellido}» o, si están vacíos, «Miembro sin nombre» | Siempre | OpportunityForm.tsx:723-736 · 138-167 |
| 3 | estado | «No se pudo cargar la lista de comisionistas: {mensaje}» (`role="alert"`, rojo) | Bajo el selector; el formulario sigue siendo utilizable | Si falló la consulta de miembros | OpportunityForm.tsx:737-741 |
| 4 | campo | «Porcentaje de Comisión» (icono Percent) · placeholder «0» (`type="number"`, `min=0`, `max=100`, `step=0.5`) | `commission_rate`. **Los límites son atributos HTML, no validación de envío**: un valor pegado fuera de rango se envía igual | Siempre | OpportunityForm.tsx:743-759 |
| 5 | cálculo | «Comisión estimada ({tasa}%):» + importe | `(total de líneas, o el monto manual si no hay líneas) × tasa / 100` | **Solo con comisionista ≠ `__none__` y tasa > 0** | OpportunityForm.tsx:761-774 |
| 6 | texto | «Se generará al marcar la oportunidad como ganada» | Aviso azul | Junto a 5 | OpportunityForm.tsx:775-777 |
| 7 | cálculo | `commission_type` | Se envía el tipo elegido **solo** si hay comisionista real y tasa > 0; si no, se fuerza `'none'`. **No hay ningún control visible para elegir entre `salesperson` e `intermediation_sale`**: el estado arranca en `'salesperson'` y nunca cambia desde la UI, aunque el sidebar del detalle (CB.11-7) sí muestra los dos títulos | Siempre | OpportunityForm.tsx:104 · 391 · 434 |

`Card` en la columna derecha (1 de 3 desde `lg`). El cálculo va en una caja `bg-blue-50`.

### CC.7 Formulario — líneas: Productos · Espacios (PMS) · Otros Conceptos `OpportunityForm.tsx` · `SpaceSearchSelect.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Productos» (`text-sm`) | Título de tarjeta | Siempre | OpportunityForm.tsx:785 |
| 2 | botón | `ProductSearchDialog` en modo `sale` (el botón y su texto los aporta el componente compartido) | Busca en el catálogo con variantes y modificadores; al elegir añade una línea con cantidad 1 y precio = precio + suma de modificadores. **Con modificadores, el nombre queda «{producto} (mod1, mod2)»** | Siempre | OpportunityForm.tsx:786-790 · 289-304 |
| 3 | estado | «Sin productos» (centrado `py-2`) | Vacío | `productLines.length === 0` | OpportunityForm.tsx:793-796 |
| 4 | texto | «{nombre del producto}» o «Producto sin seleccionar» | **Solo lectura**: el producto no se puede cambiar, solo borrar y volver a añadir | Por línea | OpportunityForm.tsx:805-807 |
| 5 | botón | (Trash2, fantasma rojo) | Elimina la línea | Por línea | OpportunityForm.tsx:809-817 |
| 6 | campo | «Cantidad» (`type="number"`, `min=1`) | `quantity` | Por línea | OpportunityForm.tsx:820-831 |
| 7 | campo | «Precio unit.» (`type="number"`, **sin `min`**) | `unit_price`: **admite negativos** | Por línea | OpportunityForm.tsx:832-842 |
| 8 | cálculo | «Subtotal: {importe}» | `cantidad × precio` | Por línea | OpportunityForm.tsx:844-846 |
| 9 | texto | «Espacios (PMS)» | Título de tarjeta | Siempre | OpportunityForm.tsx:856 |
| 10 | botón | «Agregar» (Plus) | Añade una línea vacía (1 noche, tarifa 0) | Siempre | OpportunityForm.tsx:857-866 |
| 11 | estado | «Sin espacios» | Vacío | `spaceLines.length === 0` | OpportunityForm.tsx:869-872 |
| 12 | campo | `SpaceSearchSelect` · trigger «Seleccionar espacio»; cabecera del popover «Seleccionar espacio»; buscador «Buscar por nombre, tipo o zona...» | Al elegir rellena el nombre y la tarifa base | Por línea | OpportunityForm.tsx:881-888 · SpaceSearchSelect.tsx:104-118 |
| 13 | badge | Estado del espacio traducido, incluidos «Limpieza» (`cleaning`) y «Mantenimiento» (`maintenance`); los no mapeados se pintan crudos | — | Por opción | SpaceSearchSelect.tsx:40-42 · 150-152 |
| 14 | texto | «{importe}» + «/ noche» en morado | Precio por opción | Por opción | SpaceSearchSelect.tsx:166-171 |
| 15 | estado | «No se encontraron espacios» + «Intenta con otro término de búsqueda» | Con término escrito | Sin coincidencias | SpaceSearchSelect.tsx:174-183 |
| 16 | estado | «{n} espacios disponibles» + «Escribe para filtrar o selecciona uno» | Sin término escrito | Lista inicial | SpaceSearchSelect.tsx:184-193 |
| 17 | campo | «Noches» (`min=1`) · «Tarifa/noche» | `nights` y `unit_price` | Por línea | OpportunityForm.tsx:900-923 |
| 18 | cálculo | «Subtotal: {importe}» en morado | `noches × tarifa` | Por línea | OpportunityForm.tsx:925-927 |
| 19 | texto | «Otros Conceptos» | Título de tarjeta | Siempre | OpportunityForm.tsx:937 |
| 20 | botón | «Agregar» (Plus) | Añade una línea vacía (cantidad 1, precio 0) | Siempre | OpportunityForm.tsx:938-947 |
| 21 | estado | «Sin conceptos adicionales» | Vacío | `customLines.length === 0` | OpportunityForm.tsx:950-953 |
| 22 | campo | placeholder «Descripción del concepto...» | `concept`. **Las líneas con concepto vacío se descartan al enviar, sin avisar** | Por línea | OpportunityForm.tsx:962-967 · 409-415 |
| 23 | campo | «Cantidad» (`min=1`) · «Precio unit.» | — | Por línea | OpportunityForm.tsx:979-1002 |
| 24 | cálculo | «Subtotal: {importe}» en ámbar | `cantidad × precio` | Por línea | OpportunityForm.tsx:1004-1006 |
| 25 | cálculo | «Total General:» + importe (tarjeta azul destacada) | Suma de las tres familias | **Solo si hay al menos una línea** de cualquier familia | OpportunityForm.tsx:1013-1025 · 356-361 |

Las tres tarjetas se apilan en la columna derecha (`space-y-4 flex flex-col`). Cada línea es una caja `p-3 rounded-lg` con color propio: gris (productos), morado con borde (espacios), ámbar con borde (conceptos). Cantidad y precio van en `grid-cols-2` **fijas**, sin cambio por breakpoint.

### CC.8 Formulario — acciones y validaciones `OpportunityForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «Cancelar» | `onCancel` si se pasó, o `router.back()` | Siempre | OpportunityForm.tsx:1031-1038 |
| 2 | botón | «Crear oportunidad» / «Guardar cambios» (+ Loader2, azul) | Envía el formulario | `disabled` mientras `isSaving` | OpportunityForm.tsx:1039-1046 |
| 3 | campo | `required` de HTML en «Nombre de la oportunidad» | El navegador bloquea el envío con su mensaje nativo (**no hay literal en el código**) | Al enviar sin nombre | OpportunityForm.tsx:538 |
| 4 | toast | «Error» / «Por favor completa los campos requeridos» (destructivo) | **Única validación propia**: cubre `name`, `pipelineId` y `stageId` con **un solo mensaje genérico**, sin señalar cuál falta ni mover el foco | Si falta cualquiera de los tres | OpportunityForm.tsx:366-373 |
| 5 | toast | «Éxito» / «Oportunidad creada correctamente» | — | Tras crear | OpportunityForm.tsx:461-464 |
| 6 | toast | **«Exito»** / «Oportunidad actualizada correctamente» | **El título va sin tilde**, a diferencia del de creación | Tras editar | OpportunityForm.tsx:417-420 |
| 7 | toast | «Error» / «No se pudo guardar la oportunidad» | El mensaje real solo va a `console.error` | Fallo | OpportunityForm.tsx:474-480 |
| 8 | cálculo | Importe enviado | `productLines.length > 0 ? calculateTotal() : parseFloat(amount) || 0`. **Si solo hay espacios o conceptos (sin productos), se envía el monto manual y el total de líneas se ignora** | Siempre | OpportunityForm.tsx:377 |
| 9 | cálculo | Líneas descartadas en silencio | Productos con `product_id <= 0`, espacios con `space_id` vacío y conceptos con descripción vacía se filtran antes de enviar | Siempre | OpportunityForm.tsx:395-415 · 438-458 |
| 10 | cálculo | Navegación tras guardar | `onSuccess()` si se pasó (modal del pipeline); si no, `router.push('/app/crm/oportunidades')` | Siempre | OpportunityForm.tsx:467-471 |
| 11 | cálculo | Evento de refresco | Emite `window.dispatchEvent(new Event('refresh-pipeline-data'))`, que el tablero escucha con 400 ms de amortiguación. **Se emite después del `router.push`**, así que en navegación completa puede perderse | Tras guardar | OpportunityForm.tsx:473 · useKanbanBoard.ts:135-158 |

Barra de acciones `flex justify-end gap-3 pt-2` con borde superior. El formulario es `flex flex-col h-full space-y-4` y el cuerpo `grid-cols-1 lg:grid-cols-3 flex-1 min-h-0`.

### CD.1 Pipeline — cabecera del módulo `components/crm/pipeline/PipelineHeader.tsx`

La ruta (`app/app/crm/pipeline/page.tsx:7-19`) solo monta `PipelineView` con `next/dynamic` (`ssr: false`) y un esqueleto. **No tiene ningún control propio.**

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Pipeline CRM» (h1) | Título del módulo | Siempre | PipelineHeader.tsx:353-355 |
| 2 | texto | «CRM / Pipeline» | Migas de pan **estáticas, no son enlace** | Siempre | PipelineHeader.tsx:356-358 |
| 3 | menú | Trigger «{nombre del pipeline}» / «Seleccionar Pipeline» (icono SlidersHorizontal) | Abre el desplegable de pipelines | Siempre | PipelineHeader.tsx:363-369 |
| 4 | menú | Etiqueta «Pipelines» | Encabezado | Al abrir | PipelineHeader.tsx:371 |
| 5 | menú | «{pipeline.name}» | Cambia el pipeline activo | Una fila por registro | PipelineHeader.tsx:373-404 |
| 6 | badge | «Por defecto» | Marca `is_default` | Si lo es | PipelineHeader.tsx:383-387 |
| 7 | badge | «Onboarding» · «Renovación» · `{pipeline_type}` crudo | Tipo de pipeline | Si `pipeline_type` existe y ≠ `'sales'` | PipelineHeader.tsx:388-394 |
| 8 | toggle | Switch **sin etiqueta visible** | Marca ese pipeline como predeterminado: `is_default=false` a todos y `true` al elegido | Uno por fila del menú | PipelineHeader.tsx:396-402 |
| 9 | menú | «Crear Nuevo Pipeline» (Plus) | Abre CD.3 | Siempre | PipelineHeader.tsx:406-412 |
| 10 | menú | «Eliminar Pipeline Actual» (Trash2) | Abre CD.4 | Si hay pipeline actual; **deshabilitado si es el predeterminado** | PipelineHeader.tsx:413-422 |
| 11 | botón | «Nueva Oportunidad» (≥`sm`) / «Nueva» (<`sm`), icono PlusCircle | Abre CD.5 | Siempre | PipelineHeader.tsx:426-434 |
| 12 | botón | «Asignación Masiva» (≥`sm`) / «Asignar» (<`sm`), icono Users | Abre CD.6 | Siempre | PipelineHeader.tsx:435-444 |
| 13 | toast | «Pipeline actualizado» / «"{nombre}" es ahora el pipeline por defecto.» · «Error» / «No se pudo actualizar el pipeline por defecto.» | — | Tras el switch 8 | PipelineHeader.tsx:256-266 |
| 14 | toast | «No se puede eliminar» / «El pipeline tiene {n} oportunidad(es) asociada(s). Mueve o elimina las oportunidades primero.» | Bloquea el borrado | Si hay oportunidades | PipelineHeader.tsx:284-288 |

`header` `flex-col sm:flex-row justify-between`, `p-4 sm:p-5`. Cuadro de 40×40 con LayoutGrid azul. Los dos botones son `w-full sm:w-auto` con `min-h-[44px]`. El menú de pipelines mide `w-72`.

### CD.2 Pipeline — pestañas de vista y estados sin pipeline `PipelineView.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton count={4}` + `CardListSkeleton cards={3} columns="1"` | Mientras resuelve el pipeline por defecto | `loading` | PipelineView.tsx:97-105 |
| 2 | pestaña | «Kanban» | `KanbanBoardV2` | Siempre · por defecto | PipelineView.tsx:119 |
| 3 | pestaña | «Tabla» | `TableView` (CD.35) | Siempre | PipelineView.tsx:120 |
| 4 | pestaña | «Pronóstico» | `ForecastView` — **no es la pantalla `/app/crm/pronostico`** (§CE) | Siempre | PipelineView.tsx:121 |
| 5 | pestaña | «Clientes» | `ClientsView` | Siempre | PipelineView.tsx:122 |
| 6 | pestaña | «Automatización» | `AutomationsView` (CD.36) | **Oculta bajo 640 px** (`hidden sm:inline-flex`) | PipelineView.tsx:123 |
| 7 | estado | «No hay pipeline configurado» / «Crea un pipeline para comenzar a gestionar tus oportunidades.» (icono FolderPlus) | Vacío | Pestaña Kanban sin pipeline | PipelineView.tsx:131-136 |
| 8 | botón | «Crear Pipeline» (Plus) | Abre CD.3 | En ese vacío | PipelineView.tsx:137-143 |
| 9 | estado | «Seleccione un pipeline para ver la tabla» · «…para ver el pronóstico» · «…para ver los clientes» · «…para configurar automatizaciones» | Vacío por pestaña | Sin pipeline | PipelineView.tsx:152-184 |

`TabsList` centrada, `flex-wrap`, `w-full` en móvil y `sm:w-auto`. Cada trigger pasa de `text-xs`/`min-h-[32px]` a `sm:text-sm`/`sm:min-h-[38px]`. La activa va `bg-blue-600 text-white`.

### CD.3 Pipeline — diálogo «Crear Nuevo Pipeline» `PipelineHeader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Crear Nuevo Pipeline» | — | Al abrir | PipelineHeader.tsx:467-471 |
| 2 | texto | «Plantilla *» (asterisco rojo) | Grupo de selección | Siempre | PipelineHeader.tsx:475-477 |
| 3 | chip | «Pipeline en blanco» · «Ventas» · «Onboarding» · «Renovación» | Selecciona plantilla (`aria-pressed`, borde azul + `ring-1` si activa) | 4 opciones de `PIPELINE_TEMPLATES` | PipelineHeader.tsx:479-520 · pipelineTemplates.ts:41-95 |
| 4 | badge | «Ventas» | Tipo de la plantilla | `pipeline_type === 'sales'` | PipelineHeader.tsx:504-508 |
| 5 | badge | «Onboarding» · «Renovación» | Tipo de la plantilla | `pipeline_type` ≠ `'sales'` | PipelineHeader.tsx:497-503 |
| 6 | texto | Descripción, p. ej. «Pipeline comercial clásico: Lead → Contacto → Calificación → Demo → Propuesta → Negociación → Cierre.» | — | Una por chip | PipelineHeader.tsx:510-512 |
| 7 | texto | «{n} etapas: Lead nuevo → Contactado → …» | Previsualiza las etapas semilla | Si la plantilla trae etapas | PipelineHeader.tsx:513-517 |
| 8 | campo | «Nombre del Pipeline *» · placeholder «Ej: Ventas B2B, Onboarding Enterprise, etc.» | — | Siempre | PipelineHeader.tsx:526-535 |
| 9 | texto | «Pipeline vacío. Podrás configurar las etapas desde el gestor de etapas.» / «Se crearán {n} etapas preestablecidas con esta plantilla. Podrás editarlas después.» | Ayuda según plantilla | Siempre | PipelineHeader.tsx:536-540 |
| 10 | botón | «Cancelar» | Cierra y resetea nombre y plantilla | `disabled` mientras crea | PipelineHeader.tsx:544-555 |
| 11 | botón | «Crear Pipeline» / «Creando...» (Loader2) | `insert` en `pipelines` o `createPipelineFromTemplate` | `disabled` sin nombre o mientras crea | PipelineHeader.tsx:556-572 |
| 12 | toast | «Pipeline creado» / «El pipeline "{nombre}" ha sido creado exitosamente. Configura las etapas desde el gestor de etapas.» | Plantilla en blanco | — | PipelineHeader.tsx:171-174 |
| 13 | toast | «Pipeline creado» / «El pipeline "{nombre}" ({plantilla}) ha sido creado con sus etapas preestablecidas.» | Con plantilla | — | PipelineHeader.tsx:205-208 |
| 14 | toast | «Error» / «Se requiere nombre del pipeline y organización» · «Error» / mensaje del servidor o «No se pudo crear el pipeline. Verifica los permisos.» | — | Validación y fallo | PipelineHeader.tsx:129-133 · 216-220 |

`sm:max-w-lg mx-4 max-h-[90vh] overflow-y-auto`. Los chips se apilan siempre en una columna. Pie `flex-col sm:flex-row` con botones `w-full sm:w-auto min-h-[44px]`.

### CD.4 Pipeline — confirmación de borrado `PipelineHeader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «¿Eliminar pipeline “{nombre}”?» (**comillas tipográficas**) | — | Al abrir | PipelineHeader.tsx:580-581 |
| 2 | texto | «Esta acción no se puede deshacer. Se eliminarán todas las etapas del pipeline. Las oportunidades asociadas deben moverse a otro pipeline antes de eliminar.» + « No se puede eliminar el pipeline por defecto.» | La segunda frase solo si es el predeterminado | Siempre | PipelineHeader.tsx:582-586 |
| 3 | botón | «Cancelar» | Cierra | Siempre | PipelineHeader.tsx:589 |
| 4 | botón | «Eliminar» / «Eliminando...» (Trash2) | Borra las etapas y luego el pipeline; recarga y selecciona otro | `disabled` si es el predeterminado o mientras borra | PipelineHeader.tsx:590-606 |
| 5 | toast | «Pipeline eliminado» / «"{nombre}" ha sido eliminado correctamente.» | — | Tras éxito | PipelineHeader.tsx:327-330 |

### CD.5 Pipeline — modal «Nueva Oportunidad» `modals/CreateOpportunityDialog.tsx`

Es un `createPortal` propio (**no `Dialog` de shadcn**) que envuelve `OpportunityForm` con `hideHeader`, `initialPipelineId` e `initialStageId`.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Nueva Oportunidad» | Título del modal | Siempre | CreateOpportunityDialog.tsx:46 |
| 2 | texto | «Crear una nueva oportunidad con productos, espacios y conceptos personalizados» | Subtítulo | Siempre | CreateOpportunityDialog.tsx:47 |
| 3 | botón | (SVG de aspa, **sin texto**) | Cierra y remonta el formulario (`formKey++`) | Siempre | CreateOpportunityDialog.tsx:49-53 |
| 4 | texto | Los 26 controles de `OpportunityForm` (CC.3-CC.8) | La cabecera interna del formulario no se pinta (`hideHeader`) | Siempre | OpportunityForm.tsx:519-1047 |

Overlay `fixed inset-0 bg-black bg-opacity-50 z-50`; caja `max-w-6xl`, `max-h-[97vh]` en móvil y `sm:max-h-[90vh]`, cabecera `sticky top-0`; cuerpo `overflow-y-auto max-h-[calc(90vh-80px)]`.

### CD.6 Pipeline — modal «Asignación Masiva» `modals/BulkActionsDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Asignación Masiva» | Título | Siempre | BulkActionsDialog.tsx:416 |
| 2 | texto | «Asigna oportunidades a múltiples clientes o mueve oportunidades entre etapas.» | Subtítulo | Siempre | BulkActionsDialog.tsx:417 |
| 3 | botón | (SVG de aspa) | Cierra y limpia selecciones y líneas | Siempre | BulkActionsDialog.tsx:419-423 |
| 4 | pestaña | «Asignar a clientes» (Users) | `tab='assign'` | Siempre · por defecto | BulkActionsDialog.tsx:430-440 |
| 5 | pestaña | «Mover de etapa» (GitBranch) | `tab='move'` | Siempre | BulkActionsDialog.tsx:441-451 |
| 6 | pestaña | «Mensaje» (MessageCircle) | **Sin panel**: el render es un ternario de dos ramas, así que muestra «Mover de etapa» con la pestaña «Mensaje» marcada (§G.1-10) | Siempre | BulkActionsDialog.tsx:452-462 · render 470/838 |
| 7 | estado | Spinner Loader2 | Mientras carga pipelines y clientes | `isLoading` | BulkActionsDialog.tsx:466-469 |
| 8 | campo | «Nombre oportunidad *» · placeholder «Ej: Cotización producto X» | Nombre común de las oportunidades creadas | Pestaña Asignar | BulkActionsDialog.tsx:475-483 |
| 9 | campo | «Monto» · placeholder «0» | Ignorado si hay líneas | Pestaña Asignar | BulkActionsDialog.tsx:484-493 |
| 10 | campo | «Moneda» · «COP» · «USD» · «EUR» | — | Pestaña Asignar | BulkActionsDialog.tsx:494-506 |
| 11 | campo | «Próximo contacto» · «Fecha esperada de cierre» (`type="date"`) | `next_contact_at`, `expected_close_date` | Pestaña Asignar | BulkActionsDialog.tsx:510-527 |
| 12 | campo | «Pipeline *» · placeholder «Seleccionar» | Pipeline destino; limpia la etapa | Pestaña Asignar | BulkActionsDialog.tsx:531-543 |
| 13 | campo | «Etapa inicial *» · placeholder «Seleccionar»; opciones «{nombre} ({prob}%)» | Etapa de creación | Pestaña Asignar | BulkActionsDialog.tsx:544-556 |
| 14 | texto | «Comisión (opcional)» (icono User) | Título de tarjeta | Pestaña Asignar | BulkActionsDialog.tsx:562-568 |
| 15 | campo | «Comisionista» · placeholder «Sin asignar» · «Sin asignar» (`__none__`) + miembros | `salesperson_id` | Pestaña Asignar | BulkActionsDialog.tsx:570-583 |
| 16 | campo | «Porcentaje de Comisión» (Percent) · placeholder «0» | `commission_rate` | Pestaña Asignar | BulkActionsDialog.tsx:584-599 |
| 17 | texto | Tarjeta «Productos» + `ProductSearchDialog`; vacío «Sin productos» | Añade líneas | Pestaña Asignar | BulkActionsDialog.tsx:604-657 |
| 18 | campo | «Cantidad» / «Precio unit.» + botón papelera | Edita o elimina la línea | Por producto | BulkActionsDialog.tsx:623-649 |
| 19 | cálculo | «Subtotal: {importe}» | `cantidad × precio` | Por producto | BulkActionsDialog.tsx:650-652 |
| 20 | texto | Tarjeta «Espacios (PMS)» + «Agregar»; vacío «Sin espacios»; placeholder «Seleccionar espacio» | Añade líneas de espacio | Pestaña Asignar | BulkActionsDialog.tsx:660-688 |
| 21 | campo | «Noches» / «Tarifa/noche» | Edita la línea | Por espacio | BulkActionsDialog.tsx:689-702 |
| 22 | cálculo | «Subtotal: {importe}» | `noches × tarifa` | Por espacio | BulkActionsDialog.tsx:703-705 |
| 23 | texto | Tarjeta «Otros Conceptos» + «Agregar»; vacío «Sin conceptos adicionales»; placeholder «Descripción del concepto...» | Añade líneas libres | Pestaña Asignar | BulkActionsDialog.tsx:713-734 |
| 24 | campo | «Cantidad» / «Precio unit.» | Edita la línea | Por concepto | BulkActionsDialog.tsx:740-752 |
| 25 | cálculo | «Subtotal: {importe}» · «Total items: {importe} {moneda}» | El total sustituye al campo «Monto» | El total solo si hay líneas | BulkActionsDialog.tsx:754-768 |
| 26 | texto | «Clientes ({n} seleccionados)» | Contador | Pestaña Asignar | BulkActionsDialog.tsx:773-775 |
| 27 | botón | «Seleccionar todos» / «Deseleccionar todos» | Alterna la selección del filtro | Pestaña Asignar | BulkActionsDialog.tsx:776-783 |
| 28 | campo | placeholder «Buscar cliente...» | Filtra por nombre o email | Pestaña Asignar | BulkActionsDialog.tsx:785-790 |
| 29 | estado | «No hay clientes» | Vacío | Lista filtrada vacía | BulkActionsDialog.tsx:792-795 |
| 30 | toggle | Fila con nombre y email del cliente | Marca o desmarca | Una por cliente filtrado | BulkActionsDialog.tsx:797-821 |
| 31 | botón | «Cancelar» · «Asignar a {n} cliente(s)» / «Asignando...» | Crea una oportunidad por cliente **en bucle secuencial** | `disabled` sin clientes marcados | BulkActionsDialog.tsx:827-835 |
| 32 | campo | «Filtrar por etapa actual» · «Todas las etapas» · «Sin etapa» + una por etapa | Filtra la lista | Pestaña Mover | BulkActionsDialog.tsx:843-857 |
| 33 | campo | «Mover a etapa *» · placeholder «Seleccionar destino»; opciones «{nombre} ({prob}%)» | Etapa destino | Pestaña Mover | BulkActionsDialog.tsx:858-870 |
| 34 | texto | «Oportunidades ({n} seleccionadas de {m})» | Contador | Pestaña Mover | BulkActionsDialog.tsx:876-878 |
| 35 | botón | «Seleccionar todas» / «Deseleccionar todas» | Alterna | Pestaña Mover | BulkActionsDialog.tsx:879-886 |
| 36 | estado | «No hay oportunidades con este filtro» | Vacío | Lista vacía | BulkActionsDialog.tsx:889-892 |
| 37 | toggle | Fila: nombre, «{cliente o 'Sin cliente'} — {monto}» | Marca o desmarca | Una por oportunidad filtrada | BulkActionsDialog.tsx:894-923 |
| 38 | badge | «{etapa actual}» → «{etapa destino}» (ChevronRight) | Previsualiza el movimiento | En cada fila | BulkActionsDialog.tsx:917-921 |
| 39 | botón | «Cancelar» · «Mover {n} a {etapa}» / «Moviendo...» | `moveToStage` en bucle | `disabled` sin selección o sin destino | BulkActionsDialog.tsx:929-937 |
| 40 | toast | «Oportunidades asignadas» / «{n} creadas, {m} fallidas» · «Oportunidades movidas» / «{n} movidas, {m} fallidas» | — | Tras el bucle | BulkActionsDialog.tsx:301-304 · 373-376 |

Overlay propio con `createPortal`; caja `max-w-5xl`, `max-h-[97vh] sm:max-h-[90vh]`. Las cuatro tarjetas de líneas en `grid-cols-1 lg:grid-cols-2`. Listas con `max-h-[280px]` y `max-h-[320px]`. **La barra de pestañas no hace `wrap`**: en pantallas estrechas las tres se aprietan.

### CD.7 Pipeline — barra de estado del tablero `KanbanBoardV2.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | chip | «tiempo real» (verde) · «auto 30 s» (ámbar) · «sin actualizar» (gris), icono Radio | Alterna la actualización automática (`aria-pressed`). **Hoy siempre arranca en «auto 30 s»**: `allRealtimePublished(['opportunities','stages'])` es `false` | Siempre | KanbanBoardV2.tsx:195-207 |
| 2 | tooltip | «Tiempo real activo» · «Sin tiempo real en la BD: se actualiza cada 30 s y tras cada cambio» · «Actualización automática desactivada» | `title` del chip | Hover | KanbanBoardV2.tsx:203 |
| 3 | botón | (RefreshCw, `aria-label="Actualizar"`) | `refetchAll()`; el icono gira mientras carga | Siempre | KanbanBoardV2.tsx:208 |

### CD.8 Pipeline — estados y toasts del tablero `KanbanBoardV2.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | 4 columnas de `Skeleton` (barra de 8 + dos bloques de 24) | Carga | `loading` y sin etapas | KanbanBoardV2.tsx:169-175 |
| 2 | estado | «{mensaje}» en rojo + «Reintentar» | Error | `error !== null` | KanbanBoardV2.tsx:176-178 |
| 3 | estado | «No hay etapas configuradas» / «Crea la primera etapa para comenzar.» | Vacío | `stages.length === 0` | KanbanBoardV2.tsx:179-183 |
| 4 | botón | «Crear primera etapa» (Plus) | Abre CD.14 en modo `create` | En ese vacío | KanbanBoardV2.tsx:184 |
| 5 | botón | «Nueva etapa» (Plus, caja punteada al final del carrusel) | Abre CD.14 en modo `create` | Siempre que haya ≥ 1 etapa | KanbanBoardV2.tsx:219-221 |
| 6 | toast | «Orden de etapas actualizado» | Confirma el `PUT /api/crm/stages` de reordenación | Tras arrastrar una columna | KanbanBoardV2.tsx:108 |
| 7 | toast | «Error» / «No se pudo guardar el nuevo orden» (o el mensaje del servidor, típicamente «Requiere rol de administrador de la organización o jefatura comercial (Manager)») | Revierte y recarga etapas | Fallo o 403 | KanbanBoardV2.tsx:110-111 |
| 8 | toast | «Etapa creada» · «Etapa actualizada» · «Etapa eliminada» | CRUD de etapas | Tras éxito | KanbanBoardV2.tsx:131 · 143 · 160 |
| 9 | toast | «Oportunidad movida» / «Ahora está en "{etapa}"» (2 500 ms) | Confirma el cambio de etapa | Tras un drop válido | KanbanBoardV2.tsx:74 |
| 10 | toast | «No se pudo mover» / «Etapa no válida» o el mensaje del servidor | Revierte el movimiento optimista | PATCH fallido | KanbanBoardV2.tsx:81 |
| 11 | toast | «Oportunidad ganada» · «No se pudo cerrar como ganada» | Cierre ganado desde el tablero | Tras el diálogo + PATCH | KanbanBoardV2.tsx:262 · 259 |

Carrusel `overflow-x-auto overflow-y-hidden` con `-mx-3 sm:mx-0` (sangrado negativo en móvil para pegar al borde) y `min-h-[calc(100vh-12rem)]`. La caja «Nueva etapa» es `shrink-0 min-w-[200px]`, `border-2 border-dashed`, `h-20`.

### CD.9 Pipeline — columna de etapa `KanbanColumnV2.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (GripVertical, `aria-label="Reordenar etapa"`) | Asa de arrastre de la columna (`type="STAGE"`) | Siempre | KanbanColumnV2.tsx:46-48 |
| 2 | texto | «{stage.name}» (truncado) | — | Siempre | KanbanColumnV2.tsx:52 |
| 3 | tooltip | «{descripción o 'Sin descripción'} · {probabilidad}%» | Probabilidad normalizada (si ≤ 1 se multiplica por 100) | Hover sobre el nombre (`cursor-help`) | KanbanColumnV2.tsx:54 |
| 4 | badge | «{n}» | Conteo de oportunidades | Siempre | KanbanColumnV2.tsx:57 |
| 5 | botón | (Plus; `title`/`aria-label` «Crear oportunidad» / «Crear oportunidad en esta etapa») | Abre CD.5 con la etapa prefijada | Siempre | KanbanColumnV2.tsx:58 |
| 6 | botón | (Settings; «Configurar etapa») | Abre CD.14 en modo `edit` | Siempre | KanbanColumnV2.tsx:59 |
| 7 | botón | (Trash2; «Eliminar etapa») | Abre CD.16 | Siempre | KanbanColumnV2.tsx:60 |
| 8 | stat | «Total» + importe (`formatCurrency`, **sin moneda explícita**) | Suma de `amount` de la columna | Siempre | KanbanColumnV2.tsx:62-65 |
| 9 | estado | «Arrastra aquí» | Vacío | Columna sin tarjetas y sin arrastre encima | KanbanColumnV2.tsx:71-73 |
| 10 | botón | «Nueva oportunidad» (Plus, caja punteada al pie) | Abre CD.5 con la etapa prefijada | Siempre | KanbanColumnV2.tsx:74-76 |

`flex-1 min-w-[240px] max-w-[300px] sm:min-w-[260px]`, con borde superior de 4 px pintado con `stage.color` vía `style` (nunca clase dinámica). `ring-1` verde si `is_won`, rojo si `is_lost`. La zona `Droppable` tiene `min-h-[10rem]` y se tiñe `bg-blue-50/60` al arrastrar encima.

### CD.10 Pipeline — tarjeta de oportunidad `OpportunityCardV2.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | Tarjeta completa, `aria-label` «Abrir {nombre}» | Clic o `Enter` abre el drawer (CD.21); no dispara mientras se arrastra | Siempre | OpportunityCardV2.tsx:44-61 |
| 2 | botón | (GripVertical, `aria-label="Arrastrar"`) | Asa de arrastre, `absolute left-1`, con `stopPropagation` para no abrir el drawer | Siempre | OpportunityCardV2.tsx:63-70 |
| 3 | texto | Iniciales del cliente (2 letras) o `<img>` con `avatar_url` | Avatar circular de 28 px | Siempre | OpportunityCardV2.tsx:73-78 |
| 4 | texto | «{o.name}» (truncado) | — | Siempre | OpportunityCardV2.tsx:81 |
| 5 | badge | Punto de temperatura (CD.11) | — | Si `temperature` ∈ {cold, warm, hot} | OpportunityCardV2.tsx:82 |
| 6 | badge | «Ganada» · «Perdida» (píldora verde/roja) | — | Si `status` es `won` o `lost` | OpportunityCardV2.tsx:83-87 |
| 7 | texto | «{cliente.full_name}» / «Cliente no especificado» | — | Siempre | OpportunityCardV2.tsx:89 |
| 8 | stat | Importe `formatCurrency(amount ?? 0, currency o 'COP')` | Verde si ganada, rojo si perdida, azul si abierta | Siempre | OpportunityCardV2.tsx:93-96 |
| 9 | badge | «GOC {score}» (CD.11) | — | Si `score_total` es número | OpportunityCardV2.tsx:98 |
| 10 | badge | «ICP {banda}» | — | Si `icp_band` | OpportunityCardV2.tsx:99 |
| 11 | texto | «{next_action o 'Próximo contacto'} · {'vencida' o tiempo relativo}» (icono AlarmClock) | **En rojo y negrita si está vencida** (`next_contact_at` anterior a ahora y la oportunidad no cerrada) | Si hay `next_action` o `next_contact_at`, y la tarjeta no está en modo compacto | OpportunityCardV2.tsx:105-110 |
| 12 | texto | «Última: {canal} · {tiempo relativo}» + icono de canal | Canales traducidos: «llamada» · «email» · «WhatsApp» · «reunión» · «llamada IA» · «SMS» · «visita» (mapa de 8 claves) | Si hay `last_contact_at` y no está en modo compacto | OpportunityCardV2.tsx:111-116 · 28-29 |
| 13 | texto | «cierra {dd mmm}» (icono Calendar) | `formatPlainDate` (valor `date`, **no convierte zona**: correcto) | Si **no** hay `last_contact_at` y sí `expected_close_date` | OpportunityCardV2.tsx:117-119 |
| 14 | texto | `QuickActionsBar` variante `card`, icon-only (CD.12) | Acciones rápidas | En `group-hover`, `group-focus-within` o `focus-within`; oculta con `opacity-0 pointer-events-none` | OpportunityCardV2.tsx:123-127 |

Tarjeta `rounded-lg border p-2.5 pl-6` (el `pl-6` deja sitio al asa absoluta). Fondo verde tenue si ganada, rojo tenue si perdida. Al arrastrar: `shadow-lg ring-2 ring-blue-400 rotate-[0.5deg]`. Foco visible con `focus-visible:ring-2 ring-blue-500`. La tarjeta está memoizada.

### CD.11 Pipeline — insignias de score y temperatura `ScoreBadge.tsx` · `TemperatureDot.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | badge | «GOC {score}» (píldora con borde) | Rojo si `< 40`, ámbar si `40–70`, verde si `> 70` | Si `score` es número no-NaN | ScoreBadge.tsx:27-35 · 58-68 |
| 2 | tooltip | `title` «GOC Score: {score}» | — | Sobre la píldora 1 | ScoreBadge.tsx:64 |
| 3 | badge | Icono de temperatura: Snowflake (azul) · Sun (ámbar) · Flame (rojo) | — | Si `temperature` normaliza **y** se pasó la prop (la tarjeta no la pasa; la cabecera del drawer sí) | ScoreBadge.tsx:15-25 · 69-76 |
| 4 | tooltip | `title` «Temperatura: {valor crudo}» | — | Sobre el icono 3 | ScoreBadge.tsx:72 |
| 5 | badge | Punto de color de 8 px: azul `cold`, ámbar `warm`, rojo `hot` (`role="img"`, `aria-label` «Frío»/«Tibio»/«Caliente») | — | Si la temperatura normaliza | TemperatureDot.tsx:17-21 · 42-56 |
| 6 | tooltip | «Frío» · «Tibio» · «Caliente» | Tooltip de Radix (`cursor-help`) | Hover | TemperatureDot.tsx:52-54 |

`ScoreBadge` devuelve `null` si no hay ni score ni temperatura. Texto `text-[9px] sm:text-[10px]`. `TemperatureDot` tiene dos tamaños: `sm` = 8 px (tarjeta) y `md` = 10 px (cabecera del drawer y detalle).

### CD.12 Pipeline — acciones rápidas, variantes `card` y `drawer` `QuickActionsBar.tsx`

Catálogo idéntico al de CB.3 con una diferencia clave: aquí **no** se pasa `'proposal'`, así que «Propuesta» no aparece ni en la tarjeta ni en el drawer (`quickActionsConfig.ts:8-13`).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | Trigger «Llamar» (Phone; el texto solo fuera de la tarjeta) | Modos de llamada | Siempre | QuickActionsBar.tsx:173-187 · quickActionsConfig.ts:46-54 |
| 2 | menú | «Desde el navegador» | Softphone | `disabled` con «Softphone no configurado en esta página» / «Softphone conectando…» / «Softphone no registrado» / «El cliente no tiene teléfono» | quickActionsConfig.ts:87-93 |
| 3 | menú | «Desde mi celular» | `MobileCallDialog` | `disabled` con «El cliente no tiene teléfono» | quickActionsConfig.ts:94-96 |
| 4 | menú | «Agente IA» | — | **Siempre deshabilitado**: «Disponible al finalizar F6 (agentes de voz)» | quickActionsConfig.ts:97 |
| 5 | badge | «· predeterminado» | Marca el modo por defecto de la plataforma | Sobre `browser` o `mobile` | QuickActionsBar.tsx:198 |
| 6 | botón | «Email» (Mail) | `ComposeEmailDialog` | `disabled` con «El cliente no tiene email» | quickActionsConfig.ts:63-66 |
| 7 | botón | «WhatsApp» (MessageCircle) | `ComposeWhatsAppDialog` | `disabled` con «El cliente no tiene teléfono» | quickActionsConfig.ts:67-70 |
| 8 | botón | «Reunión» (Calendar) · «Tarea» (CheckSquare) · «Nota» (StickyNote) | Abren sus diálogos | Con oportunidad o cliente | quickActionsConfig.ts:13 · 77-78 |
| 9 | tooltip | «{etiqueta}» o «{etiqueta}: {motivo}» | — | Sobre cada botón | QuickActionsBar.tsx:166-171 · 230 |
| 10 | estado | Todas deshabilitadas con «Sin oportunidad ni cliente» | — | Sin `opportunityId` ni `customerId` | quickActionsConfig.ts:61 |

En variante `card` los botones son `h-7 w-7` icon-only con `gap-0.5`; en `drawer`, `h-8 px-2.5 text-xs` con etiqueta y `flex-wrap`. Toda la barra es `role="toolbar"` con `aria-label="Acciones rápidas"` y **detiene `click`, `mousedown`, `pointerdown` y `keydown`** para no abrir el drawer ni iniciar el arrastre (`QuickActionsBar.tsx:146-155`).

### CD.13 Pipeline — reglas de arrastrar y soltar `KanbanBoardV2.tsx` · `hooks/useKanbanBoard.ts`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | atajo | Arrastre de columna (`type="STAGE"`) | Reordena etapas y envía `PUT /api/crm/stages` con `{pipeline_id, order:[{id,position}]}`. Si falla, recarga desde la BD | Desde el asa GripVertical de la cabecera de columna | KanbanBoardV2.tsx:86 · 96-113 |
| 2 | atajo | Arrastre de tarjeta (`type="OPPORTUNITY"`) | Movimiento optimista + `PATCH /api/crm/opportunities/{id}/stage`. **Ignora el drop en la misma columna** | Desde el asa de la tarjeta | KanbanBoardV2.tsx:85-93 · useKanbanBoard.ts:225-247 |
| 3 | cálculo | Soltar en etapa con criterios incompletos | 409 `reason:'gate'` → abre CD.17. Cancelar revierte la tarjeta a su columna original | Si `stageGateService` devuelve requisitos sin cumplir | KanbanBoardV2.tsx:77 · 238-241 |
| 4 | cálculo | Soltar en etapa **`is_won`** | 409 `needs_won` → abre CD.18; al confirmar se relee `win_data` y se reintenta el PATCH; después se abre CD.19. Cerrar el diálogo revierte | Etapa destino con `is_won = true` | KanbanBoardV2.tsx:78 · 245-271 |
| 5 | cálculo | Soltar en etapa **`is_lost`** | 409 `needs_lost` → abre CD.20. Cerrar revierte | Etapa destino con `is_lost = true` | KanbanBoardV2.tsx:79 · 272-275 |
| 6 | cálculo | Refresco del tablero | Sondeo cada **30 000 ms** + evento `refresh-pipeline-data` amortiguado **400 ms** | Mientras la actualización automática esté activa y las tablas no estén publicadas en realtime | useKanbanBoard.ts:77-81 · 135-158 |

### CD.14 Pipeline — diálogo de etapa «Nueva Etapa» / «Configurar etapa» `StageDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Configurar etapa» (edición) / «Nueva Etapa» (creación) | — | Al abrir | StageDialog.tsx:248-252 |
| 2 | pestaña | «Etapa» | El formulario | **Solo en edición con `stageId`** | StageDialog.tsx:257 |
| 3 | pestaña | «Agente IA» | CD.15 | **Solo en edición con `stageId`** (al crear, la etapa aún no existe) | StageDialog.tsx:258 |
| 4 | campo | «Nombre *» · placeholder «Ej: Propuesta Enviada» (`required`, `autoFocus`) | `name` | Siempre | StageDialog.tsx:100-113 |
| 5 | campo | «Probabilidad (%) (Opcional)» (`type="number"`, 0-100) | `probability`. Al crear, si se deja vacía se calcula `min(10 + (maxPos/n)*80, 90)` | Siempre | StageDialog.tsx:115-128 · KanbanBoardV2.tsx:124 |
| 6 | campo | «Color (Opcional)»: `input type="color"` nativo + campo de texto con el hex | `color`; por defecto `#3b82f6` | Siempre | StageDialog.tsx:130-148 |
| 7 | campo | «Descripción (Opcional)» · placeholder «Descripción opcional de la etapa» | `description` | Siempre | StageDialog.tsx:150-161 |
| 8 | toggle | «Cierre ganado» + «Mover aquí = ganada» (icono Trophy) | Marca `is_won`; **al activarlo apaga `is_lost`** | Siempre | StageDialog.tsx:165-184 |
| 9 | toggle | «Cierre perdido» + «Mover aquí = perdida» (icono XCircle) | Marca `is_lost`; **al activarlo apaga `is_won`** | Siempre | StageDialog.tsx:186-205 |
| 10 | botón | «Cancelar» | Cierra sin guardar | Siempre | StageDialog.tsx:210-218 |
| 11 | botón | «Crear Etapa» (Plus) / «Guardar» (Save) / «Creando...» / «Guardando...» (Loader2) | `POST /api/crm/stages` o `PATCH /api/crm/stages/{id}` | `disabled` sin nombre o al guardar | StageDialog.tsx:219-240 |

`sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto`. El formulario usa `flex-col` en móvil y `sm:grid sm:grid-cols-4` desde 640 (etiqueta a la derecha, control en `col-span-3`). Los dos interruptores en `grid-cols-1 sm:grid-cols-2`. Inputs con `min-h-[44px]`.

### CD.15 Pipeline — pestaña «Agente IA» del diálogo de etapa `StageAgentTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Cargando configuración…» (Loader2) | Carga | — | StageAgentTab.tsx:196-203 |
| 2 | estado | «Define qué hace el agente IA cuando llama a un contacto que está en esta etapa.» + « Todavía no hay nada configurado para esta etapa.» (caja azul) | La segunda frase solo si no hay configuración previa | Siempre | StageAgentTab.tsx:207-213 |
| 3 | campo | «¿Qué debe conseguir el agente?» · placeholder «Elige el objetivo» · **11 opciones**: «Vender un producto» · «Agendar una reunión» · «Calificar al contacto» · «Recuperar un carrito abandonado» · «Confirmar la demostración» · «Dar seguimiento a la propuesta» · «Gestionar el cobro» · «Reactivar un contacto frío» · «Encuesta de satisfacción» · «Recordar la renovación» · «Otra acción (la describo yo)» | `objective` | Siempre | StageAgentTab.tsx:215-232 · stageAgentService.ts:40-52 |
| 4 | campo | «Producto a ofrecer» · placeholder «Elige el producto» | `product_id`; hasta **200** filas de `products` ordenadas por nombre | Solo con el objetivo «Vender un producto» | StageAgentTab.tsx:234-253 · 109-113 |
| 5 | campo | «Precio a mencionar» · placeholder «Ej. 120000» (`inputMode="decimal"`) | `offer.price` | Misma condición que 4 | StageAgentTab.tsx:254-263 |
| 6 | campo | «Agente de voz» · placeholder «Usar el agente de la campaña»; agentes de `/api/crm/voice-agents`, con sufijo « (inactivo)» | `voice_agent_id` | Siempre | StageAgentTab.tsx:267-285 |
| 7 | campo | Textarea «Instrucciones específicas de esta etapa» · placeholder «Ej. Menciona el descuento del 10% si compra esta semana.» (3 filas) | `objective_prompt` | Siempre | StageAgentTab.tsx:287-296 |
| 8 | campo | «Cuándo llama» · «Solo cuando yo lo pida» · «Al entrar una oportunidad en la etapa» | `trigger_on` | Siempre | StageAgentTab.tsx:299-313 |
| 9 | campo | «Qué puede cambiar en el CRM» · «Solo sugerir (lo confirma una persona)» · «Aplicar los cambios directamente» | `action_policy` | Siempre | StageAgentTab.tsx:314-328 |
| 10 | toggle | «Configuración activa» + «El agente siempre se identifica como asistente virtual, avisa de la grabación y respeta la baja voluntaria. Eso no se puede desactivar.» (icono ShieldCheck) | `is_active` | Siempre | StageAgentTab.tsx:331-349 |
| 11 | botón | «Eliminar» | `DELETE /api/crm/stage-agents?id=…` | Solo si ya hay configuración guardada con `id` | StageAgentTab.tsx:352-356 |
| 12 | botón | «Guardar agente de la etapa» / «Guardando…» | `POST /api/crm/stage-agents` | Siempre | StageAgentTab.tsx:357-366 |
| 13 | toast | «Elige el producto que debe ofrecer el agente» · «Describe qué debe hacer el agente en esta etapa» | Bloquean el guardado | Objetivo de venta sin producto · «Otra acción» sin texto | StageAgentTab.tsx:131-138 |
| 14 | toast | «Agente de la etapa guardado» / «El guion se aplicará en la próxima llamada del agente IA.» · «Configuración eliminada» | — | Tras éxito | StageAgentTab.tsx:160-163 · 184 |

Pares de campos en `grid-cols-2` **fijos, no responsivos**: producto/precio y disparador/política se mantienen a dos columnas también en móvil.

### CD.16 Pipeline — confirmación «¿Eliminar etapa …?» `DeleteStageDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «¿Eliminar etapa "{nombre}"?» (**comillas rectas**, `&quot;`) | — | Al abrir | DeleteStageDialog.tsx:50-53 |
| 2 | estado | «Esta etapa contiene {n} oportunidad(es). Debes moverlas a otra etapa antes de eliminarla.» (rojo) | **Bloquea el borrado** | Si la etapa tiene oportunidades | DeleteStageDialog.tsx:55-59 |
| 3 | texto | «Esta acción eliminará permanentemente la etapa del pipeline. Esta acción no se puede deshacer.» | — | Si la etapa está vacía | DeleteStageDialog.tsx:60-65 |
| 4 | botón | «Cancelar» | Cierra | Siempre | DeleteStageDialog.tsx:69-74 |
| 5 | botón | «Eliminar» / «Eliminando...» | `DELETE /api/crm/stages/{id}` | **`disabled` si la etapa tiene oportunidades** o al borrar | DeleteStageDialog.tsx:75-88 |

### CD.17 Pipeline — diálogo «Criterios incompletos» (soft-gate) `GateWarningDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Criterios incompletos» (AlertTriangle ámbar) | — | 409 `reason:'gate'` | GateWarningDialog.tsx:36-39 |
| 2 | texto | «La oportunidad no cumple los criterios para avanzar a la etapa "{nombre}".» | Descripción | Siempre | GateWarningDialog.tsx:40-46 |
| 3 | estado | «Faltan los siguientes requisitos:» + lista con viñetas ámbar. Ejemplos reales: «Oportunidad no encontrada» · «No hay cliente vinculado a la oportunidad» · «Faltan {n} actividades de tipo {tipo}» · «No hay cotización vinculada» · «Score {x} < mínimo {y}» · «ICP {banda} no cumple mínimo {z}» · «No hay próximo contacto programado» | Enumera los requisitos que faltan | Si hay requisitos que enumerar | GateWarningDialog.tsx:50-64 · stageGateService.ts:744-965 |
| 4 | texto | «Puedes avanzar de todos modos (soft-gate) o cancelar y completar los datos faltantes.» | — | Siempre | GateWarningDialog.tsx:66-69 |
| 5 | botón | «Cancelar» (X) | Cierra y **revierte** el movimiento optimista | Siempre | GateWarningDialog.tsx:73-80 |
| 6 | botón | «Avanzar de todos modos» (ArrowRight, ámbar) | Reintenta con `override: true`. **El servidor devuelve 403 si el usuario no es administrador de la organización ni jefatura comercial (Manager)** | Siempre | GateWarningDialog.tsx:81-87 · `stage/route.ts:51` |

`sm:max-w-md`; el pie usa `gap-2` sin cambio por breakpoint, así que los dos botones quedan en fila también en móvil.

### CD.18 Pipeline — diálogo «Cerrar como ganada» `drawer/ClosedWonDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Cerrar como ganada — {nombre}» (**guion largo**, icono Trophy verde) | — | Al soltar en etapa `is_won` o pulsar «Ganada»/«Ganar» | ClosedWonDialog.tsx:102-106 |
| 2 | texto | «Registra la ficha de handoff/onboarding del cliente. Obligatorio para cerrar como ganada.» | — | Siempre | ClosedWonDialog.tsx:107-109 |
| 3 | campo | «Qué compró *» · placeholder «Ej: Plan Enterprise anual» | `win_data.product`; **único obligatorio de los nueve** | Siempre | ClosedWonDialog.tsx:113 |
| 4 | campo | «Módulos» · placeholder «Ej: POS, Inventario, CRM, Reportes» | `win_data.modules` | Siempre | ClosedWonDialog.tsx:114 |
| 5 | campo | «N° usuarios» · placeholder «Ej: 25» | `win_data.users_count` | Siempre | ClosedWonDialog.tsx:116 |
| 6 | campo | «N° sucursales» · placeholder «Ej: 5» | `win_data.branches_count` | Siempre | ClosedWonDialog.tsx:117 |
| 7 | campo | Textarea «Problemas principales» · placeholder «Ej: Control de inventario, facturación manual...» (2 filas) | `win_data.main_problems` | Siempre | ClosedWonDialog.tsx:119 |
| 8 | campo | Textarea «Expectativas» · placeholder «Ej: Reducir 50% tiempo de cierre...» (2 filas) | `win_data.expectations` | Siempre | ClosedWonDialog.tsx:120 |
| 9 | campo | «Fecha implementación» · placeholder «Ej: 2026-02-01» (**texto libre, no selector de fecha**) | `win_data.implementation_date` | Siempre | ClosedWonDialog.tsx:122 |
| 10 | campo | «Integraciones» · placeholder «Ej: DIAN, Bancolombia» | `win_data.integrations` | Siempre | ClosedWonDialog.tsx:123 |
| 11 | campo | «Responsable» · placeholder «Ej: Juan Pérez (CSM)» | `win_data.responsible` | Siempre | ClosedWonDialog.tsx:125 |
| 12 | botón | «Cancelar» | Cierra; desde el tablero **revierte** el movimiento | Siempre | ClosedWonDialog.tsx:129-131 |
| 13 | botón | «Confirmar ganada» (verde, Save / Loader2) | `updateOpportunity` con `status:'won'`, `win_data` y `closed_at` | `disabled` al guardar | ClosedWonDialog.tsx:132-135 |
| 14 | toast | «Campo obligatorio» / «Indica qué compró el cliente» | Bloquea si falta «Qué compró» | Producto vacío | ClosedWonDialog.tsx:77-80 |
| 15 | toast | «Oportunidad ganada» / «Ficha de cliente guardada» | — | Tras éxito | ClosedWonDialog.tsx:88 |

`sm:max-w-lg max-h-[90vh] overflow-y-auto`. Dos parejas van en `grid-cols-2` **fijas** (usuarios/sucursales y fecha/integraciones): en móvil quedan muy estrechas.

### CD.19 Pipeline — modal «Cierre de oportunidad ganada» `WonCloseModal.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Cierre de oportunidad ganada: {nombre}» (Trophy verde) | — | Tras confirmar CD.18 | WonCloseModal.tsx:147-151 |
| 2 | texto | «Selecciona las acciones a ejecutar y confirma el cierre. Cada acción genera trazabilidad financiera.» / al terminar «Cierre completado. Revisa el resumen de acciones ejecutadas.» | — | El texto cambia al completar | WonCloseModal.tsx:152-156 |
| 3 | paginación | «{hechas}/{total} completadas · {n} errores · {m} omitidas» + «{porcentaje}%» + barra | Barra verde; **ámbar (`bg-yellow-500`) si hay errores** | Mientras corre y al terminar | WonCloseModal.tsx:160-180 |
| 4 | toggle | «Generar factura» — «Convierte la última cotización en factura (invoice_sales.opportunity_id)» | **Marcada** por defecto | Siempre | wonCloseSteps.ts:72 |
| 5 | toggle | «Generar venta POS» — «Crea venta en POS vinculada a la oportunidad (sales.opportunity_id)» | **Desmarcada** por defecto; marcada como opcional | Siempre | wonCloseSteps.ts:73 |
| 6 | toggle | «Crear reservas» — «Crea reservas desde opportunity_spaces con opportunity_id» | Marcada | Siempre | wonCloseSteps.ts:74 |
| 7 | toggle | «Crear oportunidad de Onboarding» — «Crea oportunidad hija en pipeline type=onboarding» | Marcada | Siempre | wonCloseSteps.ts:75 |
| 8 | toggle | «Programar renovación» — «Hitos de renovación 120/90/60/30/15/7 días antes del vencimiento» | Marcada | Siempre | wonCloseSteps.ts:76 |
| 9 | toggle | «Pedir referido» — «Crea tarea de referido activada post-30-días + plantilla de mensaje» | Marcada | Siempre | wonCloseSteps.ts:77 |
| 10 | toggle | «Devengar comisión» — «Registra la comisión del vendedor si el sistema no la devengó ya al ganar» | Marcada | Siempre | wonCloseSteps.ts:78 |
| 11 | badge | Icono por estado: CheckCircle2 verde (hecha) · XCircle rojo (error) · Loader2 azul girando (en curso) · AlertCircle gris (omitida) · círculo vacío gris (pendiente) | — | Por paso | WonCloseModal.tsx:37-43 · 196 |
| 12 | texto | Resultado del paso: «Omitido por el usuario» · «Ejecutor no encontrado» · «Error desconocido» o el mensaje real | — | Tras ejecutar cada paso | WonCloseModal.tsx:110 · 117 · 123 |
| 13 | stat | «Resumen del cierre» con «Exitosas» · «Errores» · «Omitidas» | Recuento final | Solo al completar | WonCloseModal.tsx:232-244 |
| 14 | botón | «Cancelar» | Cierra sin ejecutar; `disabled` mientras corre | Antes de completar | WonCloseModal.tsx:253-259 |
| 15 | botón | «Confirmar cierre» (Trophy) / «Ejecutando...» (Loader2) | Ejecuta **en orden** los pasos marcados | `disabled` mientras corre o sin la oportunidad cargada | WonCloseModal.tsx:260-272 |
| 16 | botón | «Finalizar» (CheckCircle2) | Cierra el modal y recarga la ficha | Solo al completar | WonCloseModal.tsx:275-278 |

`max-w-2xl max-h-[90vh] overflow-y-auto`. **Los checkbox desaparecen en cuanto la ejecución empieza** (`!completed && !running`): el usuario no puede cambiar la selección a medias. El resumen final es `grid-cols-3` fijo. Cada paso es una caja con borde de color según su estado.

### CD.20 Pipeline — diálogo de pérdida estructurada `StructuredLossDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | Título y descripción del cierre perdido | — | Al soltar en etapa `is_lost` o pulsar «Perder»/«Perdida» | StructuredLossDialog.tsx:175-189 |
| 2 | campo | «Motivo de pérdida *» · placeholder «Selecciona un motivo». Catálogo dinámico de `lossReasonsService.list()`; si falla, **8 opciones de reserva**: «Precio muy alto» · «Eligió a la competencia» · «Faltan funcionalidades» · «Sin presupuesto» · «No es el momento adecuado» · «Sin respuesta del cliente» · «No cumple requisitos» · «Otro motivo» | `lossReasonId` | Siempre | StructuredLossDialog.tsx:190-205 · 30-39 |
| 3 | estado | «Cargando catálogo...» (Loader2) | — | Mientras carga el catálogo | StructuredLossDialog.tsx:206-211 |
| 4 | campo | «Competidor» · placeholder «Nombre del competidor» | `competitor` | Solo si el motivo contiene «competitor» en el código o «compet» en la etiqueta | StructuredLossDialog.tsx:217-228 · 57-62 |
| 5 | campo | «Precio del competidor» · placeholder «0.00» (`type="number"`) | `competitorPrice` | Misma condición que 4 | StructuredLossDialog.tsx:229-241 |
| 6 | campo | Textarea «Funcionalidades faltantes» · placeholder «Una funcionalidad por línea...» (3 filas) + ayuda «Escribe una funcionalidad por línea.» | `missingFeatures[]`, separado por saltos de línea | Solo si el motivo contiene «feature», «funcionalidad» o «caracteristica» | StructuredLossDialog.tsx:246-263 · 67-76 |
| 7 | campo | «Fecha de recontacto (opcional)» (`type="date"`) | `recontactDate` | Siempre | StructuredLossDialog.tsx:266-277 |
| 8 | campo | Textarea «Notas adicionales (opcional)» · placeholder «Notas sobre la pérdida...» (2 filas) | `notes` | Siempre | StructuredLossDialog.tsx:280-292 |
| 9 | botón | «Cancelar» | Limpia el formulario y cierra; desde el tablero **revierte** el movimiento | Siempre | StructuredLossDialog.tsx:296-302 |
| 10 | botón | «Confirmar pérdida» / «Guardando...» (rojo) | Envía `loss_data` en el PATCH de etapa | **`disabled` sin motivo** o mientras carga el catálogo | StructuredLossDialog.tsx:303-309 |

`sm:max-w-md`; el cuerpo tiene `max-h-[60vh] overflow-y-auto`, así que el pie queda siempre visible — a diferencia de `LossReasonDialog` (CA.7), que no lo tiene.

### CD.21 Pipeline — drawer de oportunidad: carcasa `OpportunityDrawer.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Título accesible «Cargando oportunidad» (`sr-only`) + 4 `Skeleton` | Carga | — | OpportunityDrawer.tsx:141-145 |
| 2 | estado | «Oportunidad» + «{error}» o «Oportunidad no encontrada o sin acceso» | Fallo o RLS | `error` o sin oportunidad | OpportunityDrawer.tsx:146-150 |
| 3 | pestaña | «Resumen» | CD.24 | Siempre · por defecto | tabs/types.ts:16 |
| 4 | pestaña | «Onboarding» | CD.34 | **Solo si el pipeline es de tipo onboarding**; se inserta en 2.ª posición | tabs/types.ts:24 · OpportunityDrawer.tsx:132-134 |
| 5 | pestaña | «Actividad» | CD.29 | Siempre | tabs/types.ts:17 |
| 6 | pestaña | «Tareas» / «Tareas ({n})» | CD.30; el contador cuenta tareas abiertas | El número solo cuando la pestaña ya cargó | tabs/types.ts:18 · OpportunityDrawer.tsx:135 |
| 7 | pestaña | «Notas» | CD.31 | Siempre | tabs/types.ts:19 |
| 8 | pestaña | «Documentos» | CD.32 | Siempre | tabs/types.ts:20 |
| 9 | pestaña | «IA» | CD.33 | Siempre | tabs/types.ts:21 |
| 10 | toast | «Etapa actualizada» · «No se pudo cambiar la etapa» / {mensaje} · «Oportunidad cerrada como perdida» | — | Según el caso | OpportunityDrawer.tsx:88 · 92 · 108 |

`SheetContent side="right"` con `w-full` en móvil, `sm:max-w-2xl` (672 px) y `lg:max-w-3xl` (768 px) desde 1024; `h-dvh` y `flex-col`, cabecera `sticky top-0 z-10`. La `TabsList` es `overflow-x-auto` y **no envuelve**: en móvil se desplaza lateralmente. Cada pestaña se monta perezosamente.

### CD.22 Pipeline — cabecera del drawer `drawer/DrawerHeader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `{opportunity.name}` (`SheetTitle`, truncado) | — | Siempre | DrawerHeader.tsx:56 |
| 2 | badge | Punto de temperatura tamaño `md` (CD.11) | — | Si hay temperatura | DrawerHeader.tsx:57 |
| 3 | botón | (ExternalLink; `title` «Abrir detalle», `aria-label` «Abrir detalle completo») | `/app/crm/oportunidades/{id}` | Siempre | DrawerHeader.tsx:58-60 |
| 4 | botón | «{cliente}» (Building2); fallback «Cliente no especificado» | Enlace a `/app/crm/clientes/{customer_id}` si hay cliente | Siempre | DrawerHeader.tsx:62-66 |
| 5 | stat | Importe `formatCurrency(amount, currency o 'COP')` | — | Siempre | DrawerHeader.tsx:68 |
| 6 | texto | «cierra {dd mmm yyyy}» (Calendar) | `formatPlainDate` (valor `date`, **no convierte zona**: correcto) | Si hay fecha de cierre | DrawerHeader.tsx:69-74 |
| 7 | badge | «Abierta» (azul) · «Ganada» (verde) · «Perdida» (rojo) | — | Si hay `status` | DrawerHeader.tsx:78 |
| 8 | campo | `StageSelect` (CD.23) | Cambia de etapa | Si el pipeline tiene etapas | DrawerHeader.tsx:83-85 |
| 9 | badge | «GOC {score}» + icono de temperatura | — | Según score/temperatura | DrawerHeader.tsx:86 |
| 10 | badge | «ICP {banda}» | — | Si `icp_band` | DrawerHeader.tsx:87 |
| 11 | botón | «Ganada» (Trophy verde) | Abre CD.18 sin etapa destino | **Oculto si `status` es `won` o `lost`** | DrawerHeader.tsx:89-91 |
| 12 | botón | «Perdida» (XCircle, contorno rojo) | Abre CD.20 sin etapa destino | Ídem | DrawerHeader.tsx:92 |
| 13 | botón | «Editar» (Edit) | Cierra el drawer y navega a `/app/crm/oportunidades/{id}/editar` | Siempre | DrawerHeader.tsx:95 · OpportunityDrawer.tsx:161 |
| 14 | texto | `QuickActionsBar` variante `drawer`, con etiquetas de texto (CD.12) | Acciones rápidas | Siempre | DrawerHeader.tsx:99-101 |

`p-4 sm:p-5 pb-3` con `pr-8` para no chocar con la aspa del `Sheet`. La fila de etapa y badges es `flex-wrap` y empuja Ganada/Perdida/Editar con `ml-auto`.

### CD.23 Pipeline — selector de etapa del drawer `drawer/StageSelect.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | `aria-label` «Etapa» · placeholder «Etapa»; punto de color de la etapa actual (o `#3b82f6`) | `PATCH /api/crm/opportunities/{id}/stage` | Siempre que haya etapas | StageSelect.tsx:64-71 |
| 2 | menú | «{nombre}» + « ✓» si `is_won`, « ✗» si `is_lost`, con punto de color | Cambia de etapa; ignora si es la misma | Una por etapa | StageSelect.tsx:73-80 |
| 3 | estado | Loader2 girando en el trigger | Deshabilita el selector mientras viaja el PATCH | `pending` | StageSelect.tsx:68 |
| 4 | toast | «No se pudo cambiar la etapa» / {mensaje} | Solo para el fallo genérico; gate/won/lost los resuelve el padre | — | StageSelect.tsx:60 |

Trigger de ancho fijo `w-[180px]` y alto `h-8` (`text-xs`), **sin variación por breakpoint**.

### CD.24 Pipeline — drawer › pestaña «Resumen» `drawer/tabs/ResumenTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Seguimiento» (icono Clock) | Encabezado; contiene CD.25 | Siempre | ResumenTab.tsx:76-79 |
| 2 | texto | «Información» (icono CircleDot) | Encabezado de tarjeta | Siempre | ResumenTab.tsx:81-82 |
| 3 | stat | «Monto» + importe (DollarSign) | — | Siempre | ResumenTab.tsx:85 |
| 4 | stat | «Cierre estimado» + `dd mmm yyyy` o «N/A» | `formatPlainDate` | Siempre | ResumenTab.tsx:86 |
| 5 | stat | «Creada» + fecha o «N/A» | — | Siempre | ResumenTab.tsx:87 |
| 6 | stat | «Moneda» + código (por defecto «COP») | — | Siempre | ResumenTab.tsx:88 |
| 7 | texto | `SalesTeamTerritorySelectors` (CD.26) | Responsable, equipo y territorio | Ver CD.26 | ResumenTab.tsx:93 |
| 8 | texto | `ScoringSection` (CA.9) | Calificación GOC | Siempre | ResumenTab.tsx:95 |
| 9 | texto | `DiscoverySection` (CD.27) | Discovery | Siempre | ResumenTab.tsx:97 |
| 10 | texto | `OpportunityObjectionsBlock` (CB.12) | Objeciones registradas | Siempre | ResumenTab.tsx:100 |
| 11 | texto | «Cliente» (icono User) | Encabezado | Siempre | ResumenTab.tsx:103-106 |
| 12 | botón | «Editar» (SquarePen) | Abre `CustomerEditDialog` en modo edición | **Solo si hay cliente cargado** | ResumenTab.tsx:105 |
| 13 | botón | Nombre del cliente | `/app/crm/clientes/{id}` | Con cliente | ResumenTab.tsx:109 |
| 14 | texto | Empresa · email · teléfono · «{ciudad}, {dirección}» (Building2, Mail, Phone, MapPin) | — | Cada una si el dato existe | ResumenTab.tsx:110-113 |
| 15 | texto | «{tipo de identificación}: {número}» o «ID: {número}» | — | Si hay número de identificación | ResumenTab.tsx:114 |
| 16 | badge | «{customer_type}» **crudo, no traducido** (a diferencia de CB.11-15) | — | Si existe | ResumenTab.tsx:115 |
| 17 | texto | Notas del cliente | — | Si existen | ResumenTab.tsx:116 |
| 18 | estado | «No hay información detallada del cliente.» (cursiva) | Vacío | Sin cliente | ResumenTab.tsx:118-120 |
| 19 | texto | «Razón de pérdida» (XCircle rojo) + «Razón» · «Competidor» · «Precio competidor» · «Funcionalidades faltantes» · «Recontactar» | Ficha de la pérdida | **Solo si `status === 'lost'`**; cada campo solo con valor | ResumenTab.tsx:122-136 |
| 20 | texto | «Ficha de handoff» (Trophy verde) + «Qué compró» · «Módulos» · «Usuarios» · «Sucursales» · «Responsable» | Lee `win_data` | **Solo si `status === 'won'` y `win_data` no está vacío** | ResumenTab.tsx:137-151 |
| 21 | texto | «Productos ({n})» (Package) · «Espacios ({n})» (BedDouble) · «Conceptos ({n})» (FileText), con una fila por línea y su importe | Carga perezosa al activar la pestaña | Si hay líneas; cada bloque solo si tiene ítems | ResumenTab.tsx:59-72 · 152-157 |
| 22 | botón | «Gestionar líneas en el detalle →» | `/app/crm/oportunidades/{id}` | Junto al bloque 21 | ResumenTab.tsx:158 |

Secciones separadas por `Separator`, `space-y-5`. La tarjeta «Información» es `grid-cols-2` **fija**; la ficha de handoff también.

### CD.25 Pipeline — drawer › sección «Seguimiento» `drawer/FollowupSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | badge | «Último: {fecha}» (Clock) | Solo lectura, **con `formatDateInTz`**: correcto | Si hay último contacto | FollowupSection.tsx:116-121 |
| 2 | badge | «Canal: {etiqueta}» | Solo lectura | Si hay canal | FollowupSection.tsx:122-126 |
| 3 | badge | «Caliente» (rojo) · «Tibio» (amarillo) · «Frío» (azul), icono Thermometer | Solo lectura | Con temperatura elegida | FollowupSection.tsx:54-58 · 127 |
| 4 | campo | «Próximo contacto» (Calendar, `type="datetime-local"`) | `next_contact_at` | Siempre | FollowupSection.tsx:132-143 |
| 5 | campo | «Canal» · placeholder «Seleccionar...» · **5 opciones**: «Llamada» · «Correo» · «WhatsApp» · «Reunión» · «Visita» | `contact_channel` | Siempre | FollowupSection.tsx:145-159 · 36-42 |
| 6 | campo | «Resultado» · placeholder «Seleccionar...» · **7 opciones**: «Contactado» · «Sin respuesta» · «Buzón de voz» · «Callback agendado» · «Calificado» · «No interesado» · «Objeción» | `contact_result` | Siempre | FollowupSection.tsx:161-175 · 44-52 |
| 7 | campo | «Temperatura» (Thermometer) · placeholder «Seleccionar...» · «Caliente» · «Tibio» · «Frío» | `temperature` | Siempre | FollowupSection.tsx:177-194 |
| 8 | campo | Textarea «Próxima acción» (Target) · placeholder «Ej: Enviar propuesta, llamar al decisor, agendar demo...» (2 filas) | `next_action` | Siempre | FollowupSection.tsx:197-209 |
| 9 | botón | «Guardar seguimiento» (Save / Loader2) | Escribe los 5 campos de una vez | `disabled` al guardar | FollowupSection.tsx:211-214 |
| 10 | toast | «Seguimiento actualizado» | — | Tras éxito | FollowupSection.tsx:99 |

`grid-cols-1 sm:grid-cols-2`. Todos los controles son `h-9 text-sm`, **por debajo del objetivo táctil de 44 px** que sí respetan los diálogos.

### CD.26 Pipeline — drawer › «Equipo y Responsable» `drawer/SalesTeamTerritorySelectors.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Equipo y Territorio» + «Cargando...» (Loader2) | **El título del estado de carga difiere del final** (§G.5-4) | Mientras carga | SalesTeamTerritorySelectors.tsx:172-185 |
| 2 | texto | «Equipo y Responsable» (icono Users rosado) | Encabezado final | Con algún dato | SalesTeamTerritorySelectors.tsx:192-195 |
| 3 | estado | (La sección entera desaparece) | — | Sin equipos, ni territorios, ni miembros | SalesTeamTerritorySelectors.tsx:188 |
| 4 | campo | «Responsable» (UserCircle) · placeholder «Sin asignar» · «Sin asignar» + un miembro activo por fila (nombre, o email, o «Miembro sin nombre») | `salesperson_id` | Si hay miembros | SalesTeamTerritorySelectors.tsx:197-218 |
| 5 | campo | «Equipo comercial» (Users) · placeholder «Sin equipo» · «Sin equipo» + equipos activos | `sales_team_id` | Si hay equipos | SalesTeamTerritorySelectors.tsx:220-241 |
| 6 | campo | «Territorio» (MapPin) · placeholder «Sin territorio» · «Sin territorio» + territorios activos | `territory_id` | Si hay territorios | SalesTeamTerritorySelectors.tsx:243-264 |
| 7 | estado | Loader2 junto a la etiqueta del campo que se guarda | — | Durante cada guardado | SalesTeamTerritorySelectors.tsx:202 · 225 · 248 |
| 8 | toast | «Responsable actualizado» · «Equipo actualizado» · «Territorio actualizado» · «Error» / «No se pudo actualizar el responsable/equipo/territorio» | — | Según el caso | SalesTeamTerritorySelectors.tsx:162 · 122 · 142 · 126 · 146 · 166 |

`grid-cols-1 sm:grid-cols-2`: con los tres visibles, el tercero baja a una segunda fila desde 640. **Se guarda al cambiar, sin botón de confirmar**, a diferencia de CD.25.

### CD.27 Pipeline — drawer › «Discovery / Calificación» `drawer/DiscoverySection.tsx` · `drawer/FieldRenderer.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | Acordeón «Discovery / Calificación» (UserSearch + ChevronDown que rota 180°) | Despliega el panel (`aria-expanded`/`aria-controls`) | Siempre; **arranca cerrado** | DiscoverySection.tsx:99-129 |
| 2 | badge | «Completo» (CheckCircle2, esmeralda) | — | Si todas las obligatorias están respondidas | DiscoverySection.tsx:111-115 |
| 3 | texto | «{respondidos} de {total}» | Progreso textual | Cuando no está completo | DiscoverySection.tsx:116-120 |
| 4 | botón | «Configurar» (Settings) | Abre CD.28 | Siempre desde el drawer | DiscoverySection.tsx:130-140 |
| 5 | stat | Barra `role="progressbar"`, `aria-label` «Progreso del discovery», `aria-valuetext` «{n} de {m} campos respondidos» | Azul; esmeralda al completar | Con campos y sin carga | DiscoverySection.tsx:143-164 |
| 6 | texto | «Falta: {etiquetas separadas por coma}» | Nombra las obligatorias pendientes | Si faltan | DiscoverySection.tsx:165-169 |
| 7 | estado | 4 `Skeleton` con `aria-busy` y `aria-label` «Cargando plantilla de discovery» | Carga | Panel abierto | DiscoverySection.tsx:174-183 |
| 8 | estado | «No hay campos de discovery configurados. Usa «Configurar» para definirlos.» | Vacío | Plantilla sin campos | DiscoverySection.tsx:184-187 |
| 9 | campo | Uno por campo de la plantilla. **Respaldo por defecto de 10 campos**: «Quién es (rol/cargo)» (ph «Ej: Gerente general») · «Negocio» («Ej: Restaurante con 3 sedes») · «Problema principal» («Ej: Control de inventario manual») · «N° usuarios» («Ej: 12») · «N° sedes» («Ej: 3») · «Software actual» («Ej: Excel / Ninguno») · «Cuánto paga hoy» («Ej: $500k/mes») · «Decisor» («Ej: CEO + CFO») · «Fecha implementación» («Ej: 2026-01-15») · «Presupuesto» («Ej: $2M - $5M») | Guarda en `discovery_data` | La plantilla real sale de `discovery_templates`; estos 10 son el respaldo | DiscoverySection.tsx:189-199 · discoveryTemplateService.ts:24-35 |
| 10 | campo | Asterisco rojo tras la etiqueta; pista `sr-only` «Ejemplo: {placeholder}» o «Campo obligatorio»/«Campo opcional» | **El placeholder no se lee como descripción** | Por campo | FieldRenderer.tsx:25-41 · 44-50 |
| 11 | campo | `textarea` (2 filas, `sm:col-span-2`) · `select` con primera opción «Seleccionar...» · `input` de tipo `number`/`date`/`text` | Según el tipo del campo | Por tipo | FieldRenderer.tsx:52-107 |
| 12 | botón | «Guardar discovery» (Save / Loader2) | Escribe `discovery_data` | Si hay campos | DiscoverySection.tsx:201-216 |
| 13 | toast | «Discovery guardado» / «Todas las obligatorias respondidas.» o «{n} de {m} campos.» | — | Tras éxito | DiscoverySection.tsx:78-83 |

Panel en `grid-cols-1 sm:grid-cols-2`; los `textarea` ocupan las dos columnas. Usa el atributo `hidden` (no una clase) y la barra respeta `motion-reduce`.

### CD.28 Pipeline — diálogo «Configurar campos de Discovery» `drawer/DiscoveryConfigDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Configurar campos de Discovery» | — | Al abrir | DiscoveryConfigDialog.tsx:113 |
| 2 | texto | «Personaliza qué información quieres capturar durante la calificación de oportunidades. Cada organización puede tener sus propios campos según su tipo de negocio.» | — | Siempre | DiscoveryConfigDialog.tsx:114-117 |
| 3 | estado | Loader2 centrado | Carga de la plantilla | — | DiscoveryConfigDialog.tsx:120-123 |
| 4 | campo | placeholder «Etiqueta del campo» | `label` | Por campo | DiscoveryConfigDialog.tsx:134-139 |
| 5 | campo | `<select>` nativo · **5 opciones**: «Texto» · «Texto largo» · «Número» · «Fecha» · «Selección» | `type` | Por campo | DiscoveryConfigDialog.tsx:140-150 |
| 6 | botón | «↑» (**carácter literal**) | Sube el campo; `disabled` en el primero | Por campo | DiscoveryConfigDialog.tsx:151-157 |
| 7 | botón | «↓» (**carácter literal**) | Baja el campo; `disabled` en el último | Por campo | DiscoveryConfigDialog.tsx:158-164 |
| 8 | botón | (Trash2) | Elimina el campo | Por campo | DiscoveryConfigDialog.tsx:165-170 |
| 9 | campo | placeholder «Placeholder (ej: Ej: Gerente general)» | `placeholder` | Por campo | DiscoveryConfigDialog.tsx:173-178 |
| 10 | campo | placeholder «id_campo» (`w-32`) | `id` | Por campo | DiscoveryConfigDialog.tsx:179-184 |
| 11 | toggle | «Oblig.» | `required` | Por campo | DiscoveryConfigDialog.tsx:185-192 |
| 12 | campo | placeholder «Opciones separadas por coma: Opción 1, Opción 2, Opción 3» | `options[]` | **Solo si el tipo es «Selección»** | DiscoveryConfigDialog.tsx:194-207 |
| 13 | estado | «No hay campos configurados. Agrega campos o restaura el template por defecto.» | Vacío | Lista vacía | DiscoveryConfigDialog.tsx:211-215 |
| 14 | botón | «Agregar campo» (Plus) | Añade un campo «Nuevo campo» de tipo texto con id `field_{timestamp}` | Siempre | DiscoveryConfigDialog.tsx:219-222 |
| 15 | botón | «Restaurar por defecto» (RotateCcw) | Recarga los 10 campos base | Siempre | DiscoveryConfigDialog.tsx:223-226 |
| 16 | botón | «Cancelar» · «Guardar configuración» (Save / Loader2) | Guarda la plantilla de la organización | `disabled` al guardar o cargar | DiscoveryConfigDialog.tsx:232-238 |
| 17 | toast | «Todos los campos deben tener etiqueta» | Bloquea el guardado | Si algún `label` o `id` está vacío | DiscoveryConfigDialog.tsx:87 |
| 18 | toast | «Configuración guardada» / «{n} campos de discovery» | — | Tras éxito | DiscoveryConfigDialog.tsx:94 |

`sm:max-w-2xl max-h-[90vh] overflow-y-auto`. La fila de cada campo es un `flex` **sin `wrap`**: con seis controles en línea, en móvil se comprime mucho.

### CD.29 Pipeline — drawer › pestaña «Actividad» `drawer/tabs/ActividadTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `OpportunityTimeline` con `compact` y `showFilters` | El mismo timeline de CB.5-CB.6, en modo compacto (filtros apilados) y **sin composer** | Solo cuando la pestaña está activa | ActividadTab.tsx:7-22 |

Sin envoltorio propio; hereda el `p-4 sm:p-5` del cuerpo del drawer. Se refresca por `refreshToken`, que incrementa tras cada mutación del drawer.

### CD.30 Pipeline — drawer › pestaña «Tareas» `drawer/tabs/TareasTab.tsx` · `drawer/TasksSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | 2 `Skeleton` (9 y 16 de alto) | Antes de la primera carga | — | TareasTab.tsx:25 |
| 2 | campo | placeholder «Título de la tarea...» | Creación rápida; `Enter` también crea | Siempre | TasksSection.tsx:145-153 |
| 3 | botón | (Plus, `aria-label="Crear tarea"`) | Crea la tarea | `disabled` sin título | TasksSection.tsx:154-156 |
| 4 | botón | «Avanzado» (Edit3) | Abre `TaskDialog` en modo completo | Siempre | TasksSection.tsx:157-160 |
| 5 | botón | (CheckSquare, `aria-label` «Reabrir tarea» / «Marcar como completada») | Alterna `done` ↔ `open` | Por tarea | TasksSection.tsx:174-180 |
| 6 | botón | «{título de la tarea}» (tachado y gris si está hecha) | Abre `TaskDialog` completo para editar | Por tarea | TasksSection.tsx:183-190 |
| 7 | badge | Etiqueta de estado: verde si hecha, azul si en curso, rojo si cancelada, amarillo en el resto | — | Por tarea | TasksSection.tsx:44-55 · 192 |
| 8 | texto | Etiqueta de prioridad | — | Por tarea | TasksSection.tsx:193 |
| 9 | botón | (Trash2, `aria-label="Eliminar tarea"`) | **`confirm()` nativo** «¿Eliminar esta tarea?» y luego borra | Por tarea | TasksSection.tsx:126-139 · 194-200 |
| 10 | texto | Descripción de la tarea | — | Si existe | TasksSection.tsx:203 |
| 11 | texto | «Vence: {dd mmm yyyy}» (Calendar) | `formatPlainDate` | Si hay fecha | TasksSection.tsx:204-209 |
| 12 | estado | «No hay tareas asociadas.» (cursiva) | Vacío | Sin tareas | TasksSection.tsx:215-217 |
| 13 | toast | «Tarea creada» · «Tarea eliminada» · «No se pudo crear la tarea» · «No se pudo actualizar la tarea» · «No se pudo eliminar la tarea» | — | Según el caso | TasksSection.tsx:100 · 131 · 102-106 · 118-122 · 133-137 |

Fila de creación `flex gap-2` con el campo `flex-1`. Cada tarea es una tarjeta `p-3 rounded-lg` con el toggle a la izquierda.

### CD.31 Pipeline — drawer › pestaña «Notas» `drawer/tabs/NotasTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | `RichTextEditor` · placeholder «Escribe una nota...» (alto mínimo 60) | Cuerpo HTML de la nota | Siempre | NotasTab.tsx:96 |
| 2 | botón | «Agregar nota» (Plus / Loader2) | `POST /api/crm/notes` con `related_type:'opportunity'` | **`disabled` si el HTML sin etiquetas está vacío** | NotasTab.tsx:97-99 |
| 3 | estado | 2 `Skeleton` de 14 de alto | Antes de la primera carga | — | NotasTab.tsx:101-102 |
| 4 | estado | «No hay notas registradas.» (cursiva) | Vacío | Lista vacía | NotasTab.tsx:103-104 |
| 5 | texto | Cuerpo HTML + «{nombre} {apellido} · {dd mmm yyyy, hh:mm}» + « · Fijada» | Fecha con `toLocaleString('es-CO')` — **zona del navegador, no de la organización** | Por nota | NotasTab.tsx:50 · 111-115 |
| 6 | botón | (Pin / PinOff; `title`/`aria-label` «Fijar» / «Desfijar») | Alterna el fijado | Por nota | NotasTab.tsx:117-119 |
| 7 | botón | (Trash2; `title` «Eliminar», `aria-label` «Eliminar nota») | Borra la nota **sin confirmación** | Por nota | NotasTab.tsx:120 |
| 8 | toast | «Nota agregada» · «Nota eliminada» · «Error» / «No se pudo agregar la nota» / «No se pudo eliminar» / «No se pudo actualizar» | — | Según el caso | NotasTab.tsx:74 · 83 · 76 · 84 · 88 |

Las notas fijadas se pintan con fondo amarillo (`bg-yellow-50` / `dark:bg-yellow-900/20`) y borde ámbar; el resto en gris. Avatar circular de 28 px con StickyNote.

### CD.32 Pipeline — drawer › pestaña «Documentos» `drawer/tabs/DocumentosTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Sin organización activa.» | — | Sin organización resuelta | DocumentosTab.tsx:11 |
| 2 | texto | `DocumentUploader` con título «Documentos de la oportunidad», bucket privado `crm-documents` | Subida y listado de adjuntos | Con organización | DocumentosTab.tsx:12 |

**Divergencia**: el detalle (CB.7) usa otro componente y otro bucket (`crm`, con prefijo `opportunity-docs/`). **Los adjuntos subidos desde el drawer y desde el detalle no se ven entre sí.**

### CD.33 Pipeline — drawer › pestaña «IA» `drawer/tabs/IATab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Próxima acción sugerida» (Sparkles violeta) | Encabezado de tarjeta | Siempre | IATab.tsx:180 |
| 2 | botón | «Generar» / «Regenerar» (+ Loader2) | `POST /api/crm/ia/next-action` con `{opportunityId}` | «Regenerar» solo con resultado previo | IATab.tsx:181-183 |
| 3 | texto | «Actual: {next_action}» | Muestra la acción ya guardada | Si hay `next_action` y aún no se generó nada | IATab.tsx:185 |
| 4 | badge | «prioridad alta» (`destructive`) · «prioridad media» (`warning`) · «prioridad baja» (`secondary`); un valor desconocido se pinta crudo | — | Con resultado | IATab.tsx:150-151 · 189 |
| 5 | texto | Acción sugerida + razonamiento | — | Con resultado | IATab.tsx:190-192 |
| 6 | botón | «Crear tarea» (CheckSquare) | Abre `TaskDialog` compacto con el título prellenado | Con resultado | IATab.tsx:193 |
| 7 | estado | «Analiza actividades, notas, etapa y score para recomendar el siguiente paso.» | Vacío | Sin resultado ni carga | IATab.tsx:196 |
| 8 | texto | «Resumen de discovery» (ListChecks azul) | Encabezado de tarjeta | Siempre | IATab.tsx:202 |
| 9 | botón | «Generar» / «Regenerar» | `POST /api/crm/ia/discovery-summary` | — | IATab.tsx:203-205 |
| 10 | texto | Resumen + «Puntos clave» (lista) + «Siguientes pasos» (lista) | — | Con resultado y solo si las listas traen elementos | IATab.tsx:209-211 |
| 11 | badge | «sentimiento {valor}» (outline) | — | Si el resultado trae sentimiento | IATab.tsx:212 |
| 12 | estado | «Resume las llamadas y notas registradas en un discovery estructurado.» | Vacío | Sin resultado | IATab.tsx:215 |
| 13 | estado | «Agente de voz IA: se habilita en esta pestaña cuando F6 exponga los agentes configurados por etapa.» (Bot, tarjeta punteada, **sin control**) | — | Siempre | IATab.tsx:219-221 |
| 14 | toast | «No se pudo generar» / {mensaje} | Fallo de cualquiera de las dos llamadas | — | IATab.tsx:168 |

Dos tarjetas apiladas (`space-y-4`), sin cambios por breakpoint. Esta pestaña también se monta en el detalle (CB.4-5).

### CD.34 Pipeline — drawer › pestaña «Onboarding» `drawer/tabs/OnboardingTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `OnboardingChecklist` | Lista de verificación de implantación. Al completarla, el servidor mueve la oportunidad a la etapa `is_won` y se recarga la ficha | **Solo** en oportunidades cuyo pipeline es de tipo onboarding | OnboardingTab.tsx:11-19 · OpportunityDrawer.tsx:133 |

### CD.35 Pipeline — vista «Tabla» `TableView.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `TableSkeleton columns={6} rows={5}` | Carga | `loading` | TableView.tsx:324-330 |
| 2 | campo | placeholder «Buscar oportunidades...» (Search) | Filtra en memoria por nombre de oportunidad o de cliente | Siempre | TableView.tsx:337-345 |
| 3 | menú | Trigger «Filtrar por etapa» (≥`sm`) / «Etapa» (<`sm`), icono Filter | Abre el filtro de etapas | Siempre | TableView.tsx:347-354 |
| 4 | menú | Etiqueta «Etapas» + «Todas las etapas» + una por etapa | Fija el filtro | Siempre | TableView.tsx:356-372 |
| 5 | menú | Trigger «Filtrar por estado» (≥`sm`) / «Estado» (<`sm`) | Abre el filtro de estados | Siempre | TableView.tsx:376-383 |
| 6 | menú | «Todos los estados» · «Activa» · «Ganada» · «Perdida» | Fija el filtro (`null`/`active`/`won`/`lost`). **«Activa» no casa con ninguna fila si la BD guarda `open`** (§G.10-12) | Siempre | TableView.tsx:385-410 |
| 7 | tabla | «Oportunidad» (ArrowUpDown) | Ordena por nombre, alterna asc/desc | Siempre | TableView.tsx:458-466 |
| 8 | tabla | «Cliente» (ArrowUpDown) | Ordena por nombre de cliente | **Oculta bajo 640 px** | TableView.tsx:467-475 |
| 9 | tabla | «Etapa» (ArrowUpDown) | **Ordena por `created_at`, no por etapa** (falta el caso en el `switch`, §G.1-11) | **Oculta bajo 768 px** | TableView.tsx:476-484 · 225-251 |
| 10 | tabla | «Monto» (ArrowUpDown, a la derecha) | Ordena por importe | Siempre | TableView.tsx:485-493 |
| 11 | tabla | «Fecha cierre» (ArrowUpDown) | Ordena por fecha esperada; los nulos van al final | **Oculta bajo 1024 px** | TableView.tsx:494-502 |
| 12 | tabla | «Estado» (no ordenable) · columna de acciones (vacía) | — | Siempre | TableView.tsx:503-504 |
| 13 | estado | «No se encontraron oportunidades» | Vacío | Filtro sin resultados | TableView.tsx:508-513 |
| 14 | botón | Nombre de la oportunidad (`CopyableId`, copia el id) | `/app/crm/oportunidades/{id}` | Por fila | TableView.tsx:517-528 |
| 15 | texto | Nombre del cliente o «Sin cliente»; en móvil se repite bajo el nombre (`sm:hidden`) | — | Por fila | TableView.tsx:526 · 529-531 |
| 16 | texto | Nombre de la etapa o «Sin etapa» | — | Por fila, desde `md` | TableView.tsx:532-534 |
| 17 | texto | «Sin fecha» o fecha plana (`formatPlainDate`) | — | Por fila, desde `lg` | TableView.tsx:538-542 |
| 18 | badge | «Ganada» (verde) · «Perdida» (rojo) · el resto en azul | — | Por fila | TableView.tsx:543-555 |
| 19 | menú | Trigger (MoreHorizontal; `sr-only` «Abrir menú») + «Editar» + «Eliminar» (rojo) | Editar va a `/editar`; Eliminar abre la confirmación | Por fila | TableView.tsx:557-571 |
| 20 | diálogo | «¿Estás seguro?» / «Esta acción no se puede deshacer. Esta eliminará permanentemente la oportunidad y todos los datos asociados a ella.» | Confirmación de borrado | Al pulsar «Eliminar» | TableView.tsx:416-424 |
| 21 | botón | «Cancelar» · «Eliminar» / «Eliminando» (+ `LoadingSpinner`) | Borra **directamente desde el navegador** | En el diálogo | TableView.tsx:426-448 |
| 22 | toast | «Oportunidad eliminada» / «La oportunidad ha sido eliminada correctamente.» · «Error» / «No se pudo eliminar la oportunidad. Inténtalo de nuevo.» | — | Según el caso | TableView.tsx:304-307 · 313-317 |

Filtros `flex-col sm:flex-row`; tabla en `overflow-x-auto`. Tres columnas se ocultan progresivamente. **No hay paginación**: carga todas las oportunidades del pipeline.

### CD.36 Pipeline — vista «Automatización» `AutomationsView.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Automatizaciones de este pipeline» (icono Zap) | Título de la tarjeta | Siempre | AutomationsView.tsx:82-84 |
| 2 | texto | «Las ejecuta la cola del servidor cuando ocurre el evento; el historial de cada ejecución queda en Automatizaciones.» | Descripción | Siempre | AutomationsView.tsx:85-88 |
| 3 | botón | «Gestionar» (ExternalLink) | `/app/crm/automatizaciones` | **Solo si esa entrada del menú está habilitada** en `src/config/crmNav.ts` | AutomationsView.tsx:29 · 90-96 |
| 4 | estado | `TableSkeleton rows={3}` | Carga | — | AutomationsView.tsx:100-101 |
| 5 | estado | «{mensaje}» o «No se pudieron cargar las reglas» (caja roja `role="alert"`, AlertCircle) | Error | Fallo de la API | AutomationsView.tsx:102-106 |
| 6 | estado | «Este pipeline todavía no tiene reglas. Crea la primera desde Automatizaciones.» (con enlace) **o** «Este pipeline todavía no tiene reglas. El editor de automatizaciones aún no está habilitado.» | El texto depende de si el menú habilita la página | Sin reglas | AutomationsView.tsx:107-117 |
| 7 | texto | «{nombre de la regla}» + «{tipo de disparador} · {n} acción(es) · {m} ejecuciones» | Una fila por regla global o de este pipeline | Con reglas | AutomationsView.tsx:120-127 |
| 8 | badge | «Activa» (default) / «Inactiva» (secondary) | — | Por regla | AutomationsView.tsx:128-130 |

Cabecera `flex-wrap items-start justify-between gap-3`: «Gestionar» baja de línea en pantallas estrechas.

### CD.37 Pipeline — componentes del árbol que la pantalla **no** monta

| # | Tipo | Etiqueta exacta | Qué haría | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «Resumen»: «Total oportunidades:» · «Valor total:» · «Pronóstico:» · «Por Etapa» · «Pronóstico Mensual» (3 meses) | `KanbanSummary` — solo se reexporta en el barril `index.ts`, que nadie importa. **Pronostica con constantes inventadas** (`0.6 / 0.3 / 0.1`) | **Nunca** | KanbanSummary.tsx:46-115 · 40-44 · index.ts:4 · 32 |
| 2 | texto | «Gestión de Etapas» / «Personaliza las etapas del pipeline según tu proceso de ventas» + «Crear Nueva Etapa», tooltips «Mover arriba»/«Mover abajo»/«Editar etapa»/«Eliminar etapa», diálogo «Editar Etapa»/«Nueva Etapa» con «Nombre de la etapa» (ph «Ej: Contacto Inicial»), «Posición», «Probabilidad (%)», «Color (opcional)» y los dos switches de cierre | `StageManager` — solo en el barril; **escribe `stages` directo desde el navegador**, sin el control de rol de la ruta | **Nunca** | StageManager.tsx:471-652 · 322-463 · index.ts:8 · 36 |
| 3 | texto | «Configuración de Etapa» / «Personaliza las propiedades de esta etapa del pipeline.» con «Nombre», «Probabilidad (%): {n}» (slider 0-1 paso 0,01), «Color» (`ColorInput`), «Descripción», «Etapa de cierre ganado» / «Al mover aquí una oportunidad se abre el formulario de Closed Won», «Etapa de cierre perdido» / «Al mover aquí una oportunidad se abre el dialog de razón de pérdida», «Cancelar», «Guardar cambios» | `StageConfigDialog` — **sin ningún importador**; también escribe `stages` desde el navegador. Arrastra a `ColorInput.tsx`, que solo él usa | **Nunca** | StageConfigDialog.tsx:153-305 |
| 4 | estado | «Verificando pipeline...» / «Creando pipeline predeterminado...» / «Configurando etapas...» / «Pipeline configurado correctamente» y sus errores — **ninguno se renderiza**: el `return` solo pinta 3 `Skeleton` | `PipelineInitializer` — sin importadores; crearía un pipeline con 10 etapas escribiendo desde el navegador | **Nunca** | PipelineInitializer.tsx:16-136 · 130-136 |
| 5 | menú | «Apariencia» / «Claro» / «Oscuro» (+ `sr-only` «Cambiar tema») | `ThemeToggle` del pipeline — sin importadores; hay otros dos vivos en `app-layout/` y `theme/`. Su opción «system» existe en el estado pero no tiene ítem de menú | **Nunca** | ThemeToggle.tsx:58-93 · 22 |
| 6 | diálogo | «Crear Oportunidades Masivas» / «Crea múltiples oportunidades a la vez. Pega desde Excel/Sheets (tabulado) o agrega filas manualmente.» con «Pipeline *», «Etapa inicial *», «Moneda», rejilla «Nombre *»/«Monto»/«Cliente»/«Email»/«Teléfono», «Agregar fila», tip de pegado y «Crear {n} oportunidad(es)» | `BulkCreateOpportunitiesDialog` — **sin importadores**: 383 líneas de carga masiva por pegado desde Excel. Es justo lo que la pestaña «Mensaje» de CD.6 tampoco cubre | **Nunca** | BulkCreateOpportunitiesDialog.tsx:223-383 |

### CD-edit `/app/crm/pipeline/edit-opportunity` — redirección heredada

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | (Sin texto: `PageHeaderSkeleton` + `StatsSkeleton count={4}` + `CardListSkeleton cards={3} columns="1"`) | **Único render visible**; se muestra durante el `Suspense` y durante la redirección | Siempre | edit-opportunity/page.tsx:22-28 · 33-39 |
| 2 | cálculo | (Sin control visible) | Con `?id=…` hace `router.replace('/app/crm/oportunidades/{id}/editar')`; sin `id`, `router.replace('/app/crm/pipeline')` | Al montar | edit-opportunity/page.tsx:12-20 |

`p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6`, `min-h-screen`. **No hay nada que calcar más allá del esqueleto**: es una redirección heredada (`export const dynamic = 'force-dynamic'`, l.7). Ambas rutas de destino existen.

### CE.1 Pronóstico — cabecera del panel Revenue OS `components/crm/revenueos/RevenueOsPage.tsx`

**La ruta no renderiza `ForecastView.tsx` ni ningún componente de `crm/pipeline/*`.** `page.tsx` (13 líneas) solo monta `RevenueOsPage`. El pronóstico anterior sobrevive como **una de las cinco pestañas** («Forecast»), implementado en `components/crm/pronostico/**`.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Revenue OS» (h1, `text-xl sm:text-2xl`, bold) | Título | Siempre | RevenueOsPage.tsx:75 |
| 2 | texto | «Pronóstico, embudo, cohortes y matemática comercial de la organización.» | Subtítulo | Siempre | RevenueOsPage.tsx:76-77 |
| 3 | texto | «Periodo: {sep 2025 – ago 2026} · zona {America/Bogota}» | Periodo aplicado; el fin se muestra como `end − 1 mes` (el servidor usa fin exclusivo) | Con datos cargados | RevenueOsPage.tsx:67-69 · 78-83 |
| 4 | texto | « · moneda COP» | Se concatena al anterior | Si la organización tiene moneda base | RevenueOsPage.tsx:81 |
| 5 | estado | «La organización no tiene moneda base configurada: las cifras se muestran sin símbolo de moneda.» (`role="note"`, ámbar) | — | Con datos y sin moneda base | RevenueOsPage.tsx:85-89 · formatters.ts:15 |
| 6 | botón | «Actualizar» | Vuelve a pedir el dashboard con el rango actual | Siempre | RevenueOsPage.tsx:98-101 |
| 7 | estado | RefreshCw con `animate-spin` dentro del botón, que queda `disabled` | Carga | — | RevenueOsPage.tsx:98-99 |

`header` con `flex flex-wrap items-start justify-between gap-3`. Página `min-h-screen` con `p-3 sm:p-4 md:p-6`. Por debajo de ~700 px el grupo derecho salta a una línea propia.

### CE.2 Pronóstico — selector de periodo `RevenueRangeControl.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | «Desde (mes)» (`<input type="month">`, **sin placeholder**) | Mes inicial; se envía como `{mes}-01` | Siempre | RevenueRangeControl.tsx:73-87 |
| 2 | campo | «Hasta (mes)» (`<input type="month">`) | Mes final **inclusivo en pantalla**; se envía con un mes más (fin exclusivo) | Siempre | RevenueRangeControl.tsx:88-102 |
| 3 | botón | «Aplicar» | Valida y recarga con el nuevo rango | Siempre | RevenueRangeControl.tsx:103-105 |
| 4 | estado | «Elige mes y año en ambos campos» | Validación de formato | Al aplicar con campos incompletos | RevenueRangeControl.tsx:39 · 106-110 |
| 5 | estado | «El mes final debe ser igual o posterior al inicial» | Validación de orden | Al aplicar | RevenueRangeControl.tsx:40 |
| 6 | estado | «Máximo 36 meses» | Validación de amplitud | Al aplicar | RevenueRangeControl.tsx:41 · dateRange.ts:31 |
| 7 | cálculo | Valor inicial de los campos | Del periodo aplicado; en la primera carga, ambos vacíos | Siempre | RevenueRangeControl.tsx:49-51 |

`<form aria-label="Periodo del panel">` en `flex flex-wrap items-end gap-3`. Inputs `h-9 w-40`. El error es `basis-full` (línea propia, `role="alert"`), enlazado con `aria-describedby`; al fallar, **el foco vuelve al campo «Desde»**. Los tres controles quedan `disabled` mientras carga.

### CE.3 Pronóstico — barra de pestañas y estados globales `RevenueOsPage.tsx` · `common/LoadErrorState.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | pestaña | «Resumen» | KPIs + gráfica de tendencia | Siempre · activa por defecto | RevenueOsPage.tsx:38 · 111-115 |
| 2 | pestaña | «Embudo» | `FunnelPanel` (CE.7) | Siempre | RevenueOsPage.tsx:39 |
| 3 | pestaña | «Forecast» | `ForecastDashboard` (CE.8-CE.12) | Siempre | RevenueOsPage.tsx:40 |
| 4 | pestaña | «Cohortes» | `CohortTable` (CE.13) | Siempre | RevenueOsPage.tsx:41 |
| 5 | pestaña | «Matemática comercial» | `RevenueMathPanel` (CE.14-CE.15) | Siempre | RevenueOsPage.tsx:42 |
| 6 | texto | `aria-label="Secciones de Revenue OS"` | Nombre accesible de la barra | Siempre | RevenueOsPage.tsx:110 |
| 7 | estado | `aria-label="Cargando panel"`, `aria-busy`; **8 rectángulos `h-20`** + 1 `h-64` | Esqueleto del panel Resumen. **`KpiTiles` devuelve 7 tarjetas, no 8** (§G.5-5) | Sin datos, cargando y sin error | RevenueOsPage.tsx:45-56 · 119-121 |
| 8 | estado | Rectángulo `h-64` (Embudo) · `h-48` (Cohortes) · `h-64` (Matemática) | Esqueletos por pestaña | Ídem | RevenueOsPage.tsx:130-151 |
| 9 | estado | «No se pudo cargar el panel Revenue OS» + mensaje del servidor | Bloque rojo `role="alert"` sobre las pestañas; **vacía los datos**, así que los paneles quedan en blanco | Fallo de carga | RevenueOsPage.tsx:105-107 · useRevenueDashboard.ts:51-55 |
| 10 | botón | «Reintentar» | Reejecuta la carga; `disabled` mientras reintenta | En el bloque de error | LoadErrorState.tsx:44-54 |
| 11 | estado | «No se pudieron calcular las métricas (fn_revenue_metrics: …)» | Texto del servidor en un 502 | Fallo de RPC | routeSupport.ts:31-34 |
| 12 | estado | «Fecha de inicio inválida: usa YYYY-MM-DD» · «Fecha de fin inválida: usa YYYY-MM-DD» · «La fecha de fin debe ser posterior o igual a la de inicio» · «El rango máximo es de 36 meses» | Errores 400 del servidor | Rango inválido | dateRange.ts:89-99 |
| 13 | estado | «La petición tardó demasiado y se canceló. Revisa la conexión e inténtalo de nuevo.» | Timeout de red | Abort/Timeout | errorMessage.ts:35-37 |
| 14 | estado | (Sin bloqueo: cualquier miembro ve el panel) | El permiso de administrador solo afecta al formulario de CE.15 | Siempre | dashboard/route.ts:16-30 |

`TabsList` con `flex h-auto w-full flex-wrap justify-start gap-1` — **envuelve** (no hay scroll horizontal) en móvil. «Embudo» y «Cohortes» llevan tarjeta contenedora; «Resumen», «Forecast» y «Matemática» no.

### CE.4 Pronóstico › «Resumen» — las 7 tarjetas KPI `revenueos/KpiTiles.tsx`

Moneda: `Intl.NumberFormat('es-CO', { style:'currency', currency, maximumFractionDigits: 0 })` sobre el valor redondeado; sin moneda base, el número sin símbolo; con un código que `Intl` no reconoce, «1.234 XXX». Porcentaje: **«12 %»** con coma decimal y espacio antes del signo. Días: «34 d». Cualquier `null` se pinta «Sin datos» y la cifra pasa a gris.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «Revenue cobrado» (Banknote) | `Σ` mensual de `fn_revenue_metrics`: pagos `completed` de facturas de la organización, con o sin oportunidad | Siempre | KpiTiles.tsx:28-34 · rpc.ts:51-52 |
| 1a | texto | «Sin pagos completados de facturas en el periodo» · «Ninguna factura enlazada a una oportunidad; cobrado total de la organización» · «Pagos completados de facturas enlazadas a oportunidades» · «Cobrado total de la organización; {$X} de facturas enlazadas a oportunidades» | Hint según el caso | Siempre | kpiHints.ts:15-18 |
| 2 | stat | «Ganado en pipeline» (Trophy) | `Σ` mensual de `revenue_won_pipeline` | Siempre | KpiTiles.tsx:35-41 |
| 2a | texto | «3 oportunidades ganadas» / «1 oportunidad ganada» / «Sin oportunidades ganadas en el periodo» | Plural resuelto por código | Siempre | kpiHints.ts:21-23 |
| 3 | stat | «Pipeline abierto» (Wallet) | `Σ` de los montos de las etapas que no son ganadas ni perdidas — **foto de HOY, no del periodo** | Siempre | KpiTiles.tsx:42-48 · 25 |
| 3a | texto | «Monto en etapas abiertas hoy» | Hint fijo | Siempre | KpiTiles.tsx:46 |
| 4 | stat | «Win rate» (Percent) | `ganadas / (ganadas + perdidas) × 100`; sin cierres, «Sin datos» | Siempre | KpiTiles.tsx:49-55 · revenueOsService.ts:137 |
| 4a | texto | «2 ganadas de 5 cerradas» / «Sin cierres en el periodo» | Plural doble | Siempre | kpiHints.ts:25-28 |
| 5 | stat | «Ciclo medio de venta» (Clock) | Media aritmética de los ciclos mensuales **> 0** (los nulos y ceros no pesan) | Siempre | KpiTiles.tsx:56-62 · revenueOsService.ts:125 · 138 |
| 5a | texto | «De creación a cierre, media mensual» / «Sin oportunidades ganadas con fecha de cierre» | — | Siempre | KpiTiles.tsx:60 |
| 6 | stat | «ARPA» (Receipt) | Media **ponderada por número de facturas**, no media de medias | Siempre | KpiTiles.tsx:63-69 · revenueMath.ts:133-143 |
| 6a | texto | «Ticket medio por factura pagada (21 facturas)» / «Sin facturas pagadas en el periodo» | — | Siempre | kpiHints.ts:30-32 |
| 7 | stat | «Comisiones pagadas» (Banknote) | `Σ` mensual de comisiones pagadas | Siempre | KpiTiles.tsx:70-76 · revenueOsService.ts:141 |
| 7a | texto | «Comisiones en estado pagado» / «Ninguna comisión pagada en el periodo» | — | Siempre | KpiTiles.tsx:74 |
| 8 | tooltip | `title` con el valor completo | La cifra va `truncate` | Siempre | KpiTiles.tsx:105 |

`<ul aria-label="Indicadores del periodo">` en `grid grid-cols-2 gap-3 md:grid-cols-4`. Al ser **siete** tarjetas, la última fila queda coja (3 huecos en `md`, 1 en móvil). Entrada animada en cascada; con `prefers-reduced-motion`, solo opacidad.

### CE.5 Pronóstico › «Resumen» — gráfica de tendencia `revenueos/RevenueTrendChart.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Tendencia mensual: cobrado frente a ganado» (h3) | Título | Siempre | RevenueTrendChart.tsx:70-72 |
| 2 | toggle | «Ver tabla» / «Ver gráfico» (`aria-pressed`) | Alterna gráfica ↔ tabla accesible | Siempre salvo en el vacío | RevenueTrendChart.tsx:73-75 |
| 3 | estado | «Sin cobros ni oportunidades ganadas en el periodo. Cambia el rango o registra ventas para ver la tendencia.» | Vacío `py-8` | Sin filas o todas a cero | RevenueTrendChart.tsx:62 · 78-81 |
| 4 | texto | Barras agrupadas verticales (Recharts): serie 1 «Cobrado», serie 2 «Ganado en pipeline» | — | Con datos, en modo gráfica | RevenueTrendChart.tsx:106-123 |
| 5 | cálculo | **Colores literales**: serie 1 `#2a78d6` claro / `#3987e5` oscuro; serie 2 `#eb6834` / `#d95926`; rejilla `#e5e7eb` / `#374151`; tinta de ejes `#52514e` / `#c3c2b7` | — | Siempre | RevenueTrendChart.tsx:19-26 |
| 6 | cálculo | Eje X: meses «sep 2026»; ticks de 11 px; línea de eje en color de rejilla; sin `tickLine` | — | Siempre | RevenueTrendChart.tsx:110 |
| 7 | cálculo | Eje Y: formato compacto «1,2 mil M» · «3.4 M» · «850 k» o el número crudo; sin línea de eje ni ticks; ancho 56 px | — | Siempre | RevenueTrendChart.tsx:111 · formatters.ts:38-44 |
| 8 | cálculo | Geometría: `barGap 2`, `barCategoryGap "30%"`, `maxBarSize 24`, radio `[4,4,0,0]`, **sin animación**; rejilla solo horizontal | — | Siempre | RevenueTrendChart.tsx:108-119 |
| 9 | tooltip | Encabezado = mes; líneas «Cobrado: $1.234.567» y «Ganado en pipeline: $890.000» (`role="status"`) | El color de serie va en un cuadrito `h-2.5 w-2.5`, **no en el texto** | Hover | RevenueTrendChart.tsx:40-56 |
| 10 | cálculo | Cursor del tooltip: relleno en color de rejilla con `opacity: 0.5` | — | Hover | RevenueTrendChart.tsx:112 |
| 11 | texto | Leyenda «Cobrado» · «Ganado en pipeline» (`iconType="square"`, `iconSize 10`) | Etiquetas `text-xs` en gris, **nunca en el color de la serie** | Con datos, en modo gráfica | RevenueTrendChart.tsx:113-117 |
| 12 | tabla | Columnas «Mes» · «Cobrado» · «Ganado en pipeline»; `caption` `sr-only` «Revenue cobrado y ganado en pipeline por mes» | Vista alternativa con valores exactos | Modo tabla | RevenueTrendChart.tsx:83-104 |
| 13 | texto | `aria-label` «Gráfico de barras mensual: cobrado frente a ganado en pipeline. La vista de tabla tiene los valores exactos.» | Nombre accesible del lienzo | Modo gráfica | RevenueTrendChart.tsx:106 |

Lienzo `h-64 w-full` con `ResponsiveContainer`. La tabla va en `overflow-x-auto`, celdas numéricas `tabular-nums` a la derecha y el mes como `<th scope="row">`.

### CE.6 Pronóstico › pestaña «Embudo» `revenueos/FunnelPanel.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Sin etapas configuradas. Crea un pipeline con etapas en Configuración para ver el embudo.» | Vacío `p-8` | Sin etapas | FunnelPanel.tsx:39-45 |
| 2 | campo | Select «Pipeline» (sin placeholder) | Elige qué pipeline se dibuja | **Solo si hay más de uno** | FunnelPanel.tsx:52-70 |
| 3 | menú | Nombres de pipeline; fallback «Pipeline 3f2a1b9c» (8 caracteres del id) o «Sin pipeline» | — | Al abrir | FunnelPanel.tsx:47 · 62-66 |
| 4 | estado | «Fuera de la cadena: «Primera llamada» (2 oportunidades) va después de la etapa ganada. La conversión termina en la ganada; revisa el orden de las etapas en Configuración.» (caja ámbar `role="note"`) | — | Si hay etapas después de la ganada | FunnelPanel.tsx:72-77 |
| 5 | estado | «Sin oportunidades en este pipeline todavía. Crea la primera desde Oportunidades y el embudo se llenará solo.» | Vacío | Sin oportunidades | FunnelPanel.tsx:79-82 |
| 6 | texto | Barras horizontales por etapa (`<ol aria-label="Embudo por etapa">`) | Una fila por etapa de la cadena | Con oportunidades | FunnelPanel.tsx:85-106 |
| 7 | cálculo | Colores: etapa ganada `bg-emerald-600` / `dark:bg-emerald-500`; resto `bg-blue-600` / `dark:bg-blue-500`; canal `bg-gray-100` / `dark:bg-gray-700`, alto `h-6` | — | Siempre | FunnelPanel.tsx:92-98 |
| 8 | cálculo | Anchura: porcentaje sobre la primera etapa, con **mínimo visible del 2 %** si llegó alguna; animación 0,25 s escalonada, anulada con `prefers-reduced-motion` | — | Siempre | FunnelPanel.tsx:95-97 |
| 9 | texto | «12 · 80 %» a la derecha de cada barra (ancho fijo `w-32`, `tabular-nums`) | Conteo y porcentaje | Siempre | FunnelPanel.tsx:100-102 |
| 10 | tabla | `caption` «Conversión etapa a etapa (acumulado: en la etapa o más adelante; las perdidas se muestran aparte)» | Mismos datos, accesibles | Con oportunidades | FunnelPanel.tsx:108-155 |
| 11 | tabla | «Etapa» (`<th scope="row">») · «En la etapa» (oportunidades **hoy**) · «Llegaron» (acumulado hacia adelante) · «Monto en etapa» · «Pasa a la siguiente» (o «—» en la última etapa o sin base) | — | Siempre | FunnelPanel.tsx:115-134 |
| 12 | badge | «(ganada)» (sufijo esmeralda `text-xs`) | — | Solo en la etapa ganada | FunnelPanel.tsx:127 |
| 13 | cálculo | La cadena son las etapas no perdidas ordenadas por posición hasta la primera ganada; «Llegaron» es la suma de esa etapa en adelante; la conversión es el cociente entre etapas consecutivas | — | Siempre | funnelConversion.ts:84-102 |
| 14 | texto | «Conversión global» (`<th scope="row">` del pie) + «(hasta la última etapa: no hay etapa ganada)» | El matiz solo cuando no hay etapa ganada | Siempre | FunnelPanel.tsx:140-143 |
| 15 | stat | Valor global, p. ej. «25,0 %» (1 decimal) o «Sin datos» | Última etapa de la cadena sobre la primera | Siempre | FunnelPanel.tsx:145 · funnelConversion.ts:104 |
| 16 | texto | «Perdidas: 4 ($1.200.000)» | Conteo y monto de las etapas perdidas, fuera de la cadena | Si hay perdidas | FunnelPanel.tsx:146-150 |

Cada fila es `grid grid-cols-[minmax(7rem,1fr)_3fr]` — el nombre ocupa 7 rem mínimo y va `truncate` con `title`. La tabla vive en `overflow-x-auto` (5 columnas).

### CE.7 Pronóstico › «Forecast» — filtros `crm/pronostico/ForecastFilters.tsx` · `ForecastDashboard.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Esqueleto `h-8 w-1/2` + 3 rectángulos `h-32` en `grid-cols-1 md:grid-cols-3` | Carga inicial | Sin pipelines cargados | ForecastDashboard.tsx:145-156 |
| 2 | estado | «No se pudo cargar el pronóstico» + mensaje + «Reintentar» | Sustituye todo el contenido de la pestaña | Fallo de carga | ForecastDashboard.tsx:129-143 |
| 3 | campo | Select placeholder «Seleccionar pipeline» | Recarga etapas, oportunidades y forecast | Siempre | ForecastFilters.tsx:35-46 |
| 4 | menú | Un ítem por pipeline de la organización, ordenados por nombre | — | Al abrir | ForecastFilters.tsx:40-44 |
| 5 | cálculo | Pipeline por defecto: el marcado como predeterminado y, si no hay, el primero | — | Al montar | ForecastDashboard.tsx:53-57 |
| 6 | campo | Select sin placeholder, valor por defecto «Mensual» | Cambia la agrupación del gráfico de tendencia | Siempre | ForecastFilters.tsx:49-58 |
| 7 | menú | «Semanal» (agrupa por semana, domingo como inicio) · «Mensual» (por defecto) · «Trimestral» | — | Al abrir | ForecastFilters.tsx:54-56 · ForecastDashboard.tsx:35 |
| 8 | botón | «Exportar» (Download) | **Nunca se renderiza**: depende de una prop opcional que el contenedor no pasa (§G.8-12) | Nunca aquí | ForecastFilters.tsx:20 · 61-71 · ForecastDashboard.tsx:161-167 |
| 9 | cálculo | Ganado: suma de importes de las ganadas del pipeline (**sin filtro de fecha**) | — | Siempre | ForecastDashboard.tsx:83-85 |
| 10 | cálculo | En proceso: suma de importes de las abiertas | — | Siempre | ForecastDashboard.tsx:87-89 |
| 11 | cálculo | Ponderado: suma de `importe × probabilidad de su etapa / 100` sobre las abiertas | — | Siempre | ForecastDashboard.tsx:93 · forecastScenarios.ts:84-86 |

`flex flex-col sm:flex-row`: en móvil los dos selects se apilan; desde `sm` pasan a fila con anchos fijos `sm:w-48` y `sm:w-40`, ambos `h-9`.

### CE.8 Pronóstico › «Forecast» — progreso de meta `crm/pronostico/GoalProgress.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Tres barras grises `animate-pulse` | Esqueleto propio | Mientras carga | GoalProgress.tsx:43-55 |
| 2 | texto | «Meta Mensual» / «Meta Semanal» / «Meta Trimestral» / «Meta Anual» (icono Target azul) | El sufijo sale del periodo configurado en el pipeline | Siempre | GoalProgress.tsx:33-64 |
| 3 | texto | Nombre del pipeline, o «Sin pipeline» (`truncate`) | — | Siempre | GoalProgress.tsx:65-67 |
| 4 | estado | «No hay meta configurada para este pipeline» + «Configura una meta en las opciones del pipeline» (XCircle gris) | Vacío | Sin meta en el pipeline | GoalProgress.tsx:139-148 |
| 5 | stat | Cifra grande = ganado (`text-xl sm:text-3xl` bold) | — | Con meta | GoalProgress.tsx:76-78 |
| 6 | texto | «de $50.000.000» | Meta del pipeline | Con meta | GoalProgress.tsx:79-81 |
| 7 | cálculo | Barra principal (`h-2 sm:h-3`): `ganado / meta × 100`, tope 100 | — | Con meta | GoalProgress.tsx:30 · 83 |
| 8 | texto | «43.7% completado (ganado)» | **Punto decimal y sin espacio antes del `%`**: no usa el formateador del resto del panel (§G.10-1) | Con meta | GoalProgress.tsx:84-86 |
| 9 | texto | «Proyección (ganado + ponderado)» (TrendingUp) | Encabezado del bloque azul | Con meta | GoalProgress.tsx:91-95 |
| 10 | stat | Cifra de proyección = `ganado + ponderado` | — | Con meta | GoalProgress.tsx:29 · 98-100 |
| 11 | texto | «78.2%» | Proyección sobre la meta, tope 100 | Con meta | GoalProgress.tsx:31 · 101-103 |
| 12 | cálculo | Segunda barra (`h-1.5 sm:h-2`), canal `bg-blue-100` / `dark:bg-blue-800` | Dibuja la proyección | Con meta | GoalProgress.tsx:105 |
| 13 | stat | «Ganado» (CheckCircle verde) · «Ponderado» (TrendingUp azul) · «En proceso» (Target naranja) | — | Con meta | GoalProgress.tsx:110-136 |

`Card` blanca, 1 de 3 columnas desde `lg`. El trío final es `grid grid-cols-3` que **se mantiene en 3 columnas también en móvil**, con `text-sm sm:text-lg` y etiquetas `text-[10px] sm:text-xs`.

### CE.9 Pronóstico › «Forecast» — «Tendencia de Pronóstico» `crm/pronostico/ForecastChart.tsx`

**No usa Recharts**: son barras HTML superpuestas dibujadas a mano.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Rectángulo `h-64` `animate-pulse` | Esqueleto | Mientras carga | ForecastChart.tsx:15-25 |
| 2 | estado | «No hay datos de pronóstico disponibles» | Vacío | Ninguna oportunidad con fecha de cierre | ForecastChart.tsx:27-37 |
| 3 | texto | «Tendencia de Pronóstico» (**Title Case**) | Título | Con datos | ForecastChart.tsx:60 |
| 4 | badge | Leyenda «Ganado» (punto `bg-green-500`) · «Ponderado» (`bg-blue-500`) · «En proceso» (`bg-gray-300` / `dark:bg-gray-600`) · «Meta» (aro `border-2 border-red-500`) | — | Con datos | ForecastChart.tsx:65-80 |
| 5 | texto | Una barra por periodo, **solo los últimos 6**, alto `h-10` | Tres rellenos anclados a la izquierda que se superponen: gris (abierto), azul (ponderado), verde (ganado), sobre canal gris | Con datos | ForecastChart.tsx:85-129 |
| 6 | cálculo | Escala: máximo entre abierto, ganado y meta de todas las filas (mínimo 1) | — | Con datos | ForecastChart.tsx:39-42 |
| 7 | cálculo | Marca de meta: línea vertical `w-0.5 bg-red-500 z-10` en la posición proporcional, tope 100 % | — | Si la fila tiene meta | ForecastChart.tsx:98-103 |
| 8 | texto | Etiqueta de periodo: «Sep 2026» · «Q3 2026» o el literal crudo. **Las claves semanales caen sin formatear** (§G) | Meses abreviados en español; los trimestres se voltean a «Qn YYYY» | Con datos | ForecastChart.tsx:44-55 · 88-90 |
| 9 | texto | «87% meta» (**sin espacio antes del `%`**) | `(ganado + ponderado) / meta × 100`; 0 si no hay meta | Con datos | ForecastChart.tsx:91-93 · opportunitiesService.ts:599-603 |
| 10 | texto | Cifra sobre la barra (fondo `bg-white/80` / `dark:bg-gray-800/80`) = `ganado + ponderado` | — | Con datos | ForecastChart.tsx:124-128 |
| 11 | texto | «Ganado: …» · «Pond.: …» · «Abierto: …» (`text-xs`, `justify-between`) | Detalle bajo cada barra | Con datos | ForecastChart.tsx:132-136 |
| 12 | stat | «Total Ganado» (verde) · «Total Ponderado» (azul) · «Total Abierto» (gris) | Suma de **todos** los periodos, no solo los 6 pintados | Con datos | ForecastChart.tsx:143-160 |
| 13 | cálculo | Agrupación: solo entran oportunidades con fecha de cierre esperada; semanal → domingo de la semana; mensual → mes; trimestral → trimestre; el ponderado usa la probabilidad de la etapa | — | Siempre | opportunitiesService.ts:556-583 |

`Card` que ocupa `lg:col-span-2`. **No hay tooltip**: todos los valores están siempre visibles en texto. Sin ejes ni rejilla.

### CE.10 Pronóstico › «Forecast» — escenarios `crm/pronostico/ForecastScenarios.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Escenarios de forecast» (`text-sm sm:text-base`) | Título | Siempre | ForecastScenarios.tsx:39 |
| 2 | texto | «12 oportunidades abiertas por $80.000.000» / «1 oportunidad abierta por …» | Subtítulo con plural | Con abiertas | ForecastScenarios.tsx:41-43 |
| 3 | texto | «Sin oportunidades abiertas en este pipeline» | Subtítulo alternativo. **Se calcula antes de comprobar la carga**, así que aparece mientras el cuerpo muestra el esqueleto (§G) | Sin abiertas | ForecastScenarios.tsx:43 |
| 4 | estado | Tres rectángulos `h-10` `animate-pulse` | Esqueleto interno | Mientras carga | ForecastScenarios.tsx:47-52 |
| 5 | estado | «Crea oportunidades y asígnales etapa para proyectar los tres escenarios.» (`py-4`) | Vacío | Sin abiertas y sin carga | ForecastScenarios.tsx:53-56 |
| 6 | stat | «Mejor caso» — barra `#2a78d6` / `dark:` `#3987e5` | Suma de las abiertas cuya etapa tiene probabilidad **≥ 50** | Con abiertas | ForecastScenarios.tsx:31 · 59-74 · forecastScenarios.ts:42 · 77 |
| 6a | texto | «Abiertas en etapas con probabilidad ≥ 50 %» | Regla escrita bajo la barra | Con abiertas | ForecastScenarios.tsx:31 |
| 7 | stat | «Esperado» — barra `#eb6834` / `dark:` `#d95926` | Suma de `importe × probabilidad de su etapa` (acotada 0-100) | Con abiertas | ForecastScenarios.tsx:32 · forecastScenarios.ts:46-49 · 76 |
| 7a | texto | «Suma de abiertas × probabilidad de su etapa» | Regla escrita | Con abiertas | ForecastScenarios.tsx:32 |
| 8 | stat | «Peor caso» — barra `#1baf7a` / `dark:` `#199e70` | Suma de las abiertas cuya etapa tiene probabilidad **≥ 90** | Con abiertas | ForecastScenarios.tsx:33 · forecastScenarios.ts:43 · 78 |
| 8a | texto | «Solo abiertas en etapas con probabilidad ≥ 90 %» | Regla escrita | Con abiertas | ForecastScenarios.tsx:33 |
| 9 | cálculo | Escala de las barras: máximo de los tres escenarios (mínimo 1); animación 0,25 s escalonada, anulada con `prefers-reduced-motion` | — | Con abiertas | ForecastScenarios.tsx:28 · 66-71 |

`Card` en 1 de 3 columnas desde `lg`. Lista semántica `<dl>`; las barras llevan `aria-hidden`: **el dato completo vive en el texto**.

### CE.11 Pronóstico › «Forecast» — «Pronóstico por Etapa» `crm/pronostico/ForecastByStage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Cinco rectángulos `h-10 sm:h-12` `animate-pulse` | Esqueleto | Mientras carga | ForecastByStage.tsx:42-54 |
| 2 | texto | «Pronóstico por Etapa» (**Title Case**) | Título | Siempre | ForecastByStage.tsx:59 |
| 3 | badge | Punto de color `w-2.5 h-2.5 sm:w-3 sm:h-3` | Color literal de la etapa (de la BD, no de una paleta) | Una por etapa | ForecastByStage.tsx:67-70 |
| 4 | texto | Nombre de la etapa (`truncate`) + «(7)» = oportunidades **abiertas** en esa etapa | — | Una por etapa | ForecastByStage.tsx:71-76 |
| 5 | stat | Monto bruto de la etapa | Suma de importes de las abiertas | Una por etapa | ForecastByStage.tsx:79-81 |
| 6 | texto | «× 60%» (**sin espacio antes del `%`**) | Probabilidad redondeada | Una por etapa | ForecastByStage.tsx:82-84 |
| 7 | texto | Barra por etapa (`h-6 sm:h-8`, canal gris): relleno claro (`opacity: 0.3`) = bruto; relleno sólido = ponderado; ambos en el color de la etapa | — | Una por etapa | ForecastByStage.tsx:89-104 |
| 8 | cálculo | Escala: máximo bruto entre todas las etapas (mínimo 1) | — | Siempre | ForecastByStage.tsx:40 · 93 · 101 |
| 9 | texto | Cifra ponderada sobre la barra = `bruto × probabilidad / 100` | — | Una por etapa | ForecastByStage.tsx:30 · 105-109 |
| 10 | stat | «Total Ponderado» (azul, `text-sm sm:text-lg` bold) · «Valor bruto en pipeline» (gris, `text-[10px] sm:text-sm`) | Sumas | Siempre | ForecastByStage.tsx:116-125 |
| 11 | estado | **Sin mensaje** | Sin etapas no se pinta nada salvo el pie con «Total Ponderado $0» (§G) | Pipeline sin etapas | ForecastByStage.tsx:62-126 |

`Card` en `lg:col-span-2`. La cabecera de cada fila es `justify-between` con el lado izquierdo `min-w-0` y el derecho `shrink-0`.

### CE.12 Pronóstico › pestaña «Cohortes» `revenueos/CohortTable.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Sin cohortes: ningún cliente con etapa «cliente» dado de alta en los últimos 24 meses. Las cohortes aparecen al convertir contactos en clientes.» | Vacío `p-8` | Sin cohortes | CohortTable.tsx:34-41 |
| 2 | texto | `caption` **visible**: «Clientes que volvieron a facturar 1, 3, 6 y 12 meses después de su alta, por mes de alta. «—» = el mes aún no ha cerrado. 128 clientes en total.» | — | Con cohortes | CohortTable.tsx:47-50 |
| 3 | tabla | «Cohorte» (mes de alta «sep 2025», `<th scope="row">`) · «Clientes» (tamaño, a la derecha) · **«M1» · «M3» · «M6» · «M12»** (cuatro horizontes fijos, centrados) | — | Con cohortes | CohortTable.tsx:53-59 · cohortModel.ts:21 |
| 4 | badge | «80 %» / «0 %» / «—» | Porcentaje redondeado con espacio antes del signo; «—» cuando el mes no ha cerrado o la cohorte está vacía | Por celda | cohortModel.ts:83-99 |
| 5 | cálculo | Retención: retenidos sobre el tamaño de la cohorte; **solo observable si ese mes ya cerró en la zona de la organización** | — | Siempre | cohortModel.ts:93-99 |
| 6 | cálculo | Intensidad de color: 0 sin dato · 1 `< 25 %` · 2 `25–49` · 3 `50–74` · 4 `≥ 75` | — | Siempre | cohortModel.ts:62-68 |
| 7 | cálculo | **Colores literales**: 0 `bg-transparent text-gray-500`; 1 `#cde2fb` (oscuro `#0d366b`); 2 `#9ec5f4` (oscuro `#184f95`); 3 `#5598e7` (oscuro `#256abf`, texto blanco); 4 `#1c5cab` texto blanco (oscuro `#3987e5`, texto casi negro) | — | Siempre | CohortTable.tsx:16-22 |
| 8 | tooltip | «12 de 30 clientes» o «Mes aún no cerrado» (`title` nativo) | — | Hover | CohortTable.tsx:73 |
| 9 | texto | «(12 de 30)» / « sin observar» (`sr-only`) | Acompaña a cada celda para lectores de pantalla | Siempre | CohortTable.tsx:76-83 |
| 10 | texto | Leyenda «0–24 %» · «25–49 %» · «50–74 %» · «75–100 %» (`<ul aria-label="Escala de color">`, muestras `h-3 w-5 rounded`) | — | Con cohortes | CohortTable.tsx:92-106 |

Tabla en `overflow-x-auto` (6 columnas). Cada celda es un `span` `inline-block w-full min-w-[3.25rem] rounded px-1.5 py-1 tabular-nums`. **El periodo de cohortes no es el del selector**: el servidor pide siempre 24 meses hacia atrás desde el fin del rango (`revenueOsService.ts:179`).

### CE.13 Pronóstico › «Matemática comercial» — las 7 métricas `revenueos/RevenueMathPanel.tsx`

Cada tarjeta muestra valor, fórmula y, si el valor es «Sin datos», el motivo en ámbar.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «ARPA» + fórmula «Ticket medio por factura pagada del periodo (ponderado por facturas)» | — | Siempre | RevenueMathPanel.tsx:35 · 105 |
| 1a | estado | «Sin facturas pagadas en el periodo» | Motivo | Sin dato | revenueMath.ts:153 |
| 2 | stat | «CAC» + fórmula «Gasto de adquisición del periodo ÷ oportunidades ganadas en el periodo» | — | Siempre | RevenueMathPanel.tsx:36 |
| 2a | estado | «Falta el gasto de adquisición (marketing + ventas) del periodo» · «Sin oportunidades ganadas en el periodo» | Motivos | Sin insumo · denominador cero | revenueMath.ts:159-161 |
| 3 | stat | «Churn mensual» («12,5 %») + fórmula «100 − retención M1 ponderada por cohorte» | Complemento de la retención M1 agregada, **solo** con cohortes cuyo M1 ya cerró | Siempre | RevenueMathPanel.tsx:37 · revenueMath.ts:100-121 |
| 3a | estado | «Ninguna cohorte de clientes con un mes completo de observación» | Motivo | Sin cohortes observables | revenueMath.ts:165 |
| 4 | stat | «LTV» + fórmula «ARPA × margen bruto × (1 ÷ churn)» | — | Siempre | RevenueMathPanel.tsx:38 |
| 4a | estado | «Falta el margen bruto (0–100 %)» · «Sin ARPA (no hay facturas pagadas)» · «Churn 0 % o sin observar: la vida del cliente no es acotable» | Tres motivos, en ese orden de prioridad | Sin dato | revenueMath.ts:169-173 |
| 5 | stat | «LTV / CAC» («3,4×», coma decimal + `×`) + fórmula «LTV ÷ CAC (saludable ≥ 3)» | — | Siempre | RevenueMathPanel.tsx:39-45 · formatters.ts:56-59 |
| 5a | badge | «✓ Saludable» (ratio ≥ 3) / «⚠ Por debajo de 3» (ratio < 3), `text-xs` en tinta de texto | — | Según el ratio | RevenueMathPanel.tsx:44 · 99-104 |
| 5b | estado | «Requiere LTV y CAC» | Motivo | Sin dato | revenueMath.ts:177 |
| 6 | stat | «Payback» («4,2 meses» o «Sin datos») + fórmula «CAC ÷ (ARPA × margen bruto), en meses» | — | Siempre | RevenueMathPanel.tsx:46 |
| 6a | estado | «Requiere CAC, ARPA y margen bruto» | Motivo | Sin dato | revenueMath.ts:180 |
| 7 | stat | «Retención neta de ingresos» — **siempre «Sin datos» hoy** + fórmula «(MRR inicial + expansión − contracción − churn) ÷ MRR inicial» | — | Siempre | RevenueMathPanel.tsx:47 |
| 7a | estado | «Requiere facturación por cliente en dos periodos; las RPC actuales no la exponen» | Motivo fijo: el valor está cableado a «Sin datos» | Siempre | revenueMath.ts:182-183 |

`<ul aria-label="Métricas de matemática comercial">` en `grid gap-3 sm:grid-cols-2`, dentro de una rejilla `lg:grid-cols-[2fr_1fr]` (bajo `lg`, métricas y formulario se apilan).

### CE.14 Pronóstico › «Matemática comercial» — insumos del periodo `revenueos/RevenueMathPanel.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Insumos del periodo» (h3) | Título de la tarjeta lateral | Siempre | RevenueMathPanel.tsx:113-115 |
| 2 | texto | «No existen en la base: se guardan en la configuración de la organización y alimentan CAC, LTV y payback. Oportunidades ganadas en el periodo (denominador del CAC): 14.» | Explicación con el denominador interpolado | Siempre | RevenueMathPanel.tsx:116-119 |
| 3 | campo | «Gasto de adquisición (marketing + ventas)» (`type="number"`, `inputMode="decimal"`, `min=0`, `step="any"`, **sin placeholder**) | Insumo del CAC | Siempre (deshabilitado sin permiso) | RevenueMathPanel.tsx:127-132 |
| 4 | campo | «Margen bruto (%)» (`type="number"`, `min=0`, `max=100`, `step="any"`, **sin placeholder**) | Insumo del LTV y del payback | Siempre (deshabilitado sin permiso) | RevenueMathPanel.tsx:133-138 |
| 5 | botón | «Guardar insumos» | Guarda ambos valores y recarga todo el dashboard | **Solo si el usuario puede editar** | RevenueMathPanel.tsx:144-147 |
| 6 | estado | «Guardando…» | Texto del botón durante el envío; botón y campos `disabled` | Mientras guarda | RevenueMathPanel.tsx:146 |
| 7 | estado | «Solo un administrador de la organización puede cambiar estos insumos.» | Sustituye al botón; los dos campos quedan deshabilitados | **El permiso lo resuelve el servidor** | RevenueMathPanel.tsx:148-150 · dashboard/route.ts:16-23 |
| 8 | estado | «Gasto ≥ 0 y margen entre 0 y 100.» | Validación de cliente; devuelve el foco al campo de gasto | Al enviar fuera de rango | RevenueMathPanel.tsx:63-67 · 139-143 |
| 9 | estado | Mensaje del servidor, p. ej. «acquisition_spend no puede ser menor que 0» / «gross_margin_pct no puede ser mayor que 100» / «Error 403» (`role="alert"`) | — | Fallo al guardar | RevenueMathPanel.tsx:78-83 · revenueInputs.ts:42-58 |
| 10 | toast | «Insumos guardados» / «CAC, LTV y payback se recalculan con los nuevos valores.» | — | Tras guardar | RevenueMathPanel.tsx:79 |
| 11 | texto | «Última actualización: 21/09/2026, 12:28» | **Fecha y hora en la zona de la organización** (`useFormatDate`) | Si ya se guardó alguna vez | RevenueMathPanel.tsx:151 |
| 12 | cálculo | Valores iniciales de la configuración de la organización; sin valor, campo vacío. El panel se remonta tras cada guardado | — | Al montar | RevenueMathPanel.tsx:55-56 · RevenueOsPage.tsx:154 |

Columna derecha (`1fr`) de `lg:grid-cols-[2fr_1fr]`; bajo `lg` se apila. Formulario `space-y-3`, inputs `h-9`. El botón usa el mismo azul que «Aplicar» del selector de rango.

**Nota para el diseño**: de los 213 controles de esta pantalla, **solo 21 son interactivos**. El resto son estados, textos, cálculos, gráficas, tablas, badges y tooltips. **No tiene diálogos, popovers, paginación ni atajos de teclado**, y su único toast es «Insumos guardados».

---

## D. Actividades, llamadas y plantillas

Rutas: `/app/crm/actividades` (+ `[id]`), `/app/crm/llamadas`, `/app/crm/plantillas` (+ `[id]`, `nueva`).

### D.1 Actividades — cabecera y acciones `components/crm/actividades/ActividadesPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | `aria-label` «Volver al CRM» (icono ArrowLeft) | `Link` a `/app/crm` | Siempre | ActividadesPage.tsx:229-233 |
| 2 | texto | «Actividades» (h1, icono CalendarClock sobre cuadro azul) | Título | Siempre | ActividadesPage.tsx:235-240 |
| 3 | texto | «Llamadas, correos, WhatsApp, reuniones y notas del equipo» | Subtítulo | Siempre | ActividadesPage.tsx:241-243 |
| 4 | botón | `aria-label` «Recargar» (icono RefreshCw, gira al cargar) | `loadData()` | Siempre; `disabled` con `isLoading` | ActividadesPage.tsx:247-256 |
| 5 | botón | «Nueva Actividad» (icono Plus, `bg-blue-600`) | Abre `ActividadForm` en creación | Siempre | ActividadesPage.tsx:257-260 |
| 6 | toggle | «Acciones rápidas» (icono Zap, outline, `aria-expanded`) | Muestra u oculta el panel D.2 | Siempre | ActividadesPage.tsx:261-269 |

Cabecera `flex-col` → `md:flex-row` (768). En móvil los tres botones caen bajo el título. Página `p-3 sm:p-4 md:p-6`.

### D.2 Actividades — panel «Acciones rápidas» `ActividadesPage.tsx` · `components/crm/shared/QuickActionsBar.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Contactar ahora (llamada, correo, WhatsApp, reunión, tarea o nota)» (h2) | Encabeza el panel | Solo con el toggle D.1-6 activo | ActividadesPage.tsx:276-278 |
| 2 | texto | «Selecciona un cliente para activar las acciones» | Etiqueta del selector | Panel abierto | ActividadesPage.tsx:281-283 |
| 3 | campo | `SearchSelect` placeholder «Sin cliente» · buscador «Buscar cliente...» · opción nula «Sin cliente» | Elige el destinatario (máx. 200 cargados) | Panel abierto | ActividadesPage.tsx:284-292 |
| 4 | estado | «Selecciona un cliente para habilitar Llamar, Email, WhatsApp, Reunión, Tarea y Nota.» (cursiva, gris) | Aviso sin cliente | Panel abierto y sin cliente | ActividadesPage.tsx:306-310 |
| 5 | menú | Trigger «Llamar» | Modos de llamada | Panel abierto con cliente | QuickActionsBar.tsx:180-182 · quickActionsConfig.ts:45-53 |
| 6 | menú | «Desde el navegador» | Softphone | `disabled` con motivo si no hay softphone, no está registrado, o el cliente no tiene teléfono | quickActionsConfig.ts:88-93 |
| 7 | menú | «Desde mi celular» | Abre `MobileCallDialog` (D.14) | `disabled` sin teléfono | quickActionsConfig.ts:95-96 |
| 8 | menú | «Agente IA» | — | **Siempre deshabilitado**: «Disponible al finalizar F6 (agentes de voz)» | quickActionsConfig.ts:97 |
| 9 | botón | «Email» | `ComposeEmailDialog` | Con cliente; `disabled` sin correo | QuickActionsBar.tsx:206-230 · 236-238 |
| 10 | botón | «WhatsApp» | `ComposeWhatsAppDialog` | Con cliente; requiere teléfono | QuickActionsBar.tsx:239-241 |
| 11 | botón | «Reunión» | `MeetingDialog` | Con cliente | QuickActionsBar.tsx:242-244 |
| 12 | botón | «Tarea» | `TaskDialog` en modo `compact` | Con cliente | QuickActionsBar.tsx:245-247 |
| 13 | botón | «Nota» | `QuickNoteDialog` | Con cliente | QuickActionsBar.tsx:248-250 |
| 14 | tooltip | Motivo de bloqueo por acción | Explica el `disabled` | Hover | QuickActionsBar.tsx:184-186 · 231-232 |

Tarjeta blanca `p-4` sobre los filtros. Fila de botones fantasma con icono, envuelve en pantallas estrechas. Al completar una acción se recarga la lista (`onActionCompleted`).

### D.3 Actividades — KPIs `components/crm/actividades/ActividadesStats.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «Total» (CalendarClock, azul) | Todas las actividades con los filtros aplicados **menos** el de tipo | Siempre | ActividadesStats.tsx:18 · 46-74 |
| 2 | stat | «Llamadas» (Phone, verde) | `activity_type = 'call'` | Siempre | ActividadesStats.tsx:19 |
| 3 | stat | «Correos» (Mail, azul) | `'email'` | Siempre | ActividadesStats.tsx:20 |
| 4 | stat | «WhatsApp» (MessageCircle, esmeralda) | `'whatsapp'` | Siempre | ActividadesStats.tsx:21 |
| 5 | stat | «Reuniones» (Users, morado) | `'meeting'` | Siempre | ActividadesStats.tsx:22 |
| 6 | stat | «Notas» (StickyNote, amarillo) | `'note'` | Siempre | ActividadesStats.tsx:23 |
| 7 | stat | «Tareas» (CheckSquare, índigo) | `'task'` | Siempre | ActividadesStats.tsx:24 |
| 8 | estado | 3 barras `animate-pulse` por tarjeta | Carga | `isLoading` | ActividadesStats.tsx:28-44 |
| 9 | cálculo | — | 7 consultas `count: 'exact', head: true` en paralelo sobre `activities` | Cada carga | ActividadesService.ts:270-300 |

Rejilla `grid-cols-2 sm:grid-cols-3 lg:grid-cols-7`. Número `text-lg` → `sm:text-2xl`; etiqueta `text-[10px]` → `sm:text-xs` con `truncate`.

### D.4 Actividades — filtros `components/crm/actividades/ActividadesFiltros.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | placeholder «Buscar en notas...» · `aria-label` «Buscar en notas» (icono Search) | `ilike` sobre `activities.notes`, 400 ms de retardo; vuelve a la página 1 | Siempre | ActividadesFiltros.tsx:112-123 · 55-63 |
| 2 | campo | Select placeholder «Tipo» | «Todos los tipos» · «Llamada» · «Email» · «Reunión» · «Nota» · «Visita» · «WhatsApp» · «Sistema» · «SMS» · «Llamada IA» · «Tarea» | Siempre | ActividadesFiltros.tsx:126-143 · types.ts:108-177 |
| 3 | campo | Select placeholder «Usuario» | «Todos los usuarios» + nombre o correo de cada miembro | Siempre | ActividadesFiltros.tsx:146-163 |
| 4 | botón | Popover «Desde» / `dd/MM/yyyy` (icono Calendar) | Calendario en español; fija `date_from` | Siempre | ActividadesFiltros.tsx:166-185 |
| 5 | botón | Popover «Hasta» / `dd/MM/yyyy` | Fija `date_to` (el servicio lo lleva al fin del día) | Siempre | ActividadesFiltros.tsx:188-207 · Service:82 |
| 6 | botón | (icono X, **sin texto ni `aria-label`**) | Limpia todos los filtros | Solo con algún filtro activo | ActividadesFiltros.tsx:210-219 |

Tarjeta blanca `p-4`; fila `flex-col` → `lg:flex-row` (1024). Buscador `flex-1`; selects `w-full lg:w-48`; fechas `w-full lg:w-40`.

### D.5 Actividades — tabla `components/crm/actividades/ActividadesTable.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | tabla | «Actividad» | Tipo, sentido, duración y resumen | Siempre | ActividadesTable.tsx:157 |
| 2 | tabla | «Con quién» | Cliente u oportunidad relacionada | Desde `md` (768) | ActividadesTable.tsx:158 |
| 3 | tabla | «Resultado» | `outcome` traducido | Desde `lg` (1024) | ActividadesTable.tsx:159 |
| 4 | tabla | «Registró» | Autor con avatar de iniciales | Desde `lg` | ActividadesTable.tsx:160 |
| 5 | tabla | «Cuándo» | `occurred_at` | Desde `sm` (640) | ActividadesTable.tsx:161 |
| 6 | tabla | — (`w-10 sm:w-12`, sin cabecera) | Columna del menú «…» | Siempre | ActividadesTable.tsx:162 |
| 7 | badge | «Llamada» · «Email» · «Reunión» · «Nota» · «Visita» · «WhatsApp» · «Sistema» · «SMS» · «Llamada IA» · «Tarea» | Color e icono por tipo (`ACTIVITY_TYPE_CONFIG`) | Siempre | ActividadesTable.tsx:197-199 · types.ts:101-178 |
| 8 | chip | «Entrante» (ArrowDownLeft) / «Saliente» (ArrowUpRight), con el mismo `title` | Sentido (`channel`) | Si `channel` es `inbound` u `outbound` | ActividadesTable.tsx:200-208 |
| 9 | texto | «· 45 s» / «· 2 min 5 s» / «· 1 h 30 min» | Duración formateada | Si hay `duration_seconds` | ActividadesTable.tsx:209-211 · types.ts:264-273 |
| 10 | texto | Notas, o «Sin descripción» en gris | Resumen a 2 líneas (`line-clamp-2`) | Siempre | ActividadesTable.tsx:213-215 |
| 11 | texto | «{dd/mm/aaaa hh:mm} · {relacionado}» | Línea compacta solo móvil | Bajo `sm` (640) | ActividadesTable.tsx:216-219 |
| 12 | botón | Nombre del cliente (icono User) u oportunidad (Briefcase), azul, subrayado al pasar | `/app/crm/clientes/{id}` o `/app/crm/oportunidades/{id}`; corta a 160 px | Si hay relación; si no, «—» | ActividadesTable.tsx:225-242 |
| 13 | badge | «Contactado» · «No contestó» · «Buzón de voz» · «Número equivocado» · «Pidió que le llamen luego» · «No interesado» · «Enviado» · «Respondió» · «Rebotado» · «Sin respuesta» · «Se realizó» · «Agendada» · «No asistió» · «Reprogramada» · «Cancelada» · «No estaba» | `variant="secondary"` | Si hay `outcome`; si no, «—» | ActividadesTable.tsx:245-253 · types.ts:211-248 |
| 14 | texto | Iniciales en círculo gris + nombre (máx. 120 px), `title` con el correo | Autor | Si hay autor | ActividadesTable.tsx:256-265 |
| 15 | texto | «Sistema» | Fallback del autor | Si `user_id` es nulo | ActividadesTable.tsx:267 |
| 16 | texto | Fecha `es-ES` `dd/mm/aaaa hh:mm`, o «—» | Momento | Desde `sm` | ActividadesTable.tsx:272-276 · 72-82 |
| 17 | atajo | Clic en cualquier parte de la fila | Abre el detalle | Siempre | ActividadesTable.tsx:184-188 |

`overflow-x-auto`; la tabla degrada ocultando columnas (`hidden sm:` / `md:` / `lg:table-cell`) y recupera fecha y relacionado dentro de la primera celda en móvil.

### D.6 Actividades — menú «…» por fila `ActividadesTable.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | Trigger `aria-label` «Acciones de la actividad» (MoreVertical) | Abre el menú, alineado a la derecha | Siempre | ActividadesTable.tsx:279-289 |
| 2 | menú | «Ver detalle» (Eye) | `/app/crm/actividades/{id}` | Siempre | ActividadesTable.tsx:291-300 |
| 3 | menú | «Abrir cliente» / «Abrir oportunidad» (User / Briefcase) | Va a la ficha relacionada | Si hay `related_id` con tipo conocido | ActividadesTable.tsx:301-316 |
| 4 | menú | «Editar» (Edit) | Abre `ActividadForm` cargado | Siempre | ActividadesTable.tsx:317-326 |
| 5 | menú | «Duplicar» (Copy) | Copia con la fecha de hoy vía `POST /api/crm/activities` | Siempre | ActividadesTable.tsx:327-336 · Service:250-266 |
| 6 | menú | «Eliminar» (Trash2, rojo) | Abre la confirmación D.9 | Siempre, tras separador | ActividadesTable.tsx:337-347 |

### D.7 Actividades — estados y paginación `ActividadesPage.tsx` · `ActividadesTable.tsx` · `ActividadesPagination.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | 5 `Skeleton` de `h-12` | Carga | `isLoading` | ActividadesTable.tsx:110-118 |
| 2 | estado | «Todavía no hay actividades» + «Registra llamadas, correos, WhatsApp, reuniones y notas para tener el historial del cliente en un solo sitio.» (icono StickyNote) | Vacío real | Sin filas y sin filtros | ActividadesTable.tsx:120-132 |
| 3 | estado | «Ninguna actividad coincide con los filtros» + «Prueba con otro rango de fechas, otro tipo o quita los filtros.» | Vacío por filtro | Sin filas y con filtros | ActividadesTable.tsx:126-131 |
| 4 | botón | «Quitar filtros» (outline) | Limpia y vuelve a la página 1 | Solo en el vacío con filtros | ActividadesTable.tsx:134-138 |
| 5 | botón | «Nueva actividad» (icono CalendarPlus, azul) | Abre el diálogo de creación | En ambos vacíos | ActividadesTable.tsx:139-144 |
| 6 | estado | «No se pudo cargar» + mensaje (icono AlertTriangle, caja roja, `role="alert"`) | Sustituye a KPIs, filtros, tabla y paginación | Si falla cualquiera de las 5 consultas | ActividadesPage.tsx:315-316 · LoadErrorState.tsx:32-55 |
| 7 | botón | «Reintentar» (RefreshCw) | `loadData()` | Dentro del error | LoadErrorState.tsx:44-54 |
| 8 | texto | «Mostrar» … «por página» | Envuelven el selector | Si `totalItems > 0` | ActividadesPagination.tsx:75-96 |
| 9 | campo | Select 10 · 20 · 30 · 50 · 100 (por defecto 10) | Cambia el tamaño y vuelve a la 1 | Ídem | ActividadesPagination.tsx:78-92 |
| 10 | texto | «Mostrando {a} - {b} de {n} actividades» (cifras en negrita) | Rango | Ídem | ActividadesPagination.tsx:99-107 |
| 11 | botón | `title` «Primera página» (ChevronsLeft) | Página 1 | `disabled` en la primera | ActividadesPagination.tsx:112-121 |
| 12 | botón | `title` «Página anterior» (ChevronLeft) | −1 | `disabled` en la primera | ActividadesPagination.tsx:124-133 |
| 13 | paginación | `1 … 4 5 6 … 20` (activa en azul sólido) | Máx. 5 números + extremos y «...» | Desde `sm` (640) | ActividadesPagination.tsx:136-168 · 34-64 |
| 14 | texto | «{n} / {total}» | Indicador compacto | Bajo `sm` | ActividadesPagination.tsx:170-175 |
| 15 | botón | `title` «Página siguiente» (ChevronRight) | +1 | `disabled` en la última | ActividadesPagination.tsx:177-187 |
| 16 | botón | `title` «Última página» (ChevronsRight) | Última | `disabled` en la última | ActividadesPagination.tsx:189-199 |
| 17 | cálculo | — | Si al filtrar o borrar la página deja de existir, retrocede a la última válida | Automático | ActividadesPage.tsx:126-131 |

La paginación es `flex-col sm:flex-row`; en móvil «Mostrando…» va primero (`order-first sm:order-none`).

### D.8 Diálogo «Nueva actividad» / «Editar actividad» `components/crm/actividades/ActividadForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | Título «Nueva actividad» / «Editar actividad» | Según haya actividad cargada | Siempre | ActividadForm.tsx:234-237 |
| 2 | texto | «Registra algo que ya pasó: queda en el timeline del cliente o de la oportunidad.» | Descripción | Siempre | ActividadForm.tsx:238-240 |
| 3 | texto | «Tipo de actividad *» | Encabeza la rejilla de tipos | Siempre | ActividadForm.tsx:246 |
| 4 | chip | 8 tarjetas `aria-pressed`: «Llamada» · «Email» · «WhatsApp» · «Reunión» · «Nota» · «Tarea» · «Visita» · «SMS» | Selecciona el tipo; la activa en azul. **«Sistema» y «Llamada IA» no se ofrecen** (los escribe el sistema) | Siempre | ActividadForm.tsx:247-270 · types.ts:184-193 |
| 5 | campo | Select «Relacionada con *» · «Cliente» / «Oportunidad» | Cambia el tipo de vínculo y limpia el id | Siempre | ActividadForm.tsx:275-292 |
| 6 | campo | `SearchSelect` «Cliente *» / «Oportunidad *» · placeholder «Selecciona cliente» / «Selecciona oportunidad» · buscador «Buscar...» · opción nula «Sin seleccionar» | Ficha a la que cuelga la actividad | Siempre | ActividadForm.tsx:293-306 |
| 7 | estado | «Las tareas se crean en el diálogo de tarea» + «Una tarea es trabajo pendiente con responsable, vencimiento y prioridad, no un registro de algo ya ocurrido. Se guarda en Tareas y aparece igual en el timeline.» (caja índigo) | **Sustituye a todo el resto del formulario** | Solo con el tipo «Tarea» | ActividadForm.tsx:309-316 |
| 8 | campo | Popover «Fecha y hora» · valor `d MMM yyyy 'a las' HH:mm` en español (Calendar) | Calendario con los días futuros deshabilitados | Cualquier tipo salvo «Tarea» | ActividadForm.tsx:321-350 |
| 9 | campo | `input type="time"` dentro del popover | Hora y minutos sobre el día elegido | Con el calendario abierto | ActividadForm.tsx:351-363 |
| 10 | botón | «Ahora» (icono Clock) | Fecha y hora actuales | Cualquier tipo salvo «Tarea» | ActividadForm.tsx:366-374 |
| 11 | campo | Select «Sentido» · «Saliente» (por defecto) / «Entrante» | Escribe `activities.channel` | Tipos «Llamada», «Email», «WhatsApp», «SMS» | ActividadForm.tsx:379-392 · types.ts:196 |
| 12 | campo | Select «Resultado» · placeholder «Sin resultado» · «Sin especificar» + las del tipo (ver D.5-13) | Escribe `activities.outcome` | Tipos con catálogo de resultado | ActividadForm.tsx:397-414 |
| 13 | campo | «Duración (minutos)» · placeholder «15» · min 0, máx 1440 | Se guarda como `duration_seconds` | Tipos «Llamada», «Reunión», «Visita», «Llamada IA» | ActividadForm.tsx:417-435 · types.ts:199 |
| 14 | campo | «Asunto» · placeholder «Propuesta comercial» | `metadata.subject` | Solo tipo «Email» | ActividadForm.tsx:439-452 |
| 15 | campo | «Lugar o enlace» · placeholder «Oficina del cliente / meet.google.com/…» | `metadata.location` | Tipos «Reunión» y «Visita» | ActividadForm.tsx:455-468 |
| 16 | campo | Textarea «Qué pasó *» (o «Nota *» con el tipo «Nota») · placeholder «Habló con el gerente, pide propuesta antes del viernes…» con «Llamada», si no «Describe la actividad…» · 4 filas | Cuerpo de `activities.notes` | Cualquier tipo salvo «Tarea» | ActividadForm.tsx:471-487 |
| 17 | estado | «Elige el cliente de la actividad.» / «Elige la oportunidad de la actividad.» | Falta el vínculo | Al enviar sin `related_id` | ActividadForm.tsx:187-189 |
| 18 | estado | «Escribe al menos una nota de lo ocurrido.» | Ni notas ni asunto | Al enviar vacío | ActividadForm.tsx:191-193 |
| 19 | estado | «La fecha no puede estar en el futuro: la actividad ya ocurrió.» | El endpoint tolera 5 min de desfase | Al enviar con fecha futura | ActividadForm.tsx:195-199 |
| 20 | estado | «La duración debe estar entre 0 y 1440 minutos.» | Validación numérica | Al enviar duración inválida | ActividadForm.tsx:200-204 |
| 21 | botón | «Cancelar» (outline) | Cierra | Siempre; `disabled` al guardar | ActividadForm.tsx:498-506 |
| 22 | botón | «Registrar actividad» / «Actualizar» / «Abrir diálogo de tarea» / «Guardando...» (Loader2) | Envía; el texto depende de modo, tipo y estado | Siempre | ActividadForm.tsx:507-520 |

`DialogContent` `sm:max-w-[560px]`, alto máximo `90vh` con scroll. Rejilla de tipos fija en `grid-cols-4` (2 filas de 4). Fecha/sentido y resultado/duración en `grid-cols-1 sm:grid-cols-2`.

### D.9 Actividades — diálogo de borrado y toasts `ActividadesPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «¿Eliminar actividad?» | — | Al pulsar «Eliminar» en el menú de fila | ActividadesPage.tsx:378-381 |
| 2 | texto | «Esta acción no se puede deshacer. La actividad será eliminada permanentemente.» | Descripción | Ídem | ActividadesPage.tsx:382-384 |
| 3 | botón | «Cancelar» | Cierra | Ídem | ActividadesPage.tsx:387-389 |
| 4 | botón | «Eliminar» (`bg-red-600`) | `DELETE` acotado por `organization_id` y recarga | Ídem | ActividadesPage.tsx:390-395 · Service:242-249 |
| 5 | toast | «Elige antes el cliente o la oportunidad» · «La tarea queda ligada a esa ficha.» | Bloquea el paso al diálogo de tarea | Tipo «Tarea» sin relación | ActividadesPage.tsx:157-163 |
| 6 | toast | «Actividad duplicada» · «Se creó una copia con la fecha de hoy.» | — | Duplicado con éxito | ActividadesPage.tsx:173 |
| 7 | toast | «No se pudo duplicar la actividad» + detalle | — | Fallo | ActividadesPage.tsx:176-180 |
| 8 | toast | «Actividad eliminada» / «No se pudo eliminar la actividad» + detalle | — | Tras borrar | ActividadesPage.tsx:188 · 190-194 |
| 9 | toast | «Actividad actualizada» / «Actividad registrada» / «No se pudo guardar la actividad» + detalle | — | Tras guardar | ActividadesPage.tsx:206 · 209 · 214-218 |

### D.10 `/app/crm/actividades/[id]` — detalle `components/crm/actividades/id/ActividadDetalle.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (ArrowLeft, fantasma; **sin `aria-label`**) | Vuelve a `/app/crm/actividades` | Siempre | ActividadDetalle.tsx:192-199 |
| 2 | texto | Etiqueta del tipo como h1: «Llamada» · «Email» · «Reunión» · «Nota» · «Visita» · «WhatsApp» · «Sistema» · «SMS» · «Llamada IA» · «Tarea» | Título con el icono del tipo sobre su color | Siempre | ActividadDetalle.tsx:200-207 |
| 3 | texto | «Detalle de actividad» | Subtítulo | Siempre | ActividadDetalle.tsx:208-210 |
| 4 | botón | «Editar» (icono Edit, outline) | Abre `ActividadForm` | Siempre | ActividadDetalle.tsx:215-222 |
| 5 | botón | «Eliminar» (icono Trash2, borde y texto rojos) | Abre la confirmación | Siempre | ActividadDetalle.tsx:223-230 |
| 6 | texto | Tarjeta «Descripción» + notas o «Sin descripción» | Respeta saltos de línea (`whitespace-pre-wrap`) | Siempre | ActividadDetalle.tsx:239-248 |
| 7 | texto | Tarjeta «Información adicional» + **volcado JSON en `<pre>`** | Muestra `activities.metadata` sin formatear | Si `metadata` tiene claves | ActividadDetalle.tsx:252-265 |
| 8 | texto | Tarjeta «Detalles» | Cabecera de la barra lateral | Siempre | ActividadDetalle.tsx:272-276 |
| 8a | texto | «Tipo» + etiqueta con su icono y color | — | Siempre | ActividadDetalle.tsx:279-289 |
| 8b | texto | «Fecha» + `PPP 'a las' HH:mm` en español | `occurred_at` | Siempre | ActividadDetalle.tsx:294-304 |
| 8c | texto | «Sentido» + «Entrante» / «Saliente» | `channel` | Si es `inbound` u `outbound` | ActividadDetalle.tsx:306-326 |
| 8d | texto | «Resultado» + etiqueta traducida (icono Target) | `outcome` | Si hay `outcome` | ActividadDetalle.tsx:328-344 |
| 8e | texto | «Duración» + `45 s` / `2 min 5 s` / `1 h 30 min` (icono Timer) | — | Si hay duración | ActividadDetalle.tsx:346-362 |
| 8f | texto | «Registró» + nombre o correo (icono User, `truncate`) | — | Si hay autor | ActividadDetalle.tsx:364-380 |
| 8g | texto | «Creada» + fecha `PPP` sin hora (icono Clock) | `created_at` | Siempre | ActividadDetalle.tsx:384-395 |
| 9 | texto | Tarjeta «Relacionado con» | — | Si hay cliente u oportunidad | ActividadDetalle.tsx:400-406 |
| 9a | botón | Bloque «Cliente» + nombre + correo (caja azul, icono User) | `/app/crm/clientes/{id}`. **Es un `div` con `onClick`**: sin teclado, sin pestaña nueva | `related_type = 'customer'` | ActividadDetalle.tsx:408-428 |
| 9b | botón | Bloque «Oportunidad» + título (caja morada, icono Briefcase) | `/app/crm/oportunidades/{id}`, mismo problema | `related_type = 'opportunity'` | ActividadDetalle.tsx:430-445 |
| 10 | estado | `PageHeaderSkeleton` + 3 tarjetas de stat + 2 tarjetas | Carga | `isLoading` | ActividadDetalle.tsx:162-170 |
| 11 | estado | «No se pudo cargar» + mensaje + «Reintentar» | Sustituye toda la pantalla | Si falla la carga | ActividadDetalle.tsx:172-178 |
| 12 | toast | «Actividad no encontrada» · «Puede haberse eliminado o no pertenece a esta organización.» | Avisa y redirige a la lista | Si el id no devuelve fila | ActividadDetalle.tsx:107-114 |
| 13 | diálogo | «¿Eliminar actividad?» + «Esta acción no se puede deshacer. La actividad será eliminada permanentemente.» + «Cancelar» / «Eliminar» | Borra y vuelve a la lista | Al pulsar «Eliminar» | ActividadDetalle.tsx:464-486 |
| 14 | toast | «Actividad actualizada» · «Los cambios se han guardado correctamente» / «No se pudo actualizar la actividad» / «No se pudo eliminar la actividad» + detalle | — | Tras editar o borrar | ActividadDetalle.tsx:129-132 · 135-139 · 154-158 |

Rejilla `grid-cols-1 lg:grid-cols-3`; la columna principal ocupa 2 de 3. Cabecera `flex-col sm:flex-row`.

### D.11 Llamadas — cabecera y KPIs del día `app/app/crm/llamadas/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Llamadas» (h1, icono Phone azul de 24 px) | Título | Siempre | llamadas/page.tsx:125-128 |
| 2 | texto | «Historial, grabaciones y análisis. El softphone está en la esquina inferior derecha (Ctrl+Shift+C para llamar).» | Subtítulo con el atajo global | Siempre | llamadas/page.tsx:129 |
| 3 | stat | «Llamadas hoy» (Phone, azul) | Llamadas del día (**tope de 200 registros**) | Siempre | llamadas/page.tsx:43 · 80-92 |
| 4 | stat | «Duración promedio» (Clock, morado) · formato `0s` / `45s` / `3m 12s` | Media sobre las llamadas con duración > 0 | Siempre | llamadas/page.tsx:44 · 28-33 |
| 5 | stat | «Perdidas» (PhoneMissed, rojo) | Estados `no_answer`, `busy`, `canceled`, `failed`, `voicemail` | Siempre | llamadas/page.tsx:45 · 91 |
| 6 | estado | Barra `animate-pulse` en lugar del número | Carga | Mientras cargan las estadísticas | llamadas/page.tsx:59 |
| 7 | estado | «No se pudieron cargar las estadísticas de hoy» + mensaje + «Reintentar» | Sustituye a las 3 tarjetas; la tabla sigue visible | Si falla `GET /api/crm/calls` de hoy | llamadas/page.tsx:132-138 |
| 8 | atajo | `?call={id}` en la URL | Abre esa llamada ya expandida | Enlace profundo | llamadas/page.tsx:73 · CallsTable.tsx:89-91 |
| 9 | atajo | `Ctrl+Shift+C` | Llama al contacto de la fila enfocada (`data-phone`) | Con el softphone montado | CallRow.tsx:7-12 · 100-103 |

Rejilla `grid-cols-1 sm:grid-cols-3`. Página `p-4 sm:p-6 lg:p-8`. Estadísticas y tabla se refrescan al terminar una llamada y cerrar el diálogo de disposición.

### D.12 Llamadas — filtros y tabla `components/voice/CallsTable.tsx` · `components/voice/CallRow.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Historial de llamadas» + «({n})» en gris | Título con el total | El contador solo si `count > 0` | CallsTable.tsx:100-103 |
| 2 | botón | «Actualizar» (RefreshCw que gira, outline, `size="sm"`) | Relanza la consulta | Siempre; `disabled` al cargar | CallsTable.tsx:104-107 |
| 3 | campo | placeholder «Buscar número…» · `aria-label` «Buscar por número» (`type="search"`, `w-40`) | Filtro `q` | Siempre | CallsTable.tsx:111 |
| 4 | campo | Select `aria-label` «Dirección» · «Todas» · «Entrantes» · «Salientes» | Filtro `direction` | Siempre | CallsTable.tsx:112-116 |
| 5 | campo | Select `aria-label` «Modo» · «Todos los modos» · «Navegador» · «Mi celular» · «Agente IA» · «Manual» · «Entrante» | Filtro `mode` | Siempre | CallsTable.tsx:117-124 · CallRow.tsx:62-68 |
| 6 | campo | Select `aria-label` «Resultado» · «Todos los resultados» · «Contactado» · «No contesta» · «Buzón de voz» · «Ocupado» · «Número inválido» · «Pidió que lo llamen después» | Filtro `outcome` | Siempre | CallsTable.tsx:125-132 · callDispositionService.ts:21-28 |
| 7 | campo | `type="date"` `aria-label` «Desde» (`w-36`) | `from_date` a las 00:00:00 UTC | Siempre | CallsTable.tsx:133 · 68 |
| 8 | campo | `type="date"` `aria-label` «Hasta» | `to_date` a las 23:59:59 UTC | Siempre | CallsTable.tsx:134 · 69 |
| 9 | toggle | «Mis llamadas» | `user_id=me` | Siempre | CallsTable.tsx:135-137 |
| 10 | toggle | «Con grabación» | `has_recording=true` | Siempre | CallsTable.tsx:138-140 |
| 11 | botón | «Limpiar» (fantasma, gris) | Devuelve todos los filtros al valor vacío | Si algún filtro difiere del inicial | CallsTable.tsx:141-145 |
| 12 | tabla | Columnas: (chevron `w-8`) · «Fecha» (`w-[120px]`) · «Tipo» · «Contacto» · «Usuario» · «Duración» (`w-[80px]`) · «Resultado» · «Estado» · (icono Mic, `aria-label` «Grabación», `w-[70px]`, centrada) | 9 columnas | Siempre | CallsTable.tsx:152-162 |
| 13 | texto | Fecha `es-CO` `dd/mm hh:mm`, o «—» | `started_at` o `created_at` | Siempre | CallRow.tsx:25-29 |
| 14 | texto | Icono de dirección (PhoneIncoming azul / PhoneOutgoing verde) + icono de modo con `title` | «Tipo» | Siempre | CallRow.tsx:107-113 |
| 15 | texto | Nombre del cliente o el número en monoespaciada, y debajo el número y «› {oportunidad}» | «Contacto» | Siempre | CallRow.tsx:114-130 |
| 16 | badge | «Marcando» (gris) · «Timbrando» (ámbar) · «En curso» (info) · «Completada» (verde) · «Fallida» (rojo) · «Ocupado» (rojo) · «Sin respuesta» (gris) · «Cancelada» (gris) · «Buzón» (info) | «Estado» | Siempre | CallRow.tsx:36-58 · 134-138 |
| 17 | botón | `title`/`aria-label` «Llamar a {nombre} (Ctrl+Shift+C)» · «Llamar a {nombre} desde mi celular» · «Sin número» · el motivo de bloqueo | Softphone, o `MobileCallDialog` si la política resuelve «móvil» | En «Contacto»; `disabled` sin número, con llamada en curso o sin softphone | CallRow.tsx:117-124 · CallButton.tsx:86-107 |
| 18 | botón | `aria-label` «Reproducir grabación» / «Pausar grabación» | Reproduce el audio | Solo con grabación en estado `ready` | CallRow.tsx:140-141 · CallPlayer.tsx:164-176 |
| 19 | texto | «…» con `title` «Procesando grabación…» | Grabación sin procesar | Estado `processing` | CallRow.tsx:142-143 |
| 20 | texto | «—» (con `title` «Grabación deshabilitada» si aplica) | Sin grabación | Resto | CallRow.tsx:145 · CallPlayer.tsx:169-175 |
| 21 | badge | Distintivo de consentimiento no verificado (icono + texto, nunca solo color) | Consentimiento por anuncio no verificado | Junto al reproductor | CallPlayer.tsx:180-188 |
| 22 | atajo | `Enter` o `Espacio` sobre la fila | Expande o pliega (`tabIndex={0}`, `aria-expanded`) | Siempre | CallRow.tsx:88-104 |
| 23 | estado | 5 filas × 9 celdas con barra `animate-pulse` | Carga | `isLoading` | CallsTable.tsx:166-175 |
| 24 | estado | «No se pudieron cargar las llamadas» + mensaje + «Reintentar» (`colSpan=9`) | Error | Si falla `GET /api/crm/calls` | CallsTable.tsx:176-186 |
| 25 | estado | «Aún no hay llamadas. Llama desde el pipeline, la oportunidad o el softphone.» (icono PhoneOutgoing al 40 %) | Vacío, sin acción directa | Sin filas ni error | CallsTable.tsx:187-193 |

Filtros en `flex-wrap items-end gap-2` con borde inferior, `role="search"` y `aria-label` «Filtros de llamadas». `CardContent` con `overflow-x-auto` y sin padding: en móvil la tabla se desplaza, **no oculta columnas**. La fila expandida ocupa `colSpan={9}`.

### D.13 Llamadas — fila expandida `CallLinkPanel.tsx` · `CallPlayer.tsx` · `CallTranscriptPanel.tsx` · `CallAnalysisPanel.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Vinculación:» | Encabeza los chips de estado | Solo si falta cliente o falta oportunidad | CallLinkPanel.tsx:171 · 359 |
| 2 | chip | Nombre del cliente o «Cliente vinculado» (verde, Check) / «Sin cliente» (ámbar, X) | Estado del vínculo | En el panel | CallLinkPanel.tsx:172-181 |
| 3 | chip | «Oportunidad» (verde) / «Sin oportunidad» (ámbar) | Estado del vínculo | En el panel | CallLinkPanel.tsx:182-191 |
| 4 | botón | «Vincular cliente» (Search) | Modo buscador | Sin cliente | CallLinkPanel.tsx:196-198 |
| 5 | botón | «Crear cliente» (UserPlus) | Formulario de alta | Sin cliente | CallLinkPanel.tsx:199-201 |
| 6 | botón | «Crear oportunidad» (Briefcase) | Formulario de oportunidad | Con cliente y sin oportunidad | CallLinkPanel.tsx:204-208 |
| 7 | campo | placeholder «Nombre o teléfono…» · `aria-label` «Buscar cliente» | Busca clientes de la organización | Modo buscador | CallLinkPanel.tsx:218-223 |
| 8 | estado | «Sin resultados.» + enlace «Crear cliente nuevo» | Vacío | Búsqueda sin coincidencias | CallLinkPanel.tsx:257 |
| 9 | campo | «Nombre», «Apellido», «Teléfono» | Alta rápida, con el teléfono de la llamada precargado | Modo alta | CallLinkPanel.tsx:268-292 |
| 10 | campo | «Nombre de la oportunidad» (placeholder «Ej: Venta Plan Business»), «Pipeline» (placeholder «Selecciona un pipeline»), «Etapa» (placeholder «Selecciona una etapa») | Alta de oportunidad ligada a la llamada | Modo oportunidad | CallLinkPanel.tsx:311-350 |
| 11 | estado | «Cargando pipelines…» / «Cargando etapas…» | — | Mientras llegan los catálogos | CallLinkPanel.tsx:324 · 342 |
| 12 | botón | «Crear oportunidad» / «Guardando…» + «Cancelar» | — | Modo oportunidad; `disabled` sin nombre, pipeline o etapa | CallLinkPanel.tsx:355-368 |
| 13 | botón | `aria-label` «Reproducir grabación» / «Pausar grabación» | — | Siempre en la fila expandida | CallPlayer.tsx:164-176 |
| 14 | campo | Rango `aria-label` «Posición de la grabación» | Reposiciona el audio | Siempre | CallPlayer.tsx:194-209 |
| 15 | texto | `mm:ss / mm:ss` (o `--:--`), cifras tabulares | Posición y total | Siempre | CallPlayer.tsx:210-212 |
| 16 | estado | «Grabación no disponible» (AlertCircle, rojo) | — | Si el audio falla | CallPlayer.tsx:156-162 |

#### D.13a Panel de transcripción `components/crm/calls/CallTranscriptPanel.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Transcripción» (FileText azul, `aria-label` «Transcripción de la llamada») | Título | Siempre | CallTranscriptPanel.tsx:138-141 |
| 2 | badge | Nombre del proveedor, con « (fallback)» si hubo cambio | Quién transcribió | Con transcripción completada | CallTranscriptPanel.tsx:142-147 |
| 3 | badge | «Roles por canal» (verde) · «1 hablante» · «Roles estimados» (ámbar), con `title` | Cómo se asignaron los papeles | Si el resultado trae método | CallTranscriptPanel.tsx:148-152 |
| 4 | botón | `aria-label` «Copiar transcripción» (`title` «Copiar») | Copia como `[mm:ss] AGENTE: texto` | Con transcripción completada | CallTranscriptPanel.tsx:157-159 · 107-115 |
| 5 | botón | `aria-label` «Volver a transcribir» (RefreshCw que gira) | `POST …/transcribe` con `force` | Con transcripción completada | CallTranscriptPanel.tsx:160-162 |
| 6 | estado | 6 barras `animate-pulse` de ancho variable | Primera carga | — | CallTranscriptPanel.tsx:169-175 |
| 7 | estado | «Esta llamada aún no tiene transcripción.» (icono Mic) | Vacío | Sin transcripción | CallTranscriptPanel.tsx:177-179 |
| 8 | botón | «Transcribir ahora» (Mic) | Encola sin `force` | En el vacío | CallTranscriptPanel.tsx:180-182 |
| 9 | estado | «Transcribiendo con {proveedor}… (≈ 1-2 min)» (Loader2 azul) | Sondeo cada 5 s | Trabajo vivo | CallTranscriptPanel.tsx:186-190 |
| 10 | estado | «Está tardando más de lo normal. Puedes volver a lanzarla.» (caja ámbar, AlertTriangle) | — | A partir de 10 min desde el inicio | CallTranscriptPanel.tsx:191-200 · 133-135 |
| 11 | botón | «Reintentar» (`aria-label` «Reintentar la transcripción atascada») | Relanza con `force` | En el aviso anterior | CallTranscriptPanel.tsx:196-198 |
| 12 | estado | «Sin créditos IA» · «El proveedor no respondió» · «Audio demasiado corto» · «La grabación está vacía» · «El audio es demasiado grande para transcribirlo» · «Sin grabación disponible» · «Tiempo de espera agotado» · «No se pudo guardar el resultado» · «Sin transcripción» · «Llamada no encontrada» · «La transcripción falló» | Caja roja con el detalle técnico | Estado `failed` | CallTranscriptPanel.tsx:204-207 · useCallIntelligence.ts:163-174 |
| 13 | botón | «Comprar créditos» | `/app/configuracion?modulo=crm&tab=creditos` | Solo con `INSUFFICIENT_CREDITS` | CallTranscriptPanel.tsx:208-209 |
| 14 | botón | «Reintentar» | Relanza con `force` | Resto de errores | CallTranscriptPanel.tsx:211-213 |
| 15 | campo | placeholder y `aria-label` «Buscar en la transcripción» (Search) | Filtra segmentos y resalta en amarillo | Con transcripción completada | CallTranscriptPanel.tsx:220-224 · 42-53 |
| 16 | texto | «{n} coincidencia» / «{n} coincidencias» | Contador | Con texto escrito | CallTranscriptPanel.tsx:225 |
| 17 | botón | `mm:ss` + «AGENTE» (azul) / «CLIENTE» (esmeralda) / «Hablante N» / «Canal N» + texto | Clic salta el reproductor a ese instante; el segmento en curso en azul | Lista con scroll `h-80` | CallTranscriptPanel.tsx:236-261 · 36-40 |
| 18 | estado | «No se detectó voz en la grabación (silencio o buzón vacío); no hay nada que analizar.» (caja ámbar) | — | Completada, sin segmentos ni texto | CallTranscriptPanel.tsx:231-233 |
| 19 | botón | «Mostrar {n} más» | Amplía de 100 en 100 | Si quedan segmentos | CallTranscriptPanel.tsx:263-267 |
| 20 | texto | «{n} hablante(s) · mm:ss · $0,0123» | Pie con hablantes, duración y coste | Completada | CallTranscriptPanel.tsx:268-271 |
| 21 | toast | «Transcripción en cola» · «Se procesará en el próximo minuto.» / «Transcripción lista» / «Ya había una transcripción en curso» · «Se reutiliza el trabajo que ya estaba encolado; no se cobra dos veces.» / «No se pudo comprobar si ya había otra transcripción en curso, así que podría duplicarse.» | Resultado del encolado | Al transcribir | CallTranscriptPanel.tsx:88-97 |
| 22 | toast | «Transcripción copiada» / «No se pudo copiar» · «Selecciona el texto manualmente.» | — | Al copiar | CallTranscriptPanel.tsx:111-113 |

#### D.13b Panel de análisis IA `components/crm/calls/CallAnalysisPanel.tsx` · `CallAnalysisSections.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Análisis IA» (Sparkles morado, `aria-label` «Análisis IA de la llamada») | Título | Siempre | CallAnalysisPanel.tsx:113-115 |
| 2 | badge | «{proveedor} · {modelo} · $0,0123» | Quién analizó, con qué modelo y a qué coste | Con análisis | CallAnalysisPanel.tsx:116-121 |
| 3 | badge | «Automático» / «Sugerir» (outline) | Política de aplicación de la organización | Si el paquete trae política | CallAnalysisPanel.tsx:122 |
| 4 | botón | «Analizar» / «Re-analizar» (RefreshCw o Loader2) | `POST …/analyze` | Solo con la transcripción completada; `disabled` con trabajo en curso | CallAnalysisPanel.tsx:124-129 |
| 5 | estado | «Analizando la llamada…» (morado) | — | Trabajo encolado o en marcha | CallAnalysisPanel.tsx:137-139 |
| 6 | estado | Etiqueta traducida del error (mismo catálogo que D.13a-12) o «El análisis falló», con el detalle | Caja roja | Estado `failed` | CallAnalysisPanel.tsx:140-145 |
| 7 | estado | «Sin análisis todavía. Pulsa "Analizar".» / «El análisis se genera al completar la transcripción.» | Según haya transcripción | Sin análisis ni trabajo vivo | CallAnalysisPanel.tsx:146-148 |
| 8 | texto | Resumen generado | Primer párrafo | Con análisis | CallAnalysisPanel.tsx:152 |
| 9 | badge | «Sentimiento: Positivo» (verde) / «Neutral» (gris) / «Negativo» (rojo) / «Mixto» (ámbar), con la puntuación | — | Si hay sentimiento | CallAnalysisPanel.tsx:154-158 · 30-35 |
| 10 | badge | «Caliente» (Flame, rojo) / «Tibio» (Thermometer, ámbar) / «Frío» (Snowflake, info) | Temperatura del prospecto | Si el modelo la devuelve | CallAnalysisPanel.tsx:159-164 |
| 11 | badge | «Decisor identificado» (verde) | — | Si se detecta | CallAnalysisPanel.tsx:165 |
| 12 | badge | «Presupuesto: 1.500.000» (formato `es-CO`) | — | Si se mencionó | CallAnalysisPanel.tsx:166 |
| 13 | badge | «Competidor: {nombre}» (uno por competidor) | — | Si se detectaron | CallAnalysisPanel.tsx:167 |
| 14 | stat | «Calidad» + «87/100» (verde ≥80, amarillo ≥50, rojo debajo) | Puntuación global | Si hay `quality_score` | CallAnalysisSections.tsx:26-34 |
| 15 | stat | «Apertura» · «Discovery» · «Pitch» · «Objeciones» · «Cierre» · «Profesionalismo», con minibarra azul y número | Desglose de la calidad | Por eje presente | CallAnalysisSections.tsx:11-18 · 35-49 |
| 16 | texto | «Habla agente 62 % / cliente 38 % · 9 preguntas · monólogo máx. 45s» | Métricas de conversación | Bajo el desglose | CallAnalysisSections.tsx:50-54 |
| 17 | texto | «Objeciones» + por cada una: título del catálogo o etiqueta detectada, la cita entre comillas, el % de confianza y «Respuesta sugerida: …» | Cajas rojas claras | Si se detectó alguna | CallAnalysisSections.tsx:59-80 |
| 18 | texto | «Próximos pasos» (ListChecks) + acción con «(cliente)» o «(agente)» y fecha | **Solo informativo, sin botón** | Si el análisis los propone | CallAnalysisPanel.tsx:173-184 |
| 19 | texto | «Tareas sugeridas» + título con «(prioridad · fecha)» | Lista de tareas propuestas | Si las hay | CallAnalysisPanel.tsx:186-205 |
| 20 | botón | «Crear tarea» | Aplica esa tarea (`POST …/analysis/apply`) | Por tarea no aplicada; se bloquea mientras otra se aplica | CallAnalysisPanel.tsx:196-198 |
| 21 | badge | Tachado + CheckCircle2 con `aria-label` «Tarea creada» | Marca la tarea creada | Tras aplicarla | CallAnalysisPanel.tsx:193-195 |
| 22 | texto | «Mover a **{etapa}** · confianza 85 %» (caja morada, ArrowRight) | Etapa sugerida | Si hay etapa sugerida | CallAnalysisPanel.tsx:207-211 |
| 23 | botón | «Aplicar etapa» | Mueve la oportunidad | Si no se aplicó aún | CallAnalysisPanel.tsx:214-216 |
| 24 | badge | «Etapa aplicada» (verde) | Sustituye al botón | Tras aplicar | CallAnalysisPanel.tsx:213 |
| 25 | diálogo | `GateWarningDialog` con los requisitos que faltan y el nombre de la etapa | Confirmar el salto pese al gate | Si la API responde 409 con `gate` | CallAnalysisPanel.tsx:95-97 · 241-247 |
| 26 | texto | «La etapa sugerida por el modelo no pertenece al pipeline y se descartó.» | Aviso en gris | Si el modelo propuso una etapa ajena | CallAnalysisPanel.tsx:221 |
| 27 | texto | «Discovery» + «Presupuesto» · «Autoridad» · «Necesidad» · «Plazo» · «Objetivos» · «Obstáculos» · «Consecuencias», con check verde «Aplicado a la oportunidad» si ya se volcaron | Campos descubiertos | Si hay alguno | CallAnalysisSections.tsx:82-110 |
| 28 | chip | Etiquetas del análisis con su color propio | — | Si el paquete trae etiquetas | CallAnalysisPanel.tsx:225-231 |
| 29 | botón | «Aplicar todo» (CheckCircle2) | Aplica etapa, tareas, etiquetas, discovery y objeciones de una vez | Con análisis, al pie a la derecha | CallAnalysisPanel.tsx:233-237 |
| 30 | toast | «Análisis en cola» / «Análisis listo» / «Ya había un análisis en curso» (mismas descripciones que D.13a-21) | — | Al analizar | CallAnalysisPanel.tsx:66-75 |
| 31 | toast | «Aplicado: etapa, tareas» / «Nada nuevo que aplicar», con lo omitido y su motivo | — | Al aplicar | CallAnalysisPanel.tsx:102 |

Layout de la fila expandida: desde `md` (768), transcripción y análisis en dos columnas (`md:grid-cols-2`); por debajo se convierten en pestañas «Transcripción» / «Análisis IA» (`CallRowDetail.tsx:51-62`). Vinculación y reproductor siempre arriba, a ancho completo.

### D.14 Diálogo «Llamar desde mi celular» `components/crm/shared/MobileCallDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Llamar desde mi celular» (icono Phone azul) | — | Al elegir «Desde mi celular», desde la fila de llamadas, o si el micrófono está denegado | MobileCallDialog.tsx:205-208 |
| 2 | texto | «Te llamamos a tu celular verificado y, al presionar 1, conectamos con {nombre}. La llamada se graba y queda en el timeline.» (si no hay nombre, «el cliente») | Descripción | Siempre | MobileCallDialog.tsx:209-211 |
| 3 | estado | «Comprobando tu celular…» (Loader2) | Lee `user_comm_preferences` | Al abrir | MobileCallDialog.tsx:216-219 |
| 4 | texto | «Tu celular: +57 310 *** 4567» | Celular verificado **enmascarado**; nunca se escribe ni se envía | Con celular verificado | MobileCallDialog.tsx:222-224 · 51-54 |
| 5 | texto | «Cliente: {número normalizado}» | Con el indicativo de la organización | Con celular verificado | MobileCallDialog.tsx:225-227 |
| 6 | texto | «Costo aproximado: 2 patas PSTN (≈ USD 0,08/min).» | Aviso de coste | Con celular verificado | MobileCallDialog.tsx:228 |
| 7 | estado | «Necesitas verificar tu celular por SMS antes de llamar desde él. Ve a Configuración › Telefonía › Mi celular.» (caja ámbar, ShieldAlert) | Bloquea la llamada | Sin celular verificado, o `MOBILE_NOT_VERIFIED` | MobileCallDialog.tsx:230-236 · 166 |
| 8 | estado | «Iniciando…» · «Llamando a tu celular…» · «Contesta y presiona 1» · «Conectando al cliente…» · «En llamada» · «Llamada finalizada» · «Falló la llamada» · «No contestaste en tu celular» · «Cancelaste la llamada» | Icono PhoneCall pulsando, CheckCircle2 verde o XCircle rojo. `aria-live="polite"` | Una vez iniciado el puente | MobileCallDialog.tsx:37-47 · 240-248 |
| 9 | botón | «Cancelar llamada» (rojo) | `POST /api/voice/bridge/{id}/cancel` | Con puente activo, no terminal y sin estar «En llamada» | MobileCallDialog.tsx:252-257 · 199 |
| 10 | botón | «Cancelar» (antes de iniciar) / «Cerrar» (después) | Cierra | Siempre | MobileCallDialog.tsx:258 |
| 11 | botón | «Llamar» (Phone o Loader2) | `POST /api/voice/bridge/initiate` | Antes de iniciar; `disabled` al cargar o sin celular verificado | MobileCallDialog.tsx:259-264 |
| 12 | toast | «Te estamos llamando» · «Contesta en tu celular y presiona 1 para conectar.» | — | Al iniciar | MobileCallDialog.tsx:172 |
| 13 | toast | «Número inválido» · «El cliente no tiene un teléfono en formato válido.» | — | Si el destino no normaliza | MobileCallDialog.tsx:152-155 |
| 14 | toast | «No se pudo iniciar la llamada» / «No se pudo cancelar» + detalle · «Llamada cancelada» | — | Según el caso | MobileCallDialog.tsx:175 · 190 · 192 |

`sm:max-w-md`. El progreso llega por Realtime sobre `mobile_call_bridges`, con respaldo por sondeo HTTP cada 4 s mientras el canal no esté suscrito.

### D.14a «Inteligencia de llamadas» — **no está en esta pantalla** `components/crm/calls/CallAiPolicyCard.tsx`

Su único punto de montaje es Configuración › CRM › Proveedores (`ProveedoresTab.tsx:18` y `:106`). Se documenta porque gobierna todo lo de D.13a y D.13b.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Inteligencia de llamadas» (Sparkles morado) | Título | Siempre | CallAiPolicyCard.tsx:130-132 |
| 2 | estado | «Cargando…» (Loader2) | — | Mientras llega `GET /api/crm/config/providers` | CallAiPolicyCard.tsx:134-135 |
| 3 | campo | Radios «Aplicar acciones del análisis» · «Sugerir (el vendedor aplica)» · «Automático (mover etapa y crear tareas)» (`role="radiogroup"`, `aria-label` «Política de aplicación») | Fija `auto_apply` | Siempre | CallAiPolicyCard.tsx:138-148 |
| 4 | campo | Select «Proveedor de transcripción» · «ElevenLabs Scribe v2» · «Gemini 3.8 Flash» · «OpenAI gpt-transcribe», con sufijo « (credenciales propias)» / « (plataforma)» / « (sin credenciales)» | Proveedor STT | Siempre | CallAiPolicyCard.tsx:149-156 · 122-126 |
| 5 | campo | Select «Proveedor de análisis» · «Gemini» · «OpenAI» (mismo sufijo) | Cambia también el modelo por defecto | Siempre | CallAiPolicyCard.tsx:157-163 |
| 6 | campo | «Modelo de análisis» | Modelo exacto, editable a mano | Siempre | CallAiPolicyCard.tsx:164-167 |
| 7 | campo | Select «Idioma» · «Español (spa)» · «Inglés (eng)» · «Portugués (por)» | Idioma de la transcripción | Siempre | CallAiPolicyCard.tsx:168-175 |
| 8 | campo | Rango «Umbral para mover etapa (80 %)» — el número del título cambia al mover | 50 a 100 en pasos de 5 | Siempre | CallAiPolicyCard.tsx:176-179 |
| 9 | campo | «Duración mínima (s)» (0 a 600) | Llamadas más cortas no se transcriben | Siempre | CallAiPolicyCard.tsx:180-183 |
| 10 | toggle | «Transcribir por canal (grabación dual: roles exactos)» | — | Siempre | CallAiPolicyCard.tsx:184-193 |
| 11 | toggle | «Transcribir automáticamente al terminar la llamada» | — | Siempre | CallAiPolicyCard.tsx:186 |
| 12 | toggle | «Analizar automáticamente al transcribir» | — | Siempre | CallAiPolicyCard.tsx:187 |
| 13 | texto | «Se guarda en provider_configs (stt / analysis).» / «Solo administradores pueden modificar la política.» | Destino o bloqueo | Según `can_edit` | CallAiPolicyCard.tsx:195 |
| 14 | botón | «Guardar» (Save o Loader2) | Dos `PUT` (categorías `stt` y `analysis`) y recarga | `disabled` sin permiso o al guardar | CallAiPolicyCard.tsx:196-198 |
| 15 | estado | Todo el `fieldset` deshabilitado | Sin permiso | Si `can_edit` es falso | CallAiPolicyCard.tsx:137 |
| 16 | toast | «Política guardada» / «Error» + detalle | — | Al guardar | CallAiPolicyCard.tsx:113 · 116 |

`grid-cols-1 sm:grid-cols-2`; los tres interruptores y el pie ocupan las dos columnas.

### D.15 Plantillas — cabecera y pestañas `components/crm/plantillas/PlantillasPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Plantillas» (h1) | Título | Siempre | PlantillasPage.tsx:75 |
| 2 | texto | «Correos y mensajes reutilizables con variables del CRM.» | Subtítulo | Siempre | PlantillasPage.tsx:76 |
| 3 | pestaña | «Email» (icono Mail) | `TemplateList`; escribe `?tab=email` sin recargar ni mover el scroll | Por defecto | PlantillasPage.tsx:51-54 · 86-88 |
| 4 | pestaña | «WhatsApp» (icono MessageCircle) | Carga `WhatsAppTemplatesTab` con `next/dynamic`; escribe `?tab=whatsapp` | Siempre | PlantillasPage.tsx:53 · 89-93 |
| 5 | estado | `Skeleton` de `h-40` | Mientras baja el chunk de WhatsApp | Al entrar en esa pestaña | PlantillasPage.tsx:47 |
| 6 | estado | «No se pudieron cargar las plantillas de WhatsApp» + «Vuelve a intentarlo recargando la página. Si el problema continúa, revisa la configuración del canal de WhatsApp en Configuración → CRM → WhatsApp.» (caja ámbar, `role="alert"`) | Degrada solo esa pestaña | Si falla el import o el render | PlantillasPage.tsx:24-37 · 92 |
| 7 | estado | «No se pudo mostrar la pestaña Email» + «El resto de la página sigue funcionando. Recarga para volver a intentarlo; si el problema continúa, avisa al equipo con la hora exacta (el detalle queda en la consola del navegador).» | Límite de error de la pestaña Email | Si `TemplateList` lanza | TabErrorBoundary.tsx:42-53 |

`space-y-4 p-4`. `TabsList` con `aria-label` «Canal de plantillas»; la pestaña activa se lee y escribe en `?tab=`.

### D.16 Plantillas › pestaña Email — filtros y tabla `components/crm/plantillas/TemplateList.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | placeholder «Buscar por nombre o asunto» · `aria-label` «Buscar plantillas» (Search) | Filtra en cliente por nombre y asunto (se cargan hasta 100) | Siempre | TemplateList.tsx:104-107 · 61-64 |
| 2 | campo | Select `aria-label` «Filtrar por tipo» · «Todos los tipos» · «Transaccional» · «Marketing» · «Secuencia» · «Onboarding» | Filtra por `kind` en cliente | Siempre | TemplateList.tsx:108-111 · 26-32 |
| 3 | botón | «Nueva plantilla» (Plus, `size="sm"`) | `/app/crm/plantillas/nueva` | Siempre | TemplateList.tsx:112 |
| 4 | tabla | «Nombre» | Enlace al editor + distintivos | Siempre | TemplateList.tsx:128 · 141-145 |
| 5 | badge | «Base» (outline, `text-[10px]`) | Plantilla del sistema, no borrable | Si `metadata.is_system` | TemplateList.tsx:143 |
| 6 | texto | «v3» en gris muy pequeño | Versión actual | Siempre | TemplateList.tsx:144 |
| 7 | badge | «Tipo» → «Transaccional» · «Marketing» · «Secuencia» · «Firma» · «WhatsApp (HSM)» · «Onboarding» | Clasificación | Siempre | TemplateList.tsx:129 · 146 · TemplatePicker.tsx:19-26 |
| 8 | tabla | «Asunto» (máx. 280 px, `truncate`) | — | Desde `md` (768) | TemplateList.tsx:130 · 147 |
| 9 | tabla | «Motor» → «HTML» o «Bloques» | Con qué editor se creó | Desde `lg` (1024) | TemplateList.tsx:131 · 148 |
| 10 | tabla | «Usos» | `metadata.usage_count`, 0 por defecto | Desde `lg` | TemplateList.tsx:132 · 149 |
| 11 | toggle | «Activa» → `Switch` con `aria-label` «Activar {nombre}» / «Desactivar {nombre}» | Activa o desactiva al instante (optimista, revierte si falla) | Siempre | TemplateList.tsx:133 · 150 · 66-74 |
| 12 | tabla | «Actualizada» → fecha `es-CO` estilo medio | `updated_at` | Desde `md` | TemplateList.tsx:134 · 151 |
| 13 | menú | Trigger `aria-label` «Acciones de {nombre}» (MoreHorizontal) | Abre el menú | Siempre | TemplateList.tsx:153-156 |
| 14 | menú | «Editar» (Pencil) | `/app/crm/plantillas/{id}` | Siempre | TemplateList.tsx:158 |
| 15 | menú | «Duplicar» (Copy) | Duplica y abre la copia | Siempre | TemplateList.tsx:159 |
| 16 | menú | «Eliminar» (Trash2, rojo) | Abre el `ConfirmDialog` | `disabled` en plantillas «Base» | TemplateList.tsx:161-163 |
| 17 | diálogo | «Eliminar plantilla» · «¿Eliminar "{nombre}"? Si ya se usó en envíos se desactivará en lugar de borrarse.» · confirmación «Eliminar» (destructivo) | Borra o desactiva | Al pulsar «Eliminar» | TemplateList.tsx:174-183 |
| 18 | estado | 3 `Skeleton` de `h-10` (`aria-busy`) | Primera carga | — | TemplateList.tsx:115-116 |
| 19 | estado | «Aún no hay plantillas de email.» (FileText, caja con borde discontinuo) | Vacío real | Sin plantillas | TemplateList.tsx:117-121 |
| 20 | botón | «Crear la primera» | `/app/crm/plantillas/nueva` | Solo en el vacío real | TemplateList.tsx:121 |
| 21 | estado | «Ninguna plantilla coincide con el filtro.» | Vacío por filtro | Con plantillas y sin coincidencias | TemplateList.tsx:120 |
| 22 | toast | «No se pudieron cargar las plantillas» / «No se pudo actualizar» / «Plantilla duplicada» + nombre / «No se pudo duplicar» / «Plantilla eliminada» + nombre / «Plantilla desactivada» · «Tiene envíos asociados; se desactivó en lugar de borrarla.» / «No se pudo eliminar» | — | En cada operación | TemplateList.tsx:53 · 72 · 79 · 82 · 91 · 95 |

`overflow-x-auto` con borde redondeado: esconde «Asunto» y «Actualizada» bajo `md`, y «Motor» y «Usos» bajo `lg`.

### D.17 Plantillas › pestaña WhatsApp `components/crm/whatsapp/WhatsAppTemplatesTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Plantillas HSM aprobadas por Meta/Twilio. Solo las **aprobadas** se pueden enviar fuera de la ventana de 24 h.» | Explicación | Siempre | WhatsAppTemplatesTab.tsx:108 |
| 2 | texto | «Solo lectura: crear, aprobar, eliminar y sincronizar plantillas requiere rol de administrador de la organización.» | Aviso de permisos | Sin `can_manage`, tras cargar | WhatsAppTemplatesTab.tsx:109 |
| 3 | botón | «Sincronizar» (RefreshCw, outline) | Trae del WABA las plantillas del proveedor | `disabled` sin permiso o mientras sincroniza | WhatsAppTemplatesTab.tsx:112 |
| 4 | botón | «Crear plantilla» (Plus, `bg-emerald-600`) | Abre `HsmEditorDialog` vacío | `disabled` sin permiso | WhatsAppTemplatesTab.tsx:113 |
| 5 | tabla | «Nombre» → botón monoespaciado que abre el editor, con la descripción debajo | — | Siempre | WhatsAppTemplatesTab.tsx:120 · 136-139 |
| 6 | badge | «Categoría» → «Utility» · «Marketing» (ámbar) · «Autenticación» | — | Siempre | WhatsAppTemplatesTab.tsx:121 · 140 · 31 |
| 7 | tabla | «Idioma» | Código de idioma | Desde `sm` (640) | WhatsAppTemplatesTab.tsx:122 · 141 |
| 8 | badge | «Estado» → «Aprobada» (verde) · «En revisión» (ámbar) · «Rechazada» (rojo) · «Pausada» (rojo) · «Deshabilitada» (rojo) · «En apelación» (ámbar) · «Borrador» (gris) | Estado en Meta | Siempre | WhatsAppTemplatesTab.tsx:123 · 142-145 · 22-30 |
| 9 | texto | Motivo del rechazo en rojo muy pequeño | — | Estado «Rechazada» con motivo | WhatsAppTemplatesTab.tsx:144 |
| 10 | tabla | «Calidad» → `quality_score` o «—» | — | Desde `md` (768) | WhatsAppTemplatesTab.tsx:124 · 146 |
| 11 | tabla | «Proveedor» → «Twilio» o «Meta» | — | Desde `lg` (1024) | WhatsAppTemplatesTab.tsx:125 · 147 |
| 12 | botón | «Aprobar» (Send, outline, alto 28 px) | Envía la plantilla a aprobación de Meta | Solo en filas «Borrador» y con permiso | WhatsAppTemplatesTab.tsx:149 |
| 13 | botón | `aria-label` «Eliminar {nombre}» (Trash2 rojo) | Borra el borrador o desactiva la publicada | Solo con permiso | WhatsAppTemplatesTab.tsx:150 |
| 14 | diálogo | **`confirm()` nativo**: «"{nombre}" ya existe en Meta: se desactivará aquí (sigue en el WABA). ¿Continuar?» / «¿Eliminar el borrador "{nombre}"?» | Confirmación | Al eliminar | WhatsAppTemplatesTab.tsx:99 |
| 15 | estado | 4 filas con `Skeleton` de `h-8` a `colSpan=7` | Primera carga | — | WhatsAppTemplatesTab.tsx:130 |
| 16 | estado | «No hay plantillas. Crea una o sincroniza las de tu WABA.» | Vacío | Sin plantillas | WhatsAppTemplatesTab.tsx:131 |
| 17 | texto | Fila al 60 % de opacidad | Plantilla desactivada | `is_active = false` | WhatsAppTemplatesTab.tsx:135 |
| 18 | toast | «Sincronizado con el proveedor» · «3 nuevas · 5 actualizadas · 12 en el WABA» / «No se pudo sincronizar» | — | Al sincronizar | WhatsAppTemplatesTab.tsx:80 · 83 |
| 19 | toast | «Enviada a aprobación» · «Estado: En revisión. Meta suele responder en minutos u horas.» / «No se pudo enviar» + código | — | Al aprobar | WhatsAppTemplatesTab.tsx:91 · 94 |
| 20 | toast | «No se pudieron cargar las plantillas» / «No se pudo eliminar» | — | En los fallos | WhatsAppTemplatesTab.tsx:57 · 101 |

La tabla se refrescaría por Realtime con el webhook `message_template_status_update`, pero `templates` **no está publicada** en `supabase_realtime` (§G).

### D.18 Diálogo de plantilla HSM `components/crm/whatsapp/HsmEditorDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Nueva plantilla HSM» / «Plantilla {nombre}» | — | Siempre | HsmEditorDialog.tsx:68 |
| 2 | texto | «Usa variables con nombre: {{nombre}}, {{fecha}}… y mapéalas a datos del CRM. Meta exige que el cuerpo no empiece ni termine con una variable.» / «Una plantilla ya enviada a Meta no se edita: crea una nueva versión.» | Descripción | La segunda si el estado ya no es «Borrador» | HsmEditorDialog.tsx:69 · 22 |
| 3 | campo | «Nombre (a-z, 0-9, _)» (monoespaciada) | Fuerza minúsculas y sustituye lo demás por `_` | Editable solo en borrador | HsmEditorDialog.tsx:74 |
| 4 | campo | Select «Categoría» · «Utility (transaccional)» · «Marketing (requiere opt-in)» · «Autenticación» | — | Editable solo en borrador | HsmEditorDialog.tsx:75-77 |
| 5 | campo | «Idioma» · placeholder «es \| es_CO \| en_US» | — | Editable solo en borrador | HsmEditorDialog.tsx:78 |
| 6 | campo | Select «Canal (WABA)» · placeholder «Por defecto» · «{nombre} · {proveedor}» | Canal de envío; los canales sin plantillas quedan deshabilitados | Siempre editable | HsmEditorDialog.tsx:79-81 |
| 7 | campo | «Descripción interna» | Solo para el equipo | Siempre editable | HsmEditorDialog.tsx:83 |
| 8 | campo | «Encabezado (texto, ≤60)» | Componente `HEADER`, recorta a 60 | Editable solo en borrador | HsmEditorDialog.tsx:84 |
| 9 | campo | Textarea «Cuerpo (≤1024) *» (5 filas) con contador «N/1024» | Componente `BODY` | Editable solo en borrador | HsmEditorDialog.tsx:85 |
| 10 | campo | «Pie (≤60)» — por defecto «Responde BAJA para no recibir más mensajes» | Componente `FOOTER` | Editable solo en borrador | HsmEditorDialog.tsx:86 · 31 |
| 11 | botón | «Añadir» (Plus) bajo «Botones (≤3)» | Agrega un botón de respuesta rápida vacío | En borrador y con menos de 3 | HsmEditorDialog.tsx:88 |
| 12 | campo | Select «Respuesta rápida» · «Enlace» · «Llamar» | Tipo de cada botón | Por botón | HsmEditorDialog.tsx:91 |
| 13 | campo | `aria-label` «Texto del botón» · placeholder «Texto» (máx. 25) | Rótulo | Por botón | HsmEditorDialog.tsx:92 |
| 14 | campo | `aria-label` «URL» · placeholder «https://…/{{token}}» | Destino | Solo botones «Enlace» | HsmEditorDialog.tsx:93 |
| 15 | campo | `aria-label` «Teléfono» · placeholder «+57…» | Número | Solo botones «Llamar» | HsmEditorDialog.tsx:94 |
| 16 | botón | `aria-label` «Quitar botón» (X) | Elimina el botón | Solo en borrador | HsmEditorDialog.tsx:95 |
| 17 | campo | «Variables → dato del CRM · ejemplo para Meta» + por variable detectada, `{{nombre}}` y el select del catálogo del CRM | Mapea cada variable a un dato real | Si el texto contiene variables | HsmEditorDialog.tsx:99-110 · 19 |
| 18 | campo | `aria-label` «Ejemplo de {variable}» · placeholder «Ejemplo (Laura)» | Valor de ejemplo que Meta exige | Por variable | HsmEditorDialog.tsx:107 |
| 19 | texto | Burbuja de WhatsApp con fondo `#efeae2` (claro) / `#0b141a` (oscuro), estado «delivered» | Vista previa con encabezado, cuerpo, pie y botones ya sustituidos | Siempre | HsmEditorDialog.tsx:113 · 61-62 |
| 20 | botón | «Cerrar» | Cierra sin guardar | Siempre | HsmEditorDialog.tsx:116 |
| 21 | botón | «Guardar borrador» (Save) | Crea o actualiza en borrador | En borrador; `disabled` sin nombre o sin cuerpo | HsmEditorDialog.tsx:117 |
| 22 | botón | «Enviar a aprobación» (Send, verde) | Guarda y manda a Meta | En borrador; mismas condiciones | HsmEditorDialog.tsx:118 |
| 23 | toast | «Borrador guardado» / «Enviada a aprobación» · «Estado {ESTADO}» / «No se pudo guardar» + código | — | Al guardar | HsmEditorDialog.tsx:53-57 |

`sm:max-w-3xl`, alto máximo `95vh` con scroll. Cuerpo en una columna que pasa a `1fr` + `240px` en `md` (768): formulario a la izquierda, vista previa a la derecha.

### D.19 Editor de plantilla — cabecera `components/crm/plantillas/TemplateEditorHeader.tsx`

Aplica a `/app/crm/plantillas/nueva` y `/app/crm/plantillas/[id]`.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «Plantillas» (ArrowLeft) | Vuelve al listado | Siempre | TemplateEditorHeader.tsx:43-45 |
| 2 | texto | «Nueva plantilla» / nombre de la plantilla / «Plantilla» (h1) | Título | Siempre | TemplateEditorHeader.tsx:47 |
| 3 | badge | «v3» (`secondary`) | Versión guardada | Con plantilla existente | TemplateEditorHeader.tsx:48 |
| 4 | badge | «Base» (outline) | Plantilla del sistema | Si lo es | TemplateEditorHeader.tsx:49 |
| 5 | badge | «Sin guardar» (ámbar) | Hay cambios sin persistir | Cuando `dirty` | TemplateEditorHeader.tsx:50 |
| 6 | stat | «Enviados 120 · Abiertos 64 · Clics 18 · Rebotes 2» (`aria-label` «Estadísticas de la plantilla») | Rendimiento acumulado | Si el backend las devuelve | TemplateEditorHeader.tsx:51-55 |
| 7 | botón | «Duplicar» (Copy, outline, `size="sm"`) | Duplica y abre la copia | Solo al editar una existente | TemplateEditorHeader.tsx:57 |
| 8 | botón | «Enviar prueba» (Send) | Abre `TestSendDialog` | `disabled` en plantilla nueva, con `title` «Guarda la plantilla para enviar una prueba» | TemplateEditorHeader.tsx:58-60 |
| 9 | botón | «Guardar» (Save o Loader2) | `POST` si es nueva, `PATCH` si existe | Siempre; `disabled` al guardar | TemplateEditorHeader.tsx:61-63 |
| 10 | campo | «Nombre *» · placeholder «Ej. Seguimiento tras llamada» (máx. 120) | — | Siempre | TemplateEditorHeader.tsx:68-71 |
| 11 | campo | Select «Tipo» (`aria-label` «Tipo de plantilla») · «Transaccional» · «Marketing» · «Secuencia» · «Onboarding» | — | Siempre | TemplateEditorHeader.tsx:72-78 · 22 |
| 12 | toggle | «Activa» | Disponible o no para enviar | Siempre | TemplateEditorHeader.tsx:79-82 |
| 13 | campo | «Asunto *» · placeholder «Gracias por tu tiempo, {{contact.first_name\|hola}}» (máx. 200) | — | Siempre | TemplateEditorHeader.tsx:88-91 |
| 14 | botón | Popover «+ variable» (enlace azul de 11 px) | Abre `VariablePicker`; inserta la expresión al final del asunto | Junto a la etiqueta del asunto | TemplateEditorHeader.tsx:89 |
| 15 | campo | «Preheader (texto de vista previa)» · placeholder «Resumen breve que se ve junto al asunto» (máx. 140) | — | Siempre | TemplateEditorHeader.tsx:93-96 |
| 16 | campo | «Descripción interna» · placeholder «Cuándo usar esta plantilla» (máx. 300) | — | Siempre | TemplateEditorHeader.tsx:98-101 |

Tres filas. La primera `flex-wrap`; la segunda `grid-cols-1 md:[2fr_180px_auto]`; la tercera `grid-cols-1 md:grid-cols-2`. La descripción va a ancho completo.

### D.20 Selector de variables `components/crm/email/VariablePicker.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | Popover «Variables» (Braces, `aria-label` «Insertar variable») | Abre el buscador. En la cabecera del editor el disparador es «+ variable» | Cuando el contenedor no pasa otro disparador | VariablePicker.tsx:47-51 |
| 2 | campo | placeholder «Buscar variable…» | Filtra por ruta y etiqueta | Popover abierto | VariablePicker.tsx:55 |
| 3 | estado | «Sin resultados» | Vacío | Sin coincidencias | VariablePicker.tsx:57 |
| 4 | menú | Grupos «Contacto» · «Oportunidad» · «Organización» · «Vendedor» · «Cotización» · «Personalizadas» | Agrupa el catálogo | Popover abierto | VariablePicker.tsx:10-17 |
| 5 | menú | Etiqueta legible + `{{ruta}}` monoespaciada + el valor actual en cursiva (recortado a 40 caracteres) | Inserta `{{ruta}}`, `{{ruta\|filtro}}` o `{{contact.first_name\|hola}}` en el cursor | Por variable | VariablePicker.tsx:64-76 · 38-42 |

Popover `w-80`, lista `max-h-72`.

### D.21 Editor de plantilla — modo Bloques `components/crm/email/editor/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | pestaña | «Bloques» (Blocks) | Editor visual | Por defecto (motor `blocks`) | TemplateEditorPage.tsx:74 |
| 2 | pestaña | «HTML» (Code2) | Editor de HTML crudo; si el HTML está vacío se precarga con el render de los bloques | Al cambiar de motor | TemplateEditorPage.tsx:75 · 44-52 |
| 3 | texto | «1 bloque» / «5 bloques» | Contador de la barra superior | Siempre | EmailBlockEditor.tsx:58 |
| 4 | botón | `title` «Deshacer (Ctrl+Z)» (Undo2) | Historial de 50 pasos | `disabled` sin nada que deshacer | EmailBlockEditor.tsx:60-62 |
| 5 | botón | `title` «Rehacer (Ctrl+Shift+Z)» (Redo2) | — | `disabled` sin nada que rehacer | EmailBlockEditor.tsx:63-65 |
| 6 | atajo | `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` (o `Cmd` en Mac) | Deshacer y rehacer | Siempre | EmailBlockEditor.tsx:48-53 |
| 7 | texto | «Bloques» (h3) | Encabeza la paleta | Siempre | EmailBlockEditor.tsx:70 |
| 8 | botón | Paleta de 13: «Encabezado» · «Texto» · «Botón» · «Imagen» · «Divisor» · «Espacio» · «Columnas» · «Producto» · «Cotización» · «Firma» · «Redes» · «Pie legal» · «Variable» (`aria-label` «Insertar bloque {nombre}») | Clic o `Enter`/`Espacio` inserta al final del canvas | Se pueden restringir por contexto (la firma solo usa 4) | BlockPalette.tsx:32-52 · blocks.ts:152-171 |
| 9 | estado | «Añade bloques desde la paleta para construir el correo.» (borde discontinuo) | Vacío | Documento sin bloques | BlockCanvas.tsx:126-129 |
| 10 | atajo | Arrastrar por el asa · `Enter`/`Espacio` selecciona · `Supr`/`Retroceso` borra · `Alt+↑`/`Alt+↓` mueve | Sobre el bloque enfocado (`role="option"`, `aria-selected`, `aria-label` «Bloque 2 de 5: Texto») | Con el bloque enfocado | BlockCanvas.tsx:52-66 |
| 11 | botón | `aria-label` «Arrastrar bloque {nombre}» (GripVertical) | Asa de arrastre | Barra flotante, al pasar por encima o seleccionar | BlockCanvas.tsx:82-84 |
| 12 | botón | `aria-label` «Subir bloque» (ArrowUp) / «Bajar bloque» (ArrowDown) | Mueve una posición | `disabled` en los extremos | BlockCanvas.tsx:85-90 |
| 13 | botón | `aria-label` «Duplicar bloque» (Copy) | Clona | Barra flotante | BlockCanvas.tsx:91-93 |
| 14 | botón | `aria-label` «Eliminar bloque» (Trash2, rojo) | Borra | Barra flotante | BlockCanvas.tsx:94-96 |
| 15 | texto | Nombre del bloque en mayúsculas pequeñas | Identifica el bloque | Barra flotante | BlockCanvas.tsx:81 |
| 16 | texto | «{Nombre del bloque}» (h3, con su icono azul) + el formulario de propiedades de ese tipo | Columna derecha | Con un bloque seleccionado | BlockPropertiesPanel.tsx:34-46 |
| 17 | texto | «Diseño del correo» (Settings2) + «Selecciona un bloque para editar su contenido.» | Ajustes del documento | Sin selección | BlockPropertiesPanel.tsx:50-56 |
| 18 | campo | «Ancho (px)» | Entre 320 y 800 (600 por defecto) | Sin selección | BlockPropertiesPanel.tsx:58 |
| 19 | campo | «Color de fondo» | Fondo del lienzo | Sin selección | BlockPropertiesPanel.tsx:59 |
| 20 | campo | Select «Fuente» · «Inter / Arial» · «Helvetica» · «Georgia (serif)» · «Verdana» · «Courier (mono)» | Tipografía | Sin selección | BlockPropertiesPanel.tsx:60 · 25-31 |
| 21 | campo | «Color de marca» | Color primario de botones y acentos | Sin selección | BlockPropertiesPanel.tsx:61 |
| 22 | campo | «Logo por defecto (URL)» · ayuda «Se usa en el bloque Encabezado si no tiene logo propio. Admite {{org.logo_url}}.» | — | Sin selección | BlockPropertiesPanel.tsx:62 |

Una sola columna bajo `lg` (1024); desde ahí, `180px` (paleta) + `1fr` (canvas) + `280px` (propiedades), alto fijo `h-[65vh]`. El canvas centra un lienzo del ancho configurado sobre el color de fondo del documento.

### D.22 Editor de plantilla — modo HTML, vista previa y prueba

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «HTML del correo» | Etiqueta del área | Pestaña HTML | EmailHtmlEditor.tsx:54 · 25 |
| 2 | botón | Popover «Variables» | Inserta la expresión en el cursor | Pestaña HTML, si no es de solo lectura | EmailHtmlEditor.tsx:55 · 29-40 |
| 3 | campo | Textarea con placeholder de tres líneas (`<table role="presentation" width="100%">` …) | HTML crudo, monoespaciado, sin corrector, sin ajuste de línea, alto mínimo 520 px y redimensionable | Pestaña HTML | EmailHtmlEditor.tsx:57-70 |
| 4 | atajo | `Tab` | Inserta 2 espacios en vez de saltar de campo | Con el foco en el textarea | EmailHtmlEditor.tsx:42-47 |
| 5 | texto | «124 líneas · 8.430 caracteres · Tab inserta 2 espacios · script/iframe/form se eliminan al guardar.» | Contador y aviso de saneado | Pestaña HTML | EmailHtmlEditor.tsx:71-73 |
| 6 | texto | Asunto renderizado, o «Sin asunto» en gris | Encabeza la vista previa | Siempre | EmailPreview.tsx:41 |
| 7 | texto | Preheader renderizado | Segunda línea | Si hay preheader | EmailPreview.tsx:42 |
| 8 | toggle | `aria-label` «Escritorio» (Monitor, `aria-pressed`) | Ancho de 640 px | Por defecto | EmailPreview.tsx:45-47 |
| 9 | toggle | `aria-label` «Móvil» (Smartphone) | Ancho de 375 px, con transición | Siempre | EmailPreview.tsx:48-50 |
| 10 | estado | Loader2 con `aria-label` «Actualizando vista previa» | Regenerando (600 ms de retardo tras cada cambio) | Mientras carga | EmailPreview.tsx:51 · useTemplateEditor.ts:93-112 |
| 11 | estado | «Variables sin valor:» + un badge monoespaciado por variable (caja ámbar, `role="status"`) | Variables que no resuelven con el contexto real | Si faltan | EmailPreview.tsx:55-61 |
| 12 | estado | Mensaje en caja roja (`role="alert"`) | Fallo al generar la vista previa | Si falla `POST /api/email/templates/preview` | EmailPreview.tsx:62 |
| 13 | pestaña | «HTML» | `iframe` con `sandbox=""` (sin scripts) y `srcDoc` | Por defecto | EmailPreview.tsx:66 · 72-78 |
| 14 | pestaña | «Texto plano» | Versión de texto en `<pre>`, o «Sin contenido» | Siempre | EmailPreview.tsx:67 · 86-90 |
| 15 | estado | «Generando vista previa…» / «La vista previa aparecerá aquí.» | Sin datos todavía | — | EmailPreview.tsx:80-82 |
| 16 | diálogo | «Enviar prueba» | — | Al pulsar «Enviar prueba» | TestSendDialog.tsx:47 |
| 17 | texto | «Se envía "{nombre}" con datos de ejemplo. Deja el campo vacío para usar tu propio correo.» | Descripción | Siempre | TestSendDialog.tsx:48 |
| 18 | campo | «Correo de destino» · placeholder «tu@correo.com» (`type="email"`, `aria-invalid`) | Destinatario alternativo | Siempre | TestSendDialog.tsx:51-52 |
| 19 | estado | «Correo inválido» (rojo) | Validación en cliente | Con texto que no pasa | TestSendDialog.tsx:53 · 27 |
| 20 | botón | «Cancelar» / «Enviar» (Send o Loader2) | `POST /api/email/templates/{id}/test-send`; **sin registrar actividad ni comprobar consentimiento** | `disabled` con el correo inválido o sin plantilla guardada | TestSendDialog.tsx:56-59 |
| 21 | toast | «Prueba enviada» · «A {correo} · variables vacías: contact.first_name, org.name» / «No se pudo enviar la prueba» + detalle | — | Al enviar | TestSendDialog.tsx:34 · 37 |
| 22 | estado | `Skeleton` de `h-32` + otro de `h-[60vh]` (`aria-label` «Cargando plantilla») | Esqueleto de la pantalla entera | Al abrir `/[id]` | TemplateEditorPage.tsx:25-32 |
| 23 | estado | «No se pudo cargar la plantilla» + mensaje (`Alert` destructivo) | Sustituye al editor, **sin botón de reintentar** | Si falla `GET /api/email/templates/{id}` | TemplateEditorPage.tsx:33-42 |
| 24 | toast | «Revisa la plantilla» · «El nombre es obligatorio» / «El asunto es obligatorio» / «Añade al menos un bloque» / «El HTML está vacío» | Validación antes de guardar | Al pulsar «Guardar» | useTemplateEditor.ts:114-124 |
| 25 | toast | «Plantilla creada» / «Plantilla guardada» · «{nombre} · v2» | Tras crear, la URL pasa a `/app/crm/plantillas/{id}` sin entrada nueva en el historial | Al guardar | useTemplateEditor.ts:135-136 |
| 26 | toast | «No se pudo guardar» / «No se pudo duplicar» + detalle · «Plantilla duplicada» + nombre de la copia | — | Según el caso | useTemplateEditor.ts:139 · 151 · 153 |

Editor y vista previa en una columna hasta `xl` (1280), donde pasan a `3fr` + `2fr` (`TemplateEditorPage.tsx:71`). El iframe mide `h-[58vh]`.

---

## E. Campañas, identidades y objeciones

### E.1 Campañas — cabecera, KPIs y tabla `components/crm/campanas/CampanasPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | `aria-label` «Volver» (ArrowLeft) | `/app/crm` | Siempre | CampanasPage.tsx:68 |
| 2 | texto | «Campañas» (h1, icono Megaphone sobre cuadro esmeralda) | Título | Siempre | CampanasPage.tsx:70 |
| 3 | texto | «CRM / Campañas · WhatsApp y email masivo» | Migas de pan | Siempre | CampanasPage.tsx:71 |
| 4 | botón | `aria-label` «Actualizar» (RefreshCw, gira al cargar) | Recarga la lista | Siempre; `disabled` al cargar | CampanasPage.tsx:75 |
| 5 | botón | «Nueva campaña» (`emerald-600`) | `/app/crm/campanas/nuevo` | Siempre | CampanasPage.tsx:76 |
| 6 | stat | «Total» · «Borradores» · «Programadas» · «Enviando» · «Enviadas» | Los cinco se calculan **en el cliente** sobre el array ya cargado; no hay consulta agregada | Siempre | CampanasPage.tsx:62 · 81-83 |
| 7 | tabla | «Campaña» | Nombre + segunda línea «Segmento» / «Etapas del pipeline» / «Selección manual» · N contactos | Siempre | CampanasPage.tsx:91 · 112 |
| 8 | tabla | «Canal» → «Email» (Mail azul) / «WhatsApp» (MessageCircle esmeralda) | — | Desde `sm` (640) | CampanasPage.tsx:92 · 113 |
| 9 | tabla | «Estado» → badge del estado efectivo | — | Siempre | CampanasPage.tsx:93 · 114 |
| 10 | tabla | «Progreso» → `Progress` + «{procesados} / {total}»; `aria-label` «Progreso {n}%» | — | Desde `md` (768) | CampanasPage.tsx:94 · 115 |
| 11 | tabla | «Entregados · Leídos · Resp.» → tres cifras separadas por «·»; «—» sin conteos | — | Desde `lg` (1024) | CampanasPage.tsx:95 · 116 |
| 12 | tabla | «Costo» → «≈ $0.0000» y, si hay coste real, « · real $0.00» | — | Desde `lg` | CampanasPage.tsx:96 · 117 |
| 13 | tabla | «Programada» → fecha con `useFormatDate()` (zona de la organización); «—» si no lo está | **Único sitio de campañas que respeta la zona horaria** | Desde `xl` (1280) | CampanasPage.tsx:97 · 118 |
| 14 | tabla | — (`w-10`, sin cabecera) | Aloja el menú «…» | Siempre | CampanasPage.tsx:98 |
| 15 | botón | Fila completa (`cursor-pointer`) | `/app/crm/campanas/{id}` | Siempre | CampanasPage.tsx:111 |
| 16 | estado | 5 filas de `Skeleton` a ancho completo (`colSpan={8}`) | Carga | Mientras carga | CampanasPage.tsx:102 |
| 17 | estado | «No hay campañas» + «Envía una plantilla de WhatsApp a un segmento, una etapa del pipeline o una selección.» (icono Megaphone) | Vacío | Lista vacía y sin carga | CampanasPage.tsx:104 |
| 18 | botón | «Crear campaña» | `/app/crm/campanas/nuevo` | Solo en el vacío | CampanasPage.tsx:104 |
| 19 | cálculo | — | Progreso = (enviados + fallidos + omitidos) / total, tope 100 % | Siempre | CampanasPage.tsx:24-29 |

La tabla vive en un `overflow-x-auto`, pero **las columnas se ocultan por breakpoint** en vez de hacer scroll: en móvil solo quedan Campaña, Estado y el menú. Celdas `py-2 sm:py-3`; nombre y subtítulo recortados a `max-w-[200px]`.

### E.2 Campañas — menú «…», diálogo de borrado y badges `CampanasPage.tsx` · `types.ts`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | Trigger `aria-label` «Acciones» (MoreVertical) | Abre el menú; hace `stopPropagation` para no navegar | Siempre | CampanasPage.tsx:121 |
| 2 | menú | «Ver detalle» | `/app/crm/campanas/{id}` | Siempre | CampanasPage.tsx:123 |
| 3 | menú | «Pausar» | `POST /api/crm/campaigns/{id}/pause` | Solo con `can_manage` (admin de organización) y estado `sending` o `scheduled` | CampanasPage.tsx:124 |
| 4 | menú | «Reanudar» | `POST …/resume` | Solo con `can_manage` y estado `paused` | CampanasPage.tsx:125 |
| 5 | menú | «Cancelar» | `POST …/cancel` | Solo con `can_manage` y estado `sending`, `scheduled` o `paused` | CampanasPage.tsx:126 |
| 6 | menú | «Duplicar» | Crea otra con nombre «{nombre} (copia)». **No exige `can_manage`** (§G) | Siempre | CampanasPage.tsx:127 · CampanasService.ts:24-27 |
| 7 | menú | «Eliminar» (texto rojo) | Abre el diálogo | Siempre; `disabled` si el estado es `sending` | CampanasPage.tsx:129 |
| 8 | diálogo | «¿Eliminar campaña?» + «Se borran sus contactos y métricas. Los mensajes ya enviados permanecen en las conversaciones.» | `AlertDialog` de shadcn | Al pulsar «Eliminar» | CampanasPage.tsx:143 |
| 9 | botón | «Cancelar» / «Eliminar» (`bg-red-600`) | `DELETE /api/crm/campaigns/{id}` y recarga | En el diálogo | CampanasPage.tsx:144 |
| 10 | badge | «Borrador» (gris) · «Calculando» (azul) · «Programada» (azul) · «Enviando» (amarillo) · «Pausada» (naranja) · «Enviada» (verde) · «Cancelada» (rojo) | Estado efectivo; `text-[10px]` en móvil, `text-xs` desde `sm` | Siempre | types.ts:8-14 |
| 11 | toast | «Campaña pausada» · «Campaña reanudada» · «Campaña cancelada» · «Campaña duplicada» · «Campaña eliminada» | Confirmación | Tras éxito | CampanasPage.tsx:124-129 · 144 |
| 12 | toast | «No se pudo completar» + mensaje (destructivo) | Fallo de cualquier acción | Tras error | CampanasPage.tsx:59 |
| 13 | toast | «Error» + «No se pudieron cargar las campañas» | Fallo de la carga inicial | Tras error | CampanasPage.tsx:45 |

Menú `align="end"`. Sin `can_manage` quedan tres ítems (Ver detalle, Duplicar, Eliminar) y **no hay aviso**: el aviso solo existe en el detalle.

### E.3 Detalle de campaña — cabecera `components/crm/campanas/id/CampanaDetallePage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | `aria-label` «Volver» (ArrowLeft) | `/app/crm/campanas` | Siempre | CampanaDetallePage.tsx:79 |
| 2 | texto | Nombre de la campaña + badge de estado en la misma línea del h1 | Título | Siempre | CampanaDetallePage.tsx:81 |
| 3 | texto | «{Email\|WhatsApp} · {plantilla HSM\|texto libre} · {n} msg/s[ · programada {fecha}]» | Subtítulo técnico | Siempre | CampanaDetallePage.tsx:82 |
| 4 | botón | `aria-label` «Actualizar» (RefreshCw) | Recarga con `sync=1` (fuerza refresco de métricas) | Siempre | CampanaDetallePage.tsx:86 |
| 5 | botón | «Lanzar» (Rocket, `emerald-600`) | Materializa si hace falta y lanza; spinner mientras trabaja | Solo con `can_manage` y estado `draft` | CampanaDetallePage.tsx:87 |
| 6 | botón | «Pausar» | `POST …/pause` | Solo con `can_manage` y estado `sending` o `scheduled` | CampanaDetallePage.tsx:88 |
| 7 | botón | «Reanudar» | `POST …/resume` | Solo con `can_manage` y estado `paused` | CampanaDetallePage.tsx:89 |
| 8 | botón | «Cancelar» (texto rojo) | `confirm()` nativo y luego `POST …/cancel` | Solo con `can_manage` y estado `sending`, `scheduled`, `paused` o `draft` | CampanaDetallePage.tsx:90 |
| 9 | diálogo | **`confirm()` nativo**: «Los pendientes se omiten y los créditos reservados se devuelven. ¿Cancelar la campaña?» | Ventana del navegador, sin estilos del sistema de diseño | Al pulsar «Cancelar» | CampanaDetallePage.tsx:90 |
| 10 | botón | «Exportar CSV» (Download) | Descarga `/api/crm/campaigns/{id}/contacts?export=csv` | Siempre | CampanaDetallePage.tsx:91 · api.ts:127 |
| 11 | estado | «Lanzar, pausar o cancelar requiere rol de administrador de la organización.» | Explica por qué faltan los botones | Sin `can_manage`, tras cargar | CampanaDetallePage.tsx:92 |
| 12 | estado | `PageHeaderSkeleton` + `StatsSkeleton count={6}` | Carga | Mientras carga o si no hay campaña | CampanaDetallePage.tsx:64 |
| 13 | toast | «Campaña no encontrada» (destructivo); redirige a la lista | — | Si no existe | CampanaDetallePage.tsx:35 |

Cabecera `flex-col` hasta `md` (768). La barra de acciones usa `flex-wrap`: en móvil los botones se reparten y el aviso de permisos cae al final.

### E.4 Detalle de campaña — avisos, progreso y métricas `CampanaDetallePage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Pausada automáticamente: {sin créditos de WhatsApp \| Meta pausó/rechazó la plantilla \| motivo crudo}.» | Banda ámbar con `role="alert"` | Estado `paused` con `pause_reason` | CampanaDetallePage.tsx:96 |
| 2 | estado | Texto de `messaging_limit.warning` | Banda azul sobre el límite del WABA | Cuando el backend lo manda | CampanaDetallePage.tsx:97 |
| 3 | texto | «{procesados} / {total} procesados · {n} enviados[ · termina ≈ {m} min]» | Línea bajo la barra grande; la ETA solo si está enviando y hay pendientes | Siempre | CampanaDetallePage.tsx:102 |
| 4 | cálculo | — | ETA = (pendientes + en cola) / throttle / 60, redondeado hacia arriba | Siempre | CampanaDetallePage.tsx:73 |
| 5 | stat | «Enviados» (azul) · «Entregados» (verde) · «Leídos» (celeste) · «Respondieron» (teal) · «Fallidos» (rojo) · «Omitidos» (gris) · «Pendientes» (ámbar, pendientes + en cola) | 7 KPIs en `grid-cols-2 md:grid-cols-4 lg:grid-cols-7` | Siempre | CampanaDetallePage.tsx:107-109 |
| 6 | texto | «Costo» → «Estimado: $0.0000 USD» · «Real: $0.0000 USD» · «El costo real llega con los eventos de entrega (pricing de Meta).» | Tarjeta de coste | Siempre | CampanaDetallePage.tsx:113 |
| 7 | texto | «Errores» → «{código} {etiqueta}» + badge con el conteo | Tarjeta de errores del proveedor | Siempre | CampanaDetallePage.tsx:114 |
| 8 | estado | «Sin errores del proveedor.» | Vacío | Sin códigos de error | CampanaDetallePage.tsx:114 |
| 9 | texto | «Exclusiones» → «{motivo}» + badge con el conteo | Tarjeta de exclusiones | Siempre | CampanaDetallePage.tsx:115 |
| 10 | estado | «Sin exclusiones.» | Vacío | Sin exclusiones | CampanaDetallePage.tsx:115 |

Las tres tarjetas de coste/errores/exclusiones van en una columna hasta `lg` (1024), donde pasan a tres. La barra de progreso grande anima el ancho 700 ms (`[&>div]:duration-700`).

**Etiquetas exactas de exclusión** (`api.ts:130-141`): «Pidió no recibir WhatsApp» · «Sin teléfono» · «Número inválido» · «Sin email» · «Marketing a EE.UU. (bloqueado por Meta)» · «Fuera de la ventana de 24 h (requiere plantilla)» · «Misma plantilla en los últimos 7 días» · «Campaña cancelada» · «Límite de marketing por usuario (24 h)» · «Faltan variables».

**Etiquetas exactas de error** (`api.ts:143-158`): «Límite de marketing por usuario: se omitió 24 h» · «Límite de envíos del WABA alcanzado» · «Demasiados mensajes al mismo usuario (reencolado)» · «Límite de throughput (reencolado)» · «El número no usa WhatsApp» · «Han pasado más de 24 h sin respuesta (re-engagement)» · «Tipo de mensaje no soportado» · «Parámetros de la plantilla no coinciden» · «La plantilla no existe o no está aprobada» · «Twilio: fuera de ventana sin plantilla» · «Twilio: el contacto se dio de baja» · «El canal no tiene credenciales» · «Sin destinatario» · «El canal QR no admite plantillas».

### E.5 Detalle de campaña — tabla de contactos `components/crm/campanas/id/CampaignContactsTable.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Contactos ({total})» | Título con el total del servidor | Siempre | CampaignContactsTable.tsx:46 |
| 2 | campo | placeholder «Buscar nombre, teléfono…» (`aria-label` «Buscar contacto») | Filtra por nombre o teléfono con 250 ms de retardo; vuelve a la página 1 | Siempre | CampaignContactsTable.tsx:48 |
| 3 | campo | Select `aria-label` «Filtrar por estado» · «Todos» · «Pendiente» · «En cola» · «Enviado» · «Entregado» · «Leído» · «Abierto» · «Clic» · «Respondió» · «Rebotado» · «Fallido» · «Omitido» | Filtra por estado del contacto | Siempre | CampaignContactsTable.tsx:49-52 · types.ts:22-24 |
| 4 | tabla | «Cliente» | Nombre («Sin nombre» si falta) + teléfono, email o destinatario crudo | Siempre | CampaignContactsTable.tsx:57 · 66 |
| 5 | badge | «Estado» | Verde entregado/leído/respondió, rojo fallido, ámbar pendiente/en cola, contorno omitido | Siempre | CampaignContactsTable.tsx:57 · 67 · 19 |
| 6 | tabla | «Enviado» | Hora con `formatTimeInTz` | Desde `md` (768) | CampaignContactsTable.tsx:57 · 68 |
| 7 | tabla | «Entregado» | Hora de `metadata.delivered_at` | Desde `md` | CampaignContactsTable.tsx:57 · 69 |
| 8 | tabla | «Leído» | Hora de `metadata.read_at` | Desde `md` | CampaignContactsTable.tsx:57 · 70 |
| 9 | tabla | «Respondió» | Hora de `replied_at` | Desde `lg` (1024) | CampaignContactsTable.tsx:57 · 71 |
| 10 | tabla | «Detalle» | Motivo de exclusión o etiqueta del error del proveedor | Desde `lg` | CampaignContactsTable.tsx:57 · 72-74 |
| 11 | botón | «→ oportunidad» | `/app/crm/oportunidades/{id}`, dentro de «Detalle» | Si trae `metadata.opportunity_id` | CampaignContactsTable.tsx:75 |
| 12 | estado | «Cargando…» (fila centrada) | Primera carga sin filas | — | CampaignContactsTable.tsx:59 |
| 13 | estado | «Sin contactos. Calcula la audiencia para materializar la campaña.» | Vacío | Sin resultados | CampaignContactsTable.tsx:60 |
| 14 | paginación | «Página {n} de {m}» + «Anterior» / «Siguiente» | `disabled` en los extremos | Solo si el total supera 50 | CampaignContactsTable.tsx:82-85 |

Cabecera `flex-col` hasta `sm` (640). Cuerpo `overflow-x-auto`, controles `h-8` y `text-xs`, buscador `w-48` y select `w-36`.

### E.6 Nueva campaña — armazón del wizard `components/crm/campanas/nuevo/CampanaNuevaPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | `aria-label` «Volver» (ArrowLeft) | `/app/crm/campanas` | Siempre | CampanaNuevaPage.tsx:104 |
| 2 | texto | «Nueva campaña de WhatsApp» | Título. **El wizard solo crea canal WhatsApp** (`channel: 'whatsapp'` fijo) | Siempre | CampanaNuevaPage.tsx:105 · 55 |
| 3 | texto | «CRM / Campañas / Nueva» | Migas de pan | Siempre | CampanaNuevaPage.tsx:105 |
| 4 | texto | «1. Canal y mensaje» · «2. Audiencia» · «3. Programación» · «4. Revisión» | Lista `ol` con `aria-label="Pasos"`; el actual lleva `aria-current="step"` y fondo esmeralda, los ya pasados esmeralda claro. **No son clicables** | Siempre | CampanaNuevaPage.tsx:28 · 108-110 |
| 5 | texto | Título del paso actual | Encabezado de la tarjeta | Siempre | CampanaNuevaPage.tsx:113 |
| 6 | botón | «Cancelar» (paso 1) / «Atrás» (resto) | Vuelve a la lista o retrocede un paso | Siempre; `disabled` al guardar | CampanaNuevaPage.tsx:156 |
| 7 | botón | «Guardar borrador» | Crea o actualiza y navega a su detalle | Siempre; `disabled` al guardar o si el paso 1 no valida | CampanaNuevaPage.tsx:158 · 86-89 |
| 8 | botón | «Continuar» (ArrowRight, `emerald-600`) | Avanza un paso | Pasos 1-3 | CampanaNuevaPage.tsx:159 |
| 9 | botón | «Lanzar ahora» / «Programar» (Rocket o spinner) | Guarda, materializa si hace falta y lanza; el texto cambia si hay fecha | Solo en el paso 4 | CampanaNuevaPage.tsx:160 |
| 10 | toast | «Borrador guardado» | — | Tras guardar borrador | CampanaNuevaPage.tsx:89 |
| 11 | toast | «Campaña lanzada» / «Campaña programada» + «{n} contactos en cola» | — | Tras lanzar | CampanaNuevaPage.tsx:93 |
| 12 | toast | «Supera el límite del WABA» / «No se pudo lanzar» + mensaje | El primer título solo con código `TIER_EXCEEDED` | Tras error | CampanaNuevaPage.tsx:96-97 |
| 13 | toast | «No se pudo calcular la audiencia» + mensaje | Error de materialización | Tras error | CampanaNuevaPage.tsx:82 |

Pie `flex-wrap justify-between`: en móvil «Cancelar» queda a la izquierda y el par «Guardar borrador» + «Continuar» puede bajar de línea. Los chips de pasos también envuelven.

**Validación por paso** (lo que habilita «Continuar»):
- Paso 1 (`step0ok`, l.50): canal elegido **y**, en «Plantilla aprobada», plantilla elegida con vista previa en estado `APPROVED`; en «Texto libre», texto no vacío.
- Paso 2 (`step1ok`, l.51): con origen «Segmento», exige segmento; con «Etapas del pipeline», al menos una etapa marcada.
- Paso 3: **sin validación** — «Continuar» nunca se deshabilita.
- Paso 4: «Lanzar ahora» exige audiencia ya calculada, con al menos un pendiente, y —si la plantilla es de categoría marketing— la casilla de opt-in marcada.

### E.7 Nueva campaña — paso 1 «Canal y mensaje» `CampanaNuevaPage.tsx` · `whatsapp/compose/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | «Nombre de la campaña» · placeholder «Ej: Novedades septiembre» | Se autocompleta con «{plantilla} · {fecha de hoy}» al elegir plantilla si estaba vacío | Paso 1 | CampanaNuevaPage.tsx:117 · 47 |
| 2 | campo | Select «Canal» · placeholder «Selecciona un canal» · opciones «{nombre} · {Cloud API\|Twilio\|QR}[ ({estado})][ · por defecto]» | Elige el canal de WhatsApp | Paso 1 | ChannelSelect.tsx:20 · 26-41 |
| 3 | estado | `Skeleton` en lugar del select | Carga | Mientras cargan los canales | ChannelSelect.tsx:21-22 |
| 4 | estado | «No hay canales de WhatsApp. Conéctalo en Chat → Canales.» (rojo, `role="alert"`) | Sin select | Sin canales | ChannelSelect.tsx:24 |
| 5 | tooltip | «Plantillas, adjuntos y texto en ventana de 24 h» · «Plantillas por Content API (+ fee por mensaje)» · «Solo texto e imágenes; sin plantillas. Riesgo de bloqueo por volumen» | Pista bajo el select, según el proveedor | Con canal elegido | ChannelSelect.tsx:9-13 · 43 |
| 6 | pestaña | «Plantilla aprobada (recomendado)» | Modo plantilla | Paso 1; `disabled` si el canal no admite plantillas (QR) | CampanaNuevaPage.tsx:120 |
| 7 | pestaña | «Texto libre (solo ventana abierta)» | Modo texto | Paso 1 | CampanaNuevaPage.tsx:121 |
| 8 | campo | placeholder «Buscar por nombre…» (`aria-label` «Buscar plantilla») | Filtra plantillas | Modo plantilla | TemplatePicker.tsx:51 |
| 9 | campo | Select `aria-label` «Categoría» · «Todas» · «Utility» · «Marketing» · «Autenticación» | Filtra por categoría | Modo plantilla | TemplatePicker.tsx:53-61 |
| 10 | tabla | Lista `role="listbox"` `aria-label` «Plantillas aprobadas», `max-h 160px` con scroll; cada fila: nombre monoespaciado + badge de categoría + idioma | — | Modo plantilla | TemplatePicker.tsx:63-75 |
| 11 | badge | «Utility» / «Marketing» (variante `warning`) / «Autenticación» | Categoría | Por fila | TemplatePicker.tsx:13 · 69 |
| 12 | estado | «Cargando…» (fila con spinner) | Carga | Mientras cargan plantillas | TemplatePicker.tsx:64 |
| 13 | estado | «Sin resultados» | Filtro vacío | Modo plantilla | TemplatePicker.tsx:74 |
| 14 | estado | «No tienes plantillas aprobadas» + «Crea una en Plantillas › WhatsApp y envíala a aprobación, o sincroniza las existentes desde Meta.» (bloque punteado) | Sustituye a todo el selector | Sin plantillas | TemplatePicker.tsx:33-43 |
| 15 | botón | «Crear plantilla» | `/app/crm/plantillas?tab=whatsapp` | En ese vacío | TemplatePicker.tsx:39 · CampanaNuevaPage.tsx:123 |
| 16 | campo | Etiqueta `{{nombre}}` (monoespaciada) · placeholder «Requerido» si falta valor | Un campo por variable de la plantilla; borde ámbar cuando falta | Con plantilla y variables | TemplatePicker.tsx:83-89 |
| 17 | texto | «← {origen}[ · ⚠ falta valor]» | De dónde sale cada variable | Bajo cada variable | TemplatePicker.tsx:87 |
| 18 | cálculo | «Costo: {gratis (dentro de la ventana) \| etiqueta}» | Coste unitario estimado (`aria-live="polite"`) | Con plantilla elegida | CostEstimate.tsx:12-16 |
| 19 | estado | «Calculando costo…» | Mientras llega la vista previa | Con plantilla elegida | CostEstimate.tsx:9 |
| 20 | campo | Textarea «Mensaje» · placeholder «Hola {{contact.first_name}}, ¿pudiste ver la propuesta?» · 5 filas, tope 4096 | — | Modo texto libre | MessageForm.tsx:34-35 |
| 21 | texto | «Las variables {{…}} se resuelven con los datos del cliente y la oportunidad.» + contador «{n} / 4096» | Ayuda y contador | Modo texto libre | MessageForm.tsx:36-39 |
| 22 | chip | `{{contact.first_name}}` · `{{contact.full_name}}` · `{{opportunity.name}}` · `{{opportunity.amount}}` · `{{user.first_name}}` · `{{org.name}}` | Inserta la variable al final del texto | Modo texto libre | MessageForm.tsx:13 · 42-44 |
| 23 | texto | «Variables sin valor por defecto ({lista}): escríbelas arriba; se aplicarán a todos los contactos.» | Aviso ámbar | Si la vista previa reporta variables faltantes | CampanaNuevaPage.tsx:125 |

El paso apila todo en una columna con `space-y-4`. Los campos de variable usan rejilla fija `[110px_1fr]`, que a 375 px deja el campo muy corto.

### E.8 Nueva campaña — pasos 2, 3 y 4 `AudienceStep.tsx` · `ScheduleStep.tsx` · `CampanaNuevaPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | toggle | Radios «Etapas del pipeline» / «Segmento de clientes» (`radiogroup` `aria-label` «Origen de la audiencia») | Elige el origen | Paso 2 | AudienceStep.tsx:31-34 |
| 2 | campo | Select «Segmento» · placeholder «Seleccionar segmento» · cada opción con icono Users, nombre y badge del número de clientes | — | Origen «Segmento» | AudienceStep.tsx:38-42 |
| 3 | texto | «≈ {n} clientes antes de exclusiones (opt-out, sin teléfono, duplicados).» | Estimación | Con segmento elegido | AudienceStep.tsx:43 |
| 4 | estado | «No hay segmentos. Créalos en CRM › Segmentos.» | **Sin enlace** | Sin segmentos | AudienceStep.tsx:44 |
| 5 | campo | Select «Pipeline» · placeholder «Pipeline» | Al cambiar limpia las etapas marcadas; se preselecciona el pipeline por defecto | Origen «Etapas del pipeline» | AudienceStep.tsx:48-52 · 21 |
| 6 | texto | «Se incluyen las oportunidades **abiertas** de las etapas marcadas (una por cliente).» | Nota con «abiertas» en negrita | Origen «Etapas del pipeline» | AudienceStep.tsx:53 |
| 7 | toggle | Casilla por etapa, `aria-label` con su nombre | Marca o desmarca la etapa | Una por etapa del pipeline; una columna hasta `sm` (640), dos desde ahí | AudienceStep.tsx:54-57 |
| 8 | estado | «Sin etapas.» | Vacío | Pipeline sin etapas | AudienceStep.tsx:58 |
| 9 | texto | «Enviar» | Etiqueta del grupo | Paso 3 | ScheduleStep.tsx:14 |
| 10 | toggle | «Ahora» | Borra la fecha programada; se resalta en esmeralda cuando no hay fecha | Paso 3 | ScheduleStep.tsx:16 |
| 11 | campo | `datetime-local` `aria-label` «Fecha y hora de envío» | Mínimo «ahora + 5 minutos» (calculado con `toISOString()`, es decir en UTC — §G) | Paso 3 | ScheduleStep.tsx:17 |
| 12 | campo | Deslizador «Velocidad: {n} mensajes/segundo (≈ {n×60}/min · 1.000 contactos en ≈ {m} min)» | Throttle de 1 a 80 msg/s, paso 1 | Paso 3 | ScheduleStep.tsx:21-22 |
| 13 | cálculo | — | Minutos para 1.000 contactos = techo(1000 / throttle / 60) | Paso 3 | ScheduleStep.tsx:10 |
| 14 | texto | «Meta permite hasta 80 msg/s por número; el límite real es el tier de usuarios únicos/24 h del WABA (se verifica al lanzar).» | Nota al pie | Paso 3 | ScheduleStep.tsx:23 |
| 15 | toggle | «Respetar el horario permitido de contacto (Configuración › WhatsApp)» | — | Paso 3 | ScheduleStep.tsx:25 |
| 16 | texto | Resumen: «Nombre» · «Canal» («{canal} · {proveedor}») · «Mensaje» («Plantilla {nombre} ({categoría})» o «Texto libre ({n} chars)») · «Audiencia» («Segmento» o «{n} etapas») · «Programación» («{fecha \| Inmediata} · {n} msg/s · {respeta horario \| sin horario}») | — | Paso 4 | CampanaNuevaPage.tsx:133-137 |
| 17 | texto | «Audiencia calculada» | Título del bloque enmarcado | Paso 4 | CampanaNuevaPage.tsx:140 |
| 18 | botón | «Calcular audiencia» / «Recalcular» | Guarda y llama a `POST …/materialize`; spinner mientras corre | Paso 4; `disabled` mientras trabaja | CampanaNuevaPage.tsx:140 |
| 19 | cálculo | «{n} pendientes · {m} excluidos de {t}[ · costo estimado ≈ ${x} USD]» | Resultado de la materialización | Tras calcular | CampanaNuevaPage.tsx:143 |
| 20 | chip | «{motivo de exclusión}: {n}» | Un chip por motivo (etiquetas de `SKIP_REASON_LABELS`, ver E.4) | Tras calcular, si hay exclusiones | CampanaNuevaPage.tsx:144 |
| 21 | estado | «Nadie cumple los criterios: revisa la audiencia o la plantilla.» (ámbar) | — | Si los pendientes son 0 | CampanaNuevaPage.tsx:145 |
| 22 | texto | «Calcula la audiencia para ver pendientes, exclusiones y costo antes de lanzar.» | Antes del primer cálculo | Paso 4 sin materializar | CampanaNuevaPage.tsx:147 |
| 23 | toggle | «He verificado que la audiencia dio su consentimiento (opt-in) para marketing (Habeas Data)» | Bloquea el lanzamiento hasta marcarla | Solo si la plantilla es de categoría `marketing` | CampanaNuevaPage.tsx:149 · 49 |

El resumen del paso 4 usa una rejilla fija `[140px_1fr]` que **no se adapta**: a 375 px la columna de etiquetas se come casi la mitad del ancho.

### E.9 Identidades — cabecera, KPIs y filtros `components/crm/identidades/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Identidades Omnicanal» (h1, icono Fingerprint sobre cuadro azul) | Título | Siempre | IdentidadesPage.tsx:208-214 |
| 2 | texto | «Gestiona identidades y resuelve duplicados» | Subtítulo | Siempre | IdentidadesPage.tsx:215-217 |
| 3 | botón | «Actualizar» (RefreshCw) | Recarga canales, identidades y estadísticas | Siempre; gira y `disabled` al cargar | IdentidadesPage.tsx:221-229 |
| 4 | botón | «Exportar CSV» (FileDown, `bg-blue-600`) | Genera el CSV en el navegador con las identidades ya filtradas | Siempre | IdentidadesPage.tsx:230-237 |
| 5 | toast | «Exportación completada» + «El archivo CSV ha sido descargado» | — | Tras exportar | IdentidadesPage.tsx:197-200 |
| 6 | toast | «Error» + «No se pudieron cargar las identidades» | — | Tras error | IdentidadesPage.tsx:83-87 |
| 7 | stat | «Total» (Users, azul) | Emails + teléfonos + WhatsApp. **Cuenta doble** el teléfono (§G) | Siempre | IdentidadesStats.tsx:20-26 · 81-102 |
| 8 | stat | «Teléfono» (Phone, verde) | Clientes con teléfono | Siempre | IdentidadesStats.tsx:27-33 |
| 9 | stat | «Email» (Mail, morado) | Clientes con email distinto de `@widget.local` | Siempre | IdentidadesStats.tsx:34-40 |
| 10 | stat | «WhatsApp» (MessageSquare, esmeralda) | Clientes con teléfono en formato internacional («+») | Siempre | IdentidadesStats.tsx:41-47 · IdentidadesService.ts:331 |
| 11 | stat | «Verificados» (CheckCircle, teal) | Emails + teléfonos (se **asumen** verificados) | Siempre | IdentidadesStats.tsx:48-54 · Service:341 |
| 12 | stat | «Sin verificar» (XCircle, naranja) | Solo las identidades de WhatsApp | Siempre | IdentidadesStats.tsx:55-61 · Service:342 |
| 13 | estado | 6 tarjetas `animate-pulse` con dos barras grises | Primera carga | — | IdentidadesStats.tsx:64-78 |
| 14 | texto | «Filtros» (icono Filter) | Encabezado del panel | Siempre | IdentidadesFiltros.tsx:43-46 |
| 15 | botón | «Limpiar» (X) | Devuelve todos los filtros a su valor inicial | Solo con algún filtro activo | IdentidadesFiltros.tsx:47-52 |
| 16 | campo | «Buscar» · placeholder «Teléfono, email...» | Busca en email, teléfono y nombre sobre `customers` | Siempre | IdentidadesFiltros.tsx:57-68 |
| 17 | campo | Select «Tipo» · placeholder «Todos los tipos» · «Todos los tipos» · «Teléfono» · «Email» · «WhatsApp ID» | Filtra por tipo de identidad | Siempre | IdentidadesFiltros.tsx:71-87 |
| 18 | campo | Select «Canal» · placeholder «Todos los canales» · «Todos los canales» + un ítem por canal | **Sin efecto** (§G) | Siempre | IdentidadesFiltros.tsx:90-108 |
| 19 | campo | Select «Estado» · placeholder «Todos» · «Todos» · «Verificados» · «No verificados» | **Sin efecto** (§G) | Siempre | IdentidadesFiltros.tsx:111-129 |
| 20 | toggle | «Duplicados» · texto «Ver duplicados» ↔ «Mostrando duplicados» | Cambia la tabla por el panel de duplicados y dispara su consulta | Siempre | IdentidadesFiltros.tsx:132-143 · IdentidadesPage.tsx:77-80 |

KPIs `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`. Filtros: una columna hasta `sm` (640), dos hasta `lg` (1024), cinco desde ahí. **No hay botón de crear identidad**, aunque el icono `Plus` está importado.

### E.10 Identidades — tabla, paginación y diálogo de edición `components/crm/identidades/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | tabla | «Tipo» → icono coloreado + «Teléfono» / «Email» / «WhatsApp» | La etiqueta de texto solo desde `xs` (475) | Siempre | IdentidadesTable.tsx:128 · 147-156 |
| 2 | tabla | «Valor» → `code` monoespaciado sobre fondo gris, truncado a 100 px en móvil | — | Siempre | IdentidadesTable.tsx:129 · 157-161 |
| 3 | tabla | «Cliente» → nombre («Sin nombre») + email o teléfono, truncados a 120 px | — | Desde `sm` (640) | IdentidadesTable.tsx:130 · 162-171 |
| 4 | tabla | «Canal» → badge con el nombre del canal, o «-» | **Siempre «-»** (§G) | Desde `md` (768) | IdentidadesTable.tsx:131 · 172-180 |
| 5 | badge | «Verificado» (verde, CheckCircle) / «✓» | El texto solo desde `xs`; debajo se ve el símbolo | Siempre | IdentidadesTable.tsx:182-187 |
| 6 | badge | «Sin verificar» (naranja, XCircle) / «✗» | — | Siempre | IdentidadesTable.tsx:188-193 |
| 7 | tabla | «Última actividad» → tiempo relativo en español (`formatDistanceToNow`) o «Nunca» | — | Desde `lg` (1024) | IdentidadesTable.tsx:133 · 196-203 |
| 8 | menú | Trigger (MoreVertical, **sin `aria-label`**) | Abre el menú de fila | Siempre | IdentidadesTable.tsx:206-210 |
| 9 | menú | «Verificar» (Shield) | Marca la identidad como verificada | Solo si no está verificada | IdentidadesTable.tsx:212-217 |
| 10 | menú | «Editar» (Edit) | Abre el diálogo de edición | Siempre | IdentidadesTable.tsx:218-221 |
| 11 | menú | «Eliminar» (Trash2, rojo) | Pide confirmación nativa y borra | Siempre | IdentidadesTable.tsx:222-228 |
| 12 | estado | 5 barras grises `animate-pulse` | Carga | — | IdentidadesTable.tsx:100-110 |
| 13 | estado | «No se encontraron identidades» (tarjeta centrada, sin acción) | Vacío | Lista vacía | IdentidadesTable.tsx:112-120 |
| 14 | diálogo | **`confirm()` nativo**: «¿Estás seguro de eliminar esta identidad?» | Confirmación | Al pulsar «Eliminar» | IdentidadesPage.tsx:152 |
| 15 | paginación | «Mostrando {a} a {b} de {n} identidades» | Rango | Si hay elementos | IdentidadesPagination.tsx:60-62 |
| 16 | campo | Select 10 · 25 · 50 · 100 + «por página» | Cambia el tamaño y vuelve a la 1 | Si hay elementos | IdentidadesPagination.tsx:22 · 64-79 |
| 17 | paginación | «Anterior» (ChevronLeft) | El texto solo desde `sm` (640); `disabled` en la primera | Si hay elementos | IdentidadesPagination.tsx:84-93 |
| 18 | paginación | Números de página (hasta 5, centrados en la actual; la activa en `bg-blue-600`) | Salta a esa página | Si hay elementos | IdentidadesPagination.tsx:35-51 · 95-109 |
| 19 | paginación | «Siguiente» (ChevronRight) | `disabled` en la última | Si hay elementos | IdentidadesPagination.tsx:111-120 |
| 20 | diálogo | «Editar Identidad» | Sin descripción bajo el título | Al pulsar «Editar» | IdentidadesPage.tsx:271-273 |
| 21 | campo | «Tipo» | **Siempre deshabilitado**, fondo gris | En el diálogo | IdentidadesPage.tsx:276-281 |
| 22 | campo | «Valor» · placeholder «Teléfono, email, etc.» | Edita el valor | En el diálogo | IdentidadesPage.tsx:283-289 |
| 23 | toggle | «Verificado» | Marca la identidad como verificada | En el diálogo | IdentidadesPage.tsx:291-297 |
| 24 | botón | «Cancelar» / «Guardar» (`bg-blue-600`) | Envía el cambio y recarga | En el diálogo | IdentidadesPage.tsx:300-305 |
| 25 | toast | «Identidad actualizada» + «Los cambios han sido guardados» · «Identidad verificada» + «La identidad ha sido marcada como verificada» · «Identidad eliminada» + «La identidad ha sido eliminada» | **Todos mienten**: ninguna de las tres acciones escribe nada (§G) | Tras la acción | IdentidadesPage.tsx:104-107 · 136-139 · 160-163 |
| 26 | toast | «Error» + «No se pudo actualizar la identidad» / «No se pudo verificar la identidad» / «No se pudo eliminar la identidad» | Destructivo | Tras error | IdentidadesPage.tsx:110-114 · 143-147 · 165-169 |

Tabla en `overflow-x-auto`; en móvil solo quedan Tipo (icono), Valor y el menú. La paginación es `flex-col` hasta `sm`: en móvil todo se apila y la fila de números gana scroll propio (`overflow-x-auto pb-2`). Objetivo táctil forzado a `min-h-[36px]`.

### E.11 Identidades — panel de duplicados `components/crm/identidades/DuplicadosPanel.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Posibles Duplicados ({n})» (AlertTriangle naranja) | Título del panel | Con el toggle de duplicados activo | DuplicadosPanel.tsx:104-109 |
| 2 | badge | «Teléfono» / «Email» / {tipo crudo} | Tipo de la identidad duplicada | Por grupo | DuplicadosPanel.tsx:119-122 |
| 3 | texto | Valor duplicado en `code` monoespaciado | — | Por grupo | DuplicadosPanel.tsx:123-125 |
| 4 | botón | «Unificar» (Users) | Abre el diálogo de fusión con ese grupo | Por grupo | DuplicadosPanel.tsx:127-139 |
| 5 | texto | Nombre («Sin nombre») + email o teléfono + conteos de conversaciones y oportunidades (MessageSquare y Target) | Ficha de cada cliente del grupo | Por cliente; una columna hasta `sm`, dos desde ahí | DuplicadosPanel.tsx:143-167 |
| 6 | estado | «Posibles Duplicados» + 3 bloques `animate-pulse` | Carga | — | DuplicadosPanel.tsx:34-47 |
| 7 | estado | «Sin duplicados» + «No se encontraron identidades duplicadas en tu base de datos» (icono Check en círculo verde) | Vacío | Sin grupos | DuplicadosPanel.tsx:49-65 |
| 8 | diálogo | «Unificar Clientes» + «Selecciona el cliente principal. Los demás clientes seleccionados serán fusionados en él.» | — | Al pulsar «Unificar» | DuplicadosPanel.tsx:177-180 |
| 9 | texto | «Identidad duplicada: {valor}» | Contexto dentro del diálogo | En el diálogo | DuplicadosPanel.tsx:185-189 |
| 10 | toggle | Fila con nombre + email/teléfono + «{n} conv. • {m} ops.» | Clic en la fila lo elige como principal y marca los demás como secundarios | Una por cliente del grupo | DuplicadosPanel.tsx:192-235 |
| 11 | toggle | Casilla sin etiqueta | Marca o desmarca ese cliente como secundario; en el principal la sustituye un círculo azul con check | Por cliente no principal | DuplicadosPanel.tsx:204-214 |
| 12 | badge | «Principal» (azul) | Señala el destino de la fusión | En la fila del principal | DuplicadosPanel.tsx:229-233 |
| 13 | estado | «⚠️ Se fusionarán {n} cliente(s) en el cliente principal. Las conversaciones, oportunidades y actividades serán transferidas.» (naranja; **emoji, único del módulo**) | Aviso antes de confirmar | Con principal y al menos un secundario | DuplicadosPanel.tsx:238-243 |
| 14 | botón | «Cancelar» / «Fusionar clientes» / «Fusionando...» (`bg-blue-600`) | Ejecuta la fusión; `disabled` sin principal, sin secundarios o mientras corre | En el diálogo | DuplicadosPanel.tsx:248-255 |
| 15 | toast | «Clientes fusionados» + «{n} cliente(s) fusionado(s) correctamente» / «Error» + «Error al fusionar clientes» | — | Tras fusionar | IdentidadesPage.tsx:179-189 · Service:296-307 |

Diálogo `max-w-lg`; en móvil la fila de cliente (casilla + datos + conteos + badge «Principal») queda apretada porque **no envuelve**.

### E.12 Objeciones — cabecera y filtros `components/crm/objeciones/**`

Es la pantalla mejor terminada de todo el módulo: sin `alert()`, sin `confirm()`, sin handlers vacíos, sin imports muertos, con validación, retorno de foco y estados vacíos completos. Úsala de referencia para rehacer Identidades.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Objeciones» (h1) | Título | Siempre | ObjecionesPage.tsx:109 |
| 2 | texto | «Lo que dice el cliente, cómo responder y qué preguntar. El vendedor las registra en la oportunidad con dos clics.» | Subtítulo | Siempre | ObjecionesPage.tsx:110-112 |
| 3 | botón | `aria-label` «Actualizar lista» (RefreshCw; gira solo con `motion-safe`) | `GET /api/crm/objections?includeInactive=true` | Siempre; `disabled` al refrescar | ObjecionesPage.tsx:115-117 |
| 4 | botón | «Nueva objeción» (Plus, `bg-blue-600`) | Abre la hoja en creación; también es el destino de foco tras borrar | Siempre | ObjecionesPage.tsx:118-120 |
| 5 | estado | «No se pudieron cargar las objeciones» / «No se pudo actualizar la lista» + «{error}. Pulsa «Actualizar» para reintentar.» / «{error}. Se muestra la última lista conocida; pulsa «Actualizar» para reintentar.» | El título cambia según si ya hubo una carga buena | Tras error | ObjecionesPage.tsx:124-131 |
| 6 | estado | Barra de filtros + 6 tarjetas `Skeleton` de 192 px (`aria-label` «Cargando objeciones») | Primera carga | — | ObjecionesPage.tsx:133-139 |
| 7 | campo | `sr-only` «Buscar objeciones» · placeholder «Buscar por título, señal o respuesta…» | Filtra en cliente por título, categoría, respuesta, señales y preguntas, **ignorando tildes** | Con al menos una objeción | ObjectionsToolbar.tsx:53-61 · objectionModel.ts:69-86 |
| 8 | chip | «Todas» · «Activas» · «Inactivas» (`aria-pressed`) | Filtro de estado | Siempre | ObjectionsToolbar.tsx:25-29 · 64-68 |
| 9 | texto | «Categoría:» | Rótulo del grupo | Siempre | ObjectionsToolbar.tsx:73 |
| 10 | chip | «Precio» · «Competencia» · «Momento» · «Decisor» · «Funcionalidad» · «Confianza» · «Implementación» · «Otra» | Filtra por categoría; pulsar el activo devuelve a «todas» | Solo las categorías presentes en el catálogo | ObjectionsToolbar.tsx:44 · 75-83 · objectionModel.ts:17-26 |
| 11 | chip | {categoría escrita a mano} | Chip extra por categoría fuera del catálogo | Si existen filas con categoría libre | ObjectionsToolbar.tsx:46 |
| 12 | botón | «Quitar filtros ({n})» (X) | Restablece los tres filtros | Solo con algún filtro activo | ObjectionsToolbar.tsx:85-90 · objectionModel.ts:65-67 |
| 13 | texto | «{n} objeciones» / «{n} objeción» / «{m} de {n} objeciones» (`aria-live="polite"`) | Contador de resultados | Siempre | ObjectionsToolbar.tsx:91-93 |

Cabecera `flex-wrap`. La barra de filtros es toda `flex-wrap`: el buscador tiene `min-w-[220px] flex-1`, así que en móvil ocupa la línea completa. El contador va `ml-auto`. Chip activo `bg-blue-600` con texto blanco (contraste 5,2:1, comentado en el código).

### E.13 Objeciones — tarjeta y estados vacíos `ObjectionCard.tsx` · `ObjectionsEmptyState.tsx` · `ObjecionesPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | Título de la objeción (h3) | Da nombre accesible a la tarjeta | Por tarjeta | ObjectionCard.tsx:117-119 |
| 2 | badge | «Precio» · «Competencia» · «Momento» · «Decisor» · «Funcionalidad» · «Confianza» · «Implementación» · «Sin categoría» | Icono y color propios por categoría | Por tarjeta | categoryMeta.tsx:21-31 · 43-50 |
| 3 | toggle | `aria-label` «Activar/Desactivar la objeción {título}» | `PATCH /api/crm/objections/{id}`; `disabled` al guardar | Por tarjeta | ObjectionCard.tsx:123-129 |
| 4 | estado | «Activa» (verde, CheckCircle2) / «Inactiva» (gris, PauseCircle) | Repite el estado en texto e icono, no solo en color | Por tarjeta | ObjectionCard.tsx:130-133 |
| 5 | chip | «{señal}» entre comillas angulares (lista `aria-label` «Señales de detección», **máximo 6**) | Frases que dice el cliente | Si hay señales | ObjectionCard.tsx:42-55 · 137-138 |
| 6 | texto | «+{n} más» | Resto de señales | Con más de 6 | ObjectionCard.tsx:53 |
| 7 | estado | «Sin señales de detección: añade frases que diga el cliente.» (cursiva) | Vacío | Sin señales | ObjectionCard.tsx:140 |
| 8 | botón | «Cómo responder» (MessageSquareReply + ChevronDown que rota) | Pliega y despliega la guía; `aria-expanded` + `aria-controls` | Si hay respuesta o preguntas | ObjectionCard.tsx:68-80 |
| 9 | texto | Respuesta recomendada | Cuerpo del panel desplegado | Al desplegar, si hay respuesta | ObjectionCard.tsx:84 |
| 10 | texto | «Preguntas de discovery» (HelpCircle) + lista con viñetas | — | Al desplegar, si hay preguntas | ObjectionCard.tsx:86-93 |
| 11 | botón | `aria-label` «Editar {título}» (Pencil) + tooltip con el mismo texto | Abre la hoja en edición | Por tarjeta | ObjectionCard.tsx:146-148 · 28-39 |
| 12 | botón | `aria-label` «Eliminar {título}» (Trash2 rojo) + tooltip | Abre la confirmación | Por tarjeta | ObjectionCard.tsx:149-151 |
| 13 | toast | ««{título}» activada» / ««{título}» desactivada» / «No se pudo cambiar el estado» + mensaje | — | Tras conmutar | ObjecionesPage.tsx:67 · 69 |
| 14 | atajo | — | Tras conmutar, si el foco cayó al `body`, vuelve al interruptor `objection-active-{id}` | Tras conmutar | ObjecionesPage.tsx:78-82 |
| 15 | estado | «Prepara las respuestas antes de la llamada» + «Una objeción guarda lo que dice el cliente («es muy caro»), cómo responderle y qué preguntarle. El vendedor la registra en la oportunidad con dos clics.» (icono MessageSquareWarning en círculo azul) | Vacío del catálogo | Catálogo completamente vacío | ObjectionsEmptyState.tsx:30-42 |
| 16 | botón | «Crear la primera objeción» (Plus, `bg-blue-600`) | Abre la hoja en creación | En ese vacío | ObjectionsEmptyState.tsx:39-41 |
| 17 | estado | «Ninguna objeción coincide con los filtros» (tarjeta punteada) | Vacío por filtros | Hay objeciones pero ninguna pasa | ObjectionsEmptyState.tsx:21-27 |
| 18 | botón | «Quitar filtros» | Restablece | En ese vacío | ObjectionsEmptyState.tsx:25 |
| 19 | diálogo | «Eliminar objeción» + «Se eliminará «{título}» del catálogo. Las oportunidades donde ya estaba registrada perderán ese registro. Esta acción no se puede deshacer.» | Nombra la objeción concreta | Al pulsar «Eliminar» | ObjecionesPage.tsx:177-178 |
| 20 | botón | «Cancelar» / «Eliminar» (destructivo, `bg-red-600`) | `DELETE /api/crm/objections/{id}` | En el diálogo | ObjecionesPage.tsx:179-181 · confirm-dialog.tsx:48 |
| 21 | toast | ««{título}» eliminada» / «No se pudo eliminar» + mensaje | — | Tras borrar | ObjecionesPage.tsx:89 · 91 |
| 22 | atajo | — | Tras borrar, el foco salta a «Nueva objeción»; si se canceló, vuelve al «Eliminar» de la tarjeta | Al cerrar la confirmación | ObjecionesPage.tsx:42-53 |

Tarjetas en `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`. La inactiva se dibuja con **borde punteado**. Las acciones van al pie, tras una línea superior, a la derecha, con `mt-auto` para alinearlas entre tarjetas de distinta altura. Entrada y salida animadas (`StaggerList` / `AnimatePresence`).

### E.14 Objeciones — hoja de creación y edición `ObjectionEditorSheet.tsx` · `CategoryChips.tsx` · `ObjectionEditorFooter.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Nueva objeción» / «Editar objeción» | Hoja lateral derecha | Con la hoja abierta | ObjectionEditorSheet.tsx:150-152 |
| 2 | texto | «Qué dice el cliente, cómo responder y qué preguntar. El vendedor lo verá al registrarla en una oportunidad.» | Descripción | Siempre | ObjectionEditorSheet.tsx:153-156 |
| 3 | campo | «Título» · placeholder «Es muy caro» | Tope real de escritura 140 caracteres, **validación a 120** | Siempre | ObjectionEditorSheet.tsx:168-180 · objectionModel.ts:106 |
| 4 | texto | «Tal como la diría el cliente. Máximo 120 caracteres.» | Ayuda | Si no hay error de título | ObjectionEditorSheet.tsx:190-196 |
| 5 | estado | «Escribe el título de la objeción.» / «Máximo 120 caracteres.» (`role="alert"`) | Sustituye a la ayuda; el foco salta al campo | Al enviar con título inválido | objectionModel.ts:153-154 · ObjectionEditorSheet.tsx:181-188 · 105-110 |
| 6 | chip | Leyenda «Categoría» · «Precio» · «Competencia» · «Momento» · «Decisor» · «Funcionalidad» · «Confianza» · «Implementación» · «Otra» | `fieldset` con radios reales ocultos y etiquetas como chips: Tab entra una vez, las flechas recorren | Siempre | CategoryChips.tsx:27-65 · objectionModel.ts:17-26 |
| 7 | estado | «Elige una categoría.» | Error del grupo por `aria-describedby` del `fieldset`; el foco va al primer chip | Al enviar sin categoría | CategoryChips.tsx:66-74 · objectionModel.ts:155 |
| 8 | campo | Textarea «Señales de detección» · placeholder «caro / presupuesto / costoso» · 3 filas | Una señal por línea; se recortan y se eliminan duplicados al guardar | Siempre | ObjectionEditorSheet.tsx:206-216 · objectionModel.ts:108-118 |
| 9 | texto | «Una frase o palabra por línea: lo que dice el cliente cuando aparece esta objeción.» | Ayuda | Siempre | ObjectionEditorSheet.tsx:217-222 |
| 10 | campo | Textarea «Respuesta recomendada» · placeholder «Reencuadrar en valor: costo por día frente al ahorro…» · 4 filas | Vacía se guarda como nulo | Siempre | ObjectionEditorSheet.tsx:226-238 |
| 11 | campo | Textarea «Preguntas de discovery» · placeholder «¿Con qué lo comparas? / ¿Qué presupuesto tienen asignado?» · 3 filas | Una pregunta por línea | Siempre | ObjectionEditorSheet.tsx:242-255 |
| 12 | texto | «Una pregunta por línea.» | Ayuda | Siempre | ObjectionEditorSheet.tsx:256-261 |
| 13 | estado | «No se pudo guardar» + «{error}. Revisa los datos y vuelve a intentarlo.» | `Alert` destructivo enfocable al final del formulario | Tras error del servidor | ObjectionEditorSheet.tsx:264-271 |
| 14 | toggle | «Activa» ↔ «Inactiva» | Interruptor del pie; la etiqueta envolvente fuerza objetivo táctil `min-h-11` (≥44 px) | Siempre; `disabled` al guardar | ObjectionEditorFooter.tsx:46-57 |
| 15 | botón | «Cancelar» | Cierra la hoja | Siempre; `disabled` al guardar | ObjectionEditorFooter.tsx:61-69 |
| 16 | botón | «Crear objeción» / «Guardar cambios» / «Guardando…» (`bg-blue-600`) | Valida y envía `POST` o `PATCH` | Siempre | ObjectionEditorFooter.tsx:70-77 |
| 17 | toast | «Objeción creada» / «Objeción actualizada» + ««{título}»[ (inactiva)]» | — | Tras guardar | ObjectionEditorSheet.tsx:116-119 |
| 18 | atajo | — | Al cerrar, el foco vuelve al botón que abrió; si ya no existe, a «Nueva objeción» | Al cerrar la hoja | ObjectionEditorSheet.tsx:81 · ObjecionesPage.tsx:171 |

La hoja ocupa el 100 % del ancho hasta `sm` (640) y `max-w-xl` desde ahí. Usa `h-dvh` y **no desplaza**: solo el cuerpo (`flex-1 min-h-0 overflow-y-auto`) tiene scroll; el pie queda fijo abajo con `env(safe-area-inset-bottom)` para el borde inferior de iPhone. El pie es una sola fila también a 375 px; si el texto no cabe, el interruptor sube a su propia línea. Estas clases están fijadas por `__tests__/mobileLayout.test.ts`: al calcarlas en Figma hay que respetar hoja sin scroll, cuerpo con scroll y pie anclado.

### E.15 Diálogo «Registrar objeción» — **se abre desde la oportunidad** `components/crm/objeciones/RegisterObjectionDialog.tsx`

No se alcanza desde `/app/crm/objeciones`: se abre desde la barra lateral del detalle de oportunidad y desde la pestaña «Resumen» del cajón del pipeline.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Registrar objeción» | — | Desde la oportunidad | RegisterObjectionDialog.tsx:53 · DetailSidebar.tsx:102 · ResumenTab.tsx:100 |
| 2 | texto | «Elige lo que dijo el cliente. Se registra al instante y verás cómo responder.» | Descripción | Siempre | RegisterObjectionDialog.tsx:54-56 |
| 3 | campo | placeholder «Buscar por título o señal…» (`aria-label` «Buscar objeción») | Filtra el catálogo en cliente, con el mismo filtro de la biblioteca | Siempre | RegisterObjectionDialog.tsx:59 |
| 4 | tabla | Lista `cmdk` de `max-h 224px`; cada ítem: título truncado + badge de categoría | — | Siempre | RegisterObjectionDialog.tsx:60-88 |
| 5 | menú | Título de la objeción | Al elegirla la registra al instante junto con la nota | Por objeción filtrada | RegisterObjectionDialog.tsx:68-85 |
| 6 | badge | «Ya registrada» (icono Check) | Marca las pendientes; el ítem queda `disabled` | Si ya está registrada y sin resolver | RegisterObjectionDialog.tsx:80-84 |
| 7 | estado | Spinner Loader2 en el ítem que se registra; el resto se deshabilita | Mientras registra | — | RegisterObjectionDialog.tsx:71 · 79 |
| 8 | estado | «El catálogo está vacío: créalo en CRM › Objeciones.» / «Ninguna objeción coincide.» | El primero sin catálogo, el segundo sin coincidencias | Siempre | RegisterObjectionDialog.tsx:61-63 |
| 9 | campo | «Nota (opcional)» · placeholder «Ej.: lo dijo al ver el precio anual» (máx. 280) | Nota de una línea que viaja con el registro | Siempre | RegisterObjectionDialog.tsx:91-100 |
| 10 | texto | «Vista previa: {título}» + guía desplegada en modo compacto | Muestra la respuesta y las preguntas de la objeción resaltada | Si hay alguna resaltada o al menos una en la lista | RegisterObjectionDialog.tsx:102-110 |

`max-w-lg` desde `sm` (640), sin relleno propio (`p-0`): cabecera, lista, nota y vista previa quedan separadas por líneas horizontales. La vista previa **no** es `aria-live` a propósito: `cmdk` ya anuncia la opción resaltada.

---

## F. Leads, equipo, partners, automatizaciones y agentes IA

### F.1 Leads — cabecera, buscador y tabla `app/app/crm/leads/page.tsx`

**No existe tabla `leads`**: un lead es una fila de `opportunities` con `record_type = 'lead'` (§H).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Leads» (h1, `text-xl sm:text-2xl`) | Título | Siempre | page.tsx:252-254 |
| 2 | stat | «{n} lead{s} sin convertir a deal» | Cuenta `leads.length`; pluraliza con `s` si ≠ 1 | Siempre | page.tsx:255-257 |
| 3 | botón | «Actualizar» (RefreshCw) | `GET /api/crm/leads` | Siempre; `disabled` al cargar | page.tsx:260-273 |
| 4 | estado | Loader2 girando dentro del botón | Sustituye a RefreshCw | `isLoading` | page.tsx:267-271 |
| 5 | botón | «Nuevo lead» (Plus, `bg-blue-600`) | Abre `NewLeadDialog` | Siempre | page.tsx:274-281 |
| 6 | campo | placeholder «Buscar por nombre o cliente...» (icono Search decorativo) | Filtra **en memoria** por `lead.name` y nombre del cliente, sin distinguir mayúsculas | Siempre | page.tsx:287-293 |
| 7 | estado | 5 `Skeleton` de `h-12` | Carga | `isLoading` | page.tsx:298-303 |
| 8 | estado | «No se pudieron cargar los leads» + mensaje + «Reintentar» | `LoadErrorState` | `loadError` | page.tsx:304-312 · LoadErrorState.tsx:32-55 |
| 9 | estado | «No hay leads registrados.» | Vacío real | Sin filtro y sin resultados | page.tsx:313-320 |
| 10 | estado | «No se encontraron leads con ese filtro.» | Vacío por búsqueda | Con texto y sin resultados | page.tsx:318-320 |
| 11 | botón | «Crear el primer lead» | Abre `NewLeadDialog` | Solo en el vacío sin filtro | page.tsx:321-330 |
| 12 | tabla | «Nombre» | Nombre del lead + icono de temperatura delante | Siempre que haya filas | page.tsx:336-338 · 364-371 |
| 13 | tabla | «Cliente» | `customers[customer_id].full_name`; si no resuelve, «Cliente no encontrado»; sin `customer_id`, «Sin cliente» | Siempre | page.tsx:339-341 · 355-357 · 372-376 |
| 14 | tabla | «Score» | Badge de `score_total` | Siempre | page.tsx:342-344 · 377-379 |
| 15 | tabla | «Última actividad» | `last_contact_at` o, si falta, `updated_at`, en relativo | Siempre | page.tsx:345-347 · 380-384 |
| 16 | tabla | «Acciones» (a la derecha) | Contiene «Convertir a deal» | Siempre | page.tsx:348-350 |
| 17 | badge | «N/A» (gris, `secondary`) | Score nulo | `score_total == null` | page.tsx:89-91 |
| 18 | badge | «{score}» verde con TrendingUp | Score alto | `score >= 70` | page.tsx:92-99 |
| 19 | badge | «{score}» ámbar con Minus | Score medio | `40 <= score < 70` | page.tsx:100-107 |
| 20 | badge | «{score}» rojo con TrendingDown | Score bajo | `score < 40` | page.tsx:108-113 |
| 21 | badge | Llama roja | Temperatura caliente | `temperature === 'hot'` | page.tsx:117 |
| 22 | badge | Llama ámbar | Temperatura tibia | `temperature === 'warm'` | page.tsx:118 |
| 23 | cálculo | «Hoy» · «Ayer» · «Hace {n}d» · «Hace {n}sem» · «Hace {n}m» · «Hace {n}a» · «—» | Fecha relativa por tramos (0, 1, <7, <30, <365, resto) | Siempre | page.tsx:74-86 |
| 24 | botón | Fila completa | `/app/crm/oportunidades/{id}` | Siempre | page.tsx:359-363 |
| 25 | botón | «Convertir a deal» | Abre la confirmación; `stopPropagation` para no navegar | Siempre | page.tsx:385-394 |

Página `p-3 sm:p-4 md:p-6`. Cabecera `flex items-center justify-between flex-wrap gap-3`: bajo ~640 px el par de botones cae a una segunda línea. El buscador es `relative max-w-sm` (nunca pasa de 384 px). La tabla vive en una `Card` con `overflow-hidden`: **ni scroll horizontal ni versión apilada**, así que bajo ~700 px las cinco columnas se comprimen. **Sin paginación**: se pinta todo lo que devuelve el endpoint.

### F.2 Leads — diálogo «Convertir lead a deal» `app/app/crm/leads/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Convertir lead a deal» | — | `convertTarget !== null` | page.tsx:416-418 |
| 2 | texto | «¿Confirmas que quieres convertir el lead "{nombre}" en un deal? Esta acción lo moverá al pipeline de oportunidades como registro tipo `deal`.» | El tipo va en `<code>` | Siempre | page.tsx:419-426 |
| 3 | botón | «Cancelar» | Cierra | Siempre | page.tsx:429-435 |
| 4 | botón | «Convertir» / «Convirtiendo...» | `POST /api/crm/leads/{id}/convert` con `{skipGateCheck:false}` | Siempre; `disabled` mientras convierte | page.tsx:436-452 · 441-445 |
| 5 | toast | «Lead convertido» / «"{nombre}" ahora es un deal.» (+ « El cliente pasó a etapa «oportunidad».» si aplica) | Éxito sin advertencias | `gate.ok` | page.tsx:211-231 |
| 6 | toast | «Lead convertido (con advertencias)» / «… Faltan: {etiquetas}.» | El gate no se cumple; lista `gate.missing[].label` o «criterios» | `gate && !gate.ok` | page.tsx:220-225 |
| 7 | toast | «Error» / «No se pudo convertir el lead a deal» | Fallo de red o del endpoint | `catch` | page.tsx:237-241 |

`sm:max-w-md`; pie `DialogFooter` con `gap-2`, botones apilados en móvil.

### F.3 Leads — diálogo «Nuevo lead» `components/crm/leads/NewLeadDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Nuevo lead» | — | `open` | NewLeadDialog.tsx:255 |
| 2 | texto | «Un lead siempre nace con ficha de cliente: es lo que permite llamarlo, escribirle o mandarle WhatsApp más adelante.» | Descripción | Siempre | NewLeadDialog.tsx:256-259 |
| 3 | campo | «Nombre del lead *» · placeholder «Ej. Restaurante La Playa — punto de venta» | Nombre de la oportunidad tipo lead | Siempre | NewLeadDialog.tsx:264-275 |
| 4 | pestaña | «Cliente existente» | Muestra el buscador de clientes | Siempre | NewLeadDialog.tsx:280 |
| 5 | pestaña | «Cliente nuevo» (UserPlus) | Muestra el alta de cliente en línea | Siempre | NewLeadDialog.tsx:281-284 |
| 6 | campo | «Nombre *» · placeholder «Nombre» | `first_name` del cliente nuevo | Pestaña «Cliente nuevo» | NewLeadDialog.tsx:302-313 |
| 7 | campo | «Apellidos» · placeholder «Apellidos» | `last_name` | Pestaña «Cliente nuevo» | NewLeadDialog.tsx:314-325 |
| 8 | campo | «Correo» · placeholder «correo@ejemplo.com» (`type="email"`) | — | Pestaña «Cliente nuevo» | NewLeadDialog.tsx:328-340 |
| 9 | campo | «Teléfono» · placeholder «+57 300 000 0000» | — | Pestaña «Cliente nuevo» | NewLeadDialog.tsx:341-352 |
| 10 | texto | «Hace falta al menos correo o teléfono.» | Aviso permanente bajo el par correo/teléfono | Pestaña «Cliente nuevo» | NewLeadDialog.tsx:354-356 |
| 11 | campo | «Empresa» · placeholder «Razón social (opcional)» | `company_name` | Pestaña «Cliente nuevo» | NewLeadDialog.tsx:357-368 |
| 12 | campo | Select «Origen» · «Alta manual (ERP)» (por defecto) · «Llamada entrante» · «WhatsApp» · «Referido» · «Evento / feria» · «Redes sociales» · «Otro» | — | Siempre | NewLeadDialog.tsx:44-52 · 373-387 |
| 13 | campo | `PipelineSearchSelect` «Pipeline *» | Si se deja vacío lo resuelve el servidor | **Solo si hay más de un pipeline** | NewLeadDialog.tsx:390-397 |
| 14 | campo | «Valor estimado» · placeholder «0» (`type="number" min="0"`) | — | Siempre | NewLeadDialog.tsx:401-414 |
| 15 | campo | Select «Moneda» · «COP» (por defecto) · «USD» · «EUR» · «MXN» | — | Siempre | NewLeadDialog.tsx:54 · 415-429 |
| 16 | campo | «Cierre estimado» (`type="date"`) | — | Siempre | NewLeadDialog.tsx:433-444 |
| 17 | estado | «El nombre del lead es obligatorio.» (`role="alert"`) | Validación | Al enviar sin nombre | NewLeadDialog.tsx:180-183 · 446-453 |
| 18 | estado | «Elige un cliente existente o crea uno nuevo: un lead sin ficha no se puede contactar.» | — | Modo «existente» sin cliente | NewLeadDialog.tsx:185-188 |
| 19 | estado | «El nombre del cliente nuevo es obligatorio.» | — | Modo «nuevo» sin nombre | NewLeadDialog.tsx:191-194 |
| 20 | estado | «El cliente nuevo necesita al menos correo o teléfono.» | — | Modo «nuevo» sin ninguno | NewLeadDialog.tsx:195-198 |
| 21 | botón | «Cancelar» | Cierra y limpia | Siempre; `disabled` al guardar | NewLeadDialog.tsx:457-464 |
| 22 | botón | «Crear lead» (Plus) / «Creando...» | `POST /api/crm/leads` | Siempre | NewLeadDialog.tsx:465-481 · 470-474 |
| 23 | toast | «Lead creado» / «"{nombre}" se registró como lead.» | — | Tras crear | NewLeadDialog.tsx:236-239 |

`sm:max-w-lg`, `max-h-[90vh] overflow-y-auto`. Pares de campos en `grid-cols-1 sm:grid-cols-2`. Importe y moneda en `grid-cols-1 sm:grid-cols-3`, con el importe a `sm:col-span-2`. Pestañas en `grid w-full grid-cols-2`.

### F.3a Selector de cliente compartido `components/crm/oportunidades/CustomerSearchSelect.tsx`

Enlaza con la §F de la auditoría de productos y POS (`AUDITORIA-CONTROLES-PRODUCTOS-POS.md`, «Selector de cliente compartido»): esta es una de las 22 implementaciones inventariadas allí.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «Sin cliente» + icono Search (`role="combobox"`, `min-h-[44px]`) | Abre el popover | Sin cliente elegido | CustomerSearchSelect.tsx:86-128 |
| 2 | botón | Avatar, nombre y correo del cliente | Estado con cliente elegido | `selectedCustomerId` | CustomerSearchSelect.tsx:93-120 |
| 3 | botón | (icono X) | Quita el cliente; operable con Enter | Con cliente elegido | CustomerSearchSelect.tsx:111-119 |
| 4 | campo | placeholder «Buscar cliente...» (`autoFocus`) | `onSearchChange` con 300 ms de espera | Popover abierto | CustomerSearchSelect.tsx:135-141 |
| 5 | menú | «Sin cliente» | Limpia la selección | Solo si `allowEmpty`; **oculto en el alta de lead** (`allowEmpty={false}`) | CustomerSearchSelect.tsx:148-162 |
| 6 | menú | Nombre + correo + teléfono | Elige el cliente y cierra | Por resultado | CustomerSearchSelect.tsx:167-203 |
| 7 | estado | «Buscando…» (spinner centrado) | — | `isSearching` y 0 resultados | CustomerSearchSelect.tsx:205-209 |
| 8 | estado | Mensaje del servidor en rojo | Sustituye al «no se encontraron» | `searchError` | CustomerSearchSelect.tsx:210-213 |
| 9 | estado | «No se encontraron clientes» | Con término escrito | — | CustomerSearchSelect.tsx:214-219 |
| 10 | estado | «Escribe para buscar un cliente» | Sin término y con búsqueda en servidor | — | CustomerSearchSelect.tsx:218 |

Popover fijo a `w-[350px]`, lista `max-h-[280px] overflow-y-auto`. `PipelineSearchSelect` es el gemelo: trigger «Selecciona un pipeline», buscador «Buscar pipeline...», badge «Por defecto» en el trigger y «Default» en la lista, vacío «No se encontraron pipelines», `ScrollArea` de 220 px (`PipelineSearchSelect.tsx:45-140`).

### F.4 Equipo — cabecera, pestañas y barra lateral `components/crm/equipo/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Equipo Comercial» (h1) | Título | Siempre | EquipoPage.tsx:32-34 |
| 2 | badge | «RevOps» (píldora azul, decorativa) | — | Siempre | EquipoPage.tsx:35-37 |
| 3 | texto | «Gestión comercial» (icono Users) | — | Siempre | EquipoPage.tsx:40-43 |
| 4 | texto | «Equipos, oportunidades y territorios» (icono Target, tras un `\|`) | — | Siempre | EquipoPage.tsx:44-48 |
| 5 | pestaña | «Equipos» (Users) | `EquiposTab` | Siempre | EquipoPage.tsx:12 · 67-78 · 87 |
| 6 | pestaña | «Asignar Oportunidades» (Target) | `AsignarTab` | Siempre | EquipoPage.tsx:13 · 88 |
| 7 | pestaña | «Performance» (Gauge) | `PerformanceTab` | Siempre | EquipoPage.tsx:14 · 89 |
| 8 | pestaña | «Territorios» (MapPin) | `TerritoriosTab` | Siempre | EquipoPage.tsx:15 · 90 |
| 9 | estado | 3 `Skeleton` (8×48, 10×max-w-md, 64 de alto) | Fallback de `Suspense` de la ruta | Antes de montar | app/app/crm/equipo/page.tsx:9-17 |
| 10 | estado | 3 bloques `h-32` pulsando | Carga de la barra lateral | — | EquipoSidebar.tsx:48-56 |
| 11 | stat | «Pipeline activo» + importe + «{n} oportunidades abiertas» | Suma `amount` de oportunidades `open/qualified/proposal/negotiation`. **Formatea siempre en COP** | Siempre | EquipoSidebar.tsx:61-67 |
| 12 | stat | «Equipos activos» | `count` de `sales_teams` activos | Siempre | EquipoSidebar.tsx:72-80 |
| 13 | stat | «Miembros» | `count` de `sales_team_members` activos | Siempre | EquipoSidebar.tsx:81-89 |
| 14 | stat | «Territorios» | `count` de `territories` activos | Siempre | EquipoSidebar.tsx:90-98 |
| 15 | stat | «Oportunidades abiertas» | Filas leídas | Siempre | EquipoSidebar.tsx:99-107 |
| 16 | texto | «Acceso rápido» (icono Award) | Cabecera de la tercera tarjeta | Siempre | EquipoSidebar.tsx:114-117 |
| 17 | menú | «Ir al Pipeline» | `/app/crm/pipeline` | Siempre | EquipoSidebar.tsx:120-122 |
| 18 | menú | «Ver Oportunidades» | `/app/crm/oportunidades` | Siempre | EquipoSidebar.tsx:123-125 |
| 19 | menú | «Configurar estructura» | `/app/configuracion` | Siempre | EquipoSidebar.tsx:126-128 |

Rejilla `grid-cols-1 lg:grid-cols-3`: el contenido ocupa `lg:col-span-2` y la barra lateral el tercio restante **solo desde 1024 px**; debajo cae al final de la página. La tira de pestañas va en `overflow-x-auto`: en móvil se desplaza en horizontal, no se parte. La primera tarjeta de la barra es un degradado rosa (`from-rose-600 to-rose-700`); las otras dos, blancas.

### F.5 Equipo › pestaña «Equipos» `components/crm/equipo/tabs/EquiposTab.tsx` · `dialogs/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | 3 bloques `h-24` | Carga | `loading` | EquiposTab.tsx:145-153 |
| 2 | stat | «{n} equipo{s} · {m} miembros» | Contadores | Siempre | EquiposTab.tsx:159-161 |
| 3 | botón | (icono RefreshCw, **sin `aria-label`**) | Recarga equipos, roles, territorios y miembros | Siempre | EquiposTab.tsx:163-165 |
| 4 | botón | «Nuevo Equipo» | Limpia el formulario y abre `TeamDialog` en alta | Siempre | EquiposTab.tsx:166-172 |
| 5 | estado | «No hay equipos» / «Crea tu primer equipo comercial» (icono Users) | Vacío | `teams.length === 0` | EquiposTab.tsx:177-184 |
| 6 | botón | Fila del equipo (icono, nombre, badges) | Expande o colapsa | Por equipo | EquiposTab.tsx:195-221 |
| 7 | badge | «{n} miembro{s}» (`secondary`) | — | Siempre | EquiposTab.tsx:206 |
| 8 | badge | «{territorio}» (MapPin, rosa) | — | Si `team.territories?.name` | EquiposTab.tsx:207-211 |
| 9 | texto | Descripción del equipo, truncada a una línea | — | Si `team.description` | EquiposTab.tsx:213 |
| 10 | cálculo | «Cuota total: {importe}» | Suma `quota_amount` de los miembros; la moneda es la del **primer** miembro, o COP | `teamQuota > 0` | EquiposTab.tsx:190 · 214-218 |
| 11 | botón | (icono Pencil, **sin `aria-label`**) | Abre `TeamDialog` con los datos | Por fila | EquiposTab.tsx:223-229 |
| 12 | botón | (icono Trash2 rojo, **sin `aria-label`**) | Abre la confirmación | Por fila | EquiposTab.tsx:230-232 |
| 13 | estado | «Sin miembros. Añade el primero.» | Vacío del equipo expandido | `members.length === 0` | EquiposTab.tsx:238-239 |
| 14 | texto | Inicial + nombre + correo del miembro | `memberName` cae al correo y luego a los 8 primeros caracteres del id | Equipo expandido | EquiposTab.tsx:242-254 · types.ts:70-79 |
| 15 | badge | «{rol}» (outline, 10 px) | — | Si `m.sales_roles?.name` | EquiposTab.tsx:256-258 |
| 16 | badge | «{territorio}» | El del miembro o, si no tiene, el del equipo | Si hay alguno | EquiposTab.tsx:259-263 |
| 17 | texto | «Cuota: {importe}» | Con la moneda del miembro | Si `quota_amount != null` | EquiposTab.tsx:264-268 |
| 18 | botón | (icono Trash2) | Marca el miembro `is_active = false`. **Sin confirmación** | Por miembro | EquiposTab.tsx:272-274 |
| 19 | botón | «Añadir miembro» | Abre `MemberDialog` sobre el equipo expandido | Equipo expandido | EquiposTab.tsx:279-284 |
| 20 | diálogo | «Nuevo equipo» / «Editar equipo» + «Crea un nuevo equipo comercial» / «Modifica los datos del equipo comercial» | — | `open` | TeamDialog.tsx:34-37 |
| 21 | campo | «Nombre *» · placeholder «Ej: Equipo Norte» | — | Siempre | TeamDialog.tsx:40-47 |
| 22 | campo | Textarea «Descripción» de 2 filas, **sin placeholder** | — | Siempre | TeamDialog.tsx:48-55 |
| 23 | campo | Select «Territorio (opcional)» · «Sin territorio» + cada territorio | — | Solo si hay territorios | TeamDialog.tsx:56-70 |
| 24 | toggle | «Activo» | `is_active` | Siempre | TeamDialog.tsx:71-77 |
| 25 | botón | «Cancelar» / «Guardar» / «Guardando...» | `insert` o `update` en `sales_teams` | Siempre; `disabled` al guardar | TeamDialog.tsx:80-81 |
| 26 | diálogo | «Añadir miembro» / «Selecciona un miembro de la organización» | — | `open` | MemberDialog.tsx:41-42 |
| 27 | campo | Select «Miembro *» · placeholder «Selecciona...» · «{nombre} ({correo})» | Miembros de la organización | Siempre | MemberDialog.tsx:45-60 |
| 28 | campo | Select «Rol» · placeholder «Sin rol» · «Sin rol» + «{nombre} ({código})» | `sales_roles` | Siempre | MemberDialog.tsx:61-75 |
| 29 | campo | Select «Territorio (opcional)» · placeholder «Hereda del equipo» · «Hereda del equipo» + territorios | — | Solo si hay territorios | MemberDialog.tsx:76-92 |
| 30 | campo | «Cuota» · placeholder «0» (`type="number"`) | — | Siempre | MemberDialog.tsx:94-101 |
| 31 | campo | Select «Moneda» · «COP» · «USD» | **Solo dos monedas**, frente a las cuatro del alta de lead | Siempre | MemberDialog.tsx:103-115 |
| 32 | botón | «Cancelar» / «Añadir» / «Añadiendo...» | — | Siempre | MemberDialog.tsx:118-121 |
| 33 | diálogo | «¿Eliminar equipo?» / «Se eliminará "{nombre}" y todos sus miembros.» | **El texto miente**: solo desactiva el equipo (§G) | `deleteTeamOpen` | EquiposTab.tsx:316-322 |
| 34 | toast | «Equipo creado» · «Equipo actualizado» · «Equipo eliminado» · «Miembro añadido» · «Miembro removido» | — | Según acción | EquiposTab.tsx:73 · 77 · 107 · 121 · 133 |
| 35 | toast | «Validación» / «El nombre es obligatorio» · «Validación» / «Selecciona un miembro» | — | Al guardar incompleto | EquiposTab.tsx:57-59 · 89-91 |
| 36 | toast | «Error» / «No se pudieron cargar los equipos» · «No se pudo guardar» · «No se pudo añadir» · «No se pudo remover» · «No se pudo eliminar» | — | `catch` | EquiposTab.tsx:47 · 82 · 111 · 124 · 138 |

Tarjetas apiladas (`space-y-3`), padding `p-4 sm:p-5`. Los badges van en `flex-wrap`: en móvil bajan de línea. En `MemberDialog`, cuota y moneda están en `grid-cols-2` **fijo**: no se apilan en móvil.

### F.6 Equipo › pestaña «Asignar Oportunidades» `components/crm/equipo/tabs/AsignarTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | 3 bloques `h-16` | Carga | `loading` | AsignarTab.tsx:96-102 |
| 2 | campo | Select «Todos los equipos» + cada equipo | Filtra por `sales_team_id` | Siempre | AsignarTab.tsx:110-116 |
| 3 | toggle | «Solo sin asignar» | Oculta las que ya tienen vendedor. **Activado por defecto** | Siempre | AsignarTab.tsx:31 · 117-120 |
| 4 | botón | (icono RefreshCw, **sin `aria-label`**) | Recarga | Siempre | AsignarTab.tsx:121-123 |
| 5 | stat | «{n} oportunidades» | Cuenta tras filtrar | Siempre | AsignarTab.tsx:124 |
| 6 | estado | «No hay oportunidades para asignar» (icono Target) | Vacío | `filtered.length === 0` | AsignarTab.tsx:130-136 |
| 7 | tabla | «Oportunidad» | Enlace azul a `/app/crm/oportunidades/{id}` | Siempre | AsignarTab.tsx:143 · 154-158 |
| 8 | tabla | «Cliente» | **Siempre «—»** (§G) | Siempre | AsignarTab.tsx:144 · 159 |
| 9 | tabla | «Monto» | `formatCurrency(amount, currency ?? 'COP')`, o «—» | Siempre | AsignarTab.tsx:145 · 160 |
| 10 | tabla | «Etapa» | **Siempre «—»** (§G) | Siempre | AsignarTab.tsx:146 · 161 |
| 11 | campo | «Equipo» → Select placeholder «—» · «Sin equipo» + equipos | `update` de `opportunities.sales_team_id` al elegir | Siempre | AsignarTab.tsx:147 · 162-170 |
| 12 | campo | «Vendedor» → Select placeholder «—» · «Sin asignar» + miembros | `update` de `opportunities.salesperson_id` | Siempre | AsignarTab.tsx:148 · 171-179 |
| 13 | toast | «Equipo asignado» · «Vendedor asignado» | La fila se actualiza en memoria, sin recargar | Tras elegir | AsignarTab.tsx:73 · 84 |
| 14 | toast | «Error» / «No se pudo asignar» | Fallo del `update` | `catch` | AsignarTab.tsx:75 · 86 |
| 15 | toast | «Error» / «No se pudieron cargar las oportunidades: {detalle}» | Fallo de carga | `catch` de `load` | AsignarTab.tsx:59 |

Filtros en una `Card` con `flex-wrap`. La tabla va en `CardContent` con `px-2 sm:px-6` pero **sin contenedor de scroll horizontal**: seis columnas, dos de ellas con `Select`, no caben bajo ~900 px. **Sin paginación ni límite**: se piden todas las oportunidades abiertas de la organización.

### F.7 Equipo › pestañas «Performance» y «Territorios» `PerformanceTab.tsx` · `TerritoriosTab.tsx` · `TerritoryDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | 3 bloques `h-20` | Carga | `loading` | PerformanceTab.tsx:83-89 |
| 2 | estado | «No hay miembros en equipos para mostrar performance» + enlace «Asigna miembros desde la tab Equipos» | **El enlace apunta a la misma página** (§G) | `members.length === 0` | PerformanceTab.tsx:91-101 |
| 3 | stat | «Activas» | Oportunidades ni ganadas ni perdidas, de todos los miembros | Siempre | PerformanceTab.tsx:107-119 |
| 4 | stat | «Ganadas» (verde) | `status === 'won'` | Siempre | PerformanceTab.tsx:120-132 |
| 5 | stat | «Pipeline» | Importe abierto, **siempre en COP** | Siempre | PerformanceTab.tsx:133-147 |
| 6 | stat | «Ganado» (verde) | Importe ganado, siempre en COP | Siempre | PerformanceTab.tsx:148-162 |
| 7 | stat | «{n} vendedores» | Número de miembros | Siempre | PerformanceTab.tsx:167 |
| 8 | botón | (icono RefreshCw, **sin `aria-label`**) | Recarga | Siempre | PerformanceTab.tsx:168-170 |
| 9 | tabla | «Vendedor» · «Rol» · «Activas» · «Ganadas» · «Perdidas» · «Pipeline» · «Ganado» · «Cuota» · «%» | 9 columnas | Siempre | PerformanceTab.tsx:179-187 |
| 10 | badge | «{n}» (`secondary`) | Oportunidades activas del vendedor | Siempre | PerformanceTab.tsx:198 |
| 11 | cálculo | «{pct}%» o «—» | `round(wonAmount / quota × 100)`; verde ≥100, azul ≥50, gris el resto | Siempre | PerformanceTab.tsx:192-193 · 204 |
| 12 | estado | 3 bloques `h-20` | Carga de Territorios | `loading` | TerritoriosTab.tsx:116-122 |
| 13 | stat | «{n} territorio{s}» | Contador | Siempre | TerritoriosTab.tsx:128-130 |
| 14 | botón | (icono RefreshCw, **sin `aria-label`**) | Recarga | Siempre | TerritoriosTab.tsx:132-134 |
| 15 | botón | «Nuevo Territorio» | Abre `TerritoryDialog` vacío con `criteria = {}` | Siempre | TerritoriosTab.tsx:135-142 |
| 16 | estado | «No hay territorios configurados» (icono MapPin) | Vacío | `territories.length === 0` | TerritoriosTab.tsx:147-153 |
| 17 | botón | (icono Pencil, **sin `aria-label`**) | Edita; vuelca `criteria` como JSON indentado | Por tarjeta | TerritoriosTab.tsx:169-176 |
| 18 | botón | (icono Trash2 rojo, **sin `aria-label`**) | Abre la confirmación | Por tarjeta | TerritoriosTab.tsx:177-179 |
| 19 | stat | «Equipos» | Equipos cuyo `territory_id` coincide | Siempre | TerritoriosTab.tsx:184-190 |
| 20 | stat | «Oport.» | Oportunidades del territorio | Siempre | TerritoriosTab.tsx:191-197 |
| 21 | stat | «Valor» | Suma de `amount`, **siempre en COP**; «—» si es 0 | Siempre | TerritoriosTab.tsx:198-203 |
| 22 | chip | «Equipos:» + nombre de cada equipo (lista gris al pie) | — | Si hay equipos en el territorio | TerritoriosTab.tsx:206-217 |
| 23 | diálogo | «Nuevo territorio» / «Editar territorio» + «Crea un nuevo territorio comercial» / «Modifica los datos del territorio» | — | `open` | TerritoryDialog.tsx:30-33 |
| 24 | campo | «Nombre *» · placeholder «Ej: Zona Norte» | — | Siempre | TerritoryDialog.tsx:36-43 |
| 25 | campo | Textarea monoespaciada «Criterios (JSON)» · placeholder `{"country": "CO"}` · 4 filas | — | Siempre | TerritoryDialog.tsx:44-52 |
| 26 | estado | «JSON inválido» | Bajo el textarea; **bloquea el guardado** | Si `JSON.parse` falla | TerritoriosTab.tsx:75-77 · TerritoryDialog.tsx:53 |
| 27 | toggle | «Activo» | `is_active` | Siempre | TerritoryDialog.tsx:55-61 |
| 28 | botón | «Cancelar» / «Guardar» / «Guardando...» | — | Siempre | TerritoryDialog.tsx:63-66 |
| 29 | diálogo | «¿Eliminar territorio?» / «Se eliminará "{nombre}".» · «Cancelar» · «Eliminar» | Borrado **físico** de la fila | `deleteOpen` | TerritoriosTab.tsx:236-242 · DeleteConfirmDialog.tsx:19-36 |
| 30 | toast | «Territorio creado» · «Territorio actualizado» · «Territorio eliminado» | — | Según acción | TerritoriosTab.tsx:86 · 90 · 106 |

KPIs de Performance en `grid-cols-2 sm:grid-cols-4`; el cuarto ocupa las dos columnas en móvil (`col-span-2 sm:col-span-1`), con tipografía reducida bajo `sm` (`text-lg` frente a `text-2xl`). La tabla de nueve columnas **tampoco** tiene scroll horizontal. Tarjetas de territorio en `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, con los tres contadores en `grid-cols-3` fijo y centrados.

### F.8 Partners — cabecera, filtros y lista `components/crm/partners/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Partners» (h1) | Título | Siempre | PartnersPage.tsx:77 · CrmPageHeader.tsx:37 |
| 2 | texto | «Consultores, integradores y revendedores que traen deals. Su tier sube solo con resultados; su comisión queda registrada por deal.» | Descripción | Siempre | PartnersPage.tsx:78 |
| 3 | botón | `aria-label` «Actualizar lista» (RefreshCw) | Relee `/api/crm/partners` y `/api/crm/partners/tiers` | Siempre; `disabled` y girando al refrescar | CrmPageHeader.tsx:41-43 · PartnersPage.tsx:65-72 |
| 4 | botón | «Tiers» o «Tiers ({n})» (icono Award) | Abre la hoja `TierEditor`; el número solo si hay tiers | Siempre | PartnersPage.tsx:81 · CrmPageHeader.tsx:44-48 |
| 5 | botón | «Nuevo partner» (Plus, `bg-blue-600`) | Abre `PartnerEditor` en alta | Siempre | PartnersPage.tsx:82 · CrmPageHeader.tsx:49-51 |
| 6 | estado | «No se pudieron cargar los partners» / «No se pudo actualizar la lista» + «{error}. Pulsa «Actualizar» para reintentar.» | El título cambia según si ya hubo carga buena | `error` | PartnersPage.tsx:85-90 |
| 7 | estado | 1 `Skeleton` de filtro + 6 tarjetas `h-52` (`aria-busy`, `aria-label` «Cargando partners») | Carga | `loading` | PartnersPage.tsx:92-96 |
| 8 | estado | «Vende con quien ya vende» / «Da de alta a un consultor o integrador, asígnale un tier y registra los deals que trae: la comisión se calcula sola y el tier sube con los resultados.» (icono Award) | Vacío con propósito | 0 partners y carga resuelta | PartnersPage.tsx:97-103 |
| 9 | botón | «Crear el primer partner» | Abre el editor en alta | En ese vacío | PartnersPage.tsx:102 |
| 10 | campo | «Buscar» · placeholder «Nombre, empresa, correo o tier» (`type="search"`) | Filtra en memoria | Con al menos un partner | PartnersPage.tsx:108-112 |
| 11 | toggle | «Solo activos» | Oculta los inactivos | Con al menos un partner | PartnersPage.tsx:114-117 |
| 12 | stat | «{n} partner{s}» o «{n} de {total} partners» (`aria-live="polite"`) | Cambia de forma si hay filtro | Siempre | PartnersPage.tsx:118 |
| 13 | estado | «Ningún partner coincide con los filtros» + «Quitar filtros» | Vacío por filtro | 0 resultados filtrados | PartnersPage.tsx:120-124 |
| 14 | texto | Nombre (h3 truncado) y empresa (subtítulo) | — | Por tarjeta | PartnerList.tsx:38-39 |
| 15 | badge | «Activo» (verde, BadgeCheck) / «Inactivo» (gris, CircleOff) | Icono **y** texto, no solo color | Por tarjeta | PartnerList.tsx:41-44 |
| 16 | texto | «{tier} · comisión {tasa} (propia)» / «(del tier)» / «Sin tier» | El sufijo dice de dónde sale la tasa efectiva | Por tarjeta | PartnerList.tsx:52-53 |
| 17 | texto | Correo (Mail) y teléfono (Phone) | El teléfono solo si existe | Por tarjeta | PartnerList.tsx:57-58 |
| 18 | stat | «{n} deal{s}» | Contador | Por tarjeta | PartnerList.tsx:64 |
| 19 | texto | «Comisión pendiente {x} · pagada {y}» | Importes agregados | `commissions.count > 0` y una sola moneda | PartnerList.tsx:65-70 |
| 20 | estado | «Comisiones en varias monedas: ver el detalle en Deals» | **No suma monedas distintas: lo dice.** Contraejemplo a seguir frente a F.4-11 y F.7 | `currency_mixed` | PartnerList.tsx:67-68 |
| 21 | botón | «Deals» (Handshake, azul) | Abre la hoja de deals del partner | Siempre | PartnerList.tsx:77-79 |
| 22 | botón | «Editar» (Pencil) | Abre `PartnerEditor` | **Solo con `can_manage`** del servidor | PartnerList.tsx:81-85 |
| 23 | botón | `aria-label` «Eliminar partner {nombre}» (Trash2) | Abre la confirmación | Solo con `can_manage` | PartnerList.tsx:86-90 |
| 24 | diálogo | «Eliminar partner» / «Se eliminará «{nombre}» y sus {n} deal{s} con sus comisiones registradas. Esta acción no se puede deshacer.» · «Eliminar» · «Cancelar» | `DELETE /api/crm/partners/{id}` | `deleteTarget` | PartnersPage.tsx:134-143 · confirm-dialog.tsx:44-97 |
| 25 | toast | «Partner «{nombre}» eliminado» / «No se pudo eliminar» + motivo | — | Tras confirmar | PartnersPage.tsx:59-62 |

Rejilla `md:grid-cols-2 xl:grid-cols-3`. Cada tarjeta es un `<article>` con `aria-labelledby` y borde punteado si el partner está inactivo. El pie usa `mt-auto` para alinear los botones entre tarjetas de distinta altura, y la papelera se empuja con `ml-auto`.

### F.9 Partners — hoja «Nuevo partner / Editar» `components/crm/partners/PartnerEditor.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Nuevo partner» / «Editar «{nombre}»» | Hoja lateral derecha | `open` | PartnerEditor.tsx:98 |
| 2 | texto | «Consultor, integrador o revendedor que trae o cierra deals. Su comisión queda registrada por deal; aquí no se paga nada.» | Descripción | Siempre | PartnerEditor.tsx:99 |
| 3 | campo | «Nombre» · placeholder «Carlos Consultor» | — | Siempre | PartnerEditor.tsx:102 |
| 4 | campo | «Empresa (opcional)» (sin placeholder) | — | Siempre | PartnerEditor.tsx:103 |
| 5 | campo | «Correo» (`type="email"`) · ayuda «Único por organización.» | — | Siempre | PartnerEditor.tsx:105 |
| 6 | campo | «Teléfono (opcional)» (`type="tel"`) | — | Siempre | PartnerEditor.tsx:106 |
| 7 | campo | Select «Tier» · «Sin tier» + «{nombre} · {tasa}» | — | Siempre | PartnerEditor.tsx:110-117 |
| 8 | texto | «Sube solo al registrar deals que cumplan los umbrales; bajar es manual, aquí.» | Ayuda del selector de tier | Siempre | PartnerEditor.tsx:118 |
| 9 | campo | «Comisión propia % (opcional)» · placeholder «Hereda {tasa}» o «Sin tier: 0 %» · ayuda «Vacío = usa la tasa del tier. Si se indica, manda sobre la del tier.» | El placeholder cambia con el tier elegido | Siempre | PartnerEditor.tsx:120 |
| 10 | estado | «El nombre es obligatorio» (`role="alert"`, foco al primero) | Validación | Al enviar | partnerModel.ts:47 |
| 11 | estado | «El correo es obligatorio» / «El correo no tiene un formato válido» | — | Al enviar | partnerModel.ts:48-49 |
| 12 | estado | «La tasa debe estar entre 0 y 100» | — | Al enviar | partnerModel.ts:50-52 |
| 13 | estado | «No se pudo guardar» + mensaje del servidor | `Alert` destructivo enfocable (409 por correo repetido) | Fallo del `POST`/`PATCH` | PartnerEditor.tsx:122-127 |
| 14 | toggle | «Activo» / «Inactivo» | En el pie, a la izquierda; la etiqueta cambia con el valor | Siempre | PartnerEditor.tsx:132-133 |
| 15 | botón | «Cancelar» | Cierra sin guardar | Siempre | PartnerEditor.tsx:136 |
| 16 | botón | «Crear partner» / «Guardar cambios» / «Guardando…» | `POST` o `PATCH` | Siempre | PartnerEditor.tsx:137-139 |
| 17 | atajo | `Enter` dentro de un campo | Envía el formulario (botón `sr-only` de tipo submit) | Siempre | PartnerEditor.tsx:128 |
| 18 | toast | «Partner creado» / «Partner actualizado» + ««{nombre}»» y « (inactivo)» si toca | — | Tras guardar | PartnerEditor.tsx:70 |

Hoja `sm:max-w-xl` a ancho completo bajo 640 px. Cabecera y pie fijos (`border-t/-b`, fondo blanco); solo el formulario hace scroll. En el pie, `[&>button]:h-11` en móvil y `sm:[&>button]:h-9` desde 640: objetivos táctiles de 44 px en teléfono. Pares de campos en `sm:grid-cols-2`.

### F.10 Partners — hoja «Deals de {partner}» y «Registrar deal» `PartnerDealList.tsx` · `PartnerDealTable.tsx` · `RegisterDealDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Deals de {nombre}» | Hoja `sm:max-w-2xl` | `open` | PartnerDealList.tsx:94 |
| 2 | texto | «Tier {x} · comisión {tasa}. La comisión es un registro por deal; aprobarla o marcarla pagada no mueve dinero.» | Descripción | Siempre | PartnerDealList.tsx:95-97 |
| 3 | stat | «{n} deal{s} · pendiente {x} · pagada {y}» (`aria-live="polite"`) | — | Siempre | PartnerDealList.tsx:101-106 |
| 4 | estado | «· comisiones en varias monedas (sin sumar)» | Sustituye a los importes | Más de una moneda | PartnerDealList.tsx:103-104 |
| 5 | botón | `aria-label` «Actualizar deals» (RefreshCw) | Relee los deals | Siempre; `disabled` al cargar | PartnerDealList.tsx:108-110 |
| 6 | botón | «Registrar deal» (Plus, azul) | Abre `RegisterDealDialog` | Siempre | PartnerDealList.tsx:111-113 |
| 7 | estado | «No se pudieron cargar los deals» + «{error}. Pulsa «Actualizar deals» para reintentar.» | Error | `error` | PartnerDealList.tsx:116-118 |
| 8 | estado | 3 `Skeleton` de `h-12` | Carga | Cargando y sin datos previos | PartnerDealList.tsx:119-120 |
| 9 | estado | «Este partner aún no tiene deals» / «Registra la oportunidad que trajo o ayudó a cerrar y la comisión quedará calculada.» | Vacío | 0 deals y sin error | PartnerDealList.tsx:121-125 |
| 10 | tabla | «Oportunidad» | Nombre + «{importe} · {fecha}»; si falta, «Oportunidad no disponible» / «Sin monto». **La fecha pasa por `useFormatDate()`** | Siempre | PartnerDealTable.tsx:36 · 46-51 |
| 11 | tabla | «Tipo» → «Referido» · «Venta conjunta» · «Reventa» | — | Siempre | PartnerDealTable.tsx:37 · 52 · partnerCommission.ts:17-21 |
| 12 | tabla | «Comisión» (a la derecha) | Importe en la moneda de la oportunidad | Siempre | PartnerDealTable.tsx:38 · 53 |
| 13 | tabla | «Estado» → badge + fecha de pago si existe | — | Siempre | PartnerDealTable.tsx:39 · 54-57 |
| 14 | tabla | «Acciones» | Botones de transición | **Solo con `can_manage`** | PartnerDealTable.tsx:40 · 58-69 |
| 15 | badge | «Pendiente» (gris, CircleDashed) · «Aprobada» (azul, BadgeCheck) · «Pagada» (verde, Coins) · «Rechazada» (rojo, XCircle) | — | Por fila | partnerMeta.tsx:17-20 · 23-32 |
| 16 | botón | «Aprobar» | Confirmación para pasar a `approved` | Estado `pending` | PartnerDealTable.tsx:61-65 · partnerCommission.ts:33-38 |
| 17 | botón | «Rechazar» (fantasma, rojo) | Pasa a `rejected` | Estados `pending` y `approved` | PartnerDealTable.tsx:62-63 |
| 18 | botón | «Registrar pago» | Pasa a `paid` | Estado `approved` | partnerMeta.tsx:19 |
| 19 | — | (sin botones) | `paid` y `rejected` son terminales | — | partnerCommission.ts:36-37 |
| 20 | diálogo | «{Verbo} la comisión» + «{oportunidad} · {importe}. Se anota como pagada con fecha de hoy; no se mueve dinero. / Quedará rechazada y no contará para el tier. / Quedará aprobada, pendiente de registrar el pago.» | Confirmación con el efecto real de cada transición | Al pulsar una transición | PartnerDealList.tsx:131-140 |
| 21 | toast | «Comisión {estado en minúsculas}» + oportunidad, importe y, si es pago, «. Es un registro: aquí no se mueve dinero.» | — | Tras confirmar | PartnerDealList.tsx:78 |
| 22 | diálogo | «Registrar deal de {partner}» | `max-w-lg`, `max-h-[90vh] overflow-y-auto` | `open` | RegisterDealDialog.tsx:87 |
| 23 | texto | «La comisión se calcula con el monto de la oportunidad y la tasa propia del partner / de su tier ({tasa}). Queda pendiente de aprobar; no se paga nada aquí.» | La frase cambia según haya tasa propia | Siempre | RegisterDealDialog.tsx:88-90 |
| 24 | campo | «Oportunidad» · placeholder «Buscar por nombre…» | Busca contra `opportunities` con RLS | Siempre | RegisterDealDialog.tsx:93-99 · EntitySearchList.tsx:54-68 |
| 25 | menú | «{oportunidad}» + «{cliente} · {etapa} · {importe}» (`aria-pressed`) | Elegir **no cierra** el diálogo | Por resultado | RegisterDealDialog.tsx:99-103 · EntitySearchList.tsx:76-83 |
| 26 | texto | «Escribe para buscar entre las oportunidades de la organización.» | Ayuda inicial | Sin selección | RegisterDealDialog.tsx:104 |
| 27 | cálculo | «Elegida: {nombre} · comisión estimada {importe}» | Anticipa la comisión en el cliente; la definitiva la calcula el servidor | Con oportunidad elegida | RegisterDealDialog.tsx:57 · 104 |
| 28 | estado | «Elige la oportunidad del deal» | Validación con foco | Al enviar sin elegir | RegisterDealDialog.tsx:61-65 |
| 29 | estado | «Nada coincide con la búsqueda.» | Vacío | 0 resultados | EntitySearchList.tsx:84-86 |
| 30 | campo | Select «Tipo de deal» · «Referido» (por defecto) · «Venta conjunta» · «Reventa» | — | Siempre | RegisterDealDialog.tsx:107-113 |
| 31 | estado | «No se pudo registrar» + mensaje (`Alert` enfocable) | Fallo del `POST` | — | RegisterDealDialog.tsx:114-119 |
| 32 | botón | «Cancelar» / «Registrar deal» / «Registrando…» | — | Siempre | RegisterDealDialog.tsx:123-124 |
| 33 | toast | «Deal registrado» / «Comisión {importe} ({tasa}), pendiente de aprobar. {Partner} sube al tier {x}.» | La promoción solo se menciona si ocurrió | Tras registrar | RegisterDealDialog.tsx:70-73 |

La tabla de deals va en un `overflow-x-auto` con borde redondeado: **esta sí** se desplaza en horizontal en móvil, a diferencia de las de Equipo (§F.6, §F.7) y Leads (§F.1). Cabeceras con `scope="col"`. En «Registrar deal», la lista de resultados tiene `max-h-56` propia y los botones del pie `h-11` en móvil.

### F.11 Partners — hoja «Tiers de partner» `components/crm/partners/TierEditor.tsx` · `TierForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Tiers de partner» / «Un partner sube de tier automáticamente al registrar un deal si cumple los deals y el revenue mínimos. Nunca baja solo.» | Hoja `sm:max-w-xl` | `open` | TierEditor.tsx:61-62 |
| 2 | texto | «{n} tier{s}, de menor a mayor» | Encabezado de la lista (`<ol>` con `aria-label="Tiers"`) | Siempre | TierEditor.tsx:66 |
| 3 | botón | «Nuevo tier» (Plus) | Abre `TierForm` vacío arriba; pasa a `secondary` mientras está abierto | **Solo con `can_manage`** | TierEditor.tsx:67-71 |
| 4 | texto | «{nombre} · {tasa}» (icono Award ámbar) | Cabecera de cada tier | Por tier | TierEditor.tsx:86 |
| 5 | texto | «Desde {n} deal{s} y {revenue} de revenue» | Umbrales, número en formato `es-CO` | Por tier | TierEditor.tsx:87 |
| 6 | texto | Beneficios unidos por « · » | — | Si hay beneficios | TierEditor.tsx:88 |
| 7 | botón | «Editar» / «Cerrar» (`aria-expanded`) | Abre o cierra el formulario en su sitio | Solo con `can_manage` | TierEditor.tsx:93 |
| 8 | botón | `aria-label` «Eliminar tier {nombre}» (Trash2) | Abre la confirmación | Solo con `can_manage` | TierEditor.tsx:94-96 |
| 9 | campo | «Nombre» | — | En el formulario | TierForm.tsx:73-75 |
| 10 | campo | «Deals mínimos» (`type="number" min=0 step=1`) | — | En el formulario | TierForm.tsx:78 |
| 11 | campo | «Revenue mínimo» (`type="number" step="any"`) | — | En el formulario | TierForm.tsx:79 |
| 12 | campo | «Comisión %» (`type="number" step="any"`) | — | En el formulario | TierForm.tsx:80 |
| 13 | campo | Textarea «Beneficios (uno por línea)» de 3 filas | — | En el formulario | TierForm.tsx:83-84 |
| 14 | estado | «El nombre del tier es obligatorio» · «Deals mínimos: entero mayor o igual a 0» · «Revenue mínimo: número mayor o igual a 0» · «La tasa debe estar entre 0 y 100» | Junto a cada campo, con foco al primero | Al enviar | partnerModel.ts:92-98 |
| 15 | estado | «No se pudo guardar» + mensaje (`Alert` enfocable) | Fallo del servidor | — | TierForm.tsx:86-91 |
| 16 | botón | «Cancelar» / «Crear tier» / «Guardar» / «Guardando…» | — | En el formulario | TierForm.tsx:93-94 |
| 17 | diálogo | «Eliminar tier» / «Se eliminará el tier «{nombre}». Si algún partner lo tiene asignado, no se podrá borrar hasta moverlo a otro.» | **Anticipa el 409 del servidor** | `deleteTarget` | TierEditor.tsx:106-115 |
| 18 | toast | «Tier creado» / «Tier actualizado» / «Tier «{nombre}» eliminado» / «No se pudo eliminar» | — | Según acción | TierForm.tsx:49 · TierEditor.tsx:51-53 |

El tier en edición se marca con borde azul. Si no hay ningún tier y el usuario puede gestionar, el formulario de alta **se abre solo** (`TierEditor.tsx:44`). Botones del formulario `h-11` en móvil, `sm:h-8` desde 640 px.

### F.12 Automatizaciones — cabecera, filtros y estado vacío `components/crm/automatizaciones/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Automatizaciones» (h1) | Título | Siempre | AutomatizacionesPage.tsx:126 |
| 2 | texto | «Reglas que actúan solas cuando pasa algo en el pipeline. Las ejecuta el servidor, no el navegador.» | Subtítulo | Siempre | AutomatizacionesPage.tsx:127-129 |
| 3 | botón | `aria-label` «Actualizar lista» (RefreshCw) | Recarga reglas y lookups en paralelo | Siempre | AutomatizacionesPage.tsx:132-134 |
| 4 | botón | «Historial» (icono History) | Abre `RunsSheet` **sin** filtrar por regla | Siempre | AutomatizacionesPage.tsx:135-137 |
| 5 | botón | «Nueva regla» (Plus, azul) | Abre `RuleEditorSheet` en alta | Siempre | AutomatizacionesPage.tsx:138-140 |
| 6 | estado | «No se pudieron cargar las reglas» / «No se pudo actualizar la lista» + «{error}. Se muestra la última lista conocida; pulsa «Actualizar» para reintentar.» | El texto cambia si ya hubo carga buena | `error` | AutomatizacionesPage.tsx:144-151 |
| 7 | estado | `Skeleton` de filtro + 3 tarjetas `h-44` (`aria-busy`, `aria-label` «Cargando reglas») | Carga | `loading` | AutomatizacionesPage.tsx:153-159 |
| 8 | estado | «Deja que el CRM trabaje solo» / «Una regla vigila el pipeline y actúa por ti: escribe, crea tareas, mueve etapas. Esta es una de las más usadas:» (icono Sparkles) | Vacío con propósito | 0 reglas | RulesEmptyState.tsx:32-40 |
| 9 | texto | «Ejemplo: Seguimiento de propuesta» + la frase que produce el ejemplo | Se genera con el mismo humanizador que la lista | 0 reglas | RulesEmptyState.tsx:42-49 · ruleEditorModel.ts:98-101 |
| 10 | texto | «En el editor eliges la etapa que la dispara (por ejemplo, «Propuesta enviada»).» | — | 0 reglas | RulesEmptyState.tsx:50-52 |
| 11 | botón | «Usar este ejemplo» (ArrowRight, azul) | Abre el editor precargado con `EXAMPLE_FORM` | 0 reglas | RulesEmptyState.tsx:56-58 |
| 12 | botón | «Empezar desde cero» | Abre el editor vacío | 0 reglas | RulesEmptyState.tsx:59 |
| 13 | estado | «Ninguna regla coincide con los filtros» + «Quitar filtros» | Vacío por filtro | Hay reglas y 0 pasan el filtro | RulesEmptyState.tsx:23-29 |
| 14 | campo | placeholder «Buscar por nombre o descripción…» · etiqueta oculta «Buscar reglas por nombre» (`type="search"`) | — | Con al menos una regla | RulesToolbar.tsx:52-63 |
| 15 | chip | «Todas» · «Activas» · «Inactivas» (grupo «Filtrar por estado», `aria-pressed`, azul sólido al activarse) | — | Siempre | RulesToolbar.tsx:23-27 · 64-76 |
| 16 | texto | «Disparador:» | Rótulo de la segunda fila | Siempre | RulesToolbar.tsx:80 |
| 17 | chip | «Una oportunidad cambia de etapa» · «Ocurre un evento del CRM» · «Cambia un dato de una oportunidad» · «Según programación» · «Alguien la ejecuta a mano» | Filtro de disparador, multiselección | Siempre | RulesToolbar.tsx:82-92 · ruleCatalog.ts:36-40 |
| 18 | botón | «Quitar filtros ({n})» (X) | Devuelve todos los filtros al valor inicial | Solo con filtros activos | RulesToolbar.tsx:94-99 |
| 19 | stat | «{n} regla/reglas» o «{n} de {total} reglas» (`aria-live="polite"`, `ml-auto`) | — | Siempre | RulesToolbar.tsx:100-102 |
| 20 | diálogo | «Eliminar regla» / «Se eliminará «{nombre}» y dejará de ejecutarse. También se borra su historial de ejecuciones. Esta acción no se puede deshacer.» · «Eliminar» | — | `deleteTarget` | AutomatizacionesPage.tsx:225-234 |
| 21 | toast | «Regla creada» / «Regla actualizada» + «Ya está activa.» / «Está desactivada: actívala cuando quieras.» | — | Tras guardar | RuleEditorSheet.tsx:111 |
| 22 | toast | ««{nombre}» activada» / ««{nombre}» desactivada» / ««{nombre}» eliminada» / «No se pudo cambiar el estado» / «No se pudo eliminar» | — | Según acción | AutomatizacionesPage.tsx:83-85 · 106-108 |

Los cinco chips de disparador son frases largas en `flex-wrap`: en móvil ocupan varias líneas. El buscador tiene `min-w-[220px] flex-1`.

### F.13 Automatizaciones — tarjeta de regla `components/crm/automatizaciones/RuleCard.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | Nombre de la regla | H3 (`id="rule-name-{id}"`), dos líneas máximo con corte por palabra | Por tarjeta | RuleCard.tsx:72-74 |
| 2 | texto | Frase del disparador (icono Zap azul) | `describeTrigger(rule, lookups)`: el disparador en lenguaje humano | Por tarjeta | RuleCard.tsx:75-78 |
| 3 | toggle | `aria-label` «Activar la regla {nombre}» / «Desactivar la regla {nombre}» (`id="rule-active-{id}"`) | Activa o desactiva | Por tarjeta; `disabled` al guardar | RuleCard.tsx:81-87 |
| 4 | badge | «Activa» (verde, CheckCircle2) / «Inactiva» (gris, PauseCircle) | Icono **y** texto, no solo color | Por tarjeta | RuleCard.tsx:88-98 |
| 5 | texto | «si» (ámbar) + condiciones en lenguaje humano | Máximo dos líneas | Solo si la regla tiene condiciones | RuleCard.tsx:52 · 103-108 |
| 6 | texto | «entonces» (azul) + acciones en lenguaje humano | — | Siempre | RuleCard.tsx:53 · 109-114 |
| 7 | texto | «no hará nada (sin acciones)» (cursiva, gris) | — | Regla sin acciones | RuleCard.tsx:112 |
| 8 | stat | «Última ejecución: {relativo}» · «1 ejecución» / «{n} ejecuciones» | El `title` lleva la fecha absoluta **ya convertida a la zona de la organización** (`formatDateTime` de `useFormatDate()`) | Por tarjeta | RuleCard.tsx:55 · 117-122 · AutomatizacionesPage.tsx:40 · 185 |
| 9 | botón | «Probar en seco» (FlaskConical, `aria-label` «Probar en seco {nombre}») | Abre `DryRunDialog` con esa regla | Por tarjeta | RuleCard.tsx:125-127 |
| 10 | botón | `aria-label` y tooltip «Historial de {nombre}» (History) | Abre `RunsSheet` filtrado por la regla | Por tarjeta | RuleCard.tsx:128-130 · 38-49 |
| 11 | botón | «Editar {nombre}» (Pencil) + tooltip | Abre `RuleEditorSheet` con la regla | Por tarjeta | RuleCard.tsx:131-133 |
| 12 | botón | «Eliminar {nombre}» (Trash2 rojo) + tooltip | Abre el `ConfirmDialog` | Por tarjeta | RuleCard.tsx:134-136 |
| 13 | tooltip | — | `TooltipProvider` con `delayDuration={300}` envuelve la página entera | Hover sobre los tres botones de icono | AutomatizacionesPage.tsx:122 · RuleCard.tsx:40-47 |

**No hay botón «Duplicar»**: las acciones por regla son exactamente cinco (interruptor, probar en seco, historial, editar, eliminar).

Rejilla `md:grid-cols-2 xl:grid-cols-3`. Cada tarjeta lleva `min-w-0` explícito: sin eso, el nombre truncado fijaba el ancho mínimo y la tarjeta sobresalía a 375 px. Borde punteado cuando la regla está inactiva. El pie se pega abajo con `mt-auto` y separa con `border-t`. Los cuatro botones en `flex items-center gap-0.5`; en móvil «Probar en seco» y los tres iconos caben en una fila, y la fecha sube a su propia línea por el `flex-wrap`.

### F.14 Automatizaciones — editor: marco de la frase `RuleEditorSheet.tsx` · `SentenceBlock.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Nueva regla» / «Editar regla» | Hoja lateral derecha `h-dvh`; **no se cierra mientras guarda** | `open` | RuleEditorSheet.tsx:124 · 138 |
| 2 | texto | «Arma la frase: cuándo se dispara, con qué condiciones y qué hace. Abajo verás cómo queda antes de guardar.» | Descripción | Siempre | RuleEditorSheet.tsx:139-141 |
| 3 | campo | «Nombre de la regla» · placeholder «Seguimiento de propuesta» (`id="rule-name"`, `autoComplete="off"`) | — | Siempre | RuleEditorSheet.tsx:151-160 |
| 4 | estado | «Ponle un nombre de al menos 2 caracteres.» (`role="alert"`) | Al guardar, el foco va a «Nombre de la regla» | Con menos de 2 caracteres | ruleEditorModel.ts:155 · RuleEditorSheet.tsx:87 · 161 |
| 5 | texto | «Cuando» (píldora azul `bg-blue-600` sobre blanco) | Cabecera del bloque del disparador; es el `aria-labelledby` de la sección | Siempre | RuleEditorSheet.tsx:164 · SentenceBlock.tsx:15 · 30-43 |
| 6 | texto | «si» (píldora ámbar `bg-amber-500` sobre `gray-950`) + pista «opcional» | Cabecera del bloque de condiciones | Siempre | RuleEditorSheet.tsx:168 · SentenceBlock.tsx:16 · 44 |
| 7 | texto | «entonces» (píldora esmeralda `bg-emerald-700` sobre blanco) | Cabecera del bloque de acciones | Siempre | RuleEditorSheet.tsx:172 · SentenceBlock.tsx:17 |
| 8 | estado | «No se pudo guardar» + «{error}. Corrige lo indicado y vuelve a intentarlo.» | `Alert` destructivo con `tabIndex={-1}`: recibe el foco tras el fallo | Fallo del `POST`/`PATCH` | RuleEditorSheet.tsx:114-115 · 186-191 |
| 9 | atajo | `Enter` dentro de un campo de texto | Envía el formulario (botón submit `sr-only`, `aria-hidden`) | Siempre | RuleEditorSheet.tsx:192-193 |
| 10 | toggle | «Activa» / «Desactivada» | Estado inicial de la regla; **vive en el pie**, junto a guardar, no plegado en Ajustes | Siempre; `disabled` al guardar | RuleEditorSheet.tsx:213-217 |
| 11 | botón | «Cancelar» | Cierra sin guardar | Siempre; `disabled` al guardar | RuleEditorSheet.tsx:220 |
| 12 | botón | «Crear y activar» / «Crear desactivada» / «Guardar y activar» / «Guardar desactivada» / «Guardando…» | **El texto dice el resultado exacto** según si se edita y si quedará activa | Siempre | RuleEditorSheet.tsx:221-223 · ruleEditorModel.ts:395-398 |

Conector entre bloques: línea vertical decorativa de 1 px (`aria-hidden`) con `ml-6`, entre «Cuando» y «si» y entre «si» y «entonces» (`SentenceBlock.tsx:54-56`).

Hoja `w-full sm:max-w-3xl`, `h-dvh` con `overflow-hidden` que sustituye al `overflow-y-auto` del `Sheet` base; solo el cuerpo (`relative min-h-0 flex-1 overflow-y-auto`) se desplaza, así que cabecera y pie quedan siempre a la vista. Sin `min-h-0` el formulario no encogía y el pie quedaba descolgado. En el pie, bajo 640 px el interruptor va arriba a la izquierda y los dos botones debajo a mitades iguales (`grid grid-cols-2`); desde `sm`, una sola fila. Relleno inferior `pb-[max(0.75rem,env(safe-area-inset-bottom))]`. Al cerrar, el foco vuelve al lápiz de la tarjeta o, si ya no existe, a «Nueva regla».

### F.15 Automatizaciones — bloque «Cuando» `TriggerBlock.tsx` · `EventPicker.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | campo | `<select>` nativo «Disparador» · «Una oportunidad cambia de etapa» · «Ocurre un evento del CRM» · «Cambia un dato de una oportunidad» · «Según programación» · «Alguien la ejecuta a mano» | Cambia el tipo y, con él, qué campos de ámbito se muestran | Siempre | TriggerBlock.tsx:52-61 · ruleCatalog.ts:35-41 |
| 2 | texto | «Se dispara al mover una oportunidad. Puedes acotar a un pipeline y una etapa concreta.» · «Se dispara con un evento del sistema (por ejemplo, opportunity.created). Puedes acotar a un pipeline.» · «Se dispara cuando se actualiza una oportunidad, en cualquier pipeline y etapa.» · «La evalúa el barrido programado del servidor.» · «Solo se ejecuta desde el botón de ejecutar o el asistente.» | Ayuda del disparador elegido (`id="rule-trigger-hint"`) | Siempre | TriggerBlock.tsx:62 · ruleCatalog.ts:36-40 |
| 3 | campo | Combobox «Evento» · valor «Cualquier evento» o «{etiqueta} ({valor})» o el texto libre (`role="combobox"`, `aria-haspopup="listbox"`) | Abre el selector de eventos | **Solo** con «Ocurre un evento del CRM» | TriggerBlock.tsx:66-75 · EventPicker.tsx:28-33 · 51-63 |
| 4 | texto | «Elige uno conocido o escribe otro con la forma entidad.accion. Vacío = cualquier evento.» | Ayuda | Igual | TriggerBlock.tsx:76-78 |
| 5 | campo | placeholder «Buscar o escribir entidad.accion…» | Filtra el catálogo y habilita el nombre libre | Popover abierto | EventPicker.tsx:67 |
| 6 | menú | «Cualquier evento» / «La regla se evalúa con cualquier evento de este tipo.» | Limpia el evento; marca de verificación si no hay evento | Siempre en el popover | EventPicker.tsx:80-86 |
| 7 | menú | Grupo «Eventos conocidos», 10 ítems con etiqueta, valor técnico y descripción: «Se crea una oportunidad» `opportunity.created` / «Al insertar una oportunidad nueva.» · «Termina una llamada» `call.completed` / «Al cerrar una llamada del módulo de voz.» · «Se analiza una llamada» `call.analyzed` / «Cuando el análisis posterior a la llamada queda listo.» · «Se abre un email» `email.opened` / «El cliente abrió un correo enviado desde el CRM.» · «Se hace clic en un email» `email.clicked` / «El cliente pulsó un enlace de un correo.» · «Responden un email» `email.replied` / «Llega una respuesta al hilo de un correo.» · «Rebota un email» `email.bounced` / «El correo no se pudo entregar.» · «Llega un WhatsApp» `whatsapp.inbound` / «Mensaje entrante del cliente por WhatsApp.» · «Vence una tarea» `task.overdue` / «Una tarea de la oportunidad pasó su fecha límite.» · «Se incumple un SLA de etapa» `sla.breached` / «La oportunidad lleva más días en la etapa que su SLA.» | — | Siempre | ruleCatalog.ts:76-85 · EventPicker.tsx:79 · 87-95 |
| 8 | menú | «Usar «{texto}»» (grupo «Nombre libre», icono Pencil) | Acepta un evento fuera del catálogo | Solo si el texto casa `^[a-z_]+\.[a-z_.]+$`, no es conocido y no lo enruta el motor | EventPicker.tsx:26 · 40 · 97-104 |
| 9 | estado | «Ningún evento coincide.» / «Ningún evento coincide. Un nombre libre tiene la forma entidad.accion (minúsculas).» | La segunda redacción con texto escrito que no sirve | 0 coincidencias | EventPicker.tsx:74-78 |
| 10 | estado | «Ese evento va por su propio disparador («cambia de etapa» o «cambia un dato»): una regla de evento con ese nombre no se dispararía.» | Banda ámbar sobre la lista (`role="alert"`) | El texto es `opportunity.stage_changed`, `.won`, `.lost`, `.updated` o `.field_changed` | EventPicker.tsx:39 · 68-72 · ruleCatalog.ts:99-102 |
| 11 | estado | ««{evento}» va por su propio disparador («cambia de etapa» o «cambia un dato»): con «{disparador}» esta regla no se dispararía nunca. Elige otro evento o cambia el disparador.» | Mismo caso para el evento heredado de una regla guardada (`role="alert"`, `aria-describedby`) | `mutedEvent(form)` | TriggerBlock.tsx:47 · 73 · 79-85 |
| 12 | campo | Combobox «En el pipeline» · placeholder «Cualquier pipeline» · vacío «No hay pipelines creados.» (`aria-label` «Pipeline de la regla») | El subtítulo de cada opción es su `pipeline_type` | Disparadores «cambia de etapa» y «evento» (`scope !== 'none'`) | TriggerBlock.tsx:89-107 · ruleCatalog.ts:23 · 36-40 |
| 13 | campo | Combobox «Al entrar en la etapa» · placeholder «Cualquier etapa» · vacío «El pipeline elegido no tiene etapas.» / «No hay etapas creadas.» | Solo ofrece las etapas del pipeline elegido | **Solo** «cambia de etapa» (`scope === 'pipeline_stage'`) | TriggerBlock.tsx:109-125 |
| 14 | estado | «Cargando pipelines…» / «Cargando etapas…» | Sustituye al combobox | `lookups.loading` | TriggerBlock.tsx:95-96 · 112-113 |
| 15 | estado | «Este disparador no mira el pipeline «{x}»: se conserva por si vuelves a un disparador que sí lo use.» · «Este disparador no mira el pipeline «{x}» ni la etapa «{y}»: se conservan por si vuelves a un disparador que sí los use.» | `role="status"` ámbar: **el ámbito guardado nunca se borra en silencio** | Hay pipeline o etapa que el disparador actual ignora | TriggerBlock.tsx:31-40 · 129-135 |

Pipeline y etapa comparten `grid gap-3 sm:grid-cols-2` cuando ambos aplican, y una columna cuando solo hay pipeline. Los campos que aparecen o desaparecen lo hacen con animación de despliegue (`AnimatePresence` + `Expand`). El `<select>` del disparador es nativo, con `SELECT_CLASS` (`h-9`, borde gris, anillo azul al enfocar) definido en `TriggerBlock.tsx:20-23` y reutilizado por los editores de condición y de acción.

### F.16 Automatizaciones — bloque «si» (condiciones) `ConditionsBlock.tsx` · `ConditionChipEditor.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Se cumple si» | Rótulo del grupo «Cómo se combinan las condiciones» | **Solo con más de una condición** | ConditionsBlock.tsx:85-87 |
| 2 | chip | «todas» / «alguna» (`aria-pressed`) | Pone `op = and` / `op = or` | Más de una condición | ConditionsBlock.tsx:88-98 |
| 3 | estado | «Sin condiciones: se dispara siempre que ocurra el disparador. Añade una solo si necesitas filtrar.» | Vacío del bloque | 0 condiciones | ConditionsBlock.tsx:102-105 |
| 4 | chip | Frase de la condición en lenguaje humano (`describeCondition`) | Abre o cierra su editor debajo (`id="cond-chip-{i}"`, `aria-expanded`, `aria-controls`) | Por condición simple | ConditionsBlock.tsx:117-136 |
| 5 | chip | «({frase del grupo})» o «(grupo vacío)» + «· grupo, se edita como JSON» | **No editable en ficha** (`aria-disabled`, cursor normal); el motivo va en texto visible, no en un `title` | Condición de tipo grupo anidado | ConditionsBlock.tsx:123-132 |
| 6 | campo | Select «Campo», agrupado por prefijo (`opportunity.`, `customer.`, `stage.`, `pipeline.`, `consent.`, `event.`) con 39 etiquetas: «Monto de la oportunidad» · «Moneda» · «Estado» · «Temperatura» · «Banda ICP» · «Puntaje ICP» · «Puntaje total» · «Tipo de registro» · «Origen» · «Cierre esperado» · «Último contacto» · «Canal de contacto» · «Resultado de contacto» · «Tipo de trato» · «Nombre» · «Etapa» · «Pipeline» · «Tipo de cliente» · «Etapa del ciclo de vida» · «Puntaje de salud» · «Etiquetas» · «Tamaño de empresa» · «Tiene email» · «Tiene teléfono» · «Email» · «Teléfono» · «ID de etapa» · «Nombre de etapa» · «Posición» · «Probabilidad» · «Es ganada» · «Es perdida» · «Días SLA» · «ID de pipeline» · «Tipo de pipeline» · «Consentimiento email» · «Consentimiento WhatsApp» · «Consentimiento SMS» · «Consentimiento voz» · «Tipo de evento» | Si la regla guarda un campo fuera de lista (p. ej. `event.payload.*`), se añade como primera opción con su nombre técnico para no perderlo | Editor abierto | ConditionChipEditor.tsx:23 · 45 · 93-111 · conditionsDsl.ts:62-74 · conditionsI18n.ts:16-57 |
| 7 | campo | Select «Operador» · 15 opciones traducidas por `operatorLabel`: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `contains`, `not_contains`, `is_null`, `is_not_null`, `before`, `after`, `within_days` | Cambia el control de valor que se pinta | Editor abierto | ConditionChipEditor.tsx:112-122 · conditionsDsl.ts:56-59 |
| 8 | campo | «Valor» · placeholder «Valor» (o «a, b, c» en listas) | Texto libre | Operadores que necesitan valor y no son de etapa/pipeline | ConditionChipEditor.tsx:79-87 · 126 |
| 9 | campo | Combobox «Valor» · placeholder «Elige una etapa» · vacío «No hay etapas creadas.» (`aria-label` «Valor de la condición {n}») | **La etapa se elige por nombre, no por identificador** | `eq`/`ne` sobre `opportunity.stage_id` o `stage.id` | ConditionChipEditor.tsx:21 · 46-47 · 53-65 |
| 10 | campo | Combobox «Valor» · placeholder «Elige un pipeline» · vacío «No hay pipelines creados.» | Igual, para pipelines | `eq`/`ne` sobre `opportunity.pipeline_id` o `pipeline.id` | ConditionChipEditor.tsx:22 · 66-77 |
| 11 | texto | «Este operador no necesita valor.» | Sustituye por completo al campo de valor | `is_null`, `is_not_null` | ConditionChipEditor.tsx:19 · 50-52 |
| 12 | texto | «Varios valores separados por coma.» | Ayuda | `in`, `not_in` | ConditionChipEditor.tsx:20 · 34 |
| 13 | texto | «Número de días hacia atrás desde hoy.» | Ayuda | `within_days` | ConditionChipEditor.tsx:35 |
| 14 | texto | «Fecha en formato AAAA-MM-DD.» | Ayuda | `before`, `after` | ConditionChipEditor.tsx:36 |
| 15 | texto | «Texto, número, true o false. Los IDs de etapa se eligen por nombre.» | Ayuda por defecto | Resto de operadores | ConditionChipEditor.tsx:37 · 128-130 |
| 16 | botón | «Quitar condición» (Trash2, rojo) | Borra, cierra el editor y devuelve el foco a «Añadir condición» | Editor abierto | ConditionChipEditor.tsx:133-137 · ConditionsBlock.tsx:152-156 |
| 17 | botón | «Añadir condición» (Plus, `id="cond-add"`) | Crea una condición, la selecciona y pone el foco en su campo «Campo» | Siempre | ConditionsBlock.tsx:76-81 · 163-165 |
| 18 | botón | «Editar como JSON» (Code2) | Vuelca el árbol actual y abre el diálogo | Siempre | ConditionsBlock.tsx:59-63 · 166-168 |
| 19 | diálogo | «Condiciones en JSON» / «Para grupos anidados y casos avanzados. Campos permitidos: opportunity.*, customer.*, stage.*, pipeline.*, consent.*, event.*.» | Textarea monoespaciada de 10 filas con etiqueta oculta «JSON de las condiciones» | `jsonOpen` | ConditionsBlock.tsx:171-188 |
| 20 | estado | Mensaje devuelto por `setConditionsFromJson` (`role="alert"`) | El diálogo **no se cierra** y el texto escrito se conserva | JSON inválido al aplicar | ConditionsBlock.tsx:65-73 · 189-191 |
| 21 | botón | «Cancelar» / «Aplicar» | «Aplicar» vuelca el JSON, deselecciona la ficha y cierra | En el diálogo | ConditionsBlock.tsx:192-195 |

Las fichas van en `flex flex-col gap-2 sm:flex-row sm:flex-wrap` (`CHIP_LIST_CLASS`): en móvil cada condición es una tarjeta a ancho completo cuyo texto envuelve; desde 640 px vuelven a ser píldoras en línea con el texto truncado. El texto usa `min-w-0 flex-1 break-words sm:truncate` y el chevron `mt-[3px] … sm:mt-0` para alinearse con la primera línea en móvil (`chipClasses.ts:19-47`). En una ficha de grupo, «· grupo, se edita como JSON» baja a su propia línea bajo `sm` (`basis-full`). El editor en sitio es una caja ámbar con `grid gap-3 sm:grid-cols-3`. Al cerrar el diálogo de JSON el foco vuelve a «Editar como JSON».

### F.17 Automatizaciones — bloque «entonces» (acciones) `ActionsBlock.tsx` · `ActionChipEditor.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Sin acciones la regla no hará nada aunque se dispare. Añade al menos una.» | Vacío del bloque | 0 acciones | ActionsBlock.tsx:87-90 |
| 2 | chip | Número (`aria-label` «Acción {n}») + frase de la acción en lenguaje humano | Abre o cierra el editor en sitio (`id="action-chip-{i}"`, `aria-expanded`, `aria-controls`) | Por acción | ActionsBlock.tsx:100-118 |
| 3 | badge | (AlertTriangle ámbar, `aria-label` «Revisar») | Marca la ficha con error de validación o con tipo no implementado; el borde pasa a ámbar | Según el caso | ActionsBlock.tsx:83 · 98 · 106 · 113 |
| 4 | botón | «Añadir acción» (Plus, `id="action-add"`, `aria-haspopup="listbox"`) | Abre un menú buscable con el catálogo | Siempre | ActionsBlock.tsx:153-157 |
| 5 | campo | placeholder «Buscar acción…» | Filtra por etiqueta y por tipo técnico | Menú abierto | ActionsBlock.tsx:161 · 166 |
| 6 | estado | «Ninguna acción coincide.» | Vacío | 0 coincidencias | ActionsBlock.tsx:163 |
| 7 | menú | Grupo «Disponibles», 9 ítems: «Enviar email» / «Al cliente de la oportunidad. Se respeta su consentimiento y la baja voluntaria.» · «Enviar WhatsApp» / «Solo dentro de la ventana de 24 h; fuera de ella hace falta una plantilla aprobada (HSM).» · «Crear tarea» / «Para el responsable de la oportunidad.» · «Registrar actividad» / «Deja constancia en la línea de tiempo de la oportunidad.» · «Cambiar un dato» / «Solo campos de la lista permitida; el motor valida el valor.» · «Inscribir en secuencia» / «La secuencia enviará sus mensajes según su propio calendario.» · «Sacar de secuencia» / «Detiene los mensajes pendientes de esa secuencia.» · «Avisar al responsable» / «Notificación interna, no sale al cliente.» · «Mover de etapa» / «Cambia la oportunidad a otra etapa del pipeline.» | Añade la ficha y la abre con el foco en su primer campo | Siempre | ActionsBlock.tsx:164-173 · ruleCatalog.ts:147-224 |
| 8 | menú | Grupo «Todavía no disponibles», 5 ítems con icono AlertTriangle: «Enviar SMS» · «Lanzar agente IA» · «Redactar email con IA» · «Solicitar reunión» · «Webhook saliente» | **Se pueden añadir y guardar**, pero la ejecución quedará fallida (§G) | Siempre | ActionsBlock.tsx:174-181 · ruleCatalog.ts:225-229 |
| 9 | campo | Select «Acción {n}» · las 14 entradas, con « (no disponible)» en las cinco no implementadas | Cambia el tipo conservando lo que se pueda | Editor abierto | ActionChipEditor.tsx:117-122 |
| 10 | texto | Pista del tipo elegido (la misma frase del menú, `id="action-{i}-type-hint"`) | — | Editor abierto | ActionChipEditor.tsx:123 |
| 11 | botón | `aria-label` «Subir la acción {n}» (ArrowUp) | Sube un puesto; el foco sigue al botón en su nueva posición | Editor abierto; `disabled` en la primera | ActionChipEditor.tsx:126-128 · ActionsBlock.tsx:136-142 |
| 12 | botón | `aria-label` «Bajar la acción {n}» (ArrowDown) | Baja un puesto | Editor abierto; `disabled` en la última | ActionChipEditor.tsx:129-131 |
| 13 | botón | «Quitar» (Trash2, rojo) | Borra la acción; el foco vuelve a «Añadir acción» | Editor abierto | ActionChipEditor.tsx:132-134 · ActionsBlock.tsx:143-147 |
| 14 | estado | «Esta acción todavía no está disponible: si la dejas, la ejecución quedará marcada como fallida.» (`role="alert"` ámbar, AlertTriangle) | — | Acción no implementada | ActionChipEditor.tsx:138-143 |
| 15 | campo | «Asunto» · placeholder «Seguimiento de {{opportunity_name}}» | — | Acción «Enviar email» | ruleCatalog.ts:151 |
| 16 | campo | Combobox «Plantilla» · placeholder «Sin plantilla (contenido libre)» · vacío «No hay plantillas creadas.» · ayuda «Si eliges plantilla, el contenido de abajo se ignora.» | — | Acción «Enviar email» | ruleCatalog.ts:152 · ActionChipEditor.tsx:54-56 |
| 17 | campo | Textarea «Contenido (HTML)» · placeholder `<p>Hola {{first_name\|cliente}}</p>` · 3 filas, ocupa las dos columnas | — | Acción «Enviar email» | ruleCatalog.ts:153 · ActionChipEditor.tsx:89-91 · 101 |
| 18 | campo | Textarea «Texto» · placeholder «Hola {{first_name\|cliente}}, …» · 3 filas | — | Acción «Enviar WhatsApp» | ruleCatalog.ts:161 |
| 19 | campo | Combobox «Plantilla HSM» · placeholder «Sin plantilla (contenido libre)» | — | Acción «Enviar WhatsApp» | ruleCatalog.ts:162 |
| 20 | campo | «Título» · placeholder «Llamar a {{customer_name}}» | — | Acción «Crear tarea» | ruleCatalog.ts:170 |
| 21 | campo | «Vence en (días)» · placeholder «3» (`type="number" inputMode="numeric"`) | Vacío se guarda como indefinido | Acción «Crear tarea» | ruleCatalog.ts:171 · ActionChipEditor.tsx:92-95 |
| 22 | campo | Textarea «Descripción» de 3 filas | — | Acción «Crear tarea» | ruleCatalog.ts:172 |
| 23 | campo | Select «Tipo» · los valores de `ACTIVITY_TYPES` del enum del CRM (por defecto `system`) | — | Acción «Registrar actividad» | ruleCatalog.ts:144 · 180 · ActionChipEditor.tsx:82-88 |
| 24 | campo | Textarea «Notas» de 3 filas | — | Acción «Registrar actividad» | ruleCatalog.ts:181 |
| 25 | campo | Select «De» · «Oportunidad» · «Cliente» · «Tarea» | Al cambiarla, «Campo» salta al primer campo permitido de esa entidad | Acción «Cambiar un dato» | ruleCatalog.ts:189 · ActionChipEditor.tsx:38 · 63-69 |
| 26 | campo | Select «Campo» · «Elige un campo» + `temperature`, `next_contact_at`, `next_action`, `expected_close_date`, `amount`, `recontact_at`, `source`, `deal_type` (oportunidad) · `lifecycle_stage`, `tags` (cliente) · `priority`, `due_date` (tarea) | **Lista cerrada, espejo exacto de la lista permitida del motor** | Acción «Cambiar un dato» | ruleCatalog.ts:131-135 · ActionChipEditor.tsx:71-81 |
| 27 | campo | «Nuevo valor» · placeholder «hot» | — | Acción «Cambiar un dato» | ruleCatalog.ts:191 |
| 28 | campo | Combobox «Secuencia» · placeholder «Elige una secuencia» · vacío «No hay secuencias creadas.» · subtítulo «activa» / «inactiva» | — | Acciones «Inscribir en secuencia» y «Sacar de secuencia» | ruleCatalog.ts:198 · 205 · ActionChipEditor.tsx:57-59 |
| 29 | campo | «Motivo» (texto libre) | — | Acción «Sacar de secuencia» | ruleCatalog.ts:206 |
| 30 | campo | «Título» y Textarea «Contenido» | — | Acción «Avisar al responsable» | ruleCatalog.ts:214-215 |
| 31 | campo | Combobox «Etapa destino» · placeholder «Elige una etapa» · vacío «No hay etapas creadas.» | — | Acción «Mover de etapa» | ruleCatalog.ts:222 · ActionChipEditor.tsx:60-62 |
| 32 | estado | «Elige la secuencia.» · «Elige el campo que cambia.» · «Elige la etapa destino.» (`role="alert"`) | Al guardar, el editor abre la ficha con fallo y le da el foco | Al guardar | ruleEditorModel.ts:162-172 · RuleEditorSheet.tsx:92-97 · ActionChipEditor.tsx:107 |
| 33 | estado | «Cargando…» | Sustituye a los combobox de plantilla, secuencia y etapa | `lookups.loading` | ActionChipEditor.tsx:105 |

Mismo `CHIP_LIST_CLASS` que las condiciones, con el número en un círculo esmeralda de `h-5 min-w-5`. El editor en sitio es una caja esmeralda: bajo 640 px el selector de tipo ocupa toda la fila y los tres botones caen debajo; desde `sm` comparten fila (`sm:min-w-[200px] sm:flex-1`). Los campos van en `grid gap-3 sm:grid-cols-2` y los `textarea` ocupan las dos columnas. Al añadir una acción desde el menú, el popover **no** devuelve el foco a «Añadir acción»: lo cede al primer campo de la ficha recién creada.

### F.18 Automatizaciones — vista previa y ajustes `RulePreview.tsx` · `RuleSettings.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Así funcionará» (icono Eye) | Cabecera; `aria-labelledby` de la sección | Siempre | RulePreview.tsx:29-31 |
| 2 | cálculo | Frase completa de la regla | `describeRule(...)`: **la misma frase que verá el usuario en la tarjeta de la lista**; `aria-live="polite"`, se reescribe con cada cambio | Siempre | RulePreview.tsx:18-21 · 33 |
| 3 | texto | Notas de `previewNotes(form)` unidas por « · », con la primera letra en mayúscula y punto final | Avisos de lo que falta o de lo que se va a ignorar | Si hay notas | RulePreview.tsx:22 · 34-38 |
| 4 | botón | «Ajustes» + resumen «prioridad {n} · una vez por oportunidad / se repite por oportunidad · enfriamiento {n} h / sin enfriamiento» | Despliega el bloque; el chevron rota 180° | Siempre | RuleSettings.tsx:27-33 · 42-57 |
| 5 | campo | Textarea «Descripción (opcional)» · placeholder «Para qué sirve esta regla, en una frase.» · 2 filas | — | Ajustes abiertos | RuleSettings.tsx:59-63 |
| 6 | campo | «Prioridad» · ayuda «Menor número, se evalúa antes. 100 por defecto.» (`type="number" min=0 max=10000`) | — | Ajustes abiertos | RuleSettings.tsx:66-75 |
| 7 | estado | «La prioridad va de 0 a 10000.» | Al guardar, **abre los ajustes** y pone el foco en el campo | Fuera de rango o no entero | ruleEditorModel.ts:156-158 · RuleEditorSheet.tsx:88-91 |
| 8 | campo | «Enfriamiento (horas)» · ayuda «Tiempo mínimo entre dos ejecuciones sobre la misma oportunidad. 0 = sin límite.» (`min=0 max=8760`) | — | Ajustes abiertos | RuleSettings.tsx:76-85 |
| 9 | estado | «El enfriamiento va de 0 a 8760 horas.» | Igual: abre los ajustes y enfoca | Fuera de rango | ruleEditorModel.ts:159-161 |
| 10 | toggle | «Solo una vez por oportunidad» | `run_once_per_opportunity` | Ajustes abiertos | RuleSettings.tsx:88-91 |

La vista previa es una caja gris con `break-words`, porque los marcadores tipo `{{opportunity_name}}` no tienen espacios y no cabían en una línea en móvil. Los ajustes son un `Collapsible`; prioridad y enfriamiento comparten `grid gap-3 sm:grid-cols-2`. El resumen del disparador plegado se trunca.

### F.19 Automatizaciones — «Probar en seco» e «Historial» `DryRunDialog.tsx` · `RunsSheet.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Probar en seco «{nombre}»» (FlaskConical azul) | Al cerrar, el foco vuelve a «Probar en seco» de la tarjeta | `open` | DryRunDialog.tsx:49 · 79-86 |
| 2 | texto | «Elige una oportunidad y verás qué haría la regla con ella. No se envía nada, no se cambia nada y no queda en el historial.» | Descripción | Siempre | DryRunDialog.tsx:87-89 |
| 3 | campo | «Oportunidad» · placeholder «Buscar por nombre…» (`type="search"`) | — | Siempre | DryRunDialog.tsx:94-99 |
| 4 | texto | «Sin elegir: se evalúa sin oportunidad (solo el disparador y las condiciones que no la necesitan).» / «Elegida: {nombre}» | Ayuda que cambia con la selección | Siempre | DryRunDialog.tsx:100-102 |
| 5 | chip | «Sin oportunidad» (`aria-pressed`) | Primera opción | Siempre | DryRunDialog.tsx:107-112 |
| 6 | chip | «{oportunidad} · {cliente} · {etapa}» | Elige la oportunidad | Por resultado | DryRunDialog.tsx:114-126 |
| 7 | estado | «Ninguna oportunidad coincide.» | Vacío | 0 resultados | DryRunDialog.tsx:127-129 |
| 8 | estado | Mensaje de la búsqueda (`role="alert"`) | — | `searchError` | DryRunDialog.tsx:105 |
| 9 | estado | «No se pudo probar» + mensaje (`Alert` destructivo) | — | Fallo del `dry_run` | DryRunDialog.tsx:132-137 |
| 10 | texto | «La regla se dispararía» (verde, CheckCircle2) / «La regla no se dispararía» (XCircle) | Titular del resultado (`aria-live="polite"`) | Tras probar | DryRunDialog.tsx:141-145 |
| 11 | texto | Motivo en lenguaje humano (`describeSkipReason`) | — | No dispara y hay motivo | DryRunDialog.tsx:146-148 |
| 12 | texto | «Condiciones» + una línea por condición con ✓/✗ y « — valor real: {x}» | El valor real se traduce: «vacío», «sí»/«no», números en formato español | Si hay traza | DryRunDialog.tsx:33-39 · 150-167 |
| 13 | texto | «campo no permitido» / «operador no permitido» | Sustituye a la frase cuando la condición no es válida | Traza con `reason` | DryRunDialog.tsx:73-76 |
| 14 | texto | «Haría, en este orden» / «Haría si se disparara» | Cabecera de la lista numerada de acciones | Tras probar | DryRunDialog.tsx:169-172 |
| 15 | texto | «Nada: la regla no tiene acciones.» | — | Plan vacío | DryRunDialog.tsx:173-174 |
| 16 | texto | «(no disponible: fallaría)» | Sufijo ámbar de una acción no implementada | Por acción | DryRunDialog.tsx:180 |
| 17 | botón | «Cerrar» / «Probar» / «Probar de nuevo» / «Probando…» | Llama al `dry_run` del servidor; `disabled` sin regla | Siempre | DryRunDialog.tsx:191-194 |
| 18 | diálogo | «Historial de «{regla}»» / «Historial de todas las reglas» | Depende de desde dónde se abrió | `open` | RunsSheet.tsx:74-76 |
| 19 | texto | «Últimas 50 ejecuciones reales del servidor. Las pruebas en seco no se registran aquí.» | Descripción | Siempre | RunsSheet.tsx:77-79 |
| 20 | botón | «Actualizar» (RefreshCw) | Vuelve a pedir las ejecuciones | Siempre; `disabled` al cargar | RunsSheet.tsx:83-85 |
| 21 | estado | «No se pudo cargar el historial» + «{error} — pulsa «Actualizar» para reintentar.» | — | `error` | RunsSheet.tsx:88-93 |
| 22 | estado | 4 `Skeleton` de `h-10` (`aria-busy`) | Carga | `loading` | RunsSheet.tsx:95-98 |
| 23 | estado | «Todavía no hay ejecuciones. Cuando la regla se dispare, aparecerán aquí.» | Vacío | 0 filas | RunsSheet.tsx:99-102 |
| 24 | tabla | «Estado» · «Fecha» · «Detalle» | «Fecha» se oculta bajo 640 px (`hidden sm:table-cell`) y su valor se repite dentro de «Estado» | Siempre | RunsSheet.tsx:106-113 · 120-131 |
| 25 | badge | Etiqueta e icono según tono: verde CheckCircle2, rojo XCircle, azul Loader2 girando, ámbar Clock, gris MinusCircle | `describeRunStatus` decide etiqueta y tono | Por fila | RunsSheet.tsx:31-48 · 116-124 |
| 26 | texto | Motivo de omisión en lenguaje humano | — | `run.skip_reason` | RunsSheet.tsx:135 |
| 27 | texto | Mensaje de error en rojo (`overflow-wrap: anywhere`) | Para no ensanchar la tabla | `run.error_message` | RunsSheet.tsx:136-138 |
| 28 | texto | «{n}. {acción} — ok» / «{n}. {acción} — error: {detalle}» / «— error: sin detalle» | Una línea por acción ejecutada | Si hay resultados | RunsSheet.tsx:139-148 |
| 29 | texto | «Sin detalle» | — | Ni motivo, ni error, ni resultados | RunsSheet.tsx:149-151 |

`DryRunDialog` es `max-w-2xl`, `max-h-[90vh] overflow-y-auto`; cada chip de resultado lleva `min-w-0 max-w-full` para no desbordar en móvil. `RunsSheet` es `sm:max-w-2xl`, con la tabla en `overflow-x-auto`.

### F.20 Agentes IA — cabecera, pestañas y tarjeta de agente `components/crm/agentes/AgentesIaPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Agentes IA de voz» (h1, icono Bot) | Título | Siempre | AgentesIaPage.tsx:109-111 |
| 2 | texto | «Quién llama, con qué voz y con qué objetivo. El guion por etapa se configura en el embudo.» | Subtítulo | Siempre | AgentesIaPage.tsx:112-114 |
| 3 | botón | «Nuevo agente» (Plus, `w-full sm:w-auto`) | Abre `AgentEditorDialog` en alta | Siempre | AgentesIaPage.tsx:117-120 |
| 4 | pestaña | «Agentes» (Bot) | Lista de agentes | Siempre | AgentesIaPage.tsx:125-128 |
| 5 | pestaña | «Voces» (Mic) | `VoicesPanel` | Siempre | AgentesIaPage.tsx:129-132 |
| 6 | pestaña | «Campañas» (Megaphone) | `AgentCampaignsPanel` | Siempre | AgentesIaPage.tsx:133-136 |
| 7 | estado | «Cargando agentes…» (spinner en línea) | Carga | `loading` | AgentesIaPage.tsx:140-145 |
| 8 | estado | «No se pudieron cargar los agentes» + mensaje + «Reintentar» | `LoadErrorState` | `error` | AgentesIaPage.tsx:147-154 |
| 9 | estado | «Todavía no hay agentes. Crea uno y luego dile en cada etapa del embudo qué debe conseguir.» + «Crear el primer agente» (caja punteada, icono Bot) | Vacío | 0 agentes | AgentesIaPage.tsx:156-166 |
| 10 | texto | Nombre del agente (`break-words`) | — | Por tarjeta | AgentesIaPage.tsx:177 |
| 11 | texto | «{propósito} · {modelo} · {idioma}» — propósitos: «Calificar contacto» · «Confirmar demo» · «Seguimiento de propuesta» · «Reactivar frío» · «Cobro» · «Encuesta NPS» · «Renovación» · «Vender producto» · «Agendar reunión» · «Personalizado» | **Estas etiquetas divergen de las del editor** (§G) | Por tarjeta | AgentesIaPage.tsx:40-51 · 178-180 |
| 12 | badge | «Activo» (`success`) / «Inactivo» (`secondary`) | — | Por tarjeta | AgentesIaPage.tsx:182-184 |
| 13 | texto | «Voz del catálogo (puede ser la voz clonada del vendedor)» / «Voz: {id}» / «Sin voz propia: se usará la voz por defecto» | Tres casos según `voice_ref_id` y `voice_id` | Por tarjeta | AgentesIaPage.tsx:186-192 |
| 14 | botón | «Editar» | Abre el editor con el agente | Por tarjeta | AgentesIaPage.tsx:194-196 |
| 15 | botón | «Activar» / «Desactivar» | `PATCH /api/crm/voice-agents/{id}` con `is_active` invertido | Por tarjeta | AgentesIaPage.tsx:197-199 |
| 16 | toast | «Agente activado» / «Agente desactivado» / «No se pudo cambiar el estado» + motivo | — | Tras pulsar | AgentesIaPage.tsx:93 · 97-101 |

Pestañas `grid-cols-3` a ancho completo bajo 640 px e `inline-flex` desde ahí. Tarjetas en `grid-cols-1 md:grid-cols-2`. **Sin paginación ni buscador**: se pintan todos los agentes.

### F.21 Agentes IA — editor: marco y pestañas «Propósito» y «Guion» `AgentEditorDialog.tsx` · `editor/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | diálogo | «Nuevo agente IA» / «Editar agente IA» | Hoja derecha `h-dvh`, `sm:max-w-2xl` | Con `draft` | AgentEditorDialog.tsx:81-83 |
| 2 | texto | «Define cómo habla el agente. Lo que debe conseguir en cada etapa se configura en el embudo.» | Descripción | Siempre | AgentEditorDialog.tsx:84-87 |
| 3 | estado | «Cargando…» | Sustituye al cuerpo entero | `loading` (modo edición) | AgentEditorDialog.tsx:90-94 |
| 4 | texto | «Paso {n} de 4» (`aria-live="polite"`) | — | **Solo bajo 640 px** (`sm:hidden`) | AgentEditorDialog.tsx:102-107 |
| 5 | pestaña | «Propósito» (Target) · «Guion» (ScrollText) · «Voz» (Mic) · «Herramientas» (Wrench) | Pasos 1 a 4 | Siempre | AgentEditorDialog.tsx:38-41 · 114-125 |
| 6 | botón | «Cancelar» | Cierra sin guardar | Siempre | AgentEditorDialog.tsx:151-153 |
| 7 | botón | «Guardar agente» / «Guardando…» | Guarda y cierra si va bien | Siempre; `disabled` al guardar o cargar | AgentEditorDialog.tsx:154-168 |
| 8 | campo | «Nombre» · placeholder «Ej. Ana, asistente comercial» | — | Paso 1 | AgentPurposeTab.tsx:55-64 |
| 9 | campo | Select «Propósito» · «Vender un producto» · «Agendar una reunión» · «Calificar contacto» · «Confirmar demo» · «Seguimiento de propuesta» · «Reactivar contacto frío» · «Cobro» · «Encuesta NPS» · «Recordar renovación» · «Personalizado» | — | Paso 1 | AgentPurposeTab.tsx:24-35 · 66-80 |
| 10 | campo | Select «Modelo de lenguaje» · placeholder «Elige un modelo» · una opción por modelo del catálogo | Solo modelos de proveedores con credenciales; el recomendado lleva Sparkles con `aria-label` «Recomendado» | Catálogo cargado y no vacío | AgentPurposeTab.tsx:108-137 · agentModels.ts:51-79 |
| 11 | texto | «{gama} · {nota}» (gamas «Económico» · «Equilibrado» · «Premium» · «Antiguo») o «Solo aparecen los modelos de proveedores con credenciales en esta organización.» | Ayuda del modelo | Igual | AgentPurposeTab.tsx:133-136 · agentModels.ts:39-44 |
| 12 | texto | «Guardado en el agente, pero ya no está en el catálogo» | Ayuda de un modelo fuera de catálogo que se conserva | Valor guardado que ya no existe | agentModels.ts:68-77 |
| 13 | estado | «Cargando los modelos disponibles…» | — | `models.loading` | AgentPurposeTab.tsx:84-88 |
| 14 | campo | «Modelo de lenguaje» · placeholder «Nombre del modelo» | El select **degrada a texto libre** | Error del catálogo o 0 opciones | AgentPurposeTab.tsx:89-107 |
| 15 | estado | «No se pudo leer el catálogo de modelos ({error}); escribe el nombre a mano.» (`role="status"` ámbar) | — | `models.error` | AgentPurposeTab.tsx:103-104 |
| 16 | estado | «Ningún proveedor de IA tiene credenciales: escribe el nombre a mano o configúralas en Proveedores e IA.» | — | 0 opciones y sin error | AgentPurposeTab.tsx:105 |
| 17 | texto | «Topes por llamada» (`legend` del `fieldset`) | — | Paso 1 | AgentPurposeTab.tsx:142-144 |
| 18 | campo | «Turnos» · ayuda «Intercambios como máximo» (`type="number" min=1`) | — | Paso 1 | AgentPurposeTab.tsx:145-159 |
| 19 | campo | «Segundos» · ayuda «Duración máxima de la llamada» (`min=30 step=30`) | — | Paso 1 | AgentPurposeTab.tsx:160-175 |
| 20 | toggle | «Agente activo» | `is_active` | Paso 1 | AgentPurposeTab.tsx:178-187 |
| 21 | estado | «Sea cual sea este guion, el agente siempre se identifica como asistente virtual, avisa de la grabación, respeta la baja voluntaria y no cierra ventas por su cuenta.» (caja verde, ShieldCheck) | **Los guardarraíles no son configurables** | Paso 2 | AgentScriptTab.tsx:23-29 |
| 22 | campo | Textarea «Primera frase» · placeholder «Le llamo de {{org}} por su solicitud. ¿Tiene un minuto?» · 2 filas | — | Paso 2 | AgentScriptTab.tsx:30-39 |
| 23 | campo | «Cómo se identifica como IA» · placeholder «Le atiende un asistente virtual con inteligencia artificial.» | — | Paso 2 | AgentScriptTab.tsx:40-48 |
| 24 | campo | Textarea «Instrucciones del agente» de 6 filas, **sin placeholder** | — | Paso 2 | AgentScriptTab.tsx:49-57 |

Cuatro pestañas en `grid-cols-4` con icono sobre etiqueta a 375 px y en línea desde `sm`. Cabecera y pie fijos, cuerpo con scroll propio (`min-h-0 flex-1 overflow-y-auto`). Pie con `pb-[calc(0.75rem+env(safe-area-inset-bottom))]` y botones `flex-1` en móvil. Los dos topes van en `grid-cols-2` fijo: siguen lado a lado también a 375 px.

### F.22 Agentes IA — editor: pestañas «Voz» y «Herramientas» `AgentVoiceTab.tsx` · `VoicePickCard.tsx` · `AgentToolsTab.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Este agente hablará con «{voz}».» / «Sin voz propia: hablará con la voz por defecto de la organización, «{voz}».» / «Hablará con el identificador suelto {id} (no está en el catálogo).» / «No hay ninguna voz elegida ni por defecto: hablará con la voz estándar de Google.» | Resumen azul `role="status"`; **cuatro redacciones** según qué resuelve | Paso 3 | AgentVoiceTab.tsx:42-54 · 71-78 |
| 2 | texto | «Voz de este agente» (`legend`) | — | Paso 3 | AgentVoiceTab.tsx:80-83 |
| 3 | estado | 2 `Skeleton` de `h-20` (`aria-label` «Cargando el catálogo de voces») | Carga | `loading` | AgentVoiceTab.tsx:84-89 |
| 4 | estado | «No se pudo cargar el catálogo de voces: {error}» + «Reintentar» (`role="alert"` rojo) | — | `error` | AgentVoiceTab.tsx:90-99 |
| 5 | campo | Radio «Voz por defecto de la organización» + «Ahora es «{voz}»» / «Ninguna marcada: voz estándar de Google» | Primera tarjeta del `radiogroup` | Paso 3 | AgentVoiceTab.tsx:106-119 |
| 6 | campo | Radio con el nombre de cada voz + badges | Radio real oculto pero enfocable; las flechas cambian de voz | Por voz del catálogo | AgentVoiceTab.tsx:120-134 · VoicePickCard.tsx:58-129 |
| 7 | badge | «De la biblioteca» / «Clonada» (`info`) / «Diseñada» | — | Por voz | VoicePickCard.tsx:95-100 · useVoiceCatalog.ts:150-154 |
| 8 | badge | «Por defecto» (verde, Star) | — | Voz marcada por defecto | VoicePickCard.tsx:101-106 |
| 9 | badge | Idioma, género, edad, acento y uso | De `voice.labels` | Según etiquetas | VoicePickCard.tsx:107-111 |
| 10 | texto | «Consentimiento registrado» (verde, ShieldCheck) | — | `consent_recorded_at` | VoicePickCard.tsx:114-119 |
| 11 | texto | «Inactiva: el agente no la usará» | Subtítulo | `!v.is_active` | AgentVoiceTab.tsx:128 |
| 12 | botón | «Escuchar» / «Detener» (`aria-label` «Escuchar una muestra de {voz}» / «Detener la muestra de {voz}») | Reproduce `preview_url` o `/api/crm/voices/{id}/preview` | Por voz; `disabled` si el proveedor no es ElevenLabs | AgentVoiceTab.tsx:129-133 · VoicePreviewButton.tsx:29-52 |
| 13 | estado | Loader2 en el botón | — | `status === 'loading'` | VoicePreviewButton.tsx:43-44 |
| 14 | estado | «Todavía no hay voces en el catálogo.» + «Añade una de la biblioteca o clona la tuya. Mientras tanto, este agente llamará con la voz estándar de Google.» | Vacío | 0 voces y clave de TTS presente | AgentVoiceTab.tsx:138-148 |
| 15 | estado | «Falta la clave de voz sintética (TTS): sin ella no se puede añadir ni clonar ninguna voz.» | Sustituye a la frase anterior | 0 voces y `!tts.ready` | AgentVoiceTab.tsx:147 |
| 16 | botón | «Añade una voz del catálogo» | Cierra el editor y abre la pestaña «Voces» | En el vacío, con `onGoToVoices` | AgentVoiceTab.tsx:150-159 |
| 17 | botón | «Guardar la clave de voz» | `/app/configuracion?modulo=crm&tab=proveedores` | En el vacío y `!tts.ready` | AgentVoiceTab.tsx:160-164 · useVoiceCatalog.ts:57 |
| 18 | estado | «Actualizando…» | — | `catalog.refreshing` | AgentVoiceTab.tsx:168-172 |
| 19 | texto | «Una voz clonada exige consentimiento registrado de su propietario (Ley 1581 de 2012).» | Nota legal permanente | Paso 3 | AgentVoiceTab.tsx:173-175 |
| 20 | campo | «Idioma» · ayuda «Código, p. ej. es-CO» | Texto libre | Paso 3 | AgentVoiceTab.tsx:179-187 |
| 21 | campo | Select «Transcripción» · «Deepgram nova-3» · «Por defecto de Twilio» · ayuda «Quién convierte la voz en texto» | — | Paso 3 | AgentVoiceTab.tsx:188-202 |
| 22 | botón | «Avanzado: identificador de voz suelto» | Despliega el bloque; abierto de entrada si ya hay valor | Paso 3 | AgentVoiceTab.tsx:59 · 205-217 |
| 23 | campo | «Identificador de voz suelto (opcional)» · placeholder «Ej. 6xftrpatV0jGmFHxDjUv» | — | Bloque desplegado | AgentVoiceTab.tsx:218-226 |
| 24 | texto | «Salida de emergencia: solo entra en juego cuando la selección de arriba no resuelve a ninguna voz activa.» (AlertTriangle) | — | Bloque desplegado | AgentVoiceTab.tsx:227-234 |
| 25 | toast | «No se pudo reproducir» + motivo | — | Error del reproductor | AgentVoiceTab.tsx:61-65 |
| 26 | texto | «Qué puede hacer el agente durante la llamada. Cada etapa del embudo puede acotar más esta lista.» | — | Paso 4 | AgentToolsTab.tsx:37-40 |
| 27 | toggle | 11 casillas: «Consultar la ficha del cliente» · «Mover de etapa (no puede cerrar)» · «Actualizar datos de la oportunidad» · «Crear tarea de seguimiento» · «Agendar reunión» · «Programar devolución de llamada» · «Registrar objeción» · «Preparar enlace de pago» · «Registrar baja voluntaria» · «Transferir a una persona» · «Terminar la llamada» | «Registrar baja voluntaria» y «Terminar la llamada» están **marcadas y bloqueadas** | Paso 4 | AgentToolsTab.tsx:16-26 · 43-54 |
| 28 | badge | «Obligatoria por ley» (ámbar, icono Lock; `aria-describedby` de la casilla bloqueada) | — | En las dos obligatorias | AgentToolsTab.tsx:63-71 |
| 29 | texto | «Registrar un «no me vuelva a llamar» y poder colgar son obligatorias (Ley 1581 de 2012). No se pueden desactivar ni acotar desde la etapa del embudo.» | Nota al pie | Paso 4 | AgentToolsTab.tsx:76-79 |

Las tarjetas de voz van en `grid-cols-1 sm:grid-cols-2`; idioma y transcripción, en `grid-cols-2` fijo. Cada fila de herramienta mide `min-h-11` (44 px), suficiente como objetivo táctil.

### F.23 Agentes IA — pestaña «Voces»: marco y biblioteca `VoicesPanel.tsx` · `voces/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Falta la clave de ElevenLabs: puedes explorar la biblioteca, pero no añadir, clonar ni reproducir voces en llamadas hasta guardarla en Configuración › CRM › Proveedores e IA.» | El texto final es un **enlace subrayado** | Se sabe que no hay clave | VoicesPanel.tsx:47-62 |
| 2 | estado | «No se pudo comprobar si hay clave de ElevenLabs configurada (falló la lectura de Proveedores e IA). Añadir, clonar o escuchar pueden fallar con el error del proveedor.» (caja gris) | — | `tts.unknown` | VoicesPanel.tsx:63-74 |
| 3 | pestaña | «Biblioteca» (Library) | Biblioteca pública | Siempre | VoicesPanel.tsx:79-82 |
| 4 | pestaña | «Mis voces» + badge con el número (`aria-label` «Mis voces, {n}»; el badge es `aria-hidden` para que el lector no lea «Mis voces5») | — | El badge solo si hay voces | VoicesPanel.tsx:84-98 |
| 5 | pestaña | «Clonar mi voz» (Mic) | Asistente de clonación | Siempre | VoicesPanel.tsx:99-102 |
| 6 | campo | placeholder «Buscar por nombre, acento o estilo…» · etiqueta oculta «Buscar voz por nombre o descripción» (`type="search"`) | — | Siempre | VoiceLibraryFilters.tsx:82-94 |
| 7 | botón | «Filtros» + contador (`aria-label` «{n} activos» / «1 activo») | Despliega los tres selectores | **Solo bajo 768 px** (`md:hidden`) | VoiceLibraryFilters.tsx:96-111 |
| 8 | stat | «{n} de {total} voces» (total con separador de miles `es-CO`, `role="status" aria-live="polite"`) | — | Junto al buscador desde `md`; al pie de los chips bajo `md` | VoiceLibraryFilters.tsx:76 · 112-114 · 199-201 |
| 9 | campo | Select «Idioma» · «Español» (por defecto) · «Inglés» · «Portugués» · «Francés» · «Italiano» · «Alemán» + «Todos los idiomas» | — | Desplegado o desde `md` | VoiceLibraryFilters.tsx:121-134 · voiceLibrary.ts:108 |
| 10 | campo | Select «Género de la voz» · «Cualquier género» · «Masculina» · «Femenina» · «Neutra» | — | Igual | VoiceLibraryFilters.tsx:136-149 · voiceLibrary.ts:80-82 |
| 11 | campo | Select «Caso de uso» · «Cualquier uso» · «Conversación» · «Narración» · «Personajes y animación» · «Redes sociales» · «Entretenimiento y TV» · «Publicidad» · «Informativo y educativo» | — | Igual | VoiceLibraryFilters.tsx:151-164 · voiceLibrary.ts:88-96 |
| 12 | chip | ««{búsqueda}»» / «{idioma}» / «{género}» / «{uso}» (`aria-label` «Quitar filtro {x}») | Cada chip quita su filtro y mueve el foco al siguiente | Por filtro activo | VoiceLibraryFilters.tsx:42-51 · 170-183 |
| 13 | botón | «Limpiar filtros» | Devuelve todo al inicial y enfoca el buscador | Si hay chips | VoiceLibraryFilters.tsx:184-194 |
| 14 | texto | «Español primero. Cambia el idioma, el género o el uso para afinar.» | Sustituye a los chips | Sin filtros activos | VoiceLibraryFilters.tsx:196-198 |
| 15 | estado | 8 tarjetas esqueleto con avatar, dos líneas, dos etiquetas y dos botones (`aria-busy`, `aria-label` «Cargando voces») | Carga | `lib.loading` | VoiceLibraryGrid.tsx:104-127 |
| 16 | estado | «No se pudo cargar la biblioteca de ElevenLabs» + mensaje + «Reintentar» | — | `lib.error` | VoiceLibraryGrid.tsx:129-131 |
| 17 | estado | «Ninguna voz coincide con esos filtros.» / «Prueba con otra palabra o quita algún filtro.» + «Limpiar filtros» (icono Music4) | Vacío | 0 resultados | VoiceLibraryGrid.tsx:133-140 |
| 18 | texto | Nombre + «{estilo · acento}» + «usada por {n}» | Cabecera de la tarjeta | Por voz | VoiceCard.tsx:60-66 |
| 19 | texto | Descripción, máximo dos líneas | — | Si existe | VoiceCard.tsx:70-72 |
| 20 | badge | «Plan de pago» (ámbar, Lock) | Primera etiqueta de la lista | Voz sin plan gratuito | VoiceCard.tsx:76-83 |
| 21 | badge | Etiquetas de la voz | — | Por etiqueta | VoiceCard.tsx:84-88 |
| 22 | texto | «Solo se puede añadir con un plan de pago de ElevenLabs.» / «No se puede añadir con el plan gratuito de ElevenLabs de esta cuenta.» | La segunda cuando el servidor confirma cuenta gratuita | Voz de pago | VoiceCard.tsx:92-98 |
| 23 | botón | «Escuchar» / «Detener» | `disabled` si no hay `preview_url` | Por voz | VoiceCard.tsx:102-108 |
| 24 | botón | «Añadir» (`aria-label` «Añadir {voz} a mis voces») | `POST /api/crm/voices/library` | Voz que no está en el catálogo; `disabled` si la cuenta gratuita la bloquea | VoiceCard.tsx:116-134 |
| 25 | estado | Loader2 dentro de «Añadir» (`aria-busy`); **el botón no se deshabilita**, para no perder el foco si falla | — | `adding` | VoiceCard.tsx:126-132 |
| 26 | texto | «En mis voces» (verde, Check, `role="status"`) | Sustituye al botón | Voz ya añadida | VoiceCard.tsx:110-114 |
| 27 | botón | «Cargar más voces» / «Cargando más voces…» | Alternativa accesible al scroll incremental | Si quedan páginas | VoiceLibraryGrid.tsx:163-170 |
| 28 | toast | ««{voz}» añadida a tus voces» / ««{voz}» ya estaba en tus voces» + «Puedes marcarla por defecto o asignársela a un agente en la pestaña Mis voces.» | — | Tras añadir | VoiceLibraryGrid.tsx:80-83 |
| 29 | toast | «No se pudo añadir la voz» / «No se pudo reproducir» + motivo | — | Fallos | VoiceLibraryGrid.tsx:44 · 86 |

Rejilla `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`. Cada tarjeta fija sus dos botones en `grid-cols-2` para que «Añadir» no se salga a 375 px. El centinela de `IntersectionObserver` va 400 px antes del final.

### F.24 Agentes IA — «Mis voces» y «Más opciones» `voces/MyVoicesPanel.tsx` · `MyVoiceCard.tsx` · `VoiceAddForms.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «Voz por defecto: **{voz}** / **ninguna (voz estándar de Google)**. ¿Cómo se elige la voz de una llamada?» | Despliega la explicación | Siempre | MyVoicesPanel.tsx:156-163 |
| 2 | texto | Lista numerada: «La voz asignada a ese agente (aquí con «Asignar a un agente» o en su editor).» · «Si no tiene, la marcada como **Por defecto**.» · «Si tampoco hay, la voz estándar de Google de Twilio: funciona, pero suena genérica.» | **Precedencia real** | Desplegado | MyVoicesPanel.tsx:165-171 |
| 3 | estado | «No se pudo leer la lista de agentes: {error}. Podrás asignar voces cuando vuelva a cargar.» + «Reintentar» (`role="status"` ámbar) | — | `agentsError` | MyVoicesPanel.tsx:174-182 |
| 4 | estado | 3 tarjetas esqueleto (`aria-label` «Cargando mis voces») | Carga | `loading` | MyVoicesPanel.tsx:184-193 |
| 5 | estado | «No se pudo cargar el catálogo de voces» + «Reintentar» | — | `error` | MyVoicesPanel.tsx:195-197 |
| 6 | estado | «Todavía no tienes voces guardadas.» / «Elige una de la biblioteca o clona la tuya. Mientras tanto, los agentes llaman con la voz estándar.» | Vacío | 0 voces | MyVoicesPanel.tsx:199-205 |
| 7 | botón | «Explorar la biblioteca» (Library, azul) / «Clonar mi voz» (Mic) | Cambian de vista | En el vacío | MyVoicesPanel.tsx:207-212 |
| 8 | badge | «De la biblioteca» / «Clonada» / «Diseñada» | — | Por tarjeta | MyVoiceCard.tsx:83 |
| 9 | badge | «Por defecto» (verde, Star) | — | Voz por defecto | MyVoiceCard.tsx:84-89 |
| 10 | badge | «Inactiva» (outline) | — | `!is_active` | MyVoiceCard.tsx:90 |
| 11 | botón | `aria-label` «Borrar la voz {nombre}» (Trash2) | Abre la confirmación | Por tarjeta | MyVoiceCard.tsx:93-102 |
| 12 | texto | «La usan: {agentes}» / «La usan todos los agentes sin voz propia.» / «Todavía no la usa ningún agente.» | Tres casos | Por tarjeta | MyVoiceCard.tsx:113-118 |
| 13 | texto | «consentimiento registrado» (verde, ShieldCheck) | — | `consent_recorded_at` | MyVoiceCard.tsx:119-124 |
| 14 | botón | «Detalles técnicos» | Despliega identificador, modelo, proveedor y descripción | Por tarjeta | MyVoiceCard.tsx:128-137 |
| 15 | texto | «Identificador» · «Modelo» · «Proveedor» · «Descripción» | Lista de definición monoespaciada | Desplegado | MyVoiceCard.tsx:139-161 |
| 16 | botón | `aria-label` «Copiar el identificador de {voz}» (Copy) | Copia al portapapeles | Desplegado | MyVoiceCard.tsx:143-145 |
| 17 | toast | «Identificador copiado» / «No se pudo copiar el identificador» (el valor va en la descripción) | — | Al copiar | MyVoiceCard.tsx:40-47 |
| 18 | botón | «Escuchar» / «Detener» | `disabled` si el proveedor no es ElevenLabs | Por tarjeta | MyVoiceCard.tsx:166-172 |
| 19 | botón | «Por defecto» (Star, `aria-label` «Usar {voz} por defecto») | `PATCH /api/crm/voices` con `is_default: true`; el botón desaparece después | Solo si no es ya la voz por defecto | MyVoiceCard.tsx:174-189 |
| 20 | campo | Select placeholder «Asignar a un agente…» · «{agente}» y «{agente} · ya la usa» (`aria-label` «Asignar la voz {voz} a un agente») | `PATCH /api/crm/voice-agents/{id}` con `voice_ref_id` | Solo si hay agentes; `disabled` mientras asigna | MyVoiceCard.tsx:191-204 |
| 21 | botón | «Más opciones: importar el workspace de ElevenLabs o registrar una voz por identificador» | Despliega `VoiceAddForms` | Siempre | MyVoicesPanel.tsx:243-257 |
| 22 | diálogo | «¿Borrar la voz «{nombre}»?» + texto de `describeVoiceRemoval` · «Borrar voz» · «Cancelar» | `DELETE /api/crm/voices?id=…` | `toDelete` | MyVoicesPanel.tsx:263-273 |
| 23 | toast | ««{voz}» es ahora la voz por defecto» / «La usarán los agentes que no tengan una voz propia.» | — | Tras predeterminar | MyVoicesPanel.tsx:105 |
| 24 | toast | ««{voz}» asignada a {agente}» / «No se pudo asignar la voz» | — | Tras asignar | MyVoicesPanel.tsx:116-119 |
| 25 | toast | ««{voz}» borrada» + «También se eliminó en ElevenLabs.» / «Solo se quitó del catálogo; en ElevenLabs sigue disponible.» | La segunda frase solo si el proveedor conserva la voz | Tras borrar | MyVoicesPanel.tsx:136-143 |
| 26 | texto | «Traer las voces que ya existen en ElevenLabs» / «Copia a este catálogo las voces que ya están en tu workspace de ElevenLabs (las que añadiste desde la web del proveedor o clonaste allí). Para explorar la biblioteca pública usa la pestaña Biblioteca.» | — | «Más opciones» | VoiceAddForms.tsx:122-129 |
| 27 | botón | «Importar de ElevenLabs» (Download) | `POST /api/crm/voices` con `action: import_elevenlabs` | `disabled` sin credencial, con `title` explicativo | VoiceAddForms.tsx:130-133 |
| 28 | texto | «Desactivado: Necesita una clave de ElevenLabs válida en Proveedores e IA. Configurarla» (la última palabra es un enlace) | — | Sin credencial | VoiceAddForms.tsx:46 · 134-141 |
| 29 | texto | «Registrar una voz por su identificador» / «Si ya sabes el identificador de la voz en ElevenLabs, pégalo aquí y quedará disponible para los agentes sin importar todo el catálogo.» | — | «Más opciones» | VoiceAddForms.tsx:145-152 |
| 30 | campo | «Nombre» · placeholder «Voz de Camilo» | — | Siempre | VoiceAddForms.tsx:155-156 |
| 31 | campo | «Identificador de voz (ElevenLabs)» · placeholder «6xftrpatV0jGmFHxDjUv» | — | Siempre | VoiceAddForms.tsx:159-165 |
| 32 | toggle | «Es una voz clonada de una persona del equipo» | Al marcarla aparece la casilla de consentimiento | Siempre | VoiceAddForms.tsx:169-173 |
| 33 | toggle | «Confirmo que la persona propietaria de la voz dio su consentimiento por escrito y que no es la voz de un tercero (Ley 1581 de 2012 y política de ElevenLabs).» (caja ámbar) | Sin ella no se registra | Solo con la casilla anterior marcada | VoiceAddForms.tsx:175-183 |
| 34 | botón | «Registrar voz» | `POST /api/crm/voices` | Siempre | VoiceAddForms.tsx:186-189 |
| 35 | toast | «Faltan el nombre y el identificador de la voz» · «Falta el consentimiento» / «Una voz clonada solo puede registrarse con el consentimiento de su propietario.» · «Voz registrada» / «Ya puedes asignársela a un agente.» | — | Al registrar | VoiceAddForms.tsx:65-76 · 90 |
| 36 | toast | «Importadas {n} voces» / «ElevenLabs no devolvió ninguna voz» / «ElevenLabs rechazó la petición» | — | Tras importar | VoiceAddForms.tsx:105-116 |

Rejilla `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. El `<article>` de cada voz lleva `tabIndex={-1}` para poder recibir el foco tras borrar la vecina. El borde se tiñe de azul en la voz por defecto. La lista se refresca en sitio (`aria-busy`), sin volver al esqueleto.

### F.25 Agentes IA — asistente «Clonar mi voz» `voces/CloneVoiceWizard.tsx` y sus pasos

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «El plan actual de ElevenLabs ({tier}) no permite clonar voces» / «Puedes grabar y escuchar la muestra, pero «Crear mi voz» quedará deshabilitado: hace falta al menos el plan Starter en la cuenta cuya clave está configurada.» | **Se avisa antes de empezar** | El servidor dice que el plan no clona | CloneVoiceWizard.tsx:225-234 |
| 2 | texto | «Consentimiento» · «Grabar el guion» · «Escuchar» · «Nombrar y crear» | Indicador de pasos (`aria-current="step"`, estado en texto oculto « (completado)» / « (paso actual)») | Siempre | CloneStepIndicator.tsx:11 · 13-37 |
| 3 | texto | «Paso {n} de 4 · {título}» | H2 enfocable; se anuncia al cambiar de paso | Siempre | CloneVoiceWizard.tsx:238-241 |
| 4 | texto | «Lees en voz alta un guion corto que verás en pantalla; se graba aquí mismo.» · «La grabación viaja a ElevenLabs, que crea una réplica de tu voz en unos segundos.» · «Tarda menos de {n} minutos. El audio no se guarda en esta plataforma.» | Tres tarjetas del paso 1 | Paso 1 | CloneStepConsent.tsx:26-28 |
| 5 | texto | «Consentimiento para clonar una voz (Habeas Data)» + `HABEAS_DATA_TEXT` (caja ámbar) | — | Paso 1 | CloneStepConsent.tsx:45-53 |
| 6 | toggle | «He leído el texto anterior y confirmo que la voz que voy a grabar es la mía o cuento con el consentimiento por escrito de su propietario.» | Registra el momento del consentimiento | Paso 1 | CloneStepConsent.tsx:55-69 · CloneVoiceWizard.tsx:133-137 |
| 7 | estado | «Marca la casilla de consentimiento para continuar.» (`role="alert"`, foco a la casilla) | — | Continuar sin marcar | voiceCloneScript.ts:131 |
| 8 | texto | «Lee este guion en voz alta» + «≈ {m:ss} min · habla natural, sin prisa» + el guion en párrafos | El guion es fijo (`CLONE_SCRIPT_ES`) | Paso 2 | CloneStepRecord.tsx:50-62 |
| 9 | texto | «Grabadora» + cronómetro (`role="timer"`, `aria-label` «Tiempo grabado {m:ss}») + medidor de nivel | — | Paso 2 | CloneStepRecord.tsx:65-77 |
| 10 | texto | Barra de avance (`aria-label` «Avance respecto a la duración recomendada») + pista de `describeRecordHint` (`aria-live="polite"`) | — | Paso 2 | CloneStepRecord.tsx:79-82 |
| 11 | botón | «Grabar» / «Grabar otra muestra» / «Detener» | **Un solo botón que alterna**, para no perder el foco | Paso 2; `disabled` sin soporte o con 5 muestras | CloneStepRecord.tsx:85-96 |
| 12 | estado | Mensaje del grabador (permiso de micrófono, etc.) (`role="alert"`) | — | `recorder.error` | CloneStepRecord.tsx:98-100 |
| 13 | estado | «Graba el guion (o sube un archivo) antes de continuar.» · «La muestra es muy corta: necesita al menos {n} segundos. Lee el guion completo.» · «La muestra es demasiado larga (máximo {n} segundos). Vuelve a grabar solo el guion.» · «La muestra pesa más de 10 MB. Graba de nuevo o usa un archivo más ligero.» | Validación del paso 2 | Al continuar | voiceCloneScript.ts:132-141 |
| 14 | texto | «Muestra {n} · {descripción}» + botón `aria-label` «Quitar la muestra {n}» (Trash2) | Lista de muestras listas | Con al menos una | CloneStepRecord.tsx:105-116 |
| 15 | campo | «¿Sin micrófono? Sube hasta 5 archivos de audio (mp3, wav, m4a, ogg o webm; máximo 10 MB cada uno)» (`type="file" accept="audio/*" multiple`) | — | Paso 2 | CloneStepRecord.tsx:118-135 |
| 16 | estado | «Como máximo {n} muestras: se tomaron las {m} primeras.» | Al subir de más | — | CloneVoiceWizard.tsx:142 |
| 17 | texto | «Una muestra lista» / «{n} muestras listas» · «{m:ss} min en total» + «Si se oye ruido de fondo, cortes o la lectura salió apresurada, quítala y graba de nuevo: la voz clonada copiará exactamente lo que oigas aquí. Con dos o tres muestras el clon sale mejor.» (caja verde) | — | Paso 3 | CloneStepReview.tsx:47-58 |
| 18 | texto | Reproductor `<audio controls>` por muestra (`aria-label` «Muestra {n}, muestra grabada de tu voz») | — | Paso 3 | CloneStepReview.tsx:38-39 |
| 19 | botón | «Quitar» (`aria-label` «Quitar la muestra {n}») | Al quedarse sin muestras vuelve al paso 2 | Paso 3 | CloneStepReview.tsx:33-36 · CloneVoiceWizard.tsx:158-166 |
| 20 | botón | «Grabar otra muestra» (Mic) | Vuelve al paso 2 | Paso 3 | CloneStepReview.tsx:70-75 |
| 21 | texto | Avatar + «{nombre}» o «Tu voz» + «{n} muestras · {m:ss} min» | Resumen visual | Paso 4 | CloneStepName.tsx:30-36 |
| 22 | campo | «Nombre de la voz» · placeholder «Por ejemplo: Voz de Camila (ventas)» · ayuda «Así la verás en Mis voces y en el editor de agentes.» | `maxLength` del modelo | Paso 4 | CloneStepName.tsx:39-58 |
| 23 | estado | «Ponle un nombre a la voz de {min} a {max} caracteres.» (con foco al campo) | — | Al crear | voiceCloneScript.ts:146 |
| 24 | toggle | «Usarla como voz por defecto de la organización (los agentes sin voz propia llamarán con ella).» | — | Paso 4 | CloneStepName.tsx:61-66 |
| 25 | botón | «Atrás» (ArrowLeft) | `disabled` en el paso 1, al enviar y mientras graba | Siempre | CloneVoiceWizard.tsx:264-266 |
| 26 | botón | «Continuar» (ArrowRight) | Valida el paso y avanza | Pasos 1-3; `disabled` mientras graba | CloneVoiceWizard.tsx:267-270 |
| 27 | botón | «Crear mi voz» / «Creando la voz…» (Sparkles) | `POST /api/crm/voices/clone` en multipart, 120 s de tiempo máximo | Paso 4; `disabled` si el plan no clona | CloneVoiceWizard.tsx:272-282 |
| 28 | texto | «El plan actual de ElevenLabs ({tier}) no permite clonar voces.» (`aria-describedby` del botón deshabilitado) | — | Plan sin clonación | CloneVoiceWizard.tsx:283-287 |
| 29 | estado | «No se pudo crear la voz» + «{error} Puedes intentarlo de nuevo; las muestras siguen aquí.» (`Alert` destructivo) | — | Fallo del proveedor | CloneVoiceWizard.tsx:243-249 |
| 30 | estado | ««{nombre}» ya está en tus voces» + «Escúchala en Mis voces, márcala por defecto o asígnala a un agente.» / «ElevenLabs pide verificar la voz antes de usarla en llamadas.» | **Sustituye al asistente entero** | Tras crear | CloneVoiceWizard.tsx:206-221 |
| 31 | botón | «Clonar otra voz» | Reinicia el asistente | En el estado de éxito | CloneVoiceWizard.tsx:218 |
| 32 | toast | «Voz «{nombre}» creada» | — | Tras crear | CloneVoiceWizard.tsx:197 |

Paso 2 en `lg:grid-cols-[1.4fr_1fr]`: guion y grabadora lado a lado **solo desde 1024 px**. Paso 4 en `sm:grid-cols-[auto_1fr]`. El asistente no roba el foco al montarse, solo al cambiar de paso.

### F.26 Agentes IA — pestaña «Campañas» `AgentCampaignsPanel.tsx` · `campanas/**`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Nueva campaña» (icono Megaphone) | Cabecera del alta | Siempre | AgentCampaignsPanel.tsx:168-174 |
| 2 | campo | «Nombre» · placeholder «Ej. Seguimiento de propuestas» | — | Siempre | AgentCampaignsPanel.tsx:176-184 |
| 3 | campo | Select «Agente que llama» · «{agente}» y «{agente} (inactivo)» | Prefiere los agentes activos | **Solo si hay más de un agente seleccionable** | AgentCampaignsPanel.tsx:185-203 |
| 4 | estado | «No hay agentes: crea uno en la pestaña «Agentes» antes de lanzar una campaña.» (`role="status"` ámbar) | — | 0 agentes | AgentCampaignsPanel.tsx:204-208 |
| 5 | campo | Select «Embudo» · placeholder «Elige un embudo» · «Sin embudo (lista manual)» + pipelines | Al cambiarlo se limpia la etapa | Siempre | CampaignTargetPicker.tsx:84-102 |
| 6 | campo | Select «Etapa a la que llamar» · placeholder «Elige una etapa» / «Primero elige un embudo» · «Ninguna (lista manual)» + etapas | **Excluye las etapas de cierre** (ganada/perdida) | `disabled` sin embudo elegido | CampaignTargetPicker.tsx:103-122 · campaignModel.ts:106-111 |
| 7 | texto | «El agente llamará a las oportunidades abiertas de esa etapa.» / «Contando oportunidades abiertas…» / «1 oportunidad abierta en esta etapa ahora mismo.» / «{n} oportunidades abiertas en esta etapa ahora mismo.» | `aria-live="polite"`; **si no se puede contar, no inventa** | Siempre | CampaignTargetPicker.tsx:123-137 |
| 8 | estado | «Cargando embudos…» | Sustituye a los dos selectores | `lookups.loading` | CampaignTargetPicker.tsx:59-66 |
| 9 | estado | «No se pudieron leer los embudos ({error}). La campaña se creará como lista manual.» | — | `lookups.error` | CampaignTargetPicker.tsx:67-73 |
| 10 | estado | «No hay embudos en esta organización: la campaña se creará como lista manual.» | — | 0 pipelines | CampaignTargetPicker.tsx:74-80 |
| 11 | botón | «Crear campaña» | `POST /api/crm/voice-agents/campaigns` en estado `draft` | `disabled` sin agentes o mientras crea | AgentCampaignsPanel.tsx:219-226 |
| 12 | estado | «Cargando campañas…» | Carga | `loading` | AgentCampaignsPanel.tsx:229-233 |
| 13 | estado | «No se pudieron cargar las campañas» + «Reintentar» | — | `loadError` | AgentCampaignsPanel.tsx:234-240 |
| 14 | estado | «Todavía no hay campañas.» | Vacío | 0 campañas | AgentCampaignsPanel.tsx:241-242 |
| 15 | badge | «Borrador» (gris) · «Programada» (info) · «En marcha» (verde) · «En pausa» (ámbar) · «Terminada» (gris) · «Detenida» (rojo suave) | «Detenida» manda sobre el estado si `emergency_stop` | Por tarjeta | campaignModel.ts:34-56 · CampaignCard.tsx:40-49 |
| 16 | texto | «Destino» + «Etapa {x} · {embudo}» / «Lista manual» / «Etapa del embudo (ya no existe)» | Resuelve el `stage_id` contra los lookups | Por tarjeta | CampaignCard.tsx:52-55 · campaignModel.ts:72-83 |
| 17 | texto | «Agente» + nombre | — | Si la fila trae agente | CampaignCard.tsx:56-61 |
| 18 | stat | «Topes» + «{n}/día · {n}/hora · {n} a la vez» | **Se muestran, pero no se pueden editar** (§G) | Por tarjeta | CampaignCard.tsx:62-67 |
| 19 | estado | «Parada de emergencia: {motivo}» / «Parada de emergencia» / «Motivo: {motivo}» (`role="status"` rojo) | — | Si hay motivo o parada | CampaignCard.tsx:69-73 · campaignModel.ts:45-55 |
| 20 | botón | «Activar» (Play) | `PATCH` con `status: running`, `emergency_stop: false` | Campaña no en marcha o parada | CampaignCard.tsx:75-89 · AgentCampaignsPanel.tsx:252-254 |
| 21 | botón | «Parada de emergencia» (OctagonX, destructivo) | `PATCH` con `emergency_stop: true`, `status: paused` | Campaña en marcha | CampaignCard.tsx:90-105 · AgentCampaignsPanel.tsx:255-257 |
| 22 | toast | «Campaña creada en borrador» / «Actívala cuando quieras que empiece a llamar.» | — | Tras crear | AgentCampaignsPanel.tsx:123-126 |
| 23 | toast | «La campaña necesita un nombre» · «Primero crea un agente» / «La campaña necesita un agente que llame.» | Validación | Al crear | AgentCampaignsPanel.tsx:100-111 |
| 24 | toast | «Campaña activada» / «Campaña detenida» / «No se pudo crear la campaña» / «No se pudo actualizar» | — | Según acción | AgentCampaignsPanel.tsx:128-133 · 149 · 252-257 |

Campañas en `grid-cols-1 md:grid-cols-2`. Embudo y etapa en `grid-cols-1 sm:grid-cols-2`. Los botones de acción son `w-full sm:w-auto`. Todos los `SelectTrigger` llevan `[&>span]:line-clamp-1` para que un nombre largo no tape el chevron.

---

## G. Lo roto o sin efecto

Agrupado por gravedad. Todo verificado en el código; el §H confirma las columnas.

### G.1 Bloqueantes: la acción no hace nada y la interfaz dice que sí

| # | Qué | Archivo:línea | Detalle |
|---|---|---|---|
| 1 | **Identidades: las tres acciones de fila no escriben nada y el toast miente** | `IdentidadesService.ts:41-113` frente a `:207-242` | `getIdentities` **no lee** `customer_channel_identities`: fabrica identidades sintéticas a partir de `customers`, con ids inventados (`email_{uuid}`, `phone_{uuid}`, `whatsapp_{uuid}`). Pero «Verificar», «Guardar» y «Eliminar» escriben contra `customer_channel_identities` filtrando por `.eq('id', id)`. Ese id no existe: PostgREST afecta cero filas **sin error**, el servicio devuelve `true` y la UI muestra «Identidad verificada» / «Los cambios han sido guardados» / «La identidad ha sido eliminada». Al recargar, todo sigue igual. Afecta a `IdentidadesPage.tsx:98-116`, `:124-149` y `:151-171` |
| 2 | **Ficha CRM › Finanzas: la lista de folios no puede funcionar** | `CustomerFoliosSection.tsx:82-87` | `.eq('reservation_id', supabase.from('reservations').select('id').eq('customer_id', customerId))` pasa un *query builder* de PostgREST como si fuera un valor escalar. `supabase-js` no soporta subconsultas así: el objeto se serializa y el filtro nunca casa. La pestaña muestra 0 folios, «Folios Pendientes» siempre en 0 y «Deuda Total» = solo facturas |
| 3 | **`ClientesTable`: «Activar» / «Desactivar» es un handler vacío sobre una columna inexistente** | `ClientesTable.tsx:377-382` | `onClick={() => { /* Implementar cambio de estado */ }}`. Además `customers` **no tiene** columna `is_active` (§H), así que `customer.is_active === false` nunca se cumple y el ítem siempre dice «Desactivar» |
| 4 | **«Unificar» / «Fusionar clientes» no tiene backend** | `ClientesActions.tsx:714-719` | Botón con `disabled` literal y sin `onClick`. Comprobado por MCP: **no existe** ninguna RPC `merge_customers`. El diálogo lo admite en su propio texto («Funcionalidad de fusión de clientes en desarrollo»), pero la descripción promete un selector de cliente principal que tampoco existe |
| 5 | **`MergeModal` › «Crear como Nuevo» falla siempre** | `ClientForm.tsx:692-728` · `MergeModal.tsx:99-105` | Inserta un cliente con el mismo documento o email que disparó la detección de duplicado. La BD tiene `UNIQUE (organization_id, identification_number)` y `UNIQUE (organization_id, email)` (§H): el insert revienta con un error crudo de Postgres en el toast |
| 6 | **`MergeModal` › «Actualizar Existente» degrada una empresa a persona** | `ClientForm.tsx:663-690` | Copia solo `first_name`, `last_name`, `phone`, `address`, `notes` y los roles. No copia `customer_type`, `company_name`, `trade_name`, `dv`, `fiscal_responsibilities`, `fiscal_municipality_id` ni `parent_customer_id` |
| 7 | **`AsignarTab`: las columnas «Cliente» y «Etapa» siempre muestran «—»** | `AsignarTab.tsx:159` · `:161` | `o.customers?.[0]?.full_name` y `o.stages?.[0]?.name`. Un embebido a-uno de PostgREST llega como **objeto**, no como arreglo. El propio archivo documenta la trampa en `:50-51` para `profiles` (allí sí usa `pickEmbedded`); `types.ts:64-65` la perpetúa declarándolos como arreglos |
| 8 | **Identidades: los filtros «Canal» y «Estado» no filtran** | `IdentidadesService.ts:12-118` | `filters.channelId` y `filters.verified` se guardan y se envían, pero `getIdentities` solo usa `search` e `identityType`. Además `verified` está cableado: emails y teléfonos siempre `true`, WhatsApp siempre `false` (`:45`, `:73`, `:100`) |
| 9 | **Identidades: la columna «Canal» siempre es «-»** | `IdentidadesService.ts:44` · `:72` · `:97` | Las identidades sintéticas nacen con `channel_id: ''` y sin objeto `channel`, así que la rama del badge (`IdentidadesTable.tsx:172-180`) nunca se cumple. Lo mismo en el CSV (`:354`) |
| 10 | **Pipeline › «Mensaje» de acciones masivas muestra el panel equivocado** | `modals/BulkActionsDialog.tsx:452-462` | Fija `tab='message'`, pero el render es un ternario de dos ramas (`:470` y `:838`): cualquier valor distinto de `'assign'` cae en «Mover de etapa». La pestaña se marca activa y el contenido es otro |
| 11 | **Ordenar por «Etapa» ordena por fecha de creación** | `TableView.tsx:478` · `switch` `:225-251` | `handleSort('stage_name')` no tiene caso en el `switch` y cae en `default` (`created_at`). La flecha cambia de dirección y el usuario cree que ordenó |
| 12 | **Wizard de campaña › «Programar» del modo texto libre se descarta** | `CampanaNuevaPage.tsx:124` | `MessageForm` se monta con `scheduledAt={null}` y `onScheduledAt={() => undefined}`: el botón «Programar» abre el `datetime-local` pero lo escrito se pierde. La programación real vive en el paso 3 |
| 13 | **«Exportar» e «Importar» de oportunidades solo lanzan un toast** | `OpportunitiesFilters.tsx:102-123` · `page.tsx:198-212` | Dos botones permanentes en la barra principal que responden «Info» / «Función de exportación próximamente» y «Función de importación próximamente». El importador real (`ImportLeadsCsv`, 15 controles) existe y **no lo monta nadie** (§CA.8) |
| 14 | **«Marcar ganada» del menú de fila salta todo el cierre** | `OpportunitiesTable.tsx:295-304` · `opportunitiesService.ts:448-450` | Hace `updateOpportunity({status:'won'})` directo, **sin la ficha de handoff (CD.18) ni el cierre financiero (CD.19)** que sí exige el tablero y el detalle. Dos caminos al mismo estado con consecuencias distintas |
| 15 | **El importe del formulario ignora espacios y conceptos** | `OpportunityForm.tsx:377` | `productLines.length > 0 ? calculateTotal() : parseFloat(amount) || 0`. Si la oportunidad solo tiene espacios PMS o conceptos libres, **se guarda el monto manual y el total de líneas se descarta**, aunque la tarjeta «Total General» lo muestre correctamente |
| 16 | **Líneas descartadas en silencio al guardar** | `OpportunityForm.tsx:395-415` · `438-458` | Productos con `product_id <= 0`, espacios sin `space_id` y conceptos con descripción vacía se filtran antes de enviar, **sin avisar**: el usuario ve la línea en pantalla y no se guarda |
| 17 | **El evento de refresco del tablero puede perderse** | `OpportunityForm.tsx:473` | `window.dispatchEvent(new Event('refresh-pipeline-data'))` se emite **después** del `router.push`, así que en navegación completa el tablero puede no enterarse |

### G.2 Rutas que no existen

| # | Ruta | Desde dónde | Detalle |
|---|---|---|---|
| 1 | `/app/tareas` | `TareasSidebar.tsx:366-368` («Ver todas las tareas») | No existe `src/app/app/tareas`. El único enlace del pie de la barra lateral del perfil es un 404 |
| 2 | `/app/clientes/contactos` · `/app/clientes/grupos` · `/app/clientes/historial` | `src/config/moduleConfig.ts:110-112` | Tres entradas del **submenú lateral** del módulo «clientes». `src/app/app/clientes/` solo tiene `page.tsx`, `new`, `[id]` y `[id]/editar`. Tres de las cuatro entradas del menú llevan a un 404 |
| 3 | `/app/clientes/nuevo` | `ClientesActions.tsx:135-137` (`handleNewCustomerClick`) | La función no se invoca desde ningún sitio (el botón real usa `/app/clientes/new`, l.528): código muerto apuntando a un 404 |

Verificadas y **correctas**: `/app/pms/folios`, `/app/crm/oportunidades(/[id]/editar)`, `/app/crm/clientes/[id]`, `/app/crm/pipeline`, `/app/crm/automatizaciones`, `/app/configuracion`, y todas las rutas de API que usan estas pantallas.

### G.3 Diálogos nativos del navegador (`confirm()` / `alert()`) — no se pueden calcar en Figma

| # | Texto exacto | Archivo:línea |
|---|---|---|
| 1 | «¿Estás seguro de eliminar {n} cliente(s)? Esta acción no se puede deshacer.» | `app/app/clientes/page.tsx:665` |
| 2 | «¿Está seguro de eliminar esta nota?» | `NotasArchivosTab.tsx:195` |
| 3 | `alert(err.message \|\| 'Error al guardar nota')` · `'Error al actualizar nota'` · `'Error al eliminar nota'` | `NotasArchivosTab.tsx:165` · `:189` · `:209` |
| 4 | «¿Estás seguro de eliminar esta identidad?» | `IdentidadesPage.tsx:152` |
| 5 | «Los pendientes se omiten y los créditos reservados se devuelven. ¿Cancelar la campaña?» | `CampanaDetallePage.tsx:90` |
| 6 | «"{nombre}" ya existe en Meta: se desactivará aquí (sigue en el WABA). ¿Continuar?» / «¿Eliminar el borrador "{nombre}"?» | `WhatsAppTemplatesTab.tsx:99` |
| 7 | «¿Eliminar esta tarea?» | `pipeline/drawer/TasksSection.tsx:127` |
| 8 | «¿Estás seguro de eliminar esta oportunidad?» (dos veces: menú de fila del listado y botón de la cabecera del detalle) | `app/app/crm/oportunidades/page.tsx:120-141` · `OpportunityDetail.tsx:117-128` |
| 9 | «¿Eliminar "{nombre}"?» (documento de la oportunidad) | `OpportunityDocuments.tsx:162-176` |

En el mismo módulo conviven tres patrones para lo mismo: `confirm()` nativo, `AlertDialog` (`CampanasPage.tsx:141-146`, `ActividadesPage.tsx:376`) y el `ConfirmDialog` propio (`TemplateList.tsx:174`, Objeciones, Partners, Automatizaciones). **Unificar en `ConfirmDialog`.**

### G.4 Borrados sin ninguna confirmación

| # | Qué se borra | Archivo:línea |
|---|---|---|
| 1 | Documento del cliente (ficha CRM) | `DocumentUploader.tsx:294-300` |
| 2 | Vínculo persona-empresa («Desvincular contacto») | `CompanyContactsManager.tsx:604-611` |
| 3 | Miembro de un equipo comercial | `EquiposTab.tsx:272-274` |
| 4 | Nota de una oportunidad (drawer del pipeline) | `pipeline/drawer/tabs/NotasTab.tsx:85` |

### G.5 Texto que no describe lo que pasa

| # | Qué | Archivo:línea |
|---|---|---|
| 1 | «Se eliminará "{equipo}" y **todos sus miembros**» — `handleDeleteTeam` solo marca `is_active = false` en el equipo; las filas de `sales_team_members` quedan activas | `EquiposTab.tsx:320` frente a `:128-140` |
| 2 | Equipo y territorio usan el mismo texto «Se eliminará "{nombre}"» para semánticas distintas: el equipo se desactiva, el territorio se borra de verdad (`.delete()`) | `EquiposTab.tsx:131` frente a `TerritoriosTab.tsx:104` |
| 3 | «Asigna miembros desde la tab Equipos» enlaza a `/app/crm/equipo`, la página donde ya está; la pestaña es estado local, así que el clic no cambia de pestaña | `PerformanceTab.tsx:97` · `EquipoPage.tsx:19` |
| 4 | Título distinto según el estado: «Equipo y Territorio» al cargar, «Equipo y Responsable» al terminar | `SalesTeamTerritorySelectors.tsx:177` frente a `:194` |
| 5 | El esqueleto de Revenue OS pinta **8** rectángulos y `KpiTiles` devuelve **7** tarjetas: salto de maqueta al terminar la carga | `RevenueOsPage.tsx:48-52` frente a `KpiTiles.tsx:27-77` |
| 6 | Pestaña «Notas y archivos»: los archivos no existen, solo el placeholder «La funcionalidad de archivos estará disponible próximamente.» | `NotasArchivosTab.tsx:366-376` |

### G.6 Fechas: incumplimientos de `docs/reglas-fechas-timezone.md`

**Regla 1 (`toISOString().split('T')[0]` prohibido):**

| # | Dónde | Efecto |
|---|---|---|
| 1 | `app/app/clientes/page.tsx:654` y `:748` — nombre de los CSV (`clientes_AAAA-MM-DD.csv`, `clientes_seleccionados_AAAA-MM-DD.csv`) | En Bogotá, un export después de las 19:00 lleva la fecha del día siguiente |
| 2 | `IdentidadesService.ts:377` — `identidades_${new Date().toISOString().split('T')[0]}.csv` | Igual |
| 3 | `ScheduleStep.tsx:17` — el `min` del `datetime-local` («ahora + 5 min») se calcula en UTC | En zonas con offset negativo el mínimo queda mal |

**Regla 3 (todo renderizado pasa por el timezone de la organización):** lo incumplen `ClientesTable.tsx:75-83`, `ResumenTab.tsx:246` y `:365`, `TimelineTab.tsx:450-452`, `CuentasTab.tsx:352` y `:440`, `app/app/crm/clientes/[id]/page.tsx:371` y `:434`, `CustomerFoliosSection.tsx:255` y `:322-323`, `CRMTopLists.tsx:284`, `ActividadesTable.tsx:72-82`, `ActividadDetalle.tsx:301` y `:392`, `CallRow.tsx:25-29`, `TemplateList.tsx:34-36`, `CampanaDetallePage.tsx:82`, `CampanaNuevaPage.tsx:137`, `pipeline/drawer/tabs/NotasTab.tsx:50`, `opportunitiesService.ts:545-570`.

**Regla 4 (`formatDate`/`parseLocalDate` de `@/utils/Utils` deprecadas):** las importan `InfoTab.tsx:7`, `TimelineTab.tsx` y `OportunidadesTab.tsx`.

Lo hacen **bien**: `DocumentUploader.tsx:282`, `CampanasPage.tsx:118`, `CampaignContactsTable.tsx:68-71`, `PartnerDealTable.tsx:46-51`, `RuleCard.tsx:117-122`, `RevenueMathPanel.tsx:151`, `FollowupSection.tsx:116` y `DrawerHeader.tsx:69-74` (este último con `formatPlainDate`, correcto para una columna `date`).

### G.7 Moneda cableada donde el dato trae la suya

`app/app/clientes/page.tsx:889-895` (`Intl.NumberFormat('es-CO', {currency:'COP'})`), `ClientesTable.tsx:86-92`, `EquipoSidebar.tsx:64`, `PerformanceTab.tsx:141` y `:156`, `TerritoriosTab.tsx:200`, `EquiposTab.tsx:190` (usa la moneda del primer miembro), `OportunidadesTab.tsx:168` (fallback `'COP'` sobre `opportunities.currency`, cuyo **default en la BD es `'USD'`**, §H).

El contraejemplo a seguir es Partners: si hay monedas mezcladas **no suma y lo dice** («Comisiones en varias monedas: ver el detalle en Deals», `PartnerList.tsx:67-68`; «· comisiones en varias monedas (sin sumar)», `PartnerDealList.tsx:103-104`).

### G.8 Props muertas, imports sin usar y componentes huérfanos

| # | Qué | Archivo:línea |
|---|---|---|
| 1 | `ToastAction` importado y nunca usado | `ClientForm.tsx:12` |
| 2 | `SortDesc` y `Clock` importados y nunca usados | `ClientesFilter.tsx:2` |
| 3 | `Plus` importado y nunca usado; `const { organization }` destructurado y nunca leído | `IdentidadesPage.tsx:4` · `:28` |
| 4 | `CheckCircle` y `AlertCircle` importados sin usar (sugieren un KPI de SLA con semáforo que no llegó) | `CRMKPICards.tsx:14-15` |
| 5 | `Filter` sin usar | `CRMFilters.tsx:24` |
| 6 | `supabase` y `getOrganizationId` importados sin invocar; `composeOpen` y `ComposeWhatsAppDialog` declarados y no renderizados | `pipeline/modals/BulkActionsDialog.tsx:21-22` · `:96` · `:18` |
| 7 | `useRouter()` declarado y nunca usado | `pipeline/PipelineHeader.tsx:62` |
| 8 | Prop `trend` implementada en `KPICard` y no pasada por ninguno de los 6 KPIs | `CRMKPICards.tsx:29-32` · `65-73` frente a `90-133` |
| 9 | Prop `index` recibida y no leída | `CRMFunnelChart.tsx:23` · `136` |
| 10 | `div` con clase `hidden` (sin variante responsive) que repite email y teléfono «para móvil»: invisible en todo breakpoint | `ClientesTable.tsx:231-234` |
| 11 | Botón icono «Fusionar duplicados» dentro de `<Dialog>` pero **fuera** de `DialogTrigger`: se renderiza suelto en la barra de acciones y duplica «Unificar» con otra regla (`< 2` en vez de `!length`) | `ClientesActions.tsx:667-685` |
| 12 | Prop `onExport` de `ForecastFilters`: el botón «Exportar» solo se pinta si llega, y `ForecastDashboard` nunca la pasa | `ForecastFilters.tsx:11` · `20` · `61-71` |
| 13 | Prop `compact` de `KanbanBoardV2`: llega hasta la tarjeta y oculta tres líneas, pero `PipelineView.tsx:129` monta el tablero sin ella | `OpportunityCardV2.tsx:103` |
| 14 | Parámetro `teamId` de `handleRemoveMember` nunca usado, y la llamada se lo pasa igual | `EquiposTab.tsx:117` · `:272` |
| 15 | `setIsRefreshing(true); if (loading) setIsRefreshing(false);` — las dos líneas se anulan: en la primera carga el icono nunca gira | `EquiposTab.tsx:36-37` |
| 16 | Errores tragados: `catch { // silent }` — si falla cualquiera de las cuatro consultas, los cinco KPIs quedan en 0, indistinguible de una organización vacía | `EquipoSidebar.tsx:40-42` |
| 17 | **Componentes exportados que nadie renderiza**: `CRMFiltersComponent`, `CRMQuickNav`, `CRMQuickActions` (~500 líneas, §B.8); `KanbanSummary`, `StageManager`, `StageConfigDialog`, `PipelineInitializer`, `ThemeToggle` del pipeline, `BulkCreateOpportunitiesDialog` (§C, D.37); `ImportLeadsCsv` | `crm/dashboard/index.ts:8-9` · `crm/pipeline/index.ts` |
| 18 | `KanbanSummary` pronostica con constantes inventadas (`0.6 / 0.3 / 0.1`) y el comentario «En un caso real esto se basaría en datos históricos» | `KanbanSummary.tsx:40-44` |
| 19 | `PipelineInitializer` calcula `setMessage(...)` en 7 puntos y el `return` solo pinta tres `Skeleton`: ninguno de esos mensajes se ve | `PipelineInitializer.tsx:130-136` |
| 20 | Acciones de automatización del grupo «Todavía no disponibles»: se pueden añadir y guardar sabiendo que la ejecución quedará fallida | `ActionsBlock.tsx:174-181` · `ActionChipEditor.tsx:138-143` |
| 21 | Topes de campaña de agente IA (`50/día`, `20/hora`, `3 a la vez`) fijados en código y presentados como si fueran configurables | `campaignModel.ts:98-100` frente a `CampaignCard.tsx:62-67` |
| 22 | Mutación de props: `ForecastByStage` ordena **en sitio** el array de etapas del contenedor, que también alimenta a `ForecastScenarios` | `ForecastByStage.tsx:23-24` |

### G.9 Accesibilidad

| # | Qué | Archivo:línea |
|---|---|---|
| 1 | Modal «Agregar Contacto»: `div` con overlay, **sin `role="dialog"`, sin `Escape`, sin foco atrapado** | `CompanyContactsManager.tsx:664-670` |
| 2 | Botones de solo icono sin `aria-label` ni texto: 10 en Equipo (`EquiposTab.tsx:163-165`, `:223-232`, `:272-274`; `AsignarTab.tsx:121-123`; `PerformanceTab.tsx:168-170`; `TerritoriosTab.tsx:132-134`, `:169-179`), el de limpiar filtros de Actividades (`ActividadesFiltros.tsx:210-219`), el de volver del detalle de actividad (`ActividadDetalle.tsx:192-199`) y el trigger «…» de Identidades (`IdentidadesTable.tsx:206-210`) | — |
| 3 | Bloques clicables que son `div` con `onClick` (sin teclado, sin pestaña nueva, sin `role`): «Cliente» y «Oportunidad» del detalle de actividad | `ActividadDetalle.tsx:409-411` · `:431-433` |
| 4 | Filas de oportunidad de la ficha CRM: `div` con `hover:bg-gray-50` sin `onClick` ni enlace — parecen clicables y no lo son | `app/app/crm/clientes/[id]/page.tsx:411-452` |
| 5 | Emoji en la interfaz («⚠️ Se fusionarán…»), único del módulo; el resto usa iconos de Lucide | `DuplicadosPanel.tsx:240` |
| 6 | Tablas anchas **sin `overflow-x-auto`**: `AsignarTab.tsx:140-183` (6 columnas, dos con `Select`), `PerformanceTab.tsx:176-209` (9 columnas), `app/app/crm/leads/page.tsx:333-400` (5 columnas) | — |

### G.10 Incoherencias de formato y de catálogo

| # | Qué | Archivo:línea |
|---|---|---|
| 1 | Porcentaje con dos formatos en la misma pantalla: «43,7 %» (coma + espacio) en Resumen, Embudo, Cohortes y Matemática, frente a «43.7% completado», «78.2%», «87% meta» y «× 60%» en el bloque Forecast | `GoalProgress.tsx:85` · `:102` · `ForecastChart.tsx:92` · `ForecastByStage.tsx:83` |
| 2 | Title Case solo en el bloque Forecast («Tendencia de Pronóstico», «Pronóstico por Etapa», «Total Ganado»…), sentence case en el resto | `ForecastChart.tsx:60` · `:147` · `ForecastByStage.tsx:59` |
| 3 | Títulos sin tilde en el código: «Informacion de Contacto», «Arrastra archivos aqui o haz click para subir», «PDF, imagenes, contratos, etc.» y «Huesped» (generado con `charAt(0).toUpperCase()`) | `app/app/crm/clientes/[id]/page.tsx:336` · `DocumentUploader.tsx:250` · `:252` · `app/app/clientes/page.tsx:1103` · `:1111` |
| 4 | Badge de filtros que miente: cuenta 6 filtros y **omite `typeFilter`**, aunque `hasActiveFilters` sí lo mira. Filtrando solo por «Empresa» el badge muestra 0 | `ClientesFilter.tsx:116` frente a `:107` |
| 5 | Tooltip que muestra el valor crudo del orden («• Orden: balance_desc») en vez de su etiqueta; los demás filtros sí se traducen | `ClientesFilter.tsx:300` |
| 6 | Estados crudos de la BD en pantalla: `paid`, `cancelled`, `reserva`, `open`… sin traducir | `ResumenTab.tsx:360` · `TimelineTab.tsx:413` · `TareasSidebar.tsx:209-222` (el default `'open'` de `tasks.status` cae en el ramal «valor crudo») |
| 7 | Roles masivos cableados (`['cliente','huesped','pasajero','proveedor','empleado']`) en vez de leer `customer_roles`, que el `ClientForm` **sí** consulta | `app/app/clientes/page.tsx:1100` · `:1108` frente a `ClientForm.tsx:147` |
| 8 | Tipos de documento cableados en `CompanyContactsManager` («Cédula», «NIT», «Pasaporte», «ID Extranjero», «Otro») en vez de `country_identification_types`, que el `ClientForm` **sí** consulta | `CompanyContactsManager.tsx:917-921` frente a `ClientForm.tsx:166-171` |
| 9 | Dos catálogos de propósitos de agente IA que ya divergen: «Reactivar frío» / «Reactivar contacto frío», «Renovación» / «Recordar renovación», «Vender producto» / «Vender un producto», «Agendar reunión» / «Agendar una reunión» | `AgentesIaPage.tsx:40-51` frente a `AgentPurposeTab.tsx:24-35` |
| 10 | Filtro de tipo de plantilla incompleto: omite «Firma» y «WhatsApp (HSM)», que sí existen en `TEMPLATE_KIND_LABELS` y sí se pintan como badge | `TemplateList.tsx:26-32` frente a `TemplatePicker.tsx:19-26` |
| 11 | Monedas inconsistentes: 4 en el alta de lead (COP/USD/EUR/MXN), 2 en el alta de miembro de equipo (COP/USD) | `NewLeadDialog.tsx:54` frente a `MemberDialog.tsx:103-115` |
| 12 | `'active'` no es un estado real: el filtro de la tabla del pipeline ofrece «Activa» pero el tablero consulta `in('status', ['open','won','lost'])` | `TableView.tsx:395` · `:553` frente a `useKanbanBoard.ts:108` |
| 13 | «Nivel de fidelidad» («Oro»/«Plata»/«Bronce»/«Básico») derivado de buscar las cadenas `oro`, `plata`, `bronce` en `tags`: no hay programa de fidelidad real | `ClienteHeader.tsx:180-187` |
| 14 | Toast de éxito **«Exito» sin tilde** al editar una oportunidad, frente a «Éxito» al crearla | `OpportunityForm.tsx:417-420` frente a `:461-464` |
| 15 | Un mismo badge con dos literales: «Por defecto» en el trigger del selector de pipeline y «Default» en su propia lista | `PipelineSearchSelect.tsx:66-70` frente a `:119-123` |
| 16 | Plural roto: «1 item cotizados» (la `s` de «cotizados» no se pluraliza) | `DetailSidebar.tsx:32` |
| 17 | Comillas inconsistentes en los dos diálogos de borrado del pipeline: tipográficas («¿Eliminar pipeline “{nombre}”?») y rectas («¿Eliminar etapa "{nombre}"?») | `PipelineHeader.tsx:580-581` frente a `DeleteStageDialog.tsx:50-53` |
| 18 | Flechas como **caracteres literales** «↑» y «↓» en lugar de iconos, en el configurador de discovery | `DiscoveryConfigDialog.tsx:151-164` |
| 19 | Solo 4 de las etiquetas del cliente se muestran en el sidebar del detalle, **sin decir cuántas quedan** (la tabla de clientes sí pone «+{n}») | `DetailSidebar.tsx:91-93` frente a `ClientesTable.tsx:304-311` |
| 20 | Una sola validación genérica para tres campos obligatorios: «Por favor completa los campos requeridos», sin señalar cuál falta ni mover el foco | `OpportunityForm.tsx:366-373` |
| 21 | «Fecha implementación» del cierre ganado es **texto libre** con placeholder «Ej: 2026-02-01», no un selector de fecha, a diferencia de todos los demás campos de fecha del módulo | `ClosedWonDialog.tsx:122` |

### G.11 Rendimiento y consistencia de datos

| # | Qué | Archivo:línea |
|---|---|---|
| 1 | Etiquetado masivo: un `select` + un `update` por cliente, en serie. Con 200 seleccionados son 400 viajes; el diálogo se queda en «Procesando...» minutos | `ClientesActions.tsx:94-116` |
| 2 | Fusión de clientes de Identidades: siete `update` sueltos por secundario desde el navegador, sin RPC ni rollback. Si falla el cuarto, los tres anteriores ya se aplicaron; y el `catch` solo atrapa excepciones, no los errores de PostgREST, así que puede decir «Clientes fusionados» con la mitad hecha. Va contra la regla de RPC transaccional de `CLAUDE.md` | `IdentidadesService.ts:244-308` |
| 3 | Paginación con estado obsoleto: `handlePageChange` hace `setPage(newPage)` y llama a `loadCustomers` en la misma pasada; `loadCustomers` lee `page` del *closure*, con el valor anterior. El `.range()` va un paso retrasado | `app/app/clientes/page.tsx:591-594` · `:216-217` |
| 4 | Cambiar el tamaño de página **no recarga**: `handlePageSizeChange` solo hace `setPageSize` y `setPage(0)`, y no hay ningún `useEffect` que dependa de `pageSize` ni de `page` | `app/app/clientes/page.tsx:875-878` |
| 5 | Tres de los cuatro KPIs de la lista de clientes se calculan sobre la **página cargada**, mientras «Total Clientes» usa el `count` global: en pantalla conviven un total real y tres parciales | `app/app/clientes/page.tsx:882-885` |
| 6 | Identidades: «Total» cuenta doble el teléfono (una vez como `phone`, otra como `whatsapp`), así que no coincide con el número de filas de la tabla | `IdentidadesService.ts:329-343` |
| 7 | `AsignarTab` pide **todas** las oportunidades abiertas de la organización, sin límite ni paginación | `AsignarTab.tsx:59` |
| 8 | Leads: se piden sin filtro de sucursal, pero los nombres de cliente **sí** se filtran por `branch_id`; un lead de otra sucursal muestra «Cliente no encontrado» | `app/crm/leads/page.tsx:141` frente a `:152-157` |
| 9 | Carga doble del pronóstico: el efecto lleva `pipelines` en sus dependencias y `pipelines` se setea en la carga inicial, así que repite las tres consultas | `ForecastDashboard.tsx:66-118` |
| 10 | Errores silenciados en el forecast: `getPipelines()` y `getStages()` devuelven `[]` con `console.warn`, así que la pestaña muestra «vacío» en lugar de error | `opportunitiesService.ts:44-54` · `:65-73` |
| 11 | La consulta del cliente del perfil **no filtra por `organization_id`**: se apoya solo en RLS | `app/app/clientes/[id]/page.tsx:62-66` |
| 12 | La consulta de folios de la ficha CRM no filtra ni por organización ni por sucursal (y `folios` **no tiene** `organization_id`, §H): depende enteramente de RLS vía la reserva | `CustomerFoliosSection.tsx:67-88` |
| 13 | `StageManager` y `StageConfigDialog` (huérfanos) escriben `stages` **directo desde el navegador**, saltándose el control de rol de `/api/crm/stages` | `StageManager.tsx:90` · `:119` · `StageConfigDialog.tsx:108-119` |
| 14 | El buscador de oportunidades **no tiene debounce**: cada tecla relanza las 5 consultas de `loadData` | `OpportunitiesFilters.tsx:74-82` · `app/app/crm/oportunidades/page.tsx:54-85` |
| 15 | La tabla de oportunidades y la tabla del pipeline **no paginan**: pintan todo lo que devuelve la consulta | `OpportunitiesTable.tsx:136-174` · `TableView.tsx:122` |
| 16 | Alta y movimiento masivos en **bucle secuencial** desde el navegador, una petición por fila | `BulkActionsDialog.tsx:301-304` · `:373-376` · `ImportLeadsCsv.tsx:532-550` |
| 17 | Borrado de oportunidad **directo desde el navegador** en la tabla del pipeline, sin pasar por ruta de servidor | `TableView.tsx:293` · `:434-448` |

### G.12 Realtime declarado y apagado

- `templates` **no está** en la publicación `supabase_realtime`: el efecto de `WhatsAppTemplatesTab.tsx:63-74` sale inmediatamente y el estado de aprobación de Meta solo se refresca al recargar o al pulsar «Sincronizar».
- `campaigns` tampoco: la lista no se actualiza sola y el detalle cae a un sondeo de 15 s solo mientras está enviando (`CampanasPage.tsx:49-56`, `CampanaDetallePage.tsx:45-57`).
- `opportunities` y `stages` tampoco: el chip verde de «tiempo real» del tablero es código inalcanzable (`useKanbanBoard.ts:81`, `KanbanBoardV2.tsx:206`).

Los tres casos están comentados a propósito en el código; **el diseño no debe prometer «en vivo»** en esas pantallas.

### G.13 Permisos

- `/app/clientes` y `/app/crm/clientes` **no comprueban ningún permiso en cliente**: los cinco botones de la barra (incluidos «Importar» y el borrado masivo) se muestran siempre. Tampoco existe estado «sin permiso».
- El único aviso explícito de falta de permisos está en el detalle de campaña («Lanzar, pausar o cancelar requiere rol de administrador de la organización.», `CampanaDetallePage.tsx:92`) y en plantillas WhatsApp (`WhatsAppTemplatesTab.tsx:109`). La **lista** de campañas simplemente oculta los ítems sin explicar por qué.
- «Duplicar campaña» **no exige `can_manage`** mientras pausar, reanudar y cancelar sí; si el servidor lo rechaza, sale el toast genérico «No se pudo completar» (`CampanasPage.tsx:127`).
- Partners, Objeciones y Revenue OS resuelven el permiso **en el servidor** y lo usan para ocultar o deshabilitar con motivo visible: es el patrón correcto (`PartnerList.tsx:81-90`, `RevenueMathPanel.tsx:148-150`).

---

## H. Esquema real (verificado con el MCP de Supabase)

Proyecto `jgmgphmzusbluqhuqihj`, solo lecturas contra `information_schema.columns` y `pg_constraint`. Fecha de la comprobación: 2026-09-22.

### H.1 `customers` — 44 columnas

| Columna | Tipo | Nulo | Default / generación |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `organization_id` | integer | **SÍ** | — |
| `branch_id` | integer | SÍ | — |
| `email` | text | SÍ | — |
| `phone` | text | SÍ | — |
| `first_name` · `last_name` | text | SÍ | — |
| `identification_type` · `identification_number` | text | SÍ | — |
| `address` · `city` · `notes` | text | SÍ | — |
| `is_registered` | boolean | SÍ | `false` |
| `user_id` | uuid | SÍ | — |
| `metadata` | jsonb | SÍ | `'{}'` |
| `created_at` · `updated_at` | timestamptz | SÍ | `now()` |
| **`doc_type`** | text | SÍ | **GENERATED ALWAYS** = `identification_type` |
| **`doc_number`** | text | SÍ | **GENERATED ALWAYS** = `identification_number` |
| `roles` | text[] | SÍ | `'{cliente,huesped}'` |
| `tags` | text[] | SÍ | `'{}'` |
| `preferences` | jsonb | SÍ | `'{}'` |
| `avatar_url` | text | SÍ | — |
| `is_online` | boolean | SÍ | `false` |
| `last_seen_at` | timestamptz | SÍ | — |
| `dv` | integer | SÍ | — |
| `company_name` · `trade_name` | text | SÍ | — |
| `legal_organization_id` | integer | SÍ | `2` |
| `tribute_id` | integer | SÍ | `21` |
| `fiscal_municipality_id` | uuid | SÍ | — |
| `fiscal_responsibilities` | text[] | SÍ | — |
| **`customer_type`** | text | **NO** | `'person'` |
| `parent_customer_id` | uuid | SÍ | — |
| **`full_name`** | text | SÍ | **GENERATED ALWAYS**: si `customer_type = 'company'` → primer valor no vacío entre `company_name`, `trade_name`, `first_name + last_name`, «Empresa sin nombre»; si no → `first_name + last_name` |
| `health_score` · `health_score_updated_at` | integer / timestamptz | SÍ | — |
| `company_size` · `current_software` | text | SÍ | — |
| `branches_count` | integer | SÍ | — |
| **`lifecycle_stage`** | text | **NO** | `'lead'` |
| `vertical_id` | uuid | SÍ | — |
| **`timezone`** | text | **NO** | `'America/Bogota'` |
| **`do_not_call`** | boolean | **NO** | `false` |

**Restricciones únicas**: `(organization_id, email)` y `(organization_id, identification_number)`.

**Trampas confirmadas:**

1. **NO existe `customers.is_active`.** `ClientesTable.tsx`, el tipo `Customer` de la lista y `ClientesFilter` lo declaran y lo usan; nunca llega. El ítem «Activar/Desactivar» del menú por fila es doblemente inerte (§G.1-3). Lo más parecido es `lifecycle_stage`, que solo la ficha CRM (§B.10-4) sabe leer y **ningún formulario sabe escribir**.
2. **`full_name`, `doc_type` y `doc_number` son `GENERATED ALWAYS`**: no se pueden escribir. El `ClientForm` lo respeta (escribe `first_name`/`last_name`/`company_name` e `identification_*`), pero **`checkDuplicates` consulta `doc_number`** (`ClientForm.tsx:451`), que al ser generada sí es legible: funciona, aunque el campo canónico para una búsqueda es `identification_number`.
3. **`customer_type`, `lifecycle_stage`, `timezone` y `do_not_call` son NOT NULL con default.** Ninguno de los cuatro es editable desde la interfaz; `do_not_call` gobierna exclusiones de campaña que el usuario no puede desactivar desde la ficha.
4. **`organization_id` es NULLABLE.** Toda la multi-tenencia de esta tabla descansa en RLS y en que el código siempre lo rellene.
5. **`customers.city` existe** (text) y el `ClientForm` **nunca la escribe**: la ubicación va por `fiscal_municipality_id` → `municipalities`. La pestaña «Información» muestra municipio, estado y código postal desde `municipalities`, no desde `city`.
6. **Once columnas existen y ningún formulario las expone**: `city`, `lifecycle_stage`, `timezone`, `do_not_call`, `health_score`, `company_size`, `branches_count`, `current_software`, `vertical_id`, `legal_organization_id`, `tribute_id`. Varias **se ven** en la ficha CRM o en la pestaña «Información»: se pueden leer pero no editar.

### H.2 `customer_company_links` — el vínculo persona ↔ empresa

`id` uuid PK · `organization_id` integer **NOT NULL** · `person_id` uuid **NOT NULL** · `company_id` uuid **NOT NULL** · `position` text · `is_primary` boolean def `false` · `created_at` · `updated_at`.

**UNIQUE `(person_id, company_id)`**: una persona no puede vincularse dos veces a la misma empresa, pero **nada impide dos contactos con `is_primary = true` en la misma empresa**. `CompanyContactsManager.handleTogglePrimary` lo resuelve por aplicación (quita el flag al anterior antes de ponerlo al nuevo), no por restricción: dos pestañas abiertas pueden dejar dos principales. `ClienteHeader` y `InfoTab` se protegen tomando el primero de la lista ordenada por `is_primary desc`.

### H.3 Tablas del CRM

| Tabla | Notas para el diseño |
|---|---|
| `opportunities` (47 col.) | `pipeline_id` y `stage_id` **NOT NULL**: no hay oportunidad sin etapa. **`currency` es `character` con default `'USD'`** aunque toda la UI asume COP (§G.7). `record_type` NOT NULL def `'deal'` — **un lead es una oportunidad con `record_type = 'lead'`**. `discovery_data` jsonb NOT NULL def `'{}'`, `win_data` jsonb def `'{}'`. `status` def `'open'`. Sin restricción única más allá de la PK |
| `stages` | `pipeline_id`, `name` y `position` NOT NULL. `color` `varchar` def `'#3b82f6'`. `is_won` / `is_lost` boolean def `false`. `probability` y `sla_days` nullable |
| `pipelines` | `goal_amount` numeric def 0, `goal_period` text def `'monthly'`, `goal_currency` char def `'USD'`, `pipeline_type` def `'sales'` |
| `activities` | **No tiene `customer_id`**: el vínculo es polimórfico (`related_type` + `related_id`). **Tampoco tiene `title`, `status`, `due_date` ni `assigned_to`**: lo que se ve como «título» es `notes`. `activity_type` y `organization_id` NOT NULL |
| `tasks` | Sí tiene `customer_id`, **y además** `related_to_id` / `related_to_type`: dos vías para lo mismo. `status` def **`'open'`**, que el mapa de `TareasSidebar` no contempla (§G.10-6). `priority` nullable |
| `notes` | `organization_id`, `user_id` y `body` NOT NULL. Vínculo polimórfico (`related_type` + `related_id`). `is_pinned` def `false`. **No tiene `opportunity_id`** |
| `calls` | `organization_id`, `direction`, `mode`, `from_number`, `to_number` NOT NULL. `status` def `'dialing'`, `provider` def `'twilio'`, `recording_enabled` def **`true`**, `consent_given` def `false`, `cost_currency` def `'USD'`, `duration_source` def `'provider'` |
| `campaigns` | `organization_id` y `name` NOT NULL. `status` def `'draft'`. `statistics` jsonb def `'{}'`. `channel`, `template_id` y `segment_id` nullable |
| `campaign_contacts` | **UNIQUE `(campaign_id, customer_id)`**: un cliente no entra dos veces en la misma campaña |
| `customer_channel_identities` | `organization_id`, `customer_id`, `channel_id`, `identity_type`, `identity_value` **todos NOT NULL**. **La pantalla de Identidades nunca lee esta tabla** (§G.1-1) |
| `templates` | `organization_id`, `name`, `channel`, `body_html` NOT NULL. `engine` def `'html'`, `version` def 1, `metadata` def `'{}'`. `blocks_json` nullable |
| `segments` | `filter_json` def `'{}'`, `is_dynamic` def `true`, `customer_count` def 0 |
| `objections` | `title` y `category` NOT NULL. `detection_signals` y `discovery_questions` jsonb NOT NULL def `'[]'`. `is_active` def `true` |
| `opportunity_objections` | `detected_by` NOT NULL def `'manual'`, `resolved` NOT NULL def `false` |
| `automation_rules` | `trigger_type` NOT NULL, `trigger_config` def `'{}'`, `conditions` def `'[]'`, `actions` def `'[]'`, `is_active` def `true`, `priority` def 100, `run_once_per_opportunity` def `false`, `cooldown_hours` def 0, `runs_count` def 0 |
| `partners` | `name` y `email` NOT NULL, `commission_rate` NOT NULL def `10.00`, `is_active` def `true` |
| `partner_tiers` | `min_deals` def 0, `min_revenue` def 0, `commission_rate` def `10.00`, `benefits` jsonb def `'[]'` |
| `partner_deals` | `partner_id`, `opportunity_id` y `deal_type` NOT NULL. `commission_status` def `'pending'` |
| `sales_teams` · `sales_team_members` · `sales_roles` · `territories` | `sales_team_members.quota_currency` NOT NULL def **`'COP'`** (por eso el diálogo solo ofrece COP y USD). `territories.criteria` jsonb NOT NULL def `'{}'` |
| `voice_agents` | 30 columnas NOT NULL con default, entre ellas `llm_model` def `'gpt-4o-mini'`, `language` def `'es-CO'`, `max_calls_per_day` def 50, `max_calls_per_hour` def 20, `is_active` def **`false`** |
| `voice_agent_campaigns` | `target_source` NOT NULL. `max_calls_per_day` def 50, `max_concurrent` def 3, `max_calls_per_hour` def 20, `emergency_stop` def `false`, `consecutive_failures` def 0 — **los topes que la tarjeta muestra sin poder editar** (§G.8-21) |
| `documents` | `related_type` y `related_id` **NOT NULL**, y **`related_id` es `text`, no uuid**. `is_confidential` def `false`, `tags` def `'{}'` |
| `folios` | **No tiene `organization_id`**: la pertenencia va por `reservation_id`. `balance` NOT NULL def 0, `status` es un enum `folio_status` def `'open'` |
| `accounts_receivable` | `customer_id` nullable, `discount_amount` NOT NULL def 0. Nunca se escribe a mano: la llena un trigger desde `payments` / `invoice_sales` |
| `organization_settings` | `(organization_id, key)` con `settings` jsonb: aquí viven los insumos de Revenue OS bajo la clave `crm_revenue_math` |
| `discovery_templates` | `sections` jsonb NOT NULL def `'[]'`, `is_active` def `true` |

### H.4 Tablas que **no existen** pese a aparecer en el código o en el menú

- **`leads`** — no existe. Un lead es `opportunities.record_type = 'lead'`.
- **`customer_identities`** — no existe; la real es `customer_channel_identities`.

### H.5 RPC verificadas

| RPC | Firma | Quién la usa |
|---|---|---|
| `get_accounts_receivable_for_customers` | `(customer_ids uuid[], org_id integer)` | Lista de clientes (§A.0) |
| `obtener_cuentas_por_cobrar_cliente` | `(p_customer_id uuid, p_organization_id integer)` | Pestaña «Cuentas por cobrar» (§A.15) |
| `fn_revenue_metrics` · `fn_pipeline_funnel` · `fn_cohort_retention` | — | Revenue OS (§C) |
| `fn_customer_health` | `(p_org_id, p_customer_id)` | Pestaña «Salud» (§B.14) |
| **`merge_customers`** | — | **No existe**: por eso «Fusionar clientes» está permanentemente deshabilitado (§G.1-4) |

---

## I. Duplicidades y divergencias

### I.1 La misma pantalla dos veces, la misma ficha dos veces

| Qué | Estado |
|---|---|
| `/app/clientes` y `/app/crm/clientes` | **Idénticas**: la segunda es un re-export literal (12 líneas). Un solo frame de Figma sirve para las dos |
| `/app/clientes/[id]` y `/app/crm/clientes/[id]` | **Dos fichas completamente distintas**, cero componentes compartidos: 7 pestañas frente a 6, barra de tareas frente a acciones rápidas, botón «Editar» frente a ninguno. Ver la tabla comparativa de §B.10 |
| Navegación rota entre ambas | Desde `/app/crm/clientes` los enlaces de fila apuntan a `/app/clientes/{id}` (`ClientesTable.tsx:209`, `:371`, `:374`): **la ficha de CRM queda huérfana de navegación desde su propio listado** |

### I.2 Componentes repetidos dentro del módulo

| # | Qué se repite | Dónde | Diferencia real |
|---|---|---|---|
| 1 | **Diálogo «Etiquetar clientes»**, dos veces en la misma pantalla | `ClientesActions.tsx:600-664` y `app/app/clientes/page.tsx:1198-1266` | Mismo ancho, mismo campo, mismo placeholder «Nombre de etiqueta». El de la página además sabe **quitar** etiquetas y responde a `Enter` |
| 2 | **Botón de fusionar**, dos veces | `ClientesActions.tsx:555-564` («Unificar») y `:671-679` (icono suelto) | Reglas distintas: `!selectedCustomers.length` frente a `< 2`. El segundo es un accidente de maquetado (§G.8-11) |
| 3 | **Timeline del cliente**, dos implementaciones | `components/clientes/id/TimelineTab.tsx` (4 orígenes, sin filtros, sin paginación) y `components/crm/timeline/**` (9 filtros de tipo, filtro de usuario, rango de fechas, tiempo real, «cargar más», filtros persistidos) | La ficha de `/app/clientes/[id]` **no usa** el timeline rico del CRM |
| 4 | **Documentos del cliente**, dos buckets | Ficha CRM: `DocumentUploader` con bucket privado `crm-documents`. Detalle de oportunidad: `OpportunityDocuments` con bucket `crm`, prefijo `opportunity-docs/` | **Lo subido en un sitio no se ve en el otro** |
| 5 | **Notas**, dos editores y dos semánticas de borrado | `NotasArchivosTab` (ficha de cliente: `confirm()` nativo, con fijado, sin editar) y `pipeline/drawer/tabs/NotasTab` (oportunidad: sin confirmación, con fijado) | Misma tabla `notes`, distinto `related_type` |
| 6 | **Tres patrones de confirmación** | `confirm()` nativo (7 sitios, §G.3), `AlertDialog` (Campañas, Actividades) y `ConfirmDialog` propio (Plantillas, Objeciones, Partners, Automatizaciones) | — |
| 7 | **Tres `ThemeToggle`** | `crm/pipeline/ThemeToggle.tsx` (huérfano), `app-layout/` y `theme/` | — |
| 8 | **Dos catálogos de propósito de agente IA** con etiquetas distintas | `AgentesIaPage.tsx:40-51` y `AgentPurposeTab.tsx:24-35` | Ya divergen en 4 de 10 etiquetas |

### I.3 Selectores y formularios de cliente en este módulo

Enlaza con la **§F de `docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md`** («Selector de cliente compartido»), donde ya está inventariado el `CustomerPicker` y su contrato propuesto (`Layout=popover|dialog|inline|sheet`, `CustomerRow`, `CustomerCard`, `QuickCustomerForm`, `customerSearchService.search`). Estas son las implementaciones **que viven en Clientes / CRM** y que deben resolverse con ese mismo componente:

| # | Implementación | Dónde se usa | Capacidades propias |
|---|---|---|---|
| 1 | `CustomerSearchSelect` (`crm/oportunidades/`) | Alta de lead, formulario de oportunidad | Popover `w-[350px]`, avatar, email y teléfono por fila, `allowEmpty` configurable, búsqueda en servidor con 300 ms de espera, estados «Buscando…» / error / «Escribe para buscar un cliente» |
| 2 | `SearchSelect` genérico | Panel de acciones rápidas de Actividades (`ActividadesPage.tsx:284-292`), `ActividadForm` | Placeholder «Sin cliente», buscador «Buscar cliente...», **tope de 200 clientes cargados** |
| 3 | `EntitySearchList` | «Registrar deal» de Partners (`RegisterDealDialog.tsx:93-103`) | Busca oportunidades, no clientes, pero es el mismo patrón de lista buscable con `aria-pressed` |
| 4 | Buscador de `CallLinkPanel` | Fila expandida de Llamadas (`CallLinkPanel.tsx:218-257`) | placeholder «Nombre o teléfono…», vacío con enlace «Crear cliente nuevo», **y un alta de 3 campos embebida** |
| 5 | Buscador de `CompanyContactsManager` | Pestaña «Contactos» y `ClientForm` (`CompanyContactsManager.tsx:707-721`) | placeholder «Nombre, apellido o email...», resultados con avatar, alta completa de persona en la misma modal |
| 6 | `useCustomerSearch` (`crm/shared/`) | Hook compartido de varias de las anteriores | — |
| 7 | `CustomerEditDialog` (`crm/shared/`) | Pestaña «Resumen» del drawer del pipeline | Edición de cliente **en diálogo**, distinta del `ClientForm` de `/editar` |
| 8 | `ClientForm` embebido | Con `embedded` + `onSuccess` + `onCancel`, se monta dentro de diálogos (lo usa el GO Assistant vía `initialValues`) | Es el formulario canónico, y ya está preparado para vivir en un `Sheet` |

**Cuatro formularios distintos crean un cliente** en este módulo: el `ClientForm` completo (§A.20), el alta inline de `NewLeadDialog` (5 campos), el alta de `CallLinkPanel` (3 campos) y el alta de persona de `CompanyContactsManager` (7 campos + ubicación). Los cuatro escriben en `customers` con conjuntos de columnas distintos.

### I.4 Divergencias de comportamiento a reconciliar

| Qué | `/app/clientes` | Resto del módulo |
|---|---|---|
| Confirmación de borrado | `confirm()` nativo | `AlertDialog` / `ConfirmDialog` |
| Permisos | Ninguna comprobación | Partners, Objeciones, Campañas y Revenue OS resuelven en servidor |
| Fechas | `date-fns` con la zona del navegador | `useFormatDate()` en Campañas, Partners, Automatizaciones y Revenue OS |
| Moneda | COP cableado | Partners detecta monedas mezcladas y no suma |
| Estados vacíos | «No se encontraron clientes» a secas | Objeciones, Partners y Automatizaciones tienen vacíos **con propósito** y una acción |
| Tablas anchas | Scroll horizontal con las 10 columnas | Campañas e Identidades **ocultan columnas** por breakpoint |

---

## J. Conteo de controles por pantalla

«Controles» = filas inventariadas, incluidos textos, badges, estados y cálculos, tal como en la auditoría de productos y POS.

### J.1 Clientes (§A)

| Sección | Controles |
|---|---|
| A.0 Lista: contenedor y estados | 9 |
| A.1 Acciones de cabecera | 12 |
| A.2 Diálogo «Etiquetar clientes» (cabecera) | 6 |
| A.3 Diálogo «Fusionar clientes duplicados» | 6 |
| A.4 Diálogo «Importar Clientes» (4 pasos) | 18 |
| A.5 KPIs y barra de acciones masivas | 20 |
| A.5a Diálogo «Etiquetar» / «Quitar etiqueta» (barra masiva) | 7 |
| A.6 Filtros | 12 |
| A.7 Tabla | 21 |
| A.8 Paginación | 8 |
| A.9 Detalle: contenedor y 7 pestañas | 12 |
| A.10 Cabecera del perfil | 14 |
| A.11 Pestaña «Resumen» | 13 |
| A.12 Pestaña «Información» | 21 |
| A.13 Pestaña «Oportunidades» | 11 |
| A.14 Pestaña «Timeline» | 16 |
| A.15 Pestaña «Cuentas por cobrar» | 17 |
| A.16 Pestaña «Notas y archivos» | 13 |
| A.17 Pestaña «Contactos» + modal | 30 |
| A.18 Barra lateral «Tareas» | 12 |
| A.19 Contenedores de crear y editar | 8 |
| A.20 `ClientForm` | 34 |
| A.21 `MergeModal` | 8 |
| **Total §A** | **328** |

### J.2 Resto del módulo

| Pantalla | Controles | Nota |
|---|---|---|
| `/app/crm` | **3** | Solo el redirect; lo que el usuario ve son los 126 de `/app/crm/clientes` |
| `/app/inicio#crm` (panel CRM) | **62** | Más 14 en componentes huérfanos que no se renderizan |
| `/app/crm/clientes` | **126** | Idénticos a `/app/clientes` |
| `/app/crm/clientes/[id]` | **99** | Ficha distinta, cero componentes compartidos |
| `/app/crm/oportunidades` | **72** | Más 15 del importador de leads huérfano y 9 de `ScoringSection` |
| `/app/crm/oportunidades/[id]` | **157** | |
| `/app/crm/oportunidades/nuevo` + `/[id]/editar` | **75** | Mismo formulario, dos modos |
| `/app/crm/pipeline` | **444** | 36 secciones; más 6 bloques huérfanos |
| `/app/crm/pipeline/edit-opportunity` | **2** | Solo una redirección heredada |
| `/app/crm/pronostico` | **213** | De ellos **solo 21 interactivos**; sin diálogos, sin paginación, sin atajos |
| `/app/crm/actividades` | **97** | |
| `/app/crm/actividades/[id]` | **26** | |
| `/app/crm/llamadas` | **114** | Más 16 de `CallAiPolicyCard`, que vive en Configuración |
| `/app/crm/plantillas` (+ `[id]`, `nueva`) | **116** | |
| `/app/crm/campanas` | **45** | |
| `/app/crm/campanas/[id]` | **45** | |
| `/app/crm/campanas/nuevo` | **64** | |
| `/app/crm/identidades` | **68** | |
| `/app/crm/objeciones` | **69** | Más 10 del diálogo «Registrar objeción», que se abre desde la oportunidad |
| `/app/crm/leads` | **68** | |
| `/app/crm/equipo` | **103** | |
| `/app/crm/partners` | **97** | |
| `/app/crm/automatizaciones` | **178** | |
| `/app/crm/agentes-ia` | **208** | |
| **Total del módulo** | **≈ 2 880 controles montados** | Más ~65 en componentes huérfanos |

Para poner la cifra en contexto: la auditoría de productos y POS inventarió unos 900 controles. **Clientes / CRM es tres veces más grande**, y su pantalla más densa (`/app/crm/pipeline`, 444) supera por sí sola a todo el detalle de producto.

### J.3 Atajos de teclado en todo el módulo

Solo **cinco**, ninguno global:

| Atajo | Dónde | Archivo:línea |
|---|---|---|
| `Enter` aplica/quita etiqueta | Diálogo de etiquetado masivo | `app/app/clientes/page.tsx:1221-1225` |
| `Enter` guarda · `Escape` cancela el cargo | Edición en línea del contacto de empresa | `CompanyContactsManager.tsx:558-567` |
| `Ctrl+Shift+C` llama al contacto de la fila enfocada | Historial de llamadas (requiere softphone) | `CallRow.tsx:7-12` |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Editor de bloques de plantilla de email | `EmailBlockEditor.tsx:48-53` |
| `Tab` inserta 2 espacios | Editor HTML de plantilla | `EmailHtmlEditor.tsx:42-47` |

Más `Enter` para enviar formulario en las hojas de Partners y Automatizaciones, `Enter` para crear tarea en el drawer del pipeline, y `?tab=` / `?call=` como enlaces profundos. **No hay `Cmd/Ctrl+K`, ni navegación por flechas fuera de Radix, ni atajos de módulo.**

---

## K. Recomendación de rediseño

Criterio idéntico al de la auditoría de productos y POS: «diseñar de nuevo» = la pantalla no existe en Figma o lo dibujado cubre menos de la mitad de sus controles; «completar» = existe y faltan estados, diálogos o sub-bloques; «está bien» = cubre lo real.

### K.1 Prioridad 1 — diseñar de nuevo

| # | Pantalla | Controles reales | Por qué | Sección |
|---|---|---|---|---|
| 1 | **Pipeline completo** (tablero, tarjeta, drawer de 7 pestañas, acciones masivas, cierre ganado, cierre perdido estructurado) | 444 | Es la pantalla más densa de todo el ERP y la que más lejos está de cualquier diseño. El drawer por sí solo es una aplicación | §C |
| 2 | **`ClientForm` + las cuatro altas paralelas** | 34 + 5 + 3 + 7 | Cuatro formularios distintos crean el mismo registro. Hay que unificarlos en el `CustomerPicker`/`QuickCustomerForm` ya especificado en la §F de productos y POS, y dejar **un** `ClientForm` canónico que viva igual en página y en `Sheet` | §A.20, §I.3 |
| 3 | **Detalle del cliente: una sola ficha** | 328 (A) frente a 99 (B) | Hoy hay dos fichas incompatibles para el mismo cliente. Decidir una: la de CRM aporta acciones rápidas, salud, documentos y el timeline rico; la de Clientes aporta cartera, contactos de empresa y tareas. **Ninguna de las dos es descartable tal cual** | §A.9-A.18, §B.10-B.18 |
| 4 | **Revenue OS** (5 pestañas: Resumen, Embudo, Forecast, Cohortes, Matemática comercial) | 213 | No existe en Figma y es la pantalla con más decisiones de visualización de datos: 7 KPIs, dos sistemas de gráficas distintos (Recharts y barras HTML a mano), tabla de cohortes con escala de color y un formulario de insumos con permiso | §C |
| 5 | **Agentes IA de voz** (editor de 4 pasos, biblioteca de voces, asistente de clonación de 4 pasos, campañas) | 208 | Sin diseño. El asistente de clonación tiene requisitos legales visibles (habeas data, consentimiento, identificación como IA) que **no** pueden quedarse fuera | §F.20-F.26 |
| 6 | **Automatizaciones** (constructor de frase «Cuando / si / entonces» con chips editables) | 178 | Patrón de interacción que no existe en ninguna otra parte del producto: fichas que se expanden en editores en sitio, 39 campos de condición, 14 acciones y una vista previa en lenguaje natural | §F.12-F.19 |
| 7 | **Llamadas** (fila expandida: vinculación, reproductor, transcripción con búsqueda, análisis IA con «Aplicar todo») | 114 | Toda la inteligencia de llamadas está sin dibujar, incluidos 11 mensajes de error distintos y el diálogo de llamada desde el celular | §D.11-D.14 |
| 8 | **Plantillas de email** (editor de bloques con 13 tipos, paleta, canvas con arrastre y panel de propiedades; editor HTML; vista previa escritorio/móvil) | 116 | Un editor visual completo sin diseño | §D.15-D.22 |
| 9 | **`CustomerPicker` compartido** | Ver §F de productos y POS | Ocho implementaciones más en este módulo, sumadas a las 22 ya inventariadas allí | §I.3 |

### K.2 Prioridad 2 — completar

| Pantalla | Qué añadir |
|---|---|
| Lista de clientes | Los tres diálogos completos (importación de 4 pasos con sus 18 controles, etiquetado, fusión), la barra de acciones masivas con el menú de roles abierto, los 8 badges de cartera, el vacío con sus dos botones, y **un estado «sin permiso» que hoy no existe** |
| Detalle del cliente | Las 7 pestañas con sus vacíos y sus errores; el modal «Agregar Contacto» con sus dos modos; la barra lateral de tareas; y un **menú «…» en la cabecera** que hoy no existe (duplicar, desactivar, eliminar, exportar ficha) |
| Actividades | El diálogo de actividad con sus 8 tipos, sus campos condicionales por tipo y sus 4 mensajes de validación; el aviso índigo de «Tarea»; los dos estados vacíos distintos |
| Campañas | El wizard de 4 pasos completo con la validación de cada uno; las 10 etiquetas de exclusión y las 14 de error del proveedor; la tabla de contactos con sus 12 estados |
| Identidades | **Rehacer sobre el modelo de Objeciones**: hoy tres de sus acciones no escriben nada (§G.1-1). El panel de duplicados sí merece conservarse |
| Equipo | Scroll horizontal en las tablas de 6 y 9 columnas, `aria-label` en los 10 botones de icono, y confirmación al quitar un miembro |

### K.3 Está bien — úsalo como referencia

| Pantalla | Por qué |
|---|---|
| **Objeciones** | Sin `alert()` ni `confirm()`, sin handlers vacíos, sin imports muertos. Validación por campo con `role="alert"` y foco dirigido, retorno de foco al cerrar hojas y diálogos, dos estados vacíos distintos (catálogo y filtro) con su acción, hoja lateral con cuerpo desplazable y pie anclado con `safe-area-inset`, y estado repetido en icono **y** texto, nunca solo en color. Sus clases de maquetado móvil están fijadas por pruebas |
| **Partners** | Permiso resuelto en servidor y usado para ocultar o deshabilitar con motivo visible; confirmaciones que anticipan el 409 del servidor; y el único sitio del módulo que ante monedas mezcladas **no suma y lo dice** |
| **Automatizaciones** | El botón de guardar dice el resultado exacto («Crear y activar» / «Guardar desactivada»); el ámbito guardado nunca se borra en silencio al cambiar de disparador, y se explica por qué se conserva; la vista previa es literalmente la misma frase que verá el usuario en la tarjeta |
| **Revenue OS** | Cada métrica muestra su fórmula, y cuando no hay dato explica **el motivo concreto** en vez de un «—». Las gráficas tienen vista de tabla alternativa con los valores exactos |

### K.4 Deuda que el diseño no puede resolver sola

Cuatro cosas hay que arreglarlas en código antes o a la vez que se rediseñan, porque el diseño no puede dibujar algo que no funciona:

1. **Identidades** (§G.1-1): tres acciones que mienten. Es el fallo más grave del módulo.
2. **Folios de la ficha CRM** (§G.1-2): la subconsulta inválida hace que la pestaña «Finanzas» esté siempre incompleta.
3. **`customers.is_active` no existe** (§H.1-1): decidir si se usa `lifecycle_stage` o se añade la columna, y hacer que el formulario sepa escribir el campo que la ficha ya muestra.
4. **Fusión de clientes** (§G.1-4 a G.1-6): sin RPC `merge_customers`, y las dos rutas del `MergeModal` que sí hacen algo pierden o rompen datos. Hay ya una fusión funcional (parcialmente) en el panel de duplicados de Identidades: consolidar ahí.
