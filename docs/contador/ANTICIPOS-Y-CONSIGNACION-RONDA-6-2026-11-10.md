# Anticipos y consignación — correcciones de la ronda 6 del Contador (2026-11-10)

Respuestas 9 a 13 de `RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md` y el pendiente «la liquidación todavía no aplica el orden
ni deja constancia de la entrega escrita». El hallazgo del reparto y las respuestas 1 a 8 (IVA y perfil) las trabaja el
otro equipo en su informe.

**Nada se aplicó.** Las migraciones de este frente siguen **ESCRITAS, NO APLICADAS**, con su reversión. La migración nueva
de cartera (`20261110100000`) se escribió porque el Contador confirmó el criterio (respuesta 10); **aplicarla es decisión
del dueño**, como las demás. Todo lo de abajo se comprobó en
pruebas en seco: una transacción que termina con una excepción (= rollback), con las migraciones cargadas completas y
exactas (md5 comprobado dentro de la corrida).

| Archivo | md5 final |
|---|---|
| `supabase/migrations/20261108121000_consignaciones.sql` | `9179856af861a2a886152c1ebbb4f2fd` |
| `supabase/migrations/20261108170000_anticipos_proveedores_contador.sql` | `3fe4535a0afe9dc1fa58ece1dea5363d` |
| `supabase/migrations/20261110100000_cartera_abono_retencion_consignacion.sql` — **nueva** | `9f4ade93850013b4cacd3c795ef8d823` |
| `supabase/rollbacks/20261108121000_consignaciones_rollback.sql` | `4782c7389399ef015c29c575b30d69bf` |
| `supabase/rollbacks/20261108170000_anticipos_proveedores_contador_rollback.sql` | `c4fe5d481857d9f1fa9b286190f7ddd8` |
| `supabase/rollbacks/20261110100000_cartera_abono_retencion_consignacion_rollback.sql` — **nueva** | `a333e61071756df3e48e31cf5bc66355` |

Las corridas cargaron además, sin cambios de este frente: 20261108120500 `6a5a3ead2fe311fdde4b7d5c0376c12b`, 140500
`4b00bf10bf99ff2a97e2e89ff0480811`, 160000 `85fd17321a7e85d85a58916cb2f84c95`, 160500 `a3e330a9cf7b01c6da242b7d3f3a2b8c`
y 165000 `1ec6641bdf74dfc15163d0753982309f` (160500 en la versión que el otro equipo tenía en disco a la hora de la
corrida; cambió desde la ronda 5).

## Evidencia

Corridas del 2026-11-10 (Bogotá). Escrituras solo en la org 374 (sucursal 585) y, en los casos entre dos organizaciones de
la prueba 14, en la org 138 (sucursal 113). La prueba 30 solo **lee** lo pagado de las facturas de las demás
organizaciones.

| Prueba (`docs/contador/pruebas/`) | md5 del archivo | Resultado | md5 del `.resultado.txt` |
|---|---|---|---|
| `20_anticipos_consignacion_integrada_completa.sql` — **integrada**, archivos completos y exactos | `371de1e9c862aa23475258d674926219` | **360/360** + 9/9 de carga (11: 53 · 21: 54 · 25: 25 · 15: 73 · 22: 39 · 26: 23 · 20: 21 · 29: 24 · 30: 48) | `4c882658024f2d5bbf82d6d839187bd3` |
| `29_anticipos_ronda6_contador.sql` — **nueva** | `ea7c2b154b2f75169a24c43bdabaaa61` | 24/24 + 9/9 | `9e8f6de6891ebcdffa8b531104a2d75e` |
| `30_consignacion_ronda6_contador.sql` — **nueva** (cartera saldada con 69.690 + 1.710, facturas de control) | `f191a21c530287baddd2c6f09fd16384` | 48/48 + 9/9 | `7fcaaff8e6d6f8b2c06b95b01584c477` |
| `14_consignaciones_ronda2_punta_a_punta.sql` (con I1–I6 entre dos organizaciones) | `f51d8a7a632a3f1a65570a0e15290084` | 64/64 + 9/9 | `c1d4754e3fa70fe252e6fb66c648a53d` |
| `11_anticipos_correcciones_contador.sql` | `e6261121bbe9665524f6daf18e0afc71` | 53/53 + 9/9 | `54ee50b8c6a2c284bb3d3789b73807a8` |
| `15_consignaciones_ronda3_comision_y_retenciones.sql` | `d6c94d0c90b27f3747b141ac6e401cbe` | 73/73 + 9/9 | `149af6912b6dd0cf509e3b6cd2caeecd` |
| `21_anticipos_ronda4_aiu_ica_devoluciones.sql` | `c12939a1d6fc59dad2ffaab897293b4c` | 54/54 + 9/9 | `839cee1f593deb1ce777065bf66dc8b6` |
| `22_consignacion_ronda4_retenciones_y_comision.sql` | `ff1be07e7b944796838d438e7a58305f` | 39/39 + 9/9 | `8ab2d389916fb2a202dedb1f1c3bad83` |
| `25_anticipos_ronda5_contador.sql` | `f618a8e7790a8fc34390a261e21012fb` | 25/25 + 9/9 | `d81578de5102ba3ccf3a88a3c7e0c7ec` |
| `26_consignacion_ronda5_contador.sql` | `83987aedf74d9fe3e12d228ea22d4534` | 23/23 + 9/9 | `c359371f55240498f205d9bfd3c75cf4` |

