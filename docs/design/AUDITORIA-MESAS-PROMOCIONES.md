# Auditoría control por control — servicio en mesa y promociones del POS

Insumo para que el diseñador **calque la realidad** en Figma («GO Admin — Sistema de diseño»,
`EAvjINVRnlzFM70GVoWXgl`, página `05 POS y ventas`). Este documento baja un nivel respecto a
`docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md` §D.5-D.12, que se da por leído y **no se
repite**: allí quedaron los inventarios de cabecera (mesas 66 controles, detalle 42, reservas 26,
comandas 20, cargos 21, cupones 18+14, promociones 18+6+13); aquí va **cada control** —botón,
menú, pestaña, campo, toggle, chip, badge, tabla, diálogo, tooltip, atajo, estado, texto, stat,
paginación, toast, cálculo— con su etiqueta exacta, lo que hace, cuándo aparece y `archivo:línea`.
El conteo resultante es **850 controles**, 4,7 veces el del inventario previo.

Fecha: 2026-09-22. Solo lectura de código; el esquema, los `CHECK`, los triggers, la RLS, la
publicación de Realtime y la evidencia de uso se verificaron con el **MCP de Supabase** (proyecto
`jgmgphmzusbluqhuqihj`, únicamente `SELECT`). Sin nombres de organizaciones cliente. Rutas
relativas a `src/` salvo que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip · atajo ·
estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast · cálculo (regla sin
control visible). **Etiqueta exacta** es el literal del código con su acentuación (o su falta);
ninguna de estas seis pantallas pasa por `messages/es.json`, así que los textos se citan tal cual.
**Cuándo aparece**: «Siempre» = incondicional dentro de su pantalla; breakpoints Tailwind
(`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).

Índice: A. Mesas, plano y listado · B. Mesas, detalle · C. Reservas de mesas y comandas de cocina ·
D. Promociones y su motor · E. Cupones y cargos de servicio · F. Esquema verificado con el MCP ·
G. Lo transversal: los ocho defectos que se repiten en las seis pantallas · H. Qué falta para que
el servicio en mesa sea usable · I. Decisiones de producto cerradas y lo que exigen del esquema ·
J. Conteo de controles.

Las cuatro dudas que esta auditoría dejó abiertas están **cerradas** (§I) y recogidas en
`docs/design/PATRONES-TRANSVERSALES.md` §13, entradas 5 a 8. La quinta —la RLS abierta de
`restaurant_reservations`— **ya se corrigió** con la migración
`20260922200000_rls_reservas_y_redenciones`: ver §F.4, que cita el estado nuevo verificado con el
MCP.

---

## A. Mesas — plano y listado `/app/pos/mesas`


Ruta: `/app/pos/mesas`. Archivos: `app/app/pos/mesas/page.tsx` (1207 líneas) y
`components/pos/mesas/*`. Todo se resuelve en el navegador con el cliente
`@/lib/supabase/config`; no hay route handler, ni `getServerOrgContext()`, ni
comprobación de permisos (ver §7).

### 1. Cabecera y acciones globales

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | *(sin texto, icono `ArrowLeft`)* | `Link href="/app/pos"` — vuelve al POS | siempre | `app/app/pos/mesas/page.tsx:498-502` |
| 2 | texto | `Plano de Mesas` | título H1 con icono `UtensilsCrossed` | siempre | `app/app/pos/mesas/page.tsx:504-509` |
| 3 | texto | `POS / Mesas` | migaja estática (no navegable) | siempre | `app/app/pos/mesas/page.tsx:510-512` |
| 4 | toggle | `Lista` | `setViewMode('list')` | siempre | `app/app/pos/mesas/page.tsx:518-526` |
| 5 | toggle | `Mapa` | `setViewMode('map')` | siempre | `app/app/pos/mesas/page.tsx:527-535` |
| 6 | botón | *(sin texto, icono `RefreshCw`)* | `cargarDatos()`; gira mientras `isRefreshing`; `disabled` al refrescar | siempre | `app/app/pos/mesas/page.tsx:537-539` |
| 7 | botón | `Nueva Mesa` | `setShowMesaForm(true)` | siempre | `app/app/pos/mesas/page.tsx:540-543` |
| 8 | badge | *(`BranchBadge`)* | muestra la sucursal activa del `BranchContext` | siempre | `app/app/pos/mesas/page.tsx:547` |
| 9 | estado (cargando) | *(`PageHeaderSkeleton` + `CardListSkeleton cards={6}`)* | esqueleto de carga inicial | `branchLoading \|\| (isLoading && mesas.length===0)` | `app/app/pos/mesas/page.tsx:484-491` |
| 10 | estado (cargando) | *(`opacity-60 pointer-events-none`)* | bloquea toda la página mientras refresca | `isRefreshing` | `app/app/pos/mesas/page.tsx:494` |
| 11 | toast | `Error` / `No se pudieron cargar las mesas` | error al cargar mesas, zonas o layouts | fallo en `cargarDatos()` | `app/app/pos/mesas/page.tsx:117-121` |
| 12 | stat (KPI) | `Libres` | `mesas.filter(m => m.state === 'free').length` | siempre (ambos modos) | `app/app/pos/mesas/page.tsx:823-837` |
| 13 | stat (KPI) | `Ocupadas` | `mesas.filter(m => m.state === 'occupied').length` | siempre | `app/app/pos/mesas/page.tsx:838-852` |
| 14 | stat (KPI) | `Con Cuenta` | `mesas.filter(m => m.session?.status === 'bill_requested').length` | siempre | `app/app/pos/mesas/page.tsx:853-867` |
| 15 | stat (KPI) | `Total` | `mesas.length` | siempre | `app/app/pos/mesas/page.tsx:868-882` |

> Los cuatro KPI se calculan en el navegador sobre el array completo ya cargado
> (ver §7). Los `state` de la BD y el `session` no siempre coinciden: el KPI
> «Libres» cuenta por `state`, la tarjeta pinta por `session`.

### 2. Modo Mapa (`components/pos/mesas/MesasFloorMap.tsx`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 16 | toggle | `Editar plano` / `Editando plano` | `setEditMode(!editMode)`; icono `Lock`/`Unlock` | siempre en modo Mapa | `components/pos/mesas/MesasFloorMap.tsx:515-523` |
| 17 | botón | `Centrar` | `setPanOffset({x:0,y:0})` | solo `editMode` | `components/pos/mesas/MesasFloorMap.tsx:525-533` |
| 18 | botón | `Guardar posiciones` / `Guardando...` | `handleSave()` → `onSavePositions` + `onSaveZoneLayouts`; `disabled` al guardar | `hasChanges && editMode` | `components/pos/mesas/MesasFloorMap.tsx:535-545` |
| 19 | botón | *(sin texto, `ZoomOut`)* | `setZoom(z => Math.max(0.4, z-0.1))` | siempre | `components/pos/mesas/MesasFloorMap.tsx:549-551` |
| 20 | texto | `{Math.round(zoom*100)}%` | nivel de zoom | siempre | `components/pos/mesas/MesasFloorMap.tsx:552-554` |
| 21 | botón | *(sin texto, `ZoomIn`)* | `setZoom(z => Math.min(2, z+0.1))` | siempre | `components/pos/mesas/MesasFloorMap.tsx:555-557` |
| 22 | botón + tooltip | `Reset zoom` *(title)* | `handleResetZoom()` → zoom 1 | siempre | `components/pos/mesas/MesasFloorMap.tsx:558-560` |
| 23 | botón + tooltip | `Centrar mesas` / title `Centrar donde hay más mesas` | centroide de posiciones y recalcula `panOffset` | siempre | `components/pos/mesas/MesasFloorMap.tsx:561-564` |
| 24 | chip (leyenda) | `Libre` | punto verde | siempre | `components/pos/mesas/MesasFloorMap.tsx:569` |
| 25 | chip (leyenda) | `Ocupada` | punto rojo | siempre | `components/pos/mesas/MesasFloorMap.tsx:570` |
| 26 | chip (leyenda) | `Cuenta` | punto naranja | siempre | `components/pos/mesas/MesasFloorMap.tsx:571` |
| 27 | chip (leyenda) | `Reservada` | punto amarillo | siempre | `components/pos/mesas/MesasFloorMap.tsx:572` |
| 28 | texto (rejilla) | *(fondo de puntos)* | `radial-gradient`, paso `GRID_SIZE*zoom`, se desplaza con el pan | siempre | `components/pos/mesas/MesasFloorMap.tsx:581-588` |
| 29 | atajo/gesto | *(arrastre del lienzo — pan)* | `handleCanvasPointerDown/Move`; cursor `grab`/`grabbing` | solo fuera de `editMode`, clic en vacío | `components/pos/mesas/MesasFloorMap.tsx:384-413`, `:589-603` |
| 30 | atajo/gesto | *(arrastre de mesa)* | `handlePointerDown/Move` + `snapToGrid` (20 px); sin límites, el lienzo crece | solo `editMode` | `components/pos/mesas/MesasFloorMap.tsx:247-282`, `:700` |
| 31 | atajo/gesto | *(arrastre de zona)* | `handleZonePointerDown/Move`; crea override `{x,y,w,h}` | solo `editMode` | `components/pos/mesas/MesasFloorMap.tsx:292-331`, `:629` |
| 32 | atajo/gesto | *(handle redimensionar zona)* | `handleZoneResizeDown/Move`; mínimo 100×80 | solo `editMode` | `components/pos/mesas/MesasFloorMap.tsx:334-369`, `:638-644` |
| 33 | botón + tooltip | *(icono `RotateCw`)* / title `Rotar 15°` | `handleRotate(mesa.id)` → `(+15) % 360` | solo `editMode` | `components/pos/mesas/MesasFloorMap.tsx:759-769` |
| 34 | chip | `{zb.zone}` | etiqueta de la zona con color por hash | hay mesas con `zone` | `components/pos/mesas/MesasFloorMap.tsx:631-636` |
| 35 | texto (sillas) | *(círculos alrededor de la mesa)* | pintadas = `session.customers`; `CHAIR_SIZE=14` | siempre | `components/pos/mesas/MesasFloorMap.tsx:70-104`, `:672-688` |
| 36 | botón (mesa) | `{mesa.name}` | `handleMesaClick(mesa)` → `onMesaClick`; no hace nada en `editMode` | siempre | `components/pos/mesas/MesasFloorMap.tsx:691-701`, `:415-418` |
| 37 | tooltip | mesero / `{tiempo} abierta` / `${total}` / `{n} en cocina` | detalle al pasar el ratón; texto de respaldo `Sin mesero asignado` | `hoveredMesaId === mesa.id && mesa.session && !editMode` | `components/pos/mesas/MesasFloorMap.tsx:706-733` |
| 38 | texto | `{customers}/{capacity}` + tiempo | info compacta dentro de la mesa | siempre | `components/pos/mesas/MesasFloorMap.tsx:744-755` |
| 39 | texto (ayuda) | `Arrastra las mesas y zonas para reorganizar el plano. Usa el botón azul para rotar mesas. Las sillas se muestran según la capacidad. Haz clic en "Guardar posiciones" cuando termines.` | instrucciones | solo `editMode` | `components/pos/mesas/MesasFloorMap.tsx:778-782` |
| 40 | cálculo | *(persistencia de vista)* | zoom y pan en `localStorage` bajo `pos_mesas_floor_map_view` | al montar y en cada cambio | `components/pos/mesas/MesasFloorMap.tsx:106-119`, `:144-150` |
| 41 | cálculo | *(lienzo que crece)* | `canvasSize` = base 3000×2000 + margen 400 según la mesa más lejana | siempre | `components/pos/mesas/MesasFloorMap.tsx:196-206` |
| 42 | cálculo | *(forma y tamaño por capacidad)* | ≤2 círculo 70×70; ≤4 110×80; ≤6 130×90; resto 150×100 | siempre | `components/pos/mesas/MesasFloorMap.tsx:54-59` |
| 43 | cálculo | *(color de zona)* | hash del nombre sobre 8 colores fijos `ZONE_COLORS` | siempre | `components/pos/mesas/MesasFloorMap.tsx:37`, `:45-49` |
| 44 | cálculo | *(recuadro de zona)* | bounding box de las mesas de la zona, padding 24 | sin override de zona | `components/pos/mesas/MesasFloorMap.tsx:209-244` |
| 45 | toast | `Posiciones guardadas` / `El plano se actualizó correctamente` | éxito de `actualizarPosiciones` | tras guardar | `app/app/pos/mesas/page.tsx:464` |
| 46 | toast | `Error` / `No se pudieron guardar las posiciones` | fallo de `actualizarPosiciones` | error | `app/app/pos/mesas/page.tsx:466` |
| 47 | toast | `Error` / `No se pudieron guardar las zonas` | fallo de `guardarZoneLayouts` | error | `app/app/pos/mesas/page.tsx:480` |

> El modo Mapa **no tiene** estado vacío, ni menú ⋯, ni liberar, ni solicitar
> cuenta, ni editar mesa: solo abrir/ir al detalle (§7).

### 3. Modo Lista — filtros, vacío, tarjeta, menú ⋯, paginación

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 48 | botón | `Gestionar Zonas` | `setShowZonasManager(true)` | modo Lista | `app/app/pos/mesas/page.tsx:567-570` |
| 49 | botón | `Combinar Mesas` / `Cancelar Combinación` | `handleToggleModoCombinar()` | modo Lista | `app/app/pos/mesas/page.tsx:571-578` |
| 50 | botón | `Mover Pedido` | `setShowMover(true)` | modo Lista | `app/app/pos/mesas/page.tsx:579-582` |
| 51 | botón | `Historial` | `setShowHistorial(true)` | modo Lista | `app/app/pos/mesas/page.tsx:583-586` |
| 52 | campo | placeholder `Buscar mesa por nombre...` | filtra por `m.name.toLowerCase().includes(...)` en memoria | modo Lista | `app/app/pos/mesas/page.tsx:622-627`, `:143-145` |
| 53 | botón | *(sin texto, icono `X`)* | `setBusqueda('')` | hay texto en la búsqueda | `app/app/pos/mesas/page.tsx:628-636` |
| 54 | campo (select) | `Todas las zonas` / `Sin zona` / *(zonas dinámicas)* | `setZonaFiltro`; `sin-zona` → `!m.zone` | modo Lista | `app/app/pos/mesas/page.tsx:639-652`, `:130-137` |
| 55 | campo (select) | `Todos los estados` / `🟢 Libre` / `🔴 Ocupada` / `🟠 Cuenta solicitada` / `🟡 Reservada` | `setEstadoFiltro`; `bill_requested` mira `session.status`, el resto `m.state` | modo Lista | `app/app/pos/mesas/page.tsx:654-665`, `:138-142` |
| 56 | botón | `Limpiar filtros` | resetea búsqueda, zona y estado | `busqueda \|\| zonaFiltro!=='todas' \|\| estadoFiltro!=='todos'` | `app/app/pos/mesas/page.tsx:667-680` |
| 57 | estado (vacío) | `No hay mesas para mostrar` | tarjeta centrada | `mesasFiltradas.length === 0` | `app/app/pos/mesas/page.tsx:684-688` |
| 58 | botón | `Crear Primera Mesa` | `setShowMesaForm(true)` desde el vacío | `mesasFiltradas.length === 0` | `app/app/pos/mesas/page.tsx:689-692` |
| 59 | texto | `Sin zona` | encabezado del grupo sin zona | `zonaFiltro==='todas'` y hay mesas sin zona **en la página actual** | `app/app/pos/mesas/page.tsx:702-707` |
| 60 | texto + badge | `{zona}` + `{n} mesa` / `{n} mesas` | encabezado del grupo; el conteo es de la página actual | `zonaFiltro==='todas'` | `app/app/pos/mesas/page.tsx:741-747` |
| 61 | badge | `🟢 Libre` / `🔴 Ocupada` / `⏳ Cuenta` / `🟡 Reservada` | estado visual de la tarjeta (prioriza `session` sobre `state`) | siempre | `components/pos/mesas/MesaCard.tsx:18-31`, `:71-75` |
| 62 | texto | `{mesa.name}` | nombre de la mesa | siempre | `components/pos/mesas/MesaCard.tsx:79-81` |
| 63 | texto | `{mesa.zone}` | zona bajo el nombre | `mesa.zone` no nulo | `components/pos/mesas/MesaCard.tsx:82-86` |
| 64 | texto | `{customers} / {capacity} personas` | ocupación | siempre | `components/pos/mesas/MesaCard.tsx:92-97` |
| 65 | texto | `{n} min` / `{h}h {m}m` | tiempo abierta, calculado con `Date.now()` en el render | `mesa.session` | `components/pos/mesas/MesaCard.tsx:34-45`, `:100-106` |
| 66 | texto | `${totalAmount.toLocaleString()}` | total consolidado de la(s) venta(s) | `mesa.totalAmount` truthy | `components/pos/mesas/MesaCard.tsx:109-114` |
| 67 | badge | `{n} en cocina` | items de comanda sin entregar | `pendingKitchenItems > 0` | `components/pos/mesas/MesaCard.tsx:117-122` |
| 68 | badge (aviso) | `Revisar` | mesa «olvidada»: ≥45 min abierta sin cuenta solicitada | `esMesaOlvidada` | `components/pos/mesas/MesaCard.tsx:48-52`, `:126-133` |
| 69 | botón + tooltip | *(icono `Receipt`)* / title `Solicitar cuenta` | `handleSolicitarCuenta` → `status='bill_requested'` | hover, `!modoCombinar && session.status==='active'` | `app/app/pos/mesas/page.tsx:1134-1149`, `:301-318` |
| 70 | menú (trigger) | *(icono `MoreVertical`)* | abre el menú contextual de la tarjeta | hover, `!modoCombinar` | `app/app/pos/mesas/page.tsx:1152-1163` |
| 71 | menú (ítem) | `Editar Mesa` | `setMesaEditar(mesa)` + `setShowMesaForm(true)` | siempre en el menú | `app/app/pos/mesas/page.tsx:1165-1173` |
| 72 | menú (ítem) | `Editar Comensales` | abre el diálogo de comensales con `session.customers` | solo si `mesa.session` | `app/app/pos/mesas/page.tsx:1177-1185` |
| 73 | menú (ítem) | `Liberar Mesa` | `setMesaParaLiberar(mesa)` (rojo) | solo si `mesa.session` | `app/app/pos/mesas/page.tsx:1189-1198` |
| 74 | paginación (select) | `Mostrar` … `por página` (`9`,`12`,`20`,`30`,`50`) | `onPageSizeChange`; corta el array en memoria | `mesasFiltradas.length > 0` | `components/pos/mesas/MesasPagination.tsx:37-59` |
| 75 | paginación (texto) | `Mostrando {x} a {y} de {z} mesas` / `Sin mesas` | rango visible | siempre | `components/pos/mesas/MesasPagination.tsx:62-72` |
| 76 | paginación (botón) | *(`ChevronsLeft`)* | primera página; `disabled` en la 1 | siempre | `components/pos/mesas/MesasPagination.tsx:76-83` |
| 77 | paginación (botón) | *(`ChevronLeft`)* | página anterior | siempre | `components/pos/mesas/MesasPagination.tsx:84-91` |
| 78 | paginación (botón) | `{pageNum}` | salta a esa página; ventana de 7 | siempre | `components/pos/mesas/MesasPagination.tsx:95-121` |
| 79 | paginación (botón) | *(`ChevronRight`)* | página siguiente | siempre | `components/pos/mesas/MesasPagination.tsx:124-131` |
| 80 | paginación (botón) | *(`ChevronsRight`)* | última página | siempre | `components/pos/mesas/MesasPagination.tsx:132-139` |
| 81 | cálculo | *(paginación en cliente)* | `totalPages = ceil(filtradas/pageSize)`, `slice(startIndex,endIndex)` | siempre | `app/app/pos/mesas/page.tsx:147-151` |
| 82 | toast | `Cuenta solicitada` / `Se marcó {mesa} para cierre de cuenta` | éxito de solicitar cuenta | tras la acción | `app/app/pos/mesas/page.tsx:305-309` |
| 83 | toast | `Error` / `No se pudo solicitar la cuenta` | fallo de solicitar cuenta | error | `app/app/pos/mesas/page.tsx:311-316` |

### 4. Modo Combinar (rápido, sobre las tarjetas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 84 | texto (aviso) | `Modo Combinar: Selecciona las mesas haciendo clic en los checkboxes. La primera mesa seleccionada será la principal (recibirá todos los pedidos).` | instrucciones | `modoCombinar` | `app/app/pos/mesas/page.tsx:608-615` |
| 85 | chip | `{n} mesa seleccionada` / `{n} mesas seleccionadas` | contador de la selección | `modoCombinar && mesasParaCombinar.length>0` | `app/app/pos/mesas/page.tsx:590-594` |
| 86 | botón | `Combinar Ahora` | `handleCombinarRapido()`; `disabled` con <2 | `modoCombinar && mesasParaCombinar.length>0` | `app/app/pos/mesas/page.tsx:595-602` |
| 87 | toggle (checkbox) | `{índice+1}` o `✓` | `onToggleSelect`; verde si es la principal, azul si no | `modoCombinar && mesa.session` | `app/app/pos/mesas/page.tsx:1102-1124` |
| 88 | badge | `Principal` | marca la primera seleccionada | `isSelected && selectionIndex===0` | `app/app/pos/mesas/page.tsx:1125-1129` |
| 89 | estado (selección) | *(`ring-2 ring-blue-500 ring-offset-2`)* | anillo azul sobre la tarjeta seleccionada | `isSelected` | `app/app/pos/mesas/page.tsx:1096` |
| 90 | toast | `Selección insuficiente` / `Debes seleccionar al menos 2 mesas para combinar` | validación previa | <2 seleccionadas | `app/app/pos/mesas/page.tsx:427-434` |
| 91 | toast | `Mesas combinadas` / `Las mesas han sido combinadas exitosamente` | éxito | tras combinar | `app/app/pos/mesas/page.tsx:267-270` |
| 92 | toast | `Error` / `No se pudieron combinar las mesas` | fallo (o `No hay sesiones activas para combinar` del servicio) | error | `app/app/pos/mesas/page.tsx:271-279`, `components/pos/mesas/mesasService.ts:604` |

### 5. Diálogos

#### 5.1 `MesaFormDialog` (crear y editar — dos instancias)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 93 | diálogo | `Nueva Mesa` / `Editar Mesa` | título según `mesa` | `showMesaForm && !mesaEditar` / `!!mesaEditar` | `components/pos/mesas/MesaFormDialog.tsx:96-98`; montaje en `app/app/pos/mesas/page.tsx:886-904` |
| 94 | campo | *(`BranchSelectorField`, `required`)* | elige la sucursal de la nueva mesa | **solo al crear** (`!mesa`) | `components/pos/mesas/MesaFormDialog.tsx:103-109` |
| 95 | campo | `Nombre de Mesa *` / placeholder `Ej: Mesa 1, Mesa VIP` | nombre; HTML `required` | siempre | `components/pos/mesas/MesaFormDialog.tsx:113-122` |
| 96 | campo (select) | `Zona` → `Sin zona` / *(zonas)* / `+ Nueva zona` | elegir zona; `nueva` conmuta a campo libre | `!mostrarNuevaZona` | `components/pos/mesas/MesaFormDialog.tsx:127-152` |
| 97 | campo | placeholder `Nombre de nueva zona` | crea zona al vuelo (se guarda en `restaurant_tables.zone`) | `mostrarNuevaZona` | `components/pos/mesas/MesaFormDialog.tsx:156-160` |
| 98 | botón | `Cancelar` *(junto al campo de zona)* | vuelve al select de zonas | `mostrarNuevaZona` | `components/pos/mesas/MesaFormDialog.tsx:161-170` |
| 99 | campo | `Capacidad *` | numérico, `min=1` `max=50`, por defecto 4 | siempre | `components/pos/mesas/MesaFormDialog.tsx:177-191` |
| 100 | botón | `Cancelar` | cierra el diálogo; `disabled` al enviar | siempre | `components/pos/mesas/MesaFormDialog.tsx:195-202` |
| 101 | botón | `Guardando...` / `Actualizar` / `Crear` | `onSubmit`; `sin-zona` → `''` → `null` en BD | siempre | `components/pos/mesas/MesaFormDialog.tsx:203-205`, `:77-83` |
| 102 | toast | `Mesa creada` / `Mesa {name} creada exitosamente` | éxito de creación | tras crear | `app/app/pos/mesas/page.tsx:163-166` |
| 103 | toast | `Error` / `No se pudo crear la mesa` (o `Debes seleccionar una sucursal para crear la mesa`) | fallo de creación | error | `app/app/pos/mesas/page.tsx:169-173`, `components/pos/mesas/mesasService.ts:189` |
| 104 | toast | `Mesa actualizada` / `Mesa {name} actualizada exitosamente` | éxito de edición | tras editar | `app/app/pos/mesas/page.tsx:183-186` |
| 105 | toast | `Error` / `No se pudo actualizar la mesa` | fallo de edición | error | `app/app/pos/mesas/page.tsx:190-195` |

#### 5.2 `ZonasManager`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 106 | diálogo | `Gestionar Zonas` | listado de zonas | `showZonasManager` | `components/pos/mesas/ZonasManager.tsx:78-82` |
| 107 | estado (vacío) | `No hay zonas creadas` | sin zonas | `zonas.length === 0` | `components/pos/mesas/ZonasManager.tsx:85-88` |
| 108 | texto | `{zona}` | fila de zona | por cada zona | `components/pos/mesas/ZonasManager.tsx:94-96` |
| 109 | botón | *(icono `Pencil`)* | abre el diálogo de renombrado | por cada zona | `components/pos/mesas/ZonasManager.tsx:99-108` |
| 110 | botón | *(icono `Trash2` rojo)* | abre la confirmación de borrado | por cada zona | `components/pos/mesas/ZonasManager.tsx:109-115` |
| 111 | botón | `Cerrar` | cierra el gestor | siempre | `components/pos/mesas/ZonasManager.tsx:123-127` |
| 112 | diálogo | `Editar Zona` + campo `Nuevo nombre` | renombra la zona en todas las mesas de la sucursal | `!!zonaEditar` | `components/pos/mesas/ZonasManager.tsx:132-145` |
| 113 | botón | `Cancelar` *(editar zona)* | cierra sin guardar | `!!zonaEditar` | `components/pos/mesas/ZonasManager.tsx:148-150` |
| 114 | botón | `Guardando...` / `Guardar` | `onEditarZona` → `actualizarZona` | `!!zonaEditar` | `components/pos/mesas/ZonasManager.tsx:151-153` |
| 115 | diálogo | `¿Eliminar zona?` / `Esta acción quitará la zona de todas las mesas asociadas. Las mesas no serán eliminadas, solo quedarán sin zona asignada.` | confirmación | `!!zonaEliminar` | `components/pos/mesas/ZonasManager.tsx:159-169` |
| 116 | botón | `Cancelar` *(eliminar zona)* | cierra | `!!zonaEliminar` | `components/pos/mesas/ZonasManager.tsx:172` |
| 117 | botón | `Eliminando...` / `Eliminar` | `onEliminarZona` → `zone = null` | `!!zonaEliminar` | `components/pos/mesas/ZonasManager.tsx:173-179` |
| 118 | toast | `Zona actualizada` / `Zona renombrada a {zonaNueva}` | éxito de renombrado | tras renombrar | `app/app/pos/mesas/page.tsx:226-229` |
| 119 | toast | `Error` / `No se pudo actualizar la zona` | fallo | error | `app/app/pos/mesas/page.tsx:231-236` |
| 120 | toast | `Zona eliminada` / `Las mesas ahora están sin zona asignada` | éxito de borrado | tras eliminar | `app/app/pos/mesas/page.tsx:245-248` |
| 121 | toast | `Error` / `No se pudo eliminar la zona` | fallo | error | `app/app/pos/mesas/page.tsx:250-255` |

#### 5.3 `MoverPedidoDialog`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 122 | diálogo | `Mover Pedido` / `Mueve el pedido de una mesa a otra. La mesa origen quedará libre.` | título y descripción | `showMover` | `components/pos/mesas/MoverPedidoDialog.tsx:80-85` |
| 123 | campo (select) | `Mesa Origen` / placeholder `Seleccionar mesa con pedido` | solo mesas con `session.status === 'active'`; muestra `{nombre} - {zona} ({n} personas)` | siempre | `components/pos/mesas/MoverPedidoDialog.tsx:89-108`, `:42-44` |
| 124 | texto | *(icono `MoveRight` azul)* | separador visual | siempre | `components/pos/mesas/MoverPedidoDialog.tsx:110-113` |
| 125 | campo (select) | `Mesa Destino` / placeholder `Seleccionar mesa libre` | solo `state === 'free'`, excluye el origen; `disabled` sin origen | siempre | `components/pos/mesas/MoverPedidoDialog.tsx:116-138`, `:47` |
| 126 | texto (aviso) | `El pedido será movido y la mesa origen quedará disponible.` | confirmación previa | origen y destino elegidos | `components/pos/mesas/MoverPedidoDialog.tsx:141-147` |
| 127 | botón | `Cancelar` | cierra | siempre | `components/pos/mesas/MoverPedidoDialog.tsx:151-157` |
| 128 | botón | `Moviendo...` / `Mover Pedido` | `onMover(sesionId, mesaDestinoId)`; `disabled` sin ambos | siempre | `components/pos/mesas/MoverPedidoDialog.tsx:158-163` |
| 129 | toast | `Pedido movido` / `El pedido ha sido movido exitosamente` | éxito | tras mover | `app/app/pos/mesas/page.tsx:286-289` |
| 130 | toast | `Error` / `No se pudo mover el pedido` | fallo | error | `app/app/pos/mesas/page.tsx:291-296` |

#### 5.4 `CombinarMesasDialog` — **montado pero inalcanzable desde esta página** (§7-d)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 131 | diálogo | `Combinar Mesas` / `Paso 1: Selecciona la mesa principal (donde quedarán todos los pedidos). Paso 2: Selecciona las mesas a combinar (quedarán libres).` | título y pasos | `showCombinar` — nunca `true` aquí | `components/pos/mesas/CombinarMesasDialog.tsx:78-85`; montaje `app/app/pos/mesas/page.tsx:914-919` |
| 132 | estado (aviso) | `⚠️ Necesitas al menos 2 mesas ocupadas para combinar.` | bloqueo informativo | `mesasDisponibles.length < 2` | `components/pos/mesas/CombinarMesasDialog.tsx:87-93` |
| 133 | texto + badge | `1. Mesa Principal` + `Recibirá todos los pedidos` | encabezado del paso 1 | siempre | `components/pos/mesas/CombinarMesasDialog.tsx:98-103` |
| 134 | toggle (checkbox) | `{mesa.name}` + comensales + nº de items | elige la mesa principal (exclusivo) | por cada mesa con sesión activa o con cuenta | `components/pos/mesas/CombinarMesasDialog.tsx:106-147`, `:38-40` |
| 135 | texto | `{n} mesa(s) → Mesa Principal` | indicador visual del movimiento | principal + ≥1 seleccionada | `components/pos/mesas/CombinarMesasDialog.tsx:153-163` |
| 136 | texto + badge | `2. Mesas a Combinar` + `Quedarán libres` | encabezado del paso 2 | siempre | `components/pos/mesas/CombinarMesasDialog.tsx:167-172` |
| 137 | toggle (checkbox) | `{mesa.name}` + comensales + nº de items | marca las mesas a combinar; `disabled` sin principal | por cada mesa ≠ principal | `components/pos/mesas/CombinarMesasDialog.tsx:176-220` |
| 138 | estado (vacío) | `Selecciona primero una mesa principal` | lista vacía | `mesasDisponibles.length === 0` | `components/pos/mesas/CombinarMesasDialog.tsx:221-225` |
| 139 | botón | `Cancelar` | cierra y limpia la selección | siempre | `components/pos/mesas/CombinarMesasDialog.tsx:232-238` |
| 140 | botón | `Combinando...` / `Combinar Mesas` | `onCombinar`; `disabled` sin principal o sin selección | siempre | `components/pos/mesas/CombinarMesasDialog.tsx:239-246` |

#### 5.5 `HistorialMesasDialog`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 141 | diálogo | `Historial de Mesas` | abre y carga mesas, meseros e historial | `showHistorial` | `components/pos/mesas/HistorialMesasDialog.tsx:183-188` |
| 142 | botón (rango) | `Hoy` · `Ayer` · `7 días` · `15 días` · `30 días` | `handleQuickRange`; recalcula `dateFrom`/`dateTo` | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:69-75`, `:193-205` |
| 143 | campo (fecha) | *(`DatePicker` desde)* | fija `dateFrom` y pasa `quickRange` a `custom` | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:209-216` |
| 144 | campo (fecha) | *(`DatePicker` hasta)* | fija `dateTo` | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:217-224` |
| 145 | campo (select) | `Todas las mesas` | filtra por `restaurant_table_id` | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:225-237` |
| 146 | campo (select) | `Todos los meseros` | filtra por `server_id` | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:238-248` |
| 147 | stat (KPI) | `Sesiones` | `stats.totalSesiones` | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:254-260` |
| 148 | stat (KPI) | `Facturado` | `formatCurrency(stats.totalFacturado)` | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:261-267` |
| 149 | stat (KPI) | `Duración prom.` | `formatDuration(stats.duracionPromedioMin)` | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:268-274` |
| 150 | stat (KPI) | `Comensales` | `stats.comensalesTotales` | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:275-281` |
| 151 | texto | `{n} sesión(es) encontrada(s)` | conteo del array cargado | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:287-289` |
| 152 | botón | *(icono `RefreshCcw`)* | `cargarHistorial()`; gira y se deshabilita al cargar | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:290-292` |
| 153 | estado (cargando) | *(3 `Skeleton`)* | carga del historial | `loading` | `components/pos/mesas/HistorialMesasDialog.tsx:295-301` |
| 154 | estado (error) | `No se pudo cargar el historial de mesas.` | error de carga | `!loading && error` | `components/pos/mesas/HistorialMesasDialog.tsx:303-305`, `:166` |
| 155 | estado (vacío) | `No hay sesiones de mesa en el rango y filtros seleccionados.` | sin resultados | `sesiones.length === 0` | `components/pos/mesas/HistorialMesasDialog.tsx:307-311` |
| 156 | tabla | `Mesa` · `Mesero` · `Comensales` · `Apertura` · `Cierre` · `Duración` · `Total` · `Estado` | 9 columnas (la 1.ª es el chevron); `Comensales` y `Duración` se ocultan en móvil | hay sesiones | `components/pos/mesas/HistorialMesasDialog.tsx:315-328` |
| 157 | botón (fila) | *(chevron `ChevronRight`/`ChevronDown`)* | expande el detalle de la sesión | `hasDetails` (hay eliminados o liberación) | `components/pos/mesas/HistorialMesasDialog.tsx:338-353` |
| 158 | badge | `Activa` / `Cuenta solicitada` / `Completada` | estado de la sesión | siempre | `components/pos/mesas/HistorialMesasDialog.tsx:37-41`, `:368-370` |
| 159 | badge | `{userName}` *(icono `Unlock`)* | quién liberó la mesa | hay evento `RELEASE` | `components/pos/mesas/HistorialMesasDialog.tsx:371-375` |
| 160 | badge | `{n}` *(icono `Trash2`)* | nº de productos eliminados de la sesión | `eventos.length > 0` | `components/pos/mesas/HistorialMesasDialog.tsx:376-380` |
| 161 | texto (detalle) | `Liberada por {userName} · {fecha}` | fila expandida | expandida y con liberación | `components/pos/mesas/HistorialMesasDialog.tsx:388-393` |
| 162 | texto (detalle) | `Productos eliminados/cancelados de esta sesión` + `{qty}x {producto} — eliminado por {usuario} ({motivo})` | lista de bajas con importe y fecha | expandida y con eventos | `components/pos/mesas/HistorialMesasDialog.tsx:396-414` |

#### 5.6 Diálogos de acción sobre la mesa (en `page.tsx`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 163 | diálogo | `Abrir Mesa - {mesa}` | abre sesión en una mesa libre | clic en tarjeta con `state==='free' && !session` | `app/app/pos/mesas/page.tsx:1016-1020`, `:403-406` |
| 164 | campo | `Número de comensales` | `min=1`, `max = capacity \|\| 20`, por defecto 2 | en el diálogo | `app/app/pos/mesas/page.tsx:1023-1032` |
| 165 | texto | `Capacidad máxima: {capacity} personas` | ayuda | en el diálogo | `app/app/pos/mesas/page.tsx:1033-1035` |
| 166 | texto (aviso) | `Se creará una nueva sesión y la mesa pasará a estado ocupada. Después podrás agregar productos desde el detalle de la mesa.` | explicación | en el diálogo | `app/app/pos/mesas/page.tsx:1037-1042` |
| 167 | botón | `Cancelar` *(abrir mesa)* | cierra sin abrir | en el diálogo | `app/app/pos/mesas/page.tsx:1045-1047` |
| 168 | botón | `Abrir Mesa` | `abrirSesion` y navega a `/app/pos/mesas/{id}` | en el diálogo | `app/app/pos/mesas/page.tsx:1048-1051`, `:366-395` |
| 169 | toast | `Sesión abierta` / `Mesa {name} ahora está ocupada` | éxito | tras abrir | `app/app/pos/mesas/page.tsx:378-381` |
| 170 | toast | `Error` / `No se pudo abrir la sesión` (o `Esta mesa ya tiene una sesión activa`) | fallo | error | `app/app/pos/mesas/page.tsx:388-393`, `components/pos/mesas/mesasService.ts:384` |
| 171 | diálogo | `Editar Comensales - {mesa}` | cambia `table_sessions.customers` | `!!mesaParaComensales` | `app/app/pos/mesas/page.tsx:982-986` |
| 172 | campo | `Número de comensales` | `min=1`, `max = capacity \|\| 20` | en el diálogo | `app/app/pos/mesas/page.tsx:989-998` |
| 173 | texto | `Capacidad máxima: {capacity} personas` | ayuda | en el diálogo | `app/app/pos/mesas/page.tsx:999-1001` |
| 174 | botón | `Cancelar` *(comensales)* | cierra | en el diálogo | `app/app/pos/mesas/page.tsx:1005-1007` |
| 175 | botón | `Guardar` *(comensales)* | `actualizarComensales` | en el diálogo | `app/app/pos/mesas/page.tsx:1008-1010` |
| 176 | toast | `Comensales actualizados` / `Ahora hay {n} comensales en {mesa}` | éxito | tras guardar | `app/app/pos/mesas/page.tsx:351-354` |
| 177 | toast | `Error` / `No se pudieron actualizar los comensales` | fallo | error | `app/app/pos/mesas/page.tsx:358-362` |
| 178 | diálogo | `¿Liberar mesa {mesa}?` / `Esta acción cerrará la sesión activa de la mesa y marcará las comandas pendientes como entregadas. ¿Deseas continuar?` | confirmación de liberación | `!!mesaParaLiberar` | `app/app/pos/mesas/page.tsx:957-968` |
| 179 | botón | `Cancelar` *(liberar)* | cierra | en el diálogo | `app/app/pos/mesas/page.tsx:970` |
| 180 | botón | `Sí, liberar mesa` | `liberarMesa` (cierra sesiones, marca comandas, audita) | en el diálogo | `app/app/pos/mesas/page.tsx:971-976`, `components/pos/mesas/mesasService.ts:741-826` |
| 181 | toast | `Mesa liberada` / `Mesa {name} liberada exitosamente` | éxito | tras liberar | `app/app/pos/mesas/page.tsx:329-332` |
| 182 | toast | `Error al liberar mesa` / `No se pudo liberar la mesa` | fallo | error | `app/app/pos/mesas/page.tsx:334-339` |
| 183 | diálogo | `¿Eliminar mesa?` / `Esta acción no se puede deshacer. La mesa {name} será eliminada permanentemente.` | **INALCANZABLE** (§7-a) | `!!mesaEliminar`, que nunca se cumple | `app/app/pos/mesas/page.tsx:928-950` |
| 184 | botón | `Cancelar` *(eliminar mesa)* | **INALCANZABLE** | — | `app/app/pos/mesas/page.tsx:941` |
| 185 | botón | `Eliminar` | **INALCANZABLE** — `handleEliminarMesa` | — | `app/app/pos/mesas/page.tsx:942-947` |
| 186 | toast | `Mesa eliminada` / `Mesa {name} eliminada exitosamente` | **INALCANZABLE** | — | `app/app/pos/mesas/page.tsx:206-209` |

### 6. Datos: de qué tablas lee y escribe

**Sin ninguna `.rpc(`** en los dos servicios (verificado: `grep -n "\.rpc(" mesasService.ts mesasHistorialService.ts` → vacío). Todo son consultas PostgREST directas desde el navegador.

#### 6.1 `components/pos/mesas/mesasService.ts`

| Tabla | Operación y `select` | Columnas / filtros | Línea |
|---|---|---|---|
| `restaurant_tables` | `.select('*')` `.eq('organization_id')` `.order('name')` + opcional `.eq('branch_id')` | todas las columnas de la mesa (`id, organization_id, branch_id, name, zone, capacity, state, position_x, position_y, rotation, created_at, updated_at`) | `mesasService.ts:23-33` |
| `table_sessions` | `.select('*')` `.eq('organization_id')` `.in('status', ['active','bill_requested'])` | todas (`id, restaurant_table_id, sale_id, opened_at, closed_at, server_id, customers, status, notes`). **No filtra por `branch_id`** | `mesasService.ts:42-46` |
| `sale_items` | `.select('sale_id, id')` `.in('sale_id', saleIds)` | solo para contar items por venta | `mesasService.ts:59-62` |
| `sales` | `.select('id, total')` `.in('id', saleIds)` | `total` para el importe consolidado | `mesasService.ts:73-75` |
| `profiles` | `.select('id, first_name, last_name')` `.in('id', serverIds)` | nombre del mesero | `mesasService.ts:90-93` |
| `kitchen_tickets` | **embed**: `.select('table_session_id, kitchen_ticket_items(id, status)')` `.in('table_session_id', sessionIds)` | cuenta items con `status !== 'delivered'` | `mesasService.ts:106-109` |
| `restaurant_tables` | `.insert({...}).select().single()` | escribe `organization_id, branch_id, name, zone, capacity, state='free', position_x, position_y` | `mesasService.ts:193-207` |
| `restaurant_tables` | `.update({...}).eq('id').select().single()` | `name, zone, capacity, position_x, position_y, updated_at` | `mesasService.ts:224-237` |
| `restaurant_tables` | `.update({position_x, position_y, rotation, updated_at}).eq('id')` × N en paralelo | guardado del plano | `mesasService.ts:254-259` |
| `restaurant_zone_layouts` | `.select('zone_name, position_x, position_y, width, height')` `.eq('organization_id')` + opcional `.eq('branch_id')` | recuadros de zona del plano | `mesasService.ts:276-283` |
| `restaurant_zone_layouts` | `.upsert(rows, {onConflict:'organization_id,branch_id,zone_name'})` | `organization_id, branch_id, zone_name, position_x, position_y, width, height, updated_at` | `mesasService.ts:321-323` |
| `table_sessions` | `.select('id')` `.eq('restaurant_table_id')` `.in('status',[...])` `.maybeSingle()` | guarda antes de borrar la mesa | `mesasService.ts:337-342` |
| `restaurant_tables` | `.delete().eq('id')` | borrado duro de la mesa (código muerto, §7-b) | `mesasService.ts:348-351` |
| `table_sessions` | `.select('id')` (existencia de sesión activa) | previo a abrir sesión | `mesasService.ts:376-381` |
| *(auth)* | `supabase.auth.getUser()` | `server_id` por defecto = usuario actual | `mesasService.ts:390` |
| `table_sessions` | `.insert({...}).select().single()` | `organization_id, restaurant_table_id, server_id, customers, status='active', opened_at`. **No escribe `branch_id`** | `mesasService.ts:399-410` |
| `restaurant_tables` | `.update({state:'occupied', updated_at}).eq('id')` | ocupa la mesa; **el error no se comprueba** | `mesasService.ts:415-421` |
| `table_sessions` | `.update({server_id, updated_at}).eq('id')` | `cambiarMesero` (se usa desde el detalle, no desde el plano) | `mesasService.ts:438-446` |
| `restaurant_tables` | `.update({state, updated_at}).eq('id')` | `cambiarEstadoMesa` | `mesasService.ts:464-471` |
| `table_sessions` | `.update({status:'bill_requested', updated_at}).eq('id')` | solicitar cuenta | `mesasService.ts:487-490` |
| `restaurant_tables` | `.select('zone')` `.eq('organization_id')` `.not('zone','is',null)` + opcional `branch_id` | zonas únicas, deduplicadas en el navegador | `mesasService.ts:507-517` |
| `restaurant_tables` | `.update({zone: zonaNueva})` `.eq('organization_id')` `.eq('branch_id')` `.eq('zone', zonaAntigua)` | renombrar zona | `mesasService.ts:546-551` |
| `restaurant_tables` | `.update({zone: null})` con los mismos filtros | eliminar zona | `mesasService.ts:572-577` |
| `table_sessions` | `.select('*')` `.in('restaurant_table_id', mesasACombinar)` `.in('status',[...])` | combinar: **sin `organization_id`** | `mesasService.ts:595-599` |
| `table_sessions` | `.update({restaurant_table_id: mesaPrincipalId}).eq('id')` en bucle | combinar | `mesasService.ts:609-612` |
| `restaurant_tables` | `.update({state:'free'}).in('id', mesasACombinar)` | libera las secundarias | `mesasService.ts:618-621` |
| `table_sessions` | `.select('*').eq('id').single()` | `dividirMesa` (código muerto, §7) | `mesasService.ts:644-648` |
| `table_sessions` | `.insert({...})` con `notes: 'Dividida desde mesa {id}'` | `dividirMesa` | `mesasService.ts:656-665` |
| `table_sessions` | `.update({status:'completed', closed_at}).eq('id')` | `dividirMesa` | `mesasService.ts:674-680` |
| `table_sessions` | **embed**: `.select('*, restaurant_tables!inner(id)').eq('id').single()` | mover pedido (el embed no se usa para nada) | `mesasService.ts:701-705` |
| `table_sessions` | `.update({restaurant_table_id: mesaDestinoId}).eq('id')` | mover pedido | `mesasService.ts:714-717` |
| `kitchen_tickets` | `.update({table_session_id: sesionId}).eq('table_session_id', sesionId)` | **no-op** (§7) | `mesasService.ts:722-725` |
| `table_sessions` | `.select('id, sale_id, organization_id, branch_id')` `.eq('restaurant_table_id')` `.in('status',[...])` | liberar mesa | `mesasService.ts:748-752` |
| `kitchen_tickets` | `.select('id').in('table_session_id', sessionIds).neq('status','delivered')` | comandas pendientes | `mesasService.ts:765-769` |
| `kitchen_tickets` | `.update({status:'delivered', updated_at}).in('id', ids)` | marca comandas entregadas | `mesasService.ts:773-776` |
| `kitchen_ticket_items` | `.update({status:'delivered', updated_at}).in('kitchen_ticket_id', ids)` | marca items entregados | `mesasService.ts:777-780` |
| `table_sessions` | `.update({status:'completed', closed_at}).in('id', sessionIds)` | cierra sesiones | `mesasService.ts:783-789` |
| `ops_audit_log` | `.insert(inserts)` | `organization_id, branch_id, user_id, entity_type='table_sessions', entity_id, action='RELEASE', previous_data, metadata{table_id, table_session_id, released_at}` | `mesasService.ts:841-856` |
| `restaurant_tables` | `.update({state:'free', updated_at}).eq('id').select().single()` | libera la mesa | `mesasService.ts:803-811` |
| `table_sessions` | `.update({customers}).eq('id')` | editar comensales (no toca `updated_at`) | `mesasService.ts:867-870` |

#### 6.2 `components/pos/mesas/mesasHistorialService.ts`

| Tabla | Operación y `select` | Columnas / filtros | Línea |
|---|---|---|---|
| `organization_members` | **embed**: `.select('user_id, profiles:user_id (id, first_name, last_name)')` `.eq('organization_id')` `.eq('is_active', true)` | lista de meseros del filtro | `mesasHistorialService.ts:62-66` |
| `restaurant_tables` | `.select('id, name, zone')` `.eq('organization_id')` `.order('name')` + opcional `branch_id` | lista de mesas del filtro | `mesasHistorialService.ts:84-90` |
| `table_sessions` | **embeds**: `.select('id, restaurant_table_id, server_id, customers, status, opened_at, closed_at, sale_id, restaurant_tables(name, zone), sales(total)')` `.eq('organization_id')` `.gte('opened_at', fromIso)` `.lte('opened_at', toIso)` `.order('opened_at', desc)` + opcionales `branch_id`, `restaurant_table_id`, `server_id` | historial de sesiones; `saleTotal` del embed `sales.total` | `mesasHistorialService.ts:105-127` |
| `profiles` | `.select('id, first_name, last_name').in('id', serverIds)` | nombres de meseros | `mesasHistorialService.ts:136-139` |
| `ops_audit_log` | `.select('id, user_id, previous_data, metadata, created_at')` `.eq('organization_id')` `.eq('entity_type','sale_items')` `.eq('action','DELETE')` + rango de `created_at` | productos eliminados; el cruce con las sesiones se hace **en el navegador** (`metadata.table_session_id`) | `mesasHistorialService.ts:177-191` |
| `profiles` | `.select('id, first_name, last_name').in('id', userIds)` | quién eliminó | `mesasHistorialService.ts:198-200` |
| `ops_audit_log` | `.select('id, user_id, metadata, created_at')` `.eq('entity_type','table_sessions')` `.eq('action','RELEASE')` + rango | liberaciones; cruce también en el navegador | `mesasHistorialService.ts:244-258` |
| `profiles` | `.select('id, first_name, last_name').in('id', userIds)` | quién liberó | `mesasHistorialService.ts:265-267` |

Tablas tocadas en total: `restaurant_tables`, `table_sessions`, `restaurant_zone_layouts`, `sales`, `sale_items`, `kitchen_tickets`, `kitchen_ticket_items`, `profiles`, `organization_members`, `ops_audit_log`.

### 7. Roturas y deuda

#### 7.1 Las cuatro hipótesis planteadas

| Hipótesis | Veredicto | Evidencia |
|---|---|---|
| (a) El diálogo `¿Eliminar mesa?` es inalcanzable porque `setMesaEliminar` nunca se llama | **CONFIRMADO** | `setMesaEliminar` aparece 3 veces y **siempre con `null`**: declaración `page.tsx:76`, `setMesaEliminar(null)` en `:210` y `onOpenChange={() => setMesaEliminar(null)}` en `:930`. El diálogo depende de `open={!!mesaEliminar}` (`:929`), que nunca es `true`. El menú ⋯ (`:1164-1201`) solo ofrece `Editar Mesa`, `Editar Comensales` y `Liberar Mesa` — no hay ítem «Eliminar». |
| (b) `eliminarMesa` es código muerto en el servicio | **CONFIRMADO (de facto)** | `MesasService.eliminarMesa` se define en `mesasService.ts:334` y solo se invoca en `page.tsx:204` (`await MesasService.eliminarMesa(mesaEliminar.id)`), dentro de `handleEliminarMesa`, que solo se dispara desde el botón inalcanzable de (a) (`page.tsx:943`). Ninguna otra referencia en `src/` salvo el README. **No hay forma de borrar una mesa desde la interfaz.** |
| (c) El modo combinar permite añadir mesas libres (sin sesión) | **CONFIRMADO** | `MesaCardWithMenu.handleClick` (`page.tsx:1085-1092`): `if (modoCombinar && mesa.session) { onToggleSelect() } else { onClick() }`. Para una mesa **sin** sesión cae en el `else` → `onClick()` = `handleMesaClick(mesa)` (`:723`), y ahí `if (modoCombinar) { handleToggleMesaCombinar(mesa.id); return; }` (`:398-401`) **no comprueba la sesión**. La mesa libre queda seleccionada (anillo azul, `:1096`) pero sin casilla ni número visible, porque el checkbox exige `mesa.session` (`:1102`). Si esa mesa libre queda la primera, se convierte en «principal» (`:437`) y `combinarMesas` la trata como destino sin sesión propia. |
| (d) `CombinarMesasDialog` es inalcanzable desde la UI | **CONFIRMADO para esta página** | `showCombinar` se declara en `page.tsx:73` y se consume en `:915`, pero **no existe ninguna llamada a `setShowCombinar(true)` en `page.tsx`**. El botón `Combinar Mesas` (`:571-578`) llama a `handleToggleModoCombinar`, que es el modo rápido sobre las tarjetas, no el diálogo. El componente **sí** se usa desde el detalle: `app/app/pos/mesas/[id]/page.tsx:782` (`setShowCombinar(true)`). En el plano está montado permanentemente y nunca se abre. |

#### 7.2 Hallazgos adicionales

| # | Hallazgo | Archivo:línea | Cita |
|---|---|---|---|
| 1 | **Sin Realtime y sin polling.** Cero `.channel(`, cero `postgres_changes`, cero `setInterval` en todo el módulo de mesas. La única actualización es manual (botón `RefreshCw`) o tras cada mutación (`await cargarDatos()`). El README afirma lo contrario. | `app/app/pos/mesas/page.tsx:537-539`; `components/pos/mesas/README.md:7` y `:20` | `"visualizar el estado de las mesas en tiempo real"` / `"Estadísticas en tiempo real"` |
| 2 | **Sin comprobación de permisos.** Cero ocurrencias de `permission`/`hasPermission`/`can(` en `page.tsx` y en `components/pos/mesas/`. Crear, editar, liberar, combinar, mover y renombrar zonas quedan disponibles para cualquier miembro de la organización; la única barrera es RLS. Además todo se ejecuta con el cliente de navegador. | `components/pos/mesas/mesasService.ts:1` | `import { supabase } from '@/lib/supabase/config';` |
| 3 | **`combinarMesas` no filtra por organización.** Sus tres consultas se apoyan solo en RLS; si una política estuviera abierta, bastaría con conocer un UUID de mesa. | `components/pos/mesas/mesasService.ts:595-599`, `:609-612`, `:618-621` | `.from('table_sessions').select('*').in('restaurant_table_id', mesasACombinar)` |
| 4 | **Moneda cableada en el plano y en la tarjeta:** símbolo `$` fijo y `toLocaleString()` sin locale ni moneda de la organización. | `components/pos/mesas/MesaCard.tsx:112`; `components/pos/mesas/MesasFloorMap.tsx:722` | `<span>${mesa.totalAmount.toLocaleString()}</span>` |
| 5 | **Moneda cableada en el historial:** usa `formatCurrency`, que tiene `currency = "COP"` e `Intl.NumberFormat("es-CO")` fijos. | `components/pos/mesas/HistorialMesasDialog.tsx:22`, `:265`, `:364`, `:409`; `utils/Utils.ts:69-85` | `export function formatCurrency(value: ..., currency: string = "COP")` |
| 6 | **Fechas fuera del timezone de la organización.** El historial construye el día calendario con `getFullYear/getMonth/getDate` **del navegador**: «Hoy» es el día del dispositivo, no el de la organización. No usa `todayInTz` ni `useFormatDate()`. | `components/pos/mesas/HistorialMesasDialog.tsx:43-48`, `:77-105` | `return \`${year}-${month}-${day}\`;` |
| 7 | **Formato de fecha con locale cableado**, sin pasar por `formatDateInTz`/`useFormatDate()`. | `components/pos/mesas/HistorialMesasDialog.tsx:50-59` | `new Date(iso).toLocaleString('es-CO', {...})` |
| 8 | **Rango de fechas sin offset.** Se envían cadenas sin zona a un `timestamptz`; Postgres las interpreta con el tz de la sesión, no con el de la organización. | `components/pos/mesas/mesasHistorialService.ts:102-103`, `:174-175`, `:241-242` | `const fromIso = \`${filtros.dateFrom}T00:00:00\`;` |
| 9 | **No hay `toISOString().split('T')[0]` ni `.split('T')[0]`** en el módulo: la regla dura se respeta, pero el tz de la organización sigue sin aplicarse (hallazgos 6-8). | *(verificado por grep sobre `components/pos/mesas/` y `page.tsx`)* | — |
| 10 | **No hay `confirm()` ni `alert()` nativos:** todas las confirmaciones usan `AlertDialog`. | *(verificado por grep)* | — |
| 11 | **Todos los conteos se hacen en el navegador, ninguno con `count` en la BD.** Los 4 KPI recorren el array completo; la paginación es un `slice`; el badge de cada zona cuenta solo la página actual; el historial cuenta `sesiones.length`. | `page.tsx:831`, `:846`, `:861`, `:876`, `:147-151`, `:745`; `HistorialMesasDialog.tsx:288` | `{mesas.filter((m) => m.state === 'free').length}` |
| 12 | **La agrupación por zona se hace sobre la página, no sobre el conjunto.** Con `pageSize=20` y 60 mesas, una zona puede aparecer partida entre páginas o desaparecer de una página entera, y su badge muestra un conteo engañoso. | `page.tsx:702`, `:736`, `:745` | `const mesasZona = mesasPaginadas.filter(m => m.zone === zona);` |
| 13 | **Desfase entre el filtro de estado y lo que pinta la tarjeta.** El filtro `free/occupied/reserved` mira `m.state`; la tarjeta decide el badge por `mesa.session`. Una mesa con `state='free'` y sesión activa se ve «Ocupada» pero se filtra como «Libre», y el KPI «Libres» la cuenta. | `page.tsx:138-142` vs `components/pos/mesas/MesaCard.tsx:18-31` | `if (estadoFiltro === 'bill_requested') return m.session?.status === 'bill_requested'; return m.state === estadoFiltro;` |
| 14 | **`modoCombinar` sobrevive al cambio a vista Mapa.** El toggle Lista/Mapa no lo resetea; en el Mapa los clics siguen seleccionando mesas, pero el contador, el aviso y el botón `Combinar Ahora` viven dentro del bloque `viewMode === 'list'`: quedan invisibles y no hay forma de confirmar ni de cancelar sin volver a Lista. | `page.tsx:527-535` (toggle), `:561-616` (bloque), `:398-401` (toggle de selección) | `{viewMode === 'list' && (` |
| 15 | **El Mapa guarda posiciones de mesas que no está mostrando.** `positions` se acumula y nunca se poda; `handleSave` envía `Object.entries(positions)` completo. Al cambiar de sucursal o de filtro se reescriben coordenadas de mesas ya fuera de pantalla. | `components/pos/mesas/MesasFloorMap.tsx:160-190`, `:423-429` | `const batch = Object.entries(positions).map(([id, pos]) => ({...}))` |
| 16 | **Asimetría `getBranchFilter()` / `getCurrentBranchId()` en las zonas del plano.** Se leen los layouts de todas las sucursales (`getBranchFilter()` puede ser `null`) pero se guardan siempre contra `getCurrentBranchId()`. | `components/pos/mesas/mesasService.ts:274` vs `:308` | `const branchId = getCurrentBranchId();` |
| 17 | **`upsert` con `onConflict` que puede no deduplicar.** Si `branch_id` llegara `null`, el UNIQUE con NULL no colisiona y se insertan filas duplicadas (trampa ya documentada para `stock_levels`). | `components/pos/mesas/mesasService.ts:321-323` | `.upsert(rows, { onConflict: 'organization_id,branch_id,zone_name' })` |
| 18 | **Guardar zonas no da acuse.** `handleSaveZoneLayouts` solo tiene toast de error; en éxito el usuario ve únicamente el de «Posiciones guardadas» del paso anterior. | `page.tsx:470-482` | *(no hay `toast({title:'Zonas guardadas'})`)* |
| 19 | **Error de layouts silenciado.** Si falla la lectura de `restaurant_zone_layouts`, devuelve `{}` y el plano pierde los recuadros de zona sin avisar. | `components/pos/mesas/mesasService.ts:295-298` | `catch (error) { console.error(...); return {}; }` |
| 20 | **`actualizarPosiciones` son N `UPDATE` en paralelo desde Node/navegador**, no una RPC transaccional (convención del repo). Un fallo parcial deja el plano a medias y solo se lanza el primer error. | `components/pos/mesas/mesasService.ts:249-267` | `const results = await Promise.all(promises); const firstError = results.find((r) => r.error);` |
| 21 | **`abrirSesion` no es transaccional y no comprueba el segundo error.** Si el `UPDATE` de `state` falla, queda una sesión activa sobre una mesa marcada como libre. Además el `INSERT` en `table_sessions` no escribe `branch_id`. | `components/pos/mesas/mesasService.ts:399-421` | `await supabase.from('restaurant_tables').update({ state: 'occupied', ... }).eq('id', mesaId);` *(sin `error`)* |
| 22 | **`moverPedido` contiene un `UPDATE` que no hace nada** y una variable de error declarada y jamás comprobada (ESLint `no-unused-vars`). | `components/pos/mesas/mesasService.ts:721-725` | `const { error: ticketsError } = await supabase.from('kitchen_tickets').update({ table_session_id: sesionId }).eq('table_session_id', sesionId);` |
| 23 | **`moverPedido` libera la mesa origen incondicionalmente**, aunque tuviera otras sesiones activas (caso de mesa combinada). | `components/pos/mesas/mesasService.ts:727-728` | `await this.cambiarEstadoMesa(mesaOrigenId, 'free');` |
| 24 | **`liberarMesa` encadena 7 llamadas sin transacción** (leer sesiones, leer comandas, 2 updates de comandas, cerrar sesiones, auditar, liberar mesa). Cualquier corte deja estado inconsistente. | `components/pos/mesas/mesasService.ts:741-826` | — |
| 25 | **`dividirMesa` es código muerto**: definida y nunca invocada en todo `src/`. | `components/pos/mesas/mesasService.ts:637-690` | `static async dividirMesa(` |
| 26 | **Dato sintético que viaja por la UI.** `obtenerMesasConSesiones` fabrica un array de objetos falsos solo para que el diálogo pueda leer `.length`. | `components/pos/mesas/mesasService.ts:168`; consumido en `components/pos/mesas/CombinarMesasDialog.tsx:141` y `:214` | `sale_items: Array(totalItems).fill(null).map((_, i) => ({ id: \`item-${i}\` })) as any` |
| 27 | **Las sesiones no se filtran por sucursal.** Con una sucursal seleccionada se traen igualmente todas las sesiones activas de la organización; se descartan luego al cruzar por mesa. Tráfico y datos de más. | `components/pos/mesas/mesasService.ts:42-46` | `.eq('organization_id', organizationId).in('status', ['active', 'bill_requested'])` |
| 28 | **Prop declarada y nunca pasada:** `MesaCard.isSelected`. El anillo lo dibuja el `div` envolvente. | `components/pos/mesas/MesaCard.tsx:13`, `:16`, `:61` vs `page.tsx:1099` | `<MesaCard mesa={mesa} onClick={!modoCombinar ? onClick : undefined} />` |
| 29 | **Estado declarado y nunca usado:** `mesaSeleccionada` / `setMesaSeleccionada` (ninguna otra referencia en el archivo). | `page.tsx:77` | `const [mesaSeleccionada, setMesaSeleccionada] = useState<string \| null>(null);` |
| 30 | **Tipos declarados y nunca usados:** `CombinarMesasData`, `MoverPedidoData`, `Zone` y el campo `TableWithSession.customerName` (nunca se escribe ni se lee). | `components/pos/mesas/types.ts:43`, `:46-49`, `:60-69` | `customerName?: string;` |
| 31 | **El modo Mapa no tiene estado vacío.** Con `mesasFiltradas` vacío se pinta un lienzo en blanco con rejilla, sin mensaje ni acción. | `page.tsx:550-558`; `components/pos/mesas/MesasFloorMap.tsx:648` | `{mesas.map((mesa) => {` |
| 32 | **Paridad incompleta Mapa ↔ Lista.** En el Mapa no hay menú ⋯, ni «Liberar Mesa», ni «Editar Comensales», ni «Solicitar cuenta», ni filtros propios: solo abrir/navegar. | `components/pos/mesas/MesasFloorMap.tsx:415-418` | `const handleMesaClick = (mesa) => { if (editMode) return; onMesaClick(mesa); };` |
| 33 | **El tiempo de sesión se congela.** `Date.now()` se evalúa en el render y no hay ningún tick: «12 min» sigue diciendo 12 min hasta el siguiente refresco manual. | `components/pos/mesas/MesaCard.tsx:34-45`; `components/pos/mesas/MesasFloorMap.tsx:503-508` | `Math.floor((Date.now() - new Date(mesa.session.opened_at).getTime()) / 60000)` |
| 34 | **Umbral de «mesa olvidada» cableado a 45 minutos**, no configurable por organización ni por plan. | `components/pos/mesas/MesaCard.tsx:48` | `const MINUTOS_MESA_OLVIDADA = 45;` |
| 35 | **`ZonasManager` no permite crear zonas**, solo renombrar y eliminar. La única vía de creación es el select `+ Nueva zona` del formulario de mesa. | `components/pos/mesas/ZonasManager.tsx:84-121`; `components/pos/mesas/MesaFormDialog.tsx:150` | `<SelectItem value="nueva">+ Nueva zona</SelectItem>` |
| 36 | **`MesaFormDialog` no valida nombre duplicado** ni avisa de que al editar no se puede cambiar de sucursal (el selector solo aparece al crear y `actualizarMesa` no toca `branch_id`). | `components/pos/mesas/MesaFormDialog.tsx:103`; `components/pos/mesas/mesasService.ts:224-237` | `{!mesa && (<BranchSelectorField ... />)}` |
| 37 | **El historial cruza `ops_audit_log` con las sesiones en el navegador**, después de traerse todos los eventos del rango de la organización. Con volumen, es una descarga innecesaria y un cruce O(n) en cliente. | `components/pos/mesas/mesasHistorialService.ts:190-192`, `:257-259` | `const relevant = data.filter((row: any) => sessionIdSet.has(row.metadata?.table_session_id));` |
| 38 | **README desactualizado.** Documenta `id: integer (PK)` cuando en `types.ts` son UUID; promete tiempo real inexistente; lista `eliminarMesa` y `dividirMesa` como API viva; y no menciona el modo Mapa, el Historial, `restaurant_zone_layouts`, `rotation` ni `ops_audit_log`. | `components/pos/mesas/README.md:101`, `:110`, `:120-135` vs `components/pos/mesas/types.ts:8`, `:23` | `- id: integer (PK)` |

### 8. Conteo de controles

| Subsección | Controles |
|---|---|
| 1. Cabecera y acciones globales | 15 |
| 2. Modo Mapa (`MesasFloorMap.tsx`) | 32 |
| 3. Modo Lista (filtros, vacío, tarjeta, menú ⋯, paginación) | 36 |
| 4. Modo Combinar | 9 |
| 5.1 `MesaFormDialog` | 13 |
| 5.2 `ZonasManager` | 16 |
| 5.3 `MoverPedidoDialog` | 9 |
| 5.4 `CombinarMesasDialog` *(inalcanzable desde el plano)* | 10 |
| 5.5 `HistorialMesasDialog` | 22 |
| 5.6 Abrir mesa / editar comensales / liberar / eliminar | 24 |
| **Total** | **186** |

De los 186, **4 son inalcanzables** desde esta página (diálogo `¿Eliminar mesa?` con sus dos botones y su toast, controles 183-186) y **10 más** pertenecen a `CombinarMesasDialog` (131-140), montado pero nunca abierto desde `/app/pos/mesas`. Controles realmente operables: **172**.

---

## B. Mesas — detalle `/app/pos/mesas/[id]`


Auditoría control por control, solo lectura de código. Rutas relativas a `src/`.
Archivo raíz: `app/app/pos/mesas/[id]/page.tsx` (1984 líneas).
Componentes: `components/pos/mesas/id/*`.

---

### 1. Cabecera del detalle (MesaDetailHeader)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | `Volver` (icono `ArrowLeft`; texto oculto en móvil: `hidden sm:inline`) | `router.push('/app/pos/mesas')` | Siempre | components/pos/mesas/id/MesaDetailHeader.tsx:36-44 |
| 2 | texto | `{mesaNombre}` | Nombre de la mesa; sale de `session.restaurant_tables.name` o, sin sesión, de una consulta directa a `restaurant_tables` | Siempre | MesaDetailHeader.tsx:48-50 · page.tsx:166-189 |
| 3 | badge | `Cuenta Solicitada` (variant `warning`) | Estado de la sesión cuando `session.status === 'bill_requested'` | Con sesión en ese estado | page.tsx:1478-1480 |
| 4 | badge | `Activa` (variant `default`) | Estado de la sesión en cualquier otro caso con sesión | Con sesión activa | page.tsx:1481 |
| 5 | badge | `Disponible` (variant `secondary`) | Mesa sin sesión abierta | `session === null` | MesaDetailHeader.tsx:51 |
| 6 | texto | `{session.restaurant_tables.zone}` | Zona de la mesa | Solo si la mesa tiene zona | MesaDetailHeader.tsx:53-57 |
| 7 | botón | *(sin etiqueta: solo icono `RefreshCw`)* | Recarga los datos de la mesa (`cargarDatos`) | Siempre | MesaDetailHeader.tsx:62-69 · page.tsx:1568 |
| 8 | botón | `Historial` | Abre `SessionTimelineDialog` (`setShowHistorial(true)`) | Siempre | MesaDetailHeader.tsx:70-78 · page.tsx:1571 |
| 9 | botón | `Combinar Mesa` / `Combinar` (móvil) | Carga todas las mesas (`MesasService.obtenerMesasConSesiones`) y abre `CombinarMesasDialog` | Siempre | MesaDetailHeader.tsx:79-88 · page.tsx:778-791 |
| 10 | botón | `Agregar Producto` / `Agregar` (móvil) | Abre `AddProductDialog` | Siempre | MesaDetailHeader.tsx:89-97 · page.tsx:1570 |
| 11 | diálogo | *(CombinarMesasDialog)* | Combina la mesa actual con otras; si la mesa actual queda combinada, redirige a la principal | Al pulsar `Combinar Mesa` | page.tsx:1812-1817 · page.tsx:793-822 |
| 12 | estado | *(skeleton de carga)* | Cabecera, 4 tarjetas y 3 líneas en `animate-pulse` mientras `isLoading` | Primera carga y recargas no silenciosas | page.tsx:1497-1539 |
| 13 | toast | `Error` — `No se pudieron cargar los detalles de la mesa` | Fallo de `PedidosService.obtenerDetalleMesa` | Error de carga | page.tsx:297-301 |
| 14 | toast | `Error` — `No se pudieron cargar las mesas` | Fallo al cargar mesas para combinar | Error en `Combinar Mesa` | page.tsx:785-789 |
| 15 | toast | `Mesas combinadas` — `Las mesas se han combinado exitosamente` | Confirmación de combinación | Tras combinar | page.tsx:799-802 |

**Subtotal: 15 controles.**

---

### 2. Tarjetas de estadísticas (MesaStatsCards)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 16 | stat | `Comensales` | Muestra `session.customers` (0 sin sesión). Toda la tarjeta es clicable | Siempre | MesaStatsCards.tsx:132-150 · page.tsx:1589 |
| 17 | botón | *(icono `Edit2` dentro de la tarjeta `Comensales`)* | `handleAbrirEditarComensales` → abre el diálogo `Editar Comensales` | Siempre (no se deshabilita sin sesión) | MesaStatsCards.tsx:148 · page.tsx:824-829 |
| 18 | stat | `Tiempo` | Antigüedad de la sesión | Siempre | MesaStatsCards.tsx:152-166 |
| 19 | cálculo | *(valor de `Tiempo`)* | `Math.floor((Date.now() - new Date(session.opened_at)) / 60000)`; `< 60` → `` `${diff} min` ``; si no → `` `${horas}h ${minutos}m` ``. Devuelve `''` sin `opened_at`. **No se recalcula solo**: no hay `setInterval` ni Realtime sobre la sesión, solo se refresca al re-renderizar la página | Siempre | page.tsx:1462-1473 |
| 20 | stat | `Items` | Cantidad de líneas **no pagadas** (`items.length`, filtradas por `!paid_at`) | Siempre | MesaStatsCards.tsx:168-182 · page.tsx:1543, 1591 |
| 21 | stat | `Total` | `formatCurrency(total)`; usa los totales del hook `useMesaTaxes` si ya calculó, si no el fallback de items | Siempre | MesaStatsCards.tsx:184-198 · page.tsx:1556-1558 |
| 22 | stat | `Mesero` | `serverName` o `Sin asignar`. Se resuelve consultando `profiles` por `session.server_id` | Siempre | MesaStatsCards.tsx:200-215 · page.tsx:217-233 |
| 23 | botón | *(icono `Edit2` dentro de la tarjeta `Mesero`)* | `handleAbrirEditarMesero` → carga miembros y abre `Asignar Mesero` | Solo si llega `onEditarMesero` (siempre desde esta página) | MesaStatsCards.tsx:216-218 · page.tsx:858-863 |
| 24 | diálogo | `Editar Comensales` | Cambia `table_sessions.customers` | Al pulsar la tarjeta `Comensales` | page.tsx:1842-1919 |
| 25 | campo | `Cantidad de comensales` (`type="number"`, `min=1`, `max=99`, `autoFocus`) | Valor de comensales | En el diálogo | page.tsx:1853-1868 |
| 26 | atajo | `Enter` sobre el campo de comensales | Ejecuta `handleGuardarComensales` | En el diálogo | page.tsx:1863-1867 |
| 27 | texto | `Ingresa la cantidad de personas en la mesa` | Ayuda del campo | En el diálogo | page.tsx:1869-1871 |
| 28 | botón | `1` `2` `3` `4` `5` | Fija el número de comensales | En el diálogo | page.tsx:1875-1887 |
| 29 | botón | `6` `7` `8` `9` `10` | Fija el número de comensales | En el diálogo | page.tsx:1888-1900 |
| 30 | botón | `Cancelar` | Cierra el diálogo sin guardar | En el diálogo | page.tsx:1904-1909 |
| 31 | botón | `Guardar` (deshabilitado si `comensalesInput < 1`) | `PedidosService.actualizarComensales` + recarga | En el diálogo | page.tsx:1910-1916 · pedidosService.ts:714-735 |
| 32 | toast | `Comensales actualizados` — `Ahora hay {n} comensales en la mesa` | Confirmación | Tras guardar | page.tsx:894-897 |
| 33 | diálogo | `Asignar Mesero` | Cambia `server_id` de la sesión | Al pulsar la tarjeta `Mesero` | page.tsx:1922-1959 |
| 34 | campo | `Mesero` — `SearchSelect`, placeholder `Selecciona un mesero` / `Cargando miembros...`, búsqueda `Buscar por nombre o correo...` | Elige un miembro de la organización (RPC `get_profiles_by_organization`) | En el diálogo | page.tsx:1932-1940 · page.tsx:831-856 |
| 35 | botón | `Cancelar` | Cierra sin guardar | En el diálogo | page.tsx:1944-1949 |
| 36 | botón | `Guardar` (deshabilitado si no hay mesero elegido) | `MesasService.cambiarMesero` | En el diálogo | page.tsx:1950-1956 |
| 37 | toast | `Mesero actualizado` — `{nombre} asignado a la mesa` | Confirmación | Tras guardar | page.tsx:873-876 |

**Subtotal: 22 controles.**

---

### 3. Pedido actual y líneas (OrderItemCard)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 38 | texto | `Pedido Actual` | Encabezado de la tarjeta de pedido | Siempre | page.tsx:1601-1603 |
| 39 | texto | `{n} producto/productos pendiente{s}` | Conteo de líneas no pagadas | Siempre | page.tsx:1605-1607 |
| 40 | texto | `• {n} pagado{s} ({importe})` | Conteo e importe de líneas ya pagadas | Solo si hay items con `paid_at` | page.tsx:1608-1612 |
| 41 | estado | `No hay productos en el pedido` | Vacío del pedido | `items.length === 0` | page.tsx:1617-1624 |
| 42 | botón | `Agregar Primer Producto` | Abre `AddProductDialog` | Solo en el estado vacío | page.tsx:1625-1631 |
| 43 | texto | `{item.product.name}` / `Producto` | Nombre de la línea (fallback literal `Producto`) | Por línea | OrderItemCard.tsx:157-159 |
| 44 | badge | `👤 Comensal {n}` | Comensal asignado (de `notes.guest_number`) | Si la línea trae `guest_number` | OrderItemCard.tsx:160-164 |
| 45 | badge | `{atributo}: {valor}` | Variante elegida (de `product.variant_data`) | Si el producto es variante | OrderItemCard.tsx:166-174 |
| 46 | badge | `{modificador}` / `{modificador} (+{importe})` | Modificadores elegidos (de `notes.modifiers`) | Si la línea trae modificadores | OrderItemCard.tsx:175-183 |
| 47 | estado | `Pendiente en cocina` (icono `Clock`, amarillo) | Estado `pending` del **último** `kitchen_ticket_items` de la línea | Con comanda creada | OrderItemCard.tsx:75, 184-189 |
| 48 | estado | `En preparación` (icono `ChefHat`, naranja) | Estado `in_progress` | Ídem | OrderItemCard.tsx:76 |
| 49 | estado | `¡Listo para servir!` (icono `CheckCircle`, verde, `animate-pulse`) | Estado `ready` | Ídem | OrderItemCard.tsx:77 |
| 50 | estado | `Entregado` (icono `Check`, gris) | Estado `delivered` | Ídem | OrderItemCard.tsx:78 |
| 51 | texto | `📝 {nota}` | Nota libre de la línea (`notes.extra` o `notes` como string) | Si hay nota | OrderItemCard.tsx:190-194 |
| 52 | texto | `{importe} c/u` | Precio unitario | Por línea | OrderItemCard.tsx:197-199 |
| 53 | cálculo | `{item.total}` | Total de la línea, **leído tal cual de `sale_items.total`** (no se recalcula en el navegador) | Por línea | OrderItemCard.tsx:205-207 |
| 54 | texto | `Cant: {n}` | Cantidad actual | Modo lectura | OrderItemCard.tsx:243-245 |
| 55 | botón | *(icono `Edit2`)* | Entra en modo edición de cantidad | Modo lectura, si no hay operación en curso | OrderItemCard.tsx:246-253 |
| 56 | campo | *(input numérico de cantidad, `min="1"`, ancho `w-16`)* | Nueva cantidad | Modo edición | OrderItemCard.tsx:213-220 |
| 57 | botón | *(icono `Check` verde)* | Guarda: `PedidosService.actualizarCantidadItem` (prorratea el impuesto por unidad) | Modo edición | OrderItemCard.tsx:221-228 · pedidosService.ts:621-656 |
| 58 | botón | *(icono `X` rojo)* | Cancela la edición y restaura la cantidad | Modo edición | OrderItemCard.tsx:229-239 |
| 59 | botón | `Transferir` | Abre `TransferItemDialog` con la línea | Siempre (`onTransfer` llega desde la página) | OrderItemCard.tsx:260-269 · page.tsx:1642-1645 |
| 60 | botón | *(icono `Trash2` rojo)* | Abre la confirmación de borrado | Siempre | OrderItemCard.tsx:270-277 |
| 61 | diálogo | `¿Eliminar item?` — `¿Seguro que deseas eliminar «{producto}» del pedido?` | Confirmación de borrado | Al pulsar la papelera | OrderItemCard.tsx:282-289 |
| 62 | botón | `Cancelar` | Cierra la confirmación | En la confirmación | OrderItemCard.tsx:291 |
| 63 | botón | `Eliminar` / `Eliminando...` | `PedidosService.eliminarItem` (borra `kitchen_ticket_items`, registra en `ops_audit_log` y recalcula la venta) | En la confirmación | OrderItemCard.tsx:292-298 · pedidosService.ts:509-566 |
| 64 | imagen | *(imagen del producto o icono `Package`)* | Imagen primaria del producto, con fallback a las del producto padre si es variante | Por línea | OrderItemCard.tsx:111-152 · pedidosService.ts:95-131 |
| 65 | texto | `Items Pagados ({n})` | Encabezado de la sección de líneas pagadas | Si hay items con `paid_at` | page.tsx:1655-1658 |
| 66 | tabla | *(lista de items pagados: nombre, `{cant} × {precio}`, total, `✓ Pagado`)* | Solo lectura: sin editar, transferir ni eliminar | Si hay items con `paid_at` | page.tsx:1660-1682 |
| 67 | toast | `Cantidad actualizada` / `Item eliminado` / `Item transferido` | Confirmaciones de las acciones por línea | Tras cada acción | page.tsx:442-445, 467-470, 763-766 |

**Estados de ítem realmente distinguibles aquí:** `pendiente en cocina` · `en preparación` · `listo` · `entregado` (los cuatro de `kitchen_ticket_items.status`) y `pagado` (`sale_items.paid_at`, que saca la línea de la lista editable). **No existe un estado visible «enviado a cocina»**: `printed_at` del ticket no se refleja por línea; un ítem recién creado y uno ya impreso se ven ambos como `Pendiente en cocina`. Tampoco se muestra la **estación** de cada línea aunque se guarda (`kitchen_ticket_items.station`, pedidosService.ts:439). El estado de cocina se toma del **último** elemento del array (`kitchenItems[kitchenItems.length - 1]`, OrderItemCard.tsx:43-51).

**Subtotal: 30 controles.**

---

### 4. Barra de acciones (MesaActionsSidebar)

| # | Tipo | Etiqueta exacta | Qué hace | Condición exacta de habilitación | Archivo:línea |
|---|---|---|---|---|---|
| 68 | texto | `Cliente` | Encabezado de la tarjeta de cliente | Siempre | MesaActionsSidebar.tsx:110-113 |
| 69 | campo | *(CustomerSelector)* | Asigna cliente y, si aplica, habitación/folio; actualiza `sales.customer_id` y `sales.reservation_id` | Siempre | MesaActionsSidebar.tsx:116-120 · page.tsx:1389-1460 |
| 70 | texto | `Resumen de Cuenta` | Encabezado del resumen | Siempre | MesaActionsSidebar.tsx:127-130 |
| 71 | cálculo | `Subtotal` | `calculatedTaxTotals.subtotal` del hook, o fallback `Σ unit_price × quantity` de items no pagados | Siempre | MesaActionsSidebar.tsx:134-139 · page.tsx:1552, 1556 |
| 72 | cálculo | `Total` | `calculatedTaxTotals.total`, o fallback `Σ item.total` | Siempre | MesaActionsSidebar.tsx:145-150 · page.tsx:1551, 1558 |
| 73 | botón | `Enviar a Cocina` | `PedidosService.enviarComandaCocina` (marca `printed_at`) + impresión física consolidada o fallback navegador | **Deshabilitado si `!itemsCount`** (cero líneas pendientes). No comprueba si ya se envió: puede reimprimirse siempre que haya tickets sin `printed_at` | MesaActionsSidebar.tsx:158-166 · page.tsx:675-753 |
| 74 | badge | `Enviado correctamente` / `Error al enviar` | Resultado de la comanda; se borra a los 4 s | Tras pulsar `Enviar a Cocina` | MesaActionsSidebar.tsx:76-94, 167-180 |
| 75 | botón | `Ver Pre-Cuenta` | `PedidosService.generarPreCuenta` + abre `PreCuentaDialog` + imprime (cola física o navegador) | **Deshabilitado si `!itemsCount`** | MesaActionsSidebar.tsx:184-192 · page.tsx:604-630 |
| 76 | badge | `Impresión exitosa` / `Error de impresión` | Resultado de la pre-cuenta; 4 s | Tras pulsar `Ver Pre-Cuenta` | MesaActionsSidebar.tsx:193-206 |
| 77 | botón | `Solicitar Cuenta` | `PedidosService.solicitarCuenta` → `status='bill_requested'`; si `customers > 1` abre `SplitBillDialog`, si no abre el checkout | **Deshabilitado si `sessionStatus === 'bill_requested'` o `!itemsCount`** | MesaActionsSidebar.tsx:209-217 · page.tsx:632-673 |
| 78 | botón | `Dividir Cuenta ({customers} comensales)` | Abre `SplitBillDialog` | **Deshabilitado si `!itemsCount` o `customers < 2`**; solo visible si `billSplits === null` | MesaActionsSidebar.tsx:222-231 |
| 79 | texto | `✓ Cuenta dividida en {n} partes` | Resumen de la división vigente | Con `billSplits` | MesaActionsSidebar.tsx:236-238 |
| 80 | botón | `Cancelar división` | Borra `billSplits` y `paidSplitIds` | Con `billSplits` | MesaActionsSidebar.tsx:239-246 · page.tsx:1195-1203 |
| 81 | tabla | `{split.name}: {importe}` | Línea por comensal de la división | Con `billSplits`, solo los de total > 0 | MesaActionsSidebar.tsx:248-255 |
| 82 | estado | `{n} producto(s) sin asignar` + `Total: {importe}` + `Divide la cuenta nuevamente para incluirlos` | Avisa de líneas añadidas después de dividir | `billSplits` y `unassignedItemsCount > 0` | MesaActionsSidebar.tsx:259-276 |
| 83 | botón | `⚠️ Dividir de Nuevo (REQUERIDO)` / `Modificar división` | Vuelve a abrir `SplitBillDialog` | Con `billSplits`; sin condición de deshabilitado | MesaActionsSidebar.tsx:278-287 |
| 84 | botón | `Procesar Pago` / `Procesar Pagos Divididos` / `Divide de Nuevo para Continuar` | Sin división: abre `CheckoutDialog`. Con división: abre `SplitPaymentSelector` | **Deshabilitado si `!itemsCount`, o (`billSplits` y `unassignedItemsCount > 0`), o `!cashSessionActive`** | MesaActionsSidebar.tsx:293-305 · page.tsx:1048-1080 |
| 85 | texto | `Debe abrir una caja antes de procesar el pago` | Explica el deshabilitado por caja cerrada | `!cashSessionActive` (`VentasService.getCurrentCashSession`) | MesaActionsSidebar.tsx:306-310 · page.tsx:191-198 |
| 86 | botón | `Liberar Mesa` | Abre la confirmación `¿Liberar mesa …?` | **Siempre habilitado**, incluso sin sesión y con líneas sin pagar | MesaActionsSidebar.tsx:315-322 · page.tsx:1721 |
| 87 | diálogo | `¿Liberar mesa {mesaNombre}?` — `Esta acción cerrará la sesión activa de la mesa y marcará las comandas pendientes como entregadas. ¿Deseas continuar?` | Confirmación | Al pulsar `Liberar Mesa` | page.tsx:1962-1970 |
| 88 | botón | `Cancelar` | Cierra la confirmación | En la confirmación | page.tsx:1972 |
| 89 | botón | `Sí, liberar mesa` | `MesasService.liberarMesa(tableId)` + `router.push('/app/pos/mesas')` | En la confirmación | page.tsx:1973-1978 · page.tsx:910-928 |
| 90 | toast | `Sin productos` — `No hay productos para generar la cuenta` / `…para solicitar la cuenta` / `…para dividir` / `Agrega productos antes de procesar el pago` | Guardas redundantes con los `disabled` | Al invocar con cero líneas | page.tsx:608-613, 636-641, 1156-1161, 1050-1055 |
| 91 | toast | `Divide la cuenta nuevamente` — `Hay {n} producto(s) por {importe} sin asignar…` | Bloquea el checkout dividido | Con `billSplits` y líneas sin asignar | page.tsx:1068-1072 |
| 92 | indicador | `{split.name}` + `{n} de {m} pagados \| {importe}` | Chip fijo arriba a la derecha durante el pago dividido | `showCheckout && billSplits` | page.tsx:1797-1809 |

**Subtotal: 25 controles.**

---

### 5. AddProductDialog

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 93 | diálogo | `Agregar Productos` (prop `title`, valor por defecto) | Modal a pantalla completa montado con `createPortal` (no usa Radix `Dialog`) | `open` | AddProductDialog.tsx:53, 402-417 |
| 94 | botón | *(X de cierre, esquina superior derecha)* | `handleClose(false)`: vacía carrito, búsqueda y categoría | Siempre | AddProductDialog.tsx:411-415, 354-365 |
| 95 | botón | *(clic en el fondo oscuro)* | Cierra el diálogo | Siempre | AddProductDialog.tsx:404 |
| 96 | atajo | `Escape` | Cierra el diálogo salvo si el selector de variantes está abriéndose | Con el diálogo abierto | AddProductDialog.tsx:389-398 |
| 97 | campo | `Buscar por nombre, SKU, código de barras, variantes o modificadores...` | Búsqueda servidor (`POSService.getProductsPaginated`), debounce de 300 ms, `limit: 200` | Siempre | AddProductDialog.tsx:423-428, 91-96, 131-138 |
| 98 | chip | *(CategoryFilterBar: categorías de la organización)* | Filtra por `category_id`; modo y orden salen de `ConfiguracionService.getCategoriesDisplayConfig()` | Siempre | AddProductDialog.tsx:434-440, 121-128 |
| 99 | estado | *(8 skeletons de tarjeta)* | Carga de productos | `isLoadingProducts` | AddProductDialog.tsx:446-460 |
| 100 | estado | `No se encontraron productos` | Vacío del catálogo filtrado | Sin resultados | AddProductDialog.tsx:461-467 |
| 101 | botón | *(tarjeta de producto completa)* | Con variantes o modificadores abre `VariantSelectorDialog`; si no, `addToCart` directo. Bloqueada si `is_out_of_stock` | Por producto | AddProductDialog.tsx:480-495, 143-157 |
| 102 | badge | `Agotado` | Producto sin stock; la tarjeta queda `cursor-not-allowed` | `is_out_of_stock` | AddProductDialog.tsx:513-517 |
| 103 | badge | `-{n}%` | Descuento calculado `1 - price/compare_price` | `compare_price > price` | AddProductDialog.tsx:519-523 |
| 104 | badge | `{n} var.` | Número de variantes | `has_variants && variant_count > 0` | AddProductDialog.tsx:525-532 |
| 105 | badge | `Personalizable` | Producto simple con modificadores | `has_modifiers` sin variantes | AddProductDialog.tsx:534-541 |
| 106 | badge | *(contador azul con la cantidad en carrito)* | Unidades ya añadidas | Producto en el carrito | AddProductDialog.tsx:542-546 |
| 107 | badge | `Incluido` | Producto ya incluido (prop `includedProductIds`) | **Nunca en esta página**: el detalle de mesa no pasa `includedProductIds` | AddProductDialog.tsx:547-551 · page.tsx:1728-1734 |
| 108 | badge | `Top` | Más vendido en 90 días | `sales_count_90d > 0` | AddProductDialog.tsx:553-561 |
| 109 | tooltip | `{n} unidades vendidas en los últimos 90 días` | Atributo `title` del badge `Top` | Al pasar el cursor | AddProductDialog.tsx:556 |
| 110 | botón | *(estrella)* `Agregar a favoritos` / `Quitar de favoritos` (`aria-label` y `title`) | `POSService.toggleProductFavorite` con actualización optimista y reversión | Por producto; deshabilitado mientras está en curso | AddProductDialog.tsx:563-577, 198-238 |
| 111 | texto | `{product.name}` + descripción | Identificación del producto | Por producto | AddProductDialog.tsx:582-589 |
| 112 | texto | `Desde {precio}` / `{precio}` | Precio; `Desde` solo con variantes. Precio tachado si hay `compare_price` | Por producto | AddProductDialog.tsx:591-603 |
| 113 | texto | `{product.sku}` | SKU en monoespaciada | Si el producto tiene SKU | AddProductDialog.tsx:605-609 |
| 114 | botón | *(icono `ChefHat`)* `Ver receta de producción` (`aria-label` y `title`) | Abre el diálogo de receta (`recipeService.getRecipeById`); no añade al carrito | `has_recipe && recipe_id` | AddProductDialog.tsx:610-620, 175-193 |
| 115 | diálogo | *(VariantSelectorDialog)* | Elige variante y modificadores; la variante hereda estación y `requires_preparation` del padre | Producto con variantes o modificadores | AddProductDialog.tsx:867-884, 160-171 |
| 116 | diálogo | `Receta de producción` | Ficha de la receta: `Producto`, `SKU:`, `Rendimiento`, `Estado` (`Activa`/`Inactiva`), `Versión`, `Notas`, `Ingredientes ({n})`, badge `Opcional` | Al pulsar el icono de receta | AddProductDialog.tsx:886-1009 |
| 117 | texto | `Carrito` + badge `{n} producto/productos` | Panel derecho | Siempre | AddProductDialog.tsx:636-641 |
| 118 | estado | `Carrito vacío` / `Selecciona productos para agregar` | Carrito sin líneas | `cart.size === 0` | AddProductDialog.tsx:645-652 |
| 119 | botón | *(icono `X` por línea del carrito)* | `removeFromCart` | Por línea | AddProductDialog.tsx:664-671 |
| 120 | badge | `{atributo}: {valor}` | Variante elegida en la línea | Si la línea tiene `variant_data` | AddProductDialog.tsx:674-682 |
| 121 | badge | `{modificador} (+{importe})` | Modificadores elegidos | Si la línea tiene modificadores | AddProductDialog.tsx:684-692 |
| 122 | botón | *(icono `Minus`)* | Resta 1; con 0 elimina la línea | Por línea | AddProductDialog.tsx:695-704, 280-292 |
| 123 | campo | *(input numérico de cantidad, `min="1"`)* | Cantidad exacta | Por línea | AddProductDialog.tsx:705-716 |
| 124 | botón | *(icono `Plus`)* | Suma 1 | Por línea | AddProductDialog.tsx:717-726 |
| 125 | cálculo | `{cantidad × precio unitario}` | Total de la línea del carrito, en el navegador | Por línea | AddProductDialog.tsx:727-729 |
| 126 | toggle | `Comensal:` + botones `1`…`{comensales}` + `General` | Asigna `guest_number` a la línea | Solo si `comensales > 1` | AddProductDialog.tsx:732-765 |
| 127 | campo | `Notas...` (`RichTextEditor`, HTML) | Nota de cocina por línea; se guarda en `sale_items.notes.extra` | Por línea | AddProductDialog.tsx:767-775 |
| 128 | toggle | `Cargar a Habitación` / `Pagar Ahora` | `chargeType` para la integración con folios del PMS | Solo con `selectedRoom.folio_id` | AddProductDialog.tsx:785-823 |
| 129 | texto | `Habitación: {space_label}` | Habitación vinculada | Solo con folio | AddProductDialog.tsx:787-789 |
| 130 | cálculo | `Total:` | `Σ cantidad × unit_price` del carrito | Siempre | AddProductDialog.tsx:322-325, 825-830 |
| 131 | botón | `Cancelar` | Cierra y vacía | Deshabilitado mientras `isSubmitting` | AddProductDialog.tsx:833-840 |
| 132 | botón | `Agregar al Pedido` / `Agregando...` (prop `submitLabel`) | `PedidosService.agregarProductos` + sincronización con folio | **Deshabilitado si `cart.size === 0` o `isSubmitting`** | AddProductDialog.tsx:841-857, 328-351 |
| 133 | toast | `Producto sin precio` — `Este producto no tiene precio configurado` | Bloquea añadir productos con `price === 0` | Al pulsar un producto sin precio | AddProductDialog.tsx:243-250 |
| 134 | toast | `Agregado a favoritos` / `Quitado de favoritos` | Confirmación del favorito (1,8 s) | Tras alternar favorito | AddProductDialog.tsx:215-221 |
| 135 | toast | `Productos agregados` — con tres variantes de descripción según folio y `chargeType` | Confirmación de alta de líneas | Tras agregar | page.tsx:413-420 |

**Subtotal: 43 controles.**

---

### 6. PreCuentaDialog

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 136 | diálogo | `Pre-Cuenta - {tableName}` | Modal de pre-cuenta | Tras `Ver Pre-Cuenta` | PreCuentaDialog.tsx:57-70 |
| 137 | texto | `{n} productos` | Conteo de líneas de la pre-cuenta | Siempre | PreCuentaDialog.tsx:66-68 |
| 138 | texto | *(descripción `sr-only`)* `Resumen de la cuenta de {tableName} con {n} productos antes de procesar el pago.` | Accesibilidad | Siempre | PreCuentaDialog.tsx:71-73 |
| 139 | texto | `Detalle del Pedido` | Encabezado de líneas | Siempre | PreCuentaDialog.tsx:79-81 |
| 140 | tabla | *(línea: nombre, `{cant} × {precio}`, variantes, modificadores, `👤 Comensal {n}`, `📝 {nota}`, total)* | Detalle por línea | Por línea | PreCuentaDialog.tsx:82-126 |
| 141 | cálculo | `Subtotal:` | `Σ unit_price × quantity` de **todos** los items de la mesa | Siempre | PreCuentaDialog.tsx:133-138 · pedidosService.ts:670-673 |
| 142 | cálculo | `Descuentos:` | `Σ discount_amount`; solo si > 0 | Si hay descuentos | PreCuentaDialog.tsx:140-147 |
| 143 | cálculo | `Impuestos:` | `Σ sale_items.tax_amount` (el valor guardado en BD, **no** el del hook `useMesaTaxes`) | Si > 0 | PreCuentaDialog.tsx:149-156 · pedidosService.ts:674 |
| 144 | cálculo | `Total:` | `subtotal + impuestos - descuentos` | Siempre | PreCuentaDialog.tsx:160-165 |
| 145 | texto | `📅 {fecha y hora}` | `new Date().toLocaleString('es-CO', …)` — instante de render, sin zona horaria de la organización | Siempre | PreCuentaDialog.tsx:171-174 |
| 146 | texto | `Esta es una pre-cuenta. El cobro se realizará al cerrar la mesa.` | Aviso | Siempre | PreCuentaDialog.tsx:176-178 |
| 147 | texto | `{tipo} · {dirección}` + `Conductor: {nombre}` | Datos de domicilio | **Nunca aquí**: el detalle de mesa no pasa `deliveryInfo` | PreCuentaDialog.tsx:181-193 · page.tsx:1736-1751 |
| 148 | toggle | *(ElectronicInvoiceToggle)* + etiqueta `Global` | Marca `sendToFactus`; se fuerza a `true` y se deshabilita si la organización tiene la preferencia global activa | `showEInvoiceOption` (por defecto `true`) | PreCuentaDialog.tsx:196-212, 45-52 |
| 149 | botón | `Imprimir` | `imprimirPreCuenta(preCuenta, true)`: salta la cola física y va directo al PDF del navegador | Si llega `onPrint` | PreCuentaDialog.tsx:217-222 · page.tsx:1741, 524-602 |
| 150 | botón | `Dividir Cuenta` | Cierra la pre-cuenta y abre `SplitBillDialog` | Solo si `customers > 1` | PreCuentaDialog.tsx:223-228 · page.tsx:1746-1749 |
| 151 | botón | `Cerrar` | Cierra el diálogo | Siempre | PreCuentaDialog.tsx:229-231 |
| 152 | botón | `Procesar Pago` | Llama `onGenerateBill(sendToFactus)` | Si llega `onGenerateBill` | PreCuentaDialog.tsx:233-238 |

**Impresión.** `imprimirPreCuenta` (page.tsx:524-602) arma los datos del negocio una sola vez (nombre, NIT, teléfono, dirección, correo, ciudad, logo, responsabilidades fiscales) y los de la sucursal; con `branch_id` y sin `forcePDF` intenta `PrintJobsService.enqueuePreCuenta` (page.tsx:549-583) y, si `enqueued > 0`, termina ahí; si no, cae a `PrintService.printPreCuenta` pasando el `timezone` de la organización (page.tsx:589-601). El botón `Ver Pre-Cuenta` imprime **automáticamente** al abrir el diálogo (page.tsx:620).

**`sendToFactus`: CONFIRMADO que se ignora.** `PreCuentaDialog` mantiene el estado y lo pasa al pulsar `Procesar Pago` — `onClick={() => onGenerateBill(sendToFactus)}` (PreCuentaDialog.tsx:234) — pero el detalle de mesa registra `onGenerateBill={() => { setShowPreCuenta(false); setShowCheckout(true); }}` (page.tsx:1742-1745): la función **no declara parámetro** y el valor se descarta. El `CheckoutDialog` se abre sin ninguna indicación de factura electrónica y `PedidosService.completarVentaMesa` no recibe ni usa ningún campo equivalente (pedidosService.ts:885-907). Es decir: marcar el toggle en la pre-cuenta de una mesa no tiene ningún efecto.

**Subtotal: 17 controles.**

---

### 7. SplitBillDialog + SplitPaymentSelector

#### SplitBillDialog

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 153 | diálogo | `Dividir Cuenta` | Modal de división | Desde el sidebar, la pre-cuenta o `Solicitar Cuenta` con `customers > 1` | SplitBillDialog.tsx:194-208 |
| 154 | texto | `Total a dividir: {importe}` | Total recibido por prop | Siempre | SplitBillDialog.tsx:204-206 |
| 155 | pestaña | `Por Items` | Modo de asignación línea a línea | Siempre | SplitBillDialog.tsx:213-216 |
| 156 | pestaña | `Equitativo` | Modo de reparto a partes iguales | Siempre | SplitBillDialog.tsx:217-220 |
| 157 | pestaña | `Personalizado` | Modo de montos libres | Siempre | SplitBillDialog.tsx:221-224 |
| 158 | texto | `Items de la cuenta` + badge `{n} productos` | Encabezado del panel izquierdo | Pestaña `Por Items` | SplitBillDialog.tsx:232-240 |
| 159 | badge | `Asignado: {a}/{b}` | Unidades asignadas de la línea; pasa a `default` al completarse | Por línea | SplitBillDialog.tsx:259-264 |
| 160 | campo | *(input numérico por línea, `min="0"`, `max={restante}`, placeholder `0`)* | Unidades a asignar al comensal activo | Por línea | SplitBillDialog.tsx:273-286 |
| 161 | atajo | `Enter` en ese input | Asigna la cantidad y limpia el campo | Por línea | SplitBillDialog.tsx:279-285 |
| 162 | botón | `Asignar` | Asigna la cantidad escrita al comensal activo | **Deshabilitado si `remaining === 0`** | SplitBillDialog.tsx:287-301, 104-123 |
| 163 | texto | `Comensales` | Encabezado del panel de comensales | Pestaña `Por Items` | SplitBillDialog.tsx:312-315 |
| 164 | botón | *(tarjeta `Comensal {n}` con `{n} items` y su total)* | Selecciona el comensal activo (`ring-2 ring-blue-500`) | Una por comensal (`comensales` de la sesión) | SplitBillDialog.tsx:317-350, 64-76 |
| 165 | cálculo | `Total asignado` | `Σ split.total` | Pestaña `Por Items` | SplitBillDialog.tsx:353-362, 161-163 |
| 166 | cálculo | `Falta: {importe}` | `total - totalAsignado` | Pestaña `Por Items` | SplitBillDialog.tsx:363-365 |
| 167 | texto | `División Equitativa` / `Se dividirá el total entre {n} comensales` | Explicación del modo | Pestaña `Equitativo` | SplitBillDialog.tsx:377-380 |
| 168 | tabla | *(tarjeta por comensal con `total / splits.length`)* | Previsualización del reparto | Pestaña `Equitativo` | SplitBillDialog.tsx:383-397 |
| 169 | botón | `Aplicar División Equitativa` | Fija el importe por comensal y reparte las unidades en *round-robin* | Pestaña `Equitativo` | SplitBillDialog.tsx:400-407, 149-159, 125-147 |
| 170 | texto | `División Personalizada` / `Ingresa el monto que pagará cada comensal` | Explicación del modo | Pestaña `Personalizado` | SplitBillDialog.tsx:417-420 |
| 171 | campo | *(input numérico por comensal, `min="0"`, `step="100"`)* | Monto libre por comensal; **borra sus items asignados** | Pestaña `Personalizado` | SplitBillDialog.tsx:435-448 |
| 172 | cálculo | `Suma asignada:` / `Diferencia:` | Suma de los montos y diferencia contra el total; el marco pasa a verde con tolerancia de $1 | Pestaña `Personalizado` | SplitBillDialog.tsx:455-476 |
| 173 | botón | `Distribuir equitativamente como base` | Reparte el total en partes enteras (el último comensal absorbe el resto) y asigna unidades en *round-robin* | Pestaña `Personalizado` | SplitBillDialog.tsx:478-496 |
| 174 | texto | `Total original: {importe}` | Recordatorio en el pie | Siempre | SplitBillDialog.tsx:505-507 |
| 175 | badge | `Asignado: {importe}` | Progreso de la asignación | Solo en `Por Items` | SplitBillDialog.tsx:508-514 |
| 176 | botón | `Cancelar` | Cierra sin aplicar | Siempre | SplitBillDialog.tsx:518-520 |
| 177 | botón | `Confirmar División` | Aplica la división | **Deshabilitado según `canConfirm()`**: en `Por Items` exige que cada línea tenga todas sus unidades asignadas; en `Personalizado` que la suma cuadre con el total (±$1) y todos los montos sean > 0; en `Equitativo` siempre se permite | SplitBillDialog.tsx:521-528, 169-192 |
| 178 | toast | `Cuenta dividida` — `Cuenta dividida equitativamente entre {n} comensales` / `La cuenta se dividió entre {n} comensales` | Confirmación de la división | Tras confirmar | page.tsx:1187-1192 |
| 179 | toast | `No hay items asignados` — `Asigna productos a los comensales o usa división equitativa` | Todos los splits quedaron en 0 | Tras confirmar sin montos | page.tsx:1175-1182 |

#### SplitPaymentSelector

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 180 | diálogo | `Seleccionar Pago` — `Elige qué comensal va a pagar ahora` | Selector del siguiente pago | `Procesar Pagos Divididos` | SplitPaymentSelector.tsx:53-63 |
| 181 | stat | `Pagados` | Número de splits ya cobrados | Siempre | SplitPaymentSelector.tsx:67-77 |
| 182 | stat | `Pendientes` | Número de splits por cobrar | Siempre | SplitPaymentSelector.tsx:79-89 |
| 183 | stat | `Total Pagado` | Suma de los splits cobrados | Siempre | SplitPaymentSelector.tsx:91-101 |
| 184 | texto | `Pendientes de Pago` | Encabezado de la lista | Siempre | SplitPaymentSelector.tsx:108-110 |
| 185 | estado | `¡Todos los pagos completados!` | Lista de pendientes vacía | `pendingSplits.length === 0` | SplitPaymentSelector.tsx:112-118 |
| 186 | botón | *(tarjeta del split, clicable completa)* | `onSelectSplit` → abre el `CheckoutDialog` con ese split | Por split pendiente | SplitPaymentSelector.tsx:120-125 · page.tsx:1206-1214 |
| 187 | badge | `Pendiente` | Estado del split | Por split pendiente | SplitPaymentSelector.tsx:146-148 |
| 188 | botón | `Procesar` | Igual que la tarjeta, con `stopPropagation` | Por split pendiente | SplitPaymentSelector.tsx:150-159 |
| 189 | badge | `{cant}x {producto}` + `+{n} más` | Vista previa de hasta 3 líneas del split | Por split pendiente | SplitPaymentSelector.tsx:166-175 |
| 190 | texto | `Ya Pagados` | Encabezado de la sección cobrada | Si hay splits pagados | SplitPaymentSelector.tsx:185-187 |
| 191 | badge | `Pagado` | Estado del split cobrado | Por split pagado | SplitPaymentSelector.tsx:209-211 |
| 192 | cálculo | `Total pagado:` / `Pendiente:` / `Total:` | Totales de la división, calculados en el navegador | Siempre | SplitPaymentSelector.tsx:223-240, 48-50 |
| 193 | texto | `No hay comensales con items asignados` / `{n} pagos pendientes` / `Todos los pagos completados` | Resumen del pie | Siempre | SplitPaymentSelector.tsx:243-251 |
| 194 | botón | `Cancelar` | Cierra el selector sin cerrar la mesa | Siempre | SplitPaymentSelector.tsx:254-256 |
| 195 | botón | `Cerrar y Liberar Mesa` | `handleFinishWithPartialPayments`: si quedan pagos pendientes pide confirmación con `confirm()` nativo y libera la mesa | **Solo si hay al menos un split cobrado** | SplitPaymentSelector.tsx:258-266 · page.tsx:1217-1285 |
| 196 | toast | `Pago completado` — `{split.name}: {importe}` | Tras cobrar un split se marcan sus `sale_items` con `paid_at` y `paid_by_split_id` | Tras cada cobro parcial | page.tsx:1294-1314 |
| 197 | toast | `¡Todos los pagos completados!` — `{n} pagos procesados. Mesa liberada.` | Libera la mesa 1,5 s después del último cobro | Cuando todos los splits están pagados | page.tsx:1345-1359 |
| 198 | toast | `Mesa liberada` — `Total pagado: {importe}. {n} de {m} pagos procesados.` | Cierre con pagos parciales | Tras `Cerrar y Liberar Mesa` | page.tsx:1267-1270 |
| 199 | toast | `Hay productos sin asignar` — `{n} producto(s) por {importe} fueron agregados después de dividir…` | Cancela la división y obliga a redividir | Líneas nuevas tras dividir | page.tsx:1233-1247, 1328-1342 |

**Subtotal: 47 controles (27 + 20).**

---

### 8. TransferItemDialog

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 200 | diálogo | `Transferir Item` | Modal de transferencia de una línea | Al pulsar `Transferir` en una línea | TransferItemDialog.tsx:87-100 |
| 201 | texto | `Mueve este item a otra mesa. Si la mesa destino no tiene pedido activo, se creará uno nuevo.` | Descripción del diálogo | Siempre | TransferItemDialog.tsx:101-104 |
| 202 | texto | `{producto}` + `Cantidad disponible: {n}` | Resumen de la línea | Siempre | TransferItemDialog.tsx:109-116 |
| 203 | campo | `Cantidad a Transferir` (`type="number"`, `min="1"`, `max={item.quantity}`) | Unidades a mover | Siempre | TransferItemDialog.tsx:120-128 |
| 204 | texto | `La cantidad no puede ser mayor a {n}` | Validación en rojo | `cantidad > item.quantity` | TransferItemDialog.tsx:129-133 |
| 205 | campo | `Mesa Destino` (`Select`, placeholder `Seleccionar mesa`) | Lista de mesas de `MesasService.obtenerMesasConSesiones`, excluyendo la actual y filtrando estados `free` y `occupied` | Siempre | TransferItemDialog.tsx:143-160, 56-67 |
| 206 | texto | `{nombre} - {zona} (Libre)` / `(Ocupada)` | Etiqueta de cada opción | Por mesa | TransferItemDialog.tsx:153-157 |
| 207 | texto | `⚠️ Se transferirán {x} de {y} unidades. Las restantes permanecerán en esta mesa.` | Aviso de transferencia parcial | `cantidad < item.quantity` | TransferItemDialog.tsx:164-171 |
| 208 | botón | `Cancelar` | Cierra el diálogo | Deshabilitado mientras `isSubmitting` | TransferItemDialog.tsx:175-181 |
| 209 | botón | `Transferir` / `Transfiriendo...` | `PedidosService.transferirItem`: si `cantidad >= item.quantity` reasigna `sale_items.sale_id`; si no, inserta una línea nueva en la venta destino y reduce la original | **Deshabilitado si no hay mesa destino, `cantidad < 1`, `cantidad > item.quantity` o `isSubmitting`** | TransferItemDialog.tsx:182-192 · pedidosService.ts:814-878 |
| 210 | toast | `Error` — `Mesa destino no tiene sesión activa` | El servicio rechaza mesas sin sesión | Al elegir una mesa `(Libre)` | page.tsx:767-773 · pedidosService.ts:840 |

**Subtotal: 11 controles.**

---

### 9. SessionTimelineDialog + sessionAuditService

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 211 | diálogo | `Historial de la Mesa` | Línea de tiempo de la sesión | Al pulsar `Historial` | SessionTimelineDialog.tsx:68-75 |
| 212 | estado | *(3 skeletons)* | Carga del historial | `loading` | SessionTimelineDialog.tsx:77-83 |
| 213 | estado | `No se pudo cargar el historial de la mesa.` | Error de la consulta | Fallo del servicio | SessionTimelineDialog.tsx:85-87, 56-58 |
| 214 | estado | `Sin eventos registrados para esta mesa.` | Vacío | Sin eventos | SessionTimelineDialog.tsx:89-93 |
| 215 | tabla | *(línea de tiempo: icono, fecha, autor, descripciones)* | Un elemento por registro de `ops_audit_log` | Con eventos | SessionTimelineDialog.tsx:95-120 |
| 216 | badge | `{userName}` | Autor del cambio; `Usuario` si el perfil no resuelve, `Sistema` si no hay `user_id` | Por evento | SessionTimelineDialog.tsx:106-108 · sessionAuditService.ts:153 |
| 217 | texto | `{dd/mm/aaaa hh:mm}` | `toLocaleString('es-CO', …)` **sin la zona horaria de la organización** | Por evento | SessionTimelineDialog.tsx:32-40, 103-105 |
| 218 | estado | *(icono `PlusCircle` verde / `Trash2` rojo / `RefreshCcw` azul)* | Acción `INSERT` / `DELETE` / resto | Por evento | SessionTimelineDialog.tsx:21-30 |
| 219 | texto | `Sesión de mesa abierta — {n} comensal(es) — atendida por {mesero}` | Descripción de un `INSERT` | Evento de apertura | sessionAuditService.ts:39-46 |
| 220 | texto | `Sesión de mesa eliminada` | Descripción de un `DELETE` | Evento de borrado | sessionAuditService.ts:48-50 |
| 221 | texto | `Mesero cambiado: {anterior} → {nuevo}` (`Sin asignar` si falta) | Cambio de `server_id` | `changed_fields` incluye `server_id` | sessionAuditService.ts:56-62 |
| 222 | texto | `Estado: {anterior} → {nuevo}` con `Activa` / `Cuenta solicitada` / `Completada` / `Cancelada` / `Sin estado` | Cambio de `status` | `changed_fields` incluye `status` | sessionAuditService.ts:16-26, 64-68 |
| 223 | texto | `Comensales actualizados: {a} → {b}` | Cambio de `customers` | `changed_fields` incluye `customers` | sessionAuditService.ts:70-72 |
| 224 | texto | `Sesión cerrada` | Se fijó `closed_at` | `changed_fields` incluye `closed_at` | sessionAuditService.ts:74-76 |
| 225 | texto | `Venta asociada a la sesión` | Se fijó `sale_id` por primera vez | `changed_fields` incluye `sale_id` | sessionAuditService.ts:78-80 |
| 226 | texto | `Notas actualizadas` | Cambio de `notes` | `changed_fields` incluye `notes` | sessionAuditService.ts:82-84 |
| 227 | texto | `Actualización ({campos})` / `Actualización (sin detalle)` | Fallback cuando ningún campo conocido cambió | Resto de `UPDATE` | sessionAuditService.ts:86-88 |

`SessionAuditService.getTableSessionTimeline` (sessionAuditService.ts:99-158) lee solo `ops_audit_log` con `entity_type = 'table_sessions'`, filtra por `new_data->>restaurant_table_id` o `previous_data->>restaurant_table_id` y limita a 100 eventos, y luego resuelve nombres en `profiles` (sessionAuditService.ts:129-132). **No hay paginación, ni filtro por rango de fechas, ni filtro explícito por `organization_id`** (depende de RLS).

**Subtotal: 17 controles.**

---

### 10. MesaTaxBreakdown — impuestos

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 228 | estado | `Impuestos:` — `Calculando...` | Mientras el hook carga los impuestos de la organización | `loading` | MesaTaxBreakdown.tsx:40-49 |
| 229 | toggle | `Impuestos incluidos` | `setTaxIncluded`: cambia si el precio ya contiene el impuesto | Con al menos un item (`items.length === 0` devuelve `null`, línea 51-53) | MesaTaxBreakdown.tsx:61-73 |
| 230 | texto | `Impuestos aplicables:` | Encabezado del selector | Solo si **no** hay impuestos específicos por producto y la organización tiene impuestos | MesaTaxBreakdown.tsx:79-81 |
| 231 | toggle | `{tax.name} ({tax.rate}%)` | Casilla por impuesto de la organización; `toggleTax(tax.id)` | Ídem | MesaTaxBreakdown.tsx:83-106 (etiqueta en 96-98) |
| 232 | badge | `Predeterminado` | Marca `is_default` del impuesto | Por impuesto predeterminado | MesaTaxBreakdown.tsx:100-104 |
| 233 | botón | `Impuestos:` + importe + chevron | Expande o colapsa el desglose | Con desglose calculado | MesaTaxBreakdown.tsx:114-127 |
| 234 | badge | `{tax.rate}%` | Tasa del impuesto en el desglose | Expandido | MesaTaxBreakdown.tsx:135-137 |
| 235 | texto | `{tax.name}` | Nombre del impuesto, tal cual está en `organization_taxes` — **nunca se escribe «IVA» en el código** | Expandido | MesaTaxBreakdown.tsx:138 |
| 236 | badge | `incluido` | El impuesto ya está dentro del precio | Expandido y `taxIncluded` | MesaTaxBreakdown.tsx:139-143 |
| 237 | texto | `Base: {importe}` | Base gravable de ese impuesto | Expandido | MesaTaxBreakdown.tsx:147-149 |
| 238 | cálculo | `Total impuestos:` | Suma del desglose | Expandido | MesaTaxBreakdown.tsx:153-156 |
| 239 | cálculo | `Subtotal base:` + `(imp. incluidos)` | Base agregada; la coletilla solo con `taxIncluded` | Con al menos un item | MesaTaxBreakdown.tsx:163-171 |

**Cálculo.** Todo lo anterior sale del hook `hooks/useMesaTaxes.ts`: carga `POSService.getOrganizationTaxes()`, marca por defecto los `is_default` (useMesaTaxes.ts:52-79) y, por cada línea, consulta `POSService.getProductTaxes(product_id)`; si el producto tiene impuestos propios usa esos (y respeta su `tax_included`), si no usa los de la organización (useMesaTaxes.ts:97-174). El resultado se comunica hacia arriba con `onTotalsChange` (MesaTaxBreakdown.tsx:34-38) y la página lo guarda en `calculatedTaxTotals` (page.tsx:1486-1495). La etiqueta siempre es `{nombre} {tasa}` — no hay ninguna cadena `IVA` literal en estos archivos.

**Subtotal: 12 controles.**

---

### 11. Datos: de qué tablas lee y escribe

#### `components/pos/mesas/id/pedidosService.ts` (46 llamadas `.from(...)`, ninguna `.rpc(...)`)

| Tabla | Operación y columnas | Línea |
|---|---|---|
| `table_sessions` | `select('*, restaurant_tables!table_sessions_restaurant_table_id_fkey(id, name, zone, capacity, state), sales!table_sessions_sale_id_fkey(*)')` filtrando por `restaurant_table_id`, `organization_id`, `status in ('active','bill_requested')`, orden `opened_at desc` | pedidosService.ts:32-42 |
| `sale_items` | `select('*, product:products!sale_items_product_id_fkey(id, name, description, sku, parent_product_id, variant_data, product_images(id, storage_path, is_primary, display_order)), kitchen_ticket_items(id, status)')` por `sale_id in (…)` | pedidosService.ts:65-86 |
| `product_images` | `select('id, product_id, storage_path, is_primary, display_order')` — fallback de imagen del producto padre | pedidosService.ts:105-108 |
| `table_sessions` | `select('*')` para detectar sesiones duplicadas | pedidosService.ts:166-172 |
| `table_sessions` | `update({ status: 'completed' })` para cerrar duplicadas | pedidosService.ts:178-181 |
| `table_sessions` | `insert({ organization_id, restaurant_table_id, server_id, customers, status, opened_at })` | pedidosService.ts:192-203 |
| `restaurant_tables` | `update({ state: 'occupied' })` | pedidosService.ts:211-214 |
| `table_sessions` | `select('sale_id, restaurant_table_id, server_id')` | pedidosService.ts:251-255 |
| `sales` | `insert({ organization_id, branch_id, user_id, sale_date, status, payment_status, total, subtotal, tax_total, discount_total })` | pedidosService.ts:263-278 |
| `table_sessions` | `update({ sale_id })` | pedidosService.ts:287-290 |
| `sale_items` | `insert([...])` con `sale_id, product_id, quantity, unit_price, total, tax_amount, discount_amount, notes` (jsonb) | pedidosService.ts:397-400 |
| `kitchen_tickets` | `insert({ organization_id, branch_id, table_session_id, sale_id, status: 'new', priority: 0 })` | pedidosService.ts:417-428 |
| `kitchen_ticket_items` | `insert({ organization_id, kitchen_ticket_id, sale_item_id, station, notes, status: 'pending' })` | pedidosService.ts:447-449 |
| `sale_items` | `select('unit_price, quantity, total, tax_amount, discount_amount')` para recalcular | pedidosService.ts:472-475 |
| `sales` | `update({ subtotal, tax_total, discount_total, total, balance })` | pedidosService.ts:490-499 |
| `sale_items` | `select('sale_id, product_id, quantity, unit_price, total, notes')` antes de borrar | pedidosService.ts:512-516 |
| `sale_items` | `select('…, products!left(name), sales!left(organization_id, branch_id, table_session_id)')` para auditoría | pedidosService.ts:524-532 |
| `kitchen_ticket_items` | `delete().eq('sale_item_id', …)` | pedidosService.ts:545-548 |
| `sale_items` | `delete().eq('id', …)` | pedidosService.ts:551-554 |
| `ops_audit_log` | `insert({ organization_id, branch_id, user_id, entity_type: 'sale_items', entity_id, action: 'DELETE', previous_data, metadata })` | pedidosService.ts:592-612 |
| `sale_items` | `select('unit_price, quantity, tax_amount, sale_id')` | pedidosService.ts:626-630 |
| `sale_items` | `update({ quantity, total, tax_amount })` | pedidosService.ts:640-647 |
| `table_sessions` | `update({ status: 'bill_requested' })` | pedidosService.ts:699-702 |
| `table_sessions` | `update({ customers })` | pedidosService.ts:722-726 |
| `kitchen_tickets` | `select('id, created_at, kitchen_ticket_items(station, notes, sale_items(quantity, notes, products(name, variant_data))))')` con `printed_at is null` | pedidosService.ts:748-758 |
| `kitchen_tickets` | `update({ printed_at })` | pedidosService.ts:763-766 |
| `kitchen_tickets` | `select('*')` por `table_session_id` (`obtenerTicketsCocina`, **no se usa en esta pantalla**) | pedidosService.ts:797-801 |
| `sale_items` | `select('*, sales!inner(table_sessions!inner(restaurant_table_id)))')` para transferir | pedidosService.ts:823-827 |
| `table_sessions` | `select('id, sale_id, server_id')` de la mesa destino | pedidosService.ts:832-838 |
| `sale_items` | `update({ sale_id })` (transferencia total) | pedidosService.ts:844-847 |
| `sale_items` | `insert({ sale_id, product_id, quantity, unit_price, total, tax_amount: 0, discount_amount: 0, notes })` (transferencia parcial) | pedidosService.ts:852-861 |
| `sales` | `select('status')` para no re-disparar el trigger contable | pedidosService.ts:914-918 |
| `sales` | `update({ subtotal, tax_total, total, balance, tax_included, tax_breakdown, tip_amount, tip_server_id, driver_id, table_session_id, updated_at, status?, payment_status? })` | pedidosService.ts:944-949 |
| `payments` | `insert({ organization_id, branch_id, source: 'sale', source_id, method, amount, currency, status, created_by, payment_date, change_amount })` | pedidosService.ts:964-978 |
| `invoice_sales` | `select('id').eq('sale_id', …)` | pedidosService.ts:987-991 |
| `invoice_sales` | `update({ subtotal, tax_total, total, balance, status, tax_included, payment_method, updated_at })` | pedidosService.ts:997-1009 |
| `invoice_sales` | `insert({ organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date, currency, subtotal, tax_total, total, balance, status, tax_included, payment_method, payment_terms, created_by, notes })` | pedidosService.ts:1013-1036 |
| `invoice_items` | `select('id').eq('invoice_sales_id', …)` | pedidosService.ts:1047-1051 |
| `sale_items` | `select('id, product_id, quantity, unit_price, total, tax_amount, tax_rate, notes')` | pedidosService.ts:1055-1060 |
| `products` | `select('id, name, description').in('id', …)` | pedidosService.ts:1064-1067 |
| `invoice_items` | `insert([...])` con `invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price, total_line, tax_rate, tax_included` | pedidosService.ts:1091-1093 |
| `accounts_receivable` | `insert({ organization_id, branch_id, customer_id, invoice_id, sale_id, amount, balance, due_date, status: 'partial' })` | pedidosService.ts:1104-1116 |
| `sale_items` | `select('product_id, quantity, unit_price')` para descontar stock | pedidosService.ts:1137-1140 |
| `sale_items` | `select('product_id, unit_price')` para seriales | pedidosService.ts:1168-1171 |
| `profiles` | `select('first_name, last_name')` del vendedor | pedidosService.ts:1204-1208 |
| `commissions` | `insert({ organization_id, branch_id, commission_type, source_type, source_id, payee_type, payee_id, payee_name, base_amount, commission_rate, commission_amount, currency, status, accrued_at, created_by, metadata })` | pedidosService.ts:1220-1239 |

Servicios encadenados desde aquí: `POSService.getOrganizationTaxes` / `getProductTaxes` / `getBaseCurrency`, `promotionEngine.evaluate`, `stockMovementService.decrementOnSale`, `serialTrackingService.sellSerials`, `generateInvoiceNumber` (pedidosService.ts:1-12, 294, 310-320, 1143, 1177, 1011).

#### `components/pos/mesas/id/sessionAuditService.ts`

| Tabla | Operación y columnas | Línea |
|---|---|---|
| `ops_audit_log` | `select('id, action, entity_id, changed_fields, previous_data, new_data, user_id, created_at')` con `entity_type = 'table_sessions'` y `or(new_data->>restaurant_table_id.eq.X, previous_data->>restaurant_table_id.eq.X)`, `limit 100` | sessionAuditService.ts:100-108 |
| `profiles` | `select('id, first_name, last_name').in('id', …)` | sessionAuditService.ts:129-132 |

#### `app/app/pos/mesas/[id]/page.tsx`

| Tabla / RPC | Operación y columnas | Línea |
|---|---|---|
| `restaurant_tables` | `select('name, zone')` por `id` (+ `branch_id` si hay `branchFilter`) — nombre de la mesa sin sesión | page.tsx:174-179 |
| `profiles` | `select('first_name, last_name')` por `server_id` — nombre del mesero | page.tsx:219-223 |
| `customers` | `select('*')` por `sales.customer_id` (+ `branch_id`) | page.tsx:238-243 |
| `reservations` | `select('id, checkin, checkout, reservation_spaces!inner(space_id, spaces!inner(id, label)), folios!inner(id)')` por `reservation_id` (+ `branch_id`) | page.tsx:252-270 |
| `table_sessions` | `update({ server_id })` al asegurar sesión sin mesero | page.tsx:315-320 |
| `profiles` | `select('first_name, last_name')` del usuario actual (dos llamadas) | page.tsx:322-326, 354-358 |
| `get_profiles_by_organization` (RPC) | `supabase.rpc('get_profiles_by_organization', { org_id })` — miembros para asignar mesero | page.tsx:836 |
| `sale_items` | `update({ paid_at, paid_by_split_id }).in('id', itemIds)` al cobrar un split | page.tsx:1298-1304 |
| `sales` | `update({ customer_id, reservation_id, updated_at })` al asignar cliente/habitación (+ `branch_id`) | page.tsx:1406-1415 |
| `kitchen_ticket_items`, `kitchen_tickets` | Suscripción Realtime `postgres_changes` (evento `*`), filtradas por `organization_id` y `table_session_id` | page.tsx:116-148 |
| `supabase.auth.getUser()` | Usuario autenticado para crear sesión / asignar mesero | page.tsx:313, 340 |

---

### 12. Roturas y deuda

#### 12.1 `sendToFactus` — **confirmado: se ignora**

`PreCuentaDialog.tsx:234` llama `onGenerateBill(sendToFactus)`, pero el detalle de mesa registra el callback sin parámetro:

> `onGenerateBill={() => { setShowPreCuenta(false); setShowCheckout(true); }}` — page.tsx:1742-1745

El valor se descarta y nada aguas abajo lo recibe: `handleProcessPayment` (page.tsx:1015-1046) y `PedidosService.completarVentaMesa` (pedidosService.ts:885-907) no tienen ningún campo de factura electrónica. El toggle, incluido su modo `Global` (PreCuentaDialog.tsx:196-212), es decorativo en esta pantalla.

#### 12.2 Otras roturas confirmadas

| # | Rotura | Evidencia | Archivo:línea |
|---|---|---|---|
| 1 | **`confirm()` nativo** para decidir si se cierra la mesa con pagos pendientes, en vez de un `AlertDialog` como el resto de la pantalla | `` const confirmed = confirm(`Quedan ${pendingSplits.length} pago(s) pendiente(s)…`) `` | page.tsx:1255-1261 |
| 2 | **Lógica de negocio duplicada respecto a `posService`**: `completarVentaMesa` reimplementa pagos, factura, ítems de factura, cartera, stock, seriales y comisiones, que `POSService.checkout` ya hace | `static async completarVentaMesa(` … 370 líneas | pedidosService.ts:885-1257 vs lib/services/posService.ts:1660 |
| 3 | **Cartera escrita a mano**: se inserta en `accounts_receivable` justo después de crear `invoice_sales`, cuando el alta de la factura ya dispara la creación de la cartera por trigger → riesgo de cartera duplicada | `.from('accounts_receivable').insert({ … status: 'partial' })` | pedidosService.ts:1104-1116 |
| 4 | **Tres cálculos de impuestos distintos para la misma mesa**: (a) al insertar, `pedidosService` calcula y guarda `tax_amount` por línea; (b) el sidebar recalcula todo con `useMesaTaxes`; (c) `convertSessionToCart` **sobrescribe** el `tax_amount` de cada línea repartiendo el total del hook de forma proporcional; y (d) `CheckoutDialog` vuelve a llamar `calculateCartTaxes` | `item.tax_amount = Math.round((itemBase / itemsBaseTotal) * hookTaxTotal * 100) / 100;` | pedidosService.ts:293-395 · hooks/useMesaTaxes.ts:97-174 · page.tsx:984-992 · components/pos/CheckoutDialog.tsx:933-941 |
| 5 | **La pre-cuenta no coincide con lo que muestra el sidebar**: `generarPreCuenta` suma `sale_items.tax_amount` de la BD e incluye **también los ítems ya pagados**, mientras el sidebar usa el hook y filtra `paid_at` | `const items = detalles.sale_items;` sin filtrar `paid_at` | pedidosService.ts:661-692 vs page.tsx:1543 |
| 6 | **`SplitBillDialog` recibe los ítems ya pagados**: se le pasa `session?.sale_items` completo, no `items` filtrado, así que un ítem cobrado vuelve a aparecer para dividir | `items={session?.sale_items \|\| []}` | page.tsx:1823 vs page.tsx:1543 |
| 7 | **Fechas sin la zona horaria de la organización** (contra la regla 3 de fechas): la pre-cuenta y el historial usan `toLocaleString('es-CO', …)` directo, sin `useFormatDate()` ni `formatDateInTz`. La página sí tiene el `timezone` a mano y lo usa solo para la impresión. *(No hay ningún `toISOString().split('T')[0]` ni `.split('T')[0]` en todo el módulo: ese bug no aplica aquí.)* | `new Date().toLocaleString('es-CO', {…})` · `new Date(iso).toLocaleString('es-CO', {…})` | PreCuentaDialog.tsx:171-174 · SessionTimelineDialog.tsx:32-40 · page.tsx:73, 600 |
| 8 | **Fecha de la pre-cuenta mal tomada**: imprime `new Date()` en cada render, no el instante en que se generó la cuenta | `📅 {new Date().toLocaleString(…)}` | PreCuentaDialog.tsx:171 |
| 9 | **Moneda cableada**: `formatCurrency` de `@/utils/Utils` tiene `currency: string = "COP"` por defecto y `Intl.NumberFormat("es-CO", …)` fijo; todas las llamadas de esta pantalla lo usan sin argumento, así que una organización en otra moneda vería pesos colombianos. En cambio `completarVentaMesa` sí guarda la moneda real (`baseCurrency.code`) | `formatCurrency(total)` en 8 archivos de la pantalla | utils/Utils.ts:69-89 · MesaStatsCards.tsx:194 · MesaActionsSidebar.tsx:137,148 · OrderItemCard.tsx:198,206 · PreCuentaDialog.tsx:136 · SplitBillDialog.tsx:205 · SplitPaymentSelector.tsx:97 · pedidosService.ts:954, 973 |
| 10 | **Sin comprobación de permisos**: ni la página ni el sidebar consultan permiso alguno. No hay `hasPermission`, `usePermission` ni equivalente en ninguno de los 15 archivos del módulo. Cualquier usuario que llegue a la ruta puede liberar la mesa, cobrar, eliminar líneas o cambiar el mesero | `grep -rn "permis\|hasPermission" …` → 0 resultados | app/app/pos/mesas/[id]/page.tsx · components/pos/mesas/id/* |
| 11 | **La organización sale del cliente**: `getOrganizationId()` la lee del estado del navegador (`obtenerOrganizacionActiva`) y se usa como `.eq('organization_id', …)`; la única garantía real es RLS | `const organizationId = getOrganizationId();` | pedidosService.ts:28, 162, 244, 819 · lib/hooks/useOrganization.ts:376-379 |
| 12 | **El botón de refrescar nunca muestra el skeleton**: se pasa `cargarDatos` como handler directo, así que React le entrega el evento de clic como primer argumento y `silencioso` queda *truthy* | `onRefresh={cargarDatos}` con `cargarDatos(silencioso = false)` | page.tsx:1568 vs page.tsx:202-203 |
| 13 | **`TransferItemDialog` ofrece mesas `(Libre)` que el servicio rechaza**: el selector filtra `state === 'free' \|\| 'occupied'` y la descripción promete «Si la mesa destino no tiene pedido activo, se creará uno nuevo», pero `transferirItem` lanza «Mesa destino no tiene sesión activa» | `if (!toSession) throw new Error('Mesa destino no tiene sesión activa');` | TransferItemDialog.tsx:60-62, 101-104 vs pedidosService.ts:832-840 |
| 14 | **Transferencia parcial pierde el impuesto**: la línea nueva se inserta con `tax_amount: 0` y `total = unit_price × quantity`, así que el impuesto de esas unidades desaparece de la mesa destino | `tax_amount: 0, discount_amount: 0,` | pedidosService.ts:852-861 |
| 15 | **La auditoría de eliminación de ítems se escribe pero no se muestra**: `registrarAuditoriaEliminacionItem` dice explícitamente que es «para poder mostrarlo luego en el historial de mesas», pero `getTableSessionTimeline` filtra `entity_type = 'table_sessions'` y nunca lee los registros de `sale_items` | comentario en pedidosService.ts:569-571 vs `.eq('entity_type', 'table_sessions')` | pedidosService.ts:592-612 · sessionAuditService.ts:103 |
| 16 | **Botones sin explicación al estar deshabilitados**: solo `Procesar Pago` explica su bloqueo (`Debe abrir una caja…`). `Enviar a Cocina`, `Ver Pre-Cuenta`, `Solicitar Cuenta`, `Dividir Cuenta` y `Confirmar División` se apagan sin texto ni `title`, y solo se descubre el motivo con un toast si se logra invocarlos por otra vía | `disabled={!itemsCount}` · `disabled={!itemsCount \|\| customers < 2}` · `disabled={!canConfirm()}` | MesaActionsSidebar.tsx:162, 188, 213, 227 · SplitBillDialog.tsx:523 |
| 17 | **`Liberar Mesa` no está deshabilitado nunca**, ni sin sesión ni con líneas por cobrar; el `AlertDialog` que lo respalda no menciona el importe pendiente | botón sin `disabled` | MesaActionsSidebar.tsx:315-322 · page.tsx:1962-1981 |
| 18 | **Conteos y sumas en el navegador**: pendientes, pagados, subtotal, impuestos, total, total por split, «Falta», «Suma asignada» y «Diferencia» se calculan todos con `reduce` sobre el array cargado; no hay agregación en la BD | `items.reduce((sum, item) => …)` | page.tsx:1551-1560, 1066, 1234 · SplitBillDialog.tsx:161-163, 456-473 · SplitPaymentSelector.tsx:48-50 |
| 19 | **`useMesaTaxes` consulta `getProductTaxes` por cada línea y en cada render de la página**: `taxItems` se construye con `.map()` en el JSX, o sea un array nuevo en cada render, que es dependencia del efecto del hook → N consultas por producto cada vez que cualquier estado de la página cambia | `taxItems={items.map(item => ({ … }))}` | page.tsx:1707-1713 · hooks/useMesaTaxes.ts:97-186 |
| 20 | **Props muertas en esta pantalla**: `includedProductIds`, `title`, `subtitle`, `submitLabel` de `AddProductDialog`, y `deliveryInfo` y `showEInvoiceOption` de `PreCuentaDialog`, nunca se pasan desde el detalle de mesa | `<AddProductDialog open … comensales … selectedRoom … />` | AddProductDialog.tsx:40-45 · PreCuentaDialog.tsx:29-30 · page.tsx:1728-1751 |
| 21 | **Imports muertos**: `Tabs/TabsContent/TabsList/TabsTrigger`, `Label` y `ScrollArea` en `AddProductDialog`; `Label`, `X` y `Percent` en `SplitBillDialog`; `X` en `SplitPaymentSelector`; `RefreshCw`, `Receipt` y `Clock` en `page.tsx` | líneas de `import` | AddProductDialog.tsx:8, 11, 17 · SplitBillDialog.tsx:13, 24, 25 · SplitPaymentSelector.tsx:20 · page.tsx:6-13 |
| 22 | **Liberación de mesa con `setTimeout` de 1500 ms** tras el último split: si el usuario navega antes, la mesa queda ocupada | `setTimeout(async () => { await MesasService.liberarMesa(tableId); …}, 1500);` | page.tsx:1345-1359 |
| 23 | **`kitchen_ticket_items` se filtra por `organization_id` en el canal Realtime, no por la sesión**: cualquier cambio de cocina de toda la organización recarga esta mesa | `filter: \`organization_id=eq.${session.organization_id}\`` | page.tsx:124-131 |
| 24 | **Sin Realtime para la sesión, la venta ni los ítems**: solo hay canal para `kitchen_tickets` y `kitchen_ticket_items`. Si otro terminal agrega un producto a la misma mesa, esta pantalla no se entera hasta pulsar refrescar. **No hay `setInterval` en ninguna parte del módulo** | `.channel(\`kitchen-ticket-items-${session.id}\`)` | page.tsx:116-148 |
| 25 | **`console.log` de producción con datos de la venta**: al menos 14 trazas, incluidas las de sincronización con folios y la carga de productos | `console.log('Sincronizando items con folio:', …)` | page.tsx:377, 409, 490, 518, 1391, 1403, 1422, 1426, 1439 · AddProductDialog.tsx:98-99, 372, 379, 384 |

#### 12.3 Preguntas concretas del encargo

- **¿Existe «transferir cuenta» (toda la cuenta a otra mesa)?** **No, no desde el detalle.** Aquí solo hay dos cosas: `Transferir` por línea (OrderItemCard.tsx:762-771 → `PedidosService.transferirItem`, pedidosService.ts:814-878) y `Combinar Mesa` (MesaDetailHeader.tsx:79-88 → `MesasService.combinarMesas`). El «mover pedido» completo **sí existe** en el servicio (`MesasService.moverPedido`, components/pos/mesas/mesasService.ts:695) pero solo se invoca desde la **lista** de mesas (app/app/pos/mesas/page.tsx:284): el detalle no lo expone.
- **¿Existe aviso al mesero?** **No.** No hay ninguna llamada, notificación ni cola de aviso al mesero en todo el repositorio (`grep -rni "llamar.*mesero\|avisar.*mesero\|waiter_call\|server_call"` → 0 resultados). `Solicitar Cuenta` solo cambia `table_sessions.status` a `bill_requested` (pedidosService.ts:697-709); nadie recibe una notificación.
- **¿Existe estado de comanda por estación visible aquí?** **No.** La estación se calcula al agregar (AddProductDialog.tsx:162, 260) y se guarda en `kitchen_ticket_items.station` (pedidosService.ts:439), y se usa para la impresión física (page.tsx:708-716), pero **no se muestra en ninguna parte de la pantalla**. `OrderItemCard` solo pinta el estado del **último** `kitchen_ticket_items` de la línea (OrderItemCard.tsx:544-553), así que si un plato pasa por dos estaciones el usuario ve un único estado, el del registro más reciente del array, sin saber a qué estación corresponde.

---

### 13. Conteo de controles

| Subsección | Controles |
|---|---|
| 1. Cabecera del detalle (MesaDetailHeader) | 15 |
| 2. Tarjetas de estadísticas (MesaStatsCards) + diálogos de comensales y mesero | 22 |
| 3. Pedido actual y líneas (OrderItemCard) | 30 |
| 4. Barra de acciones (MesaActionsSidebar) | 25 |
| 5. AddProductDialog | 43 |
| 6. PreCuentaDialog | 17 |
| 7. SplitBillDialog (27) + SplitPaymentSelector (20) | 47 |
| 8. TransferItemDialog | 11 |
| 9. SessionTimelineDialog + sessionAuditService | 17 |
| 10. MesaTaxBreakdown | 12 |
| **Total** | **239** |

---

## C. Reservas de mesas y comandas de cocina


Auditoría de solo lectura del código. Rutas relativas a `src/`.

---

### R. Reservas de mesas

Ruta: `/app/pos/reservas-mesas` · página `app/app/pos/reservas-mesas/page.tsx` (228 líneas)
· componentes en `components/pos/reservas-mesas/`.

#### R1. Cabecera, acciones y BranchBadge

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | badge | `Sucursal:` + `Todas las sucursales` \| nombre de la sucursal | Muestra la sucursal activa del `BranchContext`; azul si es «Todas», fucsia si es concreta. No es un filtro: solo refleja el del header | Siempre, encima del header | `app/app/pos/reservas-mesas/page.tsx:185` → `components/inventario/BranchBadge.tsx:14-33` |
| 2 | texto | (icono `CalendarRange` sobre fondo azul) | Decorativo | Siempre | `components/pos/reservas-mesas/ReservasHeader.tsx:57-59` |
| 3 | texto | `Reservas de Mesas` | Título h1 | Siempre | `components/pos/reservas-mesas/ReservasHeader.tsx:61-63` |
| 4 | texto | `Gestiona las reservas del restaurante` | Subtítulo | Siempre | `components/pos/reservas-mesas/ReservasHeader.tsx:64-66` |
| 5 | botón | `Actualizar` | Llama `loadData()`; icono gira mientras `isLoading` | Siempre; `disabled` mientras carga | `components/pos/reservas-mesas/ReservasHeader.tsx:70-79` |
| 6 | botón | `Nueva Reserva` | Limpia `editingReservation` y abre `ReservaFormDialog` | Siempre. **No comprueba permisos ni que haya sucursal concreta**: con «Todas» el diálogo se abre igual y falla al guardar | `components/pos/reservas-mesas/ReservasHeader.tsx:80-87` + `page.tsx:164-167` |

#### R2. Filtros y stats

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 7 | campo | `Buscar por nombre, teléfono o email...` (placeholder, sin `<Label>`) | Filtro servidor con `.or(customer_name.ilike / customer_phone.ilike / customer_email.ilike)`. **Sin debounce**: cada tecla dispara `loadData()` (2 consultas) | Siempre | `ReservasHeader.tsx:93-98` + `reservasMesasService.ts:156-160` |
| 8 | menú | `Estado` (placeholder) · opciones `Todos los estados`, `Pendiente`, `Confirmada`, `Sentada`, `Completada`, `Cancelada`, `No se presentó` | Filtro servidor `.in('status', [...])` | Siempre. `Pendiente` es inalcanzable: la creación fuerza `confirmed` | `ReservasHeader.tsx:100-114` + `reservasMesasService.ts:93-100,136-138,227` |
| 9 | menú | `Origen` (placeholder) · opciones `Todos`, `Admin`, `Website`, `Teléfono`, `WhatsApp` | Filtro servidor `.eq('source', ...)` | Siempre | `ReservasHeader.tsx:116-130` + `reservasMesasService.ts:148-150` |
| 10 | campo | (sin etiqueta, `type="date"`) | Fecha desde → `.gte('reservation_date', ...)`. Valor inicial = hoy en UTC | Siempre | `ReservasHeader.tsx:132-137` + `page.tsx:37-38` |
| 11 | texto | `—` | Separador entre las dos fechas | Siempre | `ReservasHeader.tsx:138` |
| 12 | campo | (sin etiqueta, `type="date"`) | Fecha hasta → `.lte('reservation_date', ...)` | Siempre | `ReservasHeader.tsx:139-144` |
| 13 | stat | `Hoy` | `stats.total`. **La etiqueta está cableada**: sigue diciendo «Hoy» aunque el rango de fechas sea otro | Siempre | `ReservasStats.tsx:14-21` |
| 14 | stat | `Pendientes` | `stats.pending` (ámbar) | Siempre; casi siempre 0 por el punto 8 | `ReservasStats.tsx:22-29` |
| 15 | stat | `Confirmadas` | `stats.confirmed` (verde) | Siempre | `ReservasStats.tsx:30-37` |
| 16 | stat | `Sentadas` | `stats.seated` (índigo) | Siempre | `ReservasStats.tsx:38-45` |
| 17 | stat | `Canceladas` | `stats.cancelled` (rojo) | Siempre | `ReservasStats.tsx:46-53` |
| 18 | stat | `No Show` | `stats.no_show` (naranja). Mezcla de idiomas con el resto de la UI | Siempre | `ReservasStats.tsx:54-61` |
| 19 | cálculo | (sin etiqueta) | `avg_party_size` se calcula en el navegador y **no se muestra en ninguna parte** | Nunca visible | `reservasMesasService.ts:477-487` vs `ReservasStats.tsx:13-62` |

Los 6 stats se calculan trayendo **todas** las filas del rango (`select('id, status, party_size')` sin `limit`) y contando en JS: `reservasMesasService.ts:447-487`.

#### R3. Lista de reservas

No es una tabla: es una lista de tarjetas, una por reserva. **No hay paginación de ningún tipo** (ni del kit ni a mano) y la consulta no lleva `limit`, así que un rango amplio de fechas trae todo.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 20 | tabla | (tarjeta por reserva) | Contenedor; hover cambia el borde a azul | Con `reservations.length > 0` | `ReservasList.tsx:126-131` |
| 21 | texto | `{r.customer_name}` | Nombre del cliente, en negrita | Siempre en cada tarjeta | `ReservasList.tsx:136-138` |
| 22 | badge | `Pendiente` \| `Confirmada` \| `Sentada` \| `Completada` \| `Cancelada` \| `No se presentó` | Estado, con color por estado (ámbar/azul/índigo/verde/rojo/naranja) | Siempre | `ReservasList.tsx:139-141`, colores en `:54-71` |
| 23 | badge | `Admin` \| `Website` \| `Teléfono` \| `WhatsApp` | Origen, badge `outline` | Siempre | `ReservasList.tsx:142-144` |
| 24 | texto | `{dd/mm/aaaa} · {h:mm AM/PM}` (icono `Clock`) | Fecha y hora con helpers **propios** (`formatDate`, `formatTime`), no `useFormatDate()` | Siempre | `ReservasList.tsx:148-151`, helpers en `:73-84` |
| 25 | texto | `{n} persona` \| `{n} personas` (icono `Users`) | Tamaño del grupo, con singular/plural | Siempre | `ReservasList.tsx:152-155` |
| 26 | texto | `{mesa} ({zona})` (icono `MapPin`) | Mesa asignada, del embed `restaurant_table` | Solo si `r.restaurant_table` | `ReservasList.tsx:156-162` |
| 27 | texto | `{r.customer_phone}` (icono `Phone`) | Teléfono. **No es un enlace `tel:`** | Solo si hay teléfono | `ReservasList.tsx:163-168` |
| 28 | texto | `{r.customer_email}` (icono `Mail`) | Email. **No es un enlace `mailto:`** | Solo si hay email | `ReservasList.tsx:169-174` |
| 29 | texto | `{special_requests \|\| notes}` | Nota en cursiva. **Renderiza como texto plano el HTML del `RichTextEditor`** → se ven las etiquetas `<p>` | Si hay notas o solicitudes | `ReservasList.tsx:177-181` |
| 30 | menú | ⋯ (`MoreVertical`, sin `title` ni `aria-label`) | Abre el menú de acciones de la reserva | Siempre | `ReservasList.tsx:185-190` |
| 31 | menú | `Editar` | Abre `ReservaFormDialog` con la reserva | Siempre, en **cualquier** estado (también completada o cancelada) | `ReservasList.tsx:192-195` |
| 32 | menú | `Confirmar` | `changeStatus(id, 'confirmed')`, sella `confirmed_at` | Solo si `status === 'pending'` → en la práctica nunca | `ReservasList.tsx:199-207` |
| 33 | menú | `Marcar como sentada` | `changeStatus(id, 'seated')` + pone la mesa en `occupied` | Si `status ∈ {pending, confirmed}` | `ReservasList.tsx:209-217` + `reservasMesasService.ts:330-334` |
| 34 | menú | `Completar` | `changeStatus(id, 'completed')` + libera la mesa (`free`) | Solo si `status === 'seated'` | `ReservasList.tsx:219-227` |
| 35 | menú | `Cancelar` | `changeStatus(id, 'cancelled')` + libera la mesa. **No pide motivo** aunque el servicio acepta `reason` y la columna `cancellation_reason` existe | Si `status ∉ {completed, cancelled, no_show}` | `ReservasList.tsx:231-237` + `reservasMesasService.ts:306-309` |
| 36 | menú | `No se presentó` | `changeStatus(id, 'no_show')` + libera la mesa. Escribe en `cancelled_at`, no en un campo propio | Si `status ∉ {completed, cancelled, no_show}` | `ReservasList.tsx:238-244` + `reservasMesasService.ts:310-312` |
| 37 | menú | `Eliminar` (rojo) | Abre el diálogo de confirmación | Siempre, en cualquier estado | `ReservasList.tsx:250-256` |
| 38 | diálogo | `¿Eliminar reserva?` / `Esta acción no se puede deshacer. La reserva será eliminada permanentemente.` | `AlertDialog` del kit (no `confirm()` nativo) | Al pulsar Eliminar | `ReservasList.tsx:266-275` |
| 39 | botón | `Cancelar` | Cierra el diálogo | En el diálogo | `ReservasList.tsx:277-279` |
| 40 | botón | `Eliminar` (rojo) | `deleteReservation(id)`: borrado físico + libera la mesa si estaba `pending`/`confirmed` | En el diálogo | `ReservasList.tsx:280-288` + `reservasMesasService.ts:353-377` |

#### R4. ReservaFormDialog

Sin `<form>`: no hay `onSubmit`, ni Enter para enviar, ni validación nativa. La única validación es `!customerName.trim() || !date || !time` en `handleSubmit` y en el `disabled` del botón.

| # | Tipo | Etiqueta exacta | Qué hace / obligatoriedad / validación | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 41 | diálogo | `Nueva Reserva` \| `Editar Reserva` | Título según `isEditing`. Ancho `sm:max-w-[520px]`, scroll a `90vh` | Al pulsar Nueva Reserva o Editar | `ReservaFormDialog.tsx:174-179` |
| 42 | campo | `Nombre del cliente *` · placeholder `Nombre completo` | **Obligatorio** (bloquea el botón). Texto libre. **No hay selector de clientes**: no se usa `CustomerPicker` ni `CustomerSelector`; son campos sueltos | Siempre | `ReservaFormDialog.tsx:183-194` |
| 43 | campo | `Teléfono` · placeholder `+57 300 123 4567` | Opcional, texto libre, sin máscara ni validación | Siempre | `ReservaFormDialog.tsx:198-209` |
| 44 | campo | `Email` · placeholder `correo@ejemplo.com` | Opcional, `type="email"` pero **sin `<form>` no se valida nunca** | Siempre | `ReservaFormDialog.tsx:210-222` |
| 45 | campo | `Fecha *` (`type="date"`) | **Obligatorio**. Por defecto hoy en UTC. **Sin `min`: se puede reservar en el pasado** | Siempre | `ReservaFormDialog.tsx:227-238` + `:85` |
| 46 | campo | `Hora *` (`type="time"`) | **Obligatorio**. Por defecto `19:00` cableado. Sin horario de servicio de la organización | Siempre | `ReservaFormDialog.tsx:239-250` + `:91` |
| 47 | campo | `Personas *` (`type="number"`, `min=1`, `max=50`) | **Obligatorio**, por defecto 2. `max` no se valida en `handleSubmit`; `parseInt(...) \|\| 1` | Siempre | `ReservaFormDialog.tsx:251-264` |
| 48 | menú | `Duración (minutos)` · `60 min (1h)`, `90 min (1h 30m)`, `120 min (2h)`, `150 min (2h 30m)`, `180 min (3h)` | Duración, por defecto 90. Lista cableada en el componente | Siempre | `ReservaFormDialog.tsx:268-287` |
| 49 | menú | `Mesa` (+ spinner) · placeholder `Sin mesa asignada` · opciones `Sin mesa asignada` y `{nombre} — Cap. {capacidad} ({zona})` | Mesa asignada. Recarga con *debounce* de 300 ms al cambiar fecha, hora, personas, duración o sucursal. Opcional | Siempre. **Con «Todas las sucursales» no carga nada** (`branchFilter == null` corta el efecto) | `ReservaFormDialog.tsx:290-307` + `:103-127` |
| 50 | texto | `No hay mesas disponibles con capacidad para {n} personas en ese horario` | Aviso ámbar | Cuando la lista está vacía. **Engañoso con «Todas»**: nunca se consultó | `ReservaFormDialog.tsx:308-312` |
| 51 | menú | `Origen` · `Admin`, `Website`, `Teléfono`, `WhatsApp` | Fuente de la reserva, por defecto `admin` | **Solo al crear**; al editar no se puede corregir | `ReservaFormDialog.tsx:316-334` |
| 52 | campo | `Solicitudes especiales` · placeholder `Silla para bebé, cumpleaños, alergias...` | `RichTextEditor` → guarda **HTML** (`innerHTML`). El `htmlFor="specialRequests"` del label no apunta a nada | Siempre | `ReservaFormDialog.tsx:337-348` + `components/shared/RichTextEditor.tsx:65-72` |
| 53 | campo | `Notas internas` · placeholder `Notas para el equipo...` | `Textarea` de 2 filas, texto plano | Siempre | `ReservaFormDialog.tsx:350-362` |
| 54 | botón | `Cancelar` | Cierra sin guardar; el padre limpia `editingReservation` | Siempre | `ReservaFormDialog.tsx:366-372` + `page.tsx:219-222` |
| 55 | botón | `Crear Reserva` \| `Guardar Cambios` | Inserta o actualiza. `disabled` si falta nombre/fecha/hora o mientras guarda, **sin decir por qué** | Siempre | `ReservaFormDialog.tsx:373-380` |

**No hay recordatorio ni notificación** al cliente en ninguna parte del módulo (ni email, ni WhatsApp, ni fila en una tabla de recordatorios): grep de `reminder`, `notification` y `recordatorio` en `components/pos/reservas-mesas/` no devuelve nada.

#### R5. Estados

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 56 | estado | (esqueletos) | `PageHeaderSkeleton` + `StatsSkeleton count={4}` + `CardListSkeleton cards={4}` — **4 stats, pero la pantalla real tiene 6** | Mientras no hay `organization` | `app/app/pos/reservas-mesas/page.tsx:171-179` |
| 57 | estado | (3 tarjetas `animate-pulse` de 24 de alto) | Carga de la lista | `isLoading` | `ReservasList.tsx:95-105` |
| 58 | estado | (6 tarjetas `animate-pulse`) | Carga de los stats | `isLoading` | `ReservasStats.tsx:64-74` |
| 59 | estado | `No hay reservas para mostrar` / `Crea una nueva reserva o ajusta los filtros` | Vacío, con icono `CalendarRange` | `reservations.length === 0` y no carga | `ReservasList.tsx:107-121` |
| 60 | toast | `Error` / `No se pudieron cargar las reservas` | Único tratamiento de error de carga: **no hay estado de error en pantalla ni botón de reintento** | Si falla `loadData` | `page.tsx:72-79` |
| 61 | toast | `Sucursal requerida` / `Selecciona una sucursal concreta para crear una reserva. No se puede crear con "Todas" seleccionado.` | Bloquea la creación con «Todas». Es el único «sin sucursal» del módulo, y llega **después** de llenar todo el formulario | Al guardar con `branchFilter == null` | `page.tsx:92-99` |
| 62 | toast | `Reserva creada` / `La reserva se creó exitosamente` | Éxito | Tras crear | `page.tsx:102` |
| 63 | toast | `Reserva actualizada` / `Los cambios se guardaron exitosamente` | Éxito | Tras editar | `page.tsx:118` |
| 64 | toast | `Estado actualizado` | Éxito, sin decir a qué estado | Tras cambiar estado | `page.tsx:134` |
| 65 | toast | `Reserva eliminada` | Éxito | Tras eliminar | `page.tsx:148` |
| 66 | toast | `Error` / `No se pudo crear la reserva` | Error de creación | Al fallar el insert | `page.tsx:105-109` |
| 67 | toast | `Error` / `No se pudo actualizar la reserva` | Error de edición | Al fallar el update | `page.tsx:122-126` |
| 68 | toast | `Error` / `No se pudo cambiar el estado` | Error de transición | Al fallar `changeStatus` | `page.tsx:137-141` |
| 69 | toast | `Error` / `No se pudo eliminar la reserva` | Error de borrado | Al fallar el delete | `page.tsx:151-155` |

#### R6. Datos (`components/pos/reservas-mesas/reservasMesasService.ts`, 504 líneas)

Cliente: `supabase` de `@/lib/supabase/config` (**navegador**, línea 1). Organización: `getOrganizationId()` (línea 113). No hay ningún route handler ni RPC: todo son llamadas PostgREST directas desde el cliente, protegidas solo por RLS.

| Operación | Llamada | Columnas / embeds | Archivo:línea |
|---|---|---|---|
| Listar | `.from('restaurant_reservations').select('*, restaurant_table:restaurant_tables(id, name, zone, capacity, state)')` + `.eq('organization_id')` + orden por `reservation_date`, `reservation_time` | `*` (sin proyección) + embed a `restaurant_tables` | `reservasMesasService.ts:121-129` |
| Filtros | `.eq('branch_id')`, `.in('status')`, `.gte/.lte('reservation_date')`, `.eq('source')`, `.eq('restaurant_table_id')`, `.or(customer_name.ilike/customer_phone.ilike/customer_email.ilike)` | — | `:131-160` |
| Reservas de hoy | `getTodayReservations()` — **no la usa nadie en este módulo** | — | `:175-178` |
| Por id | `.from('restaurant_reservations').select(...).eq('id').eq('organization_id').single()` | mismo embed | `:183-200` |
| Crear | `.from('restaurant_reservations').insert({...})` | `organization_id`, `branch_id`, `restaurant_table_id`, `customer_name`, `customer_phone`, `customer_email`, `customer_id`, `party_size`, `reservation_date`, `reservation_time`, `duration_minutes`, `status`, `notes`, `special_requests`, `source`, `created_by`, `confirmed_at` | `:213-238` |
| Crear (efecto) | `.from('restaurant_tables').update({ state: 'reserved', updated_at })` **sin `.eq('organization_id')`** | `state`, `updated_at` | `:243-248` |
| Actualizar | `.from('restaurant_reservations').update({ ...input, updated_at })` | spread del input + `updated_at` | `:262-274` |
| Cambiar estado | `.update({ status, updated_at, confirmed_at \| seated_at \| completed_at \| cancelled_at + cancellation_reason })` | según destino | `:287-324` |
| Cambiar estado (efecto) | `.from('restaurant_tables').update({ state: 'occupied' \| 'free' })` **sin `.eq('organization_id')`** | `state`, `updated_at` | `:329-341` |
| Eliminar | `.delete().eq('id').eq('organization_id')` — borrado físico | — | `:358-362` |
| Eliminar (efecto) | `.from('restaurant_tables').update({ state: 'free' })` **sin `.eq('organization_id')`** | `state`, `updated_at` | `:368-372` |
| Mesas disponibles | `.from('restaurant_tables').select('id, name, zone, capacity, state').eq('organization_id').eq('branch_id').gte('capacity', partySize)` | 5 columnas | `:392-398` |
| Solape | `.from('restaurant_reservations').select('restaurant_table_id, reservation_time, duration_minutes').eq(...).eq('reservation_date').in('status', ['pending','confirmed','seated']).not('restaurant_table_id','is',null)` | 3 columnas | `:404-417` |
| Stats | `.select('id, status, party_size')` + filtros, y el conteo se hace en JS | 3 columnas | `:447-487` |

- **¿Se relaciona con `customers`?** No. Hay una columna `customer_id` en el tipo y en el insert (`:17`, `:49`, `:222`), pero **ninguna pantalla la llena**: el formulario solo tiene nombre/teléfono/email sueltos. No se consulta `customers` en ningún punto del módulo, no hay `CustomerPicker`/`CustomerSelector`, y una reserva no queda ligada a la ficha del cliente del CRM.
- **¿Se relaciona con `tables`/mesas?** Sí, con `restaurant_tables` (no existe una tabla `tables` ni `mesas` aquí): embed en las lecturas y escrituras de `state` (`reserved`/`occupied`/`free`) en creación, cambio de estado y borrado.
- **¿Se valida el solape?** Solo **para llenar el desplegable de mesas** (`getAvailableTables`, `:382-440`): trae las reservas activas del día y calcula el solape en JS con minutos desde medianoche (`timeToMinutes`, `:498-501`). **No hay validación en `createReservation` ni en `updateReservation`, ni constraint de exclusión en la BD visible desde el código**: dos usuarios (o dos pestañas) pueden asignar la misma mesa al mismo horario, y editar la fecha/hora de una reserva existente no revalida nada.

---

### C. Comandas de cocina

Ruta: `/app/pos/comandas` · página `app/app/pos/comandas/page.tsx` (370 líneas)
· componentes en `components/pos/comandas/` · servicio `lib/services/kitchenService.ts` (473 líneas)
· impresión `lib/services/printJobsService.ts` y `components/pos/configuracion/printersService.ts`.

#### C7. Cabecera, sonido, refresco

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | (icono `ChefHat` azul, 8×8) | Decorativo | Siempre | `components/pos/comandas/PageHeader.tsx:20` |
| 2 | texto | `Comandas de Cocina` | Título h1, cabecera `sticky top-0 z-10` | Siempre | `components/pos/comandas/PageHeader.tsx:22-24` |
| 3 | texto | `Monitor en tiempo real` | Subtítulo | Siempre | `components/pos/comandas/PageHeader.tsx:25-27` |
| 4 | toggle | tooltip `Desactivar sonido de notificación` \| `Activar sonido de notificación` (icono `Volume2`/`VolumeX`, **sin texto**) | Activa/desactiva el beep de ticket nuevo. **Estado en memoria: se pierde al recargar** y **cambiarlo vuelve a suscribir el canal Realtime y recarga los tickets** | Siempre (`onToggleSound` siempre se pasa) | `PageHeader.tsx:32-41` + `app/app/pos/comandas/page.tsx:304-305,116` |
| 5 | botón | `Actualizar` (texto oculto en móvil: `hidden sm:inline`) | `loadTickets()` con esqueleto completo | Siempre; `disabled` mientras carga | `PageHeader.tsx:42-50` |
| 6 | badge | `Sucursal:` + sucursal activa | `BranchBadge` del `BranchContext`. **No hay filtro de sucursal propio** en el módulo: correcto | Siempre | `app/app/pos/comandas/page.tsx:308` |
| 7 | estado | (beep 880→660 Hz, 0,4 s) | Web Audio API, sin archivo de audio. Puede quedar bloqueado por la política de autoplay si el usuario no ha interactuado | Al llegar tickets `new` desconocidos y `soundEnabled` | `lib/utils/sound.ts:5-32` + `page.tsx:95-96` |
| 8 | toast | `Nuevo ticket de cocina` \| `Nuevos tickets de cocina` / lista de mesas o `Ticket #{id}` | Aviso de tickets nuevos por Realtime. **Se suprime junto con el sonido**: el toggle apaga las dos cosas | Con tickets `new` no vistos y `soundEnabled` | `page.tsx:95-103` |

Refresco: **Realtime, no `setInterval`**. `KitchenService.subscribeToKitchenTickets` abre un canal `postgres_changes` (detalle en C11). El efecto que suscribe depende de `statusFilter`, `zoneFilter`, `soundEnabled` y `branchFilter` (`page.tsx:116`), así que cada cambio de filtro **cierra y reabre el canal** y vuelve a llamar `loadTickets()`.

#### C8. FilterBar

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 9 | chip | `Todas las Zonas` (icono `Filter`) | Quita el filtro de zona | Siempre. Fila con *drag-scroll* (`useDragScroll`) | `FilterBar.tsx:59-67` |
| 10 | chip | `{zona}` (icono `MapPin`) | Filtra por zona. **La lista de zonas sale de los tickets cargados**, no de `restaurant_tables`: una zona sin comandas activas no aparece | Una por zona presente en los tickets | `FilterBar.tsx:68-79` + `page.tsx:53-61` |
| 11 | chip | `Todas las Estaciones` | Quita el filtro de estación | Siempre | `FilterBar.tsx:84-91` |
| 12 | chip | `Cocina Caliente` (icono `ChefHat`) | Filtra a `hot_kitchen` | Siempre. **Las 3 estaciones están cableadas** en `STATIONS`, no salen de `printer_station_assignments` ni de `categories.station` | `FilterBar.tsx:92-103` + `:27-31` |
| 13 | chip | `Cocina Fría` (icono `Snowflake`) | Filtra a `cold_kitchen` | Siempre (cableada) | `FilterBar.tsx:27-31,92-103` |
| 14 | chip | `Bar` (icono `Wine`) | Filtra a `bar` | Siempre (cableada) | `FilterBar.tsx:27-31,92-103` |
| 15 | botón | `Todos` | Quita el filtro de estado | Siempre | `FilterBar.tsx:108-115` |
| 16 | botón + badge | `Nuevos` + contador | Filtra `status = 'new'` en el servidor | Siempre; el badge solo si el contador > 0 | `FilterBar.tsx:116-128` |
| 17 | botón + badge | `En Preparación` + contador | Filtra `status = 'preparing'` | Siempre; badge si > 0 | `FilterBar.tsx:129-141` |
| 18 | botón + badge | `Listos` + contador | Filtra `status = 'ready'` | Siempre; badge si > 0 | `FilterBar.tsx:142-154` |
| 19 | botón + badge | `Entregados` + contador | Filtra `status = 'delivered'` | Siempre; badge si > 0 | `FilterBar.tsx:155-167` |
| 20 | cálculo | (contadores de los 4 botones) | **Sí, se calculan en el navegador**, y sobre una lista **ya filtrada dos veces** | Siempre | `page.tsx:267-277,321-326` |

**Los contadores mienten.** `statusCounts` se deriva de `ticketsByStatus`, que se construye con `.filter()` sobre `stationTickets` (`page.tsx:272-277`), y `stationTickets` sale de `tickets`, que el servicio ya filtró por estado en el servidor (`kitchenService.ts:120-122`). Consecuencia: al pulsar `Nuevos`, los contadores de `En Preparación`, `Listos` y `Entregados` caen a 0 y sus badges desaparecen. Lo mismo pasa con el filtro de estación: al elegir `Bar`, los cuatro contadores solo cuentan tickets con algún ítem de bar. No hay ninguna consulta de agregados contra la BD.

#### C9. TicketCard, estados, tiempos y reimpresión

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 21 | texto | `{nombre de mesa}` \| `POS` \| `Mesa` | Título de la tarjeta. `POS` si `source === 'pos'` y no hay mesa; `Mesa` como último recurso | Siempre | `TicketCard.tsx:99,155-157` |
| 22 | badge | `{zona}` | Zona de la mesa, badge `outline` | Solo si la sesión de mesa tiene zona | `TicketCard.tsx:158-162` |
| 23 | estado | `{n} min` (icono `Clock`) | Minutos desde `created_at`; se **congela en `ready_at`** si el ticket ya está listo/entregado. Urgencia: gris < 10, naranja en negrita ≥ 10, rojo en negrita con `animate-pulse` ≥ 20. **Umbrales cableados**, no configurables por organización | Siempre | `TicketCard.tsx:103-125,165-169` |
| 24 | tooltip | `Tiempo de espera elevado` (emoji 🔥) | Marca de urgencia crítica. **Emoji como icono** | Solo con urgencia `critical` | `TicketCard.tsx:168` |
| 25 | texto | `Ticket #{id}` (icono `Hash`) | Identificador (el id numérico de la BD, no un consecutivo por día) | Siempre | `TicketCard.tsx:170-173` |
| 26 | texto | `{nombre del mesero}` (icono `User`) | De `table_sessions.serverName` (resuelto aparte contra `profiles`) o de `server_name` para tickets del POS | Solo si hay mesero | `TicketCard.tsx:101,174-179` |
| 27 | botón | tooltip `Reimprimir comanda` (icono `Printer`, **sin texto**) | Reencola los `print_jobs` del ticket agrupando por estación; spinner mientras va | Siempre (el padre siempre pasa `onReprint`); `disabled` mientras reimprime | `TicketCard.tsx:184-195,86-95` + `page.tsx:238-254` |
| 28 | badge | `Nuevo` \| `En Preparación` \| `Listo` \| `Entregado` \| `Desconocido` | Estado del ticket, con icono y color | Siempre | `TicketCard.tsx:196-199`, mapa en `:19-52` |
| 29 | tabla | (lista de ítems del ticket) | Un bloque por `kitchen_ticket_items` | Siempre | `TicketCard.tsx:205-328` |
| 30 | estado | (círculo: verde con ✓ / naranja con `ChefHat` pulsando / círculo vacío) | Indicador visual del estado del ítem | Siempre en cada ítem | `TicketCard.tsx:255-267` |
| 31 | texto | `{cantidad}x {producto}` | Tachado y en verde si el ítem está listo o entregado. Cantidad de `sale_items.quantity`, o `item.quantity` para tickets del POS | Siempre | `TicketCard.tsx:213-215,270-277` |
| 32 | badge | `{atributo}: {valor}` | Variantes del producto (índigo) | Si hay `variant_data` con claves | `TicketCard.tsx:279-287` |
| 33 | badge | `{mod.name}` | Modificadores (ámbar), de `sale_items.notes.modifiers` o de `item.modifiers` | Si hay modificadores | `TicketCard.tsx:216-221,289-297` |
| 34 | badge | `Cocina Caliente` \| `Cocina Fría` \| `Bar` \| `General` | Estación del ítem; `General` cuando `station` es `null` | Siempre | `TicketCard.tsx:300-302`, mapa en `:54-65` |
| 35 | badge | `Pendiente` \| `Preparando` \| `Listo` \| `Entregado` | Estado del ítem. Ojo: aquí es `Preparando` y en el ticket `En Preparación` | Siempre | `TicketCard.tsx:303-305`, mapa en `:67-80` |
| 36 | texto | `{categoría}` | Nombre de la categoría del producto | Si el embed trae categoría | `TicketCard.tsx:306-310` |
| 37 | badge | `POS` (morado) | Marca los tickets creados desde el POS sin mesa | Si `ticket.source === 'pos'` | `TicketCard.tsx:311-315` |
| 38 | texto | `📝 {nota}` | Nota del ítem. **Emoji como icono**; si `notes` es objeto muestra `notes.extra` | Si hay nota | `TicketCard.tsx:318-322` |
| 39 | toggle | (el bloque del ítem entero es clicable, **sin ninguna etiqueta que lo diga**) | Cicla el estado del ítem `pending → in_progress → ready → pending`. Bloqueo antidoble-clic de 1,5 s con `setTimeout` | Siempre (`onItemStatusChange` siempre se pasa) | `TicketCard.tsx:223-241,251` |
| 40 | estado | (opacidad 35 %) | Atenúa los ítems que no son de la estación filtrada, **sin explicar por qué** | Con `stationFilter !== 'all'` | `TicketCard.tsx:211,250` |
| 41 | botón | `🔥 Comenzar Preparación` \| `✅ Marcar como Listo` \| `📤 Marcar como Entregado` | Avanza el ticket al siguiente estado. **Tres emojis como iconos** | Solo si hay siguiente estado; en `delivered` el pie desaparece | `TicketCard.tsx:331-342`, siguiente estado en `:133-146` |
| 42 | cálculo | (sin etiqueta) | Autopromoción: si todos los ítems quedan `in_progress`+ el ticket pasa a `preparing`; si todos quedan `ready`/`delivered`, pasa a `ready`. **Solo en el navegador, no hay trigger** | Tras cambiar un ítem | `page.tsx:194-224` |
| 43 | badge | `{n}` por columna | Contador de la columna, calculado en el navegador sobre los tickets **de la página actual** | Siempre | `TicketsGrid.tsx:63` |
| 44 | texto | `Nuevos` \| `En Preparación` \| `Listos para Entregar` \| `Entregados` | Cabeceras de las 4 columnas | Siempre | `TicketsGrid.tsx:24-29,62-65` |
| 45 | atajo | (arrastrar y soltar entre columnas) | `@hello-pangea/dnd`: soltar en otra columna llama `onStatusChange`. **No está documentado en la UI, y permite retroceder** (`Entregados` → `Nuevos`), lo que pone `ready_at = null` | Siempre | `TicketsGrid.tsx:41-50,67-96` + `kitchenService.ts:191-193` |
| 46 | texto | `Mostrando los últimos {12} de {n}` | Tope adicional de 12 tarjetas en la columna Entregados, **encima** de la paginación | Si Entregados supera 12 en la página actual | `TicketsGrid.tsx:31,58,98-102` |
| 47 | toast | `Estado actualizado` / `Ticket #{id} marcado como {estado}` | Éxito al cambiar el ticket (actualización optimista con reversión) | Tras avanzar un ticket | `page.tsx:147-150,119-143` |
| 48 | toast | `{producto} actualizado` / `{producto} marcado como {estado}` | Éxito al cambiar un ítem | Tras clicar un ítem | `page.tsx:189-192` |
| 49 | toast | `Comanda actualizada` / `Ticket #{id} pasó a {estado}` | Aviso de autopromoción | Cuando se dispara la regla 42 | `page.tsx:219-222` |
| 50 | toast | `Reimpresión enviada` / `Ticket #{id} enviado a impresión` | Éxito de reimpresión | Si `enqueued > 0` | `page.tsx:242` |
| 51 | toast | `Sin impresora asignada` / `No hay impresora configurada para: {estaciones}` \| `esta estación` | No había impresora para ninguna estación del ticket. Muestra la **clave cruda** (`hot_kitchen`, `all`), no la etiqueta en español | Si `enqueued === 0` | `page.tsx:243-249` + `printJobsService.ts:391-402` |
| 52 | toast | `Error` / `No se pudo actualizar el estado` | Error al cambiar el ticket; revierte la UI | Si falla el update | `page.tsx:151-159` |
| 53 | toast | `Error` / `No se pudo actualizar el estado del item` | Error al cambiar el ítem; revierte la UI | Si falla el update | `page.tsx:225-234` |
| 54 | toast | `Error` / `No se pudo reimprimir la comanda` | Error de reimpresión | Si lanza `enqueueKitchenTicketByRecord` | `page.tsx:250-253` |

#### C10. Paginación y estados

**No es la paginación del kit.** El repositorio tiene `components/ui/pagination.tsx` y `components/ui/DataTablePagination.tsx`, pero `ComandasPagination` es un componente propio de 144 líneas, uno de ~20 clones equivalentes del repositorio (`ClientesPagination`, `MesasPagination`, `ReservationsPagination` del PMS, etc.).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 55 | menú | `Mostrar` … `por página` · `8`, `12`, `16`, `24`, `32` | Tamaño de página, por defecto 8 | Con al menos 1 comanda | `ComandasPagination.tsx:37-59` + `page.tsx:35` |
| 56 | paginación | `Mostrando {x} a {y} de {n} comandas` \| `Sin comandas` | Rango visible, calculado en el navegador | Siempre en el bloque | `ComandasPagination.tsx:61-72` |
| 57 | botón | (icono `ChevronsLeft`, sin texto ni `title`) | Primera página; `disabled` en la 1 | Siempre | `ComandasPagination.tsx:76-83` |
| 58 | botón | (icono `ChevronLeft`) | Página anterior; `disabled` en la 1 | Siempre | `ComandasPagination.tsx:84-91` |
| 59 | paginación | `{número}` (máx. 7 botones) | Salto a una página, con ventana deslizante | Siempre | `ComandasPagination.tsx:93-122` |
| 60 | botón | (icono `ChevronRight`) | Página siguiente; `disabled` en la última. **Con 0 páginas `totalPages` es 0 y los dos botones de avance quedan habilitados** | Siempre | `ComandasPagination.tsx:124-131` |
| 61 | botón | (icono `ChevronsRight`) | Última página | Siempre | `ComandasPagination.tsx:132-139` |
| 62 | estado | (6 tarjetas esqueleto en 3 columnas) | Carga; usa `CardListSkeleton` común, pero el tablero real tiene 4 columnas | `isLoading` | `LoadingState.tsx:5-7` |
| 63 | estado | `No hay comandas` / `Las nuevas comandas aparecerán aquí en tiempo real` | Vacío. Las props `message`/`description` existen pero **nadie las pasa**: son props muertas, y el texto no cambia aunque el vacío venga de un filtro | `stationTickets.length === 0` | `EmptyState.tsx:7-27` + `page.tsx:336` |
| 64 | toast | `Error` / `No se pudieron cargar las comandas` | Único error de carga: **no hay estado de error en pantalla ni reintento**, y los fallos del Realtime solo van a `console.error` | Si falla `loadTickets` | `page.tsx:63-68,107-109` |

**La paginación rompe el tablero.** `paginatedTickets` corta la lista global ordenada por `created_at` descendente (`page.tsx:280-283`) y **después** la reparte en las 4 columnas (`:286-291`). Con 8 por página y muchos tickets recientes del mismo estado, es normal que tres columnas salgan vacías aunque haya tickets en ellas. Encima, el contador del badge de cada columna (control 43) cuenta solo lo de la página, mientras que `Mostrando x a y de n` cuenta el total: dos verdades distintas en la misma pantalla.

#### C11. Datos de comandas

Cliente: `supabase` de `@/lib/supabase/config` (**navegador**), `kitchenService.ts:1`. Sin route handlers ni RPC.

| Operación | Llamada | Tablas y columnas | Archivo:línea |
|---|---|---|---|
| Listar | `.from('kitchen_tickets').select('*, table_sessions(id, restaurant_table_id, server_id, restaurant_tables(name, zone)), kitchen_ticket_items(*, sale_items(quantity, product_id, notes, products(id, name, category_id, variant_data, categories(name, station, requires_preparation)))))')` ordenado por `created_at` desc | `kitchen_tickets`, `table_sessions`, `restaurant_tables`, `kitchen_ticket_items`, `sale_items`, `products`, `categories`. **Sin `limit` ni ventana temporal**: trae todo el histórico de la organización | `kitchenService.ts:77-124` |
| Filtros servidor | `.eq('organization_id')`, `.eq('branch_id')`, `.eq('status')` | — | `kitchenService.ts:112-122` |
| Filtro de zona | `.filter()` **en el navegador** tras traerlo todo | — | `kitchenService.ts:129-134` |
| Nombre del mesero | `.from('profiles').select('id, first_name, last_name').in('id', serverIds)` — consulta aparte porque `server_id` apunta a `auth.users` | `profiles` | `kitchenService.ts:136-169` |
| Estado del ticket | `.from('kitchen_tickets').update({ status, updated_at, ready_at }).eq('id')` — **sin `.eq('organization_id')`** | `status`, `updated_at`, `ready_at` | `kitchenService.ts:181-203` |
| Estado de los ítems (cascada) | `.from('kitchen_ticket_items').update({ status, updated_at }).eq('kitchen_ticket_id')` | `status`, `updated_at` | `kitchenService.ts:206-221` |
| Estado de un ítem | `.from('kitchen_ticket_items').update({ status, updated_at }).eq('id')` — **sin `.eq('organization_id')`** | `status`, `updated_at` | `kitchenService.ts:233-251` |
| Marcar impreso | `.from('kitchen_tickets').update({ printed_at }).eq('id')` — `markAsPrinted` **no la llama nadie**; la reimpresión de la pantalla no actualiza `printed_at` | `printed_at` | `kitchenService.ts:256-273` |
| Crear desde POS | `.from('kitchen_tickets').insert(...)` + `.from('kitchen_ticket_items').insert(...)` en **dos llamadas sin transacción** | `organization_id`, `branch_id`, `status`, `priority`, `source`, `server_name` / `product_name`, `quantity`, `variant_data`, `modifiers`, `station`, `notes` | `kitchenService.ts:322-389` |
| Entregar | `.update({ status: 'delivered' })` en ticket e ítems — **sin `.eq('organization_id')`**, y se traga los errores en el `catch` | `status`, `updated_at` | `kitchenService.ts:394-412` |
| Añadir ítems | `.from('kitchen_ticket_items').insert(...)` + touch de `updated_at` | ídem | `kitchenService.ts:417-451` |

**Realtime, no `setInterval`.** `supabase.channel('kitchen_tickets_changes')` con dos `postgres_changes` (`event: '*'`) sobre `kitchen_tickets` y `kitchen_ticket_items`, filtrados por `organization_id=eq.{id}` (`kitchenService.ts:278-315`). El *callback* recibe siempre `[]` y solo sirve de señal: el consumidor recarga con sus propios filtros. El nombre del canal está cableado, así que dos instancias del componente en la misma página colisionarían. No hay filtro por `branch_id` en la suscripción: un cambio en otra sucursal también provoca recarga.

**Estaciones de impresión.** Las estaciones *de filtrado* de la pantalla están cableadas (`FilterBar.tsx:27-31`); las estaciones *de impresión* salen de la BD. **No existe una tabla `print_stations`**: el modelo real es `printers` + `printer_station_assignments(id, printer_id, branch_id, station)`, con `station ∈ {hot_kitchen, cold_kitchen, bar, cashier, all}` (`components/pos/configuracion/printersService.ts:7,201-241`). La reimpresión agrupa los ítems por `item.station` (los `null` van a `all`), resuelve las impresoras con `PrintersService.getPrintersByStation(branchId, station)` y encola una fila en `print_jobs` por impresora (`printJobsService.ts:367-437`); la existencia de agente se mira en `print_agents.last_seen_at` con umbral de 45 s (`printJobsService.ts:333,340-360`).

---

### Transversal

#### 12. Roturas y deuda

**Zona horaria (regla dura del repositorio)**

| Qué | Cita | Archivo:línea |
|---|---|---|
| `toISOString().split('T')[0]` para el rango de fechas por defecto de la pantalla | `const today = new Date().toISOString().split('T')[0];` | `app/app/pos/reservas-mesas/page.tsx:37` |
| Lo mismo para la fecha por defecto de una reserva nueva | `const today = new Date().toISOString().split('T')[0];` | `components/pos/reservas-mesas/ReservaFormDialog.tsx:85` |
| Lo mismo en el servicio | `const today = new Date().toISOString().split('T')[0];` | `components/pos/reservas-mesas/reservasMesasService.ts:176` |

En Bogotá (UTC−5), entre las 19:00 y la medianoche los tres devuelven **el día siguiente**: la pantalla abre mostrando las reservas de mañana y el formulario propone mañana. Deben usar `todayInTz(tz)` de `lib/utils/dateDisplay.ts`.

**Fechas sin el timezone de la organización**

- `ReservasList.tsx:73-84`: helpers propios `formatTime` y `formatDate` en lugar de `useFormatDate()`/`formatPlainDate`. Aquí el dato es `date`/`time` puros, así que no hay corrimiento, pero es una tercera copia del helper y evade la regla 3 del repositorio.
- `TicketCard.tsx:103-109`: `new Date(ticket.created_at)` para calcular minutos. Es una resta de instantes, correcta, pero la hora de creación nunca se muestra en la tarjeta (ni siquiera como tooltip).

**Seguridad y multi-tenant**

| Qué | Cita | Archivo:línea |
|---|---|---|
| `.or()` con la búsqueda del usuario interpolada sin escapar → un `,` o un `)` en el buscador altera el filtro PostgREST | `` `customer_name.ilike.%${filters.search}%,...` `` | `reservasMesasService.ts:156-160` |
| Escrituras a `restaurant_tables` sin guarda de organización (3 sitios) | `.from('restaurant_tables').update({ state: 'reserved', ... }).eq('id', ...)` | `reservasMesasService.ts:244-248, 330-340, 368-372` |
| Escrituras a `kitchen_tickets` / `kitchen_ticket_items` sin guarda de organización (4 sitios) | `.update(updateData).eq('id', ticketId)` | `kitchenService.ts:195-200, 213-219, 235-243, 398-408` |
| **Cero comprobación de permisos** en los dos módulos: ningún `usePermission`, `hasPermission` ni guarda de rol. Cualquiera con la ruta puede confirmar, sentar, cancelar y **eliminar** reservas, o marcar comandas como entregadas | (grep sin resultados) | `components/pos/reservas-mesas/**`, `components/pos/comandas/**`, ambas `page.tsx` |
| Borrado físico de reservas sin traza (no hay `deleted_at` ni bitácora) | `.delete().eq('id', id).eq('organization_id', ...)` | `reservasMesasService.ts:358-362` |

**Conteos en el navegador**

- Comandas: `statusCounts` y las 4 columnas se cuentan en JS sobre una lista ya filtrada en servidor → contadores a 0 al filtrar por estado (`page.tsx:267-291`).
- Comandas: zona filtrada en JS tras traer **todo** el histórico sin `limit` (`kitchenService.ts:129-134`), estación también en JS (`page.tsx:267-269`).
- Reservas: los 6 stats se calculan trayendo todas las filas del rango (`reservasMesasService.ts:447-487`).
- Reservas: la lista no pagina ni limita (`reservasMesasService.ts:121-129` + `ReservasList.tsx`).

**Emojis como iconos** — `TicketCard.tsx:168` (`🔥` en urgencia), `:320` (`📝` en notas), `:337-339` (`🔥 Comenzar Preparación`, `✅ Marcar como Listo`, `📤 Marcar como Entregado`). El resto del tablero usa `lucide-react`.

**Paginaciones a mano** — `ComandasPagination.tsx` (144 líneas) reimplementa lo que ya existe en `components/ui/pagination.tsx` y `components/ui/DataTablePagination.tsx`; es uno de ~20 clones del repositorio. Reservas, en el otro extremo, **no tiene ninguna paginación**.

**Props muertas, código muerto y botones deshabilitados sin explicación**

| Qué | Archivo:línea |
|---|---|
| `formatCurrency` importado y nunca usado | `TicketCard.tsx:8` |
| `EmptyState`: props `message` y `description` que nadie pasa | `EmptyState.tsx:7-15` vs `page.tsx:336` |
| `customer_id`: existe en el tipo y en el insert, ninguna pantalla lo llena | `reservasMesasService.ts:17,49,222` |
| `avg_party_size`: se calcula y no se muestra | `reservasMesasService.ts:487` vs `ReservasStats.tsx:13-62` |
| `getTodayReservations()`: sin consumidores en el módulo | `reservasMesasService.ts:175-178` |
| `markAsPrinted()`: sin consumidores; reimprimir no toca `printed_at` | `kitchenService.ts:256-273` |
| `priority` y `estimated_time` de `kitchen_tickets`: en el tipo, nunca renderizados ni usados para ordenar | `kitchenService.ts:13-14` vs `components/pos/comandas/**` |
| El embed pide `categories(name, station, requires_preparation)` y solo se usa `name` | `kitchenService.ts:100-103` vs `TicketCard.tsx:306-310` |
| `Crear Reserva` deshabilitado sin decir qué falta | `ReservaFormDialog.tsx:373-380` |
| Ítems atenuados al 35 % por el filtro de estación, sin explicación ni leyenda | `TicketCard.tsx:211,250` |
| Con «Todas las sucursales» el desplegable de Mesa queda vacío y muestra un aviso engañoso | `ReservaFormDialog.tsx:104,308-312` |

**Filtro de sucursal propio** — No hay ninguno: los dos módulos leen `branchFilter` del `BranchContext` y pintan `BranchBadge` (`reservas-mesas/page.tsx:25,185`; `comandas/page.tsx:22,308`). Correcto según la regla del repositorio.

**Moneda cableada / `confirm()` / `alert()`** — Ninguno. Comandas no muestra importes (por eso `formatCurrency` sobra) y el borrado de reservas usa el `AlertDialog` del kit (`ReservasList.tsx:266-291`).

**Otras roturas funcionales confirmadas**

| Qué | Archivo:línea |
|---|---|
| Las solicitudes especiales se guardan como HTML (`RichTextEditor` → `innerHTML`) y la lista las pinta como texto plano: el usuario ve las etiquetas | `ReservaFormDialog.tsx:341-347` + `shared/RichTextEditor.tsx:65-72` vs `ReservasList.tsx:179` |
| El estado `pending` es inalcanzable: la creación fuerza `status: 'confirmed'`, así que el filtro `Pendiente`, el stat `Pendientes` y la acción `Confirmar` están muertos | `reservasMesasService.ts:227` vs `ReservasHeader.tsx:106-112`, `ReservasStats.tsx:22-29`, `ReservasList.tsx:199-207` |
| El solape solo se valida al **llenar el desplegable**; `createReservation` y `updateReservation` no revalidan → dos pestañas pueden reservar la misma mesa a la misma hora | `reservasMesasService.ts:382-440` vs `:209-255, 260-282` |
| Editar una reserva **no** sincroniza el estado de la mesa: mover la reserva a otra mesa deja la anterior en `reserved` | `reservasMesasService.ts:260-282` |
| `no_show` escribe en `cancelled_at`: se pierde la distinción entre cancelada y no presentada en los informes | `reservasMesasService.ts:310-312` |
| Se puede reservar en el pasado: el campo fecha no tiene `min` y nada lo valida al guardar | `ReservaFormDialog.tsx:231-237,129-130` |
| La reimpresión de tickets creados desde el POS imprime `Producto` × 1: `enqueueKitchenTicketByRecord` lee solo `sale_items`, e ignora `product_name`, `quantity`, `variant_data` y `modifiers`, que es donde el POS los guarda | `printJobsService.ts:463-474` vs `kitchenService.ts:358-369` y `TicketCard.tsx:213-221` |
| El arrastrar y soltar permite retroceder de `Entregados` a `Nuevos`, y eso pone `ready_at = null`: se pierde el tiempo real de preparación | `TicketsGrid.tsx:41-50` + `kitchenService.ts:191-193` |
| La paginación se aplica antes de repartir en columnas: con 8 por página es normal ver tres columnas vacías | `app/app/pos/comandas/page.tsx:280-291` |
| Doble truncado en Entregados: paginación **y** tope de 12 en la columna | `TicketsGrid.tsx:31,58` |
| Cambiar el toggle de sonido reabre el canal Realtime y recarga todos los tickets | `app/app/pos/comandas/page.tsx:116` |
| El buscador de reservas dispara dos consultas por tecla: no hay `debounce` (el formulario sí lo tiene, 300 ms) | `page.tsx:47-86` vs `ReservaFormDialog.tsx:125` |
| Crear un ticket desde el POS son dos `insert` sin transacción: si falla el segundo queda un ticket sin ítems | `kitchenService.ts:342-375` |
| El esqueleto inicial de reservas pinta 4 stats y la pantalla tiene 6; el de comandas pinta 3 columnas y el tablero tiene 4 | `reservas-mesas/page.tsx:175` · `comandas/LoadingState.tsx:6` |

#### 13. Conteo de controles

**Reservas — 69 controles**

| Subsección | Controles |
|---|---|
| R1. Cabecera, acciones y BranchBadge | 6 |
| R2. Filtros y stats | 13 |
| R3. Lista de reservas | 21 |
| R4. ReservaFormDialog | 15 |
| R5. Estados | 14 |
| **Total Reservas** | **69** |

**Comandas — 64 controles**

| Subsección | Controles |
|---|---|
| C7. Cabecera, sonido, refresco | 8 |
| C8. FilterBar | 12 |
| C9. TicketCard, estados, tiempos y reimpresión | 34 |
| C10. Paginación y estados | 10 |
| **Total Comandas** | **64** |

**Total auditado: 133 controles** (69 reservas + 64 comandas).
No cuentan como controles las filas de las tablas de datos (R6 y C11): son 15 operaciones PostgREST en reservas y 11 en comandas, todas desde el navegador, ninguna vía RPC ni route handler.

---

## D. Promociones y su motor


Rutas relativas a `src/`. Auditoría de solo lectura, 2026-09-22.

Archivos cubiertos:

- `app/app/pos/promociones/page.tsx` (81 líneas)
- `app/app/pos/promociones/[id]/page.tsx` (490)
- `app/app/pos/promociones/nuevo/page.tsx` (26)
- `components/pos/promociones/{PromotionsHeader.tsx, PromotionsList.tsx, promotionsService.ts, types.ts, index.ts}`
- `components/pos/promociones/nuevo/PromotionWizard.tsx` (874)
- `lib/services/promotionEngine.ts` (452) y `lib/promotions/vigencia.ts` (95)

---

### 1. Listado `/app/pos/promociones`

#### 1.1 Cabecera y estadísticas

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Promociones` | Título de la página | Siempre | components/pos/promociones/PromotionsHeader.tsx:72 |
| 2 | texto | `Administra descuentos, ofertas y promociones especiales` | Subtítulo | Siempre | PromotionsHeader.tsx:75 |
| 3 | botón | `Cupones` | Navega a `/app/pos/cupones` | Siempre | PromotionsHeader.tsx:81-85 |
| 4 | botón | `Nueva Promoción` | Navega a `/app/pos/promociones/nuevo` | Siempre | PromotionsHeader.tsx:86-91 |
| 5 | stat | `Total Promociones` | `promotions.length` de lo ya cargado | Siempre | PromotionsHeader.tsx:104-107 · page.tsx:69 |
| 6 | stat | `Activas` | Conteo calculado en el navegador (activa + dentro de vigencia) | Siempre | PromotionsHeader.tsx:119-121 · page.tsx:45-51 |

#### 1.2 Filtros

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 7 | campo | `Buscar promociones...` (placeholder) | `ilike` sobre `name`, sin debounce: cada tecla dispara consulta | Siempre | PromotionsHeader.tsx:144-149 · promotionsService.ts:41-43 |
| 8 | menú | Select de estado — `Todos` / `Activas` / `Inactivas` | `eq('is_active', …)` | Siempre | PromotionsHeader.tsx:151-163 |
| 9 | menú | Select de tipo — `Todos` + los 5 de `PROMOTION_TYPE_LABELS` | `eq('promotion_type', …)` | Siempre | PromotionsHeader.tsx:164-177 |
| 10 | botón | *(sin etiqueta: icono `RefreshCw`)* | Recarga el listado; gira mientras `loading` | Siempre | PromotionsHeader.tsx:178-186 |
| 11 | estado | *(implícito)* filtro de sucursal | `branchFilter` del `BranchContext` global, no un selector propio | Siempre | page.tsx:27 · promotionsService.ts:66-68 |

Nota: `PromotionFilters` declara `dateFrom` / `dateTo` (types.ts:119-120) y el servicio los aplica (promotionsService.ts:53-59), pero **ningún control los expone**: son filtros muertos.

#### 1.3 Tabla, badges y menú ⋯

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 12 | tabla | `Promoción` | Nombre + descripción | Siempre | PromotionsList.tsx:188, 207-216 |
| 13 | tabla | `Tipo` | Badge con icono + etiqueta | Siempre | PromotionsList.tsx:189, 217-222 |
| 14 | tabla | `Descuento` | `getDiscountDisplay` | Siempre | PromotionsList.tsx:190, 223-227 |
| 15 | tabla | `Vigencia` | `inicio - fin` | Solo `md:` en adelante (`hidden md:table-cell`) | PromotionsList.tsx:191, 228-236 |
| 16 | tabla | `Usos` | `usage_count` y `/usage_limit` si hay | Siempre | PromotionsList.tsx:192, 237-242 |
| 17 | tabla | `Prioridad` | Badge con el entero | Siempre | PromotionsList.tsx:193, 243-247 |
| 18 | tabla | `Estado` | Badge derivado | Siempre | PromotionsList.tsx:194, 248-250 |
| 19 | tabla | `Acciones` | Menú ⋯ | Siempre | PromotionsList.tsx:195, 251-300 |
| 20 | cálculo | `{discount_value}%` / `formatCurrency` / `{buy}x{get}` / `-` | Texto del descuento por tipo | Según `promotion_type` | PromotionsList.tsx:138-151 |
| 21 | badge | `Inactiva` | `is_active === false` | — | PromotionsList.tsx:115-117 |
| 22 | badge | `Programada` | `start_date > now` (instante, reloj del navegador) | — | PromotionsList.tsx:119-121 |
| 23 | badge | `Expirada` | `end_date < now` | — | PromotionsList.tsx:123-125 |
| 24 | badge | `Activa` | resto | — | PromotionsList.tsx:127 |
| 25 | estado | *(fila atenuada, `opacity-60`)* | Marca la promoción inactiva | `!is_active` | PromotionsList.tsx:202-205 |
| 26 | botón | *(icono `MoreHorizontal`)* | Abre el menú de fila | Siempre | PromotionsList.tsx:252-257 |
| 27 | menú | `Ver Detalles` | `/app/pos/promociones/{id}` | Siempre | PromotionsList.tsx:259-264 |
| 28 | menú | `Editar` | `/app/pos/promociones/{id}?edit=true` | Siempre | PromotionsList.tsx:265-270 |
| 29 | menú | `Duplicar` | `PromotionsService.duplicate` | Siempre | PromotionsList.tsx:271-277 |
| 30 | menú | `Desactivar` / `Activar` | `toggleActive`; lleva un `Switch` decorativo (`pointer-events-none`) | Siempre | PromotionsList.tsx:279-289 |
| 31 | menú | `Eliminar` | Abre el diálogo de confirmación | Siempre | PromotionsList.tsx:291-297 |

El menú ⋯ tiene **5 entradas** + 2 separadores: dentro del límite de 8.

#### 1.4 Diálogos, estados y avisos

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 32 | diálogo | `¿Eliminar promoción?` | Confirmación (AlertDialog del kit, no `confirm()`) | Tras `Eliminar` | PromotionsList.tsx:307-316 |
| 33 | texto | `Esta acción no se puede deshacer. La promoción será eliminada permanentemente.` | Cuerpo del diálogo | — | PromotionsList.tsx:313-315 |
| 34 | botón | `Cancelar` | Cierra | — | PromotionsList.tsx:318-320 |
| 35 | botón | `Eliminar` | Borra reglas y promoción | — | PromotionsList.tsx:321-326 |
| 36 | estado | *(5 `Skeleton` de 16px)* | Cargando el listado | `loading` | PromotionsList.tsx:153-161 |
| 37 | estado | `No hay promociones registradas` | Vacío | `promotions.length === 0` | PromotionsList.tsx:163-172 |
| 38 | texto | `Crea tu primera promoción para comenzar` | Subtexto del vacío | — | PromotionsList.tsx:170-172 |
| 39 | botón | `Nueva Promoción` | CTA del estado vacío | — | PromotionsList.tsx:173-177 |
| 40 | estado | *(PageHeaderSkeleton + StatsSkeleton(3) + CardListSkeleton(5))* | Cargando la organización | `orgLoading` | page.tsx:53-61 |
| 41 | toast | `Error al cargar promociones` | Falla `getAll` | — | page.tsx:31 |
| 42 | toast | `Promoción eliminada correctamente` | — | — | PromotionsList.tsx:65 |
| 43 | toast | `Promoción duplicada correctamente` | — | — | PromotionsList.tsx:78 |
| 44 | toast | `Promoción desactivada` / `Promoción activada` | — | — | PromotionsList.tsx:88 |

**Paginación: no existe.** Ni del kit ni a mano. `PromotionsService.getAll` no lleva `.range()` ni `.limit()` (promotionsService.ts:25-70): trae **todas** las filas de la organización con sus reglas embebidas y `PromotionsList` las pinta todas. No hay estado de error de la tabla (solo el toast).

**Subtotal sección 1: 44 controles.**

---

### 2. Detalle `/app/pos/promociones/[id]`

#### 2.1 Cabecera

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | *(icono `ArrowLeft`)* | Vuelve al listado | Siempre | [id]/page.tsx:248-252 |
| 2 | texto | *(nombre de la promoción)* | Título | Siempre | [id]/page.tsx:258 |
| 3 | badge | `Inactiva` | `!is_active` | — | [id]/page.tsx:140-142 |
| 4 | badge | `Programada` | `start_date > now` | — | [id]/page.tsx:143-145 |
| 5 | badge | `Expirada` | `end_date < now` | — | [id]/page.tsx:146-148 |
| 6 | badge | `Activa` | resto | — | [id]/page.tsx:149 |
| 7 | texto | *(PROMOTION_TYPE_LABELS)* `Porcentaje` / `Monto Fijo` / `Compra X Lleva Y` / `Bundle` / `Envío Gratis` | Subtítulo | Siempre | [id]/page.tsx:262 |
| 8 | botón | `Editar` | `?edit=true` → renderiza el asistente en modo edición | Siempre | [id]/page.tsx:267-272 |
| 9 | botón | `Duplicar` | Crea copia inactiva `… (Copia)` y vuelve al listado | Siempre | [id]/page.tsx:273-276 |
| 10 | botón | `Eliminar` | Abre el diálogo | Siempre | [id]/page.tsx:277-285 |

La lógica de los badges 3-6 es **idéntica** a la del listado (PromotionsList.tsx:110-128) pero **duplicada literalmente**, no compartida (CLAUDE.md §7).

#### 2.2 Bloque «Detalles de la Promoción» — cada campo

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 11 | texto | `Detalles de la Promoción` | Título de la tarjeta | Siempre | [id]/page.tsx:295 |
| 12 | campo | `Descripción` | Imprime `promotion.description` **como texto plano** | `promotion.description` no vacía | [id]/page.tsx:298-303 |
| 13 | campo | `Descuento` | `getDiscountDisplay`: `%`, `formatCurrency`, `Compra X, Lleva Y` o `-` | Siempre | [id]/page.tsx:309-312, 121-133 |
| 14 | campo | `Aplica a` | `Todos los productos` / `Productos específicos` / `Categorías específicas` | Siempre | [id]/page.tsx:315-316 |
| 15 | campo | `Fecha Inicio` | `formatFechaVigencia` — **`timeZone: 'UTC'` cableado** | Siempre | [id]/page.tsx:324-328, 165-172 |
| 16 | campo | `Fecha Fin` / `Sin fecha fin` | idem | Siempre | [id]/page.tsx:331-335 |
| 17 | campo | `Días de la semana` | 7 badges `Lun`…`Dom`, los no elegidos con `opacity-40` | `applicable_days` con elementos | [id]/page.tsx:339-354 |
| 18 | texto | `Todos los días` | Alternativa al anterior | `applicable_days` nula o vacía | [id]/page.tsx:355-357 |
| 19 | campo | `Compra Mínima` | `formatCurrency(min_purchase_amount)` | Solo si tiene valor (truthy: **0 no se muestra**) | [id]/page.tsx:362-370 |
| 20 | campo | `Descuento Máximo` | `formatCurrency(max_discount_amount)` | Solo si tiene valor | [id]/page.tsx:372-377 |
| 21 | campo | `Reglas Aplicadas` | Lista de reglas | `rules.length > 0` | [id]/page.tsx:380-398 |
| 22 | badge | `Incluye` / `Excluye` | Según `rule_type.startsWith('include')` | Por regla | [id]/page.tsx:388-390 |
| 23 | texto | *(nombre del producto o de la categoría)* | Resuelto con dos consultas extra en `getById` | Por regla | [id]/page.tsx:391-392 · promotionsService.ts:123-137 |

**Campos que la ficha NO muestra**, aunque existen en la fila y el asistente los edita: canales (`applies_to_pos` / `applies_to_web` / `applies_to_finances`), sucursales (`branches`), `buy_quantity` / `get_quantity` por separado (solo dentro del texto de descuento) y `created_by`.

#### 2.3 Panel lateral: «Estado», «Estadísticas» e info

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 24 | texto | `Estado` | Título de tarjeta | Siempre | [id]/page.tsx:407 |
| 25 | estado | `Activa` / `Inactiva` (+ `CheckCircle`/`XCircle`) | Refleja `is_active` | Siempre | [id]/page.tsx:412-419 |
| 26 | toggle | *(Switch sin etiqueta)* | `toggleActive`; se deshabilita mientras `toggling` | Siempre | [id]/page.tsx:421-426 |
| 27 | texto | `Estadísticas` | Título de tarjeta | Siempre | [id]/page.tsx:434 |
| 28 | stat | `Usos` | `usage_count` (+ `/usage_limit`) | Siempre | [id]/page.tsx:437-445 |
| 29 | stat | `Prioridad` | Badge con `priority` | Siempre | [id]/page.tsx:446-449 |
| 30 | stat | `Combinable` | Badge `Sí` / `No` | Siempre | [id]/page.tsx:450-455 |
| 31 | texto | `Creada:` | `formatDate` (hora local del navegador) | Siempre | [id]/page.tsx:463, 153-159 |
| 32 | texto | `Actualizada:` | idem | Siempre | [id]/page.tsx:464 |

Las «Estadísticas» son **tres columnas de la propia fila `promotions`** (`usage_count`, `priority`, `is_combinable`): no hay agregación de ventas, ni importe descontado, ni número de transacciones. No existe tabla de redenciones (ver §5).

#### 2.4 Diálogos y estados

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 33 | diálogo | `¿Eliminar promoción?` | AlertDialog del kit | Tras `Eliminar` | [id]/page.tsx:472-487 |
| 34 | botón | `Cancelar` | Cierra | — | [id]/page.tsx:481 |
| 35 | botón | `Eliminar` | Borra y navega al listado | — | [id]/page.tsx:482-484 |
| 36 | estado | *(PageHeaderSkeleton + DetailSkeleton)* | Cargando | `orgLoading \|\| loading` | [id]/page.tsx:174-181 |
| 37 | estado | `Promoción no encontrada` | No existe o fue borrada | `!promotion` | [id]/page.tsx:183-198 |
| 38 | botón | `Volver a Promociones` | CTA del estado anterior | — | [id]/page.tsx:192-194 |
| 39 | estado | *(modo edición)* | Renderiza `PromotionWizard` con `initialData` | `?edit=true` | [id]/page.tsx:200-239 |
| 40 | toast | `Error al cargar la promoción` | — | — | [id]/page.tsx:67 |
| 41 | toast | `Promoción eliminada correctamente` | — | — | [id]/page.tsx:80 |
| 42 | toast | `Promoción duplicada correctamente` | — | — | [id]/page.tsx:91 |
| 43 | toast | `Promoción desactivada` / `Promoción activada` | — | — | [id]/page.tsx:102 |
| 44 | toast | `Error al eliminar la promoción` / `Error al duplicar la promoción` / `Error al cambiar estado` | Fallbacks | — | [id]/page.tsx:83, 93, 105 |

**Subtotal sección 2: 44 controles.**

---

### 3. Asistente de 4 pasos `nuevo/PromotionWizard.tsx`

Los pasos están cableados en `WIZARD_STEPS` (PromotionWizard.tsx:55-60). El mismo componente sirve para crear (`nuevo/page.tsx:22`) y para editar (`[id]/page.tsx:203-236`, con `promotionId` + `initialData`).

#### 3.0 Armazón del asistente

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | pestaña | `Datos Básicos` | Paso 0 (icono `Tag`) | Siempre | PromotionWizard.tsx:56, 259-293 |
| 2 | pestaña | `Descuento` | Paso 1 (`Percent`) | Siempre | PromotionWizard.tsx:57 |
| 3 | pestaña | `Vigencia` | Paso 2 (`Calendar`) | Siempre | PromotionWizard.tsx:58 |
| 4 | pestaña | `Reglas` | Paso 3 (`Filter`) | Siempre | PromotionWizard.tsx:59 |
| 5 | estado | *(círculo verde con `Check`)* | Paso ya superado | `index < currentStep` | PromotionWizard.tsx:261-274 |
| 6 | texto | *(título del paso actual en la tarjeta)* | Encabezado | Siempre | PromotionWizard.tsx:300-306 |
| 7 | botón | `Cancelar` | Vuelve al listado | `currentStep === 0` | PromotionWizard.tsx:851-858 |
| 8 | botón | `Anterior` | Retrocede un paso (sin validar) | `currentStep > 0` | PromotionWizard.tsx:851-858, 184-186 |
| 9 | botón | `Siguiente` | Valida el paso y avanza | Pasos 0-2 | PromotionWizard.tsx:860-864, 178-182 |
| 10 | botón | `Crear Promoción` / `Actualizar` / `Guardando...` | Guarda | Paso 3 | PromotionWizard.tsx:866-869 |

Las pestañas **no son clicables**: solo indicadores. No hay navegación libre entre pasos ni resumen final antes de guardar.

#### 3.1 Paso «Datos Básicos»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 11 | campo | `Nombre de la Promoción *` — placeholder `ej: Descuento de Verano` | Texto libre. **Obligatorio**: `!name.trim()` → toast `El nombre es requerido`. Sin `maxLength` aunque la columna es `varchar(100)` | Siempre | PromotionWizard.tsx:313-319 · validación 144-147 |
| 12 | campo | `Descripción` — placeholder `Descripción de la promoción...` | `RichTextEditor`: **guarda HTML** en `description` | Siempre | PromotionWizard.tsx:322-328 |
| 13 | campo | `Prioridad` | Numérico, `min=0`, default 0. Sin validación | Siempre | PromotionWizard.tsx:332-339 |
| 14 | texto | `Mayor número = Mayor prioridad` | Ayuda | Siempre | PromotionWizard.tsx:340 |
| 15 | toggle | `Combinable` | `is_combinable`, default `false` | Siempre | PromotionWizard.tsx:344-353 |
| 16 | texto | `Permitir con otras promociones` | Ayuda del toggle | Siempre | PromotionWizard.tsx:345-347 |

#### 3.2 Paso «Descuento»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 17 | texto | `Tipo de Promoción` | Encabezado del selector | Siempre | PromotionWizard.tsx:363 |
| 18 | botón | `Porcentaje` | `promotion_type='percentage'`; al cambiar de tipo pone `discount_value=0` y `max_discount_amount=undefined` | Siempre | PromotionWizard.tsx:365-406 |
| 19 | botón | `Monto Fijo` | `fixed_amount` | Siempre | idem |
| 20 | botón | `Compra X Lleva Y` | `buy_x_get_y` | Siempre | idem |
| 21 | botón | `Bundle` | `bundle` | Siempre | idem |
| 22 | botón | `Envío Gratis` | `free_shipping`. **Sin icono** (`getPromotionTypeIcon` no tiene ese caso) y **sin campos propios** | Siempre | idem · 244-251 |
| 23 | campo | `Porcentaje de Descuento` | Numérico `min=0 max=100`, sufijo `%`. **Obligatorio**: 1-100, si no, toast `El porcentaje debe ser entre 1 y 100` | `promotion_type === 'percentage'` | PromotionWizard.tsx:411-429 · 150-153 |
| 24 | campo | `Monto de Descuento` | Mismo control, sufijo `$` **cableado**, sin `max`. **Obligatorio > 0**: toast `El monto de descuento debe ser mayor a 0` | `promotion_type === 'fixed_amount'` | PromotionWizard.tsx:411-429 · 154-157 |
| 25 | campo | `Descuento Máximo (opcional)` — placeholder `Sin límite` | Tope del descuento calculado | **Solo** `percentage` | PromotionWizard.tsx:434-446 |
| 26 | campo | `Compra (X)` | Numérico `min=1`. Obligatorio junto con el siguiente | `buy_x_get_y` | PromotionWizard.tsx:452-461 · 158-161 |
| 27 | campo | `Lleva (Y)` | Numérico `min=1` | `buy_x_get_y` | PromotionWizard.tsx:462-471 |
| 28 | campo | `Compra Mínima (opcional)` — placeholder `Sin mínimo` | `min_purchase_amount`, sin símbolo de moneda | **Siempre** (los 5 tipos) | PromotionWizard.tsx:475-485 |

**Campos por tipo, resumido:**

| Tipo | Campos que aparecen | Validación |
|---|---|---|
| `percentage` | Porcentaje de Descuento, Descuento Máximo (opc.), Compra Mínima (opc.) | 1 ≤ valor ≤ 100 |
| `fixed_amount` | Monto de Descuento, Compra Mínima (opc.) | valor > 0 |
| `buy_x_get_y` | Compra (X), Lleva (Y), Compra Mínima (opc.) | ambas > 0 |
| `bundle` | **solo** Compra Mínima (opc.) | **ninguna** |
| `free_shipping` | **solo** Compra Mínima (opc.) | **ninguna** |

`bundle` se puede guardar con `discount_value = 0` (el `Siguiente` no lo impide) y entonces el motor calcula 0 y la descarta (promotionEngine.ts:289-303, 404).

#### 3.3 Paso «Vigencia»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 29 | campo | `Fecha de Inicio *` | `<input type="date">`. Valor inicial `new Date().toISOString().split('T')[0]`. **Obligatorio**: toast `La fecha de inicio es requerida` | Siempre | PromotionWizard.tsx:494-500 · 80 · 163-167 |
| 30 | campo | `Fecha de Fin (opcional)` | `<input type="date">`. Validación: no anterior al inicio → toast `La fecha de fin debe ser posterior a la fecha de inicio` | Siempre | PromotionWizard.tsx:502-510 · 168-171 |
| 31 | campo | `Límite de Usos (opcional)` — placeholder `Sin límite` | `usage_limit`, `min=1`. **Nadie lo hace cumplir** (ver §4) | Siempre | PromotionWizard.tsx:515-523 |
| 32 | toggle | `Activa` | `is_active`, default `true` | Siempre | PromotionWizard.tsx:527-536 |
| 33 | texto | `La promoción estará disponible inmediatamente` | Ayuda | Siempre | PromotionWizard.tsx:528-530 |
| 34 | texto | `Canales de Aplicación` + `Dónde se puede usar esta promoción` | Encabezado | Siempre | PromotionWizard.tsx:542-545 |
| 35 | toggle | `Web / Pedidos Online` (`Sitio público`) | `applies_to_web`, default `true` | Siempre | PromotionWizard.tsx:547-557 |
| 36 | toggle | `POS` (`Ventas en tienda`) | `applies_to_pos`, default `true` | Siempre | PromotionWizard.tsx:558-568 |
| 37 | toggle | `Finanzas` (`Facturación / Documentos`) | `applies_to_finances`, default `false` en el formulario aunque la columna tiene `DEFAULT true` | Siempre | PromotionWizard.tsx:569-579 · baseline_schema.sql (promotions) |
| 38 | texto | `Días de Aplicación` + `Selecciona los días. Si no seleccionas ninguno, aplica todos los días.` | Encabezado | Siempre | PromotionWizard.tsx:587-590 |
| 39 | botón | `Todos los días` | Pone `applicable_days = null` | Siempre | PromotionWizard.tsx:592-600 |
| 40 | chip | `Lunes` `Martes` `Miércoles` `Jueves` `Viernes` `Sábado` `Domingo` | Alternan el día; lista vacía → `null` | Siempre | PromotionWizard.tsx:602-627 |
| 41 | texto | `Aplica los: …` | Resumen de días elegidos | Hay días elegidos | PromotionWizard.tsx:628-634 |
| 42 | texto | `Aplica todos los días de la semana` | Alternativa | Sin días | PromotionWizard.tsx:635-639 |

**No hay ningún control de sucursales en el asistente.** `branches` existe en la columna, en `CreatePromotionData` (types.ts:97), lo filtra el listado (promotionsService.ts:66-68) y lo filtra el motor (promotionEngine.ts:342-346), pero el asistente no lo pinta: `grep branches PromotionWizard.tsx` no devuelve nada. Solo se conserva al editar porque el detalle lo reinyecta en `initialData` ([id]/page.tsx:226).

**Tampoco hay franja horaria** (`hora desde` / `hora hasta`): ni columna, ni campo, ni evaluación.

#### 3.4 Paso «Reglas»

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 43 | texto | `Aplica a` | Encabezado | Siempre | PromotionWizard.tsx:648 |
| 44 | botón | `Todos los productos` | `applies_to='all'` | Siempre | PromotionWizard.tsx:650-671 |
| 45 | botón | `Productos específicos` | `applies_to='products'` | Siempre | idem |
| 46 | botón | `Categorías específicas` | `applies_to='categories'` | Siempre | idem |
| 47 | menú | `Incluir` / `Excluir` | `ruleType`; se mapea a `include_product`/`exclude_product`/`include_category`/`exclude_category` | `products` o `categories` | PromotionWizard.tsx:678-686, 816-824 · 193-197 |
| 48 | campo | `Buscar productos por nombre, SKU o variante...` | Busca en servidor (`getProducts`, tope 50) **y además** filtra en memoria por nombre/SKU/padre/atributos | `applies_to === 'products'` | PromotionWizard.tsx:687-692, 706-719 |
| 49 | tabla | *(lista de productos con casillas, agrupada por producto padre)* | Selección múltiple | `applies_to === 'products'` | PromotionWizard.tsx:694-788 |
| 50 | estado | `No se encontraron productos` | Sin resultados | — | PromotionWizard.tsx:730-737 |
| 51 | chip | *(badges de productos elegidos: `Padre · Color: Rojo · Talla: M`)* | Resumen de la selección | `selectedProducts.length > 0` | PromotionWizard.tsx:789-810 |
| 52 | tabla | *(lista de categorías con casillas)* | Selección múltiple, sin buscador y **sin resumen de elegidas** | `applies_to === 'categories'` | PromotionWizard.tsx:825-841 |

**Modelo de «Reglas», en claro.** Solo existen dos ejes: **productos** y **categorías**, y un único modo (`Incluir` **o** `Excluir`) para toda la promoción — no se puede combinar «incluye la categoría X pero excluye el producto Y» desde el asistente, aunque el motor sí sabría evaluarlo (promotionEngine.ts:194-202). **No hay** reglas por cliente ni por segmento (`customer_id` viaja al motor y no se usa, promotionEngine.ts:54), **ni por sucursal** (existe en datos, no en la interfaz), **ni por día** en este paso (los días viven en «Vigencia»), **ni por hora**, **ni por monto mínimo** aquí (vive en «Descuento»), **ni por marca** (`include_brand`/`exclude_brand` existen en el CHECK de la BD y en el motor, pero no hay control que los genere).

**Previsualización y simulador: confirmado que NO existen.** No hay ninguna lista de «productos alcanzados», ni conteo, ni carrito de prueba, ni llamada a `promotionEngine` desde el asistente. La única señal es el `Badge` con los productos marcados a mano (PromotionWizard.tsx:789-810). El asistente nunca importa `promotionEngine` (`grep promotionEngine PromotionWizard.tsx` vacío). El usuario guarda a ciegas y solo descubre a quién alcanza vendiendo.

**Subtotal sección 3: 52 controles.**

---

### 4. Motor `lib/services/promotionEngine.ts`

#### 4.1 Contrato

- **Entrada** `PromotionContext` (promotionEngine.ts:49-56): `channel: 'pos'|'web'|'finances'`, `items: PromotionItem[]` (`product_id`, `parent_product_id?`, `category_id?`, `brand?`, `quantity`, `unit_price` — promotionEngine.ts:35-47), `organization_id`, `branch_id?`, `customer_id?`, `date?`.
- **Salida** `PromotionEvaluationResult` (promotionEngine.ts:67-72): `discountTotal`, `itemDiscounts: Record<product_id, monto>`, `applied: AppliedPromotion[]`, `items`.
- Es un singleton exportado (promotionEngine.ts:452) que usa el **cliente de navegador** `@/lib/supabase/config` (promotionEngine.ts:24) — por eso funciona con RLS desde componentes cliente, y por eso en las rutas de servidor que lo importan (`app/api/web-orders/route.ts:4`) corre con ese mismo cliente.

#### 4.2 Orden de evaluación (`evaluate`, promotionEngine.ts:322-432)

1. **Carga** (`loadActivePromotions`, 80-146): `promotions` + embed `promotion_rules`, filtrando `organization_id`, `is_active = true`, `start_date <= now`, y el flag del canal (`applies_to_pos` / `applies_to_web` / `applies_to_finances`), ordenado por `priority` desc.
2. **Vigencia en memoria**: `isWithinEndDate` (136) y `appliesOnWeekDay` con `weekDayOfLocalDate` (142-143), ambos de `lib/promotions/vigencia.ts`.
3. **Sucursal** (342-346): sin `branches` o vacío → aplica a todas; con elementos, debe contener `ctx.branch_id` (si no hay `branch_id`, se descarta).
4. **Compra mínima** (349-359): compara `min_purchase_amount` contra el subtotal **de todo el carrito**, no contra los ítems que la promoción alcanza.
5. **Combinables vs. no combinables** (362-385).
6. **Aplicación** (392-419): por promoción, filtra ítems con `itemMatchesRules`, calcula, acumula en `itemDiscounts` y añade a `applied`.
7. `discountTotal` redondeado a 2 decimales (427).

#### 4.3 Acumulación / exclusividad

Regla real (promotionEngine.ts:369-385): si hay **alguna** no combinable, se toma **la de mayor prioridad** (`nonCombinable[0]`, apoyándose en el `order` de la consulta), se calcula su descuento y se compara con **la suma de todas las combinables**; gana el mayor y se aplica **ese bloque entero**, descartando el otro. Si no hay ninguna no combinable, se aplican **todas** las combinables y sus descuentos se **suman por producto** (406-408).

Consecuencias verificadas:

- Solo se considera **una** no combinable: la segunda mejor nunca se evalúa aunque la primera no alcance a ningún ítem (`nonCombinable[0]` se elige **antes** de comprobar si tiene ítems aplicables).
- `calculateForPromotion` (438-448) recalcula todo una segunda vez para la comparación: cada promoción se evalúa dos veces.
- Varias combinables sobre el mismo ítem pueden sumar **más que el precio del ítem**: no hay tope por línea. El único tope es `max_discount_amount` **por promoción** (307-314).
- `usage_limit` **no se comprueba en ningún punto del motor** (`grep usage_limit promotionEngine.ts` vacío): una promoción con «Límite de Usos: 100» se sigue aplicando en la venta 101. El límite es puramente decorativo.
- `free_shipping` **no tiene caso** en el `switch` de `calculatePromotionDiscount` (220-304): descuento 0 → se descarta en 404. El tipo se puede crear pero no hace nada.
- `customer_id` entra por el contexto (54) y **nunca se lee**.

#### 4.4 Descuento manual: **CONFIRMADO**

El motor **no sabe nada** de descuentos manuales — devuelve siempre `itemDiscounts` completo. Quien decide es `posService`, y lo hace con la misma guarda en los dos puntos:

`lib/services/posService.ts:1695-1702` (checkout):

```ts
for (const item of cart.items) {
  if (!item.discount_amount || item.discount_amount === 0) {
    const promoDiscount = promoResult.itemDiscounts[item.product_id] || 0;
    if (promoDiscount > 0) {
      item.discount_amount = promoDiscount;
    }
  }
}
```

`lib/services/posService.ts:2713-2720` (`calculateCartTotals`): bloque idéntico, misma condición `if (!item.discount_amount || item.discount_amount === 0)`.

Es decir: **sí, la promoción solo se aplica si la línea no tiene descuento manual**; el descuento manual gana siempre, aunque sea de 1 peso frente a una promoción del 50 %. Y no se avisa al cajero de que la promoción se descartó. El comentario del código lo declara explícitamente en posService.ts:1673 (`Aplica descuentos automáticos a items que no tengan discount_amount manual`).

El efecto secundario: una vez que `calculateCartTotals` escribió `discount_amount` por promoción, ese ítem **ya no está vacío**, así que un recálculo posterior lo toma por «manual» y no lo recalcula — si el cajero cambia la cantidad, el descuento de promoción se queda congelado con el importe de la cantidad anterior (`calculateCartTotals` se llama en posService.ts:967, 992, 1026, 1056, 1084, 1195, 1215).

#### 4.5 Dónde se invoca exactamente

| Llamada | Canal | Archivo:línea |
|---|---|---|
| `posService.calculateCartTotals` (cada alta/baja/cambio de línea del carrito) | `pos` | lib/services/posService.ts:2697 |
| `posService.checkout` (antes de crear la venta) | `pos` | lib/services/posService.ts:1680 |
| Pedidos de mesas | `pos` | components/pos/mesas/id/pedidosService.ts:310 |
| Pedidos web (route handler) | `web` | app/api/web-orders/route.ts:149 |
| Nueva factura de venta | `finances` | components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm.tsx:616 (import dinámico en :615) |
| Cotizaciones | según servicio | lib/services/cotizacionesService.ts:174 |
| Check-out de PMS | — | components/pms/checkout/CheckoutDialog.tsx:487 |
| Registro del uso tras la venta | RPC `increment_promotion_usage` | lib/services/posService.ts:1982 y migración `20260921100000_pos_checkout_v1_rpc_atomica.sql:293` |

#### 4.6 ¿Lo usan `CartView.tsx` y `CheckoutDialog.tsx`? **NO**

Ninguno de los dos importa ni menciona el motor: `grep -n "promo\|Promo" src/components/pos/CartView.tsx src/components/pos/CheckoutDialog.tsx` no devuelve **ninguna** línea. Toda la interacción es indirecta, a través de `posService`. Consecuencias para el cajero:

- `CartView.tsx:153` solo lee `cart.discount_total`; `CheckoutDialog.tsx:1869-1873` solo pinta `Descuentos: -{formatCurrency(cart.discount_total)}`.
- **El nombre de la promoción aplicada nunca se muestra.** `promoResult.applied` (con `promotion_name`) se calcula, se usa para el contador de usos y se tira. En la pantalla, un descuento de promoción y uno manual son indistinguibles.
- No hay forma de que el cajero sepa **por qué** un ítem lleva descuento, ni de que vea que su descuento manual anuló una promoción mejor.

---

### 5. Datos

#### 5.1 `promotionsService.ts`

| Operación | Tabla | Columnas / embed | Archivo:línea |
|---|---|---|---|
| `getAll` | `promotions` | `*` + embed `promotion_rules (id, rule_type, product_id, category_id, created_at)`; `eq organization_id`; `order priority desc, created_at desc`; filtros `ilike name`, `eq is_active`, `eq promotion_type`, `gte start_date`, `lte end_date`, `or(branches.is.null,branches.eq.[],branches.cs.[N])`. **Sin `range`/`limit`** | promotionsService.ts:25-70 |
| `getById` | `promotions` | igual + `.eq('id')` + `.single()` | promotionsService.ts:94-108 |
| `getById` (resolución de nombres) | `products` / `categories` | `id, name, sku` / `id, name`, con `.in(...)` — **dos consultas extra**, no un join | promotionsService.ts:123-137 |
| `create` | `promotions` | `insert` con `organization_id`, `created_by` = `auth.getUser()`, defaults `is_active`, `is_combinable`, `priority`, `usage_count: 0` | promotionsService.ts:163-176 |
| `createRules` | `promotion_rules` | `insert` `{promotion_id, rule_type, product_id, category_id}` | promotionsService.ts:250-252 |
| `update` | `promotions` | `update` + `updated_at` a mano; luego **borra todas** las reglas y reinserta | promotionsService.ts:202-230 |
| `delete` | `promotion_rules` + `promotions` | Dos `delete` no transaccionales: si el segundo falla, la promoción queda **sin reglas** | promotionsService.ts:268-278 |
| `getProducts` | `products` | `id, uuid, sku, name, unit_code, is_parent, parent_product_id, variant_data, categories(name)`; `status='active'`, `product_type != 'service'`, `is_parent != true`, `limit(50)`; + consultas de padres y de padres huérfanos por SKU | promotionsService.ts:333-384 |
| `getCategories` | `categories` | `id, name`, `eq organization_id`, `eq is_active` | promotionsService.ts:418-422 |

**`.rpc(...)`: ninguno en `promotionsService.ts`.** La organización sale de `obtenerOrganizacionActiva()` (promotionsService.ts:13-16), que lee `localStorage` (`lib/hooks/useOrganization.ts:295-320`): es un valor del cliente, y la garantía real es la RLS de `promotions`.

#### 5.2 `promotionEngine.ts`

| Operación | Tabla | Columnas | Archivo:línea |
|---|---|---|---|
| `loadActivePromotions` | `promotions` | `*` + embed `promotion_rules (id, rule_type, product_id, category_id, created_at)`; `eq organization_id`, `eq is_active true`, `lte start_date`, `eq applies_to_{pos\|web\|finances}`, `order priority desc` | promotionEngine.ts:87-110 |

Es la **única** consulta del motor: no hay `.rpc(...)`, ni lectura de precios, ni de `stock_levels`. El embed vuelve como `promotion_rules` y se renombra a `rules` en promotionEngine.ts:125-128 (defecto ya corregido y documentado allí mismo).

#### 5.3 ¿Dónde viven las reglas?

En **tabla aparte**: `public.promotion_rules` (`id uuid`, `promotion_id uuid`, `rule_type text` con CHECK de 6 valores, `product_id integer`, `category_id integer`, `created_at`) — `supabase/migrations/00000000000000_baseline_schema.sql:36006-36013`. No es una columna `jsonb`.

Sí son `jsonb` en `promotions`: `branches` y `applicable_days` (baseline_schema.sql, definición de `promotions`). De ahí la nota de `promotionsService.ts:61-68` sobre `cs.[117]` en vez de `{117}`, y la de `vigencia.ts:14-21`.

#### 5.4 ¿Hay tabla de uso / redención?

**No.** No existe `promotion_usage`, `promotion_redemptions` ni equivalente: `grep -rn "promotion_usage\|promotion_redemption" src supabase` solo encuentra la **función** `increment_promotion_usage`. Todo el registro de uso es un contador escalar:

```sql
update promotions set usage_count = coalesce(usage_count,0) + 1, updated_at = now()
 where organization_id = p_organization_id and id = any(p_promotion_ids)
```

(`supabase/migrations/20260911020000_increment_promotion_usage.sql:30-38`). Se llama desde `posService.ts:1982` y desde la RPC atómica de checkout (`20260921100000_pos_checkout_v1_rpc_atomica.sql:293`). No queda rastro de **qué venta**, **qué importe** ni **qué cliente**: imposible reconstruir el costo de una promoción. El propio comentario de la migración lo documenta (líneas 4-8). Además, en ventas reanudadas y en checkout de deuda **no se cuenta** (posService.ts:1981, límite documentado).

#### 5.5 ¿De dónde salen las «Estadísticas» del detalle?

De la propia fila: `promotion.usage_count`, `promotion.usage_limit`, `promotion.priority`, `promotion.is_combinable` ([id]/page.tsx:437-455), cargados por `getById`. Ninguna agregación sobre ventas. El contador, además, se incrementa por *venta* y no por *ítem*, y solo si algún producto afectado terminó con descuento (posService.ts:1704-1709).

---

### 6. Roturas y deuda

#### 6.1 Fechas y zona horaria — la vigencia **no** respeta el timezone de la organización

| # | Hallazgo | Archivo:línea | Cita |
|---|---|---|---|
| R1 | `toISOString().split('T')[0]` para la fecha de hoy — **prohibido** por CLAUDE.md, regla 1 | components/pos/promociones/nuevo/PromotionWizard.tsx:80 | `start_date: new Date().toISOString().split('T')[0]` |
| R2 | `.split('T')[0]` sobre un `timestamptz` de la BD (dos veces) — **prohibido** por la regla 2 | PromotionWizard.tsx:497, 506 | `value={formData.start_date?.split('T')[0] \|\| ''}` |
| R3 | Se guarda `'YYYY-MM-DD'` crudo en una columna `timestamptz`: Postgres lo interpreta a medianoche UTC, no a medianoche de Bogotá | PromotionWizard.tsx:498 → promotionsService.ts:163-176 | `onChange={(e) => handleChange('start_date', e.target.value)}` |
| R4 | **Zona horaria cableada** a `'UTC'` para pintar la vigencia — viola la regla 6 (`la zona horaria nunca se hardcodea`) | [id]/page.tsx:165-172 | `timeZone: 'UTC',` |
| R5 | El listado pinta **las mismas fechas** con `toLocaleDateString('es-CO')` sin `timeZone` → hora local. Listado y detalle **muestran días distintos** para la misma promoción en Colombia | PromotionsList.tsx:130-136 vs. [id]/page.tsx:165-172 | `return new Date(dateString).toLocaleDateString('es-CO', {` |
| R6 | Un `end_date` de «30 de septiembre» vale `2026-09-30T00:00Z` y el motor lo compara como instante: la promoción **muere a las 19:00 del 29** en Bogotá. Se pierde el último día de vigencia | lib/promotions/vigencia.ts:74-81 · promotionEngine.ts:136 | `return at >= now.getTime();` |
| R7 | El día de la semana sale del **reloj del navegador del cajero**, no del timezone de la organización (documentado, pero sigue siendo un riesgo: una caja con la hora mal puesta aplica los días equivocados) | vigencia.ts:53-55 · promotionEngine.ts:142 | `return JS_DAY_TO_WEEKDAY[date.getDay()];` |
| R8 | Ni `useFormatDate`, ni `formatDateInTz`, ni `getOrganizationTimezone` aparecen **en ningún archivo del módulo** (`grep` vacío sobre las tres rutas) | todo el módulo | — |
| R9 | `formatDate` local redefinido dos veces con el mismo nombre y semánticas distintas | PromotionsList.tsx:130 y [id]/page.tsx:153 | `const formatDate = (dateString: string) => {` |
| R10 | `new Date(end_date) < new Date(start_date)` compara cadenas de fecha como instantes UTC; el mensaje dice «posterior» pero el código permite que sean iguales | PromotionWizard.tsx:168-171 | `if (formData.end_date && new Date(formData.end_date) < new Date(formData.start_date))` |

#### 6.2 Moneda e importes

| # | Hallazgo | Archivo:línea |
|---|---|---|
| R11 | Símbolo `$` **cableado** como sufijo del campo «Monto de Descuento» | PromotionWizard.tsx:426-428 — `{formData.promotion_type === 'percentage' ? '%' : '$'}` |
| R12 | «Compra Mínima» y «Descuento Máximo» no llevan ningún indicador de moneda ni formato de miles | PromotionWizard.tsx:437-444, 477-484 |
| R13 | `formatCurrency` cae en `'COP'` por defecto (`currency: string = "COP"`, utils/Utils.ts:69) y **ninguna** de las 6 llamadas del módulo pasa la moneda de la organización | [id]/page.tsx:125, 129, 367, 375 · PromotionsList.tsx:143, 147 |
| R14 | `getDiscountDisplay` devuelve `'-'` para `free_shipping` en las dos pantallas | PromotionsList.tsx:148-150 · [id]/page.tsx:130-132 |

#### 6.3 Tipo `free_shipping` roto de punta a punta

| # | Hallazgo | Archivo:línea |
|---|---|---|
| R15 | Se ofrece en el selector de tipo (viene de `PROMOTION_TYPE_LABELS`) pero `getPromotionTypeIcon` no tiene ese caso → el botón sale **sin icono** (devuelve `undefined`) | PromotionWizard.tsx:244-251, 365-406 |
| R16 | No aparece **ningún campo** propio al elegirlo, y `validateStep` no valida nada (paso 1) | PromotionWizard.tsx:411-473, 149-162 |
| R17 | El motor **no tiene caso** para `free_shipping`: descuento 0 → `continue` en 404. Se puede crear, activar y nunca hace nada | promotionEngine.ts:220-304, 404 |

#### 6.4 Lógica duplicada y contratos rotos (CLAUDE.md §7)

| # | Hallazgo | Archivo:línea |
|---|---|---|
| R18 | El filtro de sucursal del motor **no usa** `appliesToBranch` de `vigencia.ts` (que sí compara número y cadena, porque el `jsonb` puede traer ambos): el motor hace `p.branches.includes(ctx.branch_id)` estricto. Una promoción con `branches: ["117"]` alcanza a la cartelera y **no** al cobro | promotionEngine.ts:342-346 vs. vigencia.ts:90-95 — `return p.branches.includes(ctx.branch_id);` |
| R19 | `getStatusBadge` está copiado literalmente en listado y detalle | PromotionsList.tsx:110-128 y [id]/page.tsx:135-150 |
| R20 | El bloque «promoción solo si no hay descuento manual» está duplicado en dos métodos de `posService` | posService.ts:1695-1702 y 2713-2720 |
| R21 | `update()` borra **todas** las reglas y reinserta, fuera de transacción: si el `insert` falla, la promoción queda sin reglas y con `applies_to='products'` → el motor devuelve `false` para todo ítem (promotionEngine.ts:157) y la promoción deja de aplicar en silencio | promotionsService.ts:219-230 |

#### 6.5 Conteos en el navegador, permisos y paginación

| # | Hallazgo | Archivo:línea |
|---|---|---|
| R22 | «Activas» se calcula **en el navegador** recorriendo las filas ya cargadas, con `new Date()` local; si hubiera paginación sería falso, y hoy ya ignora el timezone | app/app/pos/promociones/page.tsx:45-51 |
| R23 | «Total Promociones» es `promotions.length` del array cargado, no un `count` del servidor | page.tsx:69 |
| R24 | **Sin paginación de ningún tipo**: `getAll` no tiene `.range()` ni `.limit()`; se traen todas las promociones de la organización con sus reglas en cada tecleo del buscador | promotionsService.ts:25-70 · PromotionsHeader.tsx:144-149 |
| R25 | **Cero comprobación de permisos** en las tres páginas y en el servicio: `grep usePermission\|hasPermission\|PermissionGuard` vacío. Cualquier miembro que llegue a la ruta puede crear, editar, activar y **eliminar** promociones; lo único que separa a un cajero de borrar la promoción del mes es la RLS de la tabla | app/app/pos/promociones/**, components/pos/promociones/** |
| R26 | El buscador dispara una consulta por pulsación (sin debounce): `onChange` → `setFilters` → `useCallback` → `useEffect` | PromotionsHeader.tsx:146 · page.tsx:22-39 |
| R27 | El tope de 50 productos de `getProducts` es silencioso: con más de 50 coincidencias el usuario no sabe que la lista está truncada | promotionsService.ts:341 |

#### 6.6 Otras roturas confirmadas

| # | Hallazgo | Archivo:línea |
|---|---|---|
| R28 | La descripción se **escribe como HTML** (`RichTextEditor` emite `editorRef.current.innerHTML`, RichTextEditor.tsx:72) y se **imprime como texto plano** en las dos pantallas: el usuario ve `<p>Descuento…</p>` literal. El propio componente documenta el remedio —`Para visualizar el contenido generado, usar <HtmlContentRenderer html={value} />`, RichTextEditor.tsx:23— y ninguna de las dos pantallas lo usa | PromotionWizard.tsx:322-328 (`onChange={(html) => handleChange('description', html)}`) vs. [id]/page.tsx:301 y PromotionsList.tsx:210-214 |
| R29 | «Límite de Usos» no se hace cumplir en ninguna parte: el motor no lee `usage_limit` | PromotionWizard.tsx:515-523 vs. promotionEngine.ts (sin ninguna aparición de `usage_limit`) |
| R30 | `customer_id` viaja en el contexto del motor y nunca se lee: prop muerta del contrato público | promotionEngine.ts:54 |
| R31 | `brand` está en `PromotionItem` (promotionEngine.ts:39) y nunca se usa; los casos `include_brand`/`exclude_brand` comparan **`rule.product_id` con `item.product_id`** — código sin sentido, con el comentario `// brand via product` | promotionEngine.ts:183-188 |
| R32 | `PromotionFilters.dateFrom` / `dateTo` implementados en el servicio y sin ningún control que los use | types.ts:119-120 · promotionsService.ts:53-59 |
| R33 | `branches` no se puede editar desde ninguna pantalla, pese a existir en la columna, en el tipo, en el filtro del listado y en el motor | PromotionWizard.tsx (sin ninguna aparición de `branches`) |
| R34 | Importaciones muertas: `Upload`, `Download`, `Filter` en la cabecera; `Users` y `cn` en el detalle | PromotionsHeader.tsx:6, 7, 9 · [id]/page.tsx:19, 41 |
| R35 | `min_purchase_amount` y `max_discount_amount` se ocultan con una comprobación *truthy*: un valor 0 guardado no se muestra | [id]/page.tsx:362, 372 |
| R36 | `APPLIES_TO_LABELS` no cubre `'brands'`, que el CHECK de la BD sí permite: una fila con `applies_to='brands'` renderiza `undefined` en «Aplica a» | types.ts:132-136 · [id]/page.tsx:316 |
| R37 | `onSuccess` del asistente nunca se pasa desde ninguna de las dos páginas que lo montan: prop muerta | PromotionWizard.tsx:52, 232-236 · nuevo/page.tsx:22 · [id]/page.tsx:203 |
| R38 | El motor ordena por `priority` en SQL y luego confía en ese orden para `nonCombinable[0]`, pero elige la mejor **antes** de saber si alcanza a algún ítem: una no combinable de prioridad alta que no aplica a nada puede dejar fuera a todas las combinables si su descuento calculado da 0 y el de las combinables también | promotionEngine.ts:369-385 |
| R39 | `delete()` borra reglas y promoción en dos operaciones sin transacción | promotionsService.ts:268-278 |
| R40 | El modo edición depende por completo de que el detalle reinyecte **cada** campo a mano en `initialData` (`applicable_days`, `branches`, los tres canales y `rules` se añadieron tras un incidente documentado en el propio archivo): cualquier columna nueva que se olvide de añadir ahí se borrará al guardar, porque `update()` hace un `update` plano y reemplaza todas las reglas | [id]/page.tsx:205-235 (comentario en 221-224) · promotionsService.ts:202-230 |

**Nada de `confirm()` ni `alert()` nativos**: ambos borrados usan `AlertDialog` del kit (PromotionsList.tsx:307-329, [id]/page.tsx:472-487). El filtro de sucursal **no** es propio: usa `useBranch()` del contexto global (page.tsx:5, 27). Los menús no superan las 8 entradas.

---

### 7. Conteo de controles

| Subsección | Controles |
|---|---|
| 1. Listado `/app/pos/promociones` | 44 |
| 2. Detalle `/app/pos/promociones/[id]` | 44 |
| 3. Asistente de 4 pasos (armazón 10 + paso 1: 6 + paso 2: 12 + paso 3: 14 + paso 4: 10) | 52 |
| **Total de controles de interfaz** | **140** |

Piezas no contadas como control de interfaz pero auditadas: 1 motor (`promotionEngine.evaluate`), 8 puntos de invocación, 1 RPC (`increment_promotion_usage`), 2 tablas (`promotions`, `promotion_rules`), 11 operaciones de datos del servicio y 40 roturas (R1-R40).

---

## E. Cupones y cargos de servicio


Rutas relativas a `src/`. Auditoría de solo lectura, sobre el árbol de trabajo
actual (rama `main`). Cada afirmación lleva `archivo:línea`.

---

### U. Cupones

#### U.1 Listado `/app/pos/cupones`

Composición: `app/app/pos/cupones/page.tsx` (82 líneas) monta
`CouponsHeader` + `CouponsList`. No hay tarjeta contenedora para la tabla: la
lista se renderiza suelta bajo la cabecera (`page.tsx:74-78`).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Cupones` | Título de la página | Siempre | components/pos/cupones/CouponsHeader.tsx:87-89 |
| 2 | texto | `Administra códigos de descuento para tus clientes` | Subtítulo | Siempre | components/pos/cupones/CouponsHeader.tsx:90-92 |
| 3 | botón | `Promociones` | `Link` a `/app/pos/promociones` | Siempre | components/pos/cupones/CouponsHeader.tsx:97-101 |
| 4 | botón | `Nuevo Cupón` | Abre `CouponForm` en modo creación | Siempre | components/pos/cupones/CouponsHeader.tsx:102-109 |
| 5 | diálogo | (sin título propio; `Nuevo Cupón` en el form) | `CouponForm` de creación | Al pulsar #4 | components/pos/cupones/CouponsHeader.tsx:203-207 |
| 6 | stat | `Total Cupones` | `coupons.length` — el array **ya filtrado**, no el total real | Siempre | components/pos/cupones/CouponsHeader.tsx:122-125 · page.tsx:69 |
| 7 | stat | `Activos` | `activeCoupons`, calculado en el navegador (vigencia + cupo) | Siempre | components/pos/cupones/CouponsHeader.tsx:137-140 · app/app/pos/cupones/page.tsx:41-50 |
| 8 | campo | `Buscar por código o nombre...` | Filtro `search` → `.or(code.ilike/name.ilike)` en servidor | Siempre | components/pos/cupones/CouponsHeader.tsx:153-158 |
| 9 | campo | `Estado` (`Todos` · `Activos` · `Inactivos`) | Filtro `is_active` en servidor | Siempre | components/pos/cupones/CouponsHeader.tsx:160-172 |
| 10 | campo | `Tipo` (`Todos` · `Porcentaje` · `Monto Fijo`) | Filtro `discount_type` en servidor | Siempre | components/pos/cupones/CouponsHeader.tsx:173-186 |
| 11 | botón | (sin etiqueta; icono `RefreshCw`) | Recarga la lista; gira mientras `loading` | Siempre | components/pos/cupones/CouponsHeader.tsx:187-195 |
| 12 | estado | (skeleton de página) | `PageHeaderSkeleton` + `StatsSkeleton(3)` + `CardListSkeleton(5)` | Mientras carga la organización | app/app/pos/cupones/page.tsx:52-60 |
| 13 | estado | (skeleton de lista) | 5 `Skeleton h-16` | Mientras `loading` | components/pos/cupones/CouponsList.tsx:138-146 |
| 14 | estado | `No hay cupones registrados` / `Crea tu primer cupón para comenzar` | Vacío; **sin botón de acción** | `coupons.length === 0` | components/pos/cupones/CouponsList.tsx:148-160 |
| 15 | tabla | `Código` | Columna 1 | Siempre | components/pos/cupones/CouponsList.tsx:168 |
| 16 | badge | `{coupon.code}` | `variant="outline"`, `font-mono` | Siempre | components/pos/cupones/CouponsList.tsx:186-190 |
| 17 | tabla | `Nombre` | Columna 2; `name \|\| '-'` | Siempre | components/pos/cupones/CouponsList.tsx:169, 191-201 |
| 18 | chip | `{customer.full_name}` (icono `Users`) | Cliente asignado bajo el nombre | Si `coupon.customer` | components/pos/cupones/CouponsList.tsx:194-199 |
| 19 | tabla | `Descuento` | Columna 3 | Siempre | components/pos/cupones/CouponsList.tsx:170 |
| 20 | cálculo | `{valor}%` o `formatCurrency(valor)` | `getDiscountDisplay`; icono `Percent`/`DollarSign` | Siempre | components/pos/cupones/CouponsList.tsx:131-136, 202-213 |
| 21 | tabla | `Vigencia` | Columna 4, `hidden md:table-cell`: en móvil **desaparece sin sustituto** | Ancho ≥ md | components/pos/cupones/CouponsList.tsx:171, 214-222 |
| 22 | tabla | `Usos` | Columna 5: `usage_count` y `/usage_limit` si hay tope | Siempre | components/pos/cupones/CouponsList.tsx:172, 223-228 |
| 23 | tabla | `Estado` | Columna 6 | Siempre | components/pos/cupones/CouponsList.tsx:173 |
| 24 | badge | `Inactivo` | `is_active === false` (gana sobre todo lo demás) | 1.ª rama de `getStatusBadge` | components/pos/cupones/CouponsList.tsx:103-105 |
| 25 | badge | `Programado` | `start_date > now` | 2.ª rama | components/pos/cupones/CouponsList.tsx:107-109 |
| 26 | badge | `Expirado` | `end_date < now` | 3.ª rama | components/pos/cupones/CouponsList.tsx:111-113 |
| 27 | badge | `Agotado` | `usage_limit && usage_count >= usage_limit` | 4.ª rama | components/pos/cupones/CouponsList.tsx:115-117 |
| 28 | badge | `Activo` | Resto | 5.ª rama | components/pos/cupones/CouponsList.tsx:119 |
| 29 | estado | (fila atenuada) | `opacity-60` en la fila si el cupón está inactivo | `!is_active` | components/pos/cupones/CouponsList.tsx:181-184 |
| 30 | tabla | `Acciones` | Columna 7, alineada a la derecha | Siempre | components/pos/cupones/CouponsList.tsx:174 |
| 31 | menú | (sin etiqueta; `MoreHorizontal`) | Disparador del menú ⋯ | Siempre | components/pos/cupones/CouponsList.tsx:233-238 |
| 32 | menú | `Ver Detalles` | `Link` a `/app/pos/cupones/{id}` | Siempre | components/pos/cupones/CouponsList.tsx:240-245 |
| 33 | menú | `Editar` | `Link` a `/app/pos/cupones/{id}?edit=true` | Siempre | components/pos/cupones/CouponsList.tsx:246-251 |
| 34 | menú | `Duplicar` | `CouponsService.duplicate` | Siempre | components/pos/cupones/CouponsList.tsx:252-258 |
| 35 | menú | `Desactivar` / `Activar` | Alterna `is_active`; lleva un `Switch` decorativo `pointer-events-none` dentro del item | Siempre | components/pos/cupones/CouponsList.tsx:260-270 |
| 36 | menú | `Eliminar` | Abre el diálogo de confirmación | Siempre | components/pos/cupones/CouponsList.tsx:272-278 |
| 37 | diálogo | `¿Eliminar cupón?` | `AlertDialog` del kit (no `confirm()` nativo) | Tras #36 | components/pos/cupones/CouponsList.tsx:288-310 |
| 38 | texto | `Esta acción no se puede deshacer. Si el cupón tiene redenciones, no podrá ser eliminado.` | Descripción del diálogo | Tras #36 | components/pos/cupones/CouponsList.tsx:294-296 |
| 39 | botón | `Cancelar` | Cierra el diálogo | Tras #36 | components/pos/cupones/CouponsList.tsx:299-301 |
| 40 | botón | `Eliminar` | Ejecuta el borrado | Tras #36 | components/pos/cupones/CouponsList.tsx:302-307 |
| 41 | toast | `Cupón eliminado correctamente` / `Cupón duplicado correctamente` / `Cupón desactivado` / `Cupón activado` / `Error al cargar cupones` | Retroalimentación (`sonner`) | Según la acción | components/pos/cupones/CouponsList.tsx:66, 78, 89 · app/app/pos/cupones/page.tsx:27 |

**Paginación: no existe.** Ni del kit ni a mano. `CouponsList` mapea el array
completo (`CouponsList.tsx:178`) y `CouponsService.getAll` no aplica `.range()`
ni `.limit()` (`components/pos/cupones/couponsService.ts:24-95`): con muchos
cupones se traen y se pintan todos.

---

#### U.2 Detalle `/app/pos/cupones/[id]`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (sin etiqueta; `ArrowLeft`) | `Link` de vuelta a `/app/pos/cupones` | Siempre | app/app/pos/cupones/[id]/page.tsx:219-223 |
| 2 | texto | `{coupon.code}` | Código en `font-mono` como título | Siempre | app/app/pos/cupones/[id]/page.tsx:229 |
| 3 | badge | `Inactivo` · `Programado` · `Expirado` · `Agotado` · `Activo` | Misma lógica que la lista, **reimplementada** aquí | Siempre | app/app/pos/cupones/[id]/page.tsx:154-164, 230 |
| 4 | texto | `{coupon.name}` o `Sin nombre` | Subtítulo | Siempre | app/app/pos/cupones/[id]/page.tsx:232-234 |
| 5 | botón | `Editar` | Abre `CouponForm` en edición | Siempre | app/app/pos/cupones/[id]/page.tsx:238-241 |
| 6 | botón | `Duplicar` | Duplica y **navega al listado** (no al duplicado) | Siempre | app/app/pos/cupones/[id]/page.tsx:242-245, 100-108 |
| 7 | botón | `Eliminar` | Abre el `AlertDialog` de borrado | Siempre | app/app/pos/cupones/[id]/page.tsx:246-249 |
| 8 | texto | `Detalles del Cupón` | Título de la tarjeta principal | Siempre | app/app/pos/cupones/[id]/page.tsx:259 |
| 9 | campo | `Descuento` | `{valor}%` o `formatCurrency(valor)`, en 2xl morado | Siempre | app/app/pos/cupones/[id]/page.tsx:264-268 |
| 10 | campo | `Tipo` | `DISCOUNT_TYPE_LABELS[discount_type]` → `Porcentaje` / `Monto Fijo` | Siempre | app/app/pos/cupones/[id]/page.tsx:271-272 |
| 11 | campo | `Fecha Inicio` | `formatDate(start_date)` o `-` | Siempre | app/app/pos/cupones/[id]/page.tsx:280-284 |
| 12 | campo | `Fecha Fin` | `formatDate(end_date)` o `-` | Siempre | app/app/pos/cupones/[id]/page.tsx:287-291 |
| 13 | campo | `Compra Mínima` | `formatCurrency(min_purchase_amount)` | Solo si `min_purchase_amount` | app/app/pos/cupones/[id]/page.tsx:299-303 |
| 14 | campo | `Descuento Máximo` | `formatCurrency(max_discount_amount)` | Solo si `max_discount_amount` | app/app/pos/cupones/[id]/page.tsx:305-309 |
| 15 | campo | `Cliente Asignado` | `customer.full_name` + `(email)` | Solo si `coupon.customer` | app/app/pos/cupones/[id]/page.tsx:315-327 |
| 16 | texto | `Estado` | Título de la tarjeta lateral | Siempre | app/app/pos/cupones/[id]/page.tsx:335 |
| 17 | texto | `Activo` / `Inactivo` | Con icono `CheckCircle`/`XCircle` | Siempre | app/app/pos/cupones/[id]/page.tsx:339-342 |
| 18 | toggle | (sin etiqueta; `Switch`) | `CouponsService.toggleActive` y recarga; `disabled` mientras `toggling` | Siempre | app/app/pos/cupones/[id]/page.tsx:343, 110-122 |
| 19 | texto | `Estadísticas` | Título de la tarjeta | Siempre | app/app/pos/cupones/[id]/page.tsx:350 |
| 20 | stat | `Redenciones` | `usage_count` (+ `/usage_limit` si hay tope) | Siempre | app/app/pos/cupones/[id]/page.tsx:353-359 |
| 21 | stat | `Total Descontado` | **Suma en el navegador** de `discount_applied` de las redenciones cargadas | Siempre | app/app/pos/cupones/[id]/page.tsx:209, 360-363 |
| 22 | badge | `Solo Primera Compra` | Ancho completo, azul | Si `applies_to_first_purchase` | app/app/pos/cupones/[id]/page.tsx:364-368 |
| 23 | texto | `Creado: {fecha}` | `formatDate(created_at)` — un `timestamptz` con formato de día | Siempre | app/app/pos/cupones/[id]/page.tsx:375 |
| 24 | texto | `Actualizado: {fecha}` | Ídem | Siempre | app/app/pos/cupones/[id]/page.tsx:376 |
| 25 | texto | `Historial de Redenciones ({n})` | Título + conteo del array cargado | Siempre | app/app/pos/cupones/[id]/page.tsx:387-390 |
| 26 | botón | `Exportar` | Genera CSV en el navegador y lo descarga | Solo si `redemptions.length > 0` | app/app/pos/cupones/[id]/page.tsx:391-396, 124-152 |
| 27 | estado | `Este cupón aún no ha sido usado` | Vacío del historial | `redemptions.length === 0` | app/app/pos/cupones/[id]/page.tsx:400-404 |
| 28 | tabla | `Fecha` | `formatDateTime(created_at)` de la redención | Con redenciones | app/app/pos/cupones/[id]/page.tsx:409, 419 |
| 29 | tabla | `Venta` | Badge mono con los **últimos 8 caracteres** del UUID (`sale_id.slice(-8)`) | Con redenciones | app/app/pos/cupones/[id]/page.tsx:410, 420-422 |
| 30 | tabla | `Cliente` | `customer.full_name \|\| '-'` | Con redenciones | app/app/pos/cupones/[id]/page.tsx:411, 423 |
| 31 | tabla | `Sucursal` | `sale.branch.name \|\| '-'` | Con redenciones | app/app/pos/cupones/[id]/page.tsx:412, 424 |
| 32 | tabla | `Descuento` | `formatCurrency(discount_applied)`, a la derecha | Con redenciones | app/app/pos/cupones/[id]/page.tsx:413, 425-427 |
| 33 | diálogo | `Editar Cupón` (`CouponForm`) | Edición del cupón | `showEditDialog` | app/app/pos/cupones/[id]/page.tsx:438-446 |
| 34 | atajo | `?edit=true` | Abre el diálogo de edición al entrar (deep link desde el menú ⋯ de la lista) | Query param | app/app/pos/cupones/[id]/page.tsx:58, 64 |
| 35 | diálogo | `¿Eliminar cupón?` | `AlertDialog` del kit | Tras #7 | app/app/pos/cupones/[id]/page.tsx:449-462 |
| 36 | botón | `Cancelar` | Cierra | Tras #7 | app/app/pos/cupones/[id]/page.tsx:458 |
| 37 | botón | `Eliminar` | Borra y navega al listado | Tras #7 | app/app/pos/cupones/[id]/page.tsx:459 |
| 38 | estado | `Cupón no encontrado` + `El cupón que buscas no existe o fue eliminado.` + botón `Volver a Cupones` | Pantalla de no encontrado | `coupon === null` | app/app/pos/cupones/[id]/page.tsx:194-207 |
| 39 | estado | (skeleton) | `PageHeaderSkeleton` + `DetailSkeleton` | Mientras carga | app/app/pos/cupones/[id]/page.tsx:185-192 |
| 40 | toast | `Cupón eliminado correctamente` | Tras borrar | Éxito | app/app/pos/cupones/[id]/page.tsx:93 |
| 41 | toast | `No hay redenciones para exportar` | Bloquea la exportación vacía | Error | app/app/pos/cupones/[id]/page.tsx:125-128 |
| 42 | toast | `Exportación completada` | Tras descargar el CSV | Éxito | app/app/pos/cupones/[id]/page.tsx:151 |

**Campos del CSV de «Exportar»** (`app/app/pos/cupones/[id]/page.tsx:130-137`):
`Fecha` (`toLocaleString('es-CO')`), `Venta` (últimos 8 del UUID), `Cliente`,
`Sucursal`, `Descuento Aplicado` (número crudo, sin formato), `Total Venta`
(`sale.total`, 0 si falta). El separador es coma y los valores se envuelven en
comillas sin escapar las comillas internas
(`app/app/pos/cupones/[id]/page.tsx:141`): un nombre de cliente con `"` rompe
la fila.

---

#### U.3 `CouponForm` — los 11 campos

`components/pos/cupones/CouponForm.tsx` (289 líneas). Diálogo compartido por el
alta (desde la cabecera del listado) y la edición (desde el detalle).

| # | Tipo | Etiqueta exacta | Tipo de control | Obligatorio | Validación / visibilidad | Archivo:línea |
|---|---|---|---|---|---|---|
| 1 | texto | `Nuevo Cupón` / `Editar Cupón` | Título del diálogo | — | Según `isEditing` | CouponForm.tsx:122-124 |
| 2 | campo | `Código *` | `Input` texto, `font-mono`, placeholder `ej: VERANO20` | **Sí** | `!code.trim()` → `El código es requerido`; se fuerza a mayúsculas al teclear; unicidad por organización se valida en servicio, no aquí | CouponForm.tsx:129-143, 85, 133 |
| 3 | botón | (sin etiqueta; `RefreshCw`) | Regenera el código (`CUP` + 6 alfanuméricos aleatorios) | — | Siempre visible junto al campo; **no comprueba colisión** | CouponForm.tsx:138-140, 79-81 · couponsService.ts:365-372 |
| 4 | campo | `Nombre (opcional)` | `Input` texto, placeholder `ej: Descuento de Verano` | No | Sin validación | CouponForm.tsx:146-153 |
| 5 | campo | `Tipo de Descuento` | Dos botones-tarjeta: `Porcentaje` · `Monto Fijo` | Sí (default `percentage`) | Deriva de `DISCOUNT_TYPE_LABELS`; cambia el sufijo y el tope del campo `Valor` | CouponForm.tsx:156-176 · types.ts:89-92 |
| 6 | campo | `Valor *` | `Input` numérico con sufijo `%` o `$` | **Sí** | `<= 0` → `El valor debe ser mayor a 0`; si es porcentaje y `> 100` → `Máximo 100%`; `max` del input solo si es porcentaje | CouponForm.tsx:180-196, 86-87 |
| 7 | campo | `Descuento Máximo` | `Input` numérico, placeholder `Sin límite` | No | Sin validación; **no se marca como tope solo para porcentajes**, aunque con `Monto Fijo` no tiene sentido | CouponForm.tsx:198-207 |
| 8 | campo | `Compra Mínima` | `Input` numérico, placeholder `Sin mínimo` | No | Sin validación (admite negativos: no hay `min`) | CouponForm.tsx:212-220 |
| 9 | campo | `Límite de Usos` | `Input` numérico, placeholder `Sin límite` | No | Sin validación; sin `min` | CouponForm.tsx:223-231 |
| 10 | campo | `Fecha Inicio` | `Input type="date"` | No | **Sin validación de orden** frente a `Fecha Fin` | CouponForm.tsx:236-245 |
| 11 | campo | `Fecha Fin` | `Input type="date"` | No | Ídem; se puede guardar un fin anterior al inicio | CouponForm.tsx:246-255 |
| 12 | toggle | `Activo` (`Disponible para uso inmediato`) | `Switch` verde | No (default `true`) | — | CouponForm.tsx:259-265 |
| 13 | toggle | `Solo Primera Compra` (`Solo para clientes nuevos`) | `Switch` morado | No (default `false`) | — | CouponForm.tsx:266-272 |
| 14 | botón | `Cancelar` | Cierra sin guardar | — | `disabled` mientras `loading` | CouponForm.tsx:276-279 |
| 15 | botón | `Crear` / `Actualizar` / `Guardando...` | Envía el formulario | — | `disabled` mientras `loading` | CouponForm.tsx:280-283 |
| 16 | toast | `Cupón creado` / `Cupón actualizado` | Retroalimentación | — | Éxito | CouponForm.tsx:99, 102 |

Los 11 campos de datos son #2, #4, #5, #6, #7, #8, #9, #10, #11, #12 y #13.

**Campos del tipo que el formulario no expone**
(`components/pos/cupones/types.ts:60-75`): `usage_limit_per_customer`,
`customer_id` y `promotion_id`. El detalle **sí muestra** el cliente asignado
(`app/app/pos/cupones/[id]/page.tsx:315-327`) y el servicio **sí filtra** por la
promoción asociada (`couponsService.ts:67-93`), pero ninguno de los tres se
puede fijar desde la interfaz: solo llegan desde fuera (tienda web o SQL).
`duplicate` los conserva porque copia el objeto entero
(`couponsService.ts:280-287`).

---

#### U.4 Datos — `components/pos/cupones/couponsService.ts`

Cliente: `supabase` de `@/lib/supabase/config` (**cliente de navegador**),
`couponsService.ts:1`. La organización sale de `obtenerOrganizacionActiva()`
en el navegador (`couponsService.ts:2, 12-15`), no de la sesión del servidor:
todo depende de RLS.

| Método | Operación | Tabla / RPC | Columnas y embeds | Archivo:línea |
|---|---|---|---|---|
| `getAll` | `.select` | `coupons` | `*` + `customer:customers(id, full_name, email)` + `promotion:promotions(id, branches)`; `.eq('organization_id')`; `.order('created_at', desc)` | couponsService.ts:24-39 |
| `getAll` | filtros | `coupons` | `.or(code.ilike.%s%,name.ilike.%s%)`, `.eq('is_active')`, `.eq('discount_type')`, `.gte('start_date')`, `.lte('end_date')` | couponsService.ts:41-59 |
| `getAll` | `.select` (2.ª consulta) | `promotions` | `id`; `.eq('organization_id')`, `.eq('is_active', true)`, tres `.or(...)` encadenados sobre `branches` (JSONB), `start_date` y `end_date` | couponsService.ts:72-79 |
| `getAll` | filtro derivado | `coupons` | `.or(promotion_id.in.(...),promotion_id.is.null)` o, si no hay promociones, `.is('promotion_id', null)` | couponsService.ts:86-92 |
| `getById` | `.select` | `coupons` | `*` + `customer:customers(id, full_name, email)`; `.eq('id')`, `.eq('organization_id')`, `.single()` | couponsService.ts:116-128 |
| `create` | `.select` (unicidad) | `coupons` | `id`; `.eq('organization_id')`, `.eq('code', UPPER)`, `.single()` | couponsService.ts:151-156 |
| `create` | `.insert` | `coupons` | `...data`, `code` en mayúsculas, `organization_id`, `created_by` (= `auth.getUser()`), `is_active`, `applies_to_first_purchase`, `usage_count: 0` | couponsService.ts:162-174 |
| `update` | `.select` (unicidad) | `coupons` | `id`; `.eq('organization_id')`, `.eq('code')`, `.neq('id')` | couponsService.ts:197-203 |
| `update` | `.update` | `coupons` | `...data` + `updated_at`; `.eq('id')`, `.eq('organization_id')` | couponsService.ts:215-224 |
| `delete` | `.select` (guarda) | `coupon_redemptions` | `id`; `.eq('coupon_id')`, `.limit(1)` → si hay, lanza y no borra | couponsService.ts:246-254 |
| `delete` | `.delete` | `coupons` | `.eq('id')`, `.eq('organization_id')` | couponsService.ts:256-260 |
| `duplicate` | compuesto | `coupons` | `getById` + `create` con `code = {code}_COPIA`, `name = {name} (Copia)`, `is_active: false` | couponsService.ts:275-292 |
| `toggleActive` | compuesto | `coupons` | `getById` + `update({ is_active: !is_active })` — dos viajes, sin atomicidad | couponsService.ts:297-302 |
| `getRedemptions` | `.select` | `coupon_redemptions` | `*` + `sale:sales(id, total, sale_date, branch:branches(id, name))` + `customer:customers(id, full_name, email)`; `.eq('coupon_id')`, `.order('created_at', desc)` | couponsService.ts:309-329 |
| `importFromData` | bucle | `coupons` | N llamadas a `create`, una por fila — sin transacción ni RPC | couponsService.ts:346-360 |

**No hay ni un `.rpc(...)` en todo el servicio.** Tampoco `.range()` ni
`.limit()` en `getAll` ni en `getRedemptions`.

**Tabla de redenciones:** `coupon_redemptions`. Columnas leídas: `*` (el tipo
declara `id`, `coupon_id`, `sale_id`, `customer_id`, `discount_applied`,
`created_at` — `components/pos/cupones/types.ts:37-58`). **Sí hace join con
ventas** (`sale:sales`, y anidado `branch:branches`) **y con clientes**
(`customer:customers`) — `couponsService.ts:311-327`. Lo que **no** lleva es
filtro por `organization_id`: la consulta solo acota por `coupon_id`
(`couponsService.ts:328`) y confía por completo en la RLS de la tabla.

---

### S. Cargos de servicio

#### S.5 Listado `/app/pos/cargos-servicio`

`app/app/pos/cargos-servicio/page.tsx` es una envoltura de una línea sobre
`CargosServicioContent` (`page.tsx:5-7`), que también se monta **embebido en un
modal** desde la configuración del POS
(`components/pos/configuracion/ConfigModals.tsx:74-80`, título `Cargos de
Servicio`).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Cargos de Servicio` | Título | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:122-124 |
| 2 | texto | `Configura cargos automáticos como propina sugerida` | Subtítulo — **promete algo que el código no hace** (§P.8) | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:125-127 |
| 3 | botón | `Importar` | Abre el diálogo CSV | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:132-139 |
| 4 | diálogo | `Importar Cargos` | Diálogo de importación | Tras #3 | components/pos/cargos-servicio/ChargesHeader.tsx:260-304 |
| 5 | texto | `Sube un archivo CSV con los cargos de servicio` | Descripción del diálogo | Tras #3 | components/pos/cargos-servicio/ChargesHeader.tsx:264-266 |
| 6 | texto | `Formato requerido:` + `name,charge_type,charge_value,min_amount,min_guests,applies_to,is_taxable,is_optional` | Cabecera esperada; nota `charge_type: percentage o fixed` / `applies_to: all, dine_in, delivery, takeout` | Tras #3 | components/pos/cargos-servicio/ChargesHeader.tsx:270-281 |
| 7 | campo | (sin etiqueta; `input type="file"` `accept=".csv"`) | Dispara la importación **al seleccionar**, sin previsualización ni confirmación | Tras #3 | components/pos/cargos-servicio/ChargesHeader.tsx:283-290, 81-109 |
| 8 | botón | `Cancelar` | Cierra el diálogo (no hay botón «Importar»: el `change` ya importó) | Tras #3 | components/pos/cargos-servicio/ChargesHeader.tsx:293-302 |
| 9 | botón | `Nuevo Cargo` | Abre `ChargeForm` en creación | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:140-146 |
| 10 | stat | `Total` | `stats.total` | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:158-161 |
| 11 | stat | `Activos` | `stats.active` | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:172-175 |
| 12 | stat | `Inactivos` | `stats.inactive` | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:186-189 |
| 13 | campo | `Estado` (`Todos` · `Activos` · `Inactivos`) | Filtro `is_active` en servidor | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:201-213 |
| 14 | campo | `Sucursal` (`Todas las sucursales` + lista) | **Filtro de sucursal propio**: escribe en el `BranchContext` global (`setSelectedBranch`) — duplica el selector del header | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:215-230, 70-72 |
| 15 | campo | `Aplica a` (`Todos` · `En sitio` · `Domicilio` · `Para llevar`) | Filtro `applies_to`; `Todos` **limpia** el filtro en vez de buscar `applies_to='all'` | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:232-244, 74-79 |
| 16 | botón | (sin etiqueta; `RefreshCw`) | Recarga | Siempre | components/pos/cargos-servicio/ChargesHeader.tsx:246-254 |
| 17 | estado | (skeleton de página) | `PageHeaderSkeleton` + `CardListSkeleton(4)` | Mientras carga la organización | components/pos/cargos-servicio/CargosServicioContent.tsx:83-90 |
| 18 | estado | (skeleton de lista) | 5 `Skeleton h-16` | Mientras `loading` | components/pos/cargos-servicio/ChargesList.tsx:112-120 |
| 19 | estado | `No hay cargos de servicio` / `Crea un cargo de servicio para aplicarlo a las ventas` | Vacío; **sin botón de acción** | `charges.length === 0` | components/pos/cargos-servicio/ChargesList.tsx:122-134 |
| 20 | tabla | `Nombre` | Columna 1 | Siempre | components/pos/cargos-servicio/ChargesList.tsx:142, 160-175 |
| 21 | chip | `{branch.name}` (icono `Building2`) o `Global (todas las sucursales)` | Ámbito del cargo bajo el nombre | Según `charge.branch` | components/pos/cargos-servicio/ChargesList.tsx:163-173 |
| 22 | tabla | `Tipo` | Columna 2: icono + `Porcentaje`/`Monto Fijo` | Siempre | components/pos/cargos-servicio/ChargesList.tsx:143, 176-187 |
| 23 | tabla | `Valor` | Columna 3 (derecha): `{valor}%` o `formatCurrency(valor)` | Siempre | components/pos/cargos-servicio/ChargesList.tsx:144, 105-110, 188-192 |
| 24 | tabla | `Condiciones` | Columna 4: `Min: {importe}`, `Min: {n} personas`, o `Sin restricciones` | Siempre | components/pos/cargos-servicio/ChargesList.tsx:145, 193-212 |
| 25 | tabla | `Aplica a` | Columna 5 | Siempre | components/pos/cargos-servicio/ChargesList.tsx:146 |
| 26 | badge | `Todos` · `En sitio` · `Domicilio` · `Para llevar` | `APPLIES_TO_LABELS[applies_to]`, `variant="outline"` | Siempre | components/pos/cargos-servicio/ChargesList.tsx:213-220 · types.ts:54-59 |
| 27 | tabla | `Estado` | Columna 6, centrada | Siempre | components/pos/cargos-servicio/ChargesList.tsx:147 |
| 28 | toggle | (sin etiqueta; `Switch` por fila) | Activa/desactiva el cargo sin confirmación; `disabled` mientras se guarda | Siempre | components/pos/cargos-servicio/ChargesList.tsx:223-227, 80-93 |
| 29 | badge | `Gravado` | `variant="secondary"` | Si `is_taxable` | components/pos/cargos-servicio/ChargesList.tsx:229-233 |
| 30 | badge | `Opcional` | `variant="outline"` | Si `is_optional` | components/pos/cargos-servicio/ChargesList.tsx:234-238 |
| 31 | estado | (fila atenuada) | `opacity-60` si el cargo está inactivo | `!is_active` | components/pos/cargos-servicio/ChargesList.tsx:155-158 |
| 32 | tabla | `Acciones` | Columna 7 | Siempre | components/pos/cargos-servicio/ChargesList.tsx:148 |
| 33 | menú | (sin etiqueta; `MoreHorizontal`) | Disparador ⋯ | Siempre | components/pos/cargos-servicio/ChargesList.tsx:243-248 |
| 34 | menú | `Editar` | Llama a `onEdit(charge)` | **Solo si llega `onEdit`** | components/pos/cargos-servicio/ChargesList.tsx:250-258 |
| 35 | menú | `Duplicar` | `CargosServicioService.duplicate` → `{nombre} (copia)` | Siempre | components/pos/cargos-servicio/ChargesList.tsx:259-265 |
| 36 | menú | `Eliminar` | Abre el `AlertDialog` | Siempre | components/pos/cargos-servicio/ChargesList.tsx:267-273 |
| 37 | diálogo | `¿Eliminar cargo de servicio?` / `Esta acción no se puede deshacer.` | `AlertDialog` del kit | Tras #36 | components/pos/cargos-servicio/ChargesList.tsx:283-305 |
| 38 | botón | `Cancelar` | Cierra | Tras #36 | components/pos/cargos-servicio/ChargesList.tsx:294-296 |
| 39 | botón | `Eliminar` | Borra (borrado **físico**, sin comprobar uso previo) | Tras #36 | components/pos/cargos-servicio/ChargesList.tsx:297-302 · cargosServicioService.ts:161-176 |
| 40 | toast | `Cargo eliminado correctamente` · `Cargo duplicado correctamente` · `Cargo activado` / `Cargo desactivado` · `{n} cargos importados correctamente` · `Importados: {n}. Errores: {m}` · `Error al cargar los cargos de servicio` | Retroalimentación | Según la acción | ChargesList.tsx:71, 85, 98 · ChargesHeader.tsx:91-97 · CargosServicioContent.tsx:57 |

**Paginación: no existe.** `ChargesList` mapea el array entero
(`ChargesList.tsx:152`) y `getAll` no pagina (`cargosServicioService.ts:18-42`).

---

#### S.6 `ChargeForm` — campo por campo

`components/pos/cargos-servicio/ChargeForm.tsx` (374 líneas).

| # | Tipo | Etiqueta exacta | Tipo de control | Obligatorio | Validación / visibilidad | Archivo:línea |
|---|---|---|---|---|---|---|
| 1 | texto | `Nuevo Cargo de Servicio` / `Editar Cargo de Servicio` | Título del diálogo | — | Según `isEditing` | ChargeForm.tsx:150-152 |
| 2 | campo | `Nombre *` | `Input` texto, placeholder `Ej: Cargo por servicio 10%` | **Sí** (asterisco rojo explícito) | `!name.trim()` → `El nombre es requerido`; **sin unicidad**: se pueden crear dos cargos con el mismo nombre | ChargeForm.tsx:157-174, 100-102 |
| 3 | campo | `Tipo de Cargo` | Dos botones-tarjeta: `Porcentaje` · `Monto Fijo` | Sí (default `percentage`) | Cambia el prefijo y el `step` del campo `Valor` | ChargeForm.tsx:177-218 |
| 4 | campo | `Valor *` | `Input` numérico con prefijo `%` o `$`; `step` 0,5 (%) o 100 (fijo) | **Sí** | `<= 0` → `El valor debe ser mayor a 0`; `> 100` con porcentaje → `El porcentaje no puede ser mayor a 100%` | ChargeForm.tsx:221-246, 104-110 |
| 5 | campo | `Monto Mínimo (opcional)` | `Input` numérico con prefijo `$`, `min=0`, `step=1000`, placeholder `0` | No | Sin validación propia | ChargeForm.tsx:250-265 |
| 6 | campo | `Personas Mínimas (opcional)` | `Input` numérico, `min=0`, placeholder `0` | No | Sin validación propia | ChargeForm.tsx:266-277 |
| 7 | campo | `Aplica a` | `Select`: `Todos` · `En sitio` · `Domicilio` · `Para llevar` | Sí (default `all`) | Deriva de `APPLIES_TO_LABELS` | ChargeForm.tsx:280-296 |
| 8 | campo | `Sucursal (opcional)` | `Select`: `Global (todas las sucursales)` + sucursales | No (default global) | Opciones desde la prop `branches`, que `CargosServicioContent` obtiene con `CargosServicioService.getBranches()` — **no del `BranchContext`** | ChargeForm.tsx:298-317 · CargosServicioContent.tsx:43, 99, 122 |
| 9 | toggle | `Gravado con impuesto` (`El cargo se incluirá en la base gravable`) | `Switch` | No (default `false`) | Se guarda, pero **nadie lo consume**: no hay base gravable que lo lea (§P.8) | ChargeForm.tsx:320-333 |
| 10 | toggle | `Cargo opcional` (`El cliente puede rechazar este cargo`) | `Switch` | No (default `false`) | Ídem: no hay ninguna pantalla donde rechazarlo | ChargeForm.tsx:335-347 |
| 11 | botón | `Cancelar` | Cierra sin guardar | — | `disabled` mientras `loading` | ChargeForm.tsx:351-360 |
| 12 | botón | `Crear` / `Actualizar` / `Guardando...` | Envía | — | `disabled` mientras `loading` | ChargeForm.tsx:361-368 |
| 13 | toast | `Cargo creado correctamente` / `Cargo actualizado correctamente` | Retroalimentación | — | Éxito | ChargeForm.tsx:125, 128 |

Campos de datos: #2, #3, #4, #5, #6, #7, #8, #9, #10 — nueve, que cubren toda
`CreateServiceChargeData` (`components/pos/cargos-servicio/types.ts:27-37`).
`is_active` no está en el formulario: el alta lo fija a `true` a fuego
(`cargosServicioService.ts:112`) y solo se cambia desde el `Switch` de la fila.

---

#### S.7 Datos — `components/pos/cargos-servicio/cargosServicioService.ts`

Cliente: `supabase` de `@/lib/supabase/config` (**navegador**),
`cargosServicioService.ts:1`; organización desde `getOrganizationId()` del
navegador (`cargosServicioService.ts:2`).

| Método | Operación | Tabla / RPC | Columnas y embeds | Archivo:línea |
|---|---|---|---|---|
| `getAll` | `.select` | `service_charges` | `*` + `branch:branches(id, name)`; `.eq('organization_id')`; `.order('name')` | cargosServicioService.ts:18-28 |
| `getAll` | filtros | `service_charges` | `.eq('is_active')`, `.eq('branch_id')`, `.eq('applies_to')` | cargosServicioService.ts:30-40 |
| `getActive` | compuesto | `service_charges` | `getAll({ is_active: true })` | cargosServicioService.ts:59-61 |
| `getById` | `.select` | `service_charges` | `*` + `branch:branches(id, name)`; `.eq('id')`, `.single()` — **sin `organization_id`** | cargosServicioService.ts:68-78 |
| `create` | `.insert` | `service_charges` | `organization_id`, `name`, `charge_type`, `charge_value`, `min_amount`, `min_guests`, `applies_to`, `is_taxable`, `is_optional`, `branch_id`, `is_active: true` | cargosServicioService.ts:99-115 |
| `update` | `.update` | `service_charges` | `...data` + `updated_at`; `.eq('id')` — **sin `organization_id`** | cargosServicioService.ts:132-144 |
| `delete` | `.delete` | `service_charges` | `.eq('id')` — **sin `organization_id`**, borrado físico | cargosServicioService.ts:161-176 |
| `toggleActive` | compuesto | `service_charges` | `update(id, { is_active })` | cargosServicioService.ts:181-183 |
| `duplicate` | compuesto | `service_charges` | `getById` + `create` con `name = {name} (copia)`; copia `branch_id` y ambos flags | cargosServicioService.ts:188-210 |
| `getBranches` | `.select` | `branches` | `id, name`; `.eq('organization_id')`, `.eq('is_active', true)`, `.order('name')` | cargosServicioService.ts:215-236 |
| `importFromCSV` | bucle | `service_charges` | N llamadas a `create`, una por fila; `split(',')` sin comillas ni escapes | cargosServicioService.ts:241-292 |
| `calculateCharge` | (puro) | — | Comprueba `min_amount`/`min_guests` y devuelve `subtotal × valor / 100` o el valor fijo | cargosServicioService.ts:297-316 |

**No hay ni un `.rpc(...)`.** `calculateCharge` es la única aritmética del
dominio y **no la llama nadie** (§P.8).

Existe además un **segundo lector** de la misma tabla en la configuración del
POS: `configuracionService.ts:235-246` (`select('*')` con `organization_id`) y
`configuracionService.ts:249-256` (`update` de `is_active` sin
`organization_id`), más un conteo con `count: 'exact'` en
`configuracionService.ts:296`. Es decir, hay **dos implementaciones del mismo
interruptor** de activación (`ConfiguracionPage.tsx:948-955` y
`ChargesList.tsx:223-227`).

---

### P. Relación con propinas y con el carrito

#### P.8 ¿Se aplican en el POS?

**Cargos de servicio: no se aplican en ninguna parte.** La evidencia es
negativa y es exhaustiva: un `grep` de `service_charge|ServiceCharge|
CargosServicio` sobre todo `src/` devuelve **doce archivos y ninguno es de
venta**: los seis del módulo `components/pos/cargos-servicio/*`, la página
envoltorio `app/app/pos/cargos-servicio/page.tsx`, y cuatro de
`components/pos/configuracion/*` (el modal embebido y el listado de solo
lectura con su interruptor). Donde se buscaría y no está:

- `components/pos/CartView.tsx` — el carrito solo conoce `subtotal`, descuentos
  por línea e impuestos; ninguna línea menciona cargo alguno
  (`CartView.tsx:153-171`, `830-871`).
- `components/pos/TaxSummary.tsx` — los totales que ve el cajero se componen de
  `subtotal`, `totalTaxAmount` y `finalTotal`, sin un tercer sumando
  (`TaxSummary.tsx:57, 78-82, 139-142, 223-228`).
- `components/pos/CheckoutDialog.tsx` — el total es
  `baseTotal + tipAmount + shippingFee` (`CheckoutDialog.tsx:239`): propina y
  domicilio sí, cargo de servicio no.
- `lib/services/posService.ts` — el checkout no lee `service_charges` en ningún
  punto (el `grep` no devuelve nada en `src/lib/services`).
- **Detalle de mesa:** `components/pos/mesas/**` (13 archivos, incluido
  `mesas/id/`) tampoco lo menciona. Es donde más sentido tendría, porque
  `min_guests` (`ChargeForm.tsx:266-277`) y `applies_to: 'dine_in'`
  (`types.ts:56`) están pensados para servicio en mesa.
- `CargosServicioService.calculateCharge` (`cargosServicioService.ts:297-316`)
  es la función que aplicaría el cargo y **no tiene ni un solo llamador** fuera
  de su propio archivo.

Conclusión: los cargos de servicio son hoy un **CRUD huérfano**. Se crean, se
importan, se activan y se desactivan, pero ninguna venta los suma. El subtítulo
`Configura cargos automáticos como propina sugerida`
(`ChargesHeader.tsx:125-127`) y el texto del interruptor `El cargo se incluirá
en la base gravable` (`ChargeForm.tsx:324-326`) describen un comportamiento que
no existe.

**Cupones: tampoco se aplican en el POS.** El POS real (`/app/pos`,
`app/app/pos/page.tsx:730` y `:819`, que monta `CartView` + `CheckoutDialog`)
**no tiene ningún campo de cupón**: el `grep` de `coupon|cupón` sobre
`CartView.tsx` y `CheckoutDialog.tsx` no devuelve nada. Sí hay un campo en la
página secundaria «Nueva Venta» (`/app/pos/ventas/nuevo`), y es un **muñeco**:

```
// TODO: Implementar aplicación de cupón
alert(`Cupón "${couponCode}" aplicado (demo)`);
```

`components/pos/ventas/nuevo/NuevaVentaPage.tsx:146-148`; el campo
`Código de cupón` y el botón `Aplicar` están en
`NuevaVentaPage.tsx:381-399`. No toca la tabla `coupons`, no valida vigencia ni
cupo, no descuenta nada y no inserta redención. El `catch` muestra otro
`alert('Cupón inválido o expirado')` (`NuevaVentaPage.tsx:152`) que nunca se
puede disparar, porque el `try` no hace nada que pueda fallar.

**La única ruta real de redención es la tienda web**, no el POS:
`lib/services/webOrderConfirmationService.ts:127-130` llama a `redeemCoupon`
(`webOrderConfirmationService.ts:336-394`), que corrige el `sale_id` de la
redención que ya insertó el sitio web o, como respaldo, busca el cupón por
`code` + `is_active` e inserta en `coupon_redemptions`
(`webOrderConfirmationService.ts:370-380`). `usage_count` lo incrementa un
trigger de la base, no la aplicación
(`webOrderConfirmationService.ts:385-388`). El detalle de venta solo **muestra**
el código que vino del pedido web (`components/pos/ventas/VentaDetalle.tsx:826-832`,
alimentado por `VentasService.ts:418`).

Por tanto: todas las estadísticas del detalle del cupón —`Redenciones`,
`Total Descontado`, `Historial de Redenciones`— se alimentan **solo de pedidos
online**. Un cupón usado en caja no existe.

#### P.9 Qué comparten cargos de servicio y propinas

**Nada en el código.** Son dos tablas y dos servicios sin un punto de contacto:

| | Cargos de servicio | Propinas |
|---|---|---|
| Tabla | `service_charges` (`cargosServicioService.ts:19`) | `tips` (`components/pos/propinas/propinasService.ts:21, 179, 218, 242, 272`) |
| Tipo | `ServiceCharge` (`cargos-servicio/types.ts:6-25`) | `Tip` (`propinas/types.ts:5-29`) |
| Clasificación | `charge_type: 'percentage' \| 'fixed'` | `tip_type: 'cash' \| 'card' \| 'transfer' \| 'online'` |
| Cálculo | `calculateCharge` (sin llamadores) | `computeTipAmount` en `lib/pos/display/tip.ts:76-80` |
| Se aplica en la venta | No | Sí |

La «propina sugerida» del subtítulo (`ChargesHeader.tsx:126`) **no conecta con
las propinas reales**: el cobro no lee `service_charges` para proponer nada.
Lo único que comparten es el vecindario en la configuración del POS, donde
`PropinasModal` y `CargosModal` son dos modales contiguos
(`components/pos/configuracion/ConfigModals.tsx:66-80`).

Nótese también que `tips.tip_type` declara `'transfer'` en el tipo de TypeScript
(`propinas/types.ts:3`) mientras el checkout documenta que la restricción
`CHECK` de la base solo admite `cash/card/split/pooled`
(`lib/services/posService.ts:2400-2403`): el tipo del módulo de propinas y la
base no coinciden.

#### P.10 Dónde se calcula la propina en el cobro

Toda en `components/pos/CheckoutDialog.tsx`:

| Elemento | Archivo:línea |
|---|---|
| Estado `tipAmount` | CheckoutDialog.tsx:133 |
| Base del porcentaje (total con impuestos, **antes** de propina y domicilio) | CheckoutDialog.tsx:335-337 |
| Total del cobro = `baseTotal + tipAmount + shippingFee` | CheckoutDialog.tsx:239 |
| Botones `5%` `10%` `15%` `20%` | CheckoutDialog.tsx:2331-2348 |
| Aritmética compartida: `Math.round(base × pct / 100)` | lib/pos/display/tip.ts:76-80 (usada por `handleTipPercentage`, CheckoutDialog.tsx:708) |
| Campo `Monto personalizado` | CheckoutDialog.tsx:2353-2372 |
| Campo `Mesero (opcional)` → `tip_server_id` | CheckoutDialog.tsx:2374-2390, 1127 |
| Aviso `TipFromDisplayNotice` (propina elegida en la pantalla del cliente) y su `Aplicar` | CheckoutDialog.tsx:2312-2329 |
| Resumen `Propina:` en el cobro y en el recibo | CheckoutDialog.tsx:2392-2399, 1908-1912 |
| Envío al servicio: `tip_amount`, `tip_server_id` | CheckoutDialog.tsx:1126-1127 |
| Inserción en `tips` (con guarda de idempotencia `childExists`) | lib/services/posService.ts:2388-2416 |

La base del porcentaje es el total **con impuestos** y **sin** domicilio
(`CheckoutDialog.tsx:335-337`, documentado en `lib/pos/display/tip.ts:16-19`).
Un cargo de servicio, si existiera, no entraría en esa base.

---

### T. Transversal

#### T.11 Roturas y deuda

**a) `confirm()` / `alert()` nativos.** En los módulos de cupones y cargos
propiamente dichos **no hay ninguno** — ambos usan `AlertDialog` del kit
(`CouponsList.tsx:288-310`, `ChargesList.tsx:283-305`) y `sonner` para los
avisos. Los nativos están en el **punto de entrada del cupón en el POS**,
`components/pos/ventas/nuevo/NuevaVentaPage.tsx`:

| Línea | Cita |
|---|---|
| :109 | `alert('Error al agregar producto');` |
| :148 | ``alert(`Cupón "${couponCode}" aplicado (demo)`);`` |
| :152 | `alert('Cupón inválido o expirado');` |
| :160 | `alert('El carrito está vacío');` |
| :168 | ``alert(`Venta completada: ${formatCurrency(sale.total)}`);`` |
| :175 | `alert('Venta guardada como pendiente');` |
| :181 | `if (!confirm('¿Limpiar el carrito?')) return;` |

Siete diálogos nativos, uno de ellos (`:181`) un `confirm()` destructivo sobre
el carrito.

**b) Props que se pasan y nunca se usan (cargos de servicio).**
`ChargesHeaderProps` declara `branches: { id: number; name: string }[]`
(`ChargesHeader.tsx:41`) y `CargosServicioContent` se lo pasa
(`CargosServicioContent.tsx:99`), pero la desestructuración del componente
**omite `branches`** (`ChargesHeader.tsx:50-57`): el selector de sucursal usa
`globalBranches` del `BranchContext` (`ChargesHeader.tsx:61, 224`). La prop
viaja y se tira. Consecuencia real: el diálogo (`ChargeForm`, que sí usa la
prop, `ChargeForm.tsx:47, 310`) y el filtro leen **dos fuentes distintas** de
sucursales, con criterios distintos —`getBranches()` filtra por
`is_active = true` (`cargosServicioService.ts:223`), el contexto no
necesariamente—. Importaciones muertas en los mismos archivos: `Building2`
(`ChargesHeader.tsx:9`, nunca usado), `ToggleLeft` y `ToggleRight`
(`ChargesList.tsx:9-10`), `getCurrentBranchId`
(`cargosServicioService.ts:2`) y, en cupones, `Upload`
(`CouponsHeader.tsx:7`, residuo de un «Importar» que no existe en esta
pantalla aunque el servicio tiene `importFromData`,
`couponsService.ts:346`).

**c) Moneda cableada.** Todo importe de ambos módulos pasa por
`formatCurrency` de `@/utils/Utils`, cuya firma es
`formatCurrency(value, currency: string = "COP")` con
`new Intl.NumberFormat("es-CO", { style: "currency", currency, ... })`
(`utils/Utils.ts:69-89`): **moneda por defecto `'COP'` y locale `es-CO` fijo**.
Ninguna de las 10 llamadas de estos módulos pasa el segundo argumento:
`CouponsList.tsx:135`; `app/app/pos/cupones/[id]/page.tsx:267, 302, 308, 362,
426`; `ChargesList.tsx:109, 197`. Contrasta con el cobro, que sí resuelve la
moneda de la organización (`CheckoutDialog.tsx:2318`,
`currency?.code || 'COP'`). Existe `lib/hooks/useOrgCurrency.ts` y ninguno de
los dos módulos lo usa. Además `$` está escrito a mano como prefijo o sufijo en
cuatro sitios: `CouponForm.tsx:192`, `ChargeForm.tsx:227` y
`ChargeForm.tsx:253`.

En el CSV de redenciones, en cambio, los importes salen **sin formatear**
(`discount_applied` y `sale.total` crudos,
`app/app/pos/cupones/[id]/page.tsx:135-136`), lo que es correcto para un CSV
pero incoherente con el resto.

**d) `.split('T')[0]` y vigencias sin zona horaria.** Tres infracciones
directas de las reglas canónicas de fechas:

| Cita | Archivo:línea |
|---|---|
| `start_date: coupon.start_date?.split('T')[0],` | components/pos/cupones/CouponForm.tsx:60 |
| `end_date: coupon.end_date?.split('T')[0],` | components/pos/cupones/CouponForm.tsx:61 |
| ``new Date().toISOString().split('T')[0]`` (nombre del CSV) | app/app/pos/cupones/[id]/page.tsx:148 |

Las dos primeras descartan el offset del valor que viene de la base al
precargar el formulario de edición: la regla 2 de `docs/reglas-fechas-timezone.md`
las prohíbe explícitamente. La tercera deriva «hoy» en UTC para el nombre del
archivo (regla 1): en Bogotá, entre las 19:00 y la medianoche el archivo lleva
la fecha del día siguiente.

**Ningún renderizado de fecha de estos módulos pasa por el timezone de la
organización.** No hay una sola importación de `useFormatDate`,
`formatDateInTz`, `formatPlainDate` ni de `OrganizationTimezoneContext` en
`components/pos/cupones/**`, `components/pos/cargos-servicio/**`,
`app/app/pos/cupones/**` ni `app/app/pos/cargos-servicio/**`. En su lugar hay
tres formateadores caseros con `toLocaleDateString`/`toLocaleString('es-CO')`,
que usan la zona **del navegador**:

- `CouponsList.tsx:122-129` (`formatDate`, columna `Vigencia`)
- `app/app/pos/cupones/[id]/page.tsx:166-173` (`formatDate`, fechas y auditoría)
- `app/app/pos/cupones/[id]/page.tsx:175-183` (`formatDateTime`, historial)
- `app/app/pos/cupones/[id]/page.tsx:131` (`toLocaleString('es-CO')` del CSV)

**Y la vigencia se decide con la misma aritmética sin zona**, en tres lugares
duplicados: `CouponsList.tsx:98-120` (badges de la lista),
`app/app/pos/cupones/[id]/page.tsx:154-164` (badge del detalle) y
`app/app/pos/cupones/page.tsx:41-50` (el stat `Activos`). Los tres hacen
`new Date(c.end_date) < new Date()`. Si `end_date` es un día calendario, se
interpreta como medianoche UTC y en Bogotá (UTC−5) el cupón aparece **`Expirado`
cinco horas antes** de que termine su último día; con `start_date`, un cupón que
empieza hoy se ve `Programado` hasta las 19:00 del día anterior. Es exactamente
el bug sistémico que documenta `docs/reglas-fechas-timezone.md`, reproducido
tres veces.

**e) Conteos en el navegador.** Cuatro:

| Qué | Cómo | Archivo:línea |
|---|---|---|
| `Total Cupones` | `coupons.length` del array **ya filtrado**: al filtrar por estado o tipo, el «total» cambia | app/app/pos/cupones/page.tsx:69 |
| `Activos` (cupones) | `coupons.filter(...).length` recalculando vigencia y cupo en JS | app/app/pos/cupones/page.tsx:41-50 |
| `Total Descontado` | `redemptions.reduce(...)` sobre todas las redenciones traídas a memoria | app/app/pos/cupones/[id]/page.tsx:209 |
| `Total` / `Activos` / `Inactivos` (cargos) | **Segunda consulta completa** `getAll()` sin filtros solo para contar en JS: dos viajes y dos veces los datos en cada recarga | components/pos/cargos-servicio/CargosServicioContent.tsx:49-54 |

Ninguno usa `count: 'exact', head: true`, que sí se usa en el mismo dominio
(`components/pos/configuracion/configuracionService.ts:296`).

**f) Permisos: no hay ninguno.** Ni `usePermission`, ni `hasPermission`, ni
`PermissionGuard`, ni comprobación de rol en `components/pos/cupones/**`,
`components/pos/cargos-servicio/**`, `app/app/pos/cupones/**` ni
`app/app/pos/cargos-servicio/**`. Crear, editar, duplicar, activar, importar y
**eliminar** están disponibles para cualquiera que alcance la ruta. Todo el
aislamiento multi-tenant recae en RLS, y además desde el cliente de navegador:
ambos servicios importan `supabase` de `@/lib/supabase/config`
(`couponsService.ts:1`, `cargosServicioService.ts:1`) y resuelven la
organización desde el almacenamiento del navegador
(`couponsService.ts:12-15`, `cargosServicioService.ts:16`), no de la sesión del
servidor.

Agravante concreto en cargos: `getById` (`cargosServicioService.ts:77`),
`update` (`:142`) y `delete` (`:166`) filtran **solo por `id`**, sin
`organization_id`. Cupones sí lo incluye en `getById`, `update` y `delete`
(`couponsService.ts:127, 222, 260`), pero **no** en `getRedemptions`
(`couponsService.ts:328`) ni en la comprobación previa al borrado
(`couponsService.ts:249`).

**g) Filtro de sucursal propio (prohibido): confirmado.**
`ChargesHeader.tsx:215-230` monta un `Select` con etiqueta `Sucursal` y opción
`Todas las sucursales`, poblado con `globalBranches` del `BranchContext`. Su
manejador **escribe en el contexto global**:

```
const handleBranchChange = (value: string) => {
  setSelectedBranch(value === 'all' ? 'all' : parseInt(value));
};
```

`ChargesHeader.tsx:70-72`. O sea: no es un filtro local inocuo — cambiar la
sucursal aquí cambia la sucursal de **toda la aplicación**, sin que el usuario
lo sepa y sin reflejarse en el selector del header. Es el único de los dos
módulos que lo hace; cupones se limita a consumir `branchFilter`
(`app/app/pos/cupones/page.tsx:22-23`). Agravado por el montaje embebido en un
modal de configuración (`ConfigModals.tsx:74-80`), donde el selector aparece
**dentro de un diálogo** y altera el estado global de la sesión.

Segundo defecto del mismo filtro: `cargosServicioService.ts:34-36` aplica
`.eq('branch_id', filters.branch_id)`, de modo que al elegir una sucursal
**desaparecen los cargos globales** (`branch_id IS NULL`), los mismos que la
lista etiqueta `Global (todas las sucursales)` (`ChargesList.tsx:169-173`). Un
cargo global es precisamente el que **sí** aplica a esa sucursal.

Tercer defecto: el filtro `Aplica a` toma sus opciones de `APPLIES_TO_LABELS`,
que incluye la clave `all` con etiqueta `Todos` (`types.ts:55`), pero el
manejador trata `'all'` como «sin filtro» (`ChargesHeader.tsx:74-79`). Resultado:
**no hay forma de filtrar los cargos cuyo `applies_to` es `'all'`**, y el
`Select` no tiene una opción real de «sin filtro» distinguible.

**h) Menús con más de 8 entradas:** ninguno. El ⋯ de cupones tiene 5 entradas
(`CouponsList.tsx:240-278`) y el de cargos 3 (`ChargesList.tsx:250-273`). Sí
hay una rareza de accesibilidad: un `Switch` metido dentro de un
`DropdownMenuItem` con `pointer-events-none`
(`CouponsList.tsx:265-268`) — un control interactivo desactivado usado como
icono.

**i) Paginación a mano:** ninguna, porque **no hay paginación en absoluto** en
ninguno de los dos listados (ver §U.1 y §S.5). Ni del kit ni casera, pese a que
el repositorio tiene componente propio para ello
(`components/pos/mesas/MesasPagination.tsx`).

**j) Estados que faltan.**

| Estado | Cupones | Cargos |
|---|---|---|
| Carga | Sí (`page.tsx:52-60`, `CouponsList.tsx:138-146`) | Sí (`CargosServicioContent.tsx:83-90`, `ChargesList.tsx:112-120`) |
| Vacío | Sí, pero **sin botón de acción** (`CouponsList.tsx:148-160`) | Sí, ídem (`ChargesList.tsx:122-134`) |
| Vacío por filtro | **No**: el mismo mensaje «No hay cupones registrados» aparece cuando la búsqueda no encuentra nada | **No**: ídem |
| Error | **No**: el `catch` solo hace `toast` y deja la pantalla en vacío (`page.tsx:25-28`) | **No** (`CargosServicioContent.tsx:55-58`) |
| Reintento | **No** | **No** |
| Sin permiso | **No** (no hay permisos) | **No** |
| Guardando | Sí, en el diálogo (`CouponForm.tsx:282`) | Sí (`ChargeForm.tsx:367`) |
| Importando | — | Parcial: `disabled` en el campo (`ChargesHeader.tsx:288`), **sin indicador de progreso** pese a que la importación es fila a fila |

Además, el diálogo de importación de cargos **no tiene botón de importar**: la
carga arranca en el `onChange` del `input file` (`ChargesHeader.tsx:287`), sin
previsualización ni confirmación, sobre un parser que hace
`line.split(',')` sin respetar comillas (`cargosServicioService.ts:259`) — un
nombre con coma parte la fila. Y `CouponsService.importFromData` existe
(`couponsService.ts:346-360`) pero **ninguna pantalla lo invoca**; de ahí el
`Upload` importado y sin usar en `CouponsHeader.tsx:7`.

**k) Interpolación sin escapar en filtros PostgREST.** El texto de búsqueda de
cupones entra crudo en la cadena del filtro:
`` query.or(`code.ilike.%${filters.search}%,name.ilike.%${filters.search}%`) ``
(`couponsService.ts:42`). Una coma, un paréntesis o un punto en el término
alteran la expresión y pueden producir un error 400 o un filtro distinto del
pedido.

**l) `toggleActive` no es atómico.** En cupones hace `getById` y luego `update`
con el valor negado (`couponsService.ts:297-302`): dos viajes y una condición de
carrera si dos cajeros alternan el mismo cupón. En cargos sí se manda el valor
deseado desde la interfaz (`ChargesList.tsx:83`), que es lo correcto.

---

#### T.12 Conteo de controles

**Cupones**

| Subsección | Controles |
|---|---|
| U.1 Listado (cabecera, stats, filtros, tabla, badges, menú ⋯, estados) | 41 |
| U.2 Detalle `/[id]` (cabecera, detalles, estado, estadísticas, historial, diálogos) | 42 |
| U.3 `CouponForm` (11 campos de datos + título, botones y toasts) | 16 |
| **Total cupones** | **99** |

**Cargos de servicio**

| Subsección | Controles |
|---|---|
| S.5 Listado (cabecera, importación CSV, stats, filtros, tabla, switch por fila, badges, menú ⋯, estados) | 40 |
| S.6 `ChargeForm` (9 campos de datos + título, botones y toasts) | 13 |
| **Total cargos** | **53** |

**Total general auditado: 152 controles** (99 de cupones + 53 de cargos de
servicio), sobre 13 archivos: 6 de `components/pos/cupones/`, 6 de
`components/pos/cargos-servicio/` y las 3 páginas de `app/app/pos/`
(`cupones/page.tsx`, `cupones/[id]/page.tsx`, `cargos-servicio/page.tsx`).

Fuera de ese conteo, pero auditados por relación: el campo `Código de cupón` y
el botón `Aplicar` de `NuevaVentaPage.tsx:381-399` (2 controles, ambos muñecos),
y el listado de solo lectura con interruptor de
`ConfiguracionPage.tsx:918-959` (1 interruptor duplicado).

---

## F. Esquema verificado con el MCP de Supabase

Todo lo de esta sección se comprobó por `SELECT` sobre el proyecto `jgmgphmzusbluqhuqihj` el
2026-09-22. **No se escribió nada.** Se verificaron 13 tablas: `restaurant_tables`,
`restaurant_zone_layouts`, `table_sessions`, `restaurant_reservations`, `kitchen_tickets`,
`kitchen_ticket_items`, `printer_station_assignments`, `promotions`, `promotion_rules`, `coupons`,
`coupon_redemptions`, `service_charges` y `tips`.

### F.1 Qué trae cada pantalla de otras tablas

| Pantalla | Tabla raíz | Lo que cruza | Cómo |
|---|---|---|---|
| Plano de mesas | `restaurant_tables` | `table_sessions` (sesión abierta), `sales` (total), `sale_items` (nº de líneas), `profiles` (mesero), `kitchen_tickets` + `kitchen_ticket_items` (pendientes de cocina), `restaurant_zone_layouts` (recuadros de zona) | 6 consultas sueltas y un cruce en el navegador; solo `kitchen_tickets` usa embed |
| Historial de mesas | `table_sessions` | `restaurant_tables`, `sales`, `profiles`, `organization_members`, `ops_audit_log` | 2 embeds y 3 cruces en el navegador por `metadata->>table_session_id` |
| Detalle de mesa | `table_sessions` | `sales`, `sale_items`, `products`, `product_images`, `kitchen_tickets`, `kitchen_ticket_items`, `customers`, `reservations` + `reservation_spaces` + `spaces` + `folios` (PMS), `profiles`, `payments`, `invoice_sales`, `invoice_items`, `accounts_receivable`, `commissions`, `ops_audit_log` | 46 `.from(...)` y ni un `.rpc(...)` |
| Reservas | `restaurant_reservations` | `restaurant_tables` (embed `restaurant_table`) | La columna `customer_id` existe y **ninguna pantalla la llena**: no se consulta `customers` en todo el módulo |
| Comandas | `kitchen_tickets` | `table_sessions` → `restaurant_tables`, `kitchen_ticket_items` → `sale_items` → `products` → `categories`; `profiles` aparte; `printers` + `printer_station_assignments` + `print_jobs` + `print_agents` para imprimir | Un embed de 4 niveles sin `limit` |
| Promociones | `promotions` | `promotion_rules` (embed), y `products` / `categories` en dos consultas extra solo para resolver nombres | — |
| Cupones | `coupons` | `customers` (embed), `promotions` (embed `branches`), `coupon_redemptions` → `sales` → `branches` y `customers` | — |
| Cargos de servicio | `service_charges` | `branches` (embed) | — |

### F.2 Restricciones `CHECK` que el diseño debe respetar

| Tabla | Columna | Valores admitidos |
|---|---|---|
| `restaurant_tables` | `state` | `free`, `occupied`, `reserved` — **y nada más** |
| `table_sessions` | `status` | `active`, `bill_requested`, `completed` |
| `restaurant_reservations` | `status` | `pending`, `confirmed`, `seated`, `completed`, `cancelled`, `no_show` |
| `restaurant_reservations` | `source` | `admin`, `website`, `phone`, `whatsapp` |
| `kitchen_tickets` | `status` | `new`, `preparing`, `ready`, `delivered` |
| `kitchen_ticket_items` | `status` | `pending`, `in_progress`, `ready`, `delivered` |
| `printer_station_assignments` | `station` | `hot_kitchen`, `cold_kitchen`, `bar`, `cashier`, `all` |
| `promotions` | `promotion_type` | `percentage`, `fixed_amount`, `buy_x_get_y`, `bundle`, `free_shipping` |
| `promotions` | `applies_to` | `all`, `categories`, `products`, `brands` |
| `promotion_rules` | `rule_type` | `include_product`, `include_category`, `exclude_product`, `exclude_category`, `include_brand`, `exclude_brand` |
| `coupons` | `discount_type` | `percentage`, `fixed_amount` |
| `service_charges` | `charge_type` | `percentage`, `fixed_amount` |
| `service_charges` | `applies_to` | `all`, `dine_in`, `delivery`, `takeout` |
| `tips` | `tip_type` | `cash`, `card`, `split`, `pooled` |

**Cinco desajustes entre el `CHECK` y la interfaz, verificados:**

1. **«Combinada» no existe en la base.** `restaurant_tables.state` solo admite tres valores y no
   hay columna de mesa principal ni tabla de combinación. Combinar mesas se implementa reasignando
   `table_sessions.restaurant_table_id` y poniendo las secundarias en `free`
   (`components/pos/mesas/mesasService.ts:609-621`): **la combinación no queda registrada en
   ninguna parte** y no se puede deshacer.
2. **«Cuenta solicitada» tampoco es un estado de mesa**, sino de la sesión
   (`table_sessions.status = 'bill_requested'`). De ahí el desfase del filtro del listado, que
   mezcla los dos dominios (`app/app/pos/mesas/page.tsx:138-142`).
3. **`reserved` está muerto en la práctica**: 0 filas con `state = 'reserved'` en toda la base,
   pese a que las reservas lo escriben (`reservasMesasService.ts:244-248`). Es consecuencia directa
   de F.4.
4. **El vocabulario de cocina es doble e incompatible**: el ticket usa `new/preparing/ready/
   delivered` y el ítem `pending/in_progress/ready/delivered`. La interfaz lo refleja tal cual y
   dice «En Preparación» en el ticket y «Preparando» en el ítem (`TicketCard.tsx:19-52` vs `:67-80`).
5. **`include_brand` / `exclude_brand` y `applies_to='brands'` son inexpresables**: el `CHECK` los
   admite pero `promotion_rules` solo tiene `product_id` y `category_id`; no hay columna de marca.
   El motor los evalúa comparando `rule.product_id` con `item.product_id`
   (`lib/services/promotionEngine.ts:183-188`) y `APPLIES_TO_LABELS` no cubre `'brands'`, así que
   una fila así renderiza `undefined`.

Además, `printer_station_assignments.station` admite **cinco** estaciones y la barra de filtros de
comandas solo ofrece tres, cableadas en el componente (`FilterBar.tsx:27-31`): «Caja» (`cashier`) y
«Todas» (`all`) no se pueden filtrar aunque haya impresoras asignadas.

### F.3 Triggers: dos existen y la interfaz no los aprovecha

- **`trg_kitchen_ticket_ready_notify` → `notify_waiter_on_ticket_ready()`** (SECURITY DEFINER,
  `AFTER UPDATE ON kitchen_tickets`). Cuando un ticket pasa a `ready`, lee `server_id` y
  `organization_id` de `table_sessions`, resuelve el nombre de la mesa e **inserta en
  `notifications`** un aviso `type = 'kitchen_ticket_ready'` con el texto «Comanda lista para
  servir» / «La comanda #N de la mesa X está lista para servir». Es decir: **el aviso al mesero
  existe en la base de datos desde hace tiempo y ninguna de las seis pantallas lo muestra.** Solo
  dispara si el ticket tiene `table_session_id`; hoy **44 de 205 comandas no lo tienen** (las
  creadas desde el POS sin mesa), así que para esas no hay aviso.
- **`trg_coupon_redemption_increment` → `fn_coupon_redemption_increment()`**: cada `INSERT` en
  `coupon_redemptions` incrementa `coupons.usage_count`. La aplicación nunca escribe ese contador.
- **`trg_auto_journal_tip`** contabiliza la propina al insertarla en `tips`.
- **`table_sessions`** tiene `trg_branch_default` (rellena `branch_id` al insertar) y
  `trg_branch_audit`. Por eso el `INSERT` de `abrirSesion`, que **no escribe `branch_id`**
  (`mesasService.ts:399-410`), no deja filas huérfanas: 0 sesiones sin sucursal en la base.
- **No hay ningún trigger que sincronice `restaurant_tables.state` con `table_sessions.status`.**
  Esa coherencia la sostiene el código de la aplicación, en cuatro sitios distintos y sin
  transacción, y es la causa del desfase entre el KPI «Libres» y lo que pinta la tarjeta.

### F.4 RLS: el agujero crítico ya está cerrado; quedan tres tablas legibles por `anon`

`anon` y `authenticated` tienen `SELECT, INSERT, UPDATE, DELETE` sobre las 13 tablas. Con eso, lo
único que separa los datos de una organización de las demás son las políticas.

**Lo que había y ya se corrigió.** `restaurant_reservations` tenía sus **cuatro** políticas
`PERMISSIVE` para el rol `public` con `USING (true)` / `WITH CHECK (true)`: cualquiera con la clave
anónima podía leer, crear, modificar y **borrar** las reservas de todas las organizaciones. Y
`coupon_redemptions` tenía además «Allow anon insert» con `WITH CHECK (true)`, que junto con el
disparador de F.3 permitía agotar un cupón ajeno sin autenticarse.

La migración **`20260922200000_rls_reservas_y_redenciones`** (con su reversión en
`supabase/rollbacks/`) cerró las dos cosas el 2026-09-22. **Estado verificado con el MCP después de
aplicarla:** las cuatro políticas de `restaurant_reservations` apuntan ahora al rol `authenticated`
y exigen pertenencia activa —`organization_id in (select om.organization_id from
organization_members om where om.user_id = (select auth.uid()) and om.is_active)`, el patrón que no
degrada el plan—, y «Allow anon insert coupon_redemptions» ya no existe: la tabla conserva solo
`coupon_redemptions_org_isolation`. **No hay nada que recomendar aquí.**

Lo que sigue abierto:

| Tabla | Políticas | Veredicto |
|---|---|---|
| `coupons` | `Allow anon select coupons` con `qual = true` | Catálogo de cupones de todas las organizaciones legible por `anon`, con sus códigos. |
| `promotions` | `Allow anon select promotions` con `qual = true` | Ídem. |
| `service_charges` | `service_charges_public_read` con `qual = true` | Ídem. Y ahora importa más: con la decisión 2 el cargo pasa a ser una línea de la factura. |
| `restaurant_tables`, `table_sessions`, `kitchen_tickets` | Aisladas por organización, pero la subconsulta es `organization_members.user_id = auth.uid()` **sin `is_active = true`** | Un miembro desactivado conserva el acceso. |
| `restaurant_reservations`, `coupon_redemptions` | Pertenencia activa, rol `authenticated` | **Corregido** por la migración citada. |
| `restaurant_zone_layouts`, `promotion_rules`, `printer_station_assignments`, `kitchen_ticket_items`, `coupons`/`promotions`/`service_charges` (política de organización), `tips` | Aisladas con `is_active = true` | Correcto. |

`table_sessions` es la **única** de las 13 con una política `RESTRICTIVE` de sucursal
(`branch_access_restrictive`, `app_branch_access(branch_id)`). Las otras doce no tienen guarda de
sucursal en la base.

### F.5 Realtime: solo una tabla está publicada

De las 13, **únicamente `kitchen_tickets` está en la publicación `supabase_realtime`**.
Consecuencias verificadas:

- El «Monitor en tiempo real» de comandas se suscribe también a `kitchen_ticket_items`
  (`lib/services/kitchenService.ts:278-315`), que **no está publicada**: marcar un ítem como listo
  desde otra caja no llega a las demás pantallas.
- El plano de mesas no tiene Realtime ni polling (0 `.channel(`, 0 `setInterval`), y aunque lo
  tuviera, `restaurant_tables` y `table_sessions` no están publicadas. El `README.md:7` del módulo
  promete «tiempo real».
- El detalle de mesa sí abre un canal, pero solo sobre cocina (`[id]/page.tsx:116-148`): si otro
  terminal añade un producto a la misma mesa, esta pantalla no se entera.

### F.6 Evidencia de uso (recuento sobre datos reales, sin identificar organizaciones)

| Tabla | Filas | Organizaciones |
|---|---|---|
| `restaurant_tables` | 70 | 9 |
| `restaurant_zone_layouts` | 3 | 3 |
| `table_sessions` | 162 | 9 |
| `restaurant_reservations` | **0** | **0** |
| `kitchen_tickets` | 205 | 6 |
| `kitchen_ticket_items` | 294 | 6 |
| `printer_station_assignments` | 10 | 4 |
| `promotions` | 19 | 5 |
| `promotion_rules` | 27 | — |
| `coupons` | **1** | 1 |
| `coupon_redemptions` | **0** | — |
| `service_charges` | 45 | 13 |
| `tips` | 8 | 3 |

Cinco lecturas que condicionan el rediseño:

1. **Nadie ha creado nunca una reserva.** 0 filas. La pantalla existe, tiene 69 controles y jamás
   se ha usado. Rediseñarla es diseñarla por primera vez, no calcar un hábito.
2. **Las 23 sesiones abiertas llevan todas más de 24 horas abiertas.** `status <> 'completed'` y
   `opened_at < now() - 24h` devuelve 23, y solo hay 23 sesiones no completadas (22 `active` + 1
   `bill_requested`). Nadie libera las mesas. El contador «Tiempo» de la tarjeta y el badge
   «Revisar» a los 45 minutos (`MesaCard.tsx:48`) no han conseguido cambiarlo, entre otras cosas
   porque **el tiempo se congela**: `Date.now()` se evalúa en el render y no hay ningún tick.
3. **El plano casi no se usa:** 3 recuadros de zona guardados para 3 organizaciones, frente a 9 con
   mesas; y 2 de las 70 mesas no tienen `position_x`/`position_y`, así que en el mapa se apilan en
   el origen.
4. **`state = 'reserved'` no lo usa nadie** (0 filas), coherente con que no haya reservas.
5. **1 cupón y 0 redenciones en toda la base**, con 19 promociones en 5 organizaciones y 6 usos
   contados. El detalle del cupón, con sus «Estadísticas» y su «Historial de Redenciones», se
   alimenta solo de la tienda web (`lib/services/webOrderConfirmationService.ts:336-394`): **un
   cupón usado en caja no existe**, porque el POS no tiene campo de cupón.

Reparto de las 19 promociones: 12 `fixed_amount` (todas activas), 5 `buy_x_get_y` (ninguna activa),
2 `percentage`. **Las 19 tienen `end_date` nulo** y **ninguna tiene `branches`** — coherente con que
el asistente no exponga el control de sucursales. 12 tienen `applicable_days`.

---

## G. Lo transversal: los ocho defectos que se repiten en las seis pantallas

Esta sección no repite lo ya dicho: agrupa lo que aparece **en todas** y que, por tanto, no se
arregla pantalla a pantalla sino con una decisión de sistema. El diseño de la parte 2 los da por
resueltos.

### G.1 Ninguna de las seis pantallas usa el huso horario de la organización

`grep` de `useFormatDate|formatDateInTz|formatPlainDate|todayInTz` sobre los seis módulos
(`components/pos/{mesas,reservas-mesas,comandas,promociones,cupones,cargos-servicio}` y sus páginas
en `app/app/pos/`) devuelve **cero resultados**. En su lugar hay:

- **9 usos de `.split('T')[0]`**, prohibido por las reglas 1 y 2 de `docs/reglas-fechas-timezone.md`:
  `reservas-mesas/page.tsx:37`, `ReservaFormDialog.tsx:85`, `reservasMesasService.ts:176`,
  `PromotionWizard.tsx:80`, `:497`, `:506`, `CouponForm.tsx:60`, `:61`,
  `cupones/[id]/page.tsx:148`.
- **10 `toLocaleDateString`/`toLocaleString('es-CO')`** con la zona del navegador, repartidos en
  **siete formateadores caseros distintos**: `HistorialMesasDialog.tsx:50-59`,
  `PreCuentaDialog.tsx:171-174`, `SessionTimelineDialog.tsx:31-39`, `ReservasList.tsx:73-84`,
  `PromotionsList.tsx:130-136`, `cupones/[id]/page.tsx:166-183`, `CouponsList.tsx:122-129`.
- **Una zona horaria cableada a `'UTC'`**: `promociones/[id]/page.tsx:165-172`, contra la regla 6.
  Como el listado usa hora local, **la misma promoción muestra días distintos en el listado y en el
  detalle**.

Los tres efectos concretos, en Bogotá (UTC−5): la pantalla de reservas abre mostrando **mañana** a
partir de las 19:00; un cupón aparece **`Expirado` cinco horas antes** de que termine su último día
(`CouponsList.tsx:98-120`, `cupones/[id]/page.tsx:154-164` y `cupones/page.tsx:41-50`, tres copias
de la misma aritmética); y una promoción que vence «el 30 de septiembre» **muere a las 19:00 del
29** (`lib/promotions/vigencia.ts:74-81` + `promotionEngine.ts:136`).

### G.2 Nadie comprueba permisos: solo hay RLS

`grep` de `usePermission|hasPermission|PermissionGuard|can(` sobre los seis módulos: **cero**.
Cualquier miembro que alcance la ruta puede liberar una mesa con cuenta pendiente, eliminar
reservas, marcar comandas como entregadas, borrar la promoción del mes o desactivar un cupón. Lo
único que lo impide es la RLS de la tabla — y en `restaurant_reservations` la RLS está abierta
(F.4). Agravante: **los seis servicios usan el cliente de navegador** (`@/lib/supabase/config`) y
resuelven la organización desde `localStorage` (`obtenerOrganizacionActiva`), no desde la sesión del
servidor, contra la regla 5 de `CLAUDE.md`. No hay ni un route handler ni un `getServerOrgContext()`
en las seis pantallas.

### G.3 La moneda está cableada en los seis módulos

Todo importe pasa por `formatCurrency` de `@/utils/Utils`, cuya firma es
`formatCurrency(value, currency: string = "COP")` con `new Intl.NumberFormat("es-CO", …)` y **dos
decimales fijos** (`utils/Utils.ts:69-89`). **Ninguna llamada de estos módulos pasa el segundo
argumento.** Además hay `$` escrito a mano en seis sitios: `MesaCard.tsx:112`,
`MesasFloorMap.tsx:722`, `PromotionWizard.tsx:426-428`, `CouponForm.tsx:192`, `ChargeForm.tsx:227`
y `:253`. Existe `lib/hooks/useOrgCurrency.ts` y `lib/services/currencyService.ts:356`, y el cobro
del POS sí resuelve la moneda (`CheckoutDialog.tsx:2318`): son los seis módulos los que no lo hacen.

### G.4 Todo se cuenta en el navegador, y los contadores se contradicen

Ni un solo `count: 'exact', head: true` en las seis pantallas. Los casos que el usuario ve mal:

- **Plano de mesas:** los 4 KPI recorren el array completo; la paginación es un `slice`; el badge de
  cada zona cuenta **solo la página actual**, así que una zona sale partida entre páginas
  (`page.tsx:702, 736, 745`).
- **Comandas:** los contadores de los cuatro botones de estado se calculan sobre una lista **ya
  filtrada en el servidor** (`page.tsx:267-277` + `kitchenService.ts:120-122`): al pulsar «Nuevos»,
  los otros tres caen a 0. Y el badge de cada columna cuenta la página mientras «Mostrando x a y de
  n» cuenta el total: dos verdades en la misma pantalla.
- **Cupones:** «Total Cupones» es `coupons.length` del array **ya filtrado**
  (`cupones/page.tsx:69`): al filtrar por estado, el «total» cambia.
- **Cargos de servicio:** se lanza un **segundo `getAll()` completo sin filtros solo para contar**
  (`CargosServicioContent.tsx:49-54`): dos viajes y dos veces los datos en cada recarga.
- **Promociones y reservas:** «Activas» y los 6 stats se calculan en JS sobre todas las filas
  traídas (`promociones/page.tsx:45-51`, `reservasMesasService.ts:447-487`).

### G.5 Cinco paginaciones incompatibles y dos pantallas sin ninguna

| Pantalla | Paginación |
|---|---|
| Plano de mesas | `MesasPagination.tsx` a mano (143 líneas), tamaños 9/12/20/30/50, `slice` en memoria |
| Comandas | `ComandasPagination.tsx` a mano (143 líneas), tamaños 8/12/16/24/32 — y **corta la lista antes de repartirla en las 4 columnas**, por lo que es normal ver tres columnas vacías |
| Reservas | **Ninguna**, y la consulta no lleva `limit` |
| Promociones | **Ninguna**; `getAll` sin `.range()` ni `.limit()` |
| Cupones | **Ninguna**; ídem |
| Cargos de servicio | **Ninguna**; ídem |

El kit ya publica `Pagination` con `Layout=full` / `Layout=compact` (patrón 2 de
`PATRONES-TRANSVERSALES.md`). Las dos a mano son dos de los ~20 clones del repositorio.

### G.6 Consultas sin techo y filtrado en el navegador

`kitchenService.ts:77-124` trae **todo el histórico** de comandas de la organización, con un embed
de cuatro niveles, **sin `limit` ni ventana temporal**, y luego filtra zona y estación en JS. Lo
mismo, en menor escala, en reservas (sin `limit`), promociones, cupones y cargos. Y tres buscadores
disparan una consulta por pulsación, sin `debounce`: reservas (`ReservasHeader.tsx:93-98`),
promociones (`PromotionsHeader.tsx:146`) y cupones.

### G.7 Escrituras sin guarda de organización, y una interpolación sin escapar

| Qué | Archivo:línea |
|---|---|
| `combinarMesas`: sus 3 consultas no filtran por organización | `mesasService.ts:595, 609, 618` |
| Reservas: 3 escrituras a `restaurant_tables` sin `organization_id` | `reservasMesasService.ts:244-248, 330-340, 368-372` |
| Comandas: 4 escrituras a `kitchen_tickets` / `kitchen_ticket_items` sin `organization_id` | `kitchenService.ts:195-200, 213-219, 235-243, 398-408` |
| Cargos: `getById`, `update` y `delete` filtran **solo por `id`** | `cargosServicioService.ts:77, 142, 166` |
| Cupones: `getRedemptions` y la guarda previa al borrado, sin `organization_id` | `couponsService.ts:249, 328` |
| Búsqueda interpolada cruda dentro de `.or(...)` (una coma o un paréntesis altera el filtro) | `reservasMesasService.ts:156-160`, `couponsService.ts:42` |

### G.8 El texto enriquecido se guarda como HTML y se pinta como texto plano

`components/shared/RichTextEditor.tsx:72` emite `editorRef.current.innerHTML`, y su propio
comentario (`:23`) manda renderizarlo con `<HtmlContentRenderer>`. **Tres pantallas lo ignoran** y
el usuario ve las etiquetas literales: solicitudes especiales de una reserva
(`ReservasList.tsx:179`), descripción de una promoción (`promociones/[id]/page.tsx:301` y
`PromotionsList.tsx:210-214`) y notas de línea del pedido de mesa (`AddProductDialog.tsx:767-775` →
`OrderItemCard.tsx:692-696`).

### G.9 Lo que el diseño **no** debe calcar (resumen ejecutable)

| # | Qué está roto | Archivo:línea | Qué se dibuja en su lugar |
|---|---|---|---|
| 1 | «¿Eliminar mesa?» es **inalcanzable**: `setMesaEliminar` solo se llama con `null` | `mesas/page.tsx:76, 210, 930` | El menú ⋯ de la mesa gana «Eliminar mesa», con `ConfirmDialog Variant=destructive` y la guarda de sesión activa |
| 2 | `eliminarMesa` y `dividirMesa` son **código muerto** | `mesasService.ts:334, 637-690` | Se dibuja «Eliminar mesa»; «Dividir mesa» se omite (lo cubre «Dividir cuenta») |
| 3 | El modo combinar **acepta mesas libres** y puede hacer principal a una sin sesión | `mesas/page.tsx:398-401, 1085-1092` | Diálogo de combinar con las mesas sin sesión deshabilitadas y su motivo visible |
| 4 | `CombinarMesasDialog` **nunca se abre** desde el plano (`setShowCombinar(true)` no existe ahí) | `mesas/page.tsx:73, 915` | El diálogo es alcanzable desde la barra del plano y desde el detalle |
| 5 | `sendToFactus` de la pre-cuenta **se descarta**: el callback no declara parámetro | `mesas/[id]/page.tsx:1742-1745` vs `PreCuentaDialog.tsx:234` | El interruptor viaja al cobro y se ve reflejado en el acordeón «Factura electrónica» |
| 6 | `ChargesHeader` recibe `branches` y **no la desestructura**; su filtro de sucursal **escribe en el `BranchContext` global** | `ChargesHeader.tsx:41, 50-57, 70-72` | Se elimina el filtro propio (patrón 9): manda el selector del header |
| 7 | 7 `alert()` y un `confirm()` destructivo en el punto de entrada del cupón | `NuevaVentaPage.tsx:109, 148, 152, 160, 168, 175, 181` | `Toast` y `ConfirmDialog` del kit |
| 8 | Un `confirm()` nativo decide si se cierra la mesa con pagos pendientes | `mesas/[id]/page.tsx:1255-1261` | `ConfirmDialog Variant=destructive` con el importe pendiente en la descripción |
| 9 | **La promoción solo se aplica si la línea no tiene descuento manual**, y no se avisa | `posService.ts:1695-1702` y `:2713-2720` | El simulador lo explica línea a línea y el carrito muestra un aviso ámbar |
| 10 | `free_shipping` se puede crear y **no hace nada** (el motor no tiene ese caso) | `promotionEngine.ts:220-304, 404` | El tipo se dibuja deshabilitado con la razón, marcado «Pendiente» |
| 11 | «Límite de Usos» es **decorativo**: el motor nunca lee `usage_limit` | `PromotionWizard.tsx:515-523` | Se dibuja con aviso «Nuevo» y contador real en el detalle |
| 12 | El diálogo de importar cargos **no tiene botón**: importa en el `onChange` | `ChargesHeader.tsx:283-290` | `ImportWizard` del kit, con previsualización y confirmación |
| 13 | El estado `pending` de una reserva es **inalcanzable** (la creación fuerza `confirmed`) | `reservasMesasService.ts:227` | Se dibuja «Pendiente» como estado real, con «Confirmar» operativa |
| 14 | Tres emojis como iconos en los botones de la comanda, y dos más en las tarjetas | `TicketCard.tsx:168, 320, 337-339` | Iconos del kit |
| 15 | Arrastrar de «Entregados» a «Nuevos» pone `ready_at = null` y **borra el tiempo de preparación** | `TicketsGrid.tsx:41-50` + `kitchenService.ts:191-193` | El retroceso pide confirmación y conserva el tiempo |

---

## H. Qué falta para que el servicio en mesa sea usable

Ordenado por lo que hoy impide operar un salón, con la evidencia que lo respalda.

### H.1 Plano de salón editable — existe, pero está a medias

Lo que hay: arrastre con rejilla de 20 px, rotación de 15°, zoom, pan, recuadros de zona
redimensionables y persistencia en `restaurant_zone_layouts` (`MesasFloorMap.tsx`). Lo que falta:

- **El mapa no tiene paridad con la lista**: no hay menú ⋯, ni «Liberar mesa», ni «Editar
  comensales», ni «Solicitar cuenta», ni filtros. Solo abrir (`MesasFloorMap.tsx:415-418`).
- **No tiene estado vacío**: sin mesas se pinta un lienzo con rejilla y nada más.
- **Guarda posiciones de mesas que no muestra**: `positions` nunca se poda y `handleSave` envía
  todo (`:160-190`, `:423`), así que al cambiar de sucursal se reescriben coordenadas ajenas.
- **No se pueden crear zonas desde el gestor de zonas**, solo renombrar y borrar
  (`ZonasManager.tsx:84-121`); la única vía de creación es el select «+ Nueva zona» del formulario
  de mesa.
- **Las posiciones se guardan con N `UPDATE` en paralelo**, no con una RPC transaccional
  (`mesasService.ts:249-267`), contra la convención del repositorio.
- 2 de 70 mesas no tienen posición y se apilan en el origen.

### H.2 Tiempos por mesa — el dato existe, la lectura no sirve

`table_sessions.opened_at` está y se usa, pero **el reloj no corre**: `Date.now()` se evalúa en el
render y no hay tick ni Realtime (`MesaCard.tsx:34-45`, `MesasFloorMap.tsx:503-508`,
`mesas/[id]/page.tsx:1462-1473`). El umbral de «mesa olvidada» está cableado a 45 minutos
(`MesaCard.tsx:48`) y no es configurable. El resultado medido: **las 23 sesiones abiertas llevan más
de 24 horas abiertas**. Falta: un tick de un minuto, un umbral por organización, un estado «tiempo
excedido» con acción y un aviso al cierre de caja de que quedan mesas abiertas.

### H.3 Transferencia de cuenta — falta la completa

Hoy hay tres cosas distintas y ninguna es «pasar esta cuenta a otra mesa» desde el detalle:

| Operación | Dónde | Qué hace |
|---|---|---|
| **Transferir ítem** | Detalle, por línea (`TransferItemDialog`) | Mueve unidades de una línea a otra mesa. **La transferencia parcial inserta la línea nueva con `tax_amount: 0`**: el impuesto de esas unidades desaparece (`pedidosService.ts:852-861`) |
| **Mover pedido** | **Solo** en el listado (`MoverPedidoDialog`) | Reasigna `restaurant_table_id` de la sesión. Libera la mesa origen incondicionalmente, aunque tuviera otras sesiones (`mesasService.ts:727-728`), y contiene un `UPDATE` no-op (`:721-725`) |
| **Combinar mesas** | Listado (modo rápido) y detalle (diálogo) | Reasigna sesiones a una principal; **no queda registro de la combinación** (F.2) |

Falta: «Transferir cuenta» en el detalle de la mesa, con la mesa destino, qué pasa con las comandas
en curso y qué pasa si el destino ya tiene cuenta (fusionar o rechazar). Y `TransferItemDialog`
ofrece mesas «(Libre)» que el servicio rechaza con «Mesa destino no tiene sesión activa»
(`TransferItemDialog.tsx:332-334` vs `pedidosService.ts:840`).

### H.4 División de cuenta — la más completa, y la que más agujeros tiene

`SplitBillDialog` ya ofrece tres modos (Por Items, Equitativo, Personalizado), 27 controles, y
`SplitPaymentSelector` lleva el cobro parcial con 20 más. Lo que falta o está roto:

- **Recibe los ítems ya pagados**: se le pasa `session?.sale_items` completo en vez de la lista
  filtrada, así que un ítem cobrado **vuelve a aparecer para dividir** (`[id]/page.tsx:1823` vs
  `:1543`).
- **Añadir un producto después de dividir invalida la división** y obliga a redividir entera
  («⚠️ Dividir de Nuevo (REQUERIDO)»); no hay forma de asignar solo lo nuevo.
- **Cerrar con pagos pendientes pasa por un `confirm()` nativo** (`[id]/page.tsx:1255-1261`).
- **La mesa se libera con un `setTimeout` de 1.500 ms** tras el último cobro: si el usuario navega
  antes, la mesa queda ocupada (`:1345-1359`).
- No hay división por asiento persistida: `guest_number` vive dentro de `sale_items.notes` (jsonb),
  no en una columna, así que no se puede agregar ni consultar.

### H.5 Estado de comanda por estación — el dato se guarda y no se muestra

La estación se calcula al agregar el producto y se guarda en `kitchen_ticket_items.station`
(`pedidosService.ts:439`), y se usa para enrutar la impresión (`[id]/page.tsx:708-716`). Pero:

- **El detalle de mesa no muestra la estación de ninguna línea**, y `OrderItemCard` pinta solo el
  estado del **último** `kitchen_ticket_items` del array: un plato que pasa por dos estaciones
  muestra un único estado y no se sabe de cuál (`OrderItemCard.tsx:544-553`).
- **No existe un estado «enviado a cocina» por línea**: `printed_at` es del ticket, no del ítem, así
  que una línea recién creada y otra ya impresa se ven igual, «Pendiente en cocina».
- El tablero de comandas sí muestra la estación por ítem, pero **atenúa al 35 % los ítems de otras
  estaciones sin explicar por qué** (`TicketCard.tsx:211, 250`) y solo ofrece tres de las cinco
  estaciones que admite la base (F.2).
- `kitchen_tickets.priority` y `estimated_time` existen, están en el tipo y **no se renderizan ni se
  usan para ordenar** (`kitchenService.ts:13-14`).

### H.6 Aviso al mesero — la base ya lo genera; falta la interfaz

Es el hallazgo con mejor relación coste/beneficio de toda la auditoría. El trigger
`notify_waiter_on_ticket_ready` **ya inserta el aviso en `notifications`** cuando una comanda pasa a
`ready` (F.3), con el nombre de la mesa y el número de comanda. Nadie lo lee: ni el plano, ni el
detalle, ni la campana del header muestran nada. `grep` de `waiter_call|server_call|avisar.*mesero`
en todo el repositorio: 0 resultados. Y en la otra dirección, «Solicitar Cuenta» solo cambia
`table_sessions.status` a `bill_requested` (`pedidosService.ts:697-709`): **nadie recibe una
notificación**. Falta: (a) consumir el aviso existente en el plano y en la campana; (b) generar el
simétrico cuando el cliente pide la cuenta; (c) publicar `kitchen_ticket_items` en Realtime para que
el aviso llegue sin recargar (F.5).

### H.7 Lo que ninguna de las seis pantallas cubre

- **El cargo de servicio no se cobra nunca.** `calculateCharge` (`cargosServicioService.ts:297-316`)
  no tiene un solo llamador; `CheckoutDialog.tsx:239` suma `baseTotal + tipAmount + shippingFee` y
  nada más. Es un CRUD huérfano de 53 controles, y su subtítulo —«Configura cargos automáticos como
  propina sugerida»— describe algo que no existe. `min_guests` y `applies_to: 'dine_in'` están
  pensados justo para el servicio en mesa y el detalle de mesa no los menciona.
- **El cupón no se aplica en el POS.** No hay campo en `CartView` ni en `CheckoutDialog`; el de
  «Nueva Venta» es un `alert("… (demo)")` con un `// TODO` (`NuevaVentaPage.tsx:146-148`).
- **La promoción aplicada no se ve en el carrito.** `promoResult.applied` trae `promotion_name`, se
  usa para el contador de usos y se tira: en pantalla, un descuento de promoción y uno manual son
  indistinguibles (`CartView.tsx:153`, `CheckoutDialog.tsx:1869-1873`).
- **No hay tabla de uso de promociones.** Todo es un contador escalar vía `increment_promotion_usage`
  (`supabase/migrations/20260911020000_increment_promotion_usage.sql:30-38`): no queda venta, ni
  importe, ni cliente. Imposible saber cuánto costó una promoción.
- **La reserva no se liga al cliente.** `restaurant_reservations.customer_id` existe, el insert la
  contempla (`reservasMesasService.ts:222`) y **ninguna pantalla la llena**: el formulario son tres
  campos sueltos de nombre, teléfono y correo, sin `CustomerPicker`.
- **No hay recordatorio de reserva** de ningún tipo (0 resultados de `reminder|recordatorio` en el
  módulo), ni validación de solape al guardar (solo al llenar el desplegable de mesas), ni `min` en
  el campo de fecha: **se puede reservar en el pasado**.

---

## I. Decisiones de producto cerradas y lo que exigen del esquema

Las cuatro decisiones que esta auditoría dejó abiertas están cerradas por el dueño y recogidas en
`docs/design/PATRONES-TRANSVERSALES.md` §13 (entradas 5, 6, 7 y 8). Aquí queda solo lo que cada una
obliga a cambiar en el esquema o en los servicios; el dibujo está en
`docs/design/PARIDAD-MESAS-PROMOCIONES.md`.

### I.1 La combinación de mesas queda registrada (§13 #5)

Hoy combinar es una reasignación silenciosa: `combinarMesas` cambia
`table_sessions.restaurant_table_id` a la principal y pone las demás en `free`
(`components/pos/mesas/mesasService.ts:609-621`). No queda quién, ni cuándo, ni cuáles eran, y
**`restaurant_tables.state` no admite «combinada»**: el `CHECK` solo tiene `free`, `occupied` y
`reserved` (§F.2). Por eso no se puede deshacer ni auditar, y una cuenta combinada no se puede
reconstruir después de cobrarla.

**Propuesta de migración: tabla aparte, `table_combinations`, no columnas en la sesión.** Dos
razones concretas:

1. **La relación es de varias mesas a una**, y la sesión ya se mueve a la principal. Unas columnas
   `combined_into` / `combined_at` en `table_sessions` describirían la combinación desde la sesión
   secundaria, que es justo la que se cierra y se pierde: al separar habría que resucitarla.
2. **Hace falta el estado intermedio para revertir.** Separar tiene que devolver cada producto a la
   mesa donde se pidió, y eso exige guardar la foto del momento (qué sesión venía de qué mesa, con
   qué `sale_items`), no un puntero.

Forma mínima, aditiva y `NULL`-able como manda `CLAUDE.md`:

- `table_combinations` — `id`, `organization_id`, `branch_id`, `primary_table_id`,
  `primary_session_id`, `combined_by`, `combined_at`, `reason`, `separated_by`, `separated_at`.
- `table_combination_members` — `combination_id`, `restaurant_table_id`, `source_session_id`,
  `items_snapshot` (jsonb con los `sale_items` que traía).
- Y **añadir `'combined'` al `CHECK` de `restaurant_tables.state`**, que es un cambio de
  restricción, no de tipo, y por tanto admisible sobre datos vivos.

Sin eso, el frame `Diálogo — Separar mesas` no se puede implementar: la información que muestra
hoy no existe en ninguna tabla.

### I.2 El cargo de servicio va en la factura, no en las propinas (§13 #6)

`service_charges` ya tiene todo lo necesario (`charge_type`, `charge_value`, `min_amount`,
`min_guests`, `applies_to`, `is_taxable`, `is_optional`, `branch_id`). Lo que falta es el uso:
`calculateCharge` (`components/pos/cargos-servicio/cargosServicioService.ts:297-316`) no tiene un
solo llamador y el cobro suma `baseTotal + tipAmount + shippingFee`
(`components/pos/CheckoutDialog.tsx:239`).

Lo que exige la decisión, en términos de datos: el cargo entra como **línea de la venta y de la
factura** —`sale_items` / `invoice_items` con su `product_id` nulo y un descriptor propio— **antes
de impuestos**, y suma a la base gravable cuando `is_taxable`. **No toca `tips`.** La distinción no
es cosmética: `tips` tiene `server_id NOT NULL`, `is_distributed` y `distribution_batch_id`, y su
disparador `trg_auto_journal_tip` la contabiliza como propina. Meter ahí un ingreso del negocio lo
sacaría del libro de ventas y del impuesto.

Hace falta además guardar **por qué se quitó** un cargo opcional: basta un registro en
`ops_audit_log` con `entity_type = 'service_charges'` y el motivo, como ya se hace con las bajas de
producto (`pedidosService.ts:592-612`).

### I.3 Gana el mayor descuento (§13 #7)

La regla vive hoy en dos copias de `posService` —`:1695-1702` y `:2713-2720`, con la misma guarda
`if (!item.discount_amount || item.discount_amount === 0)`—, así que el descuento manual siempre
gana. La decisión invierte el criterio: se compara y **se aplica el mayor**, salvo promoción
`is_combinable`, donde se suman como ya hace el motor.

No requiere esquema nuevo salvo una cosa: para que el carrito pueda decir **cuál ganó y por qué**,
la línea necesita saber el origen de su descuento. `promotionEngine.evaluate` ya devuelve
`applied[].promotion_name` y hoy se tira (§4.6). Con guardarlo en `sale_items.notes` —que ya es
`jsonb` y ya lleva modificadores y notas— basta para el ticket y para la auditoría; forzar el
manual añade ahí el motivo y quién lo forzó. Y la corrección debe hacerse **en un solo sitio**:
duplicar la comparación repetiría el defecto que la creó.

### I.4 El cliente de la reserva es obligatorio (§13 #8)

`restaurant_reservations.customer_id` existe, es `uuid` con FK a `customers` y `ON DELETE SET NULL`,
y el `insert` del servicio lo contempla (`reservasMesasService.ts:222`): **ninguna pantalla lo
llena nunca**. La decisión lo vuelve obligatorio, así que el cambio es de interfaz y de servicio,
no de esquema: el `CustomerPicker` compartido sustituye a los tres campos sueltos y el alta rápida
crea el cliente sin salir del diálogo.

Dos cautelas que sí tocan datos: `customer_name` es `NOT NULL` en la tabla, así que se sigue
escribiendo (denormalizado, con el nombre del cliente elegido) para no romper las 0 filas
existentes ni la tienda web; y el alta rápida debe cruzar por teléfono antes de crear, porque
`customers` no tiene único por teléfono y el duplicado es el resultado previsible de un alta hecha
con el cliente al teléfono.

---

## J. Conteo de controles

| Pantalla | Archivos | Controles |
|---|---|---|
| A. Mesas — plano y listado (`/app/pos/mesas`) | `app/app/pos/mesas/page.tsx` + 12 de `components/pos/mesas/` | **186** |
| B. Mesas — detalle (`/app/pos/mesas/[id]`) | `[id]/page.tsx` + 13 de `components/pos/mesas/id/` | **239** |
| C.1 Reservas de mesas (`/app/pos/reservas-mesas`) | `page.tsx` + 5 componentes | **69** |
| C.2 Comandas (`/app/pos/comandas`) | `page.tsx` + 7 componentes + `kitchenService.ts` | **64** |
| D. Promociones (`/app/pos/promociones`, `/[id]`, `/nuevo`) | 3 páginas + 5 componentes + motor | **140** |
| E.1 Cupones (`/app/pos/cupones`, `/[id]`) | 2 páginas + 5 componentes | **99** |
| E.2 Cargos de servicio (`/app/pos/cargos-servicio`) | 1 página + 6 componentes | **53** |
| **Total** | **60 archivos** | **850** |

Desglose de A por bloque: cabecera 15 · modo Mapa 32 · modo Lista 36 · modo Combinar 9 ·
`MesaFormDialog` 13 · `ZonasManager` 16 · `MoverPedidoDialog` 9 · `CombinarMesasDialog` 10 ·
`HistorialMesasDialog` 22 · diálogos de mesa 24.

Desglose de B por bloque: cabecera 15 · estadísticas y sus diálogos 22 · pedido y líneas 30 · barra
de acciones 25 · `AddProductDialog` 43 · `PreCuentaDialog` 17 · `SplitBillDialog` 27 +
`SplitPaymentSelector` 20 · `TransferItemDialog` 11 · `SessionTimelineDialog` 17 ·
`MesaTaxBreakdown` 12.

Desglose de D por bloque: listado 44 · detalle 44 · asistente de 4 pasos 52 (armazón 10 + Datos
Básicos 6 + Descuento 12 + Vigencia 14 + Reglas 10).

**Controles inalcanzables**: 14 en el plano de mesas (los 4 del diálogo «¿Eliminar mesa?» y los 10
de `CombinarMesasDialog`, montado y nunca abierto desde esa página). Controles realmente operables
en A: **172**.

**Controles decorativos** (existen, se pueden usar y no producen efecto): el interruptor
`sendToFactus` de la pre-cuenta (B), «Límite de Usos» del asistente de promociones (D), el tipo
«Envío Gratis» completo (D), «Gravado con impuesto» y «Cargo opcional» de los cargos de servicio (E),
y el campo «Código de cupón» + «Aplicar» de Nueva Venta. Ninguno se calca tal cual: el rediseño los
dibuja con su efecto real o con el aviso de que está pendiente.

**Piezas auditadas que no cuentan como control**: 1 motor de promociones con 8 puntos de invocación,
2 RPC (`increment_promotion_usage`, `get_profiles_by_organization`), 13 tablas verificadas con el
MCP, 5 triggers, 26 políticas RLS y **93 operaciones PostgREST desde el navegador, ninguna vía route
handler**.
