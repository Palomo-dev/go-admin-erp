# POS — Mesas: cuadrícula y plano (vista elegida y guardada, edición del plano)

Fecha: 2026-09-23. Alcance: `/app/pos/mesas` (vistas, filtros, edición del plano) y su enlace con
`/app/pos/mesas/[id]`. Solo lectura de código; la base se consultó con el MCP de Supabase (proyecto
`jgmgphmzusbluqhuqihj`, solo `SELECT`, agregados sin identificar organizaciones). Rutas relativas a
`src/` salvo que se indique.

Pedido del dueño: «En la página de Mesas falta estructura. Que el usuario elija entre tarjetas y
mapa y que **se quede guardada** la que prefiere. Van a haber **muchas** mesas: las tarjetas deben
ser más pequeñas en alguna de las dos vistas. Configurar mesas por **zonas**, **ubicación** y
**rotación**, con el manual de marca y bien estructurado, en ambas vistas».

Antecedentes que este documento **no repite** y da por leídos: `POS-MESAS-COMANDAS-RESERVAS.md`
(flujo reserva → cobro, hallazgos M1–M10, cambios de BD §7) y `POS-CARRITO-LINEAS-NOTAS.md`
(líneas, notas y rondas de la mesa). Aquí solo va lo nuevo: **vistas, densidad, preferencia por
usuario, zonas y edición del plano**. Los hallazgos nuevos llevan **(nuevo)**.

---

## 0. Resumen para el dueño

1. **Hoy hay dos vistas, pero no una estructura.** «Lista» y «Mapa» son dos pantallas distintas
   que comparten la cabecera: la Lista tiene filtros, acciones y paginación; el Mapa no tiene ni
   filtros ni acciones, **pero sigue aplicando los filtros que dejaste puestos en la Lista** sin
   mostrarlos (nuevo). La vista elegida no se guarda: cada visita arranca en «Lista»
   (`app/app/pos/mesas/page.tsx:93`).
2. **Las tarjetas no escalan.** Tarjeta de ~200 × 130 px, 5 por fila y **paginación de 20**: con 60
   mesas son 3 páginas, y como la agrupación por zona se hace sobre la página, una zona queda
   partida entre páginas. Propuesta: **sin paginación**, agrupado por zona, y dos densidades
   (cómoda 180 × 120 y **compacta 104 × 72**). Con compacta, 60 mesas en 4 zonas caben en una
   pantalla de escritorio.
3. **La tarjeta pequeña va en la Cuadrícula, no en el Plano.** En el Plano el tamaño de la mesa lo
   da el salón real (forma, tamaño y rotación) y el zoom; achicarla falsea el salón. En la
   Cuadrícula el objetivo es escanear muchas mesas: ahí gana la densidad.
4. **La zona no existe como dato**: es un texto dentro de cada mesa. Una zona sin mesas no se puede
   crear, renombrar una zona no renombra su recuadro del plano y, en «Todas las sucursales», dos
   zonas «Terraza» de sucursales distintas se funden en una (nuevo). Propuesta: tabla
   `restaurant_zones`.
5. **La forma de la mesa no se puede elegir**: se deduce de la capacidad (2 personas = redonda,
   más = rectángulo) y el tamaño también (nuevo). La rotación va en pasos de 15° con un solo botón,
   sin deshacer; en la base ya hay mesas a 45° y a 75°. Propuesta: forma, tamaño y rotación
   editables (0/90/180/270 con un toque, libre con campo), rejilla, alinear, duplicar y deshacer.
6. **Cualquiera puede mover el plano**: no hay permiso ni en la pantalla ni en la base (la RLS deja
   escribir `restaurant_tables` a cualquier miembro). Propuesta: permiso `pos.tables.manage`
   resuelto en el servidor, y guardado del plano en **una** RPC transaccional (hoy son N `UPDATE`
   sueltos desde el navegador, uno por mesa).
7. **La preferencia se guarda por usuario en la base** (tabla nueva `user_ui_preferences`) con
   `localStorage` como caché. No en `localStorage` solo, porque las tablets y la caja se comparten
   entre usuarios; no en `profiles.metadata`, porque no es por organización y otras funciones ya lo
   reescriben entero (§3.3).

---

## 1. Qué hay hoy (código, con archivo:línea)

### 1.1 Estructura de la página

`app/app/pos/mesas/page.tsx` (1.187 líneas, `'use client'`, 0 `useTranslations`: todo el texto en
español cableado, contra la regla de los 4 idiomas).

| Bloque | Qué hace | Líneas |
|---|---|---|
| Estado de la vista | `const [viewMode, setViewMode] = useState<'list' \| 'map'>('list')` — **no se persiste** | `:93` |
| Cabecera | Volver, título «Plano de Mesas», toggle Lista/Mapa (`bg-blue-600` a mano, no el Azul GO por token), refrescar, «Nueva Mesa» | `:485-534` |
| Vista Mapa | `<MesasFloorMap mesas={mesasFiltradas} …/>` — recibe las mesas **ya filtradas** | `:539-547` |
| Vista Lista | Acciones (Gestionar zonas, Combinar, Mover pedido, Historial), filtros, grid por zona, paginación | `:550-808` |
| Filtros | búsqueda por nombre, `Select` de zona, `Select` de estado **con emojis** 🟢🔴🟠🟡 | `:608-670` |
| Grid | `grid-cols-1 sm:2 md:3 lg:4 xl:5 gap-4`, repetido 3 veces (sin zona, por zona, zona elegida) | `:697`, `:737`, `:766` |
| Paginación | `pageSize` 20; la agrupación por zona se hace **sobre la página** (`mesasPaginadas`) | `:70-71`, `:150-154`, `:691`, `:725` |
| KPI | 4 tarjetas (Libres, Ocupadas, Con cuenta, Total) **al pie**, después de la paginación | `:811-872` |
| Refresco | `isRefreshing` pone **toda la página** en `opacity-60 pointer-events-none` (nuevo): cada refresco bloquea el salón | `:483` |
| Abrir / entrar | Mesa libre → diálogo «Abrir mesa» (comensales); con sesión → `/app/pos/mesas/{id}` | `:386-400` |
| Liberar | `LiberarMesaDialog` (commit `34a45d6d`): con saldo pide resolverlo; «Cobrar ahora» abre `/app/pos/mesas/{id}?cobrar=1` | `:947-959` |

