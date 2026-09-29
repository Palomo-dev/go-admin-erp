# POS — Estaciones configurables y Comandas v2: análisis y propuesta

Fecha: 2026-09-28. Alcance: la **estación** de preparación en todo el sistema (categorías, productos,
comandas, impresión, pantalla de cocina, importación, pedidos web, Desktop sin conexión) y el
rediseño de **`/app/pos/comandas`** (tablero de gestión + pantalla de cocina KDS).

Pedido del dueño:

- (A) «Quiero poder cambiar la estación de los productos y de las comandas, para que no siempre se
  llamen así (Cocina caliente, Cocina fría, Bar, Caja) y poder crear más.»
- (B) «Analiza muy bien la pantalla de comandas y mira cómo mejorar su UI para mejorar la UX, con
  estructura en el manual de marca.»

Documentos previos que este amplía (no se repiten): `POS-MESAS-COMANDAS-RESERVAS.md` (K1–K10, §7
backend de mesas y comandas), `POS-CARRITO-LINEAS-NOTAS.md` (rondas, comanda de ajuste, alergia,
notas rápidas — commits `3458814a` y `f6dda487`), `POS-PARIDAD-PAGINAS-SECUNDARIAS.md` §2.9 y P-K1/P-K2
(la cocina en tablet quedó sin dibujar), `POS-MESAS-VISTAS.md` (zonas configurables: el mismo
patrón de «catálogo propio de la organización» que aquí se aplica a estaciones).

Datos consultados el 2026-09-28 con el MCP de Supabase (solo `SELECT`, conteos). Las organizaciones
se citan por id.

---

## 0. Resumen

1. **La estación es un texto con 5 valores cableados** (`hot_kitchen`, `cold_kitchen`, `bar`,
   `cashier`, `all`) repetidos en **3 `CHECK` de la BD, 2 funciones SQL y ~15 archivos** (web,
   agente de impresión, móvil). No hay tabla: no se puede renombrar ni crear otra sin migración y
   despliegue.
2. **En los datos solo se usa `hot_kitchen`** (y `all` en una organización). `cold_kitchen` y `bar`
   no los usa ningún producto ni categoría; solo una organización los tiene asignados a impresoras.
   O sea: la lista fija no refleja cómo trabaja nadie.
3. **La propuesta A**: tabla `pos_stations` por organización con **clave estable** (`code`, la misma
   que ya guardan todas las columnas) + **nombre, color, icono, orden, tiempo objetivo, sucursales e
   impresoras editables**. Las 5 claves actuales pasan a ser filas: **no se reescribe ninguna
   columna, ninguna comanda ni ningún trabajo de impresión**. Renombrar cambia solo el nombre;
   archivar pide mover lo asignado; borrar solo si nunca se usó.
4. **La pantalla de comandas** mezcla dos trabajos (gestionar el salón y cocinar), tiene tres filas
   de chips, paginación que corta las columnas, el estado es de la comanda entera (si el bar marca
   «lista», los platos de cocina también quedan listos) y 62 comandas de hace días siguen «vivas».
5. **La propuesta B**: dos modos claros — **Tablero** (escritorio, gestión, todas las estaciones,
   sin paginación, agrupable por mesa) y **Cocina** (tablet a pantalla completa, oscuro, una
   estación, tarjetas legibles a 2 m, un toque por tarjeta, semáforo según el objetivo de la
   estación, alergia que bloquea, ajuste marcado, anulados tachados).
6. Figma: dos secciones nuevas en `05 POS y ventas` y componentes nuevos en `02 Componentes ›
   POS — Restaurante (Nuevo)` (§6).

---

## 1. Análisis

### 1.1 Cómo existe hoy la estación

| Dónde | Tipo | Valores permitidos | Nota |
|---|---|---|---|
| `categories.station` | `text NULL` | `CHECK categories_station_check`: los 5 | La estación «de la categoría» |
| `products.station` | `text NULL` | `CHECK products_station_check`: los 5 | **Propia** del producto; `NULL` = hereda |
| `printer_station_assignments.station` | `text NOT NULL` | `CHECK …_station_check`: los 5 | UNIQUE `(printer_id, branch_id, station)`; `branch_id` NULL = toda la organización |
| `kitchen_ticket_items.station` | `text NULL` | **sin CHECK** (texto libre) | Copia en el momento del envío |
| `print_jobs.station` | `text NULL` | **sin CHECK** | Copia |
| `fn_producto_guardar` | plpgsql | lista cableada; `estacion_invalida` | Guardado del producto |
| `fn_importar_productos_lote` | plpgsql | lista cableada; `kitchen` → `hot_kitchen`; desconocida → `NULL` **en silencio** | Importación masiva |

**Herencia (aprobada 2026-09-24).** `fn_estacion_efectiva(p_product_id)` =
`coalesce(producto.station, padre.station, categoría.station)`; `fn_estaciones_efectivas(org, ids[])`
la devuelve en lote con `heredada` y `requires_preparation`. En el navegador la replica
`src/lib/pos/estacionEfectiva.ts:37-39` (también sin conexión, con la réplica local).

**No hay enum ni tabla**: es un `CHECK` sobre texto. Eso es una ventaja para migrar: la clave de
texto puede seguir siendo la misma y apuntar a una fila.

### 1.2 Datos reales (2026-09-28)

| Tabla | Valor | Filas | Organizaciones |
|---|---|---:|---|
| `categories.station` | `hot_kitchen` | 27 | 120, 130, 140 |
| | `all` | 4 | 140 |
| | `NULL` | 1.320 | 27 |
| `products.station` (propia) | `hot_kitchen` | 80 | 130 (2), 133 (78) |
| | `all` | 1 | 140 (el producto tiene propia `all` y su categoría `hot_kitchen`) |
| | `NULL` | 70.228 | 30 |
| Productos que **heredan** estación de su categoría | — | 279 | 120 (143), 130 (105), 140 (31) |
| `kitchen_ticket_items.station` | `hot_kitchen` | 248 | 120 (242), 130, 133 |
| | `all` | 2 | 140 |
| | `NULL` | 44 | 2, 113 |
| `printer_station_assignments` | `cashier` | 5 | 120, 129, 132 (2), 133 |
| | `hot_kitchen` | 2 | 120, 133 |
| | `cold_kitchen`, `bar`, `all` | 1 c/u | 133 |
| `print_jobs.station` | `cashier` 436 · `hot_kitchen` 44 · `NULL` 2 | | 4 |

- **`cold_kitchen` y `bar` no los usa ningún producto, categoría ni comanda.** Solo la org 133 los
  tiene como destino de impresora.
- `cashier` no es una estación de preparación: es el **destino de impresión del recibo** (436
  trabajos). Hoy comparte la misma lista que las estaciones de cocina.
- `all` significa dos cosas: en una impresora, «recibe todas las estaciones» (comodín); en un
  producto o categoría, una estación más llamada «General».

