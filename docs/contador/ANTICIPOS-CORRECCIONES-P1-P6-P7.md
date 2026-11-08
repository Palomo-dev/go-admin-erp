# Anticipos a proveedores · correcciones según P1, P6 y P7

Fecha: 7 de noviembre de 2026 · Base de datos: proyecto `taqjemqjtumhwptchcxk` · Organización de pruebas: **org 374**.

Responde a sus respuestas P1, P6 y P7 y a las «Condiciones para cerrar su visto bueno · Anticipos»
(`RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md`). Los nombres técnicos aparecen solo para que cada cifra se pueda rastrear.

**Estado de las migraciones (único para todo este documento):**

| Migración | Estado |
|---|---|
| `20261108120000_anticipos_proveedores` | **APLICADA** (no se edita; sus funciones se reemplazan) |
| `20261108165000_tarifas_precision_exacta` (ronda 2) | **SIN APLICAR** |
| `20261108170000_anticipos_proveedores_contador` (rondas 1, 2 y 3) | **SIN APLICAR** |

Orden de aplicación cuando el dueño lo ordene: `20261108120500` → `20261108121000` (consignación) → `20261108140500` →
`20261108160000` → `20261108160500` → `20261108165000` → `20261108170000` (decisión en «Ronda 3», punto 4). Cada una tiene su reversión en `supabase/rollbacks/`. Hoy hay **0 anticipos** en la
base, así que ningún saldo existente cambia. Hasta que se aplique, la pantalla de anticipos dice «pendiente de activar».
Las secciones **«Ronda 2»** y **«Ronda 3»** (al final; la 3 manda sobre la 2) responde `RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md` y reemplaza lo que en las
secciones 1 a 5 diga lo contrario (en particular: la retención repetida ya no se descuenta en silencio al aplicar, la
devolución ya no prorratea retenciones y la cuenta es un auxiliar 133005xx).

---

## 1. Qué cambió

| Tema | Antes | Ahora |
|---|---|---|
| **Cuenta (P6)** | Clave «anticipos_proveedores» o, si no había, **1330** | Solo la cuenta configurada con esa clave, que debe existir, estar bajo 1330, tener más de seis dígitos y no tener hijas. **1330 y 133005 se rechazan**. Sin cuenta válida, **no se registra** y la pantalla muestra «Pendiente contable» con 13300501 como sugerencia si ya existe en el plan. No se crean cuentas. |
| Clave de configuración | La lista cerrada de `configuracion_contable` **no admitía** «anticipos_proveedores» (hallazgo de la prueba): la cuenta nunca se habría podido configurar | Se añade la clave; aparece en Configuración contable como «Anticipos a proveedores» |
| **Aplicación (P6)** | Debitaba la cuenta de la regla vigente «pago a proveedor» | Debita la **línea crédito del proveedor del asiento de causación de esa factura** (22xx/23xx, sin retenciones). Si la CxP no tiene causación vigente, se bloquea. Cada aplicación guarda anticipo, CxP, cuenta debitada y asiento de causación |
| **Conciliación (P6)** | — | Reporte por anticipo (valor, retención, girado, aplicado, retención descontada, devuelto, anulado, saldo de la tabla, saldo en libros de su cuenta) y por proveedor (más el auxiliar de la cuenta por NIT). Botón «Conciliación» (CSV) en la pantalla |
| **Naturaleza (P1)** | No existía | Obligatoria, sin valor por defecto: «anticipo de financiación» o «pago anticipado del precio» |
| **Retenciones (P1)** | No se practicaban | Se evalúan renta, reteIVA y reteICA con el perfil tributario vigente, los datos fiscales del proveedor y las retenciones **ya configuradas** en la organización (las mismas tarifas, bases mínimas en UVT y cuentas que usan las compras). Lo que falte queda **«pendiente»** y visible; nunca se asume 0 ni una tarifa fija. Se guardan base y valor por anticipo |
| No repetir la retención (P1) | — | Al aplicar a una factura que ya retuvo sobre la misma base, la retención de la factura sobre esa parte se descuenta (ver asiento 2.2) |
| **Anulación (P7)** | Anular = contra-asiento que devuelve el dinero al banco, para cualquier anticipo sin usar | Solo si se **declara que el desembolso no ocurrió**, con motivo, soporte y la fecha del ajuste documentado (no futura, periodo abierto). Si el dinero salió, la pantalla ofrece «Registrar devolución» (con soporte obligatorio) o mantener el derecho |
| **Estado del proveedor** | No mostraba anticipos | Muestra anticipo, aplicación, devolución y anulación; el saldo es la posición neta con el proveedor |
| **Historia de la CxP** | Solo pagos | Tarjeta «Anticipos aplicados» con comprobante, valor, cuenta y retención descontada |

