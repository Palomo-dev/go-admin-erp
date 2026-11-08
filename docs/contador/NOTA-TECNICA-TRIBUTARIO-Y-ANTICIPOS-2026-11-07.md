# Nota técnica para el Contador · Tributario y anticipos a proveedores

Fecha: 7 de noviembre de 2026 · Base de datos: proyecto `taqjemqjtumhwptchcxk` · Organización de pruebas: **org 374**.

Esta nota responde a su pedido: *qué calculan las tres funciones tributarias y la de anticipos, de dónde sale cada
valor, qué asientos generan y qué pruebas las respaldan*. Está escrita para revisión contable; los nombres técnicos
(tablas, funciones) aparecen solo para que cualquier cifra se pueda rastrear.

---

## 0. Resumen

| Tema | Pruebas | Resultado | Lo que necesita su criterio |
|---|---|---|---|
| Anticipos a proveedores | 39 escenarios + 17 controles + 1 de cuadre | Todas pasan | Retención en la fuente sobre el anticipo; cuenta 1330 |
| Perfil tributario por vigencia | 27 | Todas pasan | Combinaciones de régimen que hoy se aceptan |
| Calendario tributario | 10 | Todas pasan | Carga del decreto (hoy hay 0 fechas) |
| Borrador de IVA (formulario 300) | 28 | Todas pasan | Renglones del 300, tarifa 0, «otros movimientos» |

**Hallazgos (no corregidos, como se pidió):**
- **H1 · El IVA de compras y ventas se contabiliza en una subcuenta de «IVA generado» equivocada.** No es de las
  funciones revisadas: es de la contabilización automática de facturas y ventas, que alimenta la cuenta 2408 que lee el
  borrador. El borrador **no** se equivoca por esto (suma toda la 2408 de cada documento), pero el auxiliar de la 2408
  sí queda mal clasificado. Detalle y forma de reproducirlo en la sección 6.
- **H2 · Las responsabilidades del RUT de la empresa no cambian solas el día que empieza una vigencia nueva.** Solo se
  actualizan al guardar. Detalle en la sección 6.

**Cómo se probó.** Cada prueba corre dentro de una transacción que termina en `rollback`: **no quedó ningún dato** en la
base (ni en la org 374 ni en otra). La org 374 no tenía proveedores, facturas ni asientos, así que todo lo necesario
(proveedores, factura de compra, factura de venta, ventas de caja, un asiento manual) se creó dentro de la misma
transacción, **por las vías normales de la aplicación**: cada documento generó su asiento con las mismas reglas que en
producción. Las operaciones se ejecutaron como un usuario miembro de la org 374 (con su sesión simulada), igual que
desde la pantalla. Los guiones y sus resultados están en `docs/contador/pruebas/` (lista en la sección 8).

---

## 1. Anticipos a proveedores

### 1.1 Qué es
Dinero que la empresa le entrega a un proveedor **antes** de recibir su factura. Queda como un derecho a favor de la
empresa (activo, cuenta 1330 «Anticipos y avances»), con su saldo por proveedor, hasta que se cruza con una factura, el
proveedor lo devuelve o se anula. Es el espejo del «saldo a favor» de clientes que ya existía.

Dónde vive: tabla `supplier_advances` (un registro por anticipo: monto, saldo, estado, proveedor, cuenta) y tabla
`supplier_advance_applications` (cada cruce contra una cuenta por pagar). Nadie puede escribir en ellas directamente:
solo las cuatro operaciones de abajo (comprobado en la prueba 02, filas 1–3).

### 1.2 Las cuatro operaciones y sus asientos

Ejemplo numérico: el de las pruebas. Proveedor A, factura de compra de 1.190.000 (1.000.000 + IVA 19 %).

