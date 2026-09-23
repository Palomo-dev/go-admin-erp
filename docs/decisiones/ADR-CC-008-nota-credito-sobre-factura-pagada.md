# ADR-CC-008 · Qué pasa con el dinero cuando se acredita una factura ya pagada

**Fecha:** 2026-09-23 · **Estado:** APROBADA y aplicada (`20260923133707`, `20260923133809`) · **Hallazgo:** F-58

## Contexto

La nota crédito revierte ingreso e IVA contra 1305. Sobre una factura pagada,
1305 queda negativo y nadie sabe si ese dinero se devolvió, se debe devolver o
queda como crédito del cliente. El modelo devengo + cobro (ADR-CC-001) ya separa
los hechos: la nota crédito es el **devengo inverso**. Falta el segundo hecho,
**qué pasó con el dinero**, que hoy no tiene documento.

## Opciones

**A. Devolución de dinero.** Un pago saliente enlazado a la nota crédito
(`payments` con `source='credit_note'`, `source_id` = nota), contabilizado por
el disparador de pagos como liquidación inversa:
`1305 D / 1105|1110 C` (Caja o Bancos según el medio, con
`fn_money_account_code_pago`). 1305 vuelve a cero y el dinero sale por donde
salió de verdad.

**B. Saldo a favor.** Reclasificación de 1305 a **2805 Anticipos y Avances de
Clientes** (`1305 D / 2805 C`), con su documento en `credit_notes` (el saldo a
favor que ya existe). Al usarlo en otra compra, `fn_apply_customer_credit`
hace `2805 D / 1305 C` contra la nueva factura.

**C. No hacer nada** y dejar 1305 negativo. Descartada: es el defecto.

## Decisión propuesta

Las dos, **elegidas por el usuario al emitir la nota** sobre una factura pagada
o parcialmente pagada. Solo la parte que excede el saldo pendiente de la
factura genera el segundo hecho:

1. `NotaCreditoDialog` calcula `excedente = |total NC| − saldo pendiente de la
   factura`. Si `excedente > 0`, obliga a elegir:
   - **«Devolver el dinero»** (medio y cuenta) → opción A por el excedente;
   - **«Dejar como saldo a favor»** → opción B por el excedente.
   No hay opción por defecto: el usuario elige, y no se emite la nota sin
   elección.
2. Todo en **una RPC transaccional** (`fn_emitir_nota_credito`): nota + líneas
   + devolución o saldo a favor. Hoy la nota, sus líneas y su efecto se
   escriben desde el navegador en varias llamadas (F-17).
3. Claves del hecho: `refund:credit_note:{id}` (A) y
   `customer_credit:credit_note:{id}` (B).
4. **Prerrequisito:** sembrar la cuenta 2805 en el plan contable de las 84
   organizaciones que no la tienen, y una regla contable
   `customer_credit/created` (`1305 D / 2805 C`). Sin eso, el saldo a favor que
   ya existe falla en 84 de 85 organizaciones.
5. **Histórico:** las 2 notas de la org 2 se regularizan con B (no hay rastro
   de devolución), previa confirmación del cliente. Las de la org 149 se usan
   como casos de prueba de la implementación.

## Consecuencias

- `v_cartera_vs_documentos.importe_nc_sobre_pagadas` debe tender a 0 para las
  notas emitidas después de implementar esto; la diferencia de cartera por F-58
  desaparece.
- La devolución por la pasarela de un pedido web (`web-orders/[id]/refund`) ya
  crea la nota. Con A, el pago saliente es el reembolso de la pasarela: hay que
  enlazarlo al mismo `source_id` para no contarlo dos veces.
- No se implementa en este cierre: toca el flujo de emisión (UI + RPC nueva) y
  la siembra de cuentas en 84 planes contables, y el mandato pide la propuesta
  primero.

## Implementación (2026-09-23)

Decisiones tomadas al implementar, además de lo propuesto:

1. **El excedente es solo dinero ya pagado.** La primera versión
   (`|nota| − lo que se debía`) daba excedente en notas mayores que su factura
   sin ningún pago; un excedente es dinero que el cliente pagó.
2. **La devolución es un pago negativo** en `payments` (`source='credit_note'`).
   El cierre de caja suma los pagos completados por medio: con importe positivo
   la salida habría inflado la caja. `fn_auto_journal_payment`,
   `fn_recalc_invoice_balance_from_payments` y la cartera ignoran esa fuente; el
   asiento lo hace la RPC con clave `refund:credit_note:{id}`. Efecto conocido:
   `fn_notify_payment_registered` notifica «pago registrado» con importe
   negativo.
3. **No es atómico con la emisión de la nota**, porque la nota se escribe
   desde el navegador en varias llamadas (F-17). Si la liquidación falla, la
   nota queda y el diálogo avisa; `v_cartera_vs_documentos` la muestra
   pendiente.
4. **Otros emisores de notas crédito** (devoluciones del POS y reembolso de
   pedidos web) no liquidan todavía: queda como siguiente paso.
5. **Histórico:** se liquidaron las 4 notas del mandato. Las otras 4 que
   encuentra la regla quedan en F-62.