Comandas: 205 en 6 organizaciones (163 de mesa, 42 del POS); **0 de ajuste, 0 con alergia, 0 ítems
anulados** (las funciones de `f6dda487` aún no se usan). **Las 62 comandas vivas (38 nuevas, 2 en
preparación, 22 listas) tienen más de 1 día** — org 120: 36, org 2: 22. Mediana creada→lista:
~4,8 días (nadie cierra; el tiempo no mide cocina). Máximo de vivas en una organización: 36. Promedio
de 1,5 ítems por comanda. `kitchen_tickets` está publicada en Realtime; **`kitchen_ticket_items`
no**. 6 impresoras en 4 organizaciones; 9 organizaciones tienen mesas.

### 1.3 Dónde se usa la estación (y qué se rompe si se configura)

| # | Lugar | Archivo:línea | Cómo la usa | ¿Cableada? |
|---|---|---|---|---|
| 1 | Lista canónica del cliente | `src/lib/pos/estacionEfectiva.ts:16` | `ESTACIONES_COCINA` (5) | Sí |
| 2 | Etiquetas de impresoras | `src/components/pos/configuracion/printersService.ts:7, 56-62` | `PrinterStation` + `STATION_LABELS` | Sí |
| 3 | Formulario de impresora | `…/printers/PrinterFormDialog.tsx:51, 272-297, 627-633` | casillas por estación; «Todas» marca las 4 | Sí |
| 4 | Ruteo de impresión de cocina | `src/lib/services/printJobsService.ts:414-432` | agrupa por `item.station \|\| 'all'` → `getPrintersByStation` | No (texto) |
| 5 | Búsqueda de impresoras | `printersService.ts:230-253` | `.in('station',[station,'all'])`; **si la sucursal no tiene, cae a cualquier impresora de la organización** | No |
| 6 | Categoría (formulario, árbol, detalle, filtro) | `components/inventario/categorias/CategoryForm.tsx:466-481`, `iconoCategoria.ts:27-34`, `ArbolCategorias.tsx:346, 610`, `useArbolCategorias.ts:145-147` | Select de las 5 | Sí |
| 7 | Producto (formulario) | `components/inventario/productos/formulario/secciones/SeccionOrganizacion.tsx:50-58, 125-157` | «Usar estación propia» + Select de las 5 | Sí |
| 8 | Producto (detalle, historial) | `detalle/resumen/ResumenProducto.tsx`, `detalle/historial/ItemHistorial.tsx` | etiqueta por clave | Sí |
| 9 | Importación de productos y categorías | `lib/inventario/importacion/normalizacion.ts:5`, `payload.ts:93`, `validacion.ts:147`, `ImportCategoriesDialog.tsx:43` | texto → clave; aviso `estacionDesconocida` | Sí |
| 10 | POS mostrador (catálogo y envío) | `lib/pos/venta/catalogo.ts:113-129`, `lib/pos/venta/enviarCocina.ts:102-106` | `estacionEfectiva` → línea de la ronda | No |
| 11 | Mesa (agregar producto, pedidos) | `components/pos/mesas/id/AddProductDialog.tsx:165-173, 277`, `pedidosService.ts:425, 462` | idem; «va a cocina» = `requires_preparation \|\| station` | No |
| 12 | RPC de cocina | `pos_cocina_enviar_ronda`, `pos_cocina_ajustar_linea_mesa`, `fn_pos_cocina_resultado_ronda` | copia `station` del payload / del ítem original | No |
| 13 | Pedidos web | `lib/services/webOrderConfirmationService.ts:313-335` | `fn_estaciones_efectivas` | No |
| 14 | Tablero de comandas (filtro) | `components/pos/comandas/FilterBar.tsx:27-31` | **3** chips (sin Caja ni General) | Sí |
| 15 | Tarjeta de comanda | `components/pos/comandas/TicketCard.tsx:74-85` | etiqueta y color; `all` y `NULL` → «General» | Sí |
| 16 | Tipos del servicio | `lib/services/kitchenService.ts:44, 79` | `station: 'hot_kitchen'\|'cold_kitchen'\|'bar'\|null` | Sí (y mal: excluye `cashier`/`all`) |
| 17 | Agente de impresión (Desktop) | `print-agent/src/printing/renderEscpos.ts:55-61, 171`, `renderHtml.ts:23-29, 449` | etiqueta impresa por clave | Sí — **«COCINA FRÍA» está doblemente codificada** (`renderEscpos.ts:57`, `renderHtml.ts:25`) |
| 18 | Impresión móvil | `lib/services/mobileEscposAdapter.ts:432` | imprime la **clave cruda** (`Estacion: hot_kitchen`) | — |
| 19 | Réplica sin conexión (Desktop) | `lib/offline/replicationManifest.ts:102, 241`, `catalogReplicator.ts:153`, `posOfflineReads.ts:272, 311` | replica `products.station` y `categories.station` | No |
| 20 | Muestras de impresión | `components/pos/configuracion/impresiones/sampleData.ts` | clave de ejemplo | Sí |
| 21 | Aviso «sin impresora» | `app/app/pos/comandas/page.tsx:291`, `lib/pos/venta/enviarCocina.ts:171` | muestra la **clave cruda** (`hot_kitchen`) al usuario | — |
| 22 | i18n | `messages/*.json` (`estaciones.*` en 3 namespaces) | una etiqueta por clave × 4 idiomas | Sí |

Reportes: **ninguno** agrupa por estación hoy (no hay tiempos por estación ni por cocinero).

### 1.4 Hallazgos sobre la estación

| # | Hallazgo | Evidencia |
|---|---|---|
| E1 | La lista está cableada en 3 `CHECK`, 2 funciones SQL, ~15 archivos y 4 idiomas: renombrar «Bar» a «Barra» o crear «Postres» exige migración + despliegue de web, móvil y agente | §1.3 |
| E2 | Se mezclan tres conceptos: estación de preparación (caliente/fría/bar), destino de impresión del recibo (`cashier`) y comodín de impresora (`all`) | §1.2 |
| E3 | El tablero filtra por 3 estaciones: los ítems `all`/`NULL` (46 de 294) y los de `cashier` no aparecen al filtrar | `FilterBar.tsx:27-31`, `page.tsx:311-314` |
| E4 | El estado es **de la comanda entera**: «Marcar lista» pone listos los ítems de **todas** las estaciones; con dos estaciones, el bar «termina» los platos de la cocina | `kitchenService.ts:219-236` |
| E5 | El tiempo de alerta está cableado (10 / 20 min) igual para un café y para un asado | `TicketCard.tsx:150-158` |
| E6 | La búsqueda de impresoras cae a **cualquier impresora de la organización** si la sucursal no tiene: una comanda de la sucursal A puede imprimirse en la cocina de la sucursal B | `printersService.ts:244-253` |
| E7 | Mensajes con la clave cruda («No hay impresora configurada para: hot_kitchen») | `page.tsx:291`, `enviarCocina.ts:171`, `mobileEscposAdapter.ts:432` |
| E8 | «COCINA FRÍA» sale como `COCINA FRÃ\u008dA` en el ticket impreso (latente: nadie la usa aún) | `renderEscpos.ts:57`, `renderHtml.ts:25` |
| E9 | La importación descarta en silencio una estación desconocida (queda `NULL`) | `fn_importar_productos_lote` |
| E10 | No hay tiempo de inicio (`started_at`) ni por ítem: no se puede medir preparación por estación | columnas de `kitchen_tickets` / `kitchen_ticket_items` |

