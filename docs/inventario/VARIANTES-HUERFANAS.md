# Variantes de un padre eliminado («variantes huérfanas»)

> 2026-09-30 · migraciones `20260930233000`, `20260930233100` y `20260930233200` (aplicadas
> por MCP, con rollback en `supabase/rollbacks/`). Sin nombres de organización: solo ids.

## Síntoma

En la org 137 el inicio («Hoy» → «Stock crítico») decía **226 agotados**, y la lista de
Productos con el filtro «Sin stock» mostraba **0**.

## Causa

Un producto se elimina con baja lógica (`products.status = 'deleted'`). Eliminar un
**padre** no tocaba a sus **variantes** (`products.parent_product_id` → padre): se
quedaban vivas.

- `catalogo_productos_lote` (lista de Productos) solo trae padres → las huérfanas no
  aparecen.
- `fn_stock_listado` (inicio vía `stockService.listarStock` → `bloqueHoy.server.ts`, y
  `/app/inventario/stock`) filtraba `status <> 'deleted'` producto por producto: como el
  padre ya no estaba, cada variante salía **como una fila suelta** y contaba en los KPI.

Cifras del 2026-09-30, antes de corregir:

| org | variantes vivas bajo padre eliminado | padres eliminados |
|---:|---:|---:|
| 120 | 47 | 11 |
| 128 | 242 | 84 |
| 129 | 2 | 1 |
| 132 | 488 | 59 |
| 134 | 3 | 1 |
| 135 | 27 | 27 |
| 137 | 936 | 130 |
| 144 | 220 | 27 |
| 145 | 27 | 27 |
| 198 | 92 | 31 |
| **total** | **2.084** | **398** |

Todas estaban en `active`. Ninguna tenía ventas. En la org 137, 226 no tenían existencias
en la sucursal 112: exactamente los «226 agotados» del inicio.

## Caminos que eliminan un producto

Todos acaban en un `UPDATE products SET status = …`:

| Camino | Quién lo usa | Antes | Ahora |
|---|---|---|---|
| `fn_producto_cambiar_estado` | detalle del producto; desde hoy también la lista | no arrastraba variantes | cascada por disparador |
| `soft_delete_product` | la lista de Productos (hasta hoy) | no arrastraba; solo exige membresía, no `inventory.delete` | ya no se llama desde `src/` (la lista usa `productoService.cambiarEstado`); si alguien la llama, el disparador arrastra |
| `deactivate_product` (2 firmas) | sin llamadores en `src/` | no arrastraba | el disparador arrastra |
| `fn_productos_estado_masivo` | acciones masivas | ya arrastraba (desde 2026-09-29) | al eliminar deja las variantes al disparador para guardar su estado; mismo resumen |
| `fn_producto_guardar` (editar) | formulario | da de baja las variantes quitadas | igual (baja de variante, no de padre) |
| `fn_producto_variante_estado` | una variante | — | igual |
| `fn_importar_productos_lote` | importador | restaura un eliminado (`PRODUCTO_RESTAURADO`) | la restauración devuelve sus variantes; una fila de variante bajo un padre eliminado falla con `VARIANTE_PADRE_ELIMINADO` |
| `UPDATE` directo por PostgREST | posible por `products_update_policy` | no arrastraba | el disparador arrastra |

## Decisiones

1. **Disparador, no una RPC más** (`trg_producto_baja_variantes`, `AFTER UPDATE OF status`).
   Es el único punto por el que pasan todos los caminos, incluidos los legados y el `UPDATE`
   directo. Corre en la misma transacción que la baja del padre.
2. **Restaurar un padre devuelve solo las variantes que cayeron con él**, cada una a su
   estado exacto (se guarda en `private.inv_variantes_baja_en_cascada`). Las que ya estaban
   eliminadas antes, o se quitaron al editar, siguen eliminadas. La acción masiva no alcanza
   productos eliminados (ya era así): se restaura por el detalle o por el importador.
3. **Guarda** `trg_producto_variante_padre_vigente` (`BEFORE INSERT OR UPDATE OF status,
   parent_product_id`): no se crea, no se revive (`deleted` → vivo) ni se mueve una variante
   viva bajo un padre eliminado → `variante_padre_eliminado` (23514). Cambiar entre estados
   vivos sí se permite, para no bloquear las huérfanas que quedaron con inventario.