### 1.2 Tarjeta — `components/pos/mesas/MesaCard.tsx`

- `Card` `border-2 p-4 min-h-32`, fondo por estado con `green/red/yellow/orange-50` de Tailwind
  (no tokens), `Badge` con emoji (`:18-29`, `:57-67`).
- Muestra: nombre, zona, «comensales / capacidad personas», tiempo, total con `$` y
  `toLocaleString()` sin locale (`:112`), «N en cocina», aviso «Revisar» a los 45 min cableados
  (`:48`).
- **No muestra** mesero, plato listo, alergia ni saldo; el menú «⋯» y «Pedir cuenta» solo aparecen
  con *hover* (`page.tsx:1113-1133`): en tablet y móvil no existen.

### 1.3 Plano — `components/pos/mesas/MesasFloorMap.tsx` (785 líneas)

| Tema | Hoy | Líneas |
|---|---|---|
| Forma y tamaño | **Deducidos de la capacidad**: ≤2 → círculo 70 × 70; ≤4 → 110 × 80; ≤6 → 130 × 90; resto 150 × 100. No hay columna de forma ni de tamaño (nuevo) | `:51-59` |
| Sillas | Una por unidad de capacidad (capacidad hasta 50 en el formulario → 50 sillas) | `:70-104`, `MesaFormDialog.tsx:182` |
| Rotación | Botón azul «Rotar 15°» por mesa; no hay 90° directo, ni campo, ni deshacer. BD: rotaciones 0, 45, **75** y 90 | `:372-381`, `:759-769` |
| Rejilla | `GRID_SIZE = 20`, *snap* siempre activo, sin forma de apagarlo | `:29`, `:41-43` |
| Zonas | Recuadro calculado por las mesas o `restaurant_zone_layouts`; color por **hash del nombre** sobre 8 hex cableados (cambia de color al renombrar) | `:37`, `:45-49`, `:209-244` |
| Mesas sin posición | Se colocan en 6 columnas según su **índice en la lista filtrada**: la posición inicial depende del filtro y puede caer encima de otra (nuevo) | `:163-168` |
| Zoom / pan | 40 %–200 %; se guarda en `localStorage` con **una clave global** `pos_mesas_floor_map_view`: no es por usuario ni por sucursal, así que al cambiar de sucursal el plano abre desplazado (nuevo) | `:106-150`, `:549-564` |
| Modo edición | Botón «Editar plano» **sin permiso**; salir con cambios sin guardar no avisa y `hasChanges` queda en `true`, lo que **bloquea** la sincronización con la BD hasta recargar (nuevo) | `:515-523`, `:152-157`, `:171` |
| Guardar | Manda **todas** las mesas cargadas (no solo las movidas) | `:420-446` |
| Leyenda | 4 estados con `bg-green/red/orange/yellow-500`; falta «por limpiar» | `:568-573` |
| Interacción | Clic en mesa = abrir/entrar; *tooltip* por *hover* (mesero, tiempo, total, cocina); sin menú «⋯», sin acciones, sin estado vacío | `:415-418`, `:705-733` |

### 1.4 Servicio — `components/pos/mesas/mesasService.ts`

| Tema | Hoy | Líneas |
|---|---|---|
| Carga | 6 consultas desde el navegador (`@/lib/supabase/config`) y cruce en JS | `:17-179` |
| Guardar posiciones | `Promise.all` de **un `UPDATE` por mesa** (30 peticiones en la sucursal más grande), sin transacción: si falla una, el plano queda a medias | `:250-268` |
| Zonas | `DISTINCT zone` de `restaurant_tables`: **una zona sin mesas no existe** → no se puede empezar por «crear zona» | `:503-530` |
| Renombrar / borrar zona | Actualiza `restaurant_tables.zone` pero **no** `restaurant_zone_layouts`: el recuadro se pierde (queda huérfano) (nuevo) | `:535-585` |
| Sucursal | Listar usa `getBranchFilter()` (null = todas); renombrar, borrar y guardar recuadros usan `getCurrentBranchId()` (nuevo): en «Todas las sucursales» se ven zonas de varias sucursales y la acción cae en una sola | `:505` vs `:540`, `:566`, `:309` |
| Posición 0 | `position_x \|\| null` convierte x = 0 en «sin posición» (también `MesaFormDialog.tsx:56-57`) | `:203-204` |
| Crear mesa | Nombre, zona (texto o «+ Nueva zona»), capacidad, sucursal. Ni forma, ni tamaño, ni rotación | `MesaFormDialog.tsx:101-192` |

### 1.5 Detalle de la mesa (enlace con las vistas)