### 1.5 La pantalla de comandas hoy (código)

`src/app/app/pos/comandas/page.tsx` (416 líneas) + `components/pos/comandas/*` (`FilterBar`,
`TicketsGrid`, `TicketCard`, `ComandasPagination`, `PageHeader`, `EmptyState`, `LoadingState`).

**Qué hace bien (y se conserva).** Realtime con sonido y aviso de comandas nuevas (`page.tsx:80-122`),
actualización optimista con reversión, arrastrar entre columnas (`TicketsGrid.tsx:213-222`),
reimpresión con la copia del ítem y del ajuste (`page.tsx:264-299`), **comanda de ajuste marcada**
(+n / −n / ANULAR / NOTA, `TicketCard.tsx:108, 190-209, 293-298`), **ítems anulados tachados con el
motivo** (`:370-374`), **alergia que bloquea «Empezar»** hasta «Confirmar alergia», también en la BD
(`:23-26, 251-279, 443`; `page.tsx:127-133`; trigger `fn_kitchen_ticket_alergia_guarda`), copia del
nombre y la cantidad (`cantidadComanda`, `:34-37`), hora con la zona de la organización
(`formatTimeInTz`, `:261`).

**Problemas de UX** (se suman a K1–K10 de `POS-MESAS-COMANDAS-RESERVAS.md` §2.3):

| # | Problema | Archivo:línea | Efecto para quien trabaja |
|---|---|---|---|
| U1 | Tres filas de filtros (zona, estación, estado) + `BranchBadge`, además de las columnas por estado: el filtro de **estado** duplica las columnas | `page.tsx:353-374`, `FilterBar.tsx:46-168` | ~170 px de chips antes de la primera comanda; en tablet, media pantalla |
| U2 | Paginación de 8 **antes** de repartir en columnas (K2) | `page.tsx:324-336` | columnas vacías con comandas reales; «página 2» en una cocina |
| U3 | Una sola vista para dos trabajos: el administrador (todas las estaciones, historial, reimprimir) y el cocinero (una estación, un toque, lejos de la pantalla) | toda la página | el cocinero ve sidebar, header y paginación; no se lee a 2 m (K10) |
| U4 | La tarjeta se titula con la mesa en `text-lg` y el ítem en `text-sm`; por ítem hay 3–4 badges (estación, estado del ítem, categoría, «POS») | `TicketCard.tsx:196, 356-420` | lo importante (cantidad × plato, nota, alergia) compite con metadatos |
| U5 | Ítems de otra estación al 35 % de opacidad sin decirlo (K5) | `TicketCard.tsx:289, 337` | parece deshabilitado; el cocinero no sabe si debe hacerlo |
| U6 | Tocar un ítem cicla pendiente → preparando → listo → **pendiente** | `TicketCard.tsx:313-316` | un toque de más «deshace» un plato listo sin avisar |
| U7 | La autopromoción ítems → comanda se calcula en el navegador | `page.tsx:206-236` | dos pantallas pueden dejar la comanda en estados distintos; `kitchen_ticket_items` no está en Realtime |
| U8 | Retroceder (arrastrar a «Nuevas») borra `ready_at` sin confirmar | `kitchenService.ts:204-208` | se pierde el tiempo real |
| U9 | Semáforo cableado 10/20 min y 🔥 como icono (K6) | `TicketCard.tsx:150-170, 215, 447-449` | no depende de la estación; emojis fuera del manual |
| U10 | No hay cancelar comanda (la BD admite `cancelled`), ni detalle, ni historial | `kitchen_tickets_status_check` | se «arrastra a Entregadas» lo que se canceló |
| U11 | 62 comandas de días anteriores en el tablero (K1) | datos §1.2 | el tablero no representa el turno |
| U12 | Textos sin i18n: títulos de columna, toasts, «Comenzar Preparación» | `TicketsGrid.tsx:196-201`, `page.tsx:70-297`, `TicketCard.tsx:447-449` | incumple «componentes en 4 idiomas» |
| U13 | Escrituras directas desde el navegador sin organización ni permiso (K7) | `kitchenService.ts:196-262` | cualquier usuario de la organización mueve comandas |
| U14 | Sin estados «sin permiso» ni «sin conexión»; el error es solo un toast | `page.tsx:68-77` | una tablet sin red muestra el último estado como si fuera real |

### 1.6 El diseño actual en Figma (`05 POS y ventas › Comandas`, `445:194864`)

Frames `453:222907` (tablero), `453:223522` (filtrado por estación), cargando/vacío/error, detalle,
reimprimir, devolver a «Nuevas», toasts, móvil y sin sucursal. Es la paridad del código con mejoras.
Lo que no resuelve:

- Mantiene **tres filas de chips** (sucursal, zona, estación) y la **paginación «20 por página»**.
- El **menú ⋯ de la cabecera** contiene acciones de **una comanda** (Ver, Marcar en preparación,
  Marcar lista, Imprimir, Cancelar): no se sabe sobre cuál actúa (`833:92635`).
- La tarjeta se titula «Comanda 1047» y la mesa va en gris pequeño; todas las tarjetas tienen la
  misma altura con hueco vacío; la cuarta columna («Entregadas») queda cortada a 1440.
- Estaciones cableadas en chips (Cocina caliente, Cocina fría, Bar, Caja).
- El KDS de tablet quedó **sin dibujar** (P-K1/P-K2 de `POS-PARIDAD-PAGINAS-SECUNDARIAS.md`); existe
  el componente `ComandaKDS · notas` (`848:30505`) con alergia y notas.

---

## 2. Propuesta A — Estaciones configurables

### 2.1 Decisión de modelo: clave estable + nombre editable

La estación pasa a ser una **fila por organización** con una **clave (`code`) estable e inmutable**
y todo lo demás editable. Las columnas que hoy guardan la estación (`products.station`,
`categories.station`, `printer_station_assignments.station`, `kitchen_ticket_items.station`,
`print_jobs.station`) **siguen guardando la clave**. Las 5 claves actuales se vuelven filas con el
nombre de hoy.

| Opción | A favor | En contra | |
|---|---|---|---|
| **Clave de texto (`code`) → fila** | 0 cambios en 5 columnas, 3 RPC de cocina, réplica offline, agente de impresión, pedidos web y rondas ya enviadas; migración sin reescribir datos; el historial se resuelve siempre | la integridad se valida con trigger (no FK simple) | **Recomendada** |
| `station_id uuid` nuevo en cada tabla | FK directa | reescribir 70.000+ productos, 294 ítems y 482 trabajos; doble columna durante la transición; tocar todas las RPC y el agente | Descartada |

