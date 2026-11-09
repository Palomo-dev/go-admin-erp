# Consignación recibida y consignación entre organizaciones (propuesta 2026-11-07)

Estado: **propuesta de diseño**. Figma primero: el código y el esquema no cambian hasta que el dueño apruebe.
Nada de esto se aplicó a la base de datos y no hay migración escrita.

Antecedente: el frente R4-B (`docs/implementacion/FINANZAS-R4-E-INTEGRACIONES-PLAN.md`) dejó en código la consignación
**entregada**: mercancía propia en poder de un consignatario, con la migración propuesta y sin aplicar
`supabase/migrations/20261108121000_consignaciones.sql` (`consignment_notes`, `consignment_note_lines`,
`consignment_settlements`, `consignment_settlement_lines` y `fn_consignacion_entregar|liquidar|cerrar`).

Pedido del dueño (2026-11-07): «hay organizaciones que van a recibir mercancía de otras organizaciones… poder entregarle a
otro para que venda lo de uno y recibir lo de otro; entre organizaciones se puede hacer eso».

Faltan dos cosas:

1. **Consignación recibida.** Mercancía de un tercero (el consignante) que yo vendo por cuenta de él. No es inventario propio:
   no entra al costo ni al balance como propio, se controla en cuentas de orden, se vende en el POS o en la factura, y se le
   liquida al consignante: lo vendido, mi comisión, lo devuelto y el saldo a pagarle, que queda como cuenta por pagar.
2. **Consignación entre organizaciones de GO Admin.** Si las dos partes usan GO Admin, la nota del consignante le llega al
   consignatario como «por aceptar», y la liquidación del consignatario le llega al consignante. Cada organización ve y
   controla solo su lado. Si la otra parte no usa GO Admin, todo funciona igual, pero se registra a mano.

## Figma

Archivo `EAvjINVRnlzFM70GVoWXgl`, página «07 Finanzas», sección **`2403:146159`** «Consignación recibida y entre
organizaciones (propuesta 2026-11-07)», en x 0 / y 128000, debajo de la ronda 2 de pantallas faltantes. Los frames clonan
el shell de los de consignación aprobados (`2335:138595`, `2335:139248`, `2335:139356`) y usan los componentes de
«02 Componentes»: Sidebar, AppHeader, Breadcrumbs, PageHeader, TabBar/TabItem, StatCard, Badge, Button, FormField, Aviso,
FilaDato, EmptyState, MobileHeader y MobileTabBar. Cada frame lleva encima una anotación que dice qué hace y de dónde sale
cada dato.

| # | Frame | Id | Captura |
|---|-------|----|---------|
| R1 | Lista con pestañas Entregadas · Recibidas · Por aceptar (Recibidas activa) | `2404:146165` | `figma/89-consignacion-recibida-01-lista-recibidas.png` |
| R2 | Nota recibida por aceptar (llegó de otra organización) | `2405:146580` | `figma/89-consignacion-recibida-02-nota-por-aceptar.png` |
| R3 | Recibida aceptada: existencias del consignante, vendido, devuelto, en tu poder, cuentas de orden | `2405:147166` | `figma/89-consignacion-recibida-03-detalle-aceptada.png` |
| R4 | Diálogo «Recibir mercancía en consignación» a mano (consignante externo) | `2406:147241` | `figma/89-consignacion-recibida-04-recibir-a-mano.png` |
| R5 | Liquidación al consignante (comisión, saldo a pagar, crea cuenta por pagar, vista previa del asiento) | `2407:147372` | `figma/89-consignacion-recibida-05-liquidacion-al-consignante.png` |
| R6 | Diálogo «Vincular con otra organización» (invitación con enlace) | `2406:147546` | `figma/89-consignacion-recibida-06-vincular-organizacion.png` |
| R7 | Diálogo «Invitación de vínculo recibida» (lado de la otra organización) | `2406:147790` | `figma/89-consignacion-recibida-07-invitacion-recibida.png` |
| R8 | Liquidación recibida del consignatario (lado del consignante, consignación entregada) | `2407:148109` | `figma/89-consignacion-recibida-08-liquidacion-recibida-consignante.png` |
| R9 | Recibidas vacía | `2408:147945` | `figma/89-consignacion-recibida-09-vacio.png` |
| R10 | Sin permiso | `2408:148389` | `figma/89-consignacion-recibida-10-sin-permiso.png` |
| M1 | Móvil · lista Recibidas | `2409:148539` | `figma/89-consignacion-recibida-11-movil-lista.png` |
| M2 | Móvil · detalle de una recibida | `2409:148766` | `figma/89-consignacion-recibida-12-movil-detalle.png` |

Los nombres de terceros de los frames («Confecciones Aurora», «Marroquinería Sol», «Cerámicas La Loma», «Café de Origen»)
son inventados, igual que «Tienda Las Palmas» en los frames aprobados.

## Flujos

### A. Recibida a mano: el consignante no usa GO Admin

1. **Recibir** (R4). Se elige el consignante (un proveedor; si no existe, se da de alta con el mismo formulario rápido de
   proveedores), la bodega, los productos, la cantidad, el precio pactado y la comisión. Se crea la nota recibida `NCR-0001`,
   la mercancía entra a la bodega como existencia de terceros y se registra el asiento en cuentas de orden. No se crea factura
   de compra ni cuenta por pagar.
2. **Vender.** El POS y la factura de venta venden el producto consignado como cualquier otro. Cada línea de venta guarda de
   qué línea de consignación salió (FIFO por nota, igual que los lotes). El contador «Vendido» de la nota sube.
3. **Devolver** (botón «Devolver mercancía» de R3). La mercancía sale de la bodega y se reversa la cuenta de orden por lo
   devuelto.
4. **Liquidar** (R5). Por periodo: lo vendido a precio pactado, menos mi comisión, y lo que queda es el saldo a pagar. Crea la
   cuenta por pagar al consignante, que se paga desde Cuentas por pagar como cualquier otra. El PDF de la liquidación se le
   envía por fuera.

### B. Entre organizaciones de GO Admin