`app/app/pos/mesas/[id]/page.tsx` (1.992 líneas) con `MesaDetailHeader`, `MesaStatsCards`,
`MesaActionsSidebar` (Enviar comanda, Pre-cuenta, Pedir cuenta, Dividir, Cobrar, Liberar:
`components/pos/mesas/id/MesaActionsSidebar.tsx:158-322`) y `LiberarMesaDialog` (`:1981`). La
lógica de pedidos vive en `components/pos/mesas/id/pedidosService.ts` (1.149 líneas). Lo único que
las vistas necesitan del detalle es **entrar** (`/app/pos/mesas/{id}`) y **volver a la misma vista,
zona y scroll**: hoy vuelve siempre a «Lista», página 1.

### 1.6 Preferencias del usuario

- **Ninguna** preferencia de esta pantalla se guarda en la BD. Solo zoom y pan del plano en
  `localStorage` con clave global (§1.3).
- Precedente en el repo: el tema claro/oscuro usa `profiles.metadata.theme_preference` + caché en
  `localStorage` / `@capacitor/preferences` (`lib/services/themeService.ts:29-30`, `:61-84`).
- `profiles.metadata` también lo escriben la firma de correo (`app/api/email/settings/route.ts:54`)
  y la verificación de móvil (`app/api/integrations/twilio/verify/send/route.ts:77`), en ambos casos
  leyendo y reescribiendo el JSON completo.

---

## 2. Qué hay en la base (verificado hoy con el MCP)

### 2.1 Tablas y columnas

| Tabla | Columnas que importan aquí | Observación |
|---|---|---|
| `restaurant_tables` | `id uuid`, `organization_id`, `branch_id` NOT NULL, `name text`, `zone text NULL`, `capacity int DEFAULT 4`, `state`, `position_x int`, `position_y int`, `rotation int DEFAULT 0` | `state` CHECK `free/occupied/reserved`. **Sin** `shape`, `width`, `height`, `zone_id`. **Sin** UNIQUE de nombre por sucursal. **Solo índice de PK**: no hay índice `(organization_id, branch_id)` (nuevo) |
| `restaurant_zone_layouts` | `zone_name`, `position_x/y`, `width` (def. 200), `height` (def. 150) | UNIQUE `(organization_id, branch_id, zone_name)`. Se une a las mesas **por nombre** |
| `table_sessions` | `restaurant_table_id`, `status`, `customers`, `server_id`, `opened_at`, `sale_id` | `status` CHECK `active/bill_requested/completed` |
| `profiles` | `metadata jsonb`, `preferred_language` | No hay tabla de preferencias de interfaz. Existen `user_comm_preferences` (llamadas CRM) y `user_notification_preferences` (canales), ninguna sirve para esto |
| `permissions` | `pos.view/create/void/refund/discount`, `pos_access` | **No** existe permiso de mesas ni de plano. El código usa `pos.manage` (`lib/middleware/permissions.ts:309`, `lib/pos/display/terminalPermissions.ts:14,23`) pero **no hay fila** con ese código: hoy solo lo pasa el admin (nuevo) |

RLS: `restaurant_tables` (ALL) y `restaurant_zone_layouts` (ALL) = «el usuario es miembro de la
organización». Cualquier miembro —mesero incluido— puede mover, rotar, renombrar o borrar mesas y
zonas desde el navegador.

### 2.2 Tamaño real (para dimensionar)

| Dato | Valor |
|---|---|
| Organizaciones con mesas / sucursales con mesas | 9 / 9 (una sucursal por organización) |
| Mesas en total | 70 |
| Máximo de mesas en una sucursal | **30** (org 130) · la segunda: 24 (org 120) · mediana: 4 |
| Máximo de zonas en una sucursal | **3** · máximo de mesas en una zona: **13** |
| Mesas sin zona | 0 |
| Mesas con posición guardada | 67 de 70 · 5 rotadas (45°, 75°, 90°) |
| Capacidades | 2 a 10 |
| Nombre de mesa / de zona más largo | 8 / 11 caracteres |
| Coordenadas usadas | x 1–1.300, y 1–620 |
| Recuadros de zona guardados | 3 (0 huérfanos hoy) |
| Estados | 48 `free` · 22 `occupied` · 0 `reserved` · 23 sesiones abiertas (1 mesa con 2) |

**Dimensionamiento de la propuesta**: se diseña para **60 mesas en 4 zonas** (lo que pidió el
dueño) y se verifica que aguante **150 mesas / 8 zonas** sin paginación. Nombres de hasta 12
caracteres («Terraza 12», «Barra B-04»), zonas de hasta 20.

---

## 3. Propuesta

### 3.1 Estructura de la página

```
PageHeader  «Mesas»  · BranchBadge ·                    [⟳] [⋯ Más] [+ Nueva mesa]*
KpiStrip / LeyendaEstadosMesa (5 estados con conteo; cada uno es un filtro)
ListToolbar  [SearchInput «Buscar mesa…»] [Zona ▾] [Estado chips]   [SelectorVista] [Densidad]
FilterChips (si hay filtros)                                           
──────────────────────────────────────────────────────────────────────────────────────
Cuadrícula: ZonaHeader + MesaCard (por zona, sin paginación)
   ó
Plano: pestañas de zona · lienzo · ControlesPlano (zoom − % + · Ajustar · Editar plano*)
```
`*` solo con permiso. Los filtros, la leyenda y la búsqueda son **los mismos en las dos vistas**
(hoy el Mapa no los muestra pero los aplica). El «⋯ Más» reúne Gestionar zonas, Mover cuenta,
Combinar e Historial (hoy son 4 botones que solo existen en «Lista»).