| Operación | Qué hace | Asiento | Ejemplo de la prueba |
|---|---|---|---|
| **Crear** (`fn_anticipo_proveedor_crear`) | Registra la salida de dinero con comprobante de egreso (CE, el mismo consecutivo de los pagos), un movimiento de dinero negativo y el saldo a favor | **D** cuenta de anticipos (la configurada en «Configuración contable» con la clave `anticipos_proveedores`; si no hay, **1330**) · **C** caja o banco del medio de pago | D 1330 1.000.000 / C 1110 Bancos 1.000.000 |
| **Aplicar** (`fn_anticipo_proveedor_aplicar`) | Cruza parte o todo el saldo contra una cuenta por pagar del **mismo** proveedor. No mueve dinero ni crea un pago | **D** cuenta por pagar (la de la regla «pago a proveedor» de la organización) · **C** cuenta del anticipo | D 22050501 Proveedores 400.000 / C 1330 400.000 |
| **Devolver** (`fn_anticipo_proveedor_devolver`) | El proveedor regresa dinero no usado; entra a caja o banco | **D** caja o banco · **C** cuenta del anticipo | D 1110 600.000 / C 1330 600.000 |
| **Anular** (`fn_anticipo_proveedor_anular`) | Solo para un anticipo **sin usar** (registrado por error): el pago queda anulado y se hace el contra-asiento | Contra-asiento exacto del de «crear», con la fecha de la anulación | D 1110 900.000 / C 1330 900.000 |

Todas las líneas llevan el **NIT del proveedor** como tercero (comprobado en cada asiento de la prueba 01), de modo que el
auxiliar de la 1330 por tercero da el saldo de cada proveedor.

Cómo baja la cuenta por pagar: la regla única de saldo de compras (`fn_invoice_purchase_paid` y `fn_cxp_recalcular`)
suma **pagos completados + aplicaciones de anticipos**. Es la misma regla para la factura y para la cuenta por pagar, de
modo que no se pueden contar dos veces (prueba 01, filas 37–38).

### 1.3 Qué NO hace
- **No convierte el anticipo en compra ni en gasto.** Crear un anticipo no crea factura, cuenta por pagar, línea de
  inventario, costo ni gasto: solo 1330 contra caja/banco (prueba 01, fila 5: 0 facturas nuevas, 0 cuentas por pagar
  nuevas, 0 líneas en clases 5, 6, 7, 14 o 22).
- **No se aplica solo.** Mientras nadie lo aplique, la cuenta por pagar del proveedor no baja (fila 5: la CxP sigue en
  1.190.000 con el anticipo ya creado).
- **No practica retención en la fuente** sobre el anticipo (ver pregunta P1).
- No maneja moneda extranjera: el anticipo se registra en la moneda base de la organización.
- Aún no aparece en el estado de cuenta del proveedor ni en el historial de la CxP (pendiente en el plan).

### 1.4 Controles
- **Permisos (en la base, no en la pantalla):** crear y aplicar exigen `finance.create`; devolver y anular,
  `finance.void`. Un miembro sin esos permisos recibe «sin_permiso» (prueba 02, filas 12–14). Los administradores de la
  organización los tienen.
- **Organización:** sale de la sesión; un usuario que no es miembro recibe «Acceso denegado» aunque conozca el id del
  anticipo (prueba 02, filas 9–11). Un proveedor de otra organización no sirve (fila 4). Sin sesión, nada (filas 16–17).
- **Sucursal:** se valida que el usuario tenga acceso a la sucursal del anticipo y de la cuenta por pagar.
- **Duplicidad (idempotencia):** cada operación lleva una clave única. Repetir la misma operación con la misma clave
  devuelve el resultado original sin crear nada (un anticipo, un asiento, un pago: prueba 01, filas 6, 13, 21). Usar la
  misma clave con otro monto se rechaza (fila 7).
- **Bloqueos:** el anticipo y la cuenta por pagar se bloquean durante la operación, siempre en el mismo orden, para que
  dos personas no apliquen el mismo saldo a la vez.
- **Límites:** no se aplica más que el saldo del anticipo (fila 14) ni más que el saldo de la cuenta por pagar (fila 15);
  monto 0 o negativo se rechaza (fila 16); no se cruza contra otro proveedor (fila 18); un anticipo usado no se anula
  (fila 25) y uno anulado no se aplica ni se anula otra vez (filas 26–27); no se aplica a facturas en borrador o
  anuladas. Efectivo exige caja abierta (prueba 02, fila 6) y «crédito» no es un medio válido (fila 5). La devolución
  exige motivo (fila 8) y queda en la bitácora de auditoría.
- **Si el asiento no se puede crear, la operación entera falla** (no queda un anticipo sin contabilizar).
- **Cuadre:** los 6 asientos de la prueba cuadran (escenario h) y además el control de cuadre propio de la base los
  aceptó (prueba 06).

### 1.5 Resultados de las pruebas (escenarios pedidos)