1. **Vincular** (R6 → R7). Una organización invita a la otra con un enlace de un solo uso, que vence en 7 días y queda
   amarrado a un tercero propio. La otra lo acepta con su sesión, como administradora, y elige con cuál de sus terceros queda
   vinculada. Desde entonces cualquiera de las dos puede ser consignante o consignataria.
2. **El consignante entrega**, con el flujo que ya existe (`fn_consignacion_entregar`). Si el consignatario está vinculado,
   la nota se publica como documento compartido.
3. **El consignatario acepta** (R2). Ve la copia de la nota: productos, cantidades, precios y condiciones. Vincula cada
   producto del consignante con uno suyo, o lo crea, y elige la bodega. Al aceptar se crea **su** nota recibida (paso 1 del
   flujo A) y el consignante ve «Aceptada». Si la rechaza, debe dar un motivo, que le llega al consignante.
4. **El consignatario vende y liquida** (R3, R5). Igual que en el flujo A. Además, la liquidación se publica para el consignante.
5. **El consignante recibe la liquidación** (R8). La compara con su propia nota. «Aceptar y facturar» ejecuta el flujo que ya
   existe (`fn_consignacion_liquidar` + factura de venta + `fn_consignacion_cerrar`): no hay una segunda implementación. Si no
   cuadra, la rechaza con un motivo.
6. **Devoluciones.** Se publican igual y el consignante las acepta con `fn_consignacion_liquidar`, que ya admite una
   liquidación solo con devolución.

Regla: **lo que llega de la otra organización nunca escribe directo en mis tablas.** Llega como un documento que yo acepto,
y al aceptarlo mis propias funciones crean mis propias filas.

## Asientos esperados

Todas las cuentas están **por confirmar con el Contador** y salen de la configuración contable por clave (`fn_cuenta_por_clave`).
El código PUC es solo el respaldo, igual que con `inventario_consignacion` → 1465.

### Consignación recibida: modelo propuesto de mandato (el consignatario solo gana la comisión)

| Momento | Débito | Crédito | Valor |
|---|---|---|---|
| Recibir o aceptar la nota | 9905 Responsabilidades contingentes por contra (clave `consignacion_recibida_contra`) | 9115 Bienes recibidos de terceros — en consignación (clave `consignacion_recibida_orden`) | cantidad × precio pactado |
| Venta en el POS o la factura | Caja, bancos o clientes | **2815 Ingresos recibidos para terceros** (clave `recaudos_terceros`, ya usada en Dinero de terceros) + IVA si aplica | precio de venta |
| | — sin costo de ventas, sin tocar 14 Inventarios — | | |
| Devolución al consignante | 9115 | 9905 | lo devuelto × precio pactado |
| Liquidación | 2815 por lo vendido | Ingreso por comisión (clave nueva `ingreso_comision_consignacion`; respaldo propuesto 4155) + IVA de la comisión si aplica; **cuenta por pagar al consignante** (2205 o 2335, regla `purchase_payment`) por el neto | ver R5: 720.000 = 108.000 + 612.000 |
| Liquidación (cuentas de orden) | 9115 | 9905 | lo vendido × precio pactado (lo devuelto ya se reversó) |
| Pago | Cuenta por pagar | Caja o bancos | el flujo de pagos de siempre |

Si el consignatario vende por encima del precio pactado, la diferencia es ingreso propio en la liquidación. Si se pactó un
**precio de liquidación** por unidad en vez de un porcentaje, la comisión es `venta − precio de liquidación × cantidad`.

### Alternativa que debe decidir el Contador: compra en el momento de la venta

Al vender, el consignatario reconoce la venta completa como ingreso propio (4135) con su IVA. En ese mismo momento registra la
compra al consignante a precio de liquidación: D 6135 costo / C cuenta por pagar, con documento soporte o factura electrónica
del consignante. Así se reutiliza más de lo que ya existe (la cuenta por pagar nace de `invoice_purchase` por el disparador
`fn_trg_cxp_desde_factura`), pero la «comisión» deja de verse como tal: queda como margen. Las cuentas de orden son iguales.

### Lado consignante (entregada): sin cambios

Siguen los asientos de `20261108121000_consignaciones.sql`: entregar D 1465 / C inventario; liquidar regresa lo vendido y lo
devuelto; la factura de venta lleva su ingreso, IVA, costo y cartera; al cerrar, la comisión es un saldo a favor aplicado a la
factura. Lo único nuevo en ese lado es que la liquidación también puede llegar del consignatario (R8).

## Qué habría que añadir sobre `consignment_*` (sin migración todavía)

La migración `20261108121000` **no está aplicada**. Lo más limpio es ampliarla antes de aplicarla, en vez de aplicarla y
corregirla después. Antes de escribirla, verificar por MCP cada tabla y columna que se nombra aquí (CLAUDE.md, regla 3), en
particular el tipo de `suppliers.id`, el nombre de la tabla de líneas de la factura de venta y la de notificaciones.

### Columnas nuevas en las cuatro tablas existentes

- `consignment_notes`
  - `direction text not null default 'entregada' check (direction in ('entregada','recibida'))`
  - `supplier_id` (el consignante, cuando `direction = 'recibida'`). Hace falta que `customer_id` admita NULL, con
    `check ((direction = 'entregada' and customer_id is not null) or (direction = 'recibida' and supplier_id is not null))`.
    Es aceptable solo porque la tabla todavía no existe; aplicada y con datos, ya no lo sería.
  - `memo_account_code`, `memo_contra_account_code` (las cuentas de orden con las que nació la nota recibida;
    `account_code` e `inventory_account_code` no aplican en la recibida y pasan a admitir NULL con el mismo check).
  - `due_date date`, `settlement_frequency text` (plazo y periodicidad de liquidación que muestra R2).
  - `link_id uuid null` → `consignment_links`, `shared_document_id uuid null` → `consignment_shared_documents`, y
    `external_number text` (el número de la nota en la otra organización, p. ej. «su nota NCO-0018»).
  - Prefijo de numeración: `NCO-` para las entregadas y `NCR-` para las recibidas, cada uno con su propio consecutivo.
