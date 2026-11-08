# Anexo a la nota técnica · Corrección de H1 (subcuenta de IVA) y H2 (responsabilidades del RUT)

Fecha: 7 de noviembre de 2026 · Base de datos: proyecto `taqjemqjtumhwptchcxk` · Organización de pruebas: **org 374**.
Complementa `NOTA-TECNICA-TRIBUTARIO-Y-ANTICIPOS-2026-11-07.md` (sección 6, hallazgos H1 y H2, y pregunta P9).

**Estado:** las dos correcciones están **escritas y probadas en seco, pero NO aplicadas** en la base. Se aplican cuando el
dueño lo ordene. Ningún asiento existente se modificó ni se modificará.

---

## H1 · El IVA de cada documento va a la subcuenta de su tarifa y de su lado

### Qué cambia, en lenguaje contable

Antes, la contabilización automática tomaba **la última subcuenta de IVA configurada** en la organización, sin mirar la
tarifa ni si el IVA era generado (ventas) o descontable (compras). Además escribía **una sola línea de IVA** por
documento, aunque el documento tuviera productos al 19 % y al 5 %.

Ahora:

1. **Lado.** Ventas, notas débito y notas crédito de venta → **IVA generado (2408 05)**. Compras y documento soporte →
   **IVA descontable (2408 10)**. La nota crédito de venta **reversa** el IVA generado (débito en 2408 05), no lo lleva a
   descontable.
2. **Tarifa.** La tarifa sale de las **líneas del documento**. Si el documento tiene varias tarifas, el asiento lleva
   **una línea de IVA por tarifa**, cada una en su subcuenta.
3. **El total no cambia.** La suma de las líneas de IVA es exactamente el IVA del documento; lo único que cambia es en
   qué subcuenta queda cada peso.

| Documento | Tarifa | Subcuenta | Naturaleza |
|---|---|---|---|
| Factura de venta, venta de caja (POS), nota débito | 19 % | 24080501 IVA generado 19 % | Crédito |
| Factura de venta, venta de caja (POS), nota débito | 5 % | 24080502 IVA generado 5 % | Crédito |
| Nota crédito de venta (total, parcial o devolución) | 19 % / 5 % | 24080501 / 24080502 | Débito (reversa) |
| Factura de compra | 19 % | 24081001 IVA descontable 19 % | Débito |
| Factura de compra | 5 % | 24081002 IVA descontable 5 % | Débito |
| Documento soporte | 19 % / 5 % | 24081001 / 24081002 | Débito |

Los códigos son los del plan de las 35 organizaciones (todas tienen las cuatro subcuentas, de movimiento y activas).
Si una sede tiene su propio auxiliar configurado, se usa el de la sede.

### De dónde sale la subcuenta (orden de decisión)

Para cada tarifa y lado, en este orden; la primera que sirva (cuenta de movimiento, activa, bajo el título del lado):

1. **Impuestos › cuenta contable del impuesto de esa tarifa** (`tax_account_mapping`). Hoy las 35 organizaciones tienen
   «IVA 19 %» → 24080501 e «IVA 5 %» → 24080502: sirven para el lado generado. Para el lado descontable ese mapeo no sirve
   (es una cuenta de generado), así que se sigue al paso 2 o 3.
2. **Solo para la tarifa general (19 %): Configuración contable**, claves «IVA generado» (`iva_generado`, hoy 24080501) e
   «IVA descontable» (`iva_descontable`, hoy 24081001). Esas claves no dicen tarifa; se toman como la cuenta de la tarifa
   general y nunca se usan para el 5 %.
3. **Regla de respaldo que ya existía** en el sistema (la misma que se usaba para pasar del título al auxiliar):
   título 2408 05 → 24080501 (19 %) / 24080502 (5 %); título 2408 10 → 24081001 (19 %) / 24081002 (5 %).
   Solo conoce 19 % y 5 %.

### Qué pasa si falta la subcuenta

**No se inventa una cuenta.** Si para una tarifa no hay subcuenta (por ejemplo, una compra al 16 % sin impuesto «IVA
16 %» con su cuenta), **el documento no se contabiliza** y queda en la **bandeja de Pendientes contables** con el motivo
«La cuenta configurada no sirve para contabilizar» y el detalle:

> Falta la subcuenta de IVA descontable al 16 %: créela bajo 240810 en el plan de cuentas y asígnela al impuesto de esa
> tarifa en Impuestos; luego reintente este pendiente.

Es el mismo comportamiento que ya tienen las demás validaciones de la contabilización automática (cuenta de título,
periodo cerrado, falta de NIT): el documento queda guardado, sin asiento, visible en la bandeja y se reintenta desde ahí
cuando la cuenta exista. Para las tarifas 19 % y 5 % esto no ocurre en ninguna de las 35 organizaciones.

### Cómo se conoce la tarifa de cada línea

- **Facturas de venta y de compra, notas y documento soporte:** la tarifa de la línea (o su código, p. ej. `IVA_5`). La
  base de cada línea se calcula igual que en el borrador del IVA (cantidad × precio − descuento; si el precio incluye
  IVA, se le quita).
