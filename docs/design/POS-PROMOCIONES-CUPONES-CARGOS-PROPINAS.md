# POS — Promociones, cupones, cargos de servicio y propinas

Análisis y propuesta de rediseño (2026-09-23). Alcance: `/app/pos/promociones` (listado,
`nuevo`, `[id]`), `/app/pos/cupones` (listado, `[id]`), `/app/pos/cargos-servicio` y
`/app/pos/propinas`, más cómo se aplican en el carrito, el cobro, la factura y los reportes.

Antecedentes que se dan por leídos y no se repiten: `docs/design/AUDITORIA-MESAS-PROMOCIONES.md`
(§D promociones, §E cupones y cargos, 2026-09-22) y `docs/design/PARIDAD-MESAS-PROMOCIONES.md`
(secciones 23 «Promociones y cupones» y 24 «Cargos de servicio» de la página `05 POS y ventas`).
Este documento **re-verifica** esos hallazgos contra el código y la base de hoy, **añade la página
de Propinas** (que nunca se había auditado ni diseñado) y encontró **errores nuevos** que la
auditoría anterior no tenía (§1, marcados «Nuevo»).

Fuentes: código en `main` + árbol de trabajo; base `jgmgphmzusbluqhuqihj` solo con `SELECT`
(esquema, `CHECK`, RLS, triggers y conteos agregados, sin datos personales ni nombres de
organizaciones).

---

## 0. Estado de la entrega en Figma — **parcial: se agotó el cupo del MCP**

El cupo de llamadas del MCP de Figma se agotó después de crear los componentes. Lo hecho y lo
pendiente, para retomarlo con el siguiente cupo:

| Pieza | Estado | Node id |
|---|---|---|
| Sección `POS — Promociones (Nuevo)` en `02 Componentes` (x 20000, y 110000) | **Hecha** | `690:16906` |
| `BeneficioFila` — 5 variantes `Tipo=promoción/cupón/cargo/propina/descartada`; propiedades Título, Detalle, Importe, Acción, Mostrar acción | **Hecho** | `690:16978` |
| `CodigoCupon` — 5 variantes `Estado=activo/programado/agotado/vencido/inactivo`; propiedades Código, Mostrar estado | **Hecho** | `690:17034` |
| `PasoAsistente` — `Estado=completo/actual/pendiente`; Título, Resumen, Número | **Hecho** | `690:17055` |
| `LineaRecibo` — `Tipo=normal/detalle/descuento/cargo/subtotal/total/nota`; Concepto, Valor | **Hecho** | `690:17077` |
| `RepartoFila` — `Estado=calculado/ajustado`; Nombre, Rol, Base, Participación, Calculado, Ajuste, A pagar | **Hecho** | `690:17104` |
| `MeseroPropinasFila` — `Estado=pendiente/liquidado`; Nombre, Detalle, Importe | **Hecho** | `690:17135` |
| `FlujoNodo` — `Tipo=página/diálogo/pos/documento/reporte/dato`; Título, Ruta, Descripción | **Hecho** | `690:17214` |
| `VistaPreviaCarrito` — reúsa `CartTag` (`descuento-promocion`) y `BeneficioFila` | **Hecho** | `690:17215` |
| Sección `POS — Promociones, cupones, cargos y propinas (propuesta)` en `05 POS y ventas` con los frames de §6 | **Pendiente** | — |
| Chequeo por script (solapes, nodos fuera de sección, instancias rotas, textos truncados, anotaciones dentro de frames) | **Pendiente** | — |
| Capturas `docs/design/figma/43-pos-promos-*.png` | **Pendiente** (no se guardó ninguna: la única captura tomada era previa a las correcciones de texto de los badges) | — |

Todos los componentes van con variables del archivo (colores `Color` Light/Dark, `spacing/*`,
`radius/*`), estilos de texto Inter del kit y `shadow/sm`; ninguno desacopla instancias.

