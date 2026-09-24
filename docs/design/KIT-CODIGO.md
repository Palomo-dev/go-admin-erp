# Kit de componentes en código — `src/components/kit`

Fecha: 2026-09-23 · Figma: «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`),
página `02 Componentes`.

## La regla

> **Las páginas usan el kit. Si falta algo, se agrega al kit, no a la página.**
> Si se modifica en un lado, se modifica en todos.

- Una pantalla no dibuja su propia cabecera, tabla, paginación, barra masiva, chips de
  filtro, estados vacíos ni badges de estado. Los importa de `@/components/kit`.
- Si una pantalla necesita una variante que el kit no tiene, se añade **al componente del
  kit** (con su prop y su línea en este documento), no como `className` que lo reescribe.
- Los textos por defecto están en español; los que dependen del dominio (sustantivo de la
  paginación, acciones de la barra masiva, títulos de los estados vacíos) **se sobrescriben
  siempre** (PATRONES-TRANSVERSALES.md §12).
- Colores: solo tokens semánticos (`bg-surface`, `text-fg-secondary`, `border-line`,
  `bg-brand-tint`, `text-danger-text`…). Nada de `dark:`, hex ni `gray-*`.
- Móvil = por debajo de `lg` (1024 px), el mismo corte del shell.

Normas que el kit implementa: `PATRONES-TRANSVERSALES.md` (§1 BulkActionBar, §2
Pagination, §3 buscador y filtros, §4 PageHeader, §5 tablas, §6 acciones por fila, §7
estados, §9–10 sucursal, §11 capas flotantes), `SISTEMA-BADGES.md` y `CATALOGO-ICONOS.md`.

## Inventario: Figma → código

«Id» es el component set en `02 Componentes`. Donde dice *instancia*, el id es el de un uso
en el frame `518:63078` («Escritorio / Lotes — selección y acciones masivas»): el cupo de
llamadas del MCP de Figma se agotó antes de poder leer el component set, así que el id del
set queda por anotar en la próxima tanda.

| Figma | Id | Código | Estado |
|---|---|---|---|
| `PageHeader` | `109:4573` | `kit/PageHeader.tsx` | creado (sustituye a los ~12 `*PageHeader`) |
| `Breadcrumbs` | `109:4290` | `kit/Breadcrumbs.tsx` | creado |
| `StatCard` | `109:4684` | `kit/StatCard.tsx` + `kit/KpiStrip.tsx` | creado |
| `SearchBar` / `SearchInput` | instancia `518:63098` | `kit/SearchInput.tsx` | creado |
| `FilterButton` | instancia `518:63099` | `kit/FilterButton.tsx` | creado |
| `FilterPanel` (popover · sheet) | capturas `33-oc-filtros-productos-2-panel-abierto.png`, `33-oc-movil-filtros-sheet.png` | `kit/FilterPanel.tsx` | creado |
| `Chip Variant=filter` + «Limpiar todo» | instancia `518:63101` | `kit/FilterChip.tsx`, `kit/FilterChips.tsx` | creado |
| Fila buscador + filtros | frame `518:63097` | `kit/ListToolbar.tsx` | creado |
| `DataTable` + `TableCell` | `106:3688` (TableCell) | `kit/DataTable.tsx` | creado. Primitivas de shadcn `ui/table` no se usan: la tabla necesita celdas fijas y estados |
| `Checkbox` (`State=mixed`) | `50:2695` | `ui/checkbox.tsx` | **extendido**: pinta el guion en `indeterminate` |
| `MenuItem` / menú «⋯» | `10:239` | `kit/RowActionsMenu.tsx` (Radix dropdown) | creado |
| Hoja de acciones móvil | captura `47-clientes-movil-hoja-de-acciones.png` | `kit/ActionSheet.tsx` (sobre `ui/sheet`) | creado |
| `BulkActionBar` (`Layout=desktop` · `mobile`) | instancia `518:63246` | `kit/BulkActionBar.tsx` | creado |
| `ListCard` (`Selección=no · sí`) | `580:277858` | `kit/ListCard.tsx` | creado |
| `Avatar Size=sm Type=initials` | — (captura `15-clientes-catalogo-listo.png`) | `kit/AvatarIniciales.tsx` | creado (listado de Clientes) |
| `EmptyState` (`empty · search · error · forbidden`) + `EmptyStateSinSucursal` | — (capturas `09-kit-listas.png`, `47-clientes-movil-sin-resultados.png`) | `kit/EmptyState.tsx` (variante `sinSucursal`) | creado |
| `Pagination Layout=full` | instancia `518:63238` | `kit/Pagination.tsx` | creado; **`ui/DataTablePagination` pasa a delegar aquí** (24 pantallas heredan la paginación única) |
| `Pagination Layout=compact` | captura `47-proveedores-movil-referencia.png` | `kit/PaginationCompact.tsx` | creado |
| `Badge` (Tono × Variant × Size, Punto, Icono) | `7:70` | `ui/badge.tsx` | **extendido**: props `tono`, `apariencia`, `tamano`, `punto`, `icono`; las variantes shadcn heredadas siguen igual |
| Tabla estado → tono | SISTEMA-BADGES §4 | `kit/estadoTono.ts` + `kit/StatusBadge.tsx` | creado (una sola tabla para toda la app) |
| `BranchBadge` (Scope × Tono × Size × Estado) | instancia `518:63084` | `kit/BranchBadge.tsx` | creado; **`inventario/BranchBadge.tsx` pasa a delegar** (sale el fucsia, SISTEMA-BADGES §6) |
| `FormField` (default · focus · error) | — | `kit/FormField.tsx` | creado (envuelve `Input`, `PhoneInput`, `SearchSelect`, `Select`…) |
| `SectionCard` / `FormSection` | — | `kit/FormSection.tsx` | creado |
| `SegmentedControl` | — | `kit/SegmentedControl.tsx` | creado |
| Botón de rango de fechas («📅 1 – 22 sep 2026 ▾») | frame `680:407222` (Cajas — historial) | `kit/DateRangeButton.tsx` + `kit/rangoFechas.ts` | creado (tanda de cajas) |
| Acción visible de fila con motivo si está deshabilitada (ojo · «🔒 Cerrar» + tooltip) | frames `680:404395` y `680:405300` (Cajas abiertas) | `kit/AccionRapida.tsx` | creado (tanda de cajas) |
| `Button`, `IconButton` | `9:343`, `9:384` | `ui/button.tsx` | existía; el kit pinta sus botones internos con los mismos tamaños (sm 32 · md 40) |
| `Select`, `SearchSelect`, `PhoneInput`, `Sheet`, `Skeleton`, `ConfirmDialog`, `Tooltip` | — | `ui/*` | existían; se reutilizan sin cambios |
| `MobileHeader Mode=page` | `48:2550` | `shell/header/cabeceraMovil.tsx` | existía; `PageHeader` lo alimenta con `useCabeceraMovil` |
| `SortMenu`, `ViewToggle`, `TabItem` (`581:277913`), `RelatedLinkCard` (`580:277907`) | — | — | **pendientes**: no los pide ninguna de las cinco pantallas de esta tanda |

## Componentes

Todos se importan de `@/components/kit`.

### `PageHeader` · Figma `109:4573`

Migas, icono (caja 40 × 40 con tinte de marca), título H1 22/28, subtítulo 13/18 con
`Loader` girando si `cargando`, acciones a la derecha (una sola primaria). En móvil no se
dibuja: publica título, subtítulo y acción en el `MobileHeader Mode=page` del shell.

| Prop | Tipo | Notas |
|---|---|---|
| `titulo` | `string` | |
| `subtitulo` | `ReactNode` | «273 proveedores · 12 con saldo» |
| `icono` | `LucideIcon` | el de `CATALOGO-ICONOS.md` |
| `migas` | `{ etiqueta, href? }[]` | colapsa a partir de 3 |
| `acciones` | `ReactNode` | botones; «⋯» con `RowActionsMenu orientacion="horizontal" tamano="md"` |
| `variante` | `'list' \| 'detail' \| 'form'` | `form` pinta «← Volver» con `volverA` |
| `badge`, `miniatura` | `ReactNode` | solo `detail` |
| `cargando` | `boolean` | la cabecera **no** se esqueletiza |
| `debajo` | `ReactNode` | fila bajo la cabecera (BranchBadge, pestañas); se ve también en móvil |
| `movil` | `{ accion?, titulo?, subtitulo?, ocultarBarra? } \| false` | `false` fuera del shell |

```tsx
<PageHeader
  titulo="Proveedores"
  subtitulo={`${total} proveedores`}
  icono={Truck}
  migas={[{ etiqueta: 'Inventario', href: '/app/inventario' }, { etiqueta: 'Proveedores' }]}
  acciones={<>
    <Button variant="outline"><Download /> Exportar</Button>
    <Button><Plus /> Nuevo proveedor</Button>
    <RowActionsMenu orientacion="horizontal" tamano="md" acciones={masAcciones} />
  </>}
  movil={{ accion: <Link href="/app/inventario/proveedores/nuevo" aria-label="Nuevo proveedor"><Plus /></Link> }}
/>
```

### `StatCard` · `KpiStrip` · Figma `109:4684`

Etiqueta Caption 12, valor Display 28/36 con números tabulares, detalle 12 coloreado por
`tono` con flecha opcional. `KpiStrip` los reparte en 4 columnas (2 en tableta; en móvil
desplaza en horizontal).

| Prop | Tipo |
|---|---|
| `etiqueta`, `valor`, `detalle` | `string` / `ReactNode` |
| `tono` | `'neutro' \| 'exito' \| 'advertencia' \| 'peligro' \| 'informacion' \| 'marca'` |
| `tendencia` | `'sube' \| 'baja'` |
| `icono` | `LucideIcon` |
| `cargando` | `boolean` (esqueleto solo del valor) |
| `href` / `onClick` | la tarjeta entera navega (listado filtrado) |

```tsx
<KpiStrip etiqueta="Resumen de clientes">
  <StatCard etiqueta="Clientes" valor="1.284" detalle="86 con saldo" />
  <StatCard etiqueta="Cuentas vencidas" valor="23" detalle="$ 4,8 M" tono="peligro" tendencia="sube" href="?saldo=vencido" />
</KpiStrip>
```

### `SearchInput` · Figma `SearchBar`

Buscador único, 40 px, `onChange` con debounce (400 ms), Enter lo dispara ya, Escape borra,
«/» lo enfoca. `cargando` = puntito, no esqueleto. Si `value` cambia desde fuera (URL,
«Limpiar filtros») el campo se sincroniza.

| Prop | Tipo |
|---|---|
| `value`, `onChange` | `string`, `(v) => void` (con debounce) |
| `onValueChange` | inmediato, para filtrar lo ya cargado |
| `debounceMs`, `placeholder`, `etiqueta`, `atajo` (`'/'` o `false`), `cargando`, `accesorio`, `tamano` | |

### `FilterButton` · `FilterPanel` · `FilterChip` · `FilterChips` · `ListToolbar`

- `FilterButton`: «Filtros» + contador; estados default · active · open.
- `FilterPanel`: popover de 360 px en escritorio (pegado al botón, voltea si no cabe),
  hoja inferior en móvil con «Limpiar (n)», × y botón fijo «Ver N …». Los campos los pone la
  pantalla (`FormField` + `Select`, `SegmentedControl`, `Checkbox`). **Nunca sucursal.**
- `FilterChips`: chips con «×» y «Limpiar todo»; en móvil desplazan en horizontal.
- `ListToolbar`: la fila buscador + filtros (y los chips debajo). Nada más en esa fila.

| `FilterPanel` | Tipo |
|---|---|
| `conteo`, `onLimpiar`, `children` | |
| `titulo`, `nota`, `textoVerResultados`, `abierto`, `onAbiertoChange` | opcionales |

```tsx
const l = useListadoServidor({ filtros: ['estado', 'tipo'], camposOrden: ['nombre', 'saldo'] });
<ListToolbar
  busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} placeholder="Buscar cliente, NIT o teléfono" />}
  filtros={
    <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={`Ver ${total} clientes`}>
      <FormField etiqueta="Tipo">
        {(c) => <SegmentedControl aria-labelledby={c.idEtiqueta} anchoCompleto valor={l.filtros.tipo ?? 'todos'}
          onValorChange={(v) => l.setFiltro('tipo', v === 'todos' ? null : v)}
          opciones={[{ valor: 'todos', etiqueta: 'Todos' }, { valor: 'persona', etiqueta: 'Persona' }, { valor: 'empresa', etiqueta: 'Empresa' }]} />}
      </FormField>
    </FilterPanel>
  }
  chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
/>
```

### `DataTable` · Figma `DataTable` + `TableCell 106:3688`

| Prop | Tipo | Notas |
|---|---|---|
| `columnas` | `ColumnaTabla<T>[]` | `{ id, encabezado, celda, variante?: 'texto' \| 'importe' \| 'mono', alinear?, ancho?, ordenable?, campoOrden?, ocultarDebajo? }` |
| `filas`, `obtenerId`, `etiqueta` | | `etiqueta` = nombre accesible de la tabla |
| `estado` | `'listo' \| 'cargando' \| 'vacio' \| 'sinResultados' \| 'error' \| 'sinPermiso'` | `listo` sin filas pasa a `vacio` |
| `densidad` | `'comoda'` (52) \| `'compacta'` (40) | |
| `orden`, `onOrdenar` | `OrdenListado`, `(campo) => void` | `aria-sort` en la cabecera |
| `seleccion`, `onSeleccionChange` | `Set<string>` | casilla en la 1.ª columna, indeterminado en cabecera |
| `onFilaClick` | `(fila) => void` | fila entera, Enter/Espacio; sin icono de «ojo» |
| `etiquetaFila` | `(fila) => string` | nombre para casillas y menú |
| `acciones` | `(fila) => AccionFila[]` | «⋯» en la última columna, fija a la derecha |
| `accionesRapidas` | `(fila) => ReactNode` | máx. 2 iconos no destructivos (3 solo en stock por sucursal) |
| `tonoFila` | `(fila) => 'peligro' \| 'advertencia'` | |
| `tarjetaMovil` | `(fila, { seleccionado, modoSeleccion, alternar }) => ReactNode` | < lg: lista de `ListCard` |
| `vacio`, `sinResultados`, `error`, `sinPermiso` | `Partial<EmptyStateProps>` | textos del dominio |
| `onReintentar`, `onLimpiarFiltros`, `termino` | | |
| `pie` | `ReactNode` | `<Pagination />`; solo en `listo` y `cargando` |
| `virtualizar` | `boolean \| 'auto'` | `auto`: > 500 filas en el navegador |

```tsx
<DataTable
  etiqueta="Proveedores"
  columnas={[
    { id: 'nombre', encabezado: 'Proveedor', ordenable: true, celda: (p) => p.name },
    { id: 'nit', encabezado: 'NIT', variante: 'mono', ocultarDebajo: 'md', celda: (p) => p.nit },
    { id: 'saldo', encabezado: 'Saldo', variante: 'importe', ordenable: true, celda: (p) => formatear(p.saldo) },
    { id: 'estado', encabezado: 'Estado', celda: (p) => <StatusBadge estado={p.status} /> },
  ]}
  filas={datos}
  obtenerId={(p) => String(p.id)}
  estado={cargando ? 'cargando' : error ? 'error' : datos.length === 0 && l.hayCriterios ? 'sinResultados' : 'listo'}
  orden={l.orden}
  onOrdenar={l.ordenarPor}
  seleccion={seleccion}
  onSeleccionChange={setSeleccion}
  onFilaClick={(p) => router.push(`/app/inventario/proveedores/${p.id}`)}
  etiquetaFila={(p) => p.name}
  acciones={(p) => accionesDe(p)}
  tarjetaMovil={(p, ctx) => (
    <ListCard icono={Building2} titulo={p.name} subtitulo={`NIT ${p.nit}`} valor={formatear(p.saldo)}
      estado={<StatusBadge estado={p.status} />} acciones={accionesDe(p)}
      seleccionable={ctx.modoSeleccion} seleccionado={ctx.seleccionado} onSeleccionChange={ctx.alternar}
      onClick={() => router.push(`/app/inventario/proveedores/${p.id}`)} />
  )}
  vacio={{ titulo: 'Aún no tienes proveedores', accion: { etiqueta: 'Nuevo proveedor', href: '…/nuevo', icono: Plus } }}
  onLimpiarFiltros={l.limpiarTodo}
  onReintentar={recargar}
  termino={l.busqueda}
  pie={<Pagination pagina={l.pagina} tamano={l.tamano} total={total} onPaginaChange={l.setPagina}
    onTamanoChange={l.setTamano} sustantivo={{ singular: 'proveedor', plural: 'proveedores' }} cargando={cargando} />}
/>
```

### `RowActionsMenu` · `ActionSheet` · Figma `MenuItem 10:239`

`AccionFila = { id, etiqueta, icono: LucideIcon, onSelect, destructiva?, separadorAntes?,
deshabilitada?, motivo?, oculta? }`. El kit ordena: primero las normales, luego divisor y
las destructivas en rojo (`prepararMenu`). Tope de 8 entradas. Una acción deshabilitada
**muestra su motivo**; si no hay motivo, se oculta.

- `RowActionsMenu`: `acciones`, `titulo` (registro), `orientacion` (`vertical` ⋮ en filas ·
  `horizontal` ⋯ en cabeceras), `tamano` (`sm` 32 · `md` 40), `lado` (`top` desde la barra
  masiva). Escritorio: menú alineado al borde derecho, 4 px. Móvil: abre `ActionSheet`.
- `ActionSheet`: `abierto`, `onAbiertoChange`, `titulo`, `descripcion?`, `acciones`.
  Filas de 52 px con icono de 20.

### `BulkActionBar` · Figma instancia `518:63246`

Flota al pie, centrada sobre la columna de contenido (se mide, así sigue al sidebar), solo
con selección; en móvil tapa el `MobileTabBar`. Contador · «Seleccionar los N» · acciones ·
«⋯» · «×».

| Prop | Tipo |
|---|---|
| `seleccionados`, `total`, `onSeleccionarTodos` | `number`, `number`, `() => void` |
| `sustantivo` | `{ singular, plural }` del dominio |
| `acciones` | `AccionMasiva[]` = `{ id, etiqueta, icono, onClick, destructiva?, cargando?, deshabilitada?, motivo? }` |
| `accionesSecundarias` | `AccionFila[]` (en «⋯», abre hacia arriba) |
| `onLimpiar` | `() => void` |

```tsx
<BulkActionBar seleccionados={seleccion.size} total={total} onSeleccionarTodos={seleccionarTodos}
  sustantivo={{ singular: 'cliente', plural: 'clientes' }}
  acciones={[{ id: 'etiquetar', etiqueta: 'Etiquetar', icono: Tag, onClick: abrirEtiquetar },
             { id: 'eliminar', etiqueta: 'Eliminar', icono: Trash2, onClick: confirmarEliminar, destructiva: true }]}
  accionesSecundarias={[{ id: 'unificar', etiqueta: 'Unificar duplicados', icono: Merge, onSelect: abrirUnificar }]}
  onLimpiar={() => setSeleccion(new Set())} />
```

Una acción con `menu: GrupoMenuMasivo[]` (`{ titulo?, acciones: AccionFila[] }`) abre un menú
en lugar de ejecutar `onClick`: «Roles ▾» de Clientes con los grupos «Agregar rol» y «Quitar rol».
En móvil los grupos se aplanan en la hoja («Agregar rol: Cliente», `aplanarMenuMasivo`).

### `ListCard` · Figma `580:277858`

Tarjeta móvil de 358 px: icono en caja tintada de 40, título 14/20 medium en una línea,
subtítulo 13/18 (hasta 2 líneas), meta 12/16 atenuada, valor y badge a la derecha, «⋯».
Toda la tarjeta abre el detalle; en modo selección gana casilla y borde de marca de 2 px.

Props: `icono`, `titulo`, `subtitulo?`, `meta?`, `valor?`, `estado?`, `onClick?`,
`acciones?`, `seleccionable?`, `seleccionado?`, `onSeleccionChange?`.

Clientes móvil pasa su avatar de iniciales por `miniatura` (`<AvatarIniciales tamano="md" />`) y
conserva su información (nombre, Persona/Empresa, documento, contacto, correo, teléfono), un dato
por línea con elipsis.

Con `onMantenerPulsado` la tarjeta entra en modo selección al mantenerla pulsada 500 ms (o con
clic derecho) y, en modo selección, tocarla alterna su casilla en lugar de abrir el detalle
(Figma Clientes móvil, «selección múltiple»). En `DataTable`: `onMantenerPulsado={() => ctx.alternar(true)}`.

### `AvatarIniciales`

Círculo Azul GO con dos iniciales o la foto (si falla, vuelve a las iniciales). `nombre`, `src?`,
`tamano` (`sm` 32 · `md` 40 · `lg` 64). Un solo color: en el listado el color no significa nada.

### `EmptyState`

`variante`: `empty` (primer paso, botón primario) · `search` («Limpiar filtros») · `error`
(«Reintentar», `role="alert"`) · `forbidden` («Volver al inicio») · `sinSucursal` (textos de
PATRONES §10; la acción «Solicitar acceso al administrador» la pone la pantalla). Props:
`titulo`, `descripcion`, `icono`, `accion`, `accionSecundaria`, `onLimpiarFiltros`,
`onReintentar`, `termino` («Sin resultados para «…»»), `compacto`.

### `Pagination` · `PaginationCompact` · Figma instancia `518:63238`

`Pagination`: `pagina`, `tamano`, `total`, `onPaginaChange`, `onTamanoChange?`,
`opcionesTamano` (10 · 20 · 50 · 100), `sustantivo`, `cargando`, `layout` (`auto` ·
`full` · `compact`). «Mostrando 1 a 6 de 42 sesiones», selector «25 por página», « ‹ 1 2 3 …
175 › ». `PaginationCompact`: «‹ 1–10 de 273 ›» + «Ir a [n]». `layout="auto"` = completa en
escritorio, compacta en móvil. `compact` en escritorio solo para tablas dentro de una
tarjeta.

### `StatusBadge` · `Badge` · Figma `7:70`

`StatusBadge estado="paid"` → «Pagada», éxito · suave. El tono sale de
`kit/estadoTono.ts` (la tabla de SISTEMA-BADGES §4): acepta español o el valor en inglés de
la BD, sin tildes ni mayúsculas, y los días de mora dentro de la etiqueta («Vencida 12 d»).
Props: `estado`, `etiqueta?`, `tamano` (`sm` 20 · `md` 24), `icono?`; `tono`/`apariencia`
solo para excepciones documentadas en SISTEMA-BADGES.

`Badge` (ui) acepta ahora la escala: `tono` (marca · exito · advertencia · peligro ·
informacion · neutro) × `apariencia` (suave · solido · contorno) × `tamano`, más `punto` e
`icono`. Para categorías que no son estados (tipo de cliente, método de pago) se usa
`Badge` con su tono; **nunca `solido`** fuera del estado dominante.

### `BranchBadge` · `BranchBadgeActiva` · Figma instancia `518:63084`

`alcance`: `una` (Azul GO sólido, `Store`) · `todas` (tinte, `Building2`, «Todas (3)») ·
`sinAsignar` (gris, «Sin sucursal»). `tono` `marca`/`neutro`, `tamano` `sm` 24 / `md` 28,
`onClick` lo vuelve interactivo con chevron. `BranchBadgeActiva` lee `BranchContext` y es el
que va en `PageHeader debajo` de las pantallas de ámbito de sucursal (inventario, POS,
cajas, facturas). **Clientes y proveedores no lo llevan.**

### `FormSection` · `FormField`

- `FormSection`: `titulo`, `descripcion?`, `accion?`, `columnas` (1 · 2 · 3; en móvil 1).
- `FormField`: `etiqueta`, `obligatorio`, `ayuda`, `error`, `id?`, `etiquetaOculta?`,
  `extra?`. Con un elemento hijo inyecta `id`, `aria-describedby`, `aria-invalid` y
  `aria-required`; con una función entrega `{ id, idEtiqueta, … }` para `Select`,
  `SearchSelect` o `SegmentedControl`. El error va con `role="alert"`.

```tsx
<FormSection titulo="Datos de contacto" columnas={2}>
  <FormField etiqueta="Correo electrónico" error={errores.email}><Input type="email" value={email} onChange={…} /></FormField>
  <FormField etiqueta="Teléfono" obligatorio><PhoneInput value={tel} onChange={setTel} /></FormField>
</FormSection>
```

### `SegmentedControl`

`opciones: { valor, etiqueta, icono?, contador?, deshabilitada?, soloIcono? }[]`, `valor`,
`onValorChange`, `etiqueta` o `aria-labelledby`, `tamano`, `anchoCompleto`. Es un
`radiogroup` con foco itinerante (flechas, Inicio, Fin).

### `DateRangeButton` · `rangoFechas` · Figma `680:407222`

Botón de 40 px de la barra del listado, junto al buscador: icono de calendario, rango
(«1 – 22 sep 2026», «28 ago – 3 sep 2026») y chevron. Abre un panel con atajos (Hoy, Ayer,
Últimos 7 días, Últimos 30 días, Este mes, Mes pasado) y dos campos de día.

**Días calendario puros** (`YYYY-MM-DD`): el kit no decide la zona horaria. La pantalla pasa
`hoy` con `useFormatDate().getToday()` y convierte a instantes con `toInstant(desde)` y
`toInstant(addPlainDays(hasta, 1))` (hasta exclusivo) al consultar.

| Prop | Tipo |
|---|---|
| `valor`, `onValorChange` | `RangoFechas = { desde, hasta }` |
| `hoy` | día de la organización |
| `etiqueta`, `max` (por defecto `hoy`), `deshabilitado` | |

`rangoFechas.ts`: `etiquetaRango`, `presetsRango(hoy)`, `presetDe`, `normalizarRango`,
`esFechaPlana`, `inicioDeMes`. Con `useListadoServidor` el rango va como dos filtros
(`desde`, `hasta`) en la URL.

### `AccionRapida` · Figma `680:404395`, `680:405300`

La acción visible de una fila (`DataTable accionesRapidas`), 32 px: solo icono («Ver
detalle», con tooltip) o botón con texto («🔒 Cerrar»). Con `deshabilitada` + `motivo`
queda atenuada, **sigue siendo enfocable** (`aria-disabled`) y el motivo sale en un tooltip
oscuro y en `aria-describedby` («Solo el cajero que abrió la caja o un administrador puede
cerrarla»). El clic no llega a la fila.

Props: `etiqueta`, `icono`, `onClick` o `href`, `soloIcono`, `deshabilitada`, `motivo`.

### `useListadoServidor`

Búsqueda, filtros, orden, página y tamaño en `searchParams`, validados contra una lista
blanca (lo que se lee de la URL termina en `.order()`/`.eq()` del servidor).

```ts
const l = useListadoServidor({
  filtros: ['estado', 'tipo'],
  camposOrden: ['nombre', 'saldo'],
  ordenPorDefecto: { campo: 'nombre', direccion: 'asc' },
  tamanoPorDefecto: 20,          // 10 · 20 · 50 · 100
  prefijo: undefined,            // 'prov_' si hay dos listados en la página
});
// l.busqueda, l.filtros, l.orden, l.pagina, l.tamano, l.rango { desde, hasta },
// l.filtrosActivos, l.hayCriterios,
// l.setBusqueda, l.setFiltro(clave, valor | valores[] | null), l.limpiarFiltros, l.limpiarTodo,
// l.ordenarPor(campo), l.setOrden, l.setPagina, l.setTamano, l.actualizar({...})
```

Buscar, filtrar, ordenar o cambiar el tamaño vuelven a la página 1 y reemplazan la entrada
del historial; cambiar de página agrega una («atrás» vuelve a la página anterior).

### `TabBar` · Figma `TabItem 581:277913` (Proveedores, 2026-09-23)

Pestañas de un detalle con contador y subrayado de marca. `tablist` con foco itinerante
(flechas, Inicio, Fin); en móvil desplaza en horizontal. Va en `PageHeader debajo`.

| Prop | Tipo |
|---|---|
| `id` | prefijo de ids; `idPestana(id, valor)` e `idPanel(id, valor)` enlazan `aria-controls` / `aria-labelledby` |
| `pestanas` | `{ valor, etiqueta, contador?, deshabilitada? }[]` |
| `valor`, `onValorChange`, `etiqueta` | |

### `FormSection`: `icono` y `colapsable` (Proveedores, 2026-09-23)

Aditivo: `icono` pinta la caja tintada de 32 px junto al título (Figma «Nuevo proveedor»);
`colapsable` convierte la cabecera en un botón con chevron y `aria-expanded`
(`abiertaPorDefecto`, por defecto `true`). Los campos plegados siguen montados. Sin esas props
se ve igual que antes.

### `RelatedLinkCard`: alias `onClick` y `accion`

Además de `onAccion` y `textoAccion`, acepta `onClick` y `accion` con el mismo efecto: hay
pantallas escritas con cada par de nombres (Categorías usa los alias; Proveedores, los
originales).

## Cambios en archivos compartidos fuera del kit

| Archivo | Cambio | Efecto |
|---|---|---|
| `src/components/ui/badge.tsx` | + escala del manual (`tono`, `apariencia`, `tamano`, `punto`, `icono`) | Aditivo: sin `tono`, se comporta igual que antes |
| `src/components/ui/checkbox.tsx` | + guion en `indeterminate` | La casilla de cabecera con selección parcial ya no pinta un ✓ |
| `src/components/ui/DataTablePagination.tsx` | delega en `kit/Pagination` | Las 24 pantallas que lo usan pasan a la paginación única (mismas props) |
| `src/components/inventario/BranchBadge.tsx` | delega en `kit/BranchBadgeActiva` | Las ~37 pantallas de inventario dejan el fucsia por el Azul GO (SISTEMA-BADGES §6 y §9.2) |

## Pruebas

`src/components/kit/__tests__/kitLogica.test.ts` (33 tests; el repo corre jest en `node` y
no tiene testing-library): tabla estado → tono, paginación, selección, estado del listado en
la URL (lista blanca, ida y vuelta, prefijo), menú de acciones, virtualización, debounce y
flechas del `SegmentedControl`.

## Pendiente

- Anotar los ids de component set que quedaron como *instancia* (cupo del MCP de Figma).
- `SortMenu` (orden en móvil), `ViewToggle`, `TabItem` con contador y `RelatedLinkCard`
  cuando una pantalla los pida.
- Tests de render cuando el repo incorpore `@testing-library/react` y `jsdom`.

## Adenda 2026-09-23 — árboles y diálogo con cuerpo (Categorías)

Pedidos por el rediseño de Categorías (Figma `04 Inventario › 586:290667`). Archivos
nuevos; ningún componente existente cambió de contrato.

| Figma | Id | Código | Qué hace |
|---|---|---|---|
| `TreeCell` (Nivel 0/1/2 × Rama abierta/cerrada/hoja) | `580:278007` | `kit/TreeCell.tsx` | Sangría real de 24 px por nivel (16 en listas), chevron o hueco de hoja, icono tintado con el color propio del registro o miniatura, título y slug. `contexto` atenúa a los ancestros que solo acompañan a una coincidencia. Prop `arrastre` para cambiar de padre arrastrando |
| Tarjeta de árbol móvil («Sangría nivel 0/1/2») | frames de `586:310471` | `kit/TreeCard.tsx` | `ListCard` desplazada 16 px por nivel, con el chevron de la rama a la izquierda |
| Diálogo «Mover a…» · campo «Categoría padre» | `586:312245` | `kit/TreePicker.tsx` (`TreeList`, `TreeSelect`, `rutaOpcion`) | Selección sobre el árbol real: buscador que entra en ramas cerradas, opción raíz, marca «Actual» y opciones **deshabilitadas con su motivo** (las que crearían un ciclo). ↑/↓, Inicio/Fin, Enter/Espacio |
| — (lógica) | — | `kit/arbol.ts` | `construirArbol` (huérfanos a la raíz, ciclos sin colgarse), `filtrarArbol` (coincidencias + ancestros como contexto + ramas que se abren solas), `aplanarArbol` (respeta lo que se cerró a mano), `paginarRaices` (**la paginación es por nodos raíz**: un padre y sus hijas nunca quedan en páginas distintas), `descendientesDe`, `ancestrosDe`, `idsConHijos`, `normalizarBusqueda` |
| — (interacción) | — | `kit/arrastreArbol.tsx` (`useArrastreArbol`, `ZonaSoltarRaiz`) | Arrastrar y soltar nativo para reparentar (solo escritorio; la vía accesible es «Mover a…»). `puedeSoltar` devuelve `true` o el motivo; la franja «Suelta aquí para dejarla sin categoría padre» aparece solo mientras se arrastra |
| Diálogo con cuerpo (PATRONES §8) | `586:312245` | `kit/Dialogo.tsx` | Cabecera (título, descripción, ×) · cuerpo con scroll · pie «Cancelar» + primario. Anchos 440 · 520 · 560 · 672 · 1024. `primario.destructiva` en rojo; deshabilitado siempre con `motivo`. Para confirmaciones de una línea sigue `ui/confirm-dialog` |

`RelatedLinkCard` (`580:277907`) se escribió en esta misma tanda para el bloque «Cómo se
conecta» (`kit/RelatedLinkCard.tsx`): `icono`, `etiqueta`, `valor`, `href` u `onAccion`
(alias `onClick`), `textoAccion` (alias `accion`), `tono` `neutral · warning · danger`.

Pruebas: `src/components/kit/__tests__/arbol.test.ts` (13 casos: niveles y orden, huérfanos,
ciclos, descendientes, ancestros, búsqueda en ramas cerradas, rama cerrada a mano durante la
búsqueda, paginación por raíces).

## Adenda 2026-09-24 — etiquetas de producto y alta rápida (catálogo)

Pedidos por «Imprimir etiquetas», «Códigos de barras» y el alta rápida de categoría
(`PARIDAD-ETIQUETAS-CATEGORIA.md`). Aditivo: ningún componente existente cambió de contrato.

| Figma | Id | Código | Qué hace |
|---|---|---|---|
| `Doc/Código de barras` (Formato × Estado) | `511:257339` | `kit/CodigoBarras.tsx` | Barras con el paquete `jsbarcode` (sin CDN: imprime sin red), EAN-13/EAN-8 si el dígito de control cuadra y Code128 si no; número legible en HTML; franja «sin código» e «inválido». Papel: blanco y negro fijos. Textos por props |
| `Doc/Etiqueta de producto` (Formato × Precio) | `511:257339` | `kit/EtiquetaProducto.tsx` | Etiqueta en milímetros reales: nombre (2 líneas), variante, barras, SKU y precio (comparación tachada). Letras proporcionales a la de carta 63,5 × 33,9 |
| Hoja carta / A4 / rollo | `511:257344` | `kit/HojaEtiquetas.tsx` | Una página a tamaño real con cada casilla en su posición (plantillas de `lib/utils/etiquetasImpresion.ts`); `null` = casilla vacía |
| Diálogo con icono y varios botones | `513:262688`, `517:269277` | `kit/Dialogo.tsx` | + `icono` (caja de 40), `secundarios` (entre «Cancelar» y el primario: «Vista previa PDF»), `pie` (resumen a la izquierda), ancho `880` |
| `SearchSelect` «Mostrar crear» | `520:61612` | `ui/search-select.tsx` | + `onCreate(texto)`, `createLabel`, `createEmptyLabel`: última fila «Crear “…”» (Enter sin resultados también crea) |

Lógica pura y probada: `src/lib/utils/codigoBarras.ts` (dígito de control GS1, validación,
numeración espejo de `fn_codigo_barras_construir`) y `src/lib/utils/etiquetasImpresion.ts`
(plantillas, reparto en hojas, casilla de inicio, cantidad según stock). Tests en
`src/lib/utils/__tests__/codigoBarras.test.ts` y `etiquetasImpresion.test.ts`.

## Adenda 2026-09-24 — asistente por pasos y diálogo adaptable (Importar productos · Meta)

Pedidos por el rediseño de «Importar productos» (Figma `09-importar`) y «Meta y canales»
(Figma `09-meta`). Archivos nuevos; ningún componente existente cambió de contrato.

| Figma | Código | Qué hace |
|---|---|---|
| Stepper «Origen — Mapeo — Validación — Previsualización — Resultado» | `kit/Stepper.tsx` | Escritorio: círculos numerados unidos por línea (✓ azul los hechos, anillo en el actual, gris los pendientes) y `extra` a la derecha («Origen · Sucursal destino»). Móvil: «Paso 2 de 5 · Mapeo» + barra de avance. `ol` con `aria-current="step"`; `onPasoClick` solo en los pasos ya hechos (no se salta uno sin validar). El texto móvil lo da la pantalla (`resumenMovil`) para que salga en su idioma |
| Diálogo «Meta y canales» (Dialog en escritorio, hoja con asa en móvil) | `kit/PanelAdaptable.tsx` | Cabecera con icono tintado de 40, título, descripción y «×» (`kit.comun.cerrar`); `debajoCabecera` fija para pestañas (`TabBar`); cuerpo con scroll; `pie` libre (a diferencia de `Dialogo`, no impone «Cancelar + primario»). Anchos 520 · 560 · 672 · 800. `ocupado` bloquea el cierre. Por debajo de `lg` es `Sheet side="bottom"` a 92 dvh con zona segura |

```tsx
<Stepper etiqueta="Pasos de la importación" pasos={[{ valor: 'origen', etiqueta: 'Origen' }, …]} actual={paso}
  onPasoClick={setPaso} resumenMovil={(n, total, p) => t('pasos.resumenMovil', { n, total, paso: p })} extra={…} />

<PanelAdaptable abierto={abierto} onAbiertoChange={setAbierto} titulo="Meta y canales" icono={Share2}
  debajoCabecera={<TabBar id="meta" … />} pie={<Button variant="outline">Cerrar</Button>}>…</PanelAdaptable>
```

## Adenda 2026-09-24 — detalle y formulario de producto

Pedidos por el detalle de producto (sub-pestañas) y el formulario único (impuestos,
categorías adicionales, etiquetas y cifras con moneda). Aditivo: ningún contrato cambió.

| Figma | Código | Qué hace |
|---|---|---|
| `MultiSelect` / `TaxMultiSelect` (`02 Componentes › Impuestos`) | `kit/MultiSelect.tsx` + `kit/multiSelectLogica.ts` | Chips con «×» en el disparador, panel con buscador sin tildes, casillas, «Crear “…”» opcional (`onCrear`), punto de color por opción. Teclado: ↑/↓, Enter, Escape, Retroceso quita el último chip. Textos por props (`placeholder`, `placeholderBusqueda`, `textoVacio`, `textoCrear`, `etiquetaQuitar`). Import directo: `@/components/kit/MultiSelect` |
| `NumberInput` (prefijo `$` / sufijo `%`) | `kit/CampoNumero.tsx` + `kit/campoNumeroLogica.ts` | `valor` / `onValorChange(number \| null)` (vacío ≠ 0), coma o punto decimal, `decimales`, `minimo`, `maximo`, `prefijo` (símbolo de la moneda de la organización), `sufijo` («%», «días»), `tamano` sm 32 · md 40. Con `FormField` recibe `id` y `aria-*` |
| `TabItem` en sub-pestañas | `kit/TabBar.tsx` | + `tamano="sm"` (32 px, texto 13) para las sub-pestañas dentro de una pestaña (Inventario › Stock · Lotes · Kardex · Seriales) |

Pruebas: `src/components/inventario/productos/__tests__/productoLogica.test.ts` (filtro y
alternancia del `MultiSelect`, conversión del `CampoNumero`).

## Adenda 2026-09-24 — kit compartido de POS, cajas, ventas, facturas, CxC y CxP

Lista consolidada, equivalencias con Figma y con los nombres de cada plan, y qué pantalla usa
cada pieza: `docs/implementacion/KIT-COMPARTIDO.md`. Aquí va el contrato. Textos por props con
respaldo en `kit.*` (4 idiomas); dinero con `crearFormateadorMoneda` sobre la moneda que pasa la
pantalla (`useMonedaOrganizacion()` o la del documento); fechas ya formateadas por la pantalla
(`useFormatDate`). **Ninguna pieza calcula el negocio ni llama a Supabase.**

### Datos, tarjetas y confirmación con motivo

| Figma | Código | Contrato |
|---|---|---|
| `FilaDato` (6 tonos) `680:406357` | `kit/FilaDato.tsx` | `etiqueta`, `valor`, `tono` (`neutro · fuerte · exito · peligro · advertencia · enlace`), `sangria` (0 · 1 · 2), `descripcion`, `accesorio`, `oculto` (cierre ciego: «Oculto» con ojo tachado), `tamano` (`lg` = total), `href`, `separadorAntes`. Es un par `dt`/`dd`: va dentro de `ListaDatos` (`<dl>`), `ResumenTotales`, `Tarjeta` o `ResultadoOperacion` |
| `Tarjeta` `680:406329` | `kit/Tarjeta.tsx` | `titulo`, `descripcion`, `icono` (caja de 32), `accion`, `tono` (`neutro · peligro · advertencia · exito · informacion`: borde y caja del icono), `sinRelleno` (tablas), `pie`. Sustituye a las tarjetas privadas de cada detalle |
| `KpiCompacto` `680:406370` | `kit/KpiCompacto.tsx` | `cifras: { etiqueta, valor, tono?, href?, onClick? }[]`, `cargando`. Franja móvil de 2–4 cifras con divisores; en escritorio sigue `KpiStrip` |
| Diálogo «Anular venta» `331:54986` | `kit/DialogoMotivo.tsx` + `kit/motivo.ts` | `titulo`, `textoConfirmar`, `onConfirmar(motivo)`, `consecuencias` («qué se revierte»), `motivosRapidos` (chips), `minimo` (5) / `maximo` (500), `destructiva` (por defecto sí), `cargando`, `bloqueo` (aviso + primario deshabilitado con su motivo), `error` (del servidor), `children` (alternativa: «Generar nota crédito»). Es también el `AnularDocumentoDialog` del plan de compras |
| `ChipDocumento` `680:406423` (+ `729:18827…18863`) | `kit/documento/ChipDocumento.tsx` | `tipo`, `numero`, `href` u `onClick`, `anulado`, `tamano`. Nombre accesible «Factura FV-00042» |
| `CadenaDocumento` + `EslabonDocumento` `680:409052`, `680:408881` | `kit/documento/CadenaDocumento.tsx` + `documentos.ts` | `eslabones: { id, tipo, numero, estado?, fecha?, importe?, href?, onClick?, actual?, pendiente?, accion? }[]`, `ordenar` (por tipo: origen → documento → cartera → pagos → devolución → nota → asiento). Fila con flechas en escritorio, lista con conector en móvil; `aria-current="page"` en el actual |

Tipos de documento (`TIPOS_DOCUMENTO`) e iconos (`ICONO_DOCUMENTO`, uno por concepto, los de
CATALOGO-ICONOS §2 donde existen): cotización `Calculator`, pedido `ShoppingBag`, reserva
`CalendarClock`, orden de compra `ClipboardList`, venta `Receipt`, factura `FileText`, factura de
compra `ReceiptText`, entrada a inventario `PackagePlus`, documento soporte `FileCheck`, CxC
`Wallet`, CxP `HandCoins`, pago `CircleDollarSign`, recibo `ScrollText`, devolución `Undo2`,
nota crédito `FileMinus`, nota débito `FilePlus`, asiento `BookOpen`.

`StatusBadge` / `estadoTono.ts` (extendido, SISTEMA-BADGES §4 primero): «En cola» (`queued`),
«Por recibir», «Pendiente de pago», «Al día» (`current`, que la cartera ya usa en 532 filas y
salía gris en inglés), «Devuelta» / «Devuelta parcial» (`returned`, `partially returned`),
«No aplica», «Castigada» (`written off`).

Pruebas: `kit/__tests__/documentoYMotivo.test.ts`.

### Totales, teclado, botón con importe y pagos

| Figma | Código | Contrato |
|---|---|---|
| Resumen de totales (carrito, cobro) | `kit/ResumenTotales.tsx` + `kit/resumenTotalesLogica.ts` | `subtotal`, `impuestos: { nombre, tarifa?, base?, importe }[]` (se agrupan por nombre y tarifa: «IVA 19 %»), `descuentos` / `cargos: { etiqueta, importe }[]` (el cargo de servicio y el flete entran aquí), `total`, `retenciones`, `neto`, `impuestosIncluidos` (filas informativas), `mostrarBases`, `moneda`, `cabecera` (interruptor «Impuestos incluidos»), `extras` (Pagado · Falta · Cambio), `cargando`, `sinImpuestosConfigurados`. Signo «−» tipográfico. No suma nada: todo llega del servicio |
| `Kbd` (light · dark · on-brand × Length) | `kit/Kbd.tsx` + `kit/teclas.ts` | `tecla` («F9», «Ctrl+N», «Alt+1», «Supr», «↑↓»), `tema` (`claro · oscuro · marca`), `tamano` (sm 20 · md 24). Decorativo (`aria-hidden`); nombres de tecla por idioma en `kit.teclas` («Supr» / «Del» / «Suppr»). Sustituye los `<kbd>` a mano de `SearchInput`, `AppHeader`, `GlobalSearch`, `chat/inbox/SearchPanel` y `SearchInConversation` (el de `pos/cajas/listado/CajasPage.tsx` queda para el agente de cajas) |
| `KbdButton` (primary · outline · ghost · destructive × sm · md · lg) | `kit/KbdButton.tsx` + `kit/botonClases.ts` | props de `button` + `variante` (`primario · secundario · fantasma · destructivo · tinte`), `tamano`, `atajo`, `icono`, `cargando`, `anchoCompleto`, `atajoSiempreVisible`. Pone `aria-keyshortcuts`; el `Kbd` se oculta por debajo de `lg`. `clasesBoton()` es la escala de botones del kit |
| — (registro de atajos) | `kit/useAtajos.ts` | `useAtajos(atajos, { activo, hayRafaga })` con `{ tecla, accion, descripcion, grupo?, cuando?, permitirEnCampo? }[]`: un `keydown` por ámbito; en un campo solo F1–F12, Esc y Alt/Ctrl; nada durante una ráfaga del lector de códigos. `agruparAtajos` alimenta el mapa F1 |
| `CobrarButton` (default · sin-caja · falta · procesando · deshabilitado) | `kit/BotonImporte.tsx` + `botonImporteLogica.ts` | `etiqueta`, `importe` (formateado), `atajo`, `estado` (`listo · sinCaja · falta · procesando · deshabilitado`), `motivo` (visible bajo el botón y en `aria-describedby`), `onClick`, `icono`, `tamano` (md · lg), `anchoCompleto`. «Cobrar» del carrito, «Completar venta», «Registrar pago», «Pagar» |
| Botones de método de pago | `kit/SelectorMetodoPago.tsx` + `metodosPago.ts` | `metodos: { codigo, nombre, icono?, deshabilitado?, motivo? }[]` (**los de la organización**), `valor`, `onValorChange`, `maxBotones` (4: si hay más, N−1 botones y «Otro ▾»), `atajos` (Alt+1…n por posición). `radiogroup` con flechas; icono de respaldo por código |
| Lista de pagos del cobro | `kit/ListaPagos.tsx` | `pagos: { id, metodo, codigo?, monto, referencia?, estado? (listo · qrPendiente · qrProcesando · qrCubierto · error), detalle? }[]`, `moneda`, `onQuitar`, `onGenerarQr`, `accesorio`, `resumen` (Pagado · Falta · Cambio, calculados por la pantalla), `bloqueado` |

`PanelAdaptable` gana `ancho={1120}` (cobro del POS). Aditivo.

### Documento: cabecera, líneas, totales y diálogo único de pago (`kit/documento/`)

| Figma | Código | Contrato |
|---|---|---|
| `DocumentHeader` (detalle · formulario) | `DocumentoCabecera.tsx` | `variante`, `tipo` (pone el icono del catálogo), `titulo`, `subtitulo`, `migas`, `estado` (`StatusBadge`), `insignias` (DIAN, DS, origen), `acciones`, `volverA`, `cargando`, `debajo` (cadena o pestañas), `movil`. Es un `PageHeader` |
| `DocumentLinesTable` (lectura · edición · recepción × table · cards) | `DocumentoLineas.tsx` + `documentoLineasLogica.ts` | `lineas: { id, descripcion, sku?, variante?, nota?, seriales?, cantidad, unidad?, precioUnitario, descuento?, impuestos?: { nombre, tarifa?, incluido? }[], total, cantidadRecibida?, cantidadPendiente?, error? }[]`, `modo`, `moneda`, `onCambiar(id, { cantidad \| precioUnitario \| descuento \| cantidadRecibida })`, `onQuitar`, `accionesLinea`, `ocultar` (`sku · descuento · impuestos`), `estado`, `pie` («Buscar producto» · «Ítem manual»). Sobre `DataTable` (tarjetas < lg). **El total de la línea lo recalcula el servicio** |
| `DocumentTotals` (venta · compra · cotización) | `DocumentoTotales.tsx` | lo de `ResumenTotales` + `variante` («Neto a cobrar» / «Neto a pagar»), `pagado`, `saldo`, `titulo`, `accion`, `sinTarjeta`. Bases por impuesto a la vista por defecto |
| `RegistrarPagoDialog` (factura · cuenta · tercero) `730:20644`, P1…P9 `741:53717` | `RegistrarPagoDialog.tsx` + `pago.ts` | **Esqueleto sin negocio**: `destino`, `documento: { tipo, numero, tercero?, total?, saldo, vencimiento? }` o `saldo`, `moneda`, `metodos` (de la organización), `hoy` (día de la organización), `valorInicial`, `onConfirmar(ValorPago)`, `cargando`, `errores` / `error` del servidor, `permitirExcedente`, `codigosEfectivo` (pide «Recibido» y muestra el cambio), `codigosConReferencia`, `avisoCaja` (P6: efectivo sin caja → aviso y «Abrir caja»), `reparto` (FIFO + sobrante, lo arma la pantalla), `camposExtra` (cuota). Valida monto (> 0, ≤ saldo), método, fecha (no futura) y referencia; registrar es de la RPC (`fn_registrar_pago` / `POST /api/pagos`) |

Pruebas: `kit/__tests__/teclado.test.ts`, `datosYTotales.test.ts`, `pagosYDocumento.test.ts`.

### Cobro y post-venta, vista y selectores de tercero

| Figma | Código | Contrato |
|---|---|---|
| `CheckoutAccordion` (closed · open) | `kit/SeccionPlegable.tsx` | `titulo`, `resumen` (lo elegido: «Domicilio · $ 5.000»), `icono`, `atajo` («Alt+D»), `abierta` + `onAbiertaChange` o `abiertaPorDefecto`, `deshabilitada` + `motivo` («Factura electrónica no configurada»). Contenido montado aunque esté plegada. `FormSection colapsable` sigue para formularios sin resumen ni atajo |
| `ViewToggle` `103:3095` (POS-UX-V2 §7.5, decisión final) | `kit/ViewToggle.tsx` + `vistaLogica.ts` | `valor`, `onValorChange`, `opciones` (dos; por defecto Tarjetas `LayoutGrid` \| Lista `Rows3`), `etiqueta`, `corte` (`md`: desde tableta, dos iconos en `radiogroup`; debajo, **un botón que alterna** «Ver como lista» / «Ver como tarjetas»), `modoMovil` (`alternar` · `segmentos`), `tamano`. Mesas: Plano \| Cuadrícula con las mismas props. Sin «Compacta» ni menú |
| Post-venta `247:74846`, sin conexión `247:75030`, móvil `250:83088` | `kit/ResultadoOperacion.tsx` | `tono` (`exito · advertencia · peligro`), `titulo`, `descripcion`, `icono`, `referencia` («V-2144», «OFF-3F2A»), `cifras` (`FilaDato`), `aviso` (recibo enviado, sin impresora), `primaria` / `secundarias` (`{ etiqueta, onClick, atajo?, icono?, deshabilitada?, motivo?, cargando? }`), `onCerrar` (+ `atajoCerrar`, «Esc»). La primaria recibe el foco |
| `CustomerPicker` (10 variantes `849:558484…`) · `SupplierPicker` (`02 › Finanzas`) | `kit/SelectorEntidad.tsx` (base) + `CustomerPicker.tsx` + `SupplierPicker.tsx` + `selectorEntidadLogica.ts` | Base genérica `SelectorEntidad<T>`: `valor`, `aOpcion`, `buscar(texto, AbortSignal)` (**la pantalla busca en el servidor con su servicio**; la búsqueda anterior se cancela), `onCambiar`, `onQuitar`, `onCrear(texto)` («Crear “…”» si nadie se llama así), `onVer`, `onEditar`, `layout` (`fila`: avatar, nombre, documento y «Cambiar · F2» · Ver · Editar · «×» · `campo`: tipo select para filtros y formularios), `atajo`, `grupoExtra` («Espacios ocupados» del PMS), `insigniaValor`, `abierto` / `onAbiertoChange`, `textos`. Popover de 360 en escritorio, hoja inferior en móvil; `listbox` con ↑/↓, Enter y Esc. `CustomerPicker` recibe `cliente: { id, nombre, documento?, correo?, telefono?, pendienteSync? }` (icono `Users`); `SupplierPicker`, `proveedor: { id, nombre, nit?, contacto?, telefono?, saldoPorPagar? }` (icono `Truck`, chip «Por pagar …») |

Pruebas: `kit/__tests__/selectoresYVista.test.ts`.

### Cartera: antigüedad, plan de cuotas y estado de cuenta (CxC y CxP)

Subidas desde las pantallas de CxP (commit `698f9cde`) a pedido de su agente, genéricas para
cliente y proveedor. **CxC debe usarlas** en lugar de `finanzas/cartera/BandaAntiguedad` y
`CrearPlanCuotasDialog` (API compatible: `tramos` en lista, `seleccionado`, `onSeleccionar`,
`cargando`, `frecuencias`). `CampoNumero` se exporta ahora desde `@/components/kit`.

| Figma / captura | Código | Contrato |
|---|---|---|
| Banda de antigüedad (`26-cartera-01`, `26-cartera-08`) | `kit/documento/BandaAntiguedad.tsx` + `carteraLogica.ts` | `tramos` (lista `{ tramo, saldo, cuentas? }` o mapa tramo → saldo), `formatear`, `seleccionado`, `onSeleccionar`, `cargando`, `conTitulo`, `titulo`. Tramos `TRAMOS_ANTIGUEDAD` (al día · 1–30 · 31–60 · 61–90 · > 90). Cada tramo es un botón `aria-pressed` que filtra; la barra es decorativa |
| Plan de cuotas (X1 `740:49675`, `26-cartera-09`) | `kit/documento/PlanCuotasDialog.tsx` | `saldo`, `moneda`, `hoy`, `formatearDia`, `calcular(ParametrosPlan)` (**la función del dominio**: `planCuotas` de compras, `generarPlanCuotas` de cartera), `onConfirmar(plan, parametros)` (su RPC), `cargando`, `error`, `conInteres`, `frecuencias`, `maxCuotas`. Valida cuotas, primera fecha (no anterior a hoy) e interés; muestra la vista previa con total |
| Estado de cuenta (X3 `740:52422`, Y3) | `kit/documento/EstadoCuentaDialog.tsx` | `tercero: { tipo: 'cliente' \| 'proveedor', nombre }`, `datos: { saldoInicial, saldoFinal, vencido, porVencer, totalCargos, totalAbonos, movimientos: { id, dia, tipo (TipoDocumento), documento?, vence?, cargo, abono, saldo }[] }`, `cargando`, `error`, `onReintentar`, `rango` / `onRangoChange`, `hoy`, `moneda`, `formatearDia`, `nombreArchivo` (CSV), `pdf: { onDescargar, onImprimir?, cargando? }` (motor de documentos: el PDF pasa a primario), `secundarios`, `opciones` |

CxP usa las tres: `finanzas/cuentas-por-pagar/PlanCuotasDialog` y `EstadoCuentaProveedorDialog`
quedan como adaptadores (su RPC, su mapeo de datos) y el listado importa `BandaAntiguedad` del kit.

Pruebas: `kit/__tests__/cartera.test.ts`.

### Sin pruebas de render (todavía)

El repo corre jest en `node` y no tiene `@testing-library/react` ni `jest-environment-jsdom`: las
pruebas cubren la lógica de presentación (archivos `*Logica.ts` y afines, sin React). La
recomendación D9 de POS-PLAN (añadirlas solo para los archivos que lo pidan con docblock) sigue
pendiente de la decisión del dueño; no se instaló nada.
## Adenda POS: CartTag, CartLine, ProductCard, CategoryBar (2026-09-24)

Las cuatro piezas de venta del POS que `KIT-COMPARTIDO.md` dejaba pendientes (contrato de POS-PLAN
§3.3; decisiones de POS-UX-V2 D3, D3c, «Ajuste del dueño en `ProductCard`» y §7.5). Construidas una
vez en el kit y **todavía sin adoptar**: las usan los pasos 4 (grilla), 5 (categorías) y 6 (línea del
carrito) del plan, mesas y ventas nueva. Exportadas en `kit/index.ts` dentro del bloque «POS: piezas
de venta». Textos en `kit.carrito`, `kit.producto` y `kit.categorias` (4 idiomas).

**Dinero, una sola forma**: igual que `ResumenTotales`, reciben **números** ya calculados y la
`moneda` (`ContextoMoneda | string`: `useMonedaOrganizacion()` o la del documento) y formatean con
`crearFormateadorMoneda`. Ninguna suma, reparte ni redondea importes; `CartLine` no sabe cómo se
calcula el impuesto de la línea (L25 intacto). Lo único que se calcula es presentación: el «-17 %» de
la comparación (la misma fórmula que `ProductSearch`) y el nivel del stock cuando el servicio no lo da.

| Figma | Código | Contrato |
|---|---|---|
| `CartTag` 237:76837 (neutral · brand · warning · danger · success · info + descuento manual · general · promoción) | `kit/CartTag.tsx` + `cartTagLogica.ts` | `tono` (`neutro · marca · advertencia · peligro · exito · informacion · promocion`), `icono` (lucide; `null` lo quita), `children`, `onClick` (solo entonces es botón), `titulo` (tooltip), `origen` (`manual` rojo con etiqueta · `general` rojo con «%» y «· general» · `promocion` violeta; cada uno con su tooltip por defecto), `anchoMaximo` (px: modificador 190, nota 150), `etiquetaAccesible`, `deshabilitada`, `atajo`. 20 px, Inter 11. Promoción no tiene token: fondo `violet-500/15` con el texto en `text-fg` (sirve en claro y oscuro); pendiente un token `promo` en Figma |
| `CartLine` 241:9682 (simple · extras · foco · recién-agregada · impuesto-excluido · editando-descuento × desktop · mobile) | `kit/CartLine.tsx` + `cartLineLogica.ts` | `linea: { id, nombre, variante?, sku?, miniatura?: ReactNode, cantidad, unidad?, precioUnitario, total, impuesto: { modo: 'encima' \| 'incluido' \| 'excluido' \| 'sinAsignar', importe? } }`, `moneda`, `etiquetas: ReactNode[]` (las arma la pantalla con `CartTag`), `incluido` + `onIncluidoChange` + `incluidoDeshabilitado`, `onCantidad(n)` («−» en 1 pide `0`: la pantalla confirma; el campo no manda ≤ 0 ni vacío), `onNota` + `conNota`, `onExcluirImpuesto`, `onQuitar`, `onAgregarDescuento` + `conDescuento`, `onFoco`, `bloqueada` (espera / deuda), `resaltada` (~1 s, la pantalla la apaga), `enfocada` (anillo), `layout` (`escritorio` · `movil`), `editorDescuento`, `editorNota`, `accionExtra` («⋯», D6), `atajos`, `tabIndex`, `ref` (raíz). Texto del impuesto: «+$X impuestos» / «inc. $X impuestos» (verde, solo con importe > 0) / «Sin impuesto» (ámbar, excluido) / «Sin impuesto asignado». Con el impuesto excluido añade la etiqueta «Sin impuesto (excluido)», el botón T queda `aria-pressed` y «Incluido» se deshabilita (como hoy). `role="group"` con el nombre del producto; acciones con `aria-keyshortcuts` (− + N T Supr D) y tooltip «Quitar (Supr)». **No escucha el teclado**: la pantalla registra los atajos de la línea con foco en `useAtajos` |
| `ProductCard` variante `pos` (md · sm) y `ProductCardMovil` (tarjeta · lista) | `kit/ProductCard.tsx` + `productCardLogica.ts` | `producto: { id, nombre, precio: number \| null, precioComparacion?, sku?, stock?: 'sinSeguimiento' \| { nivel?, cantidad? }, agotado?, variantes?, modificadores?, personalizable?, detalle?, top?, favorito?, receta? }`, `moneda`, `variante` (`pos` · `movil-tarjeta` · `movil-lista`), `tamano` (`md` · `sm`, solo `pos`), `imagen` (ranura: el POS pasa `CachedProductImage`; respaldo `MarcadorSinFoto`, icono + inicial), `onElegir`, `onFavorito` + `favoritoCargando`, `onReceta`, `enfocada`, `tabIndex`, `onFocus`, `onKeyDown`, `ref` (control principal), `etiquetaElegir`. Insignias: «-17 %» arriba-izquierda, estrella 28 × 28 arriba-derecha (24 en `sm`; tooltip «Marcar como favorita» / «Quitar de favoritas»), «Top» con llama abajo-izquierda (no en `sm`; tooltip «{n} unidades vendidas en los últimos 90 días»; en la lista, llama en la miniatura) y «Agotado» centrado sobre la imagen atenuada. Stock: punto verde · ámbar (≤ 5) · rojo. Un solo control principal («Elegir {nombre}» / «+»); el clic en la tarjeta hace lo mismo; estrella y receta no agregan. Agotado y «Sin precio» (B-14) quedan `aria-disabled` (enfocables para la grilla) y no eligen |
| `CategoryBar` (chips · imágenes · combobox, estrella, Top) | `kit/CategoryBar.tsx` + `categoryBarLogica.ts` | `categorias: { id, nombre, color?, imagen?, conteo?, favorita?, top? }[]` (en el orden que decida la pantalla), `valor: id \| null \| 'favoritas'`, `onValorChange`, `modo` (`chips` · `imagenes` · `combobox` = `pos_categories_display` buttons · images · searchselect), `onFavorita(id)`, `mostrarFavoritas`, `conteoTotal`, `etiqueta`. `radiogroup` con una parada de tabulador; ← → Inicio Fin mueven y eligen; la estrella de la categoría elegida entra en el tabulador. Recorte con chevrones y arrastre (`useDragScroll`). El color de la categoría es un dato (estilo en línea); sin color, punto neutro: la paleta de respaldo de `CategoryFilterBar` (hex) no se copió al kit, el adaptador del paso 5 puede pasarla en `color` |

Pruebas: `kit/__tests__/piezasVentaPos.test.ts` (lógica) y `renderPiezasVentaPos.test.tsx` (render
con jsdom: roles, nombres, clics, `aria-keyshortcuts`, inglés).