4. **Lecturas**: predicado canónico con alias `pp_elim` (guardarraíl 39):
   `not exists (select 1 from public.products pp_elim where pp_elim.id = p.parent_product_id and pp_elim.status = 'deleted')`.
   En el navegador (PostgREST) se trae `padre:products!parent_product_id(status)` y se filtra
   con `padreEliminado()` de `src/lib/inventario/variantesHuerfanas.ts`.
5. **Traslados, lotes y ajustes siguen viendo las huérfanas que quedan**: son la herramienta
   para sacar ese inventario (ajustarlo a cero o moverlo) antes de darlas de baja.

## Funciones SQL cambiadas

Se parcheó la definición viva (fragmento que aparece una sola vez) con el md5 de `prosrc`
comprobado antes y después:

| Función | md5 antes | md5 después | Para qué |
|---|---|---|---|
| `fn_stock_listado` | `ea36b5a1cc8339effa4cc6ecb7f7199d` | `f1fdb0f8f75c4ed15a262c35a1e4cbf7` | stock e inicio |
| `pos_product_ranking` | `ca799476e1b78de44a351173e68f2945` | `255fedb9c9f32a1a4fdab5794420a56a` | cuadrícula/búsqueda del POS |
| `buscar_productos` | `9f72aab3d0db3f37a01d028fba2732fd` | `71caa0fb78db65657c1c0fec73140c90` | búsqueda global, GO Assistant |
| `fn_reporte_stock_critico` | `2e456e5c88ec1eb070cfa40efec8c6f2` | `4373083611844463942759ca42bee065` | alertas de stock bajo |
| `fn_reporte_rotacion_inventario` | `6be3308cff4c47dab430f0086a4d4b66` | `f39681ad5f2ec25498689ff130e7f4c7` | inventario sin movimiento |
| `fn_productos_estado_masivo` | `2313276899bfe5433ff3b7d5d453e44e` | `5a07af394490108d83143753c749aa25` | eliminar masivo guarda el estado de las variantes |

Nuevas: `fn_producto_int_baja_variantes()`, `fn_producto_int_variante_padre_vigente()` (sin
EXECUTE para nadie) y la tabla `private.inv_variantes_baja_en_cascada`.

Rendimiento de `fn_stock_listado` en la org 137 (admin simulado, sucursal 112,
`EXPLAIN (ANALYZE, BUFFERS)`): antes 278–306 ms / 9.778–13.533 buffers; después 293 ms /
13.745 buffers (todas las sucursales: 296 ms). El `not exists` es una anti-unión por la PK:
sin cambio apreciable.

En el navegador: `inventoryDashboardService` (sección Inventario del inicio y su tablero)
excluye las huérfanas en KPI, alertas y resumen por sucursal, y resta las activas del
conteo de productos activos.

## Limpieza de datos (`20260930233200`)

Clasificación previa por MCP en solo lectura sobre las 43 FK a `products.id`:

- **Bloquean** (la variante se queda): `stock_levels` con existencia o reserva ≠ 0, ventas,
  pedidos web, órdenes de compra, recepciones, traslados, cotizaciones, facturas, envíos,
  devoluciones, producción, membresías, folios, seriales, reservas de stock activas,
  carritos vigentes, ajustes sin publicar, conteos cíclicos, recetas activas que la usan,
  promociones activas, servicios y oportunidades.
- **No bloquean** (historia o atributos propios): kardex (`stock_movements`, 471
  variantes), ajustes publicados (14), precios, costos, imágenes, etiquetas.

Resultado (dry-run con `DO … RAISE EXCEPTION 'RESULTADOS:%'` idéntico a la aplicación):

| org | limpiadas | se quedan | por qué se quedan |
|---:|---:|---:|---|
| 120 | 35 | 12 | existencias positivas |
| 128 | 242 | 0 | — |
| 129 | 1 | 1 | existencias positivas |
| 132 | 430 | 58 | existencias positivas |
| 134 | 0 | 3 | existencias positivas |
| 135 | 27 | 0 | — |
| 137 | 225 | 711 | 710 existencias positivas; 1 en una promoción activa (id 47966) |
| 144 | 116 | 104 | 98 existencias positivas, 6 negativas (51803, 51805, 64424–64427); 6 de ellas son ingrediente de una receta activa |
| 145 | 27 | 0 | — |
| 198 | 92 | 0 | — |
| **total** | **1.195** | **889** | |