La carga tiene ahora 9 archivos: las 8 migraciones en orden de versión y la **reversión** de 20261110100000, cuyo md5 se
comprueba pero no se ejecuta en la carga (la prueba 30 la ejecuta para comparar el antes y el después). Cada
`.resultado.txt` trae la fecha, el md5 de cada migración, el md5 de lo ejecutado y las corridas que fallaron antes de la
que vale. La integrada corre en una sola transacción, sobre el mismo estado: 11 → 21 → 25 → 15 → 22 → 26 → 20 → 29 → 30;
su salida se filtró al resumen y a las fallas (ninguna); el detalle de cada cuerpo está en su propio resultado.

Verificación al terminar (solo lectura): las tablas y funciones de las tres migraciones siguen sin existir en la base;
`fn_invoice_sales_paid` y `fn_excedente_nota_credito` siguen con su md5 de hoy (`4c772ca4…`, `e9cb33e0…`); en las orgs 374
y 138 no quedó ningún proveedor, cliente, producto, factura, pago, asiento, anticipo ni pendiente de las pruebas; la 374
sigue con 1 miembro; los 159 objetos grandes usados para subir los archivos se borraron (solo los de este frente, por md5).

**Esperados que cambiaron, y por qué** (ningún cálculo de las rondas anteriores cambió):

- 25 · P5: «por_confirmar» → «dos_siguientes». Es la respuesta 9.
- 26 · C5, C7, C8, C9 y 22 · R6: con la migración de cartera cargada, el abono nace **aplicado** y la factura queda
  saldada (C5 «aplicada · 0.00 · 0.00»; C7 ya no hay nada «por aplicar»; C8 «0.00 · 0.00»; C9 y R6, 0 pendientes de
  cartera). Es la respuesta 10.
- 15 · Z10 y 14 · Z10: aparece el pendiente nuevo «consignacion_liquidacion_escrita_por_entregar» (×3 y ×4: una por
  liquidación vigente). Es la respuesta 13.
- 30 · D4 (solo formato): lo pagado antes sale sin decimales («69690»).

## Anticipos

### Respuesta 9: reteIVA en exceso

| Qué pidió | Qué cambió | Dónde | Prueba |
|---|---|---|---|
| El saldo que no alcance va a los **dos períodos siguientes**, como en la anulación (DUR 1.3.2.3.1: «aplicará el mismo procedimiento») | `fn_retencion_periodo_descuento` en exceso de reteIVA devuelve `dos_siguientes` con los dos períodos (cruza de año); el pendiente `descuento_retencion_siguientes_periodos` lleva `limite_periodos = 2`. El reintegro devuelve además `saldo` y `periodos_saldo`. La regla queda escrita: «período del reintegro; el saldo, en los dos períodos siguientes (el mismo procedimiento de la anulación)» | 170000 | 29 P1–P3, E2, E3; 25 P5 |
| Se mantienen la solicitud escrita y la manifestación de no imputación | Sin cambio: sin la manifestación, bloqueado | 170000 | 29 E1, E4; 25 E1–E3 |
| Renta en exceso no cambia | Período del reintegro, saldo en los siguientes sin límite | 170000 | 29 P4 |

### Respuesta 11: anticipo de AIU sin costo directo y cierre del contrato