## 2. Reglas de retención implementadas (para su confirmación)

**Anticipo de financiación:** las tres retenciones «no aplica»; se practican al causar con la factura.

**Pago anticipado del precio:** el usuario indica la tarifa de IVA de la operación (debe ser una tarifa de IVA activa
de la organización). Base = valor ÷ (1 + tarifa); IVA = valor − base.

| Clase | No aplica cuando | Queda pendiente cuando | Si aplica |
|---|---|---|---|
| Renta | org no es agente de retención · proveedor autorretenedor (O-15) · proveedor en el SIMPLE (O-47) · base menor que la base mínima del concepto | sin perfil vigente o «requiere revisión» · proveedor sin datos fiscales · sin concepto configurado · sin UVT del año | tarifa del concepto elegido × base |
| ReteIVA | operación sin IVA · org no agente de reteIVA (columnas del perfil 160500; si están vacías, O-13/O-23) · proveedor no responsable (O-49) · org y proveedor grandes contribuyentes | sin perfil · proveedor sin O-48 conocido · sin reteIVA configurada | tarifa configurada × IVA del anticipo |
| ReteICA | — | sin reteICA configurada para el municipio · el usuario no confirmó la retención municipal | tarifa de la retención municipal elegida × base |

Los valores se redondean al peso. La cuenta de cada retención es la misma de las compras (`fn_cuenta_retencion_compra`).

## 3. Asientos con ejemplo numérico (los de la prueba)

Proveedor A, responsable de IVA. Organización gran contribuyente y agente de retención. Factura A: 1.000.000 + IVA 19 %
= 1.190.000, con retención 4 % (40.000), reteIVA 15 % (28.500) y reteICA 0,97 % (9.700): CxP 1.111.800.

### 3.1 Registrar · pago anticipado del precio, 1.190.000 en **efectivo** con caja abierta

| Cuenta | Débito | Crédito |
|---|---:|---:|
| 13300501 Anticipos a proveedores | 1.190.000 | |
| 1105 Caja | | 1.111.800 |
| 23652501 Retención servicios (4 % × 1.000.000) | | 40.000 |
| 23670501 ReteIVA (15 % × 190.000) | | 28.500 |
| 23680501 ReteICA (0,97 % × 1.000.000) | | 9.700 |

Todas las líneas con el NIT del proveedor. El comprobante de egreso y el pago son por lo girado (1.111.800); el
efectivo esperado del arqueo baja exactamente 1.111.800. El anticipo queda a favor por el bruto (1.190.000).

### 3.2 Aplicar 595.000 a la CxP de la factura A (la regla vigente de pago se cambió a 23359501 antes de aplicar)

La factura ya retuvo sobre toda su base; el anticipo cubre la mitad de esa base y ya retuvo sobre ella. Lo repetido
(20.000 + 14.250 + 4.850 = 39.100) se descuenta:

| Cuenta | Débito | Crédito |
|---|---:|---:|
| 22050501 Proveedores (cuenta de la causación de la factura, no 23359501) | 555.900 | |
| 23652501 Retención | 20.000 | |
| 23670501 ReteIVA | 14.250 | |
| 23680501 ReteICA | 4.850 | |
| 13300501 Anticipos | | 595.000 |

CxP 1.111.800 → 555.900. Tras aplicar los otros 595.000: CxP 0 (pagada), anticipo 0. Neto por cuenta y NIT del
proveedor: retención 40.000, reteIVA 28.500, reteICA 9.700 — **una sola vez**.

### 3.3 Devolución real · anticipo de 119.000 (retención 7.820); el proveedor devuelve 59.500, soporte «Consignación 0042»