Las 882 con existencias positivas suman 46.053 unidades; valor al costo promedio de
`stock_levels` 5.120.800 (orgs 120, 129 y 132; las de 134, 137 y 144 tienen costo 0).

Ids que se quedan (tramos consecutivos):

- org 120: 14772–14773, 14776–14778, 14783, 14792, 14848–14850, 14893, 14899
- org 129: 8756
- org 132: 14108–14111, 14114–14115, 14195–14196, 14199, 14235, 14277, 14301, 14303, 14313, 14332, 14380, 14385, 14391, 14463, 14465, 14476, 14495, 14499, 14519, 14557, 14602, 14617, 14627, 14631, 14640, 14645, 14653, 14660, 14667, 14676, 14682, 14688, 14697, 14703–14705, 14709–14712, 14720–14721, 14728, 14734, 14741–14744, 15895–15899
- org 134: 51577–51579
- org 137: 42103–42110, 42243, 42407–42413, 42449–42455, 42756–42758, 42760–42762, 42766–42770, 42860–42866, 42970–42973, 42981–42982, 42986–42988, 42999–43000, 43009–43011, 43021–43026, 43028, 43134–43136, 43159–43165, 43173–43180, 43182–43185, 43301–43304, 43352–43359, 43368–43377, 43379–43380, 43384–43394, 43398–43408, 43412–43415, 43424–43425, 43466–43468, 43472–43482, 43486–43494, 43498–43500, 43521–43524, 43545–43554, 43556–43559, 43567–43570, 43599–43603, 43607–43610, 43659–43662, 43740–43742, 43744–43747, 43770, 43772–43774, 43778–43789, 43791–43794, 43798–43806, 43818–43825, 43829–43843, 43845, 44803–44806, 45361–45367, 45385–45387, 45392–45398, 46615–46619, 47257, 47966, 55199–55209, 57316, 57402–57413, 57417–57428, 57432–57444, 72388–72400, 72421–72450, 72518–72526, 75014–75017, 75184–75191, 76081–76100, 76168–76171, 76248–76255, 76261–76267, 76284–76287, 76294–76296, 76300–76311, 76350–76352, 76356–76379, 76390–76408, 76411–76413, 76420–76421, 76432–76441, 76444–76445, 76467–76469, 76490–76491, 76526–76528, 76532–76533, 76547–76559, 76564–76573, 76575–76577, 77110–77116, 77760–77763, 77812–77817, 77920–77927, 78071–78073, 78157–78161, 78289–78292, 78436–78439, 78589–78593, 78606–78608, 79210, 79213–79310, 79333–79336, 79357–79360
- org 144: 51803, 51805, 62589–62592, 62597–62600, 62602, 62605, 62607, 62610, 62615, 62617, 62622–62625, 62627, 62630–62632, 62634–62635, 62638–62641, 62644–62645, 62649–62651, 62653–62654, 62657, 62660, 62666, 62672, 62675–62676, 62680–62681, 62685–62688, 62690–62691, 64320–64321, 64325–64326, 64329, 64333, 64336, 64338, 64342, 64345–64346, 64349–64352, 64354, 64356–64358, 64366, 64368–64369, 64375–64376, 64378–64379, 64381–64383, 64387, 64389, 64391, 64393–64396, 64398, 64402, 64406–64407, 64411–64415, 64417–64418, 64420–64421, 64424–64427

Consulta para reproducir la lista:

```sql
select v.organization_id, v.id
  from products v join products p on p.id = v.parent_product_id
 where p.status = 'deleted' and coalesce(v.status, 'active') <> 'deleted'
 order by 1, 2;
```

### Qué hacer con las que se quedan (propuesta, decide cada organización)

Son inventario real bajo un padre que nadie ve: desde hoy **no cuentan** en stock, inicio,
POS ni reportes (igual que ya no se veían en la lista de Productos).

1. **Si el padre se eliminó por error** (lo más probable en la org 137: 45.780 unidades en
   710 variantes de 122 padres eliminados entre el 2026-09-05 y el 2026-09-16): restaurar el
   padre desde su detalle. Las variantes siguen vivas y vuelven a verse con su stock.
2. **Si el producto de verdad se retiró**: ajuste de inventario a cero de esas variantes
   (salida por merma/baja, queda en el kardex y en contabilidad) y después eliminarlas; o
   eliminar el padre de nuevo: el disparador ya no deja ninguna viva.