| Qué pidió | Qué cambió | Prueba |
|---|---|---|
| Un anticipo de AIU **sin costo directo** queda pendiente hasta validar el contrato y la naturaleza del pago | El evaluador lo marca `sin_costo_directo` y sus retenciones quedan pendientes (`aiu_contrato_pendiente_validacion` si el contrato no está validado; `aiu_anticipo_sin_costo_directo` si lo está). El pendiente «retención por evaluar» es la validación de la naturaleza del pago, y **no se resuelve con el contrato sin validar** (`aiu_contrato_sin_validar`) | 29 A1–A4, A6 |
| No se le aplica de entrada el 10 % de todo el contrato | Su base es la A + I + U que trae (50.000, no 100.000 de un contrato de 1.000.000); no se le aplica el piso acumulado | 29 A1 |
| No se da por buena una base que deje el contrato por debajo del piso **al cerrar**; definir «cerrar» | **Cerrar = registrar el acta de liquidación final del contrato** (`fn_aiu_contrato_cerrar`, permiso `finance.approve`): fecha, valor final ejecutado, base gravada final y acta. Exige: contrato validado; ningún anticipo de AIU sin costo directo con su naturaleza por validar (`aiu_cierre_con_anticipos_pendientes`); valor y base finales no menores que lo que registran sus operaciones (`aiu_cierre_inconsistente_con_operaciones`); y, en servicios del 462-1, base final ≥ 10 % del valor final (`aiu_minimo_10_contrato_al_cierre`). Cerrado, el contrato no admite operaciones nuevas (`aiu_contrato_cerrado`, retenciones pendientes). Queda escrito quién, cuándo y el acta | 29 C1–C8, Z2 |
| Con costo directo, nada cambia | Piso por operación y acumulado de la ronda 5 | 29 A5; 25 A1–A5 |

## Consignación

### Respuesta 10: el abono por retención cuenta en el saldo de la factura igual que un pago

Migración nueva `20261110100000_cartera_abono_retencion_consignacion.sql` (ESCRITA, NO APLICADA; va después de 121000).

**Diseño elegido y por qué.** Se estudiaron `fn_invoice_sales_paid` (leída por el MCP con `pg_get_functiondef`) y los
disparadores de `payments`, `invoice_sales`, `credit_note_applications` y `accounts_receivable`:

- El saldo de una factura de venta lo calculan **tres** caminos —el disparador de `payments`
  (`fn_recalc_invoice_balance_from_payments`), el de notas crédito y saldos a favor (`fn_factura_venta_recalcular_saldo`)
  y el de líneas (`fn_recalc_invoice_totals`)— y los tres pasan por `fn_invoice_sales_paid`. La cartera sigue a la factura
  por su disparador (`create_account_receivable`). Por eso el abono se suma **dentro de `fn_invoice_sales_paid`**: cuenta
  igual en los tres caminos y ningún recálculo posterior lo pierde (30 K7: otro pago que luego falla).
- Se descartó registrar el abono como un pago con un método especial: un insert en `payments` dispara el asiento del pago
  (D caja/banco), el número de recibo, la notificación, la caja y los reportes de recaudo; duplicaría el asiento de la
  retención (D 281510 / C cartera) y mostraría como dinero algo que no lo es.
- Solo cuentan los abonos en estado `aplicada`: una factura sin abonos suma 0 y su saldo **no cambia**.
- `fn_excedente_nota_credito` (lo que una nota crédito convierte en saldo a favor del cliente) **resta** el abono: lo que
  se devuelve es dinero, y la retención la pagó el comprador a la DIAN por cuenta del dueño (30 K8: 70.821, no 71.400).
  Así el cambio no altera ningún saldo a favor; qué pasa con la retención si la venta se reversa es la pregunta 2.
- Un disparador en la tabla de abonos recalcula la factura al insertar, cambiar o borrar un abono; la cartera nunca se
  escribe a mano.
- `fn_consignacion_retencion_practicada` deja el abono `aplicada` desde el cobro y ya no abre el pendiente
  `consignacion_cartera_retencion_por_aplicar`; los `por_aplicar` que existan pasan a `aplicada` y sus pendientes se
  cierran (`abono_aplicado_en_cartera`). El pendiente de cartera de la ronda 5 queda cerrado.
- La reversión restaura **exactamente** `fn_invoice_sales_paid` y `fn_excedente_nota_credito` (los md5 de su
  `pg_get_functiondef` de hoy) y la `fn_consignacion_retencion_practicada` de 121000 byte a byte; devuelve los abonos a
  `por_aplicar` con su pendiente.