| Cuenta | Débito | Crédito |
|---|---:|---:|
| 1110 Bancos | 55.590 | |
| 23652501 / 23670501 / 23680501 (reversión proporcional) | 2.000 / 1.425 / 485 | |
| 13300501 Anticipos | | 59.500 |

### 3.4 Anular por error · transferencia de 238.000 rechazada por el banco (soporte: extracto)

Contra-asiento completo con la fecha del ajuste: D 1110 222.360 · D 23652501 8.000 · D 23670501 5.700 · D 23680501 1.940
· C 13300501 238.000. El pago queda anulado y el anticipo en cero.

## 4. Resultados de las pruebas en seco

Guion `pruebas/11_anticipos_correcciones_contador.sql`, resultado `pruebas/11_…resultado.txt`. Todo en
`begin … rollback` (la migración se creó dentro de la misma transacción): **no quedó ningún dato**.

- **41 de 41 ok** en una sola corrida con las migraciones, sin aplicar, creadas en la misma transacción en el orden previsto (140500, 160000, 160500 y esta 170000 en su versión final). El arqueo bajó de 2.000.000 a 888.200 (−1.111.800); con las columnas del perfil 160500, sus valores mandan sobre los códigos O-13/O-23 y «requiere revisión» deja las tres retenciones pendientes.
- Cubren: bloqueo sin cuenta, con 1330 y con 133005; naturaleza obligatoria; sin perfil; proveedor sin datos; ICA sin
  norma; tarifa de IVA inexistente; circuito en efectivo; idempotencia; aplicación a la cuenta reconocida; retención no
  repetida; financiación sin descuento; anulación vieja cerrada; anular por error con soporte y fecha; devolución sin
  soporte rechazada; devolución real; anular uno ya devuelto rechazado; estado del proveedor A (saldo 0) y B (215.500 =
  CxP 275.000 − anticipo vivo 59.500); conciliación por anticipo y proveedor; cuadre y ninguna línea en 1330.

## 5. Preguntas abiertas

1. **Financiación:** ¿confirma que en el anticipo de financiación ninguna retención se practica al girar y todas se
   practican al causar la factura?
2. **Proveedor del SIMPLE y autorretenedor:** ¿confirma que no se practica retención en la fuente de renta?
3. **ReteIVA:** ¿la base es el IVA contenido en el anticipo según la tarifa que indica el usuario? ¿confirma que entre
   grandes contribuyentes no se practica?
4. **ReteICA:** hoy la «norma municipal» es la retención de ICA configurada que el usuario elige; sin elegirla queda
   pendiente. ¿Es suficiente o hace falta registrar la norma (acuerdo, actividad, tarifa por mil) por municipio?
5. **Retención repetida:** ¿prefiere que se descuente al aplicar (como quedó) o que se bloquee la aplicación hasta
   corregir la base de retención de la factura?
6. **Devolución:** se revierte la retención en proporción al bruto devuelto (procedimiento de devoluciones y
   anulaciones de operaciones con retención del DUR 1625 de 2016, según lo entendemos). ¿Lo confirma?
7. **Certificado de retenciones:** todavía no incluye las retenciones practicadas en anticipos ni el descuento al
   aplicar. ¿Deben ir en el mismo certificado?
8. **Efectivo en caja cerrada:** un anticipo en efectivo cuya caja ya se cerró no se puede anular por error (se
   bloquea). ¿Cómo quiere tratar ese caso?
9. **Pendiente contable de retención:** se ve en la pantalla de anticipos y en la conciliación, pero no en la bandeja de
   «Pendientes contables» (que es de asientos fallidos). ¿Quiere que también aparezca allí?
10. **Cuenta:** se exige un auxiliar de más de seis dígitos bajo 1330. ¿Algún plan aprobado usa otra estructura?

**Hallazgos no corregidos aquí:** el arqueo resta bien el anticipo en efectivo pero lo muestra en el desglose como
«ventas en efectivo» negativas; la tarifa «ICA Bogotá» de la org 374 está guardada como 0,97 % (la plantilla dice
0,966 %) porque la tarifa tiene dos decimales.

(Ronda 1: la prueba de la línea anterior era la de la ronda 1; la vigente es la de la ronda 2 más abajo, **50 de 50 ok**.
Los dos hallazgos de arriba quedaron corregidos en la ronda 2: ítems 4 y 11.)