3. Las 6 con stock negativo (org 144) necesitan un ajuste de entrada antes de cualquiera de
   las dos opciones. La promoción activa de la org 137 debe quitar la variante 47966.

## Verificación

- Inicio de la org 137 (`fn_stock_listado` con `request.jwt.claims` de un admin y
  `set local role authenticated`): **antes** agotados 226, productos 3.572, con existencias
  3.346 → **después** agotados 0, productos 2.636, con existencias 2.636, en la sucursal
  112 y en todas. Coherente con la lista de Productos («Sin stock» = 0).
- Cascada en un padre de prueba (transacción revertida): eliminar por `UPDATE`,
  `fn_producto_cambiar_estado` y `fn_productos_estado_masivo` → variantes `active` e
  `inactive` pasan a `deleted` con su estado guardado; restaurar → vuelven a `active` e
  `inactive`; la ya eliminada sigue eliminada; revivir o crear una variante bajo el padre
  eliminado → `variante_padre_eliminado` / 23514. Masivo de 2 padres + 1 variante elegida:
  `actualizados 5, seleccionados 3, variantes 2`.
- Ida y vuelta de los tres rollbacks en una transacción revertida: 0 funciones con md5
  distinto al original, 2.084 huérfanas de nuevo y 0 filas con `status`/`updated_at`
  distintos.
- Pruebas: `src/__tests__/db/variantesHuerfanas.test.ts` y guardarraíl 39 de
  `src/__tests__/guardrails.test.ts`.

## Cómo revertir

En este orden (cada rollback se niega o avisa si el anterior falta):

1. `supabase/rollbacks/20260930233200_inv_variantes_huerfanas_limpieza_rollback.sql` —
   devuelve las 1.195 variantes a su `status` y `updated_at` exactos (lee
   `private.inv_variantes_baja_en_cascada`, origen `limpieza_20260930`). Salta la guarda
   solo en su transacción (`inv.permitir_variante_huerfana`).
2. `supabase/rollbacks/20260930233100_inv_variantes_huerfanas_lecturas_rollback.sql` —
   cinco funciones a su md5 original.
3. `supabase/rollbacks/20260930233000_inv_variantes_baja_en_cascada_rollback.sql` — quita
   los disparadores, devuelve `fn_productos_estado_masivo` a su md5 original y borra la
   tabla del rastro. No revierte las bajas en cascada que haya habido entre medias
   (consultar la tabla antes si hacen falta).

## Pendiente fuera de este cambio

- `soft_delete_product` y `deactivate_product` siguen en la base sin comprobar
  `inventory.delete` (solo membresía). Ya no se llaman desde `src/`; conviene retirarlas o
  darles el mismo permiso que `fn_producto_cambiar_estado`.
- `fn_pos_validar_linea_venta` no rechaza vender un producto eliminado ni una variante
  huérfana (el POS no las ofrece; una venta fuera de línea sí podría).
- `fn_traslado_productos`, `fn_lotes_listado`, `get_catalogo_productos`,
  `get_parent_product_stock_summary`, `get_products_below_min_level` (sin llamadores) y
  `fn_notify_stock_low` no llevan el predicado: ver decisión 5.
- Sitio web (repo hermano `goadmin-websites`, solo lectura): los listados y la búsqueda
  traen solo padres activos (`parent_product_id is null`), así que no muestran huérfanas.
  Quedan expuestas por id o uuid directos: `getProductsByIds` (favoritos, re-pedidos),
  `getProductById`, `app/productos/[id]` por uuid, `getProductVariantRelations`; y
  `app/api/orders` no comprueba `status` de los productos del carrito (acepta uno
  eliminado). Tras la limpieza el alcance son las 889 que se quedan.

## RPC legadas y POS con productos eliminados (2026-09-30, segunda ronda)

> Migraciones `20260930234000` y `20260930234100`, aplicadas por MCP, con rollback en
> `supabase/rollbacks/`. Cierra los dos primeros puntos de «Pendiente fuera de este cambio».

### 1. `soft_delete_product` y `deactivate_product`