- `consignment_note_lines`
  - `agreed_price numeric(16,2)` (precio pactado de venta; también valoriza las cuentas de orden).
  - `settlement_price numeric(16,2) null` (precio de liquidación por unidad, si se pactó así).
  - `external_product_ref jsonb null` (id, nombre y referencia del producto en la organización del consignante).
  - En la recibida, `unit_cost` queda en 0: no hay costo propio.
- `consignment_settlements`
  - `direction` (igual que en la nota).
  - `payable_invoice_id` o `accounts_payable_id` (según cómo se cree la cuenta por pagar; ver la pregunta 6 al dueño).
  - `commission_tax_amount`, `withholding_amount` (IVA de la comisión y retenciones, si el Contador las confirma).
  - `shared_document_id uuid null`, y `remote_status text null check (remote_status in ('enviada','aceptada','rechazada'))`.
- `consignment_settlement_lines`: sin cambios. Opcional: `commission_amount` por línea, para el PDF.

### Fuera de `consignment_*`

- `products.is_consignment boolean not null default false`. Recomendación: el producto consignado es un producto **aparte**,
  sin `product_costs`, que la valorización del inventario y `fn_asiento_stock_movement` excluyen. Así nunca se mezcla con el
  costo promedio de un producto propio igual (ver la pregunta 3 al dueño).
- `sale_items.consignment_line_id uuid null`, y lo mismo en las líneas de la factura de venta: es la fuente de «Vendido».
- Kardex: la entrada y la salida usan `fn_inv_int_mover` como en la entregada, con `source_id 'consignacion:<nota>'`. Por ser
  productos de consignación, no generan asiento de inventario.

### Tablas nuevas para el lado entre organizaciones

- `consignment_links`: el vínculo entre dos organizaciones.
  - `id`, `inviter_org_id`, `invitee_org_id null` (se llena al aceptar), `status ('pendiente','activo','suspendido','vencido')`.
  - `token_hash` (sha-256; el token en claro solo viaja en el enlace), `expires_at`, `used_at`, `invited_email`.
  - `inviter_display jsonb` e `invitee_display jsonb`: nombre y NIT que cada parte decide mostrar, como copia.
  - `created_by`, `accepted_by`, `created_at`.
- `consignment_link_parties`: el tercero propio de cada lado.
  - `link_id`, `organization_id`, `supplier_id null`, `customer_id null`.
  - Cada organización ve solo su fila. Así nadie conoce cómo lo tiene registrado la otra.
- `consignment_shared_documents`: lo único que cruza entre organizaciones.
  - `id`, `link_id`, `from_org_id`, `to_org_id`, `kind ('nota','liquidacion','devolucion')`, `version`.
  - `payload jsonb`: copia **inmutable**, filtrada a ese documento, que escribe una RPC del emisor.
  - `status ('enviado','aceptado','rechazado','anulado')`, `reply_reason`.
  - `source_id` (id local en el emisor) y `target_id` (id local en el receptor, tras aceptar).
  - `created_at`, `decided_at`, `decided_by`.
- `consignment_product_links`: el producto del consignante enlazado con uno mío.
  - `organization_id` (quien recibe), `link_id`, `external_product_ref`, `product_id`. Único por (`organization_id`,
    `link_id`, referencia externa). Así la segunda nota llega ya vinculada.

### Funciones (todas `SECURITY DEFINER`, idempotentes, sin `anon`, con la guarda de organización, sucursal y permiso de las existentes)

- `fn_consignacion_recibir`: R4, nota recibida a mano.
- `fn_consignacion_recibida_aceptar` y `fn_consignacion_recibida_rechazar`: R2.
- `fn_consignacion_recibida_devolver`: devolución al consignante, con kardex y cuentas de orden.
- `fn_consignacion_recibida_liquidar`: R5. Crea la liquidación, el asiento y la cuenta por pagar por el camino oficial, nunca
  escribiendo `accounts_payable` a mano, y publica la liquidación si la nota está vinculada.
- `fn_consignacion_vinculo_invitar`, `fn_consignacion_vinculo_aceptar(token)` y `fn_consignacion_vinculo_suspender`.
- `fn_consignacion_compartir(nota)`: publica una nota entregada a un consignatario vinculado.
- `fn_consignacion_liquidacion_recibida_aceptar` y su `_rechazar`: R8. Por dentro llaman a las tres funciones que ya existen.

## Cómo se comparte el documento sin romper el aislamiento

1. **RLS por pertenencia en todo.** Las tablas de nota, línea, liquidación y vínculo de producto usan la misma política de
   `20261108121000` (miembro activo de `organization_id`), sin escritura directa y sin `anon`. `consignment_links` y
   `consignment_shared_documents` se pueden leer si eres miembro de **cualquiera** de las dos organizaciones del registro.
   Para el rendimiento, la política sigue el patrón `IN (SELECT … )` con `(select auth.uid())`, no un `EXISTS` anidado.
   `consignment_link_parties` solo la lee tu propia organización.
2. **Lo que cruza es una copia, no una referencia.** El receptor nunca consulta `consignment_notes`, `products` ni `customers`
   del emisor. Lee el `payload` que la RPC del emisor armó solo con los campos de la tabla «Qué se comparte» de R6. No hay FKs
   del receptor hacia filas del emisor que el cliente pueda seguir.
3. **La organización sale de la sesión.** Toda ruta empieza por `getServerOrgContext()` o `withOrg`, y toda RPC valida que
   `auth.uid()` sea miembro de la organización que actúa. Si el cuerpo trae otra organización: 403 y se registra. Para aceptar
   una invitación hay que ser administrador de la organización que acepta.
4. **El enlace con token.** Un solo uso, vence en 7 días, se guarda solo su hash, se acepta únicamente con sesión iniciada y
   se puede revocar. No hay buscador de organizaciones por nombre o NIT, para no revelar quién usa GO Admin.
5. **Cada lado decide sobre lo suyo.** Aceptar crea filas en mi organización con mis funciones. Rechazar solo cambia el
   estado del documento compartido. Suspender el vínculo detiene los envíos nuevos, y lo ya compartido se conserva como
   historia de ambos.