### 3.2 Las dos vistas

**Selector de vista** (`SelectorVista`, basado en `SegmentedControl` del kit,
`components/kit/SegmentedControl.tsx`): dos opciones con icono y texto — «Cuadrícula»
(`LayoutGrid`) y «Plano» (`Map`); en móvil solo icono con `aria-label`. Es un `radiogroup` con
flechas (ya lo resuelve el kit).

**Cuadrícula** — para operar muchas mesas y en el móvil.
- Agrupada por zona con `ZonaHeader` (nombre, conteo «18 mesas · 6 libres · 9 ocupadas · 3 por
  cobrar», plegar/desplegar). El pliegue se recuerda con la preferencia.
- **Sin paginación.** Hasta 150 mesas se pintan directo; por encima, virtualización por zona
  (`components/kit/virtualizacion.ts`).
- Rejilla fluida `repeat(auto-fill, minmax(ancho, 1fr))`, orden por número natural («Mesa 2» antes
  que «Mesa 10»).
- **Densidad** (`SegmentedControl` pequeño, dos iconos): **Cómoda** y **Compacta**.

| | Cómoda | Compacta |
|---|---|---|
| Tamaño | 180 × 120 (escritorio/tablet), 171 × 120 (móvil, 2 por fila) | 104 × 72 (escritorio/tablet), 110 × 72 (móvil, 3 por fila) |
| Por fila | 1440: 6 · 1024: 4 · 390: 2 | 1440: 10 · 1024: 8 · 390: 3 |
| 60 mesas / 4 zonas | ~3 pantallas de alto | **1 pantalla** en escritorio y tablet |
| Contenido | número, `Badge` de estado, comensales/capacidad, `TiempoTranscurrido`, total, mesero (iniciales + nombre), fila de alertas con texto | número, icono de estado, **un** dato principal según estado, iconos de alerta (máx. 2 + «+1») |
| Para quién | caja y administrador en escritorio | mesero y caja en hora pico; móvil |

**Plano** — para ubicarse en el salón real.
- **Una zona a la vez** (pestañas `TabBar` del kit: «Salón · Terraza · Barra · Segundo piso ·
  Todas»). «Todas» muestra los recuadros de todas las zonas y ajusta el zoom para que quepan.
- Mesas con `MesaPlano` (componente ya creado, `680:410764`) en su **forma, tamaño y rotación
  reales**; sillas solo hasta 12 (a partir de ahí, «×14» en la mesa).
- `ControlesPlano` flotante abajo a la derecha: `−` · `100 %` · `+` · «Ajustar» (encaja la zona en
  pantalla, es lo que se hace al abrir) · en escritorio, pantalla completa. Arriba a la derecha,
  «Editar plano» (solo con permiso).
- Pan con arrastre o dos dedos, zoom con rueda o pellizco (40 %–200 %). El texto de la mesa **no
  rota** con la mesa (se contrarrota) y deja de mostrar la segunda línea bajo 70 % de zoom.
- Tocar una mesa: libre → «Abrir mesa»; con sesión → panel resumen (número, estado, comensales,
  tiempo, total, mesero, alertas) con «Ver cuenta», «Pedir cuenta», «Liberar». El *hover* deja de
  ser la única vía (hoy lo es).

**¿Cuál es la vista por defecto?** Mientras el usuario no elija: **Plano** en escritorio y tablet si
la sucursal tiene al menos el 80 % de sus mesas ubicadas; **Cuadrícula** en móvil o si el plano no
está armado. Al elegir, gana la elección.

### 3.3 Qué se guarda, dónde y por qué

| Preferencia | Dónde | Por qué |
|---|---|---|
| Vista (`cuadricula` / `plano`) **por clase de dispositivo** (`escritorio`, `tablet`, `movil`) | BD, por usuario y organización | El mismo mesero puede querer Plano en la tablet de caja y Cuadrícula en su teléfono; una sola vista global lo obligaría a cambiarla cada vez |
| Densidad (`comoda` / `compacta`) | BD | Sigue al usuario |
| Zona elegida y zonas plegadas, **por sucursal** | BD | Cada mesero atiende «su» zona; la zona de otra sucursal no tiene sentido |
| Zoom y desplazamiento del plano, por sucursal y zona | `localStorage` del dispositivo | Depende del tamaño de pantalla: llevarlo a otro equipo lo empeora |
| Filtro de estado y búsqueda | No se guardan (solo en la URL mientras se navega) | Un filtro olvidado esconde mesas: es justo el defecto que tiene hoy el Mapa |

**Dónde en la BD — tabla nueva `user_ui_preferences`** (recomendada):

```
user_ui_preferences
  user_id          uuid  NOT NULL  → auth.users
  organization_id  int   NOT NULL  → organizations
  clave            text  NOT NULL  -- 'pos.mesas'
  valor            jsonb NOT NULL DEFAULT '{}'
  updated_at       timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (user_id, organization_id, clave)
RLS: user_id = (select auth.uid()) AND organization_id IN (SELECT organization_id FROM organization_members
     WHERE user_id = (select auth.uid()) AND is_active)
```

Valor de `pos.mesas`:
```json
{ "v": 1,
  "vista": { "escritorio": "plano", "tablet": "plano", "movil": "cuadricula" },
  "densidad": "compacta",
  "porSucursal": { "105": { "zonaId": "…uuid…", "plegadas": ["…uuid…"] } } }
```