Llamadores buscados: `src/` (ninguno desde `e65f9b1a`; el guardarraíl 39 lo impide),
`supabase/functions` (ninguno), otras funciones SQL (`pg_proc.prosrc`: ninguna) y
`goadmin-websites` en solo lectura (ninguno). `deactivate_product` no tuvo llamadores nunca
en la historia de `src/`; `soft_delete_product` lo usaban la lista y las acciones masivas
hasta ese commit.

| Función | Antes | Ahora | Por qué |
|---|---|---|---|
| `soft_delete_product(integer)` | solo membresía; EXECUTE `authenticated` | **delega** en `fn_producto_cambiar_estado(org, id, 'deleted')`: `fn_assert_acceso_org` + `inventory.delete` / `product_management` / `inventory_management` por `check_user_permission` (o dueño); `search_path` fijo | una pestaña con el paquete anterior a `e65f9b1a` aún puede llamarla: sigue funcionando para quien tiene el permiso. Sin lógica duplicada, sin `role_id` cableado |
| `deactivate_product(integer)` | leía la organización de un claim del JWT que no existe | sin EXECUTE para `public`/`anon`/`authenticated` (queda `service_role`) | sin llamadores; además, llamarla con un argumento era ambiguo con la otra firma |
| `deactivate_product(integer, integer)` | `fn_assert_acceso_org`, sin permiso fino | ídem | sin llamadores |

md5 de `prosrc`: `soft_delete_product` `5994240bc79ad07b3d6343f25bd739e6` →
`75499bb13aedddb65b71f5ee8975199f`; las dos `deactivate_product` sin cambio
(`2b7b6d6b02ce4dac1280062e8b81fdd2`, `b08547c67b6743c637dd090c803a32c5`), solo permisos.

Prueba en seco (org 144, producto 63992, `request.jwt.claims` + `set local role authenticated`):
miembro sin permiso → `sin_permiso`; miembro con `inventory.delete` → eliminado; usuario de
la org 135 → «Acceso denegado a la organización»; `anon` → sin EXECUTE; `deactivate_product`
→ «permission denied» para los tres. Repetida después de aplicar: igual.

### 2. El POS rechaza en el servidor vender un producto eliminado

Punto único (regla 7): **`fn_producto_exigir_vendible(p_org, p_product, p_momento)`**. Si el
producto o su padre tienen `status = 'deleted'` → `producto_eliminado` (22023), con el nombre y
el id en `details`. Pasa si `p_momento` es **anterior a la baja**; la baja es la última
transición a `deleted` en `products_audit_log` (la más temprana entre producto y padre) y, si no
hay rastro, `updated_at`. Sin momento o sin fecha de baja se rechaza. `inactive` y
`discontinued`: sin cambio (el servidor no los bloqueaba y sigue sin bloquearlos).

Quién lo llama:

| Camino | Momento | md5 antes → después |
|---|---|---|
| `fn_pos_validar_linea_venta` → `pos_checkout_v1`: mostrador, crédito, outbox sin conexión | en línea `now()`; sin conexión la hora del equipo (nunca futura) | `c746ceafe47ad9d2c280f3a3164d9b5f` → `57205fc766689e75b59b572450959797` |
| ídem, cobro de una mesa (`settle`) | `sale_items.created_at` de cada línea | (misma función) |
| `fn_factura_venta_guardar`, solo el alta | `now()` | `7018240f33a289a5c5600b9d4646a0dc` → `b4d7eabca066fd0b0d3ec218a8cafca0` |
| `assistant_register_sale` (GO Assistant) | `now()` | `acd10cef219c064df062b57bc112933c` → `362b402609545ca209ad63f86bd222e6` |
| `assistant_register_sales_invoice` (GO Assistant) | `now()` | `cf16d1953aacc29a8ddd2e7062b4a49b` → `24784c3215a4fcd06ccfddfc08beb16d` |

`fn_producto_exigir_vendible` es nueva (md5 `eff8466949db9e4ab225c37644bf4296`), SECURITY
DEFINER con `search_path` fijo, exige `fn_assert_acceso_org`; EXECUTE para `authenticated`
(las dos de GO Assistant son SECURITY INVOKER) y `service_role`, no para `anon`/`public`.

**Decisiones sobre los casos que no deben romperse**