Claves nuevas: se generan del nombre al crear (`Postres` → `postres`; si existe, `postres_2`), máx.
60 caracteres (ya lo admite `rutasCocina.ts:21`), `[a-z0-9_]`. **No se muestran al usuario salvo
en la exportación CSV** (columna «Código de estación») para que la importación sea estable.

Claves reservadas:

- **`all`** en una impresora = comodín «Todas las estaciones» (como hoy). No es una estación.
- **`cashier`** pasa a ser una estación de tipo **despacho** («Caja»): no aparece en la pantalla de
  cocina por defecto; recibe lo que se entrega en caja y sigue siendo el destino del recibo.

### 2.2 Tabla, migración y compatibilidad

```sql
-- Nueva (aditiva)
create table public.pos_stations (
  id              uuid primary key default gen_random_uuid(),
  organization_id int  not null references public.organizations(id) on delete cascade,
  code            text not null check (code ~ '^[a-z0-9_]{1,60}$'),
  name            text not null check (length(btrim(name)) between 1 and 40),
  kind            text not null default 'preparacion' check (kind in ('preparacion','despacho')),
  color           text not null default 'pizarra'
                  check (color in ('rojo','naranja','ambar','verde','cian','azul','violeta','rosa','pizarra')),
  icon            text not null default 'chef-hat'
                  check (icon in ('chef-hat','flame','snowflake','wine','coffee','cake-slice','cooking-pot','utensils-crossed','receipt')),
  sort_order      int  not null default 0,
  target_minutes  int  null check (target_minutes between 1 and 240),  -- NULL = umbral de la organización
  is_active       boolean not null default true,
  archived_at     timestamptz, archived_by uuid,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(),
  unique (organization_id, code)
);
create unique index pos_stations_nombre_activo_uq
  on public.pos_stations (organization_id, lower(btrim(name))) where is_active;

-- Sucursales donde existe (sin filas = todas)
create table public.pos_station_branches (
  station_id uuid not null references public.pos_stations(id) on delete cascade,
  branch_id  int  not null references public.branches(id) on delete cascade,
  organization_id int not null,
  primary key (station_id, branch_id)
);
```

- RLS por pertenencia con `(select auth.uid())` e `IN (SELECT … JOIN …)` (memoria: `EXISTS`
  anidado da timeout). Lectura: miembros de la organización. Escritura: solo por la RPC (§4).
- **Impresora asociada**: se sigue usando `printer_station_assignments (printer_id, branch_id,
  station)`, que ya es por sucursal. El diálogo de la estación la edita; el de la impresora también.
- **Tiempo objetivo**: `target_minutes`. Semáforo: **normal** hasta el 80 % del objetivo,
  **atención** del 80 % al 100 %, **crítico** al pasarlo. Objetivo 15 min → atención a los 12,
  crítico a los 15. Sin objetivo: el umbral de la organización (`pos_settings`, propuesta de
  `POS-MESAS-COMANDAS-RESERVAS.md` §7.11), por defecto 10/20 como hoy.

**Migración de datos (sin perder nada).**

1. Crear filas para cada organización que **usa** estaciones en cualquier tabla (hoy 120, 129, 130,
   132, 133, 140): las claves usadas + las 4 sugeridas, con los nombres de hoy — `hot_kitchen`
   «Cocina caliente» (rojo, `flame`, 15 min), `cold_kitchen` «Cocina fría» (cian, `snowflake`, 10),
   `bar` «Bar» (violeta, `wine`, 5), `cashier` «Caja» (pizarra, `receipt`, `despacho`).
2. Donde `products`/`categories` usan `all` (solo org 140: 4 categorías, 1 producto), crear la fila
   `all` «General» (pizarra, `utensils-crossed`): conserva el comportamiento exacto (hoy imprime en
   las impresoras «Todas»).
3. Las demás organizaciones **no reciben filas**: en Configuración › POS › Estaciones ven el estado
   vacío con «Crear las estaciones sugeridas» (las 4 de arriba, editables) o «Nueva estación».
4. Sustituir los 3 `CHECK` por un **trigger de validación** `fn_validar_estacion()` en
   `products`, `categories` y `printer_station_assignments`: la clave debe existir en
   `pos_stations` de la misma organización y estar activa (o ser `all` en impresoras). Es el **único
   cambio no aditivo** (quitar un `CHECK`); la reversión lo repone y solo es válida si no se
   crearon claves nuevas (lo dice el rollback).
5. `fn_producto_guardar` y `fn_importar_productos_lote`: validan contra la tabla. La importación
   acepta **nombre o código** (sin distinguir mayúsculas ni tildes) y, si no existe, **avisa** en el
   informe en lugar de descartar en silencio (E9); opción «Crear estaciones que no existan».
6. `kitchen_ticket_items.station` y `print_jobs.station` quedan como están (texto, sin FK): son
   historia. Como las filas usadas nunca se borran (§2.6), el nombre se resuelve siempre.

**Compatibilidad del código.** Un solo lugar resuelve clave → estación:
`useEstaciones()` (cliente, caché por organización, réplica offline) y `getEstaciones(orgId)`
(servidor). Sustituyen `ESTACIONES_COCINA`, `STATION_LABELS`, `OPCIONES_ESTACION`, `getStationInfo`
y los `STATION_LABELS` del agente. Si una clave no tiene fila (réplica vieja), se muestra la clave
con estilo neutro, nunca un error.

### 2.3 Configuración › POS › Estaciones (CRUD)

Tarjeta nueva en Configuración › POS, junto a «Impresoras» y «Notas rápidas» (`ConfiguracionPage.tsx:966-969`).

- **Listado** (tabla del kit, orden arrastrable): `EstacionChip` (color + icono + nombre), tipo
  (Preparación / Despacho), sucursales, impresoras por sucursal («Cocina 1 · Principal»,
  «Solo pantalla · Norte»), tiempo objetivo, **uso** («12 propios · 143 por categoría»), estado
  (`Badge` Activa / Archivada), menú ⋯ (Editar · Subir/Bajar · Archivar · Eliminar — este último
  solo si nunca se usó). Filtro «Ver archivadas».
- **Crear / editar** (diálogo 672): nombre (obligatorio, único entre activas), tipo, color (9
  muestras del manual), icono (9), tiempo objetivo en minutos, sucursales («Todas» o elegir),
  **impresora por sucursal** (Select de las impresoras activas de esa sucursal; «Sin impresora —
  solo pantalla de cocina»), vista previa del chip y de la cabecera de la columna del KDS.
- **Estado vacío**: «Aún no hay estaciones» + «Crear las sugeridas» + «Nueva estación».
- Permiso: `pos.configuracion.estaciones` (nuevo), resuelto en el servidor.

### 2.4 Asignación en categoría y producto (herencia)