| Esc. | Qué se probó | Esperado | Obtenido |
|---|---|---|---|
| a | Crear anticipo de 1.000.000 al proveedor A | D 1330 / C 1110; saldo A = 1.000.000; ninguna compra ni gasto | D 1330 1.000.000 / C 1110 1.000.000, tercero A; saldo 1.000.000; 0 compras, 0 CxP, 0 líneas de gasto/costo/inventario ✔ |
| b | Repetir con la misma clave | Mismo id, un solo asiento | Mismo id, 1 anticipo, 1 asiento, 1 pago; otra cifra con la misma clave: rechazada ✔ |
| c | Aplicar 400.000 a la CxP de la factura (1.190.000) | Anticipo 600.000; CxP 790.000; D proveedores / C anticipos | Anticipo 600.000 activo; CxP 790.000 «parcial»; factura 790.000; D 22050501 400.000 / C 1330 400.000; lo pagado según la regla única = 400.000 ✔ |
| d | Aplicar 700.000 con saldo 600.000 | Rechaza | «monto_excede_anticipo», nada cambió; también rechaza 800.000 contra una CxP de 790.000 ✔ |
| e | Devolver el disponible (600.000) | D banco / C anticipos; saldo 0 | D 1110 600.000 / C 1330 600.000; saldo 0, estado «usado»; repetir no duplica; una segunda devolución se rechaza ✔ |
| f | Anular uno sin usar (900.000) y uno usado | Contra-asiento y saldo 0; el usado se rechaza | Contra-asiento D 1110 / C 1330 900.000, pago anulado, saldo 0; el usado: «anticipo_usado» ✔ |
| g | Dos proveedores | Los saldos no se mezclan | Con todo vivo: A 1.500.000, B 250.000 (tabla y auxiliar 1330 por NIT iguales); al final A 0, B 250.000; aplicar el de B a la CxP de A se rechaza ✔ |
| h | Cuadre de todos los asientos | Σ débitos = Σ créditos | 6 de 6 cuadran; el control de la base también los aceptó ✔ |

Resultado completo: `pruebas/01_…resultado.txt` (39 de 39), `pruebas/02_…resultado.txt` (17 de 17),
`pruebas/06_…resultado.txt`.

---

## 2. Perfil tributario por vigencia (`fn_perfil_tributario_guardar`)

### 2.1 Qué guarda
Por cada **vigencia** (fecha desde / fecha hasta): régimen (ordinario, simple, no responsable de IVA, especial),
responsabilidades del RUT (los códigos de la DIAN de la tabla `dian_fiscal_responsibilities`: O-13, O-15, O-23, O-47,
O-48, O-49, R-99-PN), si es agente de retención, si responde por el impuesto al consumo, la periodicidad del IVA
(bimestral, cuatrimestral, anual o no aplica) y el ICA por municipio (periodicidad y tarifa por mil). Tablas
`organization_tax_profiles` y `organization_tax_profile_ica`.

No calcula impuestos: es el dato del que salen las obligaciones del Centro tributario y el que indica qué borrador
corresponde a cada periodo.

### 2.2 Cómo decide cuál vigencia rige
Rige la vigencia cuya fecha desde es anterior o igual al día y cuya fecha hasta es posterior o igual (o está abierta).
Al guardar una vigencia nueva, la función cierra sola la anterior el día antes, y si ya existía una posterior, la nueva
termina el día antes de esa: **nunca quedan huecos ni solapes** (prueba 03, filas 10–11). Corregir una vigencia cambia sus
datos, **no** sus fechas: para otra fecha se crea otra vigencia (fila 13).

El Centro tributario toma la vigencia que rige el **último día del mes de corte**.

### 2.3 Qué NO hace
- No consulta el RUT ante la DIAN: los datos los digita la empresa.
- No valida todas las combinaciones: rechaza O-48 junto con O-49 y códigos inexistentes, pero **acepta** por ejemplo
  «no responsable de IVA» con O-48 y periodicidad bimestral (fila 19; pregunta P5).
- No cambia las responsabilidades de la empresa el día que empieza una vigencia futura (hallazgo H2).

### 2.4 Controles
Escritura solo por la función, con `finance.approve` (o administrador total) verificado en la base; lectura para los
miembros de la organización; nada para visitantes sin sesión; una escritura a la vez por organización (bloqueo).
Comprobado en la prueba 03, filas 20–27.