**Defecto del kit encontrado al construir** (no se corrigió para no tocar componentes compartidos
mientras otras tres sesiones trabajan en el archivo): en `Badge` (`7:70`, al menos `Size=sm`) y en
`CartTag` (`237:76837`) la propiedad de texto `Texto` existe pero **no está enlazada** al nodo de
texto: `setProperties({Texto})` no cambia nada y hay que sobrescribir el texto a mano. Quien
mantenga el kit debería enlazarla (`componentPropertyReferences.characters`) y revisar que las
instancias existentes conserven su texto.

---

## 1. Errores encontrados — de más grave a menos grave

«Nuevo» = no estaba en la auditoría del 2026-09-22. «Confirmado» = sigue igual hoy.

| # | Gravedad | Error | Evidencia |
|---|---|---|---|
| 1 | **Crítica · Nuevo** | **No se puede crear un cargo de servicio ni un cupón de «Monto fijo».** El código usa `'fixed'` y la base solo admite `'fixed_amount'`: el `insert` choca con el `CHECK` y el usuario ve un error genérico. El CSV de importación de cargos documenta `fixed` (también falla). | `cargos-servicio/types.ts:3,49-52` · `ChargeForm.tsx:180` · `ChargesHeader.tsx:270-281` · `cupones/types.ts:3,89-92` · `CouponForm.tsx:165` · `CHECK service_charges_charge_type_check` y `coupons_discount_type_check` = `percentage`/`fixed_amount` |
| 2 | **Crítica · Nuevo** | Los 15 cargos de monto fijo que ya existen (`fixed_amount`) se pintan **sin tipo** en el listado (`CHARGE_TYPE_LABELS['fixed_amount']` es `undefined`) y al editarlos ninguna de las dos tarjetas de tipo aparece seleccionada. | `ChargesList.tsx:184` · BD: 15 filas `fixed_amount` en 13 organizaciones |
| 3 | **Crítica · Nuevo** | **Las propinas de mesa nunca llegan a Propinas.** El cobro de mesa escribe `sales.tip_amount` y `tip_server_id`, pero no inserta en `tips`: no aparecen en la página, no se liquidan y no generan asiento (el trigger contable está en `tips`). Es la fuente principal de propinas de un restaurante. | `mesas/id/pedidosService.ts:933-934` (sin ningún `from('tips')` en `mesas/**`) |
| 4 | **Crítica · Nuevo** | **Las propinas de pedidos web nunca se guardan.** `createTip` busca y crea `tip_type = 'online'`, que el `CHECK` de `tips` no admite (`cash/card/split/pooled`); el error se traga en el `catch` y devuelve `''`. | `webOrderConfirmationService.ts:682, 702, 706-708` · `CHECK tips_tip_type_check` |
| 5 | **Alta · Nuevo** | «Nueva propina» ofrece **Transferencia** y **Online**: las dos fallan contra el mismo `CHECK`. El tipo de TypeScript no coincide con la base. | `propinas/types.ts:3,75-79` · `TipForm.tsx:196` |
| 6 | **Alta · Nuevo** | **Liquidar = poner una bandera.** «Marcar distribuida» solo cambia `is_distributed`: no sale dinero de la caja (no hay `cash_movements`), no queda comprobante ni quién recibió cuánto, y no hay forma de repartir un pozo. El `distribution_batch_id` se genera en el navegador y ninguna pantalla lo lee. | `propinasService.ts:209-225, 264-285` |
| 7 | **Alta · Nuevo** | **Contabilidad descuadrada al corregir propinas.** `trg_auto_journal_tip` solo corre en `INSERT`: editar el importe o eliminar una propina (permitido incluso si ya está liquidada) **no reversa** el asiento. | trigger `trg_auto_journal_tip` (tipo 5 = fila + insert) · `TipsList.tsx:249-274` · `propinasService.ts:209-251` |
| 8 | **Alta · Nuevo** | **El reparto por mesero es en realidad por cajero.** El cobro guarda como mesero a quien cobra si no se elige otro; en la base, 8 de 8 propinas tienen `server_id` = vendedor de la venta. «Resumen por mesero» mide cajeros. | `posService.ts:1997` · RPC `pos_checkout_v1` (`coalesce(... server_id, v_user_id)`) · BD 8/8 |
| 9 | **Alta · Nuevo** | La propina y la venta no cuadran: en 6 de 8 propinas la venta enlazada tiene `tip_amount = 0`. Los reportes que leen `sales.tip_amount` y los que leen `tips` dan cifras distintas. | BD, `tips` ⋈ `sales` |
| 10 | **Alta · Confirmado** | **Los cargos de servicio no se cobran en ninguna venta.** Solo dos archivos leen `service_charges` (el CRUD y la configuración); ni el carrito, ni el cobro, ni `posService`, ni mesas. | `grep service_charges src` → `cargosServicioService.ts`, `configuracionService.ts` |
| 11 | **Alta · Confirmado** | **Los cupones no se pueden usar en el POS.** El único campo de cupón en caja es un `alert("… (demo)")`. La única redención real es la tienda web; `coupon_redemptions` tiene 0 filas en toda la base. | `ventas/nuevo/NuevaVentaPage.tsx:148, 152` · BD |
| 12 | **Alta · Confirmado** | **«Límite de usos» de promociones no se hace cumplir**: el motor no lee `usage_limit`. Tampoco existe registro de redención de promociones (solo el contador `usage_count`): no hay «descuento entregado» ni «ventas con esta promoción». | `promotionEngine.ts` (sin `usage_limit`) · función `increment_promotion_usage` |
| 13 | **Alta · Confirmado** | **Gana siempre el descuento manual** aunque sea menor, sin aviso; y un descuento de promoción ya escrito se «congela» al cambiar la cantidad. La decisión §13 #7 (gana el mayor) sigue sin implementar. | `posService.ts:1697, 2310` |
| 14 | **Alta · Confirmado** | Nadie comprueba permisos: cualquier miembro puede crear, editar y borrar promociones, cupones, cargos y propinas. La RLS de las seis tablas es `ALL` por pertenencia a la organización, sin rol. | políticas `*_org_isolation` (`cmd = ALL`) · sin `usePermission` en los cuatro módulos |
| 15 | **Media · Confirmado** | El cajero no ve **qué** promoción se aplicó ni **por qué**: `CartView` y `CheckoutDialog` solo pintan `discount_total`. | `CartView.tsx`, `CheckoutDialog.tsx` (sin «promo») |
| 16 | **Media · Confirmado** | `free_shipping` se puede crear y no hace nada; el filtro de sucursal del motor es estricto (`["117"]` ≠ `117`); `customer_id` y `brand` son contrato muerto. | `promotionEngine.ts:54, 183-188, 345` |
| 17 | **Media · Confirmado** | Zona horaria: el detalle de promoción pinta la vigencia con `timeZone: 'UTC'`; Propinas calcula «hoy» con `toISOString().split('T')[0]` (prohibido) y cierra el rango con `'T23:59:59'` sin offset (día UTC). La vigencia al **guardar** promociones y cupones la está corrigiendo otra sesión (árbol de trabajo, `vigenciaEnInstantes`). | `promociones/[id]/page.tsx:170` · `propinasService.ts:54, 97` |
| 18 | **Media · Nuevo** | «Total del día / Distribuidas / Pendientes / Propinas hoy» ignoran los filtros de la página (siempre hoy UTC, sucursal activa): con un filtro de fechas los KPI contradicen la tabla. | `PropinasContent.tsx:44` · `propinasService.ts:329-367` |
| 19 | **Media · Nuevo** | Escrituras de propinas sin guarda de organización (`update`, `delete`, `markMultipleAsDistributed` filtran solo por `id`), y la lista de «meseros» son **todos** los miembros activos, sin cargo ni sucursal. | `propinasService.ts:220, 244, 278, 298-301` |
| 20 | **Media · Nuevo** | La semilla de cargos creó en 15 organizaciones «Propina sugerida 10 %» como **cargo de servicio gravado**. Mezcla los dos conceptos que la decisión §13 #6 separa (y la propina voluntaria no es ingreso gravado del restaurante). | BD: 45 cargos de 2026-01, 3 por organización |
| 21 | **Baja · Confirmado** | La descripción de la promoción se guarda como HTML y se pinta como texto (`<p>…`). | `[id]/page.tsx:301` · `PromotionsList.tsx:212` |
| 22 | **Baja · Confirmado** | Sin paginación en los cuatro listados; conteos hechos en el navegador. | servicios `getAll` sin `range` |