---

## Ronda 2 (respuesta a `RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md`, sección «Anticipos»)

Todo va en `20261108170000` (reescrita, **SIN APLICAR**) más `20261108165000` (precisión de tarifas, **SIN APLICAR**).
Prueba en seco: `pruebas/11_anticipos_correcciones_contador.sql`, **50 de 50 ok**, org 374, en una sola transacción
con 140500 → 160000 → 160500 → 165000 → 170000 y `rollback` (resultado en el `.resultado.txt` hermano).

| # | Lo que pidió | Cómo quedó |
|---|---|---|
| 1 | Sin regla universal giro/factura | **Financiación**: la retención queda **«diferida»** (se evalúa cuando el anticipo se convierte en pago o abono del precio, al amortizarlo con la factura), no «no aplica». **Pago anticipado del precio**: se evalúa al girar con la composición de la operación. ICA solo con regla municipal y territorialidad (ítem 4). |
| 2 | SIMPLE y autorretenedores | Calidades **verificadas** del proveedor con soporte y vigencia (`supplier_tax_qualities`): SIMPLE **acreditado** → no se practica renta; un código O-47 sin acreditar → **pendiente**. Autorretenedor: la autorización lleva los **conceptos cubiertos**; si cubre el concepto elegido no se practica; si no lo cubre se practica (prueba 19: honorarios 11 % = 110.000 aunque el proveedor esté autorizado para el 4 %). O-15 sin verificar → pendiente. La autorretención especial (59) no se usa para excluir nada; el reteIVA y el ReteICA del tercero se siguen evaluando. |
| 3 | Base del reteIVA | Base = **IVA de las líneas gravadas** (en el AIU, el de la utilidad). Dividir entre 1 + tarifa **solo** para una suma homogénea al 19 %; con otra tarifa sin componentes se rechaza (`componentes_obligatorios`). Excluidos, exentos y no sujetos no aportan IVA (prueba 12: 500.000 gravado + 200.000 excluido → reteIVA 14.250). AIU (prueba 13): IVA 9.500 solo sobre la utilidad → reteIVA 1.425. Gran contribuyente ↔ gran contribuyente queda **pendiente de verificar** (sin exclusión universal). Responsable de IVA no agente comprando a un SIMPLE responsable: **pendiente** de confirmar el supuesto. |
| 4 | ReteICA y precisión | Regla municipal (`reteica_reglas`): municipio, actividad, **tarifa por mil con 4 decimales**, base mínima, **norma** y vigencia; además territorialidad declarada y calidad «no sujeto de ICA». Falta cualquiera → pendiente. Precisión: `20261108165000` añade `tarifa_exacta numeric(12,6)` a plantillas y retenciones **sin tocar `rate`** (aditiva, sin pérdida). ICA_0.966 queda en 0,966 %: **1.000.000 × 9,66 ‰ = 9.660** (con el 0,97 guardado daba 9.700). |
| 5 | Duplicado: evitarlo al reconocer la factura | Acción **«Vincular a factura en borrador»**: al causar esa factura la base **bloquea** la causación si retiene sobre la base ya retenida en el anticipo (prueba 25), por impuesto. Si ya ocurrió (sin vínculo), aplicar se **rechaza** (`retencion_duplicada`) y solo procede como **corrección documentada** (motivo y soporte): deja ajustes trazables por impuesto y un **pendiente con los periodos de retención a revisar** (prueba 30). Nada se compensa en silencio. |
| 6 | Devolución | Se registra el **dinero** que regresa y, por impuesto, la retención relacionada con la parte devuelta con su **procedimiento** (la de ICA con su norma). **No hay prorrateo automático.** Si no se puede determinar, baja solo el dinero, las retenciones siguen en el anticipo y queda un **pendiente** (prueba 35). |
| 7 | Certificados | `fn_retenciones_practicadas_filas` (la base de `CertificadosRetencionPage` y del reporte de retenciones) incluye las retenciones de anticipos y sus ajustes con signo, por impuesto, tercero y concepto, en su fecha. Como la factura vinculada no retiene otra vez, nada se repite. Prueba 42/46: certificado del proveedor B = 31.540 = libros 236x de su NIT. |
| 8 | Caja cerrada | Anular por error con la caja cerrada **no reabre la caja ni anula su pago**: el arqueo original queda igual (prueba 38); el ajuste es contable, en periodo abierto, con soporte, y queda un **pendiente** para revisar la diferencia de esa caja. Si el dinero sí salió, no se anula: se registra la devolución o se mantiene el derecho. |
| 9 | Pendientes | `anticipo_pendientes` con estado abierto/resuelto, visibles en la pantalla («Pendientes contables de anticipos») y en la conciliación. Solo se cierran con **resolución y soporte** (permiso de aprobación); no se reabren. |
| 10 | Cuenta | Auxiliar de **detalle de ocho dígitos bajo 133005** (13300501…). Otra cuenta solo con **equivalencia aprobada** y nota (`anticipos_cuenta_equivalencias`, permiso de aprobación). 1330 y 133005 se rechazan. |
| 11 | Textos | Devolución: «**$55.592 al banco y $3.908 de retenciones**» (con 9,66 ‰ las cifras de su ejemplo pasan de 55.590/3.910 a 55.592/3.908). Arqueo: renglón propio **«Egreso por anticipo»** (y «Devolución de anticipo»); ya no aparece como venta negativa (prueba 23). |
| 12 | Estado unificado | Tabla al inicio de este documento: 120000 **APLICADA**; 165000 y 170000 **SIN APLICAR**. |