- **Categoría** (sección «Cocina» de `CategoryForm`): Select con las estaciones activas (chip con
  color) + «Sin estación» + enlace «Administrar estaciones». Ayuda con el impacto: «38 productos
  heredan esta estación». Cambiarla muestra: «Cambia la estación de 38 productos que la heredan.
  Los 2 con estación propia no cambian.»
- **Producto** (`SeccionOrganizacion`): componente `CampoEstacion` con tres modos:
  - **Heredada**: caja de solo lectura «Heredada de la categoría: [chip Cocina caliente]» y casilla
    «Usar estación propia» (como hoy).
  - **Propia**: Select con chip + enlace «Volver a heredar (Cocina caliente)».
  - **Sin estación**: aviso «La categoría Bebidas no tiene estación: este producto no va a cocina.»
    con «Elegir estación propia» y «Asignar a la categoría».
- **Variantes**: heredan del padre (como `fn_estacion_efectiva`); en la variante se ve «Heredada del
  producto padre».
- **Acción masiva** en el listado de productos: «Cambiar estación…» (propia / volver a heredar),
  por RPC, con conteo antes de confirmar.

### 2.5 En la comanda, el KDS y la impresión

- La **ronda** sigue enviando la clave efectiva (sin cambios en `pos_cocina_enviar_ronda`).
- **Tablero y KDS**: pestañas de estación desde `pos_stations` (activas, de la sucursal, en su
  orden; las de tipo despacho solo en el tablero), cada una con su color, icono y contador. Los
  ítems sin estación van a la pestaña **«Sin estación»** (visible solo si hay alguno).
- **Estado por estación**: en el KDS de una estación, «Empezar» y «Lista» cambian **solo los ítems
  de esa estación**; la comanda pasa a «lista» cuando todas sus estaciones lo están (en la BD,
  §4 punto 6). Corrige E4.
- **Impresión**: el payload lleva `station` (clave) **y** `station_name` (nombre en el momento de
  imprimir); el agente imprime `station_name` y solo cae a la clave si falta. Corrige E7 y E8 sin
  tocar más el agente.
- **Ruteo**: impresoras de la estación en **esa sucursal** + las «Todas» de esa sucursal. El
  respaldo a otra sucursal (E6) se elimina: sin impresora, la comanda queda solo en pantalla y el
  aviso dice el **nombre**: «Postres no tiene impresora en Sucursal Norte; la comanda está en la
  pantalla de cocina.»
- **Mover un ítem de estación** (desde el detalle de la comanda, con permiso): «Enviar a otra
  estación…» cambia `kitchen_ticket_items.station` de ese ítem, reimprime en la nueva y deja rastro.

### 2.6 Renombrar, archivar o borrar una estación

| Acción | Con productos/categorías asignados | Con comandas vivas | Resultado |
|---|---|---|---|
| **Renombrar / cambiar color o icono** | se permite | se permite | Cambia al instante en todo (tablero, KDS, formularios, impresión siguiente). Las comandas ya impresas conservan el papel; la pantalla muestra el nombre nuevo. `code` no cambia |
| **Cambiar sucursales** | se permite | aviso si quita una sucursal con comandas vivas de esa estación | Las comandas vivas se terminan; las nuevas de esa sucursal salen «Sin estación» si el producto no tiene otra |
| **Archivar** | diálogo obligatorio: **«Mover a…»** (otra estación activa) **o** «Dejar sin estación» (van a «Sin estación» / impresoras «Todas»). Muestra conteos: propios, categorías, que heredan | las vivas **se terminan en la estación archivada** (sigue visible en el KDS hasta vaciarse, con la etiqueta «Archivada») | Deja de ofrecerse en formularios, importación y ruteo nuevo. El historial y los reportes la conservan |
| **Eliminar** | **no se permite** si alguna fila la usa hoy o la usó (ítems de comanda, trabajos de impresión) — se ofrece archivar | no se permite | Solo borra estaciones creadas por error y nunca usadas |
| **Reactivar** | — | — | Vuelve con su clave; lo que se movió no regresa solo |

El diálogo de archivar usa una RPC transaccional (`pos_estacion_archivar`) que mueve productos y
categorías, reasigna impresoras (opcional) y archiva, todo o nada, con auditoría.

### 2.7 Desktop sin conexión, agente, móvil, importación y pedidos web

- **Réplica**: añadir `pos_stations` y `pos_station_branches` al manifiesto
  (`replicationManifest.ts`) con `updated_at`; el resolutor PostgREST local ya sirve lecturas
  genéricas (memoria «Desktop: lectura offline genérica»). La estación efectiva sin conexión sigue
  con `estacionEfectiva()`.
- **Agente de impresión**: usa `payload.station_name`; se borra su mapa de etiquetas (corrige E8).
  `print_jobs.station` sigue siendo la clave para filtrar.
- **Móvil** (`mobileEscposAdapter.ts:432`): imprime el nombre.
- **Importación/exportación CSV**: columna «Estación» acepta nombre o código; la exportación
  escribe el nombre y añade «Código de estación».
- **Pedidos web**: sin cambios (usa `fn_estaciones_efectivas`).

### 2.8 Riesgos

| Riesgo | Mitigación |
|---|---|
| Quitar los `CHECK` deja texto libre si el trigger falla | trigger `BEFORE INSERT OR UPDATE OF station` probado con `DO` + `RAISE` antes de aplicar; test en `guardrails.test.ts` que prohíba nuevas listas de estaciones cableadas |
| Réplica offline sin la tabla (Desktop viejo) | la etiqueta cae a la clave con estilo neutro; el ruteo usa la clave igual que hoy |
| Nombres duplicados o parecidos («Bar» y «Barra») | UNIQUE por nombre activo sin mayúsculas; vista previa |
| Una estación sin impresora en una sucursal sin tablet | aviso en el listado («Solo pantalla · Norte») y al guardar; el aviso de la ronda dice el nombre |
| Rendimiento del conteo «uso» (70.000 productos) | contar en la RPC con índices `products (organization_id, station)` y `(organization_id, category_id)`; caché 60 s |
| Cambio de estado por estación altera la semántica de `kitchen_tickets.status` | el estado de la comanda se **deriva** en la BD de sus ítems (trigger), no se escribe desde el navegador |

---

## 3. Propuesta B — Comandas v2

### 3.1 Principios

1. **Dos modos, un solo dato.** «Tablero» (gestión: administrador, jefe de salón, caja) y «Cocina»
   (KDS: una estación, tablet de pared). Misma ruta `/app/pos/comandas` con `?modo=cocina&estacion=`
   (enlazable, se instala como acceso directo de la tablet); el modo cocina oculta el shell.