Evidencia de uso (agregados, sin identificar organizaciones): 19 promociones (14 vigentes hoy,
ninguna con límite de usos, ninguna restringida por sucursal, `usage_count` total 6), 27 reglas,
1 cupón, 0 redenciones, 45 cargos de servicio (todos semilla), 8 propinas (todas en efectivo,
ninguna liquidada), 11 de 2.517 ventas de los últimos 30 días con algún descuento.

**Lo que ya está bien y se conserva:** la RLS anónima de `coupon_redemptions` quedó cerrada con
`20260922200000_rls_reservas_y_redenciones` (la memoria que decía «insert sigue abierta» está
desactualizada); el borrado de cupones con redenciones está bloqueado; `pos_checkout_v1` ya
clasifica la propina no efectivo como `card` y es idempotente.

---

## 2. Promociones — `/app/pos/promociones`, `/nuevo`, `/[id]`

**Qué muestra hoy.** Listado con 2 KPI, buscador, filtros de estado y tipo, tabla (Promoción,
Tipo, Descuento, Vigencia, Usos, Prioridad, Estado) y menú ⋯ (ver, editar, duplicar, activar,
eliminar). Asistente de 4 pasos (datos, descuento, vigencia y canales, reglas). Detalle con
«Detalles», «Reglas aplicadas», «Estado» y «Estadísticas» (que son la propia fila).

