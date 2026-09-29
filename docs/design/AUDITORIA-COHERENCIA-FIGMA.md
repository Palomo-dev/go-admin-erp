# Auditoría de coherencia del archivo Figma: buscador, filtros, menús, estados y selección

Fecha: 2026-09-24 · Archivo: «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`)

Origen: el dueño, con capturas, pidió que **todas las pantallas usen el mismo buscador, el
mismo manejo de filtros, los mismos menús y los mismos componentes**. Puso tres casos:
Impuestos, Seriales y el traslado TR-0041. El coordinador añadió después la regla (i),
la barra de selección masiva, y habilitó la página `11 CRM`.

Norma aplicada: `PATRONES-TRANSVERSALES.md` (§1 BulkActionBar, §2 Pagination, §3 buscador y
filtros, §4 PageHeader, §6 menú «⋯», §7 estados, §11 capas flotantes, §12 sobrescribir al
instanciar) y `KIT-CODIGO.md`. Referencia visual aprobada: «Escritorio / Proveedores — listo»
(`589:311645`) y «Móvil / Proveedores — listo» (`590:107380`).

Capturas: `docs/design/figma/55-coherencia-*.png`.

---

## 1. Método

Un script por página, de solo lectura, recorre cada frame de pantalla: escritorio de al menos
1200 × 600 y móvil de 360 a 430 de ancho, hijo directo de una sección. Sobre cada frame busca:

| Regla | Qué detecta el script |
|---|---|
| (a) | Texto «Buscar…» o lupa (`Icon/Search`) que no está dentro de `SearchBar`, `SearchInput`, `SearchTrigger`, `SearchCommand`, `PosProductSearch` ni `SearchSelect` |
| (b) | Listado con buscador y sin `FilterButton` visible |
| (c) | En la fila horizontal del buscador, cualquier nodo que no sea `SearchBar`, `FilterButton` o `SortMenu` |
| (d) | Móvil: cabecera con `MoreVertical`/`MoreHorizontal` como acción principal de un listado, o botón «Nuevo…» flotante |
| (e) | Menú abierto sin `MenuItem`, `MenuItem` sin ícono, destructiva sin `State=destructive`, destructiva sin divisor antes; y, en la segunda pasada, menú dibujado como `FRAME` en lugar de `PopoverCard` + `MenuItem` |
| (f) | Listado sin instancia de `PageHeader` (o `MobileHeader` en móvil) |
| (g) | Por sección y base de nombre, los estados que faltan. Escritorio: listo, cargando, vacío, sin resultados, error y sin permiso. Móvil: listo, cargando y vacío. Se infieren del nombre y del contenido: `Skeleton` es cargando, y `EmptyState Variant=empty/search/error/forbidden` da el resto |
| (h) | «4.368» fuera de productos, paginaciones con «175» páginas copiadas, y vacíos con cifras en el subtítulo |
| (i) | Texto «N seleccionad…» fuera de `BulkActionBar`, y `BulkActionBar` que no está al pie (escritorio) o que no sustituye a la `MobileTabBar` (móvil, `y = alto − 74`) |

Alcance: páginas `03`, `04`, `05`, `06`, `07`, `08`, `09` y `10`, y la `11` solo para la regla (i).
`01 Sistema` y `02 Componentes` son kit, no pantallas. `99 Descartes` queda fuera.
`09 Documentos` no tiene frames con tamaño de pantalla: son documentos impresos.

Pantallas recorridas: 03 → 118 · 04 → 476 · 05 → 194 · 06 → 40 · 07 → 137 · 08 → 117 ·
10 → 41 · 11 → 126.

### Excepciones que el script marca pero no son defecto

| Caso | Motivo |
|---|---|
| POS (`05 › Cabecera y caja`, `Buscador y grid`, `Carrito`, `Cobro`, `Escritorio — POS`, `Móvil v2`): sin `PageHeader`, sin «Filtros», con `ViewToggle`, `Select` y `IconButton` en la fila de `PosProductSearch` | El POS tiene cabecera y buscador propios (§4: «POS no lleva migas»). El buscador del POS es un componente del kit |
| `ViewToggle` junto a «Filtros» en el catálogo de productos (15 frames) | Patrón aprobado de Productos |
| `SegmentedControl`, `DateRange`, «Exportar» y la marca «Nuevo» en la fila del buscador de Cajas | Patrón aprobado de Cajas |
| «4.368 productos» en Inicio › módulo Inventario (03) y en «Importar con IA» (04) | Es la cifra correcta: son productos |
| «Buscar producto» como etiqueta de `Button` en las líneas de factura u orden | Es un botón, no un buscador |
| Selector de organización, `OrgSwitcher` y `Ctrl+K` (03, 08) | Son popovers o paleta de comandos, no listados |
| «Antes · barra masiva ARRIBA» (`426:196285`, 08) | Es el ejemplo «antes» del patrón |
| «Móvil / Catálogo — selección» (`121:15380`): el contador va en la cabecera | Patrón aprobado de Productos |
| Subtítulos con fecha, como «Turno del 22 de septiembre» o «Cliente desde 14 mar 2024» | No es una cifra de la entidad |

---

## 2. Resumen por tipo

Cuentas de problemas reales, sin excepciones ni falsos positivos.

| Regla | Encontrados | Arreglados | Pendientes |
|---|---:|---:|---:|
| (a) buscador a mano | 8 frames + 4 componentes de dominio | 0 | 8 frames + 4 componentes |
| (b) listado sin «Filtros» | 7 | 7 | 0 |
| (c) cosas en la fila del buscador | 36 | 25 | 11 |
| (d) «⋮» en la cabecera móvil o botón flotante | 24 | 24 | 0 |
| (e) menú sin divisor antes de lo destructivo | 21 | 21 | 0 |
| (e) menú dibujado como `FRAME` en vez de `PopoverCard` | 73 | 73 | 1 (dentro de una hoja) |
| (f) listado sin `PageHeader` | 39 | 26 | 13 |
| (g) grupos de listado con estados que faltan (82 detectados; 57 reales sin POS, popovers, ejemplos «antes» ni frames de menús) | 57 | 3 (Impuestos escritorio y móvil, Seriales escritorio) | 54 |
| (h) «4.368» copiado | 7 | 7 | 0 |
| (h) paginación con «175» páginas copiada | 70 | 70 | 0 |
| (h) vacío con cifras en el subtítulo | 18 visibles + 10 latentes | 28 | 0 |
| (i) barra masiva fuera del pie o hecha a mano | 7 | 7 | 0 |

«Latente» quiere decir que la propiedad `Subtítulo` del `PageHeader Layout=mobile` conservaba
«Sucursal Principal · 4.368 productos · cargando 1.000 de 4.368», copiada del catálogo, aunque
en pantalla se lea el subtítulo del `MobileHeader` anidado. Se sincronizaron las dos en 74
instancias: 67 en `04` y 7 en `06`.

---

## 3. Los tres casos del dueño: arreglados

### 3.1 Impuestos (`07 › Impuestos`, sección `195:12716`)

Se rehízo sobre el patrón de Proveedores, clonado del aprobado: `PageHeader` list con
«Finanzas › Impuestos», ícono `Percent` y acciones «Nuevo impuesto» (`Plus`) + «⋯». La fila
del buscador lleva solo `SearchBar` + `FilterButton`, con los chips debajo cuando hay filtros.
Tabla, `Pagination` («Mostrando 1–5 de 5 impuestos», una página) y `EmptyState` por variante.
En el menú lateral queda activa Finanzas. La coma decimal va en «ICA 0,966%».

| Estado | Nuevo | Sustituye a (en 99) |
|---|---|---|
| Escritorio listo | `830:526193` | `195:12718` |
| Escritorio cargando | `830:527282` | `432:17284` |
| Escritorio vacío (primer paso: «Cargar plantilla de Colombia» · «Nuevo impuesto») | `830:527981` | `432:17914` |
| Escritorio sin resultados (chip «Estado: Inactivos», «Limpiar filtros») | `830:528316` | — (faltaba) |
| Escritorio error | `830:528695` | `432:18501` |
| Escritorio sin permiso | `830:529055` | — (faltaba) |
| Escritorio menú «⋯» de fila (`PopoverCard` + `MenuItem`: Editar · Duplicar · Hacer predeterminado · Desactivar · divisor · Eliminar en rojo; anclado 4 px bajo el «⋯» de la fila) | `830:529376` | menú `513:262118`, que estaba anclado a la cabecera y sin divisor |
| Móvil listo («+» en la cabecera, sin botón flotante; buscador + «Filtros»; `ListCard`) | `830:534553` | `195:13425` |
| Móvil cargando · vacío · error · sin permiso | `830:535195` · `830:535337` · `830:535436` · `830:535524` | — (faltaban) |
| Móvil hoja de acciones | `830:535609` | — |

Qué desaparece:
- El texto «5 impuestos · 4 activos · 1 predeterminado» metido en la fila del buscador.
- La fila vieja de título con el botón montado sobre su ícono (`195:13099`).
- La paginación «1–25 de 4.368», con 175 páginas.
- El badge «Nuevo» dentro de la cabecera de la tabla.
- El «⋮» de la cabecera móvil y el botón flotante «Nuevo Impuesto».

Impuestos es de ámbito de organización, así que no lleva estado «sin sucursal».

### 3.2 Seriales (`04 › Existencias — Seriales`, sección `590:319444`)

- **Subtítulo coherente.** El vacío `590:320830` decía «102 seriales» sobre una tabla vacía.
  Ahora dice «Mi empresa S.A.S. · cada unidad con su historia, de la compra a la garantía».
- **Estado que faltaba en escritorio:** sin resultados, `831:533128`: buscador con «AX9-00»,
  «Filtros 1», chip «Estado: En garantía» + «Limpiar todo» y `EmptyState` search.
- **Móvil rehecho con el patrón aprobado.** Antes tenía barra de estado falsa, `MobileHeader`
  suelto y tarjetas `Tarjeta · serial` dibujadas a mano. Ahora usa `PageHeader` móvil sin «+»,
  porque los seriales no se crean aquí, `BranchBadge`, buscador + «Filtros», `ListCard` y
  paginación compacta:

| Estado | Nuevo | Sustituye a (en 99) |
|---|---|---|
| listo | `831:533562` | `591:113373` |
| cargando | `831:534239` | `591:113843` |
| vacío | `831:534394` | `591:114055` |
| error | `831:534507` | `591:114279` |
| sin permiso | `831:534608` | `591:114485` |
| sin sucursal asignada (`EmptyStateSinSucursal`, badge «Sin sucursal») | `831:534706` | `591:114650` |
| sin resultados | `831:534828` | — (faltaba) |
| hoja de acciones (mismas opciones que el menú «⋯» de escritorio) | `831:535144` | — |

### 3.3 Traslado TR-0041 (`04 › Existencias — Traslados`, sección `589:304083`)

- La cabecera `DocumentHeader`, con botones de 32 px y «⋮», pasa a **`PageHeader Variant=detail`**,
  la misma del detalle de proveedor. Lleva migas «Inventario › Traslados › TR-0041», ícono
  `ArrowLeftRight`, `BadgeEstadoTraslado` «En tránsito», «Imprimir guía» (`Printer`, secundaria),
  «Recibir» (`PackageCheck`, primaria) y «⋯», todos de 40 px.
- El menú «⋯» deja de ser un `FRAME` con etiquetas partidas en dos líneas. Ahora es
  **`PopoverCard` + `MenuItem`**: «Ver en el kardex» (`History`), «Ver trazabilidad del lote»,
  divisor, y «Devolver al origen» (`Undo`) en rojo. Va alineado al borde derecho del «⋯», 4 px
  debajo.

| Frame | Nuevo | Sustituye a (en 99) |
|---|---|---|
| detalle (en tránsito) | `831:535830` | `589:319676` |
| menú «⋯» abierto | `831:536248` | `589:322534` |

---

## 4. Arreglos en lote (resto de la auditoría)

### 4.1 Menús → `PopoverCard` + `MenuItem`, con divisor antes de lo destructivo

Hay 73 menús abiertos que estaban dibujados como `FRAME`. Pasaron a `PopoverCard` (`11:271`),
con los mismos `MenuItem` en el slot, y se insertó un divisor antes de la acción destructiva en
21 de ellos. Los nuevos ids:

- **04:** 41 menús; los ids nuevos van de `833:545184` a `833:549384`. Llevan divisor nuevo
  los menús de `180:743`, `180:1628`, `194:10371`, `194:12856`, `196:13753`, `453:230170`,
  `516:269638` y `609:375912`.
- **05:** 13 menús (`833:91863` … `833:93159`). Divisor nuevo en `329:112636`, `332:40219`,
  `449:212518`, `454:230289` y `460:235205`.
- **06:** 3 menús (`833:544762`, `833:544906`, `833:545027`). Divisor en `323:47888`.
- **07:** 8 menús (`832:538101` … `832:538920`), con divisor en 7.
- **08:** 6 menús (`833:544074` … `833:544591`), con divisor en 4.

### 4.2 Cabecera móvil: «+» y no «⋮»; sin botones flotantes

- Se cambió el ícono de la acción del `MobileHeader` por `Plus` en `331:54670` (ventas),
  `352:52834`, `352:53110`, `352:53228` (cajas), `449:213400`, `449:213743` (mesas),
  `458:83965`, `458:84289` (cupones y promociones), `460:236384` (cargos),
  `421:171523`, `424:174849` (facturas), `375:13247`, `375:13816`, `426:191646`,
  `426:191818` y `426:192082` (08).
- Se ocultó la acción donde no se crea nada desde la lista: `448:220707` (pedidos online),
  `449:214437` y `452:222283` (cuentas por cobrar y por pagar).
- Los botones flotantes «Nueva» de `11 CRM` se ocultaron y su acción pasó a la cabecera:
  `771:37311`, `775:471491` y `812:54748`.

### 4.3 «Filtros» añadido a listados móviles

Se añadió `FilterButton` a la fila del buscador en `449:213400`, `449:213743`, `458:83965`,
`375:13247`, `375:13816` y `426:192082`.

### 4.4 Fila del buscador limpia

- **Facturas de venta y de compra, 13 frames.** Salieron de la fila del buscador el contador
  «Mostrando 1–5 de 32 facturas», «Cargando…», «Sin resultados», «—» y «2 de 32
  seleccionadas»: `421:167503`, `421:168188`, `421:168577`, `421:168957`, `421:169277`,
  `421:170009`, `421:170742`, `424:172220`, `424:172906`, `424:173295`, `424:173675`,
  `424:173995` y `441:190732`.
- **08.** El botón primario repetido en la fila del buscador pasó al `PageHeader`: «Invitar
  persona» en `364:155413`, `364:155855` y `364:156303`; «Nueva sucursal» en `374:25874`,
  `374:26709` y `374:27524`; «Nueva organización» en `374:29846`; «Añadir dominio» en
  `374:30237`.

### 4.5 `PageHeader` del kit en listados que lo tenían dibujado a mano

26 frames de `07` cambiaron el bloque «Identidad + acciones» por `PageHeader Variant=list`.
Se conservan las migas aparte, así que se ocultan las internas (§4: nunca dos filas de migas).
Cuando había dos acciones secundarias, la segunda va al «⋯»: «Exportar» en facturas, «Exportar
CSV» en cuentas por cobrar y «Exportar a banca» en cuentas por pagar.

- Facturas de venta: `421:167503`, `421:168188`, `421:168577`, `421:168957`, `421:169277`,
  `421:170009` y `421:170742`.
- Facturas de compra: `424:172220`, `424:172906`, `424:173295`, `424:173675`, `424:173995`
  y `441:190732`.
- Cuentas por cobrar: `448:201605`, `448:209446`, `448:210159`, `448:210800`, `448:211447`,
  `448:219087` y `449:207127`.
- Cuentas por pagar: `451:220244`, `451:221070`, `451:221651`, `451:222286`, `451:222933`
  y `451:223594`.

### 4.6 Cifras copiadas (h)

- **«Seleccionar los 4.368».** Pasa al total de cada dominio: 784 en cuentas por cobrar
  (`448:211447`), 55 en cuentas por pagar (`451:222933`) y 1.302 en la bandeja DIAN
  (`735:34957`).
- **«Mostrando 1–25 de 4.368».** En facturas de venta y de compra cargando (`421:168188`,
  `424:172906`) pasa a «Cargando…».
- **Paginación con la última página «175» u otra cifra heredada.** Se recalculó desde su propio
  resumen en 70 paginaciones. En `07` hay 21: facturas de venta 175 → 7, de compra 175 → 5,
  cuentas por cobrar 175 → 131, cuentas por pagar 175 → 10, bandeja DIAN 175 → 186, documentos
  soporte 175 → 3, notas 175 → 7 y cotizaciones 175 → 8. En `05` hay 12, en `06` 1, en `08` 9 y
  en `04` 27, entre ellas kardex 4 → 16, stock 52 → 214, movimientos 217 → 677, lotes 6 → 30 y
  seriales 5 → 17. Cuando hay cuatro páginas o menos, se ocultan los botones sobrantes y el «…».
- **Vacíos con cifras en el subtítulo.** Se quitó el segmento «N entidades» en 17 frames de `04`,
  los de órdenes de compra, kardex, lotes, stock, movimientos, categorías, ajustes, traslados,
  proveedores, etiquetas, unidades, conversiones, recetas, costo de recetas, producción y
  distribución, además del de Impuestos (`07`) y el de Seriales.

### 4.7 Selección masiva (i)

- **`11` Oportunidades — selección masiva, `773:24723`.** La franja «Barra de selección»,
  arriba de la tabla, pasa a una **`BulkActionBar Layout=desktop` flotante al pie, centrada
  sobre la columna** (`845:82593`): «3 seleccionadas» · «Seleccionar las 23» · Mover de etapa
  · Asignar responsable · Marcar perdida · «⋯» (donde queda Exportar) · Eliminar · ×.
- **`11` Pipeline — vista Tabla con selección, `768:459368`.** El mismo cambio (`845:82659`).
- **`11` Móvil / Leads — selección masiva, `768:7203`.** La barra pasa a `y = 770` y sustituye
  a la `MobileTabBar`, que se oculta.
- **`11` Móvil / Oportunidades — selección masiva, `845:82719`.** Frame nuevo:
  `OpportunityCard` con la casilla marcada y `BulkActionBar Layout=mobile` en lugar de la barra
  inferior. Para dibujarlo, el kit ganó en `OpportunityCard` (`759:22188`) la propiedad
  booleana **`Selección`**, que muestra un `Checkbox` en `Densidad=lista`.
- **`07` Cuentas por cobrar y por pagar — selección.** En `448:211447` y `451:222933` la
  `BulkActionBar` estaba dentro del flujo, arriba, y con las acciones de productos: «Precios ·
  Stock · Categoría · Estado». Ahora flota al pie con las acciones del dominio:
  - Cuentas por cobrar: Enviar recordatorio · Registrar abono · Exportar · Dar de baja.
  - Cuentas por pagar: Programar pago · Registrar pago · Exportar a banca.
- **`11` Menú lateral.** En los cuatro frames de «Ficha del cliente» de la sección de leads y
  actividades (`772:19838`, `772:20628`, `772:20971` y `772:21523`), el ítem activo pasa de
  «Clientes» a «CRM».

---

## 5. Pendientes, por prioridad

### 5.1 Estados que faltan en listados (g)

| Página › sección | Frame base | Faltan |
|---|---|---|
| 07 › Facturas de venta y de compra (escritorio) | `421:167503`, `424:172220` | sin resultados, sin permiso |
| 07 › Facturas de venta y de compra (móvil) | `421:171523`, `424:174849` | cargando, vacío |
| 07 › Cuentas por cobrar y por pagar (escritorio) | `448:201605`, `451:220244` | sin resultados, sin permiso |
| 07 › Cuentas por cobrar y por pagar (móvil) | `449:214437`, `452:222283` | cargando, vacío |
| 07 › Documentos: resoluciones, bandeja DIAN, soporte, notas y cotizaciones | `733:32327`, `735:33548`, `736:37084`, `738:41960`, `739:45974` | cargando, vacío, error, sin permiso |
| 04 › Catálogo de productos | `117:8746` | vacío, error, sin permiso |
| 04 › Móvil — productos | `121:14530` | vacío |
| 04 › Órdenes de compra | `453:44064` · móvil `458:236527` | sin resultados, sin permiso · cargando, vacío |
| 04 › Existencias: traslados, garantías y ajustes | `589:304084`, `592:329723`, `586:303291` | sin resultados |
| 04 › Kardex, lotes, stock, movimientos y categorías | `516:270498`, `518:59166`, `582:277572`, `586:286575`, `586:290670` | sin permiso |
| 04 › Conversiones (móvil) | `595:346655` | cargando, vacío |
| 05 › Ventas (móvil) | `331:54670` | cargando, vacío |
| 05 › Cajas | `351:48914` · móvil `352:52834` | sin resultados, sin permiso · cargando |
| 05 › Mesas | `448:216546` · móvil `449:213400` | sin resultados, sin permiso · cargando, vacío |
| 05 › Promociones y cupones | `454:228254`, `458:82437` · móvil `458:83965`, `458:84289` | sin resultados, sin permiso (y, en cupones, cargando y error) · cargando, vacío |
| 05 › Cargos de servicio | `460:235205` · móvil `460:236384` | cargando, sin resultados, error, sin permiso · cargando, vacío |
| 05 › Pedidos online (móvil) | `448:220707` | cargando, vacío |
| 06 › Catálogo de clientes | `321:2835` | sin resultados, sin permiso (por verificar: puede estar con otro nombre) |
| 08 › Miembros, invitaciones, sucursales, mis organizaciones y dominios (escritorio y móvil) | `364:153895`, `364:156303`, `374:25874`, `374:29846`, `374:30237`, `375:13247`, `375:13816` | cargando, vacío, sin resultados, error, sin permiso · móvil: cargando, vacío |
| 08 › Sección 14 (miembros, invitaciones y sucursales) | `426:185089`, `425:181675`, `426:190255` | los mismos |

La receta es la que se usó en Impuestos: clonar los estados de Proveedores y sobrescribir los
textos (§12).

### 5.2 `PageHeader` a mano que el conversor no reconoció (f)

La cabecera no tiene la estructura «Identidad + acciones», así que se convierte a mano:

- `08`: `424:176043`, `425:181675`, `425:182202`, `425:182767`, `425:183298`, `426:185089`,
  `426:185627`, `426:186192`, `426:190255`, `426:190765`, `396:15413` y `396:15576`.
- `03`: `465:241434`, Analítica web.

### 5.3 Fila del buscador (c)

- **Detalle de producto › Seriales.** `187:49749`, `187:52188`, `187:52765` y `187:53324`
  llevan `Select` de estado, una marca «Nuevo», un espaciador y «Exportar» en la fila del
  buscador. El estado va al `FilterPanel`; «Exportar», a la cabecera de la pestaña.
- **`08`, sección 14.** «Nueva Sucursal» y un `Badge` siguen en la fila del buscador de
  `426:190255` y `426:190765`, porque estos frames no tienen `PageHeader` (5.2). Hay además un
  `Badge` en la fila de `426:185089`, `426:185627`, `426:186192` y `426:192082`.

### 5.4 Buscadores a mano (a)

| Tipo | Dónde |
|---|---|
| En la pantalla | Detalle de producto › Proveedores y etiquetas: el input «Buscar Etiquetas» con lupa suelta, en `194:12856`, `194:14113`, `609:375912` y, en móvil, `194:13452`. Configuración › POS: `199:73152` y `199:74255`. Cotización nueva: `739:51270`. Hoja de nueva reserva: `452:227123` |
| Dentro de componentes de dominio | `ProductPicker`, `SupplierPicker`, `CustomerPicker` y `ConfigNav`, este con 30 apariciones en `10`. Se corrige una vez en cada componente, cambiando su input por `SearchBar Size=sm` |

### 5.5 Otros

- `426:192410` (`08`, hoja «Asignar gerente»): el menú vive dentro de una instancia y no usa
  `MenuItem`.
- `773:24723` (`11`): la tabla sigue por debajo del borde del frame y la paginación queda oculta.
  No se agrandó el frame porque chocaba con `773:25278`.
- `449:214437` y `452:222283` (`07`, móvil): dos textos de la última tarjeta pasan del borde
  inferior. Ya estaba así antes de esta tanda.
- En `11` solo se auditó la regla (i). Hay que correr allí las reglas (a) a (h).
- `OpportunityCard`: en el componente principal, la casilla que se añadió mide 143 de ancho,
  aunque en las instancias es de 18. Queda ajustarla a `HUG`.

---

## 6. Verificación de lo tocado

Hecha por script sobre los frames nuevos o editados de `04`, `07` y `11`:

- 0 nodos sueltos fuera de sección en las páginas tocadas.
- 0 solapes entre frames de una misma sección.
- 0 instancias rotas.
- 0 anotaciones dentro de frames: las notas van fuera, 12 px, pizarra.
- Truncados: solo los intencionales de `ListCard` y `OpportunityCard`, con elipsis.

---

## 7. Segunda pasada (2026-09-24): se cortó al agotarse el cupo del MCP de Figma

### 7.1 Cerrado en el kit (`02 Componentes`)

- **(4) Buscadores propios de los selectores.** El campo hecho a mano (lupa + texto) se cambió
  por la instancia del kit `SearchBar`, que en código es `kit/SearchInput`. Donde había
  escáner se activa «Mostrar escáner». En los estados de escritura o apertura se usa
  `State=focus`, y en los de carga, `State=loading`.
  - `ProductPicker`, variantes combobox cerrado y abierto: `849:558442` y `849:558463`.
  - `CustomerPicker`, sus 10 variantes: de `849:558484` a `849:558672`.
  - `SupplierPicker` ya usaba `SearchBar` en el popover. Su `Layout=field` es un campo de
    selección (ícono de camión y chevron), no un buscador, y se deja igual.
  - **Sin verificar con captura:** el cupo se acabó justo después del cambio. Hay que revisar
    que las instancias en pantallas no hayan saltado de alto: el combobox pasó de 22 a 40 px.
- **(6) `OpportunityCard`.** La casilla del componente principal pasa de 143 a 18 de ancho, en
  `759:22062` y `759:22125`.
- **(8) `Sidebar`** (`44:3039`). Ganó el ítem propio «Proyectos y tareas», con el ícono
  `FolderKanban` (`830:533261`), en el grupo Gestión y después de Reportes, en sus tres modos:
  rail `849:558693`, expanded `849:558713` y drawer `849:558747`. **Queda por hacer:**
  activarlo en las pantallas de `12 PM y tareas` y devolver «Reportes» a su etiqueta y su ícono
  donde el agente de PM lo había reutilizado.

### 7.2 Pendiente de la segunda pasada

No se empezó por falta de cupo:

1. Los 54 listados de §5.1 sin algún estado.
2. Las 13 cabeceras hechas a mano: 12 en `08` y `465:241434` en `03`.
3. La fila del buscador en la pestaña Seriales del detalle de producto, y los badges y «Nueva
   Sucursal» en `08`.
4. `ConfigNav` (`10`): su buscador sigue siendo propio.
5. La paginación de `773:24723`, que queda bajo el borde, y el frame `773:25278` que hay que
   mover para agrandarlo.
6. Las reglas (a) a (h) sobre `11 CRM` y `12 PM y tareas`.
7. El menú lateral en las pantallas de `12` (ver 7.1).

---

Los frames sustituidos están en `99 Descartes`, sección «SUSTITUIDO 2026-09-24 · coherencia»
(`830:526192`), con ese prefijo en el nombre. Son `195:12718`, `432:17284`, `432:17914`,
`432:18501`, `195:13425`, `591:113373`, `591:113843`, `591:114055`, `591:114279`,
`591:114485`, `591:114650`, `589:319676` y `589:322534`, y las anotaciones viejas `195:13424`,
`513:262164`, `195:14520` y `195:13698`.
