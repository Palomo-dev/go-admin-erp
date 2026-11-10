# Respuestas del Contador, ronda 4 (2026-11-09)

Transcripción fiel de lo que el dueño reenvió. Manda sobre lo anterior.

## Estado de su aprobación

- **Conformidad parcial** al diseño actualizado. **No da el visto bueno para activar el conjunto**, ni para
  reclasificar históricos, presentar declaraciones ni efectuar pagos. No hace falta rehacer todo.
- **Acepta:**
  - separar las cuentas de IVA por tarifa;
  - eliminar el 19 % por defecto;
  - conservar las bases completas de compras;
  - incorporar al activo, costo o gasto el IVA no recuperable;
  - reconocer la comisión cuando se devenga;
  - mantener la mercancía entregada como inventario propio identificado en poder de terceros, sin usar la 1465.
- **Límites de la evidencia:**
  - las pruebas en seco de IVA de la ronda 3 aún no se ejecutaron (según lo que se le envió);
  - las de perfil y consignación se reportan aprobadas;
  - la integración de anticipos usó un extracto del cruce, no los archivos completos de ambos módulos.
- Él revisó los documentos; no ejecutó esas pruebas.

## IVA

### 1. IVA no descontable al costo

- Conforme con el criterio. El ejemplo cuadra:
  - $34.200 no recuperables se incorporan a la compra;
  - $27.800 quedan como descontables;
  - los débitos suman los $462.000 del proveedor.
- **No acepta que una inconsistencia mande todo el IVA a la 2408.** Si el IVA no descontable de las líneas
  supera el total del documento, el documento queda **pendiente de corregir antes de publicar** el asiento
  definitivo.
- **No usar una cuenta única de cabecera** si las líneas pertenecen a activos o gastos diferentes.

### 2. Devolución de compra

- Basta documentarla sobre el asiento existente, si conserva la compra, las líneas y un soporte válido. No
  exige otra nota crédito interna que duplique la del proveedor.
- En documento soporte electrónico corresponde su **nota de ajuste**.
- Acepta separar la base (casilla 56) del impuesto recuperado (casilla 66).

### 3. Importación no gravada, casilla 47

- Requiere **soporte aduanero verificable**: identificación y copia del documento aplicable, valor y
  fundamento de la exclusión. No basta un texto libre.
- No todas las modalidades exigen exactamente el mismo documento.
- La casilla no sirve para cualquier servicio adquirido en el exterior.

### 4. Operación inexistente

- Exige un **expediente** que explique el error y contraste:
  - factura;
  - estado electrónico;
  - entrega o prestación;
  - cobro.
- Si corresponde, el expediente incluye la nota crédito electrónica.
- Un rechazo comercial del comprador **no equivale** a un rechazo de validación de la DIAN. «Nunca
  transmitida» tampoco descarta una expedición válida en contingencia.
- **Completar esos campos no retira automáticamente la venta de las casillas.** Primero se decide su
  tratamiento fiscal y el período:
  - no descontar una nota crédito y además eliminar la venta;
  - no neutralizar períodos distintos como si fueran uno.
- La DIAN explica el uso de la nota crédito para una operación no realizada.
- El puente suma: $147.500 − $380.315 − $157.850 − $30.000 = −$420.665. Valida la aritmética, todavía no la
  clasificación fiscal completa.
- **Dos límites que mantiene:**
  - inferir una tarifa por coincidencia aritmética en POS no demuestra por sí solo su procedencia legal;
  - llamar «cierre» a un asiento no basta para excluir un ajuste fiscal real.

## Perfil y documentos históricos

1. **Catálogo del RUT.**
   - Confirmó que el instructivo IN-CAC-0237 v3 contiene los 48 apartados informados.
   - Pero el catálogo no debe declararse exhaustivo: la Resolución 227 de 2025, art. 1.6.11.5, contempla el
     **código 67, CARF**. Que falte en el instructivo no elimina lo previsto en la norma.
   - Los códigos antiguos 11 y 12 se conservan en la evidencia histórica, sin tratarlos como responsabilidades
     actuales ni cambiar documentos retroactivamente.
2. **Códigos de factura electrónica.**
   - El cotejo de la tabla 13.2.6.1 del anexo 1.9 confirma O-13, O-15, O-23, O-47 y R-99-PN.
   - R-99-PN se denomina **«No aplica – Otros»**, no «No responsable de IVA».
   - O-48 y O-49 **no pertenecen** a esa tabla.
   - Fuente: caja de herramientas oficial FE 1.9 de 2026.
3. **SIMPLE y autorretención especial.**
   - Acepta bloquear la autorretención de renta sobre ingresos propios del SIMPLE, incluida la especial.
   - Eso no vuelve equivalentes las calidades 15 y 59.
   - Un RUT contradictorio queda para aclaración, no se borra.
   - Las operaciones por mandato se examinan aparte.
4. **Gran contribuyente.**
   - La calificación ordinaria produce efectos desde el 1 de enero siguiente a la resolución; corresponde
     entonces el primer bimestre, enero–febrero.
   - En calificaciones excepcionales se atiende la fecha expresa del acto.
   - Cuando ya sea exigible la periodicidad bimestral, una advertencia no vuelve correcto declarar
     cuatrimestralmente. Fundamento: art. 1.1.4.3 de la Resolución 227.
   - Un cambio excepcional dentro de un período requiere resolver la transición sin inventar cortes ni
     solapamientos.