**De dónde sale cada dato.** `promotions` (+ `promotion_rules` embebido) filtrado por la
organización del `localStorage` y la RLS (`promotionsService.ts:25-70`); nombres de productos y
categorías en dos consultas extra; «Usos» = `usage_count`, que incrementa la RPC
`increment_promotion_usage` por venta (no por ítem ni por importe).

**Lógica real del motor** (`lib/services/promotionEngine.ts`): carga las activas del canal
ordenadas por prioridad; vigencia por fin de fecha y día de la semana (`lib/promotions/vigencia.ts`);
sucursal; compra mínima contra **todo** el carrito; si hay alguna no combinable, compara **la de
mayor prioridad** contra la **suma** de las combinables y aplica el bloque ganador; tope por
promoción (`max_discount_amount`), no por línea. Se invoca en `calculateCartTotals` y en el
checkout del POS, en mesas, en pedidos web, en factura de venta, cotizaciones y PMS. El cajero
nunca ve el nombre de la promoción.

**Qué falta para que sirva.** Registro de redención por venta y línea (quién, cuánto, qué
promoción), límite de usos real, «gana el mayor» con aviso, nombre de la promoción en el carrito,
el recibo y la factura, impacto (descuento entregado, ventas, ticket medio) y el enlace a las
ventas donde se aplicó.

**Cómo se conecta.** Promoción → cupones que la activan (`coupons.promotion_id`, hoy sin
interfaz) → carrito (etiqueta en la línea + `BeneficioFila`) → venta (`sale_items.discount_amount`
más la redención nueva) → factura (`invoice_items.discount_amount`) → reporte «Descuentos por
promoción».

## 3. Cupones — `/app/pos/cupones`, `/[id]`

**Qué muestra hoy.** Listado (2 KPI, filtros, tabla código/nombre/descuento/vigencia/usos/estado)
y detalle con estadísticas e historial de redenciones exportable.

**Datos.** `coupons` (+ cliente y promoción), `coupon_redemptions` (+ venta y sucursal) —
`couponsService.ts`. `usage_count` lo sube el trigger `trg_coupon_redemption_increment`. El
estado (activo, programado, expirado, agotado) se calcula en el navegador con la hora local.