| Qué se comprobó | Prueba |
|---|---|
| La reversión deja las dos funciones aplicadas byte a byte como hoy (antes y al final) | 30 R0, R2 |
| ANTES de la migración: abono «por aplicar», factura con 1.710 | 30 B1 |
| Facturas de control (sin pagos, parcial, total, con nota crédito, anulada): saldo, estado, pagado, cartera y excedente **idénticos** antes y después | 30 D1, D2 |
| **Todas** las facturas de la base (262 sola; 269 en la integrada) sin abono: lo pagado no cambia (0 diferencias) | 30 D3 |
| La del abono sube exactamente en el abono (69.690 → 71.400) | 30 D4 |
| **69.690 + 1.710 dejan la factura saldada**; la cartera la sigue; el abono pasa a aplicado y su pendiente se cierra | 30 K1, K2; 26 C5–C9; 22 R6 |
| Con la migración, el abono nace aplicado (ReteICA 579 con cobro de 70.821); no se abona de más | 30 K3–K6 |

### Respuesta 12: la liquidación aplica lo recaudado en el orden del contrato

| Qué pidió | Qué cambió (121000) | Prueba |
|---|---|---|
| Aplicar lo recaudado en el orden pactado | `fn_consignacion_recibida_liquidar` recorre `orden_aplicacion`: cada concepto toma lo que alcance de lo recaudado del período. **Remuneración**: solo con compensación pactada. **Derechos frente al dueño** (con acuerdo): si no alcanzan, se cobran, no se descuentan. **Anticipos**: los cruces de la nota aún sin liquidar, enteros y por fecha; el que no cabe espera a la siguiente. **Gastos reembolsables**: 0 a la vista (no hay registro). Lo que queda es el **saldo para el dueño** (`payable_amount`); el detalle queda en `consignment_settlements.application`, en la respuesta y en el documento compartido | 30 L4, L6, L12 |
| Sin compensación pactada, la remuneración **no se descuenta** aunque esté en el orden: cuenta por cobrar al dueño | Concepto «remuneración» con `aplicado 0`, `por_cobrar_al_dueno` y motivo `compensacion_no_pactada`; el saldo para el dueño es lo recaudado (60.000, no 51.000) | 30 L1, L2 |
| Los libros como dice la aplicación | Si lo aplicado a la remuneración difiere de lo compensado al vender, la liquidación lo ajusta con `fn_consignacion_ajustar_compensacion` (interna): compensa (D 281510 / C cuenta por cobrar) o revierte (D cuenta por cobrar / C 281510). Nunca toca el ingreso 413512 | 30 L6–L8, Z3 |
| Anular deshace la aplicación | El ajuste se reversa con su contra-asiento y queda anulado; cruces y compensaciones manuales vuelven a esperar | 30 L9, L10 |
| El orden manda también fuera de la liquidación | Un anticipo no se cruza si el orden no incluye «anticipos»; un derecho no se descuenta si no incluye «derechos» | 30 L3, L11 |

### Respuesta 13: liquidación por escrito — plazo desde el corte y constancia de entrega

| Qué pidió | Qué cambió (121000) | Prueba |
|---|---|---|
| El plazo corre desde el **corte del período liquidado**, salvo que el contrato diga otra cosa | `liquidacion_escrita.plazo_desde`: `corte_del_periodo` (por defecto) o `fecha_de_liquidacion` **con la cláusula citada**; «desde la última venta» no se admite. La liquidación guarda `written_due_on` = corte + plazo | 30 W1–W4, E1–E3 |
| Constancia de la entrega (fecha, medio, soporte) | `fn_consignacion_liquidacion_entrega_registrar` (ruta `POST /api/consignaciones/recibidas/liquidaciones/[id]/entrega-escrita`, `withOrg`): fecha (no futura, no antes de la liquidación), el **medio que fija el contrato** y soporte; idempotente; deja escrito si fue fuera de plazo | 30 E4–E11 |
| Pendiente visible si vence sin entrega | Cada liquidación abre `consignacion_liquidacion_escrita_por_entregar`; si ya venció (o vence después), `consignacion_liquidacion_escrita_vencida` (`fn_consignacion_vigilar_liquidaciones_escritas`, idempotente). Entregar los cierra; anular la liquidación cierra el de su entrega (no los tributarios) | 30 E1, E8, E12, E13, L9; 14 y 15 Z10 |

## Pantallas y código (`src/`)