### 2.5 Resultados
| Qué se probó | Esperado | Obtenido |
|---|---|---|
| Guardar 2026-01-01 (bimestral) y 2026-07-01 (cuatrimestral) | La primera se cierra el 2026-06-30 | 2026-01-01→2026-06-30 y 2026-07-01→abierta ✔ |
| Cuál rige el 31-dic-2025 · 1-ene · 15-mar · 30-jun · 1-jul · 7-nov-2026 · 1-may-2027 | ninguna · 1.ª · 1.ª · 1.ª · 2.ª · 2.ª · 2.ª | Igual ✔ |
| Añadir una vigencia anterior (2025) y una intermedia (abril 2026) | Fechas ajustadas sin solapes | 4 vigencias encadenadas, 0 solapes ✔ |
| Responsabilidades de la empresa (las que lee la facturación electrónica) | Las de la vigencia de hoy | {O-48, O-23}; no cambian al guardar vigencias que no rigen hoy ✔ |
| Duplicada, O-48+O-49, código inexistente, régimen inexistente, municipio inexistente | Rechazos | Los cinco rechazados ✔ |
| Miembro sin `finance.approve` · no miembro · sin sesión · escritura directa | Rechazos | Todos rechazados; el miembro sí puede leer ✔ |

Resultado completo: `pruebas/03_…resultado.txt` (27 de 27).

---

## 3. Calendario tributario (`tax_calendar_dates`)

### 3.1 Qué es
Las fechas de vencimiento oficiales por año, obligación (IVA bimestral, retención en la fuente, renta, etc.), periodo,
cuota y últimos dígitos del NIT, **con la norma de la que salen**. Es un dato de la plataforma, igual para todas las
organizaciones. GO Admin **no deduce** fechas: si un año no está cargado, el Centro dice «Calendario {año} sin cargar».

**Estado real hoy: 0 fechas cargadas** (prueba 04, fila 1). El ICA es municipal y no va aquí: el Centro lo marca
«Confirmar con el municipio».

### 3.2 Controles y resultados
Solo la plataforma (rol de servicio) puede cargar fechas; cualquier usuario con sesión las lee; nadie con sesión las
puede crear, cambiar ni borrar (ni el dueño de una organización); sin sesión no se leen. La tabla rechaza rangos de
dígitos al revés, fechas sin norma y dos fechas para la misma obligación, periodo, cuota y dígitos. Prueba 04: 10 de 10.
La fila de prueba que se cargó era ficticia y se revirtió.

---

## 4. Borrador del IVA, formulario 300 (`fn_tributario_borrador_iva`)

### 4.1 Qué calcula
Un **borrador** del IVA de un periodo (días de la organización, hora de Colombia), armado **desde los asientos
contables**, no desde las facturas. Cada renglón dice de qué asientos sale, y cada asiento lleva a su documento.

**No presenta ni firma nada ante la DIAN**, no guarda nada (la función es de solo lectura, prueba 05 fila 25) y no fija la
numeración de renglones del formulario 300: esa correspondencia la confirma usted (pregunta P2).

### 4.2 De dónde sale cada valor
1. **Asientos del periodo:** los publicados con fecha dentro del periodo. Se excluye el cierre de ejercicio. Un asiento
   y su contra-asiento **dentro del mismo periodo** se anulan entre sí y no se miran (prueba 05, fila 19: la venta V4 y su
   reversión no aparecen).
2. **IVA de cada asiento = su movimiento en las cuentas 2408** (todas las subcuentas que empiecen por 2408):
   crédito − débito. Por eso el error H1 no afecta las cifras del borrador.
3. **Documentos:** ventas de caja (POS), facturas de venta y sus notas crédito, y facturas de compra. Para cada uno se
   compara el IVA de sus asientos (el de los libros) con el que dan sus líneas:
   - **IVA generado** (ventas): crédito − débito en 2408. **IVA descontable** (compras): débito − crédito en 2408.
   - Base por línea: cantidad × precio − descuento; si el precio incluye IVA, se le quita. IVA de la línea: base ×
     tarifa (en el POS, el IVA que la línea ya trae guardado).
   - Si líneas y libros **coinciden (±$1)**, las líneas se reparten por tarifa: «gravadas al X %», «sin IVA» (tarifa 0) y
     «devoluciones» (notas crédito).
   - Si **no** coinciden, si una línea trae IVA sin tarifa o si el documento no tiene líneas, el documento entero va a
     un renglón **«Revisar»** con el valor **de los libros**. Nunca se reparte por adivinación.