6. **Auditoría.** Cada documento compartido registra quién lo envió y quién lo decidió, de cada lado.

## Pantallas y código que se reutilizan (regla 7: nada duplicado)

- La lista, la nueva nota y la liquidación entregada son las de R4-B. Las pestañas se añaden sobre la misma página
  `/app/finanzas/consignaciones`.
- La venta de un producto consignado pasa por `posService` y la factura de siempre. Solo cambia la cuenta de ingreso (2815) y
  que no hay costo de ventas.
- La cuenta por pagar, su pago y el estado de cuenta son los de Cuentas por pagar.
- R8 «Aceptar y facturar» es el mismo «Facturar y cerrar» de la liquidación entregada.
- Las notificaciones de «nota por aceptar» y «liquidación recibida» van por la campana y el correo que ya existen.
- UI nueva en es, en, fr y pt. Va en el namespace `finanzasTercerosR4.consignaciones` o en uno hermano.

## Preguntas para el dueño

1. **Precio.** ¿Lo fija el consignante (fijo o como mínimo) o el consignatario vende al precio que quiera y le liquida a un
   precio pactado por unidad? El diseño admite las dos cosas; hay que elegir el valor por defecto.
2. **Comisión.** ¿Siempre un porcentaje sobre la venta, o también un precio de liquidación por producto?
3. **Productos consignados.** ¿Van siempre como productos aparte (recomendado: no se mezclan con el costo propio), o se permite
   vincularlos con un producto propio igual? Mezclarlos obliga a separar existencias por dueño en `stock_levels`.
4. **Menú.** El código puso Consignaciones en Finanzas › Documentos, y las migas del Figma aprobado dicen Inventario ›
   Consignación. ¿Dónde vive? Estos frames usan Finanzas.
5. **¿Quién crea la cuenta por pagar?** La propuesta: el consignatario, al liquidar, aunque el consignante todavía no la haya
   aceptado; si la rechaza, se anula con un contra-asiento. La otra opción es esperar a que el consignante la acepte.
6. **Vínculo entre organizaciones.** ¿Es solo para consignación, o lo reutilizaremos para órdenes de compra y facturas entre
   organizaciones? Si es lo segundo, conviene que la tabla se llame `organization_links` y no `consignment_links`.
7. **Planes.** ¿Qué planes incluyen la consignación recibida y cuáles el vínculo entre organizaciones?
8. **Recordatorios.** ¿Recordatorio automático de liquidación según la periodicidad pactada (mensual, quincenal)?
9. **Notas ya registradas a mano.** Si una nota recibida se registró a mano y después el consignante se une a GO Admin, ¿se
   puede enlazar esa nota existente, o solo vale para las notas nuevas?

## Preguntas para el Contador

1. **Cuentas de orden.** ¿Las subcuentas exactas para «bienes recibidos en consignación» (9115) y su contrapartida (9905)?
   ¿Se valoriza a precio de venta pactado o a precio de liquidación?
2. **Modelo.** ¿Mandato, donde el consignatario solo reconoce su comisión y lo vendido va a 2815? ¿O compra-venta en el
   momento de la venta (ingreso 4135, costo y cuenta por pagar)? Esto cambia la factura, el IVA y los reportes.
3. **Factura electrónica de la venta al público.** ¿La emite el consignatario a su nombre, como mandatario? ¿Cómo se
   identifica al mandante? ¿Quién declara el IVA de esa venta?
4. **Comisión.** ¿Lleva IVA? ¿El consignatario le factura la comisión al consignante, o basta con la liquidación? ¿Qué cuenta
   de ingreso: 4155 u otra?
5. **Retenciones.** ¿Se practican en la liquidación o en el pago al consignante? ¿Sobre qué base?
6. **Cuenta por pagar.** ¿2205 Proveedores o 2335/2380? ¿Hace falta documento soporte cuando el consignante no está obligado a
   facturar?
7. **Faltantes y daños.** ¿Cómo se registra la mercancía consignada que falta o se daña en poder del consignatario: gasto
   propio y cuenta por pagar al consignante?
8. **Lado entregado (ya pendiente).** ¿Se confirma 1465 para la mercancía propia en consignación?

## Verificación

- No se tocó `src/`, no se consultó ni se modificó la base de datos, y no hay commit.
- En Figma solo se creó la sección `2403:146159` y lo que tiene dentro; no se modificó ningún frame existente.
- Capturas exportadas con `get_screenshot` y descargadas a `docs/design/figma/89-consignacion-recibida-*.png` (12 archivos).

## Decisiones del dueño y criterio del Contador (2026-11-07)

### Dueño
- Aprueba la propuesta con las recomendaciones: el precio lo fija el dueño de la mercancía, como fijo o como
  mínimo; la remuneración puede ser porcentaje **o** precio de liquidación por producto; los productos en
  consignación son productos aparte.
- **Menú: Inventario.** Las notas, las existencias y la recepción viven en Inventario. La liquidación enlaza
  a Finanzas (cuenta por pagar, cobro).
- **El vínculo entre organizaciones es genérico** (`organization_links`): sirve también para órdenes de compra
  y facturas entre organizaciones.
- **Todos los planes.**

### Contador (no programar «toda consignación = compra al vender»)
1. **Modalidad por contrato.** Se configura por contrato o consignación, nunca se deduce del nombre:
   - **Agente o mandato** (por defecto): la mercancía sigue siendo del dueño.
   - **Compra para revender**: hay compra real.
2. **Cuentas en la modalidad agente** (PUC, Decreto 2650; las cuentas de orden son control, no reemplazan
   el reconocimiento NIIF):
   - Mercancía recibida: **C 911520** «En consignación» / **D contrapartida del grupo 94**. Al vender o
     devolver se revierte ese control. No entra como inventario propio.
   - Dinero que corresponde al dueño: **281510** «Venta por cuenta de terceros», con **auxiliar por
     propietario**. No usar 2205.
   - Ingreso propio, solo la remuneración: **auxiliar de 8 dígitos bajo 413512** «Venta a cambio de
     retribución o por contrata». No usar 4225 por defecto.
   - Flujo: el recaudo del dueño va al pasivo; se liquida la remuneración y se paga el saldo; la
     compensación queda soportada. Criterio de ingreso neto del agente (CTCP 2022-0615).