Por qué no las otras opciones:
- **Solo `localStorage`**: la caja y las tablets se comparten entre usuarios (quedaría la vista del
  último que la usó) y el mesero que cambia de equipo pierde su preferencia. Sirve como **caché**.
- **`profiles.metadata`**: no es por organización (un usuario con dos restaurantes tendría una sola
  zona), y otras funciones lo leen y reescriben entero desde rutas distintas (§1.6): dos escrituras
  seguidas se pisan. Una tabla con PK por clave evita la carrera y es reutilizable por cualquier
  listado («vista tabla/tarjetas», columnas visibles).

**Cómo se usa**: al montar, la pantalla pinta con la caché de `localStorage`
(`goadmin:pref:{userId}:{orgId}:pos.mesas`), sin parpadeo; luego trae la fila de la BD y, si difiere,
gana la más reciente por `updated_at`. Cada cambio se aplica al instante, se escribe en la caché y
se sube con un `PUT /api/me/preferencias/pos.mesas` con *debounce* de 800 ms. La ruta empieza por
`getServerOrgContext()`: **la organización sale de la sesión**, nunca del body; valida el JSON con un
esquema (claves y valores permitidos, tamaño máx. 4 KB). En Desktop/Capacitor la caché va en
`@capacitor/preferences`, como el tema.

### 3.4 Filtros, búsqueda y leyenda

- **Búsqueda** «Buscar mesa (número o nombre)»: coincide por número exacto primero («7» encuentra
  «Mesa 7» antes que «Mesa 17»), sin tildes. En escritorio, atajo `/`.
- **Zona**: en Cuadrícula es un `Select` («Todas las zonas» + zonas con conteo); en Plano son las
  pestañas. Es el mismo estado.
- **Estado**: la `LeyendaEstadosMesa` (ya creada, `680:410766`) se vuelve el filtro: cada estado con
  su conteo es un chip que se activa y desactiva (selección múltiple). Así desaparece el `Select`
  con emojis y los KPI del pie. Estados, con token e **icono** (nunca solo color):

| Estado | Origen | Token (fondo suave / borde / texto) | Icono |
|---|---|---|---|
| Libre | `state='free'` y sin sesión | `success` | `CircleCheck` |
| Ocupada | sesión `active` | `brand` (Azul GO) | `Users` |
| Por cobrar | sesión `bill_requested` | `warning` | `Receipt` |
| Reservada | `state='reserved'` o reserva en los próximos 60 min | `info` (celeste; el `Badge` del kit no tiene violeta) | `CalendarClock` |
| Por limpiar | `state='cleaning'` (**no existe hoy**, §5) | `neutral` | `Sparkles` |

- Ocupada pasa de rojo a Azul GO: el rojo se reserva para **alertas** (alergia, demora crítica), así
  la alerta vuelve a destacar.
- Con filtros activos, `FilterChips` con «Limpiar todo»; en el Plano, las mesas que no cumplen el
  filtro **se atenúan al 30 %** en vez de desaparecer (el plano no se deforma y se entiende por qué).

### 3.5 Información mínima por mesa

| Dato | Cómoda | Compacta | Plano | Fuente |
|---|---|---|---|---|
| Número / nombre | ✔ 16/24 semibold | ✔ 16/20 semibold | ✔ | `restaurant_tables.name` |
| Estado | `Badge` con texto | icono + color | color + icono | §3.4 |
| Capacidad | «4/6» (libre: «6 pers.») | solo si libre | sillas | `capacity`, `table_sessions.customers` |
| Comensales | ✔ | — | sillas ocupadas | `customers` |
| Tiempo | `TiempoTranscurrido` (normal / atención / crítico) | si ocupada: «42 min» | línea 2 | `opened_at`, con reloj que avanza (hoy se congela) |
| Total | ✔ «$ 186.400» | si por cobrar | línea 2 si por cobrar | `sales.total`, formateado con la moneda de la organización |
| Mesero | iniciales + nombre | — | en el panel resumen | `server_id` → `profiles` |
| Plato listo | chip «Plato listo» | icono `BellRing` | aviso `Aviso plato listo` de `MesaPlano` | `kitchen_tickets.status='ready'` |
| Alergia | chip «Alergia» (peligro) | icono `TriangleAlert` | punto rojo | nota de mesa con destino alergia (`POS-CARRITO-LINEAS-NOTAS.md` §3) |
| Saldo (liberada con saldo / cuenta pendiente) | chip «Saldo $ …» | icono `CircleDollarSign` | punto | `LiberarMesaDialog` / `sales.balance` |
| Reserva próxima | «20:30 · 4 pers.» | «20:30» | línea 2 | `restaurant_reservations` |

Cuando una tarjeta compacta tiene más de 2 alertas: 2 iconos + «+1». El orden de prioridad es
Alergia › Plato listo › Saldo › Demora.

### 3.6 Modo edición del plano

**Quién**: permiso nuevo `pos.tables.manage`, resuelto en el servidor con
`requireOrgAdminOrPermission(ctx, 'pos.tables.manage')` (`lib/utils/orgContext.ts:343`). La pantalla
lo recibe como `puedeEditarPlano` de una ruta de servidor; la RPC de guardado **lo vuelve a
comprobar** (el botón oculto no es la seguridad). Sin permiso, «Editar plano» y «Nueva mesa» no
aparecen; si alguien llega con `?editar=1`, ve un aviso «No tienes permiso para editar el plano».
Editar el plano **no** está disponible en móvil (se ve el plano en solo lectura con el aviso «Edita
el plano desde un computador o una tablet»).

