# Patrones transversales — norma única del sistema de diseño

Fecha: 2026-09-22 · Archivo Figma: «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`)

Este documento fija **una sola regla por patrón**. Si una pantalla necesita
apartarse, la excepción se escribe aquí con su motivo; no se resuelve en la
pantalla. Todo componente citado vive en la página `02 Componentes`; las
variantes son las que el propio componente publica.

Origen: el dueño (2026-09-22) — «el multiselector y todas esas acciones masivas
deberían funcionar igual para todas las páginas […] Veo que al seleccionar en
Mis organizaciones la acción masiva aparece ARRIBA y en productos aparecía
ABAJO: eso es incoherencia. Quiero coherencia en todo el sistema, igual que
quiero que todas las paginaciones sean iguales y usen el mismo componente».

---

## 1. Acciones masivas — `BulkActionBar`

**Regla.** La barra de acciones masivas es **siempre flotante al pie**, centrada
sobre la columna de contenido, por encima del contenido, y aparece solo cuando
hay selección. **Nunca arriba de la tabla.**

- Contador a la izquierda («3 elementos seleccionados» + «Seleccionar los N»).
- Acciones del dominio en el medio.
- «⋯» para las secundarias y «×» para limpiar la selección, en ese orden, a la derecha.
- Escritorio: variante `Layout=desktop`, alto 50, margen inferior 24 px,
  `x = columnaX + (columnaAncho − anchoBarra) / 2`. La barra **hug**ea su
  contenido, así que el ancho cambia con el texto del contador: se recentra, no
  se fuerza a un ancho fijo.
- Móvil: variante `Layout=mobile`, ancho completo (390), **sustituye al
  `MobileTabBar`** mientras hay selección (`y = altoPantalla − 74`).
- La aparición de la barra **no cambia el resto del layout**: el buscador, los
  chips de filtros y la paginación se quedan donde estaban.

**Por qué.** Una barra que entra en el flujo empuja la tabla y obliga a releer la
pantalla justo cuando la persona está comparando filas. Flotando al pie, el
pulgar la alcanza en móvil y en escritorio queda fuera del área de lectura.
Además es el patrón que ya usaba Productos, así que alinear el resto cuesta menos
que al revés.

**Componente.** `BulkActionBar` · variantes `Layout=desktop` / `Layout=mobile` ·
propiedad `Contador`.

---

## 2. Paginación — `Pagination`

**Regla.** **Una sola paginación**, la del kit, al pie de la tabla y con el ancho
de la tabla.

- «Mostrando a–b de n» a la izquierda, selector de tamaño de página
  (10 / 20 / 50 / 100) junto al resumen, controles a la derecha.
- Escritorio: `Layout=full`, alineada al borde izquierdo de la tabla y con su
  mismo ancho (`FILL` dentro de la columna).
- Móvil: `Layout=compact`, ancho de la tarjeta (358), **siempre por encima del
  `MobileTabBar`**, nunca debajo ni fuera del frame.
- **`Layout=compact` solo en dos sitios**: móvil, y tablas embebidas dentro de
  una tarjeta (por ejemplo el historial dentro del detalle). En una tabla de
  página completa, siempre la versión completa.
- Se dibuja en los estados `listo` y `cargando`; **no** en `vacío` ni en `error`.
- **En «cargando» la paginación se muestra**, con los controles deshabilitados y
  el resumen en esqueleto. Así no hay salto de maquetación cuando llegan los
  datos.
- Si la tabla vive dentro de una tarjeta (p. ej. «Cartera» en el detalle de
  cliente), la paginación va **dentro de la tarjeta, al pie**, con el ancho
  interior de la tarjeta. No se saca fuera.
- Prohibido dibujar paginación a mano y prohibido usar `Layout=compact` en
  escritorio.

**Por qué.** Era el patrón con más variantes sueltas: anchos 1061, 1094, 1128,
1320, 954 y 718 px conviviendo, dos frames con la paginación fuera del frame y
una pantalla usando la variante móvil en escritorio. Un único componente con dos
variantes elimina la decisión.

**Componente.** `Pagination` · `Layout=full` / `Layout=compact` · propiedad `Resumen`.

---

## 3. Buscador y filtros — `SearchBar` + `FilterButton` + `FilterPanel` + `FilterChips`

**Regla.** **Un solo buscador por pantalla**, a la izquierda, ocupando el ancho
sobrante; a su derecha el botón **«Filtros»** con contador; debajo, los chips de
filtros activos con «Limpiar todo».

- La fila buscador+filtros mide exactamente el ancho de la columna de contenido.
  El `SearchBar` es `FILL`; el `FilterButton` es `HUG`.
- `FilterButton`: `State=default` sin filtros, `State=active` con contador,
  `State=open` mientras el panel está abierto.
- `FilterPanel`: `Layout=popover` en escritorio (anclado bajo el botón, siempre
  dentro del frame) y `Layout=sheet` en móvil.
- Los chips activos (`FilterChips`) van **debajo** de la fila, nunca dentro del
  panel, y cada uno se quita con su «×».
- Nada de dos buscadores en la misma pantalla, ni de filtros repartidos entre la
  cabecera y el panel.

**Por qué.** Decisión previa vigente del dueño («un solo buscador + botón de
filtros»). Con dos buscadores nadie sabe cuál manda y los resultados se
contradicen.

---

## 4. Cabecera de pantalla — `PageHeader`

**Regla.** Migas arriba, título, subtítulo opcional y acciones a la derecha:
**una sola primaria**, el resto secundarias o dentro de «⋯».

- Variantes: `Variant=list` (listados), `Variant=detail` (detalle),
  `Variant=form` (crear/editar); `Layout=desktop` / `Layout=mobile`.
- La acción primaria es la que crea («Nuevo producto», «Invitar persona»). Las
  de mantenimiento (recargar, exportar, importar) son secundarias.
- Ninguna pantalla coloca acciones de cabecera en otro sitio (ni flotando sobre
  la tabla, ni al pie).
- POS no lleva migas; el resto de módulos sí (decisión previa vigente).
- El `PageHeader` **se mantiene en el estado «cargando»**: solo la tabla se
  dibuja con `Skeleton`. Una cabecera esqueletizada no aporta y descoloca la
  pantalla al llegar los datos.
- El `PageHeader` trae sus propias migas; si la pantalla ya dibuja una instancia
  de `Breadcrumbs` aparte, se oculta una de las dos. Nunca dos filas de migas.

### 4.1 Sin acciones duplicadas dentro de una misma pantalla

**Regla.** Una acción aparece **una sola vez** por pantalla. Está prohibido
repetir el mismo botón en el `PageHeader` y en la fila de buscador y filtros, o
en la cabecera y en el pie.

- La fila de buscador y filtros lleva **solo** el buscador a la izquierda y el
  botón «Filtros» a la derecha. Nada más.
- La acción primaria vive en el `PageHeader`. El resto, secundarias o dentro de
  «⋯».
- **Única excepción, los formularios largos** (`PageHeader Variant=form`, páginas
  de 1.500 px o más): «Guardar», «Guardar y crear otro» y «Descartar» viven en la
  **barra fija del pie**, porque la cabecera se pierde al desplazar. En esas
  pantallas el `PageHeader` **no** repite esas acciones.
- No cuenta como duplicado la acción que se repite **por fila** de una tabla o
  por tarjeta de una lista, ni la que aparece dentro de un `EmptyState`, un
  diálogo o una hoja.

**Por qué.** El dueño lo señaló sobre el listado de miembros: «no entiendo por
qué repites los botones, eso no tiene sentido». Dos botones idénticos a 100 px
uno del otro obligan a decidir cuál pulsar, y el que queda fuera del patrón se
queda sin mantenimiento.

---

## 5. Tablas — `DataTable` + `TableCell`

**Regla.** Una sola tabla del kit, con densidades `comfortable` (52 px) y
`compact` (40 px).

- Importes **alineados a la derecha** (`Variant=money`); fechas y textos a la
  izquierda; códigos en `Variant=mono`.
- La columna de acciones es **siempre la última**, ancho fijo 44 px, alineada a
  la derecha (`Variant=actions`).
- La casilla de selección es la **primera** columna, ancho fijo 44 px, con
  estados `checkbox`, `checkbox-on` y `checkbox-mixed` en la cabecera.
- Si la tabla tiene más columnas de las que caben, **la tabla desplaza en
  horizontal dentro del frame** (el frame recorta). La columna de acciones no
  participa de ese desplazamiento.
- En móvil, `Layout=cards`: una tarjeta por registro, sin scroll horizontal.

---

## 6. Acciones por fila — iconos sueltos vs menú «⋯»

Medido en el código: **133 componentes usan el menú «⋯» y 167 pintan iconos
sueltos de editar/eliminar en la fila**; algunos mezclan los dos criterios.

**Regla.**

1. **La fila entera abre el detalle.** No hay icono de «ojo» para ver: ocupa un
   espacio que no aporta. El cursor cambia y la fila tiene estado hover y foco.
2. **Como máximo DOS iconos en la fila**, y solo para las acciones más
   frecuentes y **no destructivas** del dominio. Botón de 32×32 con tooltip y
   `aria-label`; nunca se distinguen solo por color.
3. **Todo lo demás va en el menú «⋯»**, siempre presente y siempre en la última
   columna, alineado a la derecha y con ancho fijo. Orden dentro del menú:
   ver / editar / duplicar → acciones del dominio → **tras un divisor y en rojo,
   lo destructivo**.
4. **Lo destructivo nunca va suelto en la fila** —es el origen de los borrados
   por error— y siempre pasa por `ConfirmDialog`.
5. **En móvil no hay iconos en la fila**: la tarjeta abre el detalle al tocarla y
   el «⋯» abre una hoja con las acciones a ancho completo, con la destructiva
   separada al final.
6. **Nunca un botón deshabilitado sin explicación**: si una acción no aplica, o
   no se muestra en el menú, o se muestra con la razón visible (tooltip o texto),
   siguiendo el criterio de «estados con acción».
7. La columna de acciones no participa del scroll horizontal de la tabla.

**Pares permitidos por dominio** (los dos iconos de la fila):

| Dominio | Iconos en la fila | Todo lo demás |
|---|---|---|
| Productos / catálogo | — (solo «⋯») | editar, duplicar, ajustar stock, etiquetas, eliminar |
| Variantes y modificadores | Editar | duplicar, eliminar |
| Proveedores y etiquetas del producto | Marcar principal (`Star`/`StarOff`) | editar, quitar |
| Stock por sucursal | Entrada, Salida, **Transferencia** (excepción, ver abajo) | historial, ajustar |
| Imágenes | Marcar principal | reordenar, eliminar |
| Facturas de venta y de compra | Registrar pago, Imprimir | ver, anular, nota crédito |
| Impuestos | Editar | duplicar, desactivar, eliminar |
| Miembros | — (solo «⋯») | rol, sucursales, cargo, quitar del equipo |

**Excepción aprobada por el dueño (2026-09-22): tres iconos en Stock por
sucursal.** Entrada, Salida y Transferencia son las tres acciones frecuentes de
esa pantalla, ninguna es destructiva y las tres pesan lo mismo; obligar a abrir
el menú para la tercera penaliza la tarea principal. **La excepción no es una
coartada**: como máximo tres iconos, y solo si las tres son frecuentes y no
destructivas. Cualquier otro dominio se queda en dos.

**Notas de implementación que no son negociables.** El asa de arrastre
(`GripVertical`) **no cuenta** como acción: es un afordance de reordenación y se
queda. El botón «Añadir/Nueva opción» tampoco es una acción de fila.

---

## 7. Estados — vacío, cargando, error, sin permiso

**Regla.** Se usan siempre las instancias del kit, nunca dibujos propios.

- `Skeleton` para cargando (`table-row` en tablas, `card` en móvil, `line` /
  `rect` / `circle` en formularios y cabeceras de detalle).
- `EmptyState` con `Variant=empty` (no hay nada todavía), `Variant=search` (los
  filtros no devuelven nada, con «Limpiar filtros»), `Variant=error` (con
  «Reintentar») y `Variant=forbidden` (sin permiso).
- `Layout=desktop` (1128) y `Layout=compact` (358).
- Todo estado vacío o de error lleva **una acción**: nunca un callejón sin salida.
- `Toast` para el resultado de una operación; jamás `window.alert()` ni
  `confirm()`.

---

## 8. Diálogos — `ConfirmDialog` y compañía

**Regla.**

- Anchos: 440 (confirmación), 520 (formulario corto), 672 (formulario medio),
  1024 (tabla o previsualización). En móvil, `Layout=sheet` a ancho completo.
- Botones abajo a la derecha, **el primario a la derecha del todo**.
- El botón de salida se llama **«Cancelar»** (no «Volver») en cualquier diálogo
  que pueda descartar cambios.
- **Todo lo destructivo pasa por `ConfirmDialog` con `Variant=destructive`**, con
  el nombre de lo que se va a borrar en la descripción.
- `ConfirmDialog` · `Layout=desktop` / `Layout=sheet` × `Variant=default` /
  `Variant=destructive`.

---

## 9. Sucursal — regla única para todo el sistema

**Regla.**

1. **El selector de sucursal del header es el único filtro de sucursal.** Ninguna
   pantalla añade un filtro de sucursal propio en su `FilterPanel` ni un chip de
   sucursal entre los filtros activos.
2. **El desplegable solo lista las sucursales de las que la persona es miembro.**
   Si la organización tiene 20 y pertenece a 3, ve 3 —aunque sea
   administradora—. Nunca aparecen sucursales ajenas.
3. **«Todas las sucursales» solo se ofrece con 2 o más**, y consolida
   **únicamente las suyas**: con 3 de 20, «Todas» son esas 3, y el badge dice
   «Todas (3)». Con una sola sucursal la opción no existe.
4. **La sucursal seleccionada manda en todo**: listados, KPIs, totales, informes,
   creación de registros y detalle. Lo que se cree hereda la sucursal activa; con
   «Todas» seleccionado, el formulario obliga a elegir una de las suyas.
5. **La sucursal se muestra siempre** con el `BranchBadge` en la cabecera de la
   pantalla, debajo del título. En vista consolidada el badge dice «Todas (3)» y
   las tablas traen columna «Sucursal».

**Qué pantallas llevan `BranchBadge` — excepción explícita de ámbito.**

- **Ámbito de sucursal** (llevan badge, filtran por la sucursal del header):
  inventario, POS y ventas, cajas, facturas de venta y de compra, documentos,
  informes.
- **Ámbito de organización** (NO llevan badge): **clientes y proveedores**,
  **miembros**, **sucursales**, dominios, mis organizaciones, plan y módulos,
  perfil de usuario.

Sobre clientes, verificado en la base de datos (2026-09-22): la columna
`customers.branch_id` existe pero es opcional y casi nadie la usa —un cliente es
de la organización, no de una sucursal—, así que el catálogo de clientes no
lleva `BranchBadge` ni filtro de sucursal. Lo mismo vale para proveedores.

Esto no se confunde con el `BranchBadge` **usado como dato dentro de una celda**:
en el listado de miembros la columna «Sucursales» muestra a qué sucursales
pertenece cada persona, y eso se queda. La regla habla del badge de **ámbito de
la pantalla**, en la cabecera.

**Nota técnica verificada en código y base de datos (2026-09-22).**
`branchService.getAccessibleBranches` **devuelve todas las sucursales a los
administradores** (`branchService.ts:123-125`), deduce quién es administrador
**por el nombre del rol** (`:111-119`, algo que la regla 6 de `CLAUDE.md`
prohíbe) y hace *fail-open* dos veces: sin membresía (`:104`) y sin asignaciones
de sucursal (`:131-132`). Hoy hay 138 miembros activos y 61 sin ninguna
asignación de sucursal. La corrección va en código y **no** la cubre este
documento; aquí solo queda fijada la regla de interfaz.

---

## 10. Estado «sin sucursal asignada» — `EmptyStateSinSucursal` (Nuevo)

**Decisión del dueño (2026-09-22): cierre en firme, sin puerta abierta.** Todo
usuario invitado o creado tendrá sucursal asignada. Los 61 miembros sin
asignación son usuarios viejos de prueba y no condicionan el diseño. Pero el
estado hay que dibujarlo, porque hoy esas personas ven las pantallas vacías sin
entender por qué.

**Regla.** **Toda pantalla con ámbito de sucursal debe contemplar el estado «sin
sucursal asignada»**, además de sus estados listo / cargando / vacío / error.
Las pantallas de ámbito de organización (clientes, proveedores, miembros,
sucursales…) **no** lo contemplan: sin sucursal siguen funcionando.

- Título: «No tienes ninguna sucursal asignada».
- Explicación: «Para ver ventas, inventario y facturas necesitas que un
  administrador te asigne al menos una sucursal.»
- Acción principal: **«Solicitar acceso al administrador»**, que envía el aviso.
- Estado tras enviar: «Solicitud enviada · te avisaremos cuando te asignen una
  sucursal.» (sin botón).
- Estado con solicitud ya en curso: «Solicitud pendiente desde el 22 de
  septiembre.» + «Volver a solicitar».
- **Sin filtrar información sensible**: no se listan nombres ni correos de
  administradores, ni cuántas sucursales tiene la organización, ni sus nombres.
  Solo el mensaje y el botón. Un empleado no debe poder deducir la estructura
  interna de la empresa desde un mensaje de error.
- Cabecera: `BranchBadge` con `Scope=sin-asignar` («Sin sucursal»), en gris y
  **sin desplegable** — no hay nada que elegir.
- En móvil, el mismo estado a pantalla completa (`Layout=compact`).

**Componente.** `EmptyStateSinSucursal` (nuevo, en `02 Componentes` › sección
«Sucursal — sin asignación (Nuevo)») · `Layout=desktop` / `Layout=compact` ×
`Estado=inicial` / `Estado=enviada` / `Estado=pendiente`.
`BranchBadge` gana la variante `Scope=sin-asignar`.

**Dependencia abierta.** Hace falta una forma de **notificar al administrador**
(aviso interno o correo) cuando alguien pulsa «Solicitar acceso». No existe hoy;
se implementa aparte. Todo lo de este apartado va marcado «Nuevo» en Figma.

---

## 11. Capas flotantes — menús, popovers y tooltips

**Regla.** Una capa flotante **siempre se abre pegada al control que la abre**.
Nunca centrada, nunca sobre otro bloque de la pantalla, nunca «por ahí cerca».

| | Menú «⋯» / desplegable | Popover (`FilterPanel`, selectores) | Tooltip |
|---|---|---|---|
| Alineación | por el **borde derecho** del disparador | por el **borde izquierdo** del disparador | centrado sobre el disparador |
| Desplazamiento | **4 px** por debajo | **8 px** por debajo | 6 px |
| Ancho | 180–320 px | 320–400 px | ≤ 280 px |
| Si no cabe a lo ancho | se alinea por el otro borde | igual | igual |
| Si no cabe a lo alto | **voltea hacia arriba** (4 px por encima del disparador) | voltea hacia arriba | voltea |

- Una capa abierta **desde la `BulkActionBar`** (que vive al pie) voltea siempre
  hacia arriba: nunca se dibuja por debajo de la barra.
- En los frames de Figma, cuando la capa no cabe hacia abajo **se agranda el
  frame** antes que voltearla: en la pantalla real hay scroll, y voltear un menú
  de 400 px lo planta encima de los KPI.
- **Tope de entradas por menú: 8**, con un divisor antes del bloque destructivo,
  que va en rojo y al final. Por encima de 8 hay que agrupar o mover al detalle.
- El disparador se queda en estado «abierto» mientras la capa está desplegada
  (`FilterButton State=open`).

**Por qué.** El dueño lo vio en el listado de facturas: el `FilterPanel` flotaba
sobre las tarjetas de KPI tapando «Vencido» y «Vence en 15 días», con su botón
100 px más abajo; y el menú «⋯» de fila cubría tres filas desplazado a la
izquierda de su botón. Una capa que no nace de su control no se lee como
respuesta a lo que acabas de pulsar.

## 12. Al instanciar, sobrescribir — no heredar la pantalla de origen

**Regla.** Instanciar `BulkActionBar`, `EmptyState`, `PageHeader`, `FilterPanel`,
`Pagination` o cualquier componente con texto obliga a **sobrescribir sus textos,
acciones, contadores y etiquetas** con los del dominio de la pantalla. Dejar los
de la pantalla de origen **es un defecto, no un descuido menor**.

Lista de comprobación antes de dar una pantalla por hecha:

1. **Contadores** — «Mostrando a–b de n» y «Seleccionar los n» citan el total y
   el sustantivo del dominio («32 facturas», «12 miembros», «1.284 clientes»),
   nunca el de otra pantalla.
2. **Acciones de la `BulkActionBar`** — son las del dominio y solo las que
   existen. En facturas, «Anular» (con `ConfirmDialog` y motivo obligatorio), no
   «Eliminar»: una factura emitida no se borra.
3. **Títulos y descripciones del `EmptyState`** — hablan de lo que falta en esa
   pantalla.
4. **Campos del `FilterPanel`** — los de esa pantalla, y **nunca un filtro de
   sucursal** (patrón 9).
5. **Badges «Nuevo»** — marcan lo inventado, y van **fuera** del componente, como
   anotación; no sueltos dentro de una barra o un menú.
6. **El primario del `ConfirmDialog` responde a su título.** Si el título
   pregunta «¿Desactivar 3 productos?», el primario dice «Desactivar», no
   «Regenerar» ni «Eliminar». Un primario heredado de otro diálogo hace que la
   persona lea una acción y ejecute otra: es el defecto más grave de esta lista.
7. **El estado dibujado coincide con el texto.** En un frame con
   `BulkActionBar`, el número de casillas marcadas es exactamente el del
   contador, la casilla de cabecera va en **indeterminado** si la selección es
   parcial y marcada si es total, y «Seleccionar esta página (n)» cita las filas
   realmente visibles.
8. **Todo menú «⋯» instanciado se dibuja abierto al menos una vez** en su
   sección. Un «⋯» que nunca se abre es un hueco: nadie sabe qué ofrece.

**Propuesta abierta, pendiente de decisión del dueño.** «Dejar de vender aquí»
—desactivar un producto en una sucursal concreta, desde el menú «⋯» de la fila
de stock por sucursal— **no se dibuja** porque no existe: `stock_levels` no
tiene bandera de activo y `products.status` es de organización. Implementarlo
cuesta una columna nueva en `stock_levels` o una tabla de disponibilidad por
sucursal, más su migración y su RLS.

### 12.1 Ninguna anotación vive dentro de un frame de pantalla

**Regla.** **Ninguna anotación, badge de documentación ni referencia a código
vive dentro de un frame de pantalla**: van fuera, como texto de anotación a la
izquierda o encima del frame, 12 px, pizarra, sin fondo, alineado a su borde.

- Sale fuera: post-its, cajas ámbar con texto explicativo, «Decisión: …»,
  «Nota: …», «No existe hoy», «pregunta N», referencias a la auditoría (`§`,
  `A.6`, `B.16`, `D.17`), nombres de componentes y rutas de archivo (`*.tsx:NN`).
- Se queda dentro: el **copy de producto** —lo que la persona lee en la
  pantalla real—, incluidos los badges de datos («Nuevo» sobre una fila de
  producto recién creada).
- Si la nota explica un control concreto, fuera va la nota completa y dentro,
  como mucho, una referencia corta («⟵ menú "…"»).

**Por qué.** Dentro del frame se leen como parte del producto, tapan controles y
ensucian cada captura. Ya van tres casos: el badge «Nuevo» del `AppHeader`, el
badge dentro de la `BulkActionBar` y el post-it del menú «…» del catálogo, que
tapaba el buscador y tres opciones del menú.

**Por qué.** Ya van cuatro casos: los estados vacíos de `08`, el botón duplicado
de Miembros, la `BulkActionBar` de facturas de venta con «Precios · Stock ·
Categoría · Eliminar» y el contador «de 4.368» —el número de productos— en tres
pantallas que no son el catálogo. El componente compartido ahorra trabajo solo si
el relleno se revisa.

## 13. Iconos — el icono de cada pantalla

**Regla.** El icono de una pantalla **no lo elige quien dibuja la pantalla**: lo
fija `CATALOGO-ICONOS.md`, que es la única fuente. Instanciar `PageHeader` o
`DocumentHeader` obliga a **sobrescribir el icono** (es el caso concreto más
frecuente del patrón 12).

- **Fuente única: lucide**, trazo 1,5 px sobre rejilla 24, cabos y uniones
  redondeados, color por variable. Los iconos viven en
  `02 Componentes › Fundamentos › Iconos`; si falta uno, se importa de lucide y
  se añade a la rejilla. Nada de dibujar un icono a mano.
- **Tamaños:** **20** en la cabecera de pantalla (caja de 40×40 con el tinte de
  marca, radio 8), **16** en menús, filas, botones y migas, **14** en badges.
- **Un icono por concepto en todo el sistema.** Si «cliente» es `Users`, lo es en
  el menú, en la cabecera, en la actividad y en el estado vacío. Y al revés: dos
  conceptos distintos no comparten icono.
- **El icono de la cabecera es el mismo que el de su entrada de menú.** Si
  discrepan, manda el catálogo y el menú se corrige en código.
- **Sin icono, solo por regla escrita y solo en dos sitios:** `PageHeader
  Variant=form` (la ranura izquierda es «← Volver») y **todas las cabeceras
  móviles** (`MobileHeader` y las variantes `Layout=mobile`), donde esa ranura ya
  es el botón de volver.
- **El marcador de imagen está prohibido como icono de pantalla.** La caja de
  48×48 del `Variant=detail` (`Miniatura`) solo conserva una **foto real** donde
  la entidad tiene foto —hoy, únicamente el detalle de producto, y su relleno sin
  foto es `Package`—. En el resto lleva el icono de la entidad sobre el tinte de
  marca.
- La ranura tiene tres nombres según el componente —`Icono` (list), `Miniatura`
  (detail) y `Caja de icono` (`DocumentHeader`)—; el script de comprobación mira
  las tres.

**Por qué.** El dueño: «no tienes definidos los iconos de todas las páginas, así
ha pasado con todas; ¿quién define esos iconos?». Nadie los definía: se
instanciaba el componente sin tocar el icono. Medido antes de esta tanda sobre
las **238 cabeceras de escritorio** de las páginas `03`–`08`: solo **25** tenían
el icono que les toca; **103 llevaban uno heredado y equivocado** —100 de ellas
un `Package` de inventario, incluido el saludo «Buenos días, Ana» del inicio—;
**75 mostraban el marcador de imagen**, el cuadro gris con la montañita; y **35
no tenían ni ranura de icono**. Ocho conceptos distintos compartían `Users` en el
menú y seis compartían `BarChart3`.

**Catálogo.** `docs/design/CATALOGO-ICONOS.md` — tabla de conceptos, tabla
pantalla por pantalla con su ruta, conteo antes/después y la lista de cambios
pendientes en `src/config/moduleConfig.ts`.

**Capturas.** `docs/design/figma/29-iconos-rejilla-kit.png` (los 158 iconos del
kit) y los dos antes/después: `29-iconos-antes-inicio.png` →
`29-iconos-despues-inicio.png` y `29-iconos-antes-cliente.png` →
`29-iconos-despues-cliente.png`.

---

## 14. Decisiones de producto cerradas (2026-09-22)

Decisiones del dueño, o delegadas y tomadas con su visto bueno. Cualquier
diseño o implementación posterior parte de ellas.

| # | Tema | Decisión | Por qué |
|---|---|---|---|
| 1 | **Nombre del plan alto** | Se queda **Ultimate**. `enterprise` sigue apagado como plan a medida, sin precio, con «Habla con ventas» | No hay que migrar suscripciones vivas ni precios de la pasarela |
| 2 | **Límites de los planes** | Pro 12 módulos · 1 sucursal · 10 usuarios · 500 créditos · 1.000 facturas/mes · 15 días. Business 16 · 5 · 20 · 2.000 · 3.000 · 30 días. Ultimate **todos** los módulos · 15 · 60 · 10.000 · facturas **ilimitadas** · 30 días. «Todos» e «ilimitadas» = NULL | Las columnas, `features` y la web decían tres cosas distintas. Manda la columna |
| 3 | **Monedas de los planes** | Las **diez** monedas activas, con precio fijo por moneda en `plan_prices`, nunca convertido en vivo | Publicidad fuera de Colombia; un precio que cambia a diario no se puede anunciar |
| 4 | **Términos y privacidad** | **Se crean** y se aceptan en el registro, con enlace a cada documento | Hoy no existen aunque las claves de traducción sí |
| 5 | **Combinación de mesas** | **Queda registrada**: hoy combinar no deja rastro y no se puede deshacer ni auditar | Sin registro, la cuenta combinada no se puede reconstruir |
| 6 | **Cargo de servicio** | **Se implementa en el cobro**, como **línea propia de la factura**, antes de impuestos, con su regla (en sitio, mínimo de personas) y opción de quitarlo si es opcional. **NO se trata como propina**: no va a `tips` ni se reparte | Es ingreso del negocio y tributa; la propina es voluntaria, es del mesero y se reparte. Tratarlo como propina sería cobrar un ingreso sin declararlo |
| 7 | **Descuento manual vs promoción** | **Gana el mayor descuento para el cliente**. Se muestra cuál ganó y por qué; el cajero puede forzar el suyo con un clic y motivo. Nunca se suman, salvo promoción marcada como combinable | Hoy un descuento manual de $1.000 anula una promoción de $20.000: el cliente que vio la promo paga más y reclama |
| 8 | **Cliente en reservas** | **Obligatorio** (`CustomerPicker`), se acabó el nombre suelto | `customer_id` no se llena nunca; sin cliente no hay historial ni aviso |
| 9 | **Exportar a banca** | Formatos reales de los bancos de los **diez países** con moneda activa, no un CSV único renombrado cuatro veces | — |
| 10 | **Tiempo real del dashboard** | **Refresco cada 2 min con «actualizado hace N»**, no publicación de tablas en Realtime. El tiempo real se reserva a pedidos online, comandas y caja | Publicar tablas de toda la organización es el patrón que tumbó Postgres el 2026-09-14. Y hoy el panel dice «en vivo» cuando es un temporizador: además de caro, es mentira |
| 11 | **Umbral de alerta de cartera** | Por **días de mora** (vencido · +30 · +60), configurable. El importe se muestra pero no decide el color | `> 1000` sin moneda es siempre cierto en pesos y casi siempre falso en dólares |
| 12 | **Panel del inicio** | Paso 1 hecho: la regla sale del CRM y vive en `@/lib/dashboard/accesoPanel`. Paso 2: permiso «ver finanzas de la organización» resuelto en servidor, cuando el cargo esté poblado (hoy 20 de 138 miembros lo tienen) | Añadir un rol a la lista del CRM daba acceso a la caja y la utilidad sin que nadie lo supiera |
| 13 | **Geolocalización de visitas** | **Aprobada**: `country`, `region`, `city` (y coordenadas si se quiere precisión) desde las cabeceras que ya envía Vercel, sin servicio externo. La IP sigue sin guardarse en claro | `country` se escribe literalmente `null` desde el registro de la visita: nunca se intentó. Solo cuenta hacia adelante |
| 14 | **Corte contable** | La fecha la fija el dueño **después** de cerrar el bloque 1 | Fijarla antes haría nacer sucio el libro nuevo al día siguiente |

---

## 15. Dónde aplica cada patrón

| Página de Figma | Patrones que aplican |
|---|---|
| `03 Navegación y shell` | 4, 4.1, 7, 8, 11, 12, 13 |
| `04 Inventario` | todos |
| `05 POS y ventas` | todos |
| `06 Clientes` | 1–8, 4.1, 11, 12, 13 · **no** 9 ni 10 (ámbito organización) |
| `07 Finanzas` | todos |
| `08 Acceso y organización` | 1–8, 4.1, 11, 12, 13 · **no** 9 ni 10 (ámbito organización) |
| `09 Documentos` | **ninguno**: la página solo contiene plantillas de impresión (factura carta, media carta, ticket 80 mm y variantes del motor). No hay listados, ni tablas, ni paginación, ni acciones masivas —comprobado por script: 0 `DataTable`, 0 `Pagination`, 0 `BulkActionBar`—. Cuando se añada el listado de documentos, aplican todos. |

## Cómo se comprueba

Antes de cerrar cualquier tanda sobre el archivo de Figma, por script:

1. Ninguna Sección se solapa con otra.
2. Ningún frame de primer nivel se solapa con otro dentro de su Sección.
3. Ningún nodo se sale de su Sección.
4. Ningún contenido se sale de su frame (salvo tablas con scroll horizontal, que
   el frame recorta explícitamente con `clipsContent`).
5. Cero instancias rotas (`getMainComponentAsync` devuelve componente).
6. **Iconos (patrón 13):** cero cabeceras de escritorio con `Icon/Image` en la
   ranura, cero cabeceras de escritorio sin icono fuera de las dos excepciones
   escritas, y cero desacuerdos con `CATALOGO-ICONOS.md` —ni dos conceptos con el
   mismo icono, ni un concepto con dos iconos—. Los frames ocultos se cuentan
   aparte: una instancia oculta no tiene hijos sobrescribibles y su icono no se
   puede fijar hasta que se muestre.