3. **Modalidad compra para revender:** compra, inventario, proveedor (**2205** solo aquí), ingreso bruto y
   costo de venta. El momento contable es el de la adquisición, no el de la llegada física.
4. **Otras obligaciones contractuales:** se clasifican por su naturaleza.
5. **Facturación:** en mandato factura el mandatario, separando las operaciones del dueño de las propias.
   La DIAN asimila el estimatorio a ese tratamiento (Oficio 15296 de 2026; Oficio 19472 de 2005). **No se
   generan por defecto dos facturas entre las partes** si no hay compra real.
6. **IVA:**
   - En mandato ordinario lo responde el mandante.
   - El estimatorio y algunas comisiones tienen reglas especiales (Estatuto Tributario, arts. 438 y 455),
     con responsabilidades para las dos partes y bases distintas. No se puede asumir que el IVA va solo
     sobre la comisión.
   - La comisión de intermediación, si es un servicio independiente, se factura al contratante y
     normalmente lleva IVA del 19 % si el prestador es responsable; que el producto sea excluido no
     vuelve excluida la comisión.
   - En un estimatorio con margen no se agrega otra comisión con IVA sobre ese margen sin definir antes el
     tratamiento.
   - **El tratamiento tributario se configura por contrato.**
7. **Retenciones:** separadas para la venta y para la remuneración, más reteIVA y reteICA cuando procedan.
   Dependen del concepto, las calidades tributarias de las partes, el municipio y la fecha. En mandato se
   atiende la calidad del mandante; la remuneración propia se analiza aparte. **Nada de tarifa única para
   «consignación».**
8. **Antes de operar** se revisan el contrato o las condiciones reales del negocio y el RUT de las partes.
   El sistema separa mercancía propia y ajena, liquida por dueño y deja configurar el tratamiento.

### Precisiones del Contador (2026-11-07, tercera respuesta)
1. **Mercancía recibida:**
   - Se controla físicamente como existencia de terceros.
   - No entra al inventario financiero propio cuando corresponde actuar como agente.
   - Las cuentas de orden no se aplican indiscriminadamente: en una compra real van inventario propio y la obligación.
2. **Mercancía entregada:** sigue como activo del dueño mientras corresponda mantener su reconocimiento. El despacho por sí solo no es una venta.
3. **Anticipos:**
   - Entregarlos no genera automáticamente compra ni gasto.
   - Después pueden aplicarse a una compra debidamente soportada.
   - Se conservan el saldo y la trazabilidad.

## Correcciones del Contador 2 (2026-11-07)

Mandan sobre todo lo anterior. Cómo quedó cada punto en `20261108121000_consignaciones.sql` (sin aplicar) y en la UI:

1. **Clasificación obligatoria, sin valor por defecto:** intermediación (mandato), estimatorio o compra real.
   `consignment_notes.contract_type` es `not null` sin `default`; `fn_consignacion_terminos` responde
   `clasificacion_obligatoria` si falta. La UI (`CondicionesContratoCampos`, en recibir y en la nueva nota entregada) no deja
   enviar sin elegirla. **La compra real no es consignación**: las RPC responden `compra_real_usa_factura` y la UI lleva a la
   factura de compra (o de venta, del lado del dueño).
2. **Mercancía recibida:** control físico como existencia del consignante (kardex `transfer_in` sin costo, producto de
   consignación siempre aparte) y cuentas de orden **911520 contra una cuenta del grupo 94**, solo en intermediación y
   estimatorio. En compra real no hay cuentas de orden: inventario propio + obligación, por la factura de compra.
3. **Mercancía entregada:** enviarla no es venderla. Sigue en el inventario del dueño: el asiento al entregar es una
   reclasificación **dentro del grupo 14** (clave `inventario_consignacion`; respaldo 1465; la función rechaza una cuenta que no
   empiece por 14). Nada de ingreso ni costo al entregar.
4. **Intermediario:** el recaudo del dueño va al auxiliar de 8 dígitos bajo **281510** del propietario (la cuenta de ingreso y
   de devolución del producto de consignación por la RPC de cuentas de catálogo; en el POS, reclasificación desde la cuenta de
   ingreso de su regla). La remuneración, a un auxiliar de **413512**. `owner_obligation_at` (`venta` | `cobro`) es
   obligatorio en intermediación: con «al cobro», la liquidación solo toma lo cobrado y una venta a crédito deja el pendiente
   `consignacion_obligacion_al_cobro`. 2205 solo en compra real (y en el estimatorio, por su factura de compra).
5. **Compra real:** inventario + obligación al adquirir y costo al vender: es la factura de compra de siempre. Nunca la compra
   directo al gasto. (El estimatorio usa la cuenta de costo en su factura de compra porque la unidad ya salió vendida al
   adquirirla: pregunta abierta al Contador.)
6. **Liquidación:** separa precio de venta, precio pactado, lo del dueño, remuneración, descuentos e IVA
   (`consignment_settlements.sale_total | agreed_total | owner_amount | commission_amount | discount_total | tax_total`). El
   contrato define la base del porcentaje (`commission_base`: precio pactado o de venta) y quién asume devoluciones, pérdidas y
   gastos (`risk_terms`). Una devolución de algo ya liquidado: si la asume el dueño, resta en la próxima liquidación; si la
   asume el consignatario, no toca lo del dueño. En los dos casos, pendiente `consignacion_devolucion_liquidada`.
7. **Facturación e impuestos:** `billing_terms` guarda quién factura y por cuenta de quién (en mandato, el mandatario, por
   cuenta del consignante). **IVA y retenciones no se eligen**: se quitó la entrada libre de retenciones; cada liquidación
   guarda los hechos (`tax_facts`: calidades tributarias de las dos partes, concepto, municipio, fecha) y deja el pendiente
   `consignacion_impuestos_por_determinar`; en estimatorio, además, `consignacion_base_iva_estimatorio`.