- **Ventas de caja (POS):** la caja guarda el IVA de la línea pero muchas veces con tarifa 0 (la limitación 1 de la nota
  técnica). La tarifa se **deduce solo si el IVA de la línea coincide, con diferencia de máximo $1, con una única tarifa
  de IVA configurada** en la organización (19 % o 5 %). Si no coincide con ninguna, o con más de una, se trata como «sin
  tarifa identificada».
- **Sin tarifa identificada** (o documentos sin líneas, como folios, membresías o parqueadero): se usa la tarifa general,
  **19 %**, que es la regla de respaldo que ya estaba documentada en el sistema. *(Ver pregunta A1.)*
- **Nota crédito cuyo asiento se arma antes de grabar sus líneas** (la nota crédito por disparador): la tarifa sale de la
  factura que acredita. Si el IVA ÷ base de la nota coincide con una sola de las tarifas de la factura, esa; si no, el IVA
  se reparte con la mezcla de tarifas de la factura. *(Ver pregunta A2.)*
- **INC (impuesto al consumo):** sin cambios. Sigue a su cuenta 2495 y nunca se mezcla con el IVA.

### Asientos ya publicados (no se reescriben)

Medición del 7 de noviembre de 2026, solo lectura, sobre toda la base:

| Organización | Origen | Asientos con IVA | Subcuenta usada | Tarifa real de las líneas | Mal clasificados |
|---|---|---|---|---|---|
| org 333 | Ventas de caja (POS) | 77 | 24080501 | 19 % (deducida del IVA de cada línea) | 0 |
| org 333 | Facturas de venta | 1 | 24080501 | 19 % (`IVA_19`) | 0 |
| org 338 | Ventas de caja (POS) | 6 | 24080501 | 19 % | 0 |
| org 338 | Facturas de venta | 2 | 24080501 | 19 % (una con líneas sin IVA) | 0 |
| Las otras 33 | — | 0 | — | — | 0 |

- **86 asientos con IVA en 2 organizaciones, todos en 24080501 y todos con líneas al 19 %: ninguno quedó en una subcuenta
  equivocada.** En esas dos organizaciones la función vieja devolvía justamente 24080501.
- **0 compras con IVA contabilizadas** en producción: el error del lado descontable todavía no tocó saldos.
- No hay movimientos en 24080502, 24081001 ni 24081002.
- **Por eso hoy no hace falta reclasificación.** Como la corrección aún no está aplicada, entre hoy y el día en que se
  aplique pueden aparecer asientos mal clasificados (sobre todo compras, en las 19 organizaciones donde la función vieja
  devuelve 24080502). El día de aplicar se repite este conteo con la consulta de abajo; si aparece alguno, se lo
  presentamos para que usted decida la reclasificación (no la hacemos nosotros).

```sql
-- Conteo de solo lectura: asientos con IVA por organización, origen y subcuenta (para decidir reclasificaciones).
select je.organization_id, je.source, jl.account_code, count(distinct je.id) as asientos,
       sum(jl.debit) as debitos, sum(jl.credit) as creditos
  from public.journal_lines jl join public.journal_entries je on je.id = jl.journal_entry_id
 where je.posted and jl.account_code like '2408%'
 group by 1, 2, 3 order by 1, 2, 3;
-- Señal de error: compras (invoice_purchase / support_documents) en 240805xx, o ventas en 240810xx,
-- o un documento cuyas líneas son al 5 % con IVA en 24080501 / 24081001.
```

### El borrador del IVA (formulario 300)

No cambia: lee toda la 2408 de cada documento y separa generado y descontable por el tipo de documento. Lo que mejora es
el **auxiliar**: el saldo de cada subcuenta 2408 por tarifa y por lado ahora corresponde a lo que dice su nombre.

### Pruebas (en seco, org 374, todo revertido)

`pruebas/07_iva_subcuenta_por_tarifa.sql` y su `.resultado.txt`: **32 de 32**. Cada documento se creó por las vías normales
de la aplicación (sus propios disparadores; la nota crédito, con la sesión simulada de un usuario miembro):

| Caso | Asiento de IVA obtenido |
|---|---|
| Factura de venta al 19 % | C 24080501 57.000 |
| Factura de venta al 5 % | C 24080502 5.000 |
| Factura de venta 19 % + 5 % | C 24080501 19.000 + C 24080502 5.000 |
| Venta de caja al 19 % (tarifa 0 en la línea) | C 24080501 19.000 |
| Venta de caja al 5 % (tarifa 0 en la línea) | C 24080502 5.000 |
| Compra al 19 % | D 24081001 190.000 |
| Compra al 5 % | D 24081002 10.000 |
| Compra 19 % + 5 % (el caso de H1) | D 24081001 190.000 + D 24081002 10.000 |
| Nota crédito total de la factura al 5 % | D 24080502 5.000 |
| Nota crédito parcial (solo la línea al 5 %) de una factura 19 % + 5 % | D 24080502 5.000 |
| Devolución 19 % + 5 % | D 24080501 19.000 + D 24080502 5.000 |
| Documento soporte 19 % + 5 % | D 24081001 57.000 + D 24081002 5.000 |
| Compra al 16 % (sin subcuenta) | Sin asiento; pendiente con «Falta la subcuenta de IVA descontable al 16 %» |

