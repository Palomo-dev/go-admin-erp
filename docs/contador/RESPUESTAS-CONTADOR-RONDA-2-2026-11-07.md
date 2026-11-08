# Respuestas del Contador, ronda 2 (2026-11-07)

Transcripción fiel de lo que el dueño reenvió. Manda sobre todo lo anterior.

**El Contador todavía no da visto bueno integral para operar ni declarar. No autoriza aplicar cambios,
reclasificar históricos, presentar declaraciones ni efectuar pagos.** Los resultados de pruebas son los que
informó el equipo, no verificaciones independientes suyas.

## Cuentas de IVA y responsabilidades históricas
- Acepta separar generado y descontable por tarifa con las cuatro cuentas descritas, siempre que su
  configuración y su denominación correspondan al plan de cada empresa.
- **A1.** No acepta asumir 19 % cuando falta la tarifa. Queda pendiente hasta identificarla con soporte.
  Recuperarla de datos inequívocos no es lo mismo que asignarla por defecto.
- **A2.** No acepta repartir una nota crédito parcial según la mezcla de toda la factura. Debe identificar
  las líneas o conceptos afectados. Una devolución total sí puede reproducir exactamente la composición
  original.
- Resolver las responsabilidades por fecha mejora el diseño, pero no garantiza conservar el documento
  expedido: reconstruir un PDF antiguo desde una vigencia editable puede cambiar su contenido. **La
  reimpresión debe corresponder a los datos originales y al XML emitido.**
- El POS y la información registrada en Factus siguen siendo pendientes expresos.

## IVA: B1–B7
- **B1 · casillas sin IVA** (formulario 300 oficial 2026). La clasificación exige cumplir las condiciones
  legales: escribir «exenta» y un texto no prueba una exportación.

  | Concepto | Casilla |
  |---|---|
  | Exportaciones de bienes | 30 |
  | Exportaciones de servicios | 31 |
  | Operaciones exentas nacionales del instructivo (no sustituye las casillas especiales) | 35 |
  | Operaciones excluidas | 39 |
  | Ingresos no gravados | 40 |
  | Importaciones no gravadas | 47 |
  | Compras nacionales de bienes y servicios excluidos, exentos y no gravados | 54 |
- **B2 · notas débito.** Si aumentan legítimamente una venta gravada ordinaria, van a 27/58 o 28/59 según la
  tarifa. No siempre basta usar el período de expedición: si corrigen una omisión original, hay que evaluar
  la declaración del período afectado.
- **B3 · proporcionalidad.** La base de compra queda completa; solo se limita el IVA descontable al porcentaje
  legalmente procedente, sustentado según el art. 490. No se prorratea la base.
- **B4 · devolución de compra.** No exige un nombre de documento interno, pero sí soporte válido, vínculo con
  la compra y sus líneas, fecha, base e impuesto. Con documento soporte electrónico, se atiende su nota de
  ajuste. Un asiento más una naturaleza elegida no basta por sí solo.
- **B5 · IVA no descontable.** Si se conoce antes de contabilizar, se reconoce como mayor valor del activo,
  costo o gasto. La deducibilidad en renta se evalúa aparte.
- **B6 · venta revertida sin nota crédito.** Conservar la venta y mostrar la reversa pendiente es un control
  provisional, no una solución fiscal; la reversa contable no sustituye la nota crédito electrónica. Si se
  prueba que la operación nunca existió, se trata como corrección de error, sin perpetuar una venta ficticia.
- **B7.** Aplican A1 y A2.

**Tres correcciones indispensables del borrador:**
1. Las bases de compras no dependen de que el IVA sea descontable: una compra gravada no descontable no
   desaparece de las casillas de compras gravadas. La base de una devolución puede afectar la casilla 56
   aunque no haya IVA recuperable en la 66.
2. No mover la base de octubre a noviembre solo por cambiar el período del descuento. La oportunidad del
   art. 496 depende de la contabilización y del período fiscal aplicable, no de un selector libre. Distinguir
   mes, período fiscal y fecha de contabilización.
3. El documento soporte del ejemplo necesita justificación tributaria: una compra nacional ordinaria a un no
   responsable no genera IVA descontable por marcarla a mano. Los supuestos especiales tienen su propio
   tratamiento y soporte.