**Consignación (coordinación con ese equipo).** Los cruces de un anticipo con la obligación de un mandato
(`fn_consignacion_cruzar_anticipo`, migración `20261108121000`, sin aplicar) ya se cuentan como consumo del anticipo en
la conciliación por anticipo y por proveedor (columna «Cruzado con consignación»), en el listado y en el estado de cuenta
del proveedor («Cruce con consignación»). Mientras esa migración no esté aplicada, no suman nada (prueba 45).

**Para su confirmación (ronda 2):**

1. ¿La base del reteIVA en el AIU debe ser solo el IVA de la utilidad, o hay contratos AIU en que se discrimine IVA
   sobre la administración?
2. Devolución: el procedimiento queda como texto por impuesto. ¿Quiere una lista cerrada (menor valor de la declaración
   del periodo, corrección de la declaración, solicitud de devolución) para el reporte?
3. ¿Qué evidencia mínima exige para acreditar «SIMPLE» y «autorretenedor» (certificado RUT, consulta DIAN, resolución)?
   Hoy se exige un soporte de texto y la vigencia.

---

## Ronda 3 (respuesta a `RESPUESTAS-CONTADOR-RONDA-3-2026-11-08.md`, «Respuestas sobre anticipos»)

Todo va en `20261108170000` (reescrita, **SIN APLICAR**); su reversión deja las funciones como estaban.

### 1. AIU: desactivado como regla general

- Una operación con componentes AIU ya **no** calcula el reteIVA «solo sobre la utilidad». Queda **pendiente**
  `aiu_fundamento_por_validar`: visible en el anticipo y en «Pendientes», sin reteIVA automático.
- Solo se calcula cuando la organización registra la regla aplicable con su fundamento: tabla `reteiva_aiu_reglas`
  (fundamento obligatorio, mínimo 10 caracteres; vigencia; base `utilidad`) por `fn_reteiva_aiu_regla_guardar`
  (`finance.approve`). Sin fundamento: `fundamento_obligatorio`. Con regla vigente a la fecha: IVA 9.500 sobre una
  utilidad de 50.000 y reteIVA 1.425 (prueba 11, verificación 13).

### 2. Devoluciones por procedimiento y causa

La pantalla elige **causa** y llena el **procedimiento**; ya no se eligen retenciones a mano. Las retenciones afectadas
salen del procedimiento (`fn_anticipo_proveedor_devolver`, parámetro `p_procedimiento`):