Los 13 asientos cuadran (débitos = créditos) y el control de cuadre propio de la base no rechazó ninguno.

**Hallazgo aparte (no es de H1):** en la org 374 la clave «Inventario» de Configuración contable apunta al título 1435;
por eso el asiento por líneas del documento soporte se rechaza («La cuenta configurada 1435 (Inventario) no es de
movimiento») antes de llegar al IVA. Para la prueba se apuntó, solo dentro de la transacción, a 14350101 (el auxiliar que
ya usan las compras). Conviene revisarlo en las organizaciones que tengan esa clave en el título.

### Preguntas para su criterio

- **A1 · IVA sin tarifa identificada.** Hoy se lleva a la subcuenta del 19 % (regla general ya documentada). ¿Le sirve, o
  prefiere que esos documentos queden en Pendientes contables hasta que alguien indique la tarifa?
- **A2 · Nota crédito parcial de una factura con varias tarifas, armada antes de sus líneas.** Si el IVA ÷ base de la nota
  no coincide con una sola tarifa de la factura, el IVA se reparte con la mezcla de la factura (aproximación). ¿Es
  aceptable, o prefiere que ese caso quede en Pendientes contables?
- **P9 (de la nota técnica)** queda resuelta así: generado en 2408 05 xx y descontable en 2408 10 xx, por tarifa. Le
  pedimos confirmarla antes de aplicar.

---

## H2 · Las responsabilidades del RUT se toman de la vigencia que rige en la fecha del documento

### Qué cambia

Antes, la ficha de la empresa (`organizations.fiscal_responsibilities`) solo se actualizaba al **guardar** el perfil
tributario, y solo si la vigencia guardada regía ese día. Una vigencia que empieza en el futuro (p. ej. el 1 de enero de
2027) no se aplicaba sola.

Ahora hay una consulta única, `fn_responsabilidades_fiscales_en(organización, fecha)`:

- devuelve las responsabilidades de la **vigencia que rige en esa fecha** (desde ≤ fecha ≤ hasta, o abierta);
- si la organización **no tiene perfil** o la fecha es anterior a su primera vigencia, devuelve las de la **ficha de la
  empresa**, exactamente lo que se usaba antes;
- solo lee; no cambia la ficha ni el perfil.

### Dónde se usa

| Lector | Fecha que usa |
|---|---|
| Representación gráfica (PDF) de la factura de venta, la nota crédito, la nota débito y el documento soporte | La **fecha de emisión del documento**, en el día de la organización (hora de Colombia) |
| Verificación de datos del emisor para activar la facturación electrónica | Hoy |

**El envío a la DIAN (Factus) no cambia:** el documento que se envía **no lleva** las responsabilidades del emisor; Factus
las toma de la empresa registrada en su cuenta. Se dejó una prueba que fija que el envío es idéntico con o sin perfil por
vigencias y que la cola de envío no consulta el perfil. Si su criterio es que las responsabilidades de Factus también
deben cambiar con la vigencia, eso se gestiona en la cuenta de Factus de la empresa (fuera de GO Admin).

### Pruebas (en seco, org 374, todo revertido)

`pruebas/08_responsabilidades_fiscales_en.sql` y su `.resultado.txt`: **12 de 12**. Con vigencias 2026 {O-48, O-23} y desde
2027-01-01 {O-47}, y ficha {O-13}: el 31-dic-2025 da {O-13} (sin vigencia → ficha), todo 2026 da {O-48, O-23} y desde el
1-ene-2027 da {O-47} **sin que nadie vuelva a guardar el perfil**. Sin perfil, siempre {O-13}. Un usuario de otra
organización no ve nada y la clave pública no puede consultarla.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `supabase/migrations/20261108140000_iva_subcuenta_por_tarifa_y_lado.sql` | H1 (escrita, sin aplicar) |
| `supabase/rollbacks/20261108140000_iva_subcuenta_por_tarifa_y_lado_rollback.sql` | Su reversión (verificada: deja las funciones idénticas a las de hoy) |
| `supabase/migrations/20261108140500_responsabilidades_fiscales_en.sql` | H2 (escrita, sin aplicar) |
| `supabase/rollbacks/20261108140500_responsabilidades_fiscales_en_rollback.sql` | Su reversión |
| `pruebas/07_iva_subcuenta_por_tarifa.sql` · `.resultado.txt` | Prueba en seco de H1 (32 de 32) |
| `pruebas/08_responsabilidades_fiscales_en.sql` · `.resultado.txt` | Prueba en seco de H2 (12 de 12) |