**Otros movimientos:**
- No identificar automáticamente un pago a la DIAN porque la contrapartida sea banco, ni un traslado porque
  la 2408 sume cero. Son señales para revisar, no pruebas.
- Falta explicar la procedencia y la ubicación fiscal del puente de «otros movimientos» por −$31.000.

## Perfil y calendario
- **Catálogo RUT.** No da conformidad a los 51 códigos en bloque: la fuente secundaria no basta. Hay que
  cotejarlo con la información oficial de responsabilidades del RUT y sus normas.
- **Códigos de FE.** Separados del RUT. La documentación oficial identifica O-13, O-15, O-23, O-47 y R-99-PN;
  el cotejo íntegro del anexo vigente no está cerrado. O-48 y O-49 no se validan como códigos de FE solo
  porque existan 48 y 49 en el RUT.
- **SIMPLE y calidades.**
  - Una autorretención ordinaria activa sobre ingresos propios no se acepta con una simple advertencia: se
    resuelve conforme al art. 911.
  - Distinguir autorretenedor general de autorretención especial.
  - Gran contribuyente: verificar el acto y su vigencia, sin deducir incompatibilidades automáticas.
  - El INC puede corresponder según la actividad y la norma vigente.
- **R-99-PN.** Es residual: aplica cuando no corresponde ninguna otra responsabilidad. No se combina de forma
  contradictoria con las demás y no significa «no responsable de IVA».
- **Cambio de periodicidad.** Un motivo «otro» y una aceptación no bastan: queda pendiente hasta documentar el
  hecho, la norma y la fecha efectiva. La designación como gran contribuyente requiere analizar su efecto
  específico; no habilita cualquier cambio a mitad de año.
- **IVA anual fuera del SIMPLE.** No habilitarlo sin un supuesto legal distinto identificado.
- **Régimen tributario especial (RTE).**
  - Incluir el formulario 110 cuando corresponda y evaluar la conciliación fiscal, sin excluirla por defecto.
  - Actualización anual del registro web y memoria económica cuando se cumpla el supuesto, incluido el umbral
    de ingresos anteriores superiores a 160.000 UVT.
  - Parametrizar según las reglas oficiales del RTE, no como una obligación idéntica para toda ESAL.
- **No contribuyentes.** Clasificación inicial que depende de la naturaleza jurídica y de los arts. 22 y 23;
  no equivale a «sin obligaciones». Revisar el bloqueo B14.
- **Varias vigencias en un período.** Se permite cerrar la alerta con una decisión sustentada, conservando
  quién decidió, el fundamento y el alcance. Si cambia información relevante, se reabre. Ni bloqueo eterno ni
  borrar la historia.
- **Calendario incompleto.** Acepta el tratamiento propuesto. El calendario no está operativo hasta cargar y
  verificar las fechas.

## Anticipos
- **Financiación.** No hay regla universal de «nada al girar, todo al facturar». Un anticipo genuino no se
  trata igual que un pago anticipado. Se evalúa cuándo se convierte en pago o abono sujeto a retención, sin
  esperar necesariamente la factura. El ICA tiene su regla territorial.
- **SIMPLE y autorretenedores.**
  - Al SIMPLE acreditado no se le retiene renta, en los términos legales.
  - De los autorretenedores se verifica la autorización y los conceptos cubiertos; una marca genérica no
    basta.
  - La autorretención especial no elimina por sí sola la retención que practican terceros.
- **ReteIVA.**
  - Dividir entre 1 + tarifa solo sirve para sumas homogéneas con IVA incluido a tarifa general. No resuelve
    tarifas mixtas, componentes excluidos ni AIU.
  - Hay supuestos más allá de O-13 u O-23, por ejemplo compras gravadas de responsables a contribuyentes del
    SIMPLE.
  - No aplicar una exclusión universal entre grandes contribuyentes sin comprobar el supuesto legal.
- **ReteICA.**
  - Exige municipio, actividad, territorialidad, calidades, base, tarifa y norma vigente.
  - Hay que corregir la precisión: 9,66 por mil es 0,966 %, no 0,97 %. Sobre $1.000.000 son $9.660, no
    $9.700.
- **Retención duplicada.** Se evita al reconocer la factura, vinculando lo ya retenido; no se espera a aplicar
  el anticipo. Si ya ocurrió, se corrige con trazabilidad y revisando los períodos afectados, sin compensar en
  silencio.
