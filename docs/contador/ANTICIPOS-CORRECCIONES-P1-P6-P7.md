# Anticipos a proveedores · correcciones según P1, P6 y P7

Fecha: 7 de noviembre de 2026 · Base de datos: proyecto `taqjemqjtumhwptchcxk` · Organización de pruebas: **org 374**.

Responde a sus respuestas P1, P6 y P7 y a las «Condiciones para cerrar su visto bueno · Anticipos»
(`RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md`). Los nombres técnicos aparecen solo para que cada cifra se pueda rastrear.

**Estado: escrito y probado en seco, NO aplicado.** La corrección es la migración
`supabase/migrations/20261108170000_anticipos_proveedores_contador.sql` (reversión en `supabase/rollbacks/`). Se aplica
cuando el dueño lo ordene, **después** de `20261108160500` (perfil tributario con renta e IVA separados). La migración
de anticipos ya aplicada (`20261108120000`) no se edita: sus funciones se reemplazan. Hoy hay **0 anticipos** en la
base, así que ningún saldo existente cambia. Hasta que se aplique, la pantalla de anticipos dice «pendiente de activar».

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