4. **Cualquier otro asiento que mueva la 2408** (manual, pago del impuesto, ajuste, documento soporte, reversión de otro
   mes) va a «Otros movimientos en cuentas de IVA», también «Revisar»: usted decide si entra.
5. **Totales = los de los libros:** IVA generado y descontable de los documentos; **saldo = generado − descontable**
   (positivo: a pagar; negativo: a favor). «Otros movimientos» se muestra aparte y **no** entra en el saldo. Si la suma de
   líneas difiere de los libros por centavos en documentos que sí cuadran, sale un renglón «ajuste de redondeo» para que
   los renglones sumen el total.
6. El Centro tributario muestra el saldo del borrador del último periodo cerrado y lo marca «Revisar» si algún renglón
   lo está.

### 4.3 El caso de prueba, renglón por renglón (periodo 1 a 30 de noviembre de 2026)

Documentos creados para la prueba y su asiento (todos por las reglas normales de la aplicación):

| Doc. | Qué es | Asiento generado |
|---|---|---|
| FC | Compra: 1.000.000 al 19 % + 200.000 al 5 % | D 14350101 1.200.000 · D 24080502 200.000 · C 22050501 1.400.000 |
| FV | Factura de venta: 2 × 150.000 al 19 % | D 1305 357.000 · C 24080502 57.000 · C 41401501 300.000 |
| V1 | Venta de caja: 500.000 al 19 % + 50.000 con tarifa 0 | D 1305 645.000 · C 24080502 95.000 · C 41401501 550.000 |
| V2 | Venta de caja: 100.000 con IVA 19.000 guardado, **tarifa 0** en la línea | D 1305 119.000 · C 24080502 19.000 · C 41401501 100.000 |
| V3 | Venta de caja: línea de 200.000 al 19 % (38.000) pero IVA de la venta 30.000 | D 1305 230.000 · C 24080502 30.000 · C 41401501 200.000 |
| V4 | Venta de caja de 100.000 al 19 %, **revertida en el mismo mes** | Asiento y contra-asiento |
| AJ | Asiento manual | D 24080501 10.000 · C 1110 10.000 |

Borrador obtenido:

| Lado | Renglón | Base | Valor | Estado | Sale de | Por qué |
|---|---|---|---|---|---|---|
| Generado | Gravadas 19 % | 800.000 | 152.000 | OK | FV, V1 | 300.000 + 500.000; 57.000 + 95.000. Líneas = libros |
| Generado | Sin IVA (tarifa 0) | 50.000 | 0 | **Revisar** | V1 | Ver 4.4 |
| Generado | Tarifa sin identificar | 100.000 | 19.000 | **Revisar** | V2 | La línea trae IVA pero tarifa 0: no se sabe a qué tarifa va |
| Generado | No cuadra | 200.000 | 30.000 | **Revisar** | V3 | Las líneas dan 38.000 y los libros 30.000: se muestra el de los libros |
| Descontable | Gravadas 19 % | 1.000.000 | 190.000 | OK | FC | Líneas = libros |
| Descontable | Gravadas 5 % | 200.000 | 10.000 | OK | FC | Líneas = libros |
| Otros | Otros movimientos en 2408 | — | −10.000 | **Revisar** | AJ | Asiento que no es de un documento (−10.000 = débito a la 2408) |

Totales: **IVA generado 201.000** (152.000 + 0 + 19.000 + 30.000) · **IVA descontable 200.000** · **saldo 1.000** ·
otros movimientos −10.000 · 5 documentos · 4 renglones por revisar.

**Reconciliación con un SELECT directo sobre `journal_lines`** (cuentas 2408%, asientos publicados de noviembre, crédito −
débito): ventas de caja 163.000 · reversión −19.000 · factura de venta 57.000 · compra −200.000 · manual −10.000 = **−9.000**.
El borrador da 201.000 − 200.000 + (−10.000) = **−9.000**. Coinciden. La suma de los renglones de cada lado también
coincide con su total (prueba 05, filas 1, 21 y 22).

