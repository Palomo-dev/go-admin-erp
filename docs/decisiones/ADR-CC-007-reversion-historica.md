# ADR-CC-007 · Reversión histórica: alcance, fecha y criterio de rollback

**Fecha:** 2026-09-23 · **Estado:** aplicada (lote `cierre-contable-2026-09-23`)

## Contexto

El mandato autoriza neutralizar con contra-asientos tres conjuntos: los
duplicados F-48, las líneas de 2405 al débito de F-45 (salvo compras) y los 31
borradores con asiento. También exige que, al terminar, 1305/2405/4105
coincidan con los documentos.

Con ADR-CC-001 apareció un cuarto conjunto que impide ese cuadre: **1.566
devengos contra Caja** cuyo hecho además tiene cobro contabilizado. El mismo
dinero está en Caja (por el devengo) y en Caja/Bancos (por el cobro), y 1305
queda negativo por ese importe.

## Decisiones

1. **Alcance ampliado a CC-001.** Mismo tratamiento que F-45: contra-asiento
   exacto y devengo corregido contra la cuenta por cobrar. Solo cuando existe
   cobro contabilizado: sin cobro, el devengo contra Caja es la única entrada
   del dinero y es correcto en saldo (532 casos, se dejan).
2. **Devengo corregido con los importes del documento**, no con los del
   asiento original. El objetivo es que el libro coincida con las facturas.
3. **Fecha contable = la del original.** Todos los periodos están abiertos
   (1.020 mensuales, ninguno cerrado), así que la corrección cae en el mismo mes
   y los estados mensuales quedan bien. Fechar hoy habría dejado julio y agosto
   inflados y septiembre deflactado.
4. **Anulados fuera.** Una factura anulada tiene su devengo y su asiento de
   anulación. Revertir solo el devengo desbalancearía el par.
5. **Criterio de rollback por organización = balance de prueba (D = C)** y
   neutralización exacta por cuenta de cada contra-asiento. La coincidencia
   1305/2405/4105 con documentos se **mide y reporta** antes y después, pero no
   deshace la organización: hay diferencias ajenas a este bloque (cobros en
   efectivo registrados en 1110 antes del 23-sep, notas crédito sobre facturas
   pagadas, huérfanos, pagos sin fila en `payments`). Deshacer una organización
   por una diferencia que la corrección no causó dejaría el libro peor.
6. **Huérfanos (36) excluidos** y listados en el reporte para auditoría manual.

## Consecuencias

- Cada corrección queda en `journal_reversals` con su original, su
  contra-asiento y su devengo corregido; cada organización, en
  `journal_reversal_runs` con el cuadre antes y después.
- Deshacer una corrida confirmada no borra nada: se revierten los
  contra-asientos (procedimiento, §4).