**Roto.** Monto fijo imposible de crear (#1); no se pueden usar en caja (#11); sin creación por
lotes, sin «usos por cliente», sin cliente ni promoción vinculada desde la interfaz.

**Propuesta.** Crear **lote de cupones** (prefijo, cantidad, longitud, límite por cupón y por
cliente, vigencia en el día de la organización, promoción vinculada) con vista previa de códigos
y exportación; aplicar el cupón en el cobro con validación en el servidor (vigencia, cupo,
compra mínima, primera compra, cliente) y redención dentro de la RPC de checkout.

## 4. Cargos de servicio — `/app/pos/cargos-servicio`

**Qué muestra hoy.** Listado con 3 KPI, filtros (incluido un selector de sucursal propio que
escribe en el contexto global), tabla y `ChargeForm` (nombre, tipo, valor, mínimo, comensales,
aplica a, sucursal, gravado, opcional).

**Datos.** `service_charges` (+ sucursal) — `cargosServicioService.ts`; `calculateCharge`
existe y no tiene llamadores. Montado también dentro de Configuración del POS
(`ConfigModals.tsx:74-80`).

**Roto.** No se cobra nunca (#10); monto fijo imposible (#1-#2); «Gravado» no elige **qué**
impuesto; el subtítulo promete «propina sugerida» (#20).

**Propuesta.** Configurar el cargo con **impuesto explícito** (`TaxMultiSelect` del kit: ninguno,
Impoconsumo 8 %, Impuesto general 19 %), base de cálculo (después de descuentos, antes de
impuestos — decisión §13 #6), canal, mínimos, opcional con motivo al quitarlo, y vista previa en
el recibo. En la venta: línea propia de la factura, y en el reporte «Cargos cobrados».

## 5. Propinas — `/app/pos/propinas` (nunca auditada ni diseñada)

**Qué muestra hoy** (`PropinasContent.tsx`, `TipsHeader.tsx`, `TipsList.tsx`, `ServerSummary.tsx`,
`TipForm.tsx`): cabecera con «Distribuir (n)» y «Nueva propina»; 4 KPI del día; filtros mesero,
estado, tipo, desde y hasta; tabla (fecha, mesero, tipo, monto, estado, ⋯ editar / marcar
distribuida / eliminar) con selección múltiple de pendientes; panel «Resumen por mesero» con
participación y barra de distribuidas.

**Datos.** `tips` (+ `sales` para total y fecha) y `organization_members`→`profiles` para los
nombres (`propinasService.ts:15-90`). Las propinas nacen en el checkout del POS
(`posService.ts:1991-2013` y `pos_checkout_v1`), en pedidos web (roto, #4) y a mano. Mesas no
las crea (#3). El asiento contable lo hace `fn_auto_journal_tip` al insertar.

**Reglas que faltan.** Quién atendió (mesero de la mesa, no el cajero), base de la propina
(hoy: total con impuestos), propinas electrónicas vs efectivo (la electrónica entra al banco y
hay que sacarla en efectivo o por nómina), comisión del datáfono, reparto (a quien atendió, pozo
por horas, pozo por porcentaje por cargo), comprobante firmado, egreso de caja y asiento.

**Propuesta.** Pestañas «Por liquidar» · «Liquidaciones» · «Todas»; KPI que respetan el filtro;
tabla con venta y mesa enlazadas; panel por persona (`MeseroPropinasFila`); asistente **Liquidar
propinas** en 3 pasos (qué se liquida → cómo se reparte con `RepartoFila` y ajustes con motivo →
cómo se paga: efectivo desde la caja abierta, transferencia o nómina) y comprobante imprimible.

---

## 6. Propuesta en Figma (frames pendientes de dibujar)

Página `05 POS y ventas`, sección nueva «POS — Promociones, cupones, cargos y propinas
(propuesta)». Escritorio 1440 × 932 sobre el shell del kit (`Sidebar Mode=expanded`,
`AppHeader`, `PageHeader`) y móvil 390 × 844 (`MobileHeader Mode=page`, `MobileTabBar
Active=ventas`, `ListCard`). Anotaciones fuera de los frames.

| Fila | Frames |
|---|---|
| A · Promociones | listado listo · cargando (`Skeleton`) · vacío con primer paso (`EmptyState Variant=empty` + «Crear promoción» y «Ver plantillas: 2×1, almuerzo, apertura») · sin resultados (`Variant=search` + «Limpiar filtros») · error (`Variant=error` + «Reintentar») · sin permiso (`Variant=forbidden`) · detalle con impacto y cupones vinculados · asistente paso 1 «Qué descuenta» + `VistaPreviaCarrito` · paso 2 «A qué aplica» (`ReglaPromocion` existente) · paso 3 «Cuándo, dónde y cuántas veces» · paso 4 «Revisar» (`SimuladorCarrito` existente) · menú ⋯ · móvil listado · móvil detalle |
| B · Cupones | los 6 estados del listado · detalle con `RedencionRow` enlazado a la venta · diálogo «Crear lote de cupones» · «Lote creado» con códigos (`CodigoCupon`) y exportar · menú ⋯ · móvil listado · móvil detalle |
| C · Cargos | los 6 estados · hoja «Configurar cargo» con impuesto (`TaxMultiSelect`) y vista previa en recibo · menú ⋯ · móvil listado · móvil hoja |
| D · Propinas | los 6 estados · liquidar paso 1 · paso 2 (`RepartoFila`) · comprobante · menú ⋯ · móvil listado · móvil liquidar |
| E · Aplicado | clon del carrito aprobado `244:63910` con promoción, cupón, cargo y propina (`BeneficioFila`) · recibo 80 mm (`LineaRecibo`) · mapa de flujo entre páginas (`FlujoNodo`) |

Menús ⋯ propuestos (un ícono por acción, destructivo al final):
- Promoción: Ver detalle (Eye) · Editar (Pencil) · Duplicar (Copy) · Ver ventas con esta promoción (Receipt) · Crear cupones para esta promoción (Ticket) · Pausar/Activar (Pause/Play) · Eliminar (Trash; si tiene usos, «Archivar»).
- Cupón: Ver detalle · Editar · Copiar código (Copy) · Ver ventas donde se usó (Receipt) · Duplicar · Desactivar (Ban) · Eliminar (solo sin redenciones).
- Cargo: Editar · Duplicar · Ver ventas con este cargo · Desactivar · Eliminar (si ya se cobró, solo desactivar).
- Propina: Ver venta (Receipt) · Reasignar mesero (UserCheck) · Corregir importe con motivo (Pencil; solo por liquidar) · Anular con motivo (Ban; solo por liquidar).

Ejemplo numérico que usan todos los frames (mesa de 8, Impoconsumo 8 %): 4 × Bandeja paisa
$ 128.000 − Almuerzo ejecutivo 10 % ($ 12.800) · 4 × Limonada de coco $ 36.000 − 2×1 ($ 18.000) ·
2 × Postre del día $ 24.000 → subtotal $ 157.200 · cupón CUMPLE-7K4P − $ 15.000 → $ 142.200 ·
cargo por servicio mesa de 8+ 5 % $ 7.110 → base gravable $ 149.310 · Impoconsumo 8 % $ 11.945 ·
**total de la factura $ 161.255** · propina voluntaria 10 % sobre $ 142.200 = $ 14.220 (fuera de
la factura) · **total a cobrar $ 175.475**.

---

## 7. Cambios de backend y base de datos necesarios (no aplicados)

Todos aditivos, por el MCP de Supabase, con su `.sql` en `supabase/migrations/` y reversión en
`supabase/rollbacks/`.

1. **Tipos alineados con los `CHECK`**: `'fixed'` → `'fixed_amount'` en `cargos-servicio/types.ts`,
   `cupones/types.ts`, formularios, listados y CSV. Quitar `transfer`/`online` de `TipType` o
   ampliar el `CHECK` de `tips` (ver pregunta 4). Corregir `webOrderConfirmationService.createTip`.
2. **`promotion_redemptions`** (`organization_id`, `promotion_id`, `sale_id`, `sale_item_id`,
   `branch_id`, `customer_id`, `discount_amount`, `channel`, `created_at`) escrita **dentro** de
   `pos_checkout_v1` y del cobro de mesas y web; `usage_limit` comprobado ahí mismo con bloqueo
   de fila. `usage_count` pasa a ser derivado.
3. **Cupones en el POS**: RPC `pos_validar_cupon(org, código, carrito)` (vigencia en la zona de la
   organización, cupo total y por cliente, compra mínima, primera compra) y redención en
   `coupon_redemptions` dentro de la RPC de checkout. Nada de validar en el navegador.
4. **Cargo de servicio en la venta**: columnas `sales.service_charge_total` y una tabla
   `sale_service_charges` (cargo, base, importe, impuesto, quitado_por, motivo); el cargo viaja a
   la factura electrónica como línea (o en `invoice_sales.allowance_charges`, que ya existe).
   `service_charges.tax_id` (FK a impuestos) en vez del booleano `is_taxable`.
5. **Propinas**: insertar en `tips` desde el cobro de mesas; `tips.table_session_id` y mesero de
   la mesa como `server_id`; `tip_settlements` (liquidación: periodo, método de reparto, total,
   medio de pago, `cash_movement_id`, creado_por) y `tip_settlement_lines` (persona, base,
   participación, calculado, ajuste, motivo, a pagar); RPC `liquidar_propinas` que crea el egreso
   de caja y el asiento; trigger de reversa en `UPDATE`/`DELETE` de `tips` (o prohibirlos y
   anular con contrapartida).
6. **Permisos**: `pos.promociones.gestionar`, `pos.cupones.gestionar`, `pos.cargos.gestionar`,
   `pos.propinas.liquidar`, `pos.descuento.forzar`; RLS de escritura por permiso, no solo por
   pertenencia. Guardas de `organization_id` en todas las escrituras de propinas y cargos.
7. **Motor**: leer `usage_limit`, comparar sucursal con `appliesToBranch`, eliminar o implementar
   `free_shipping`, «gana el mayor» con motivo (decisión §13 #7) y devolver `applied` hasta la
   interfaz para pintar el nombre de la promoción. Una sola implementación, en el servidor.
8. **Semilla**: dejar de crear «Propina sugerida 10 %» como cargo de servicio; migrar esas filas a
   los porcentajes sugeridos de propina de la configuración del POS.

---

## 8. Preguntas para el dueño

1. **¿Cargo de servicio y propina pueden convivir en la misma cuenta?** En Colombia la propina es
   voluntaria y no es ingreso gravado; un cargo obligatorio sí lo es. ¿Quitamos la semilla
   «Propina sugerida 10 %» de los cargos y la volvemos porcentaje sugerido de propina?
2. **Base de la propina sugerida:** ¿sobre el subtotal después de descuentos y **antes** de
   impuestos (propuesta) o sobre el total con impuestos (como hoy)?
3. **Reparto de propinas:** ¿a quien atendió la mesa, pozo común por horas trabajadas, o pozo por
   porcentajes por cargo (mesero, cocina, barra)? ¿Se descuenta la comisión del datáfono a las
   propinas con tarjeta?
4. **Pago de la liquidación:** ¿efectivo desde la caja abierta (egreso), transferencia, o en
   nómina? ¿Aceptamos propinas por transferencia/QR como tipo propio (ampliar el `CHECK`)?
5. **Cupones en caja:** ¿el cajero puede aplicar un cupón sin cliente identificado? ¿Cupón y
   promoción automática se acumulan, o el cupón reemplaza a la promoción?
6. **Límite de usos:** cuando una promoción llega al tope en mitad de un cobro, ¿se respeta para
   esa venta o se retira al instante?
7. **Envío gratis:** ¿lo implementamos para pedidos web y domicilios o lo retiramos del selector?
8. **Permisos:** ¿quién puede crear promociones y cupones, quién liquida propinas, y el cajero
   puede forzar su descuento manual sobre una promoción mayor (con motivo)?