### 4.4 Casos que caen en «Revisar» y por qué
| Caso | Qué lo produce | Qué hace el borrador |
|---|---|---|
| **Sin IVA (tarifa 0)** | Línea con tarifa 0 e IVA 0 | La muestra con su base y **siempre** como «Revisar»: el sistema no distingue entre **exenta, excluida o no gravada**, que en el 300 van en renglones distintos (pregunta P3) |
| **Tarifa sin identificar** | Línea con IVA pero sin tarifa. **Es el caso real del POS:** en la prueba en seco del plan (org 333, sep–nov 2026) 73 ventas de caja cayeron aquí porque sus líneas guardan el IVA con tarifa 0 | El documento entero va a «Revisar» con el IVA de los libros |
| **No cuadra** | El IVA de las líneas difiere más de $1 del de los asientos (p. ej. descuento global sobre la venta, ajuste manual del total) | El documento entero va a «Revisar» con el IVA de los libros |
| **Sin líneas** | Documento con asiento pero sin líneas | Ídem |
| **Otros movimientos** | Asiento manual, pago del impuesto, documento soporte, reversión de un documento de otro periodo | Se lista aparte con sus asientos; no entra en el saldo |

### 4.5 Controles
Requiere `finance.view` (o administrador total) verificado en la base; un usuario de otra organización recibe «Acceso
denegado»; sin sesión, nada; periodo de máximo 366 días y con «hasta» posterior a «desde» (prueba 05, filas 23–28).

### 4.6 Lo que el borrador no cubre hoy
- Retenciones de IVA que le practicaron a la empresa, IVA de importaciones, IVA en notas crédito de **compras**
  (devoluciones en compras): no tienen renglón propio; si mueven la 2408 salen en «Otros movimientos».
- PDF del borrador (hoy solo Excel/CSV).
- No se probó en esta ronda una nota crédito de venta (renglón «devoluciones»): la lógica existe, el caso no se armó.

---

## 5. Limitaciones conocidas (resumen)

1. POS: el IVA de muchas ventas de caja cae en «Tarifa sin identificar» porque la línea guarda el IVA con tarifa 0. El
   borrador lo muestra con el valor de los libros, pero no lo reparte por tarifa. Arreglo pendiente: que el POS guarde la
   tarifa por línea.
2. «Sin IVA» no distingue exentas, excluidas y no gravadas, y siempre queda en «Revisar».
3. El calendario está vacío: el Centro no muestra vencimientos hasta que la plataforma cargue el decreto.
4. Los anticipos no practican retención en la fuente, no manejan moneda extranjera y todavía no aparecen en el estado de
   cuenta del proveedor.
5. Solo se probaron anticipos por transferencia; el efectivo se probó únicamente en su control (sin caja abierta, se
   rechaza).
6. El Centro toma la vigencia del último día del mes de corte; si una vigencia cambia a mitad de un periodo bimestral o
   cuatrimestral, el periodo completo se lee con la vigencia final.

---

## 6. Hallazgos (descritos, no corregidos)

### H1 · Subcuenta de IVA equivocada en la contabilización automática de compras y ventas
**Qué pasa.** Al contabilizar una factura de compra, una factura de venta o una venta de caja, el IVA va a la subcuenta
que devuelve `fn_cuenta_iva`. Esa función toma **la última cuenta de IVA mapeada** en la organización, sin mirar la tarifa
ni si es generado o descontable. En la org 374 devuelve 24080502 «IVA generado 5 %» para todo.

**Escenario que lo reproduce** (prueba 05, filas 2–7; también la factura de apoyo de la prueba 01):
- Compra de 1.000.000 al 19 % + 200.000 al 5 %: el IVA **descontable** de 200.000 queda **débito en 24080502 «IVA generado
  5 %»**, cuando debería ir a 24081001 / 24081002 «IVA descontable».
- Factura de venta y ventas de caja al **19 %**: el IVA queda en **24080502 «IVA generado 5 %»** en vez de 24080501.

**Alcance medido (solo lectura):** en las 35 organizaciones de la base hay varias cuentas de IVA mapeadas, y
`fn_cuenta_iva` devuelve para las compras una subcuenta de «IVA generado» en las 35 (24080502 en 19, 24080501 en 16). Hoy
no hay compras con IVA contabilizadas en producción, así que todavía no hay saldos afectados por el lado de compras; las
ventas ya contabilizadas usan 24080501.

**Efecto:** el borrador del IVA **no** cambia (lee toda la 2408 por documento y separa generado y descontable por el tipo de
documento). Lo que queda mal es el auxiliar: el saldo de «IVA generado» y de «IVA descontable» por subcuenta y por tarifa.

### H2 · Las responsabilidades del RUT no cambian solas al empezar una vigencia
**Qué pasa.** La función del perfil copia las responsabilidades a la ficha de la empresa (`organizations.
fiscal_responsibilities`, que lee la facturación electrónica) **solo en el momento de guardar**, y solo si la vigencia
guardada rige ese día.