- **Venta sin conexión hecha cuando el producto existía**: se acepta. El momento es la hora
  del equipo que ya usa el precio vigente; si el reloj estaba desfasado la venta entra y queda
  marcada `reloj_desfasado` por el mecanismo de hora oficial que ya existía
  (`docs/design/HORA-SERVIDOR-ANALISIS.md`). Una venta sin conexión **posterior** a la baja
  (catálogo viejo en caché) se rechaza: `salesSync` la reintenta y termina en
  `needs_review` con el sobre íntegro; la bandeja de pendientes muestra el mensaje traducido.
  Salida: restaurar el producto en Inventario y «Reintentar». La reproducción de un sobre cuya
  venta ya existe no revalida (sin cambio).
- **Devoluciones y notas crédito** de ventas antiguas de productos hoy eliminados: no pasan
  por la comprobación (`procesar_devolucion`, `fn_nota_credito_emitir` operan sobre
  `sale_items` ya guardados). Probado.
- **Mesas**: una línea pedida antes de la baja se cobra; una añadida después se rechaza al
  cobrar (el pedido de mesa lo inserta el navegador; el servidor lo valida en el cobro).
- **No la llaman, a propósito**: la confirmación de un pedido web (el pedido ya se hizo y
  se pagó en el sitio; lo que falta es que `goadmin-websites` no lo acepte, ver pendiente),
  el cargo de folios PMS a la venta del checkout del hotel (el cargo es anterior) y el
  traslado de una línea entre mesas.

Prueba en seco (org 144, admin simulado, sucursal 119, producto 63882, todo revertido):

| Caso | Resultado |
|---|---|
| POS en línea, producto activo | venta pagada |
| POS en línea, producto eliminado | `producto_eliminado` · «…» (producto 63882) está eliminado. |
| sin conexión, hora del equipo 1 h antes de la baja | venta pagada |
| sin conexión, 20 min antes de la baja con reloj desfasado 15 min | venta pagada, `time_review_reason = reloj_desfasado` |
| sin conexión, hora = baja | `producto_eliminado` |
| línea de mesa pedida 1 h antes / después | pasa / `producto_eliminado` |
| variante viva 62589 bajo padre eliminado | `producto_eliminado` · «…»: su producto padre está eliminado. (momento 2020 → pasa) |
| producto inactivo 63907 | pasa (sin cambio) |
| devolución de una venta antigua de 63882 ya eliminado | hecha, con nota crédito y saldo a favor |
| factura de venta nueva / GO Assistant venta / GO Assistant factura | `producto_eliminado` las tres; con un producto activo, la factura del asistente se crea |
| usuario de la org 135 llama al helper para la org 144 / `anon` | «Acceso denegado» / sin EXECUTE |

Ida y vuelta de los rollbacks en una transacción revertida: las cuatro funciones vuelven a su
md5 original, `soft_delete_product` a `5994240bc79ad07b3d6343f25bd739e6` y
`deactivate_product` recupera el EXECUTE de `authenticated`.

**Interfaz**: `producto_eliminado` entra en `CODIGOS_ERROR_COBRO` (cobro y mesas lo traducen con
`posCobroServidor.errores`), en `ERRORES_FACTURA` (422, `facturasVenta.errores`), en la bandeja
sin conexión (`mensajeErrorOutbox`, que traduce el `last_error` de `salesSync`) y en los
mapeos de error de GO Assistant. Textos en es/en/fr/pt.

**Pruebas**: `src/__tests__/pos/productoEliminadoServidor.test.ts` (contrato de las dos
migraciones, parches y rollbacks simétricos, mapeo del error, textos en 4 idiomas), caso nuevo
en `src/__tests__/services/goAssistantPreguntasYFacturaVenta.test.ts` y guardarraíl 40 de
`src/__tests__/guardrails.test.ts` (toda función nueva que inserte en `sale_items` pasa por
`fn_producto_exigir_vendible` o por `fn_pos_validar_linea_venta`).

### Sigue pendiente

- `goadmin-websites` `app/api/orders` no comprueba `status` de los productos del carrito: es
  ahí donde un pedido web con un producto eliminado debe rechazarse (PR aparte en ese repo).
- `assistant_register_sale` conserva EXECUTE para `anon` (es SECURITY INVOKER, así que corre
  con los permisos y el RLS de `anon`; no se revisó en esta ronda). Conviene retirarlo en una
  ronda de permisos.
- Un pedido de mesa con un producto eliminado se inserta desde el navegador y solo se rechaza
  al cobrar; si se quiere antes, el pedido de mesa debe pasar a una RPC.