- **Devolución.** No se reversan siempre las tres retenciones en proporción al bruto. Primero se identifican
  la parte devuelta y sus retenciones, y luego se sigue el procedimiento legal de cada impuesto, con sus
  requisitos de declaraciones y certificados. El ICA exige norma local.
- **Certificados.** Deben incluir las retenciones de anticipos y sus ajustes, por impuesto, tercero, concepto
  y año, sin repetirlas al facturar. No es el certificado laboral 220. Mientras no se integren, el circuito
  tributario está incompleto.
- **Caja cerrada.** No se reabre. Se registra un ajuste documentado en un período abierto, preservando el
  arqueo original y sin fabricar una entrada. Si hubo salida real, sigue el derecho frente al proveedor.
- **Pendientes.** Van en un seguimiento contable visible, conciliable y que no se cierra hasta resolverlos.
  Una advertencia sola no basta.
- **Cuenta.** Auxiliar de detalle bajo **133005**, con ocho dígitos como criterio de GO Admin. «Más de seis
  dígitos bajo cualquier 1330» es demasiado amplio. Otro plan requiere una equivalencia aprobada.
- **Bien encaminado:** aplicar contra la obligación original, separar anulación de devolución, conciliar por
  proveedor y el circuito de efectivo.
- **Textos de la pantalla.**
  - La devolución de $59.500 brutos son $55.590 de banco y $3.910 de retenciones; no decir que ingresaron
    $59.500 al banco.
  - El anticipo en efectivo se muestra como egreso por anticipo, no como venta negativa.

## Consignación: ocho decisiones
1. **Cuentas de orden.** 911520 contra una cuenta definida del grupo 94, no 9905. Valoración con una política
   consistente y documentada: costo acreditado o valor convenido identificado para custodia. Ese valor no se
   convierte en activo propio del intermediario.
2. **Estimatorio.** No genera automáticamente compra y costo al vender o liquidar. Se separan la modalidad
   jurídica, la condición contable (principal o agente) y el tratamiento tributario. Una compra requiere una
   adquisición real demostrada.
3. **Factura al público.** En mandato factura el mandatario, diferenciando lo ajeno de lo propio. El
   estimatorio debe resolver los arts. 438 y 455 antes de operar. No se genera por defecto otra factura del
   dueño al intermediario sin una operación real.
4. **Remuneración.**
   - Se reconoce cuando se devenga, no necesariamente al preparar la liquidación.
   - Va a un auxiliar bajo 413512.
   - Si hay un servicio independiente con obligación de facturar, la liquidación no sustituye la factura. Su
     IVA se analiza aparte, sin duplicarlo sobre el mismo margen.
5. **Retenciones.** Se atienden por pago o abono y por la regla aplicable, separando venta y remuneración. En
   mandato se considera la calidad del mandante; no basta el perfil del intermediario ni esperar a liquidar.
6. **Obligación con el dueño.**
   - Los recaudos ajenos se registran en 281510; la 2205 solo es para adquisiciones reales.
   - No fabricar una compra ni un documento soporte para poder pagarle.
   - Un anticipo al consignante se cruza con la obligación real del mandato.
7. **Faltantes, daños y devoluciones posteriores.**
   - No se genera automáticamente gasto ni cuenta por pagar: se acreditan la pérdida, el responsable y la
     obligación.
   - Una devolución después de pagar genera un derecho frente al dueño, que se reconoce oportunamente.
     Descontarlo en la próxima liquidación requiere acuerdo, y una alternativa si no habrá otra liquidación.
8. **Mercancía propia entregada.** La 1465 no sirve como respaldo genérico, porque es inventarios en
   tránsito. Se mantiene el inventario propio a costo, identificado en poder de terceros con una ubicación o
   un auxiliar adecuado a su naturaleza. No basta con que la cuenta empiece por 14.

## Cierre
Acepta la dirección, pero quedan pendientes estas correcciones y sus pruebas contables y fiscales. Pide
unificar el estado de la función original de anticipos:
- `20261108120000_anticipos_proveedores` está **aplicada**.
- `20261108170000_anticipos_proveedores_contador` (las correcciones) está **sin aplicar**.