**Qué cambia en la pantalla**: la barra de filtros se sustituye por la **barra de edición**, el
lienzo muestra la rejilla y aparece el **panel de edición** a la derecha (320 px; en tablet, hoja
lateral de 360 px que se puede ocultar).

Barra de edición: `Deshacer` · `Rehacer` · `Rejilla` (conmutador, paso 20 px) · `Alinear` (menú:
izquierda, centro, derecha, arriba, medio, abajo, distribuir en horizontal/vertical — con 2+
seleccionadas) · `Duplicar` · `Eliminar` · separador · «+ Mesa» (menú de formas) · «+ Zona» ·
separador · «Cancelar» · **«Guardar cambios (n)»**.

Panel de edición — **Mesa** (una seleccionada):
- Nombre / número (obligatorio, único en la sucursal).
- Zona (`Select` con «+ Nueva zona»).
- Forma: `SegmentedControl` con icono — Cuadrada · Redonda · Rectangular · Barra.
- Capacidad: `CampoNumero` 1–20 (por encima de 12 las sillas se resumen).
- Tamaño: S / M / L (`SegmentedControl`), o ancho × alto en px con «Personalizado».
- Rotación: `SegmentedControl` **0° · 90° · 180° · 270°** + campo «Libre» (0–359, paso 15 con las
  flechas); en el lienzo, asa de giro con *snap* a 15° (Shift = libre).
- Posición x, y (solo lectura; se mueve arrastrando o con flechas).
- Aviso si la mesa tiene cuenta abierta: se puede mover, no eliminar ni bajar la capacidad por
  debajo de los comensales.

Panel de edición — **Zona** (clic en el borde del recuadro o en su pestaña): nombre, color (6
tonos del manual, no hex sueltos), orden de las pestañas, «Ajustar el recuadro a sus mesas»,
«Eliminar zona» (solo vacía; si tiene mesas, pide a qué zona moverlas).

Selección múltiple con Shift/Ctrl o recuadro de selección; mover en bloque. **Teclado**: flechas
= 1 paso de rejilla, Shift+flechas = 5 pasos, `R` = +90°, `Ctrl+D` duplicar, `Ctrl+Z` / `Ctrl+Y`,
`Supr` eliminar, `Esc` deseleccionar. Duplicar coloca la copia a un paso de rejilla y le pone el
siguiente número libre.

**Guardar y deshacer**: la edición es local (pila de deshacer de 50 pasos); «Guardar cambios (n)»
manda **solo lo cambiado** en una RPC transaccional con versión del plano (si otro usuario guardó
entretanto: «El plano cambió desde que empezaste. Recarga o sobrescribe»). Salir con cambios
pendientes pide confirmación (`ConfirmDialog`: «Descartar cambios» destructiva / «Seguir
editando»). Mientras se edita, las mesas siguen mostrando su estado real (se puede editar en pleno
servicio).

### 3.7 Estados de la página

| Estado | Qué se ve |
|---|---|
| Listo | §3.1 |
| Cargando | `Skeleton` con la forma de la vista guardada (tarjetas de la densidad guardada, o lienzo con recuadros grises): no salta de una vista a otra al terminar |
| Refrescando | indicador en el botón ⟳ y la hora de la última actualización; **nunca** se bloquea la página (hoy sí, `page.tsx:483`) |
| Vacío (primer paso) | `EmptyState` «Arma tu salón»: 1) Crea una zona 2) Agrega mesas 3) Ubícalas en el plano. Botones «Crear zona» y «Agregar mesas en lote» (p. ej. 10 mesas de 4 personas, numeradas 1–10). Sin permiso: «Pide a un administrador que configure las mesas» |
| Sin resultados | `EmptyState` `search`: «Ninguna mesa coincide con “27”» + «Limpiar filtros» |
| Error | `EmptyState` `error` + «Reintentar»; si ya había datos, se conservan con un aviso «No se pudo actualizar · hace 2 min» |
| Sin permiso | `EmptyState` `forbidden`: «No tienes acceso a las mesas de esta sucursal» |

### 3.8 Tamaños de pantalla

| | Escritorio 1440 | Tablet 1024 (caja y mesero) | Móvil 390 (mesero) |
|---|---|---|---|
| Navegación | `Sidebar` expandido | `Sidebar Mode=rail` | `MobileHeader` + `MobileTabBar` |
| Vista por defecto | Plano | Plano | Cuadrícula (compacta) |
| Selector y densidad | texto + icono | texto + icono | solo iconos |
| Zona | `Select` / pestañas | pestañas con desplazamiento | chips con desplazamiento horizontal |
| Leyenda-filtro | fila completa | fila completa | chips con desplazamiento |
| Tocar mesa | panel resumen lateral | panel resumen lateral | hoja inferior (`ActionSheet`) |
| Editar plano | sí, panel 320 | sí, hoja lateral 360 | no (solo lectura) |
| Objetivos táctiles | 32 px | **44 px** | **44 px** |

---

## 4. Componentes y pantallas (Figma)

Componentes nuevos en `02 Componentes` › «POS — Restaurante (Nuevo)» (`680:410510`), reutilizando
`MesaPlano` (`680:410764`), `LeyendaEstadosMesa` (`680:410766`), `TiempoTranscurrido`
(`680:410531`) y `FlujoMesa` (`680:411011`):