Sin pantallas nuevas (Figma primero). Ningún dato nuevo es obligatorio en los formularios: el plazo «desde el corte» es la
regla por defecto.

- Contratos y servidor: `src/lib/inventario/consignaciones/recibidas.ts` (`plazo_desde` y `clausula` opcionales en la
  liquidación por escrito, `entregaEscritaSchema`, códigos nuevos), `src/lib/services/consignaciones/recibidas.server.ts`
  (aplicación y entrega en la respuesta de liquidar, `registrarEntregaEscrita`, abono `aplicada`),
  `src/lib/finanzas/anticiposProveedor/contrato.ts` (`aiu_contrato_sin_validar`).
- Ruta nueva: `src/app/api/consignaciones/recibidas/liquidaciones/[id]/entrega-escrita/route.ts` (`withOrg`, organización
  de la sesión, `finance.create`).
- Textos: «Reintegro de retención en exceso» explica los dos períodos siguientes; motivos nuevos del AIU en la sección de
  retenciones; errores nuevos en la liquidación, el cruce de anticipos y la resolución de pendientes. Namespaces nuevos
  `finanzasTercerosR6` y `consignacionesR6` en es/en/fr/pt (`textoErrorConsignacion` acepta el de la ronda 6).
- Jest: `src/__tests__/finanzas/tercerosR6/anticiposRonda6.test.ts` y
  `src/__tests__/inventario/consignaciones/recibidasRonda6.test.ts` (nuevos).

## Lo que NO se hizo o sigue pendiente

1. **Ninguna migración aplicada** (121000, 170000 ni la nueva 20261110100000).
2. **Pantallas**: no hay pantalla para registrar la entrega de la liquidación por escrito, ver la aplicación en orden,
   vigilar los vencimientos ni cerrar un contrato AIU (se operan por las RPC y la ruta nueva). Van primero a Figma. La de
   la retención de la operación sigue sin pedir la factura y el cobro.
3. **La vigilancia no está programada**: `fn_consignacion_vigilar_liquidaciones_escritas` deja el pendiente de «vencida»
   cuando se llama; falta decidir si una tarea diaria la ejecuta por organización.
4. **Gastos reembolsables**: el orden los admite, pero el sistema no registra gastos reembolsables del mandato; en la
   aplicación aparecen en 0 con el motivo `sin_registro_de_gastos`.
5. **Las compensaciones manuales** hechas antes de liquidar se imputan a la liquidación siguiente; los anticipos que no
   caben en el recaudo del período esperan a la siguiente (su cruce ya rebajó la 281510: el cuadre es «saldos de las
   liquidaciones − anticipos en espera», 30 L8). Con remuneración por obligación posterior no se ajustan libros en la
   liquidación (se ajustan al reconocerla, como en la ronda 4).
6. **Lado del mandante** de la consignación: sigue sin diseñar.
7. **Hallazgo fuera de este frente (no se tocó)**: `fn_recalc_invoice_balance_from_payments` (disparador de `payments`)
   calcula el saldo como total − pagado **sin restar las notas crédito**, mientras que `fn_factura_venta_recalcular_saldo`
   sí las resta: un pago posterior a una nota crédito puede subir el saldo de la factura. Lo heredó la cartera; la
   migración 20261110100000 no lo cambia (las facturas de control lo muestran igual antes y después).

## Preguntas para el Contador

1. **Cierre del contrato AIU**: ¿el acta de liquidación final (fecha, valor final, base gravada final) es el hecho correcto
   para «cerrar»? ¿Basta la base gravada declarada en el acta o hay que reconciliarla factura por factura?
2. **Retención con nota crédito**: si se reversa la venta en consignación con nota crédito, la retención que el comprador
   practicó (ya abonada a la factura y debitada a la 281510 del dueño) ¿la reversa el comprador y se reintegra al dueño, o
   se trata de otra forma? Hoy el saldo a favor del cliente es solo el dinero que pagó.
3. **Plazo de la liquidación por escrito**: ¿días calendario o hábiles? Hoy se cuentan calendario.
4. **Medio de entrega**: si la liquidación se entregó por un medio distinto del pactado, ¿se acepta con otro soporte o hay
   que entregarla por el medio del contrato? Hoy se rechaza (`medio_distinto_del_pactado`).
5. **Anticipos que no caben en el recaudo del período**: ¿esperan a la siguiente liquidación (como hoy) o se aplican contra
   saldos anteriores sin pagar al dueño?