| Causa | Qué exige | Retenciones afectadas | Declaraciones |
|---|---|---|---|
| (a) Operación anulada o resuelta | documento de la anulación/resolución (o solicitud del proveedor); certificado anulado o corregido; norma local si hay reteICA | todas las vigentes; el dinero + las retenciones deben cubrir el saldo (si no: `anulacion_requiere_devolucion_total`) | período en que se descuenta (AAAA-MM) y si requiere corrección |
| (b) Retención excesiva o indebida | cálculo correcto (base y tarifa), certificado corregido | solo el exceso: vigente − base × tarifa correcta (`sin_exceso` si no hay; reteICA, con la norma local); se reintegra al proveedor por `fn_anticipo_retencion_exceso_reintegrar` (`finance.void`) | período y corrección |
| (c) Devolución parcial | documento, cálculo de la parte devuelta (base e IVA), certificado corregido, norma local si hay reteICA | proporcionales a la parte devuelta: retefuente y reteICA sobre la base, reteIVA sobre el IVA; dinero = base + IVA − retenciones (si no: `calculo_no_cuadra`) | período y corrección |

- Cada movimiento deja su ajuste por impuesto con la causa, el período en que se descuenta, si requiere corrección y los
  soportes; si requiere corrección se abre el pendiente `correccion_declaracion`.
- Lo que no se puede determinar (devolución sin procedimiento) sigue como pendiente `devolucion_retenciones_por_definir`
  y no mueve retenciones.
- ICA: la causa (a) o (c) con reteICA sin norma municipal citada se rechaza (`reteica_requiere_norma`).

### 3. Verificación del proveedor

- **SIMPLE:** RUT actualizado (fecha y archivo, obligatorios: `rut_obligatorio`) y la inscripción con su vigencia debe
  cubrir la **fecha de la operación**; si no, queda pendiente `simple_sin_acreditar`.
- **Autorretenedor general:** RUT + resolución de autorización vigente (número, fecha, alcance y conceptos; sin ella:
  `resolucion_autorretencion_obligatoria`). En cada operación se comprueba que el concepto esté cubierto: cubierto, no se
  retiene; no cubierto (p. ej. honorarios 11 %), se retiene. El reteIVA no cambia por ser autorretenedor de renta.
- **Autorretención especial (RUT 59):** se registra como calidad propia (`autorretencion_especial`) y **no** excluye la
  retención por terceros (prueba 11, verificación 20: se retienen 40.000).

### 4. Prueba integrada anticipo ↔ consignación y orden de aplicación

- **Orden decidido: `20261108121000` va ANTES de `20261108170000`.** 170000 lee `consignment_advance_crossings` (cruces en
  conciliación, estado de cuenta y tercero de las líneas) y no redefine ninguna función de 121000; 121000 solo usa de
  anticipos lo que ya está aplicado (`supplier_advances`, 120000). Aun así, 170000 compila y funciona sin 121000 (la tabla
  se lee solo si existe).
- `docs/contador/pruebas/16_anticipos_consignacion_integrada.sql` (el número 15 lo tomó consignación): anticipo de
  595.000 a un consignante con retenciones, cruce de 300.000 con la obligación del mandato, devolución parcial por
  procedimiento, intento de anular el cruzado (`anticipo_usado`) y anulación por error de un segundo anticipo.
  Concilia: saldo por anticipo y por proveedor 176.000 = libros = auxiliar por NIT; obligación con el dueño (28151001,
  bajo 281510) 200.000; certificado 31.264 = libros 236x del NIT; estado de cuenta con «Cruce con consignación».
- Corrida: una sola transacción con 120500 y 121000 (extracto exacto de los objetos del cruce), la cadena 140500 → 170000,
  la prueba 11 y la 16: **65 de 65 ok** (53 + 12). Ver los dos `.resultado.txt`.
- **Hallazgo corregido:** el asiento del cruce (origen `consignment_advance_crossing`) quedaba sin NIT y el auxiliar por
  tercero del anticipo no conciliaba (476.000 contra 176.000). La sección 15b de 170000 enseña al disparador de tercero ese
  origen y el del reintegro de retención. Sin cambios en 121000.

### Preguntas abiertas de la ronda 3

1. AIU: ¿qué fundamento quiere ver citado para registrar la primera regla (contrato, concepto DIAN, norma)? La regla solo
   admite hoy base «utilidad».
2. Retención excesiva de reteICA: hoy se admite con la norma municipal citada (sin ella, `reteica_requiere_norma`).
   ¿Basta, o el municipio exige un procedimiento propio que el sistema solo deba dejar como pendiente?