8. **Controles:** prueba en seco (begin … rollback) de liquidaciones parciales, devolución después de pagar al dueño,
   anulación de la última liquidación y bloqueos; 0 asientos descuadrados. Nunca se inventan cuentas: si falta una, la RPC se
   bloquea con su código y la app deja el pendiente `consignacion_config` en la bandeja de Pendientes contables
   (`fn_consignacion_registrar_pendiente`, solo códigos conocidos).

Precisiones adicionales del Contador (mismo día):

- **Recibida:** no entra al inventario financiero propio cuando se actúa como agente; las cuentas de orden no se aplican
  indiscriminadamente: en compra real no van, va inventario propio + obligación (punto 2).
- **Entregada:** sigue como activo del dueño mientras corresponda mantener su reconocimiento; el despacho por sí solo no es
  venta (punto 3).
- **Anticipos al consignante:** entregarlos no genera compra ni gasto; después se aplican a una compra debidamente soportada.
  Se reutilizan los **anticipos a proveedores** existentes (`20261108120000_anticipos_proveedores.sql`, sin aplicar): en
  estimatorio, el borrador de la factura de compra que crea la liquidación se completa con el soporte del consignante y ahí se
  aplica el anticipo. No hay otra lógica de anticipos.

### Vínculo genérico entre organizaciones (`20261108120500_organization_links.sql`, sin aplicar)

`organization_links` (invitación de un solo uso: solo el sha-256 del token; `token_hash` sin privilegio de lectura para
`authenticated`), `organization_link_parties` (el tercero propio de cada lado; cada organización ve solo su fila),
`organization_shared_documents` (la COPIA inmutable del documento, `payload`; lectura para las dos partes) y
`organization_link_product_map`. Propósitos `consignacion | orden_compra | factura`. **Listo para órdenes de compra y facturas
entre organizaciones, sin construirlas:** cada una necesita (1) su `kind` (ya admitido en el CHECK), (2) una función del emisor
que arme el payload filtrado y llame a `fn_documento_compartido_publicar`, y (3) una función del receptor que lo acepte con sus
propias RPC (p. ej., la orden de compra recibida crea un pedido de venta o una cotización del proveedor) y marque
`fn_documento_compartido_aceptado`. Rechazar y anular ya son genéricos (`fn_documento_compartido_responder`).

## Ronda 2 del Contador (2026-11-07)

Manda sobre todo lo anterior (fuente: `docs/contador/RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md`, «Consignación: ocho
decisiones»). El Contador no da visto bueno para operar ni declarar: las migraciones siguen **sin aplicar**. Cómo quedó cada
punto en `20261108121000_consignaciones.sql` (reescrita, v3) y en la UI:

1. **911520 contra una cuenta DEFINIDA del grupo 94.** La contrapartida ya no se adivina por patrón: se define por organización
   en `consignment_account_settings` (tabla propia; no claves nuevas en `configuracion_contable`, cuyo CHECK cerrado también
   redefine `20261108170000`) con `fn_consignacion_configurar_cuentas`, que exige una cuenta de movimiento del grupo 94 de SU
   plan (9905 queda fuera). Sin ella, recibir se bloquea con `sin_cuenta_contra_orden` y pendiente visible. **Valoración por
   contrato** (`memo_valuation`): «costo acreditado» por el dueño o «valor convenido», identificado para la custodia
   (`consignment_note_lines.credited_cost`, `memo_unit_value`); todos los asientos de orden usan ese valor y nunca se vuelve
   activo propio. UI: «Cuentas de consignación» en la página y aviso si falta la contrapartida.
2. **Estimatorio sin compra ni costo automáticos.** Se quitó todo: `lineas_compra`, el borrador de factura de compra al
   liquidar, `fn_consignacion_recibida_cerrar_compra`, su ruta y la cuenta de costo. El contrato separa **modalidad jurídica**
   (`legal_modality`), **condición contable** (`accounting_role`: agente | principal; mandato ⇒ agente) y **tratamiento
   tributario** (`tax_treatment`, lo deriva el sistema). Sin defaults. La compra real exige adquisición demostrada: factura de
   compra manual (`compra_real_usa_factura`).
3. **Factura al público.** En mandato factura el mandatario con el POS y la factura de siempre; lo ajeno va en productos de
   consignación aparte (su ingreso es el auxiliar 281510 del dueño). **El estimatorio queda bloqueado para operar**
   (`estimatorio_bloqueado_438_455` en entregar, recibir y liquidar, con pendiente visible) hasta que una migración aprobada por
   el Contador cargue `consignment_account_settings.estimatorio_rules` (arts. 438 y 455); no hay RPC para escribirlas. No se
   genera factura del dueño al intermediario por defecto.
4. **Remuneración.** Ingreso cuando se devenga, según el contrato (`remuneration_recognition`): «al vender», el disparador del
   kardex registra D auxiliar 281510 / C auxiliar 413512 por cada venta (y su reverso en la devolución); «al liquidar», en la
   liquidación. Si es un servicio independiente con obligación de facturar (`fee_invoice_required`), la liquidación deja el
   pendiente `consignacion_factura_remuneracion` («no sustituye la factura»; su IVA va en esa factura, sin duplicar).
5. **Retenciones por pago o abono.** Ninguna entrada de retenciones. Desde la primera venta queda un pendiente por nota
   (`consignacion_retenciones_pago_abono`); cada liquidación guarda en `tax_facts` las calidades del **mandante** (tipo,
   régimen, responsabilidades, municipio) y del mandatario, separando venta y remuneración.
6. **Obligación con el dueño en 281510.** Su saldo se paga por Dinero de terceros; nunca una compra ni un documento soporte
   fabricados. **Anticipo al consignante:** el de anticipos a proveedores (`supplier_advances`), cruzado con la obligación REAL
   (saldo acreedor del auxiliar 281510 del dueño) por `fn_consignacion_cruzar_anticipo`: D auxiliar 281510 / C cuenta del
   anticipo, baja el saldo del anticipo y queda en `consignment_advance_crossings`. UI: «Cruzar anticipo» en la nota.