| Componente | Node id | Variantes / propiedades |
|---|---|---|
| `MesaCard` | `868:31742` | `Densidad=comoda/compacta` × `Estado=libre/ocupada/por-cobrar/reservada/por-limpiar` (10) · texto `Número`, `Mesero` · booleanos `Plato listo`, `Alergia`, `Saldo`. «Línea 1» / «Línea 2» se sobrescriben en la instancia (una propiedad de texto es única para todo el set y pisaba el contenido de cada estado) |
| `SelectorVista` | `868:31799` | `Vista=cuadricula/plano` × `Tamaño=normal/icono` |
| `SelectorDensidad` | `868:31832` | `Densidad=comoda/compacta` |
| `ZonaHeader` | `868:31867` | `Estado=abierta/plegada` · textos `Zona`, `Resumen` |
| `ControlesPlano` | `868:31969` | `Modo=ver/editar` · texto `Zoom` |
| `BarraEdicionPlano` | `868:31970` | — |
| `PanelEdicionMesa` | `868:32324` | `Objeto=mesa/zona` |

Pantallas en `05 POS y ventas` › sección `870:98618` «POS — Mesas: cuadrícula y plano (propuesta)»
(x = 0, y = 134.400): ver §7.

---

## 5. Cambios de backend y BD necesarios (no aplicados)

Todos aditivos. Cada migración con su `.sql` en `supabase/migrations/` y su reversión en
`supabase/rollbacks/` (`docs/POLITICA-MIGRACIONES.md`). Se suman a los de
`POS-MESAS-COMANDAS-RESERVAS.md` §7 (estado `cleaning`, una sesión abierta por mesa, Realtime, RPCs
de apertura/cierre); no se repiten.

1. **`restaurant_zones`** (nueva): `id uuid`, `organization_id`, `branch_id` NOT NULL, `name`,
   `color text` (clave del manual: `azul/verde/ambar/violeta/rosa/cian`), `sort_order int`,
   `position_x/y`, `width`, `height`, `created_at/updated_at`; UNIQUE
   `(organization_id, branch_id, lower(name))`; RLS por pertenencia. *Backfill*: una fila por
   `DISTINCT (organization_id, branch_id, zone)` de `restaurant_tables`, con el recuadro de
   `restaurant_zone_layouts` si existe.
2. **`restaurant_tables`**: `zone_id uuid NULL` (FK a `restaurant_zones`, `ON DELETE SET NULL`),
   `shape text NULL` CHECK `square/round/rect/bar` (NULL = la regla actual por capacidad, para no
   cambiar planos existentes), `width int NULL`, `height int NULL`. `zone` (texto) se mantiene y un
   trigger lo sincroniza con `zone_id` mientras el código viejo exista; `restaurant_zone_layouts`
   queda de solo lectura y se retira en una fase posterior.
3. **Índices**: `restaurant_tables (organization_id, branch_id)` (hoy solo hay PK) y UNIQUE
   `(branch_id, lower(name))` — hoy hay 0 duplicados, así que se puede crear sin limpiar.
4. **`user_ui_preferences`** (nueva, §3.3) con RLS `user_id = (select auth.uid())` + pertenencia, y
   ruta `GET/PUT /api/me/preferencias/[clave]` con `getServerOrgContext()` y validación del JSON
   por clave.
5. **Permiso** `pos.tables.manage` en `permissions` (y `pos.tables.view` si se decide separar la
   vista); asignarlo a los roles admin/gerente por migración. Crear también la fila `pos.manage`
   que el código ya usa y no existe (§2.1), o dejar de usarlo.
6. **RPC `pos_tables_save_layout(p_branch_id int, p_version int, p_cambios jsonb)`**
   (`SECURITY INVOKER`, organización de la sesión, comprueba `pos.tables.manage`): en una
   transacción crea/actualiza/borra zonas y mesas (posición, forma, tamaño, rotación, zona,
   capacidad), valida que no se borre una mesa con sesión abierta, sube `restaurant_zones`/plano a la
   versión siguiente y falla con `plano_desactualizado` si `p_version` no es la vigente. Sustituye a
   `MesasService.actualizarPosiciones` (`mesasService.ts:250-268`), `guardarZoneLayouts` (`:305-330`),
   `actualizarZona` y `eliminarZona` (`:535-585`). Versión: `restaurant_zones.layout_version` o una
   fila por sucursal en una tabla `restaurant_floor_plans (branch_id PK, version, updated_by,
   updated_at)`.
7. **RLS de escritura**: con la RPC en uso, limitar `INSERT/UPDATE/DELETE` directos de
   `restaurant_tables` y `restaurant_zones` a quien tenga `pos.tables.manage` (los cambios de estado
   de la mesa pasan a las RPC de sesión de `POS-MESAS-COMANDAS-RESERVAS.md` §7.4).
8. **Lectura del tablero en el servidor**: `GET /api/pos/mesas/tablero?branch=` que devuelva en una
   consulta mesas + zona + sesión + total + mesero + alertas (plato listo, alergia, saldo, próxima
   reserva) + conteos por estado, en lugar de las 6 consultas del navegador (`mesasService.ts:17-179`).
9. **Código** (no BD): `MesasFloorMap` deja de deducir la forma de la capacidad cuando `shape` no es
   NULL; zoom/pan con clave `goadmin:plano:{userId}:{branchId}:{zonaId}`; la pantalla pasa a
   `next-intl` (namespace `posMesas`, 4 idiomas); ruta de vuelta desde el detalle con
   `?vista=&zona=` para volver al mismo sitio.