2. **Lo importante, grande.** Mesa (o «Mostrador #52», «Web P-2144»), tiempo con semáforo,
   cantidad × plato. Todo lo demás, secundario o en el detalle.
3. **Un toque por tarjeta.** Botón principal a lo ancho: Empezar → Marcar lista → Entregar.
   Nada se deshace sin confirmar.
4. **Filtros en una fila.** Estación como pestañas con contador (es lo que más se cambia); zona en
   un Select; sucursal ya está en el header (no se repite en chips). El **estado no es filtro**: son
   las columnas.
5. **Sin paginación.** Columnas con scroll propio; «Entregadas» muestra solo los últimos 30 min y
   enlaza al historial (listado paginado aparte).
6. **Turno actual.** Solo comandas del día de la organización (`todayInTz`); las vivas de días
   anteriores van a un aviso «62 comandas de días anteriores siguen abiertas · Revisar» (permiso de
   supervisor para cerrarlas en bloque con motivo).
7. **Manual de marca**: tokens de color (Light/Dark), `Badge`/estado con icono y texto (nunca solo
   color), iconos Lucide (sin emojis), menús ⋯ por tarjeta con un icono por acción, `EmptyState`,
   `Toast`, `ConfirmDialog` del kit, textos en es/en/fr/pt (`posComandas`, `posCocina`).

### 3.2 Modo Tablero (escritorio 1440, tablet con rail, móvil)

- **Cabecera** (`PageHeader`): «Comandas» · subtítulo «Sucursal Principal · 14 activas · 3
  demoradas · tiempo medio 9 min» · acciones: sonido (IconButton), **«Pantalla de cocina»**
  (primaria, abre el modo cocina de la pestaña activa), ⋯ de página (Historial de comandas ·
  Configurar estaciones · Impresoras).
- **Barra de filtros (una fila)**: pestañas `TabItem` «Todas 14 · Cocina caliente 8 · Cocina fría 3
  · Bar 3 · Postres 1» (con el color de cada estación) · a la derecha Select «Zona: Todas» y
  `SegmentedControl` «Comandas | Mesas» (agrupar).
- **Columnas**: Nuevas · En preparación · Listas para servir · Entregadas (últimos 30 min). Cada
  cabecera: nombre, contador y, en la vista de una estación, «Objetivo 15 min». Scroll propio por
  columna; orden: demoradas primero, luego por antigüedad.
- **Tarjeta de tablero** (`ComandaKDS v2 Densidad=tablero`): mesa grande, zona · mesero · hora,
  `TiempoTranscurrido` con el nivel del objetivo, ítems con cantidad y modificadores, notas de
  cocina (`LineNote`), alergia, ajuste, chips de estación por ítem **solo en «Todas»**, botón
  principal y **menú ⋯ de la tarjeta**: Ver comanda · Reimprimir · Enviar ítem a otra estación ·
  Devolver a «Nuevas» (confirma, conserva el tiempo) · Cancelar comanda (destructiva, motivo).
- **Agrupar por mesa**: una tarjeta por mesa con sus rondas apiladas («Mesa 4 · Ronda 1 servida ·
  Ronda 2 en preparación»), útil al salón para ver qué falta.
- **Arrastrar** se mantiene en escritorio (con teclado: Enter para la acción principal).

### 3.3 Modo Cocina (KDS, tablet 1024 × 768 horizontal, oscuro)

- **Barra superior** (56 px): selector de estación (chip grande con color; cambia sin salir),
  «Turno actual · 12 activas», reloj de la organización, sonido, estado de conexión, salir (pide
  PIN si se configura).
- **Tres columnas**: Nuevas · En preparación · Listas (las entregadas desaparecen a los 60 s con
  «Deshacer»).
- **Tarjeta KDS** (`ComandaKDS v2 Densidad=kds`): mesa 24 px semibold, tiempo 20 px con semáforo,
  ítems 18 px (cantidad en negrita), modificadores con «+», notas `LineNote`, «Otra estación: 1
  bebida (Bar)» al pie, botón 48 px de alto. Tocar un ítem lo marca hecho (tachado, check);
  **no hay ciclo de vuelta**: deshacer desde el ⋯ del ítem.
- **Alergia pendiente**: banda roja arriba, botón principal reemplazado por **«Confirmar alergia»**;
  al tocarlo, diálogo con el alérgeno, el plato y el comensal, casilla «Confirmo que la preparación
  evita el alérgeno» y «Confirmar y empezar». Queda quién y cuándo (ya existe
  `pos_cocina_confirmar_alergia`).
- **Comanda de ajuste**: borde de advertencia, etiqueta «Ajuste de #1044», líneas «+1 Hamburguesa
  · ahora 2», «ANULAR · Limonada» tachada con motivo, botón «Recibido».
- **Demorada** (crítico): borde y tiempo en rojo, sube al principio de su columna; nunca parpadea
  (accesibilidad: sin animación intermitente; `prefers-reduced-motion`).
- **Sonido/alerta**: tono distinto para nueva, ajuste y alergia; aviso visual 3 s en la tarjeta
  nueva; el volumen y el silencio se recuerdan por dispositivo.
- **Estados**: vacío («Sin comandas en Cocina caliente · las nuevas aparecen aquí solas»),
  **sin conexión** (banda ámbar «Sin conexión desde 12:41 · los cambios se enviarán al volver»; las
  acciones quedan en cola y la tarjeta muestra «Pendiente de enviar»), **sin permiso**
  (`EmptyState forbidden` con «Pide el permiso Operar cocina»), cargando (esqueleto de 3 columnas),
  error («No pudimos cargar las comandas · Reintentar»).

### 3.4 Móvil (390)

Tablero de una columna con `SegmentedControl` Nuevas · Preparación · Listas (con contador),
pestañas de estación desplazables, tarjetas de tablero, acción principal a lo ancho. Pensado para
el jefe de salón o el mesero que revisa «qué está listo»; la cocina usa tablet.

### 3.5 Detalle de comanda (diálogo / hoja en móvil)

Cabecera (mesa, ronda, mesero, origen, estado), ítems agrupados **por estación** con su estado,
notas, alergia (quién confirmó y cuándo), comanda original si es ajuste, **línea de tiempo**
(Enviada 12:31 · Empezada 12:33 · Lista 12:44 · Entregada 12:46, con quién), impresiones
(impresora, hora, estado del `print_job`) y acciones (Reimprimir, Enviar ítem a otra estación,
Cancelar comanda).

---

## 4. Cambios de BD y backend (no aplicados)

Todos por el MCP (`apply_migration`), con `.sql` en `supabase/migrations/` y reversión en
`supabase/rollbacks/` en el mismo commit (`docs/POLITICA-MIGRACIONES.md`). Se suman a
`POS-MESAS-COMANDAS-RESERVAS.md` §7 (K-4: rutas de cocina; K-5: pedido web con comanda) sin
repetirlos.

1. **`pos_stations` + `pos_station_branches`** (§2.2) con RLS por pertenencia e índices
   `(organization_id, sort_order)`.
2. **Backfill** (§2.2 pasos 1–3) en la misma migración, idempotente (`on conflict do nothing`).
3. **Trigger `fn_validar_estacion`** en `products`, `categories`, `printer_station_assignments` y
   retiro de los 3 `CHECK` (único cambio no aditivo, con su rollback).
4. **`fn_producto_guardar`, `fn_importar_productos_lote`, `fn_producto_int_variante_guardar`**:
   validan contra la tabla; la importación acepta nombre o código y avisa.
5. **RPC de estaciones** (`SECURITY INVOKER`, organización de la sesión, permiso
   `pos.configuracion.estaciones` en el servidor): `pos_estacion_guardar(p jsonb)` (crea/edita,
   genera `code`, sucursales e impresoras por sucursal en una transacción),
   `pos_estacion_ordenar(p_ids uuid[])`, `pos_estacion_archivar(p_id, p_mover_a text|null,
   p_impresoras jsonb)`, `pos_estacion_eliminar(p_id)` (falla con `estacion_en_uso`),
   `pos_estaciones_uso(p_org)` (conteos propios / por categoría / comandas vivas). Rutas
   `/api/pos/estaciones/**` con `getServerOrgContext()`.
6. **Estado por estación en la BD**: `kitchen_ticket_items.started_at`, `.ready_at` (NULL-ables);
   `kitchen_tickets.started_at`. RPC `pos_cocina_cambiar_estado(p_ticket_id, p_station text|null,
   p_estado, p_motivo)`: cambia los ítems de esa estación (o todos si NULL, desde el tablero),
   **deriva** el estado de la comanda (nueva si todos pendientes; preparando si alguno empezó;
   lista si todos listos o anulados; entregada al entregar), respeta la guarda de alergia y los
   `cancelled`, y registra el cambio. Sustituye `KitchenService.updateTicketStatus/updateItemStatus`
   y la autopromoción del navegador (E4, U7, K7). Retroceder conserva `ready_at` en el historial.
7. **Cancelar comanda**: `pos_cocina_cancelar(p_ticket_id, p_motivo)` → `status='cancelled'`,
   `cancelled_at`, `cancellation_reason` (columnas ya existen); reimprime «ANULADA» en la estación.
8. **Mover ítem de estación**: `pos_cocina_mover_item(p_item_id, p_station)` con reimpresión.
9. **Realtime**: publicar `kitchen_ticket_items` (filtro por `organization_id`).
10. **Lectura del tablero en el servidor**: `GET /api/pos/cocina/tablero?branch=&estacion=&zona=`
    con ventana de **turno actual** (día de la organización), conteos por estación y estado en la
    BD, y `vivas_anteriores` (conteo). Sin `limit` implícito: tope 300 vivas + 30 min de entregadas.
11. **Cierre en bloque de comandas viejas**: `pos_cocina_cerrar_anteriores(p_branch, p_motivo)`
    (permiso de supervisor) — resuelve las 62 actuales cuando el dueño lo decida.
12. **Permisos** nuevos en `permissions`: `pos.cocina.operar` (KDS: empezar, lista, entregar,
    confirmar alergia), `pos.cocina.gestionar` (cancelar, devolver, mover ítem, cerrar en bloque),
    `pos.configuracion.estaciones`. Asignar por migración a admin/gerente; `pos.cocina.operar` al rol
    de cocina.
13. **Impresión**: `station_name` en el payload de `enqueueKitchenTicket` y en los trabajos de la
    RPC; quitar el respaldo a otra sucursal (`printersService.ts:244-253`).
14. **Umbrales por organización** si no hay objetivo de estación (§2.2).

**No se toca**: `pos_cocina_enviar_ronda`, `pos_cocina_ajustar_linea_mesa`,
`pos_cocina_confirmar_alergia`, `fn_estacion_efectiva`, `fn_estaciones_efectivas` (siguen
devolviendo la clave).

## 5. Orden sugerido

1. BD de estaciones (1–5) + `useEstaciones()` + Configuración › POS › Estaciones + formularios de
   categoría y producto + impresión con nombre. (Con esto el dueño ya renombra y crea.)
2. Estado por estación (6–9) + rutas con permiso.
3. Tablero v2 (una fila de filtros, sin paginación, turno actual, ⋯ por tarjeta, agrupar por mesa).
4. Modo Cocina (KDS) + alergia en diálogo + sin conexión.
5. Detalle con línea de tiempo, cancelar, mover ítem, historial, cierre de comandas viejas.

## 6. Figma

Archivo `EAvjINVRnlzFM70GVoWXgl`. Enlace de cada nodo:
`https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=<id con guion>`. Capturas en
`docs/design/figma/` con prefijo `67-`. Todo lo dibujado es **Nuevo** (nota con `Marca/Nuevo`
encima de cada frame, fuera de él).

### 6.1 Componentes (`02 Componentes` › «POS — Restaurante (Nuevo)», `680:410510`, ampliada abajo)

| Componente | Node id | Variantes / propiedades | Captura |
|---|---|---|---|
| `Icon/Snowflake`, `Icon/Wine`, `Icon/Coffee`, `Icon/CakeSlice` | `952:31819`, `952:31825`, `952:31831`, `952:31837` | Lucide, trazo 1,5 ligado al token del kit, escalables | — |
| `EstacionChip` | `952:31928` | `Color` (9 del manual) × `Tamaño=sm/md` · `Nombre`, `Icono` (swap) | `67-pos-componente-estacion-chip.png` |
| `PestanaEstacion` | `952:31944` | `State=default/active` · `Texto`, `Contador`, `Mostrar color` | (en los tableros) |
| `CampoEstacion` | `952:31997` | `Modo=heredada/propia/sin-estacion` | `67-pos-componente-campo-estacion.png` |
| `ComandaItemKDS` | `953:194792` | `Estado=pendiente/hecho/anulado/ajuste` × `Densidad=kds/tablero` · `Cantidad`, `Producto`, `Modificadores`, `Mostrar modificadores`, `Mostrar nota` (LineNote) | `67-pos-componente-comanda-item-kds.png` |
| `ComandaKDS v2` | `953:195581` | `Estado=nueva/preparando/lista/demorada/alergia/ajuste` × `Densidad=kds/tablero`; reutiliza `ComandaItemKDS`, `LineNote`, `TiempoTranscurrido`, `Button`, `Badge`, `IconButton`, `EstacionChip` | `67-pos-componente-comanda-kds-v2.png` |

`ComandaKDS v2` sustituye a `ComandaCard` (`448:208215`) y a `ComandaKDS · notas` (`848:30505`),
que quedan como antecedente.

### 6.2 «POS — Estaciones configurables (propuesta)» (`05 POS y ventas`, sección `957:105987`)

| Frame | Node id | Captura |
|---|---|---|
| Escritorio / Configuración › POS › Estaciones — listado (menú ⋯ abierto) | [`957:105990`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=957-105990) | `67-pos-estaciones-escritorio-listado.png` |
| Diálogo — Nueva estación | [`957:106674`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=957-106674) | `67-pos-estaciones-dialogo-nueva.png` |
| Diálogo — Archivar estación con productos asignados | [`957:106895`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=957-106895) | `67-pos-estaciones-dialogo-archivar.png` |
| ConfirmDialog — Eliminar estación sin uso | [`957:106975`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=957-106975) | `67-pos-estaciones-confirm-eliminar.png` |
| Formulario de categoría — sección «Cocina» (Select abierto) | [`958:106600`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=958-106600) | `67-pos-estaciones-categoria-cocina.png` |
| ConfirmDialog — Cambiar la estación de una categoría | [`958:106736`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=958-106736) | `67-pos-estaciones-confirm-cambiar-categoria.png` |
| Formulario de producto — Organización › Estación (3 casos) | [`958:106787`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=958-106787) | `67-pos-estaciones-producto-campo-estacion.png` |
| Móvil 390 / Configuración › POS › Estaciones | [`958:106876`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=958-106876) | `67-pos-estaciones-movil-listado.png` |

Vista de la sección: `67-pos-estaciones-seccion.png`.

### 6.3 «POS — Comandas v2 (propuesta)» (`05 POS y ventas`, sección `959:583911`)

| Frame | Node id | Captura |
|---|---|---|
| Escritorio / Comandas — tablero (Todas, turno actual, ⋯ de tarjeta abierto) | [`959:583914`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=959-583914) | `67-pos-comandas-escritorio-tablero.png` |
| Escritorio / Comandas — agrupado por mesa (Cocina caliente) | [`959:584798`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=959-584798) | `67-pos-comandas-escritorio-agrupado-por-mesa.png` |
| Móvil 390 / Comandas — tablero | [`959:585351`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=959-585351) | `67-pos-comandas-movil-tablero.png` |
| Tablet 1024 / Cocina — KDS Cocina caliente (listo, oscuro) | [`960:278237`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=960-278237) | `67-pos-cocina-tablet-kds-listo.png` |
| Tablet 1024 / Cocina — confirmar alergia | [`960:278490`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=960-278490) | `67-pos-cocina-tablet-confirmar-alergia.png` |
| Tablet 1024 / Cocina — sin conexión | [`960:278809`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=960-278809) | `67-pos-cocina-tablet-sin-conexion.png` |
| Tablet 1024 / Cocina — sin comandas | [`960:279084`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=960-279084) | `67-pos-cocina-tablet-vacio.png` |
| Tablet 1024 / Cocina — sin permiso | [`960:279168`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=960-279168) | `67-pos-cocina-tablet-sin-permiso.png` |
| Diálogo — Detalle de comanda (por estación + línea de tiempo) | [`961:278836`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=961-278836) | `67-pos-comandas-dialogo-detalle.png` |
| Diálogo — Cancelar comanda (con motivo) | [`961:279025`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=961-279025) | `67-pos-comandas-dialogo-cancelar.png` |
| ConfirmDialog — Devolver comanda a «Nuevas» | [`961:279085`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=961-279085) | `67-pos-comandas-confirm-devolver.png` |
| Escritorio / Comandas — cargando · vacío · error · sin permiso | [`961:279128`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=961-279128) · [`961:279453`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=961-279453) · [`961:279778`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=961-279778) · [`961:280129`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=961-280129) | `67-pos-comandas-escritorio-{cargando,vacio,error,sin-permiso}.png` |

Vista de la sección: `67-pos-comandas-v2-seccion.png`. El modo oscuro del KDS es el modo `Dark`
de la colección `Color` aplicado al frame (los componentes del kit lo heredan).

### 6.4 Chequeo por script

- Sección `957:105987`: 18 hijos, **0 solapes**, 0 fuera de la sección, 0 nodos ajenos en su
  área, 230 instancias, **0 rotas**, 207 textos, **0 recortados**.
- Sección `959:583911`: 32 hijos, **0 solapes**, 0 fuera, 0 ajenos, 806 instancias, **0 rotas**,
  730 textos, **0 recortados no intencionales**; 8 recortes intencionales: columnas del KDS con
  desplazamiento propio (6) y la fila de pestañas desplazable del móvil (2).
- Sección de componentes `680:410510`: 0 solapes entre hijos (se acortó la etiqueta de iconos que
  tocaba la de `EstacionChip`), 0 fuera, 0 ajenos, 155 instancias en los componentes nuevos,
  0 rotas, 0 textos recortados.

### 6.5 Pendiente / a revisar

1. Los frames de escritorio reutilizan el `Sidebar` del tablero de comandas (activo «Punto de
   venta»); en Configuración › POS debería marcar «Configuración» cuando se implemente la ruta.
2. `TiempoTranscurrido` (`680:410531`) es pequeño para la tablet: el KDS usa una píldora de 20 px
   propia de `ComandaKDS v2`. Conviene añadir a `TiempoTranscurrido` un `Tamaño=grande`.
3. Al cambiar el icono de un `EstacionChip` por su propiedad, hay que recolorear el trazo al tono
   del chip (Figma no hereda el color en el cambio de instancia); en código el color sale del token.
4. No se dibujó el selector de estación del KDS abierto (es el mismo `Select` con `EstacionChip`
   del formulario de categoría) ni la acción masiva «Cambiar estación…» del listado de productos.

## 7. Preguntas para el dueño (con recomendación)

1. **¿Estaciones por organización o por sucursal?** Recomendación: **por organización, con
   sucursales opcionales** (una estación puede existir solo en algunas). Así «Parrilla» es la misma
   en reportes y la impresora se elige por sucursal.
2. **¿Qué hacemos con «Caja»?** Recomendación: que sea una estación de tipo **Despacho**,
   renombrable, que no sale en la pantalla de cocina y recibe lo que se entrega en caja; el recibo
   sigue saliendo por su impresora.
3. **¿Crear estaciones sugeridas a todas las organizaciones?** Recomendación: **no**; solo a las 6
   que ya usan estaciones. Las demás ven «Crear las sugeridas» con un toque.
4. **¿La pantalla de cocina es un modo de `/app/pos/comandas` o una ruta aparte?** Recomendación:
   **modo de la misma ruta** (`?modo=cocina&estacion=`) con su propio permiso `pos.cocina.operar`;
   se abre desde el tablero y se instala como acceso directo en la tablet.
5. **¿Qué hacemos con las 62 comandas vivas de días anteriores** (org 120: 36, org 2: 22, otras 4)?
   Recomendación: cerrarlas en bloque como «entregadas (cierre automático)» con motivo, y en
   adelante mostrar solo el turno actual con el aviso de pendientes.
6. **¿Borrar estaciones?** Recomendación: solo si nunca se usaron; si no, **archivar** con
   «Mover a…». Nunca se pierde el nombre en el historial.
7. **¿Estado por estación?** Recomendación: **sí** — cada estación marca lo suyo y la comanda queda
   lista cuando todas terminan (hoy el bar puede «terminar» los platos de la cocina).
8. **¿Hay tablet en alguna cocina hoy?** Si no, el paso 4 (KDS) puede esperar y priorizar 1–3; la
   impresión por estación ya cubre la cocina con papel.