7. **Faltantes, daños y devoluciones posteriores: nada automático.** `fn_consignacion_registrar_novedad` registra evidencia,
   responsable y obligación (`consignment_incidents`), saca la mercancía del control físico y de las cuentas de orden y deja el
   pendiente `consignacion_novedad`; ni gasto ni cuenta por pagar. Una devolución de algo ya liquidado es un **derecho frente al
   dueño** (`consignment_allocations.owner_right`, pendiente `consignacion_derecho_frente_al_dueno`): solo se descuenta en la
   siguiente liquidación con `p_descontar_derechos` y el acuerdo escrito (`rights_agreement`); si no habrá otra, se cobra. Si el
   contrato pone las devoluciones a cargo del consignatario, no toca lo del dueño (`absorbed`). Anular la liquidación que tomó
   esa venta devuelve el reverso a ordinario.
8. **Entregada: sin 1465.** Sigue en el inventario propio a costo, sin cambio de cuenta y sin asiento: el kardex la traslada a
   la ubicación «En poder de {consignatario}» (la nota: `location`, `transfer_out` con `source_id = 'consignacion:<nota>'`), con
   su costo identificado por línea. Se quitó `fn_cuenta_inventario_consignacion`. La liquidación del lado del dueño en mandato
   sigue esperando al Contador (`liquidacion_mandante_pendiente`).

**Prueba en seco (ronda 2):** un solo `begin … rollback` con las dos migraciones, organizaciones 137 y 138 y sus dueños
simulados; nada quedó. Bloqueos verificados: sin contrapartida definida, 9905 y 9115 como contrapartida, sin modalidad, sin
condición, sin valoración, compra, estimatorio, mandato como principal, sin reconocimiento, sin costo acreditado, novedad sin
evidencia, descontar sin acuerdo, anticipo de otro consignante, más que el saldo del anticipo, más que la obligación con el
dueño, entregar estimatorio, entregar producto ajeno, entregar sin clasificación, liquidar el mandato del dueño y operar otra
organización desde la sesión. Cifras: custodia 400.000 (10 × costo acreditado 40.000) y 250.000 (valor convenido); venta de 3
→ dueño 153.000, remuneración 27.000 devengada al vender; faltante 40.000 fuera de custodia sin gasto; devolución posterior →
derecho de 60.000 y reverso de la remuneración 9.000; con acuerdo, dueño 51.000; al liquidar con precio de liquidación,
remuneración 16.000 en la liquidación y su contra-asiento al anular; cruce de anticipo 50.000 (saldo 50.000); entregada: 0
asientos, kardex `transfer_out`, 0 líneas en 1465; entre organizaciones: custodia 120.000 con el costo acreditado del dueño,
liquidación 70.000 → dueño 63.000 y la diferencia `mandante_pendiente` del lado del dueño. **0 asientos descuadrados.** Hallazgo
corregido tras la corrida: «solo se anula la última» comparaba `created_at`, que empata dentro de una transacción; ahora usa
`consignment_settlements.seq` (identidad), y anular cierra los pendientes de esa liquidación.


## Ronda 3 del Contador (2026-11-08)

Fuente: `docs/contador/RESPUESTAS-CONTADOR-RONDA-3-2026-11-08.md`. El Contador **no da visto bueno integral** para operar ni
declarar; esto es lo que cambia en la propuesta, que sigue SIN aplicar (`20261108121000_consignaciones.sql` v4, md5
`db50d76130be3c2cd8810acdd29821d1`; `20261108120500_organization_links.sql` sin cambios).

### 1. Comisión: se reconoce cuando se devenga, nunca por la fecha de liquidación

- Se **quitó** la opción `al_liquidar`. `consignment_notes.remuneration_recognition` admite solo `al_vender` (lo normal: la
  unidad vendida) u `obligacion_posterior`.
- `obligacion_posterior` exige documentar **cuál** obligación posterior real condiciona el devengo
  (`post_sale_obligation`, 10 a 1000 caracteres; CHECK en la tabla y `obligacion_posterior_obligatoria` en
  `fn_consignacion_terminos`). Viaja también en la copia que se comparte entre organizaciones.
- Al vender, cada porción guarda su remuneración (`consignment_allocations.remuneration_amount`) y si ya se reconoció
  (`remuneration_recognized`). En `al_vender` se asienta en el momento (D auxiliar 281510 / C auxiliar 413512). En
  `obligacion_posterior` no se asienta: queda el pendiente `consignacion_remuneracion_por_devengar`.
- Se reconoce al cumplirse, **con evidencia**: `fn_consignacion_reconocer_remuneracion` (evidencia de 10 a 2000 caracteres,
  idempotente; tabla `consignment_remuneration_recognitions`). Asienta lo vendido y aún no reconocido, neto de devoluciones,
  marca las porciones y cierra el pendiente. En la nota: acción «Reconocer remuneración» y un aviso con lo que falta.
- La liquidación ya **no** registra ningún asiento de remuneración (ni su anulación un contra-asiento): muestra lo que
  queda por devengar (`remuneracion_por_devengar`). Una devolución solo reversa la remuneración que ya se reconoció.

### 2. Retenciones: operación y remuneración, por separado

Tabla `consignment_settlement_withholdings`: una fila por ámbito, clase (retefuente, reteIVA, reteICA) y grupo de pagadores,
con base, regla, tarifa, valor, estado (`determinada`, `pendiente`, `no_aplica`), motivo y las calidades usadas. **Un
pendiente nunca trae valor** (CHECK: `amount` es NULL salvo en `determinada`): nunca se presume 0.

- **(a) Operación** (la venta por cuenta del mandante). La practica el comprador agente de retención (RUT 07 o 13 en renta;
  09 o 13 en IVA), con la calidad tributaria del **mandante** (autorretenedor 15 o SIMPLE 47: no aplica en renta; no
  responsable 49: no aplica en IVA; sin datos del mandante: pendiente). Los compradores se agrupan por la venta (POS o
  factura): consumidor final y no agente, no aplica; sin datos fiscales, pendiente; agente, se aplica la regla.
- **(b) Remuneración** del intermediario (sobre la comisión). La practica el dueño (el pagador) si es agente, con la calidad
  del **intermediario** (perfil tributario vigente de la organización). Sin perfil, o sin datos fiscales del dueño:
  pendiente. El IVA de la comisión se determina aparte (pendiente `iva_de_la_remuneracion_por_determinar`).