**Escenario que lo reproduce** (prueba 03, filas 9 y 12, y la vigencia del 2027-01-01 de la fila 19): hoy rige {O-48, O-23}.
Se guarda una vigencia desde el 2027-01-01 con otras responsabilidades. La ficha de la empresa sigue en {O-48, O-23}; el
1 de enero de 2027 seguirá igual hasta que alguien vuelva a guardar el perfil. Las facturas electrónicas de ese lapso
saldrían con las responsabilidades anteriores.

---

## 7. Preguntas que necesitan su criterio

- **P1 · Retención en la fuente sobre anticipos.** ¿Se debe practicar retención (y reteICA/reteIVA) al momento de girar
  el anticipo («pago o abono en cuenta, lo que ocurra primero»), o al causar la factura? Hoy no se practica en ningún
  momento del anticipo; la factura de compra practica sus retenciones sobre el total.
- **P2 · Correspondencia con el formulario 300.** ¿A qué renglones del formulario vigente lleva cada renglón del borrador
  (gravadas por tarifa, devoluciones, descontables por tarifa)? La numeración no está fijada a propósito.
- **P3 · Tarifa 0.** ¿Cómo quiere que se distingan exentas, excluidas y no gravadas? Hoy todo es «sin IVA» y queda en
  «Revisar». ¿Basta con un atributo en el producto?
- **P4 · Otros movimientos en 2408.** ¿Qué movimientos manuales o de ajuste deben entrar al borrador y en qué renglón?
  Hoy se listan aparte y no entran en el saldo.
- **P5 · Combinaciones del perfil.** ¿Deben rechazarse combinaciones como «no responsable de IVA» con O-48 o con
  periodicidad bimestral, o «régimen simple» sin O-47? Hoy se aceptan (la pantalla solo avisa en el segundo caso).
- **P6 · Cuenta del anticipo.** ¿1330 «Anticipos y avances» sin subcuenta le sirve, o prefiere un auxiliar (p. ej.
  133005 «A proveedores»)? Se configura en «Configuración contable» con la clave `anticipos_proveedores`.
- **P7 · Anulación con fecha.** El contra-asiento de anular un anticipo va con la fecha del día de la anulación, no la del
  anticipo. ¿Está bien así, o debe ir en la fecha original cuando el periodo sigue abierto?
- **P8 · Vigencia a mitad de periodo.** Si la periodicidad del IVA cambia a mitad de año, ¿qué vigencia debe regir el
  periodo de transición? (hoy, la del último día del mes de corte).
- **P9 · H1.** ¿Confirma que el IVA descontable debe ir a 240810xx por tarifa y el generado a 240805xx por tarifa, para
  que se corrija la contabilización automática?

---

## 8. Archivos

| Archivo | Contenido | Resultado |
|---|---|---|
| `pruebas/01_anticipos_proveedores_escenarios.sql` | Escenarios a–h | 39 de 39 |
| `pruebas/02_anticipos_proveedores_controles.sql` | Permisos, organización, escritura directa, validaciones | 17 de 17 |
| `pruebas/06_anticipos_cuadre_en_la_base.sql` | Control de cuadre propio de la base | Sin error, 5 asientos |
| `pruebas/03_tributario_perfil.sql` | Vigencias, cuál rige, sincronización, validaciones, permisos | 27 de 27 |
| `pruebas/04_tributario_calendario.sql` | Lectura, escritura solo de la plataforma, reglas de forma | 10 de 10 |
| `pruebas/05_tributario_borrador_iva.sql` | Borrador renglón por renglón, reconciliación, permisos | 28 de 28 |

Cada `.sql` tiene su `.resultado.txt` al lado. Todos empiezan en `begin` y terminan en `rollback`; se pueden volver a
correr y no dejan datos. Los números de asiento cambian en cada corrida.

Código revisado: migraciones `supabase/migrations/20261108100000_tributario_perfil.sql`, `…100500_tributario_calendario.sql`,
`…101000_tributario_borrador_iva.sql`, `…120000_anticipos_proveedores.sql`; servidor `src/lib/services/tributario/`,
`src/lib/finanzas/tributario/`, `src/app/api/anticipos-proveedor/`; plan `docs/implementacion/FINANZAS-R4-E-INTEGRACIONES-PLAN.md`
(R4-A y R4-B).