5. **Cooperativas del RTE.**
   - Sí les aplica la actualización del registro web: no dejarla como opcional.
   - Incluir el formato 5245 y los formatos 2530 y 2531; el 2532 cuando corresponda, con las adaptaciones
     propias de cooperativas.
   - No imponerles información de asignaciones permanentes propia de las ESAL.
   - La memoria económica, cuando superen 160.000 UVT de ingresos del año anterior, se presenta en PDF firmado
     según corresponda, no como un formato universal numerado.
   - Fuente: actualización oficial del RTE.
6. **Motivos de cambio de periodicidad.**
   - No agregar motivos que autoricen el cambio por sí solos.
   - Correcciones de clasificación, actos especiales o cambios relacionados con el SIMPLE se analizan con
     hecho, norma y fecha.
   - «Documentado» no equivale a «procedente».
7. **Las 153 reimpresiones sin instantánea.**
   - Permitir consultarlas con una **advertencia visible y precisa** sobre qué datos se reconstruyeron, sin
     presentarlas como copias idénticas al original.
   - Conservar disponibles los originales y los envíos aceptados.
   - No actualizar su contenido fiscal con datos actuales.
   - Siguen pendientes las tirillas del POS y la correspondencia del emisor registrado en Factus.

## Anticipos

### AIU

- La regla actual, que solo admite «utilidad», no es suficiente. El fundamento debe identificar la operación,
  el contrato, la norma, la base y sus condiciones. Diez caracteres de texto no acreditan su procedencia.
- **Servicios del art. 462-1 E.T.:**
  - la base especial es administración + imprevistos + utilidad, no solo utilidad;
  - no puede ser inferior al 10 % del contrato;
  - aplica a los servicios expresamente comprendidos y con sus condiciones legales.
- **Construcción de inmuebles** (art. 1.3.1.7.9 del decreto reglamentario):
  - se grava sobre los honorarios del constructor; si no se pactan, sobre su utilidad;
  - no es el mismo régimen ni tiene el mínimo general del 10 %.
- Mantenimiento o reparación no se convierten en construcción por escribir «AIU» en el contrato.
- **No da conformidad** a activar una regla genérica de AIU con base exclusivamente «utilidad». El cálculo
  $50.000 × 19 % × 15 % = $1.425 es correcto solo si esa base y esa retención proceden.
- Fuentes: DIAN sobre servicios del art. 462-1 y DIAN sobre construcción.

### ReteICA excesiva

- Citar una norma municipal no basta. Debe quedar identificado el procedimiento aplicable:
  - solicitud;
  - pruebas;
  - reintegro;
  - certificado;
  - período de descuento;
  - tratamiento de excedentes.
- No trasladar automáticamente el procedimiento de Bogotá a todos los municipios.

### Devoluciones

Acepta separar anulación, exceso y devolución parcial, con estas correcciones:

- La solicitud del proveedor, sola, no demuestra que la operación se anuló o resolvió.
- La devolución total puede ser condición de una cancelación total, pero no impedir una resolución parcial
  procedente.
- La proporción debe corresponder a las líneas y retenciones realmente afectadas; no aplicarse ciegamente si
  cambian conceptos, bases o tarifas.
- El período para descontar retenciones **no es de libre elección**, y deben cumplirse los requisitos
  específicos de cada impuesto.
- Quitar la dependencia de «amortizar con factura»: la financiación se reevalúa cuando realmente se convierta
  en pago o se produzca el abono pertinente.

### Cifras

Son coherentes:

- $59.500 = $55.592 de banco + $3.908 de retenciones;
- $595.000 − $300.000 − $119.000 = $176.000 de anticipo.

## Consignación

**Acepta como corregidos en el diseño:**

- clasificación sin valor por defecto;
- estimatorio bloqueado;
- cuentas de orden configuradas;
- mercancía propia a costo en poder de terceros;
- comisión por devengo, no por fecha de liquidación.

**Cinco ajustes contables pendientes:**

1. **No esperar el certificado** para reconocer una retención que ya ocurrió. El certificado acredita y permite
   conciliar; no crea el hecho económico. Una estimación incierta sí puede quedar pendiente, pero debe
   distinguirse de una retención efectivamente practicada.
2. **Explicar el asiento al conciliar:** cómo quedan la retención sufrida, el cliente, el dueño y la 281510,
   sin duplicar saldos. Una conciliación documental no sustituye ese reconocimiento.
3. **Anular una liquidación no cierra** pendientes tributarios de ventas o comisiones que siguen vigentes. El
   cierre depende del hecho que se anuló, no solo del documento de liquidación.
4. **Las calidades deben estar acreditadas:**
   - un O-15 no excluye la retención sin comprobar la autorización y su alcance;
   - los agentes de reteIVA no se limitan a los códigos 09 y 13;
   - consignación no puede usar criterios tributarios menos completos que anticipos.
5. **Debitar la comisión de la 281510** requiere una obligación real con el dueño y una compensación
   procedente. Si todavía no hay saldo compensable, se reconoce el derecho por cobrar, no se fabrica un débito
   contra fondos ajenos.

El lado del mandante sigue expresamente pendiente: no considera terminado el circuito bilateral.

## Para cerrar la revisión

- Las pruebas actuales de IVA.
- Una prueba integrada con los **archivos completos y exactos** de consignación y anticipos, que incluya
  retenciones, certificados, devoluciones y anulaciones entre períodos y años.
- Los 65 casos con un extracto y los 79 de consignación son evidencias distintas: no equivalen a esa
  integración completa.

Concepto favorable **únicamente** sobre los criterios marcados como aceptados.