- **Reglas configuradas**: tarifa y base mínima en UVT salen de `organization_taxes` (las mismas reglas de retención que usan
  compras y ventas) y de `fiscal_uvt`. La organización elige qué regla aplica a cada ámbito y clase en Consignaciones ›
  Cuentas (`fn_consignacion_configurar_retenciones`, solo reglas propias, activas y de la clase pedida). Sin regla elegida,
  regla inactiva o sin UVT del año: **pendiente** con su motivo, nunca 0 ni tarifa fija.
- **ReteICA**: sin regla municipal elegida, `norma_municipal_sin_confirmar`; con regla, sigue pendiente
  (`calidad_agente_reteica_por_confirmar`) hasta confirmar la calidad de agente municipal.
- **Conciliar**: lo pendiente y lo determinado quedan en «Pendientes contables» (`consignacion_retencion_pendiente` y
  `consignacion_retencion_por_conciliar`) y se concilian con el certificado (`fn_consignacion_conciliar_retencion`: valor
  real del soporte, soporte obligatorio). Lo determinado no se asienta: espera el certificado. Anular la liquidación cierra
  sus pendientes de retención.
- **En pantalla**: cada liquidación muestra las dos secciones por separado (operación y remuneración), con estado, base,
  tarifa, valor o motivo y la acción «Conciliar». La copia que recibe el dueño vinculado trae las retenciones separadas.
- **Decisión técnica**: se usan solo piezas ya aplicadas (`organization_taxes`, `fn_clase_retencion`, `fiscal_uvt`,
  `organization_tax_profiles`, responsabilidades del RUT en proveedores y clientes). El evaluador de calidades del equipo de
  anticipos (`supplier_tax_qualities`, `reteica_reglas`) vive en su migración 20261108170000, aún sin aplicar; cuando se
  aplique, conviene que consignación lo llame en vez de su propia lectura de calidades (regla 7: una sola lógica).

### 3. Estimatorio

Sigue **bloqueado** (`estimatorio_bloqueado_438_455`) hasta parametrizar los arts. 438 y 455 con el Contador.

### Prueba en seco

`docs/contador/pruebas/15_consignaciones_ronda3_comision_y_retenciones.sql` y su `.resultado.txt`: las dos migraciones
exactas (md5 comprobado), organizaciones 137 y 138, begin … rollback. **79 de 79 comprobaciones OK**, 22 asientos, 0
descuadrados, ninguna liquidación con asiento de remuneración, ningún pendiente con valor presumido. Nada quedó en la base.

### Móvil (390 px)

En el listado de Consignaciones el ícono del buscador se montaba sobre la primera pestaña. Igual que en Anticipos: el
buscador va en su propia fila y las pestañas de estado debajo, con desplazamiento horizontal
(`src/__tests__/inventario/consignaciones/filtroEstadoMovil.test.tsx`, render a 390 px).

## Ronda 4 del Contador (2026-11-09)

Detalle, evidencia y preguntas en `docs/contador/ANTICIPOS-Y-CONSIGNACION-RONDA-4-2026-11-09.md`. Migración
`20261108121000_consignaciones.sql` corregida en el mismo archivo y **sin aplicar** (md5 `d2a58b49b6016488ba3287a48511d4d5`).

- **Retención practicada ≠ estimada.** `consignment_settlement_withholdings.status` pasa a `estimada` (lo que se espera
  que retengan; nunca se asienta), `practicada` (ya ocurrió, con su asiento), `pendiente` o `no_aplica`. La practicada se
  reconoce en su fecha con `fn_consignacion_retencion_practicada`, sin esperar el certificado.
- **Asientos.** Operación (la practica el comprador): D 281510 del dueño / C cartera del cliente + pendiente
  `consignacion_cartera_retencion_por_aplicar`. Remuneración (la practica el dueño): D 1355 retención sufrida / C cuenta
  por cobrar al dueño hasta su saldo, el resto C 281510. Conciliar **solo compara** el certificado con lo practicado.
- **Cuentas nuevas en `consignment_account_settings`:** `owner_receivable_account_code` (cuenta por cobrar de la
  remuneración al dueño, obligatoria en la recibida) y `withheld_accounts` (retención sufrida por clase, 1355).
- **Compensación de la comisión.** Término obligatorio en la recibida de intermediación: `compensacion_remuneracion`.
  Con pacto y saldo **exigible** (`fn_consignacion_saldo_dueno`: libros menos lo facturado «al cobro» sin cobrar) se
  descuenta de la 281510; si no, cuenta por cobrar al dueño (`consignment_allocations.remuneration_receivable`). La
  compensación posterior queda en `consignment_commission_offsets` (`fn_consignacion_compensar_remuneracion`).
- **Anular una liquidación** no cierra los pendientes de hechos vigentes; la practicada pasa a la siguiente
  (`carried_from`) y los pendientes se cierran al quedar cubiertas sus ventas (`reliquidada:<id>`) o al anularse el
  hecho (`venta_revertida`).
- **Criterios tributarios compartidos con anticipos** (`fn_tributario_*` de 20261108170000), por comprador y por dueño;
  sin ellos, todo queda `pendiente/criterios_tributarios_no_instalados`. ReteICA usa la regla municipal
  (`reteica_reglas`). Se retiraron `fn_consignacion_tiene_resp` y `fn_consignacion_aplicar_regla`.
- **Corrección encontrada por la prueba 22:** con obligación «al cobro», la devolución de una factura no cobrada ya no
  entra sola a la liquidación.
- **Pantallas:** el contrato recibido pregunta por la compensación; las retenciones muestran *Estimada* / *Practicada* y
  ofrecen «Registrar practicada» (`POST /api/consignaciones/recibidas/retenciones/[id]/practicada`). Sin pantalla aún
  (Figma primero): compensación posterior y configuración de las cuentas nuevas.
- **Pendiente:** el lado del mandante (circuito bilateral) y la aplicación de la retención del comprador a la factura en
  cuentas por cobrar.