---

## 6. Preguntas para el dueño

1. **Móvil**: ¿el mesero necesita el Plano en el teléfono (solo lectura, con pellizco) o le basta la
   Cuadrícula? La propuesta lo deja disponible pero no por defecto.
2. **Permiso**: ¿quién arma el plano además del administrador? ¿El gerente/jefe de salón? (se
   asigna `pos.tables.manage` a esos roles).
3. **Numeración**: ¿las mesas se identifican siempre por número («7») o también por nombre libre
   («VIP», «Barra 2»)? Si es número, la búsqueda y el orden se simplifican y se puede validar.
4. **Formas**: ¿basta con cuadrada, redonda, rectangular y barra? ¿Quieren elementos del salón que
   no son mesas (pared, barra de servicio, puerta, baño) solo como referencia visual? No está en la
   propuesta; sería un tipo de objeto aparte.
5. **Rotación libre**: ¿la necesitan (hoy hay mesas a 45° y 75°) o basta con 0/90/180/270? La
   propuesta ofrece las dos, con 90° como camino rápido.
6. **Muchas sucursales**: ¿alguien necesita ver mesas de **varias sucursales a la vez**? La
   propuesta obliga a elegir una sucursal en esta pantalla (hoy «Todas» mezcla zonas).

---

## 7. Figma: qué quedó hecho y qué falta

**Hecho (tanda completa, el cupo alcanzó).**

- `02 Componentes` › «POS — Restaurante (Nuevo)» (`680:410510`): los 7 componentes de §4, con
  colores ligados a variables (Light/Dark), estilos de texto y sombra del archivo, e instancias del
  kit (`Button`, `IconButton`, `Badge`, `Avatar`, `Select`, iconos `Icon/*`). Se corrigió el solape
  pendiente de `LeyendaEstadosMesa` (`680:410766`), que se movió a la derecha del set `MesaPlano`.
- `05 POS y ventas` › sección `870:98618`, 14 pantallas con su nota encima (fuera del frame):

| Pantalla | Node id | Captura (`docs/design/figma/`) |
|---|---|---|
| Escritorio / cuadrícula compacta (60 mesas, 4 zonas) | `870:98621` | `58-pos-mesas-escritorio-cuadricula-compacta.png` |
| Escritorio / cuadrícula cómoda con filtros (Terraza · Ocupada + Por cobrar) | `870:102321` | `58-pos-mesas-escritorio-cuadricula-comoda-filtros.png` |
| Escritorio / plano (Salón principal, mesa seleccionada con resumen) | `870:103527` | `58-pos-mesas-escritorio-plano.png` |
| Escritorio / plano en modo edición (mesa girada 90°, panel de mesa) | `870:104583` | `58-pos-mesas-escritorio-plano-edicion.png` |
| Escritorio / vacío (primer paso) | `870:105746` | `58-pos-mesas-escritorio-vacio.png` |
| Escritorio / cargando | `870:106292` | `58-pos-mesas-escritorio-cargando.png` |
| Escritorio / error | `870:106868` | `58-pos-mesas-escritorio-error.png` |
| Escritorio / sin permiso | `870:107405` | `58-pos-mesas-escritorio-sin-permiso.png` |
| Tablet 1024 / plano | `870:576130` | `58-pos-mesas-tablet-plano.png` |
| Tablet 1024 / cuadrícula compacta | `870:576848` | `58-pos-mesas-tablet-cuadricula.png` |
| Tablet 1024 / plano en edición (zona seleccionada) | `870:580140` | `58-pos-mesas-tablet-plano-edicion-zona.png` |
| Móvil 390 / cuadrícula compacta | `870:581071` | `58-pos-mesas-movil-cuadricula.png` |
| Móvil 390 / plano solo lectura | `870:582126` | `58-pos-mesas-movil-plano.png` |
| Móvil 390 / hoja de la mesa | `870:582569` | `58-pos-mesas-movil-hoja-mesa.png` |

Componentes: `58-pos-mesas-componentes.png` (sección `680:410510` completa).

**Chequeo por script** (ambas secciones): 0 solapes entre hijos de la sección, 0 nodos fuera de la
sección, 0 nodos ajenos dentro de su área, 0 instancias rotas (1.555 instancias en las pantallas,
174 en componentes), 0 textos recortados (los 102 textos con elipsis son del `Sidebar` del kit y
caben enteros; los 6 que sobresalían —tarjetas de «Pasos» del estado vacío— se corrigieron), 0 notas
dentro de frames. Los recortes que quedan son intencionales: listas que se deslizan en móvil
(zonas, estados), el contenido del móvil bajo la barra inferior y el lienzo del plano.

**Pendiente / a revisar.**

1. `MesaPlano` usa `Estado=sucia` y `MesaCard` usa `por-limpiar`: unificar el nombre (propuesta:
   `por-limpiar`, que es lo que ve el usuario) cuando se toque `MesaPlano`.
2. En el plano, la mesa girada muestra el texto girado; en el producto el texto se contrarrota
   (lo dice la nota). Figma no permite contrarrotar una capa dentro de una instancia.
3. La pantalla «cargando» usa bloques con el token `slate/200` en lugar de `Skeleton Variant=rect`:
   la instancia del kit no se deja reducir a 104 × 72 (su contenido no escala). Conviene dar al
   `Skeleton` del kit un tamaño libre.
4. En la página `05 POS y ventas` hay un frame suelto `__probe__` (40 × 40 en 0, 0) que no es de
   esta tanda; no se tocó.
