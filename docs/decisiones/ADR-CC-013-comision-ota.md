# ADR-CC-013 · La comisión de OTA es gasto contra una cuenta por pagar al canal

**Fecha:** 2026-09-23 · **Estado:** aplicada (`20260923223946`) · **Hallazgo:** F-65

## Decisión del dueño

La comisión de Booking/Expedia se contabiliza como gasto de comisiones (5235)
contra cuentas por pagar al canal (2335, o su equivalente en el plan de la
organización). Si la OTA descuenta la comisión del pago, el neto va a bancos.

## Estado encontrado

- La llamada a `fn_create_journal_entry` no correspondía a ninguna firma; la
  sesión de CRM la corrigió en `20260923223149` (parámetros con nombre,
  `fact_key = accrual:ota_commission:{detalle}`).
- Reglas: orgs 1–115 con `ota_commission/confirmed` 5205/2205; orgs 116–149 con
  `ota_commission/created` 5105 (gastos de personal) contra 1305 (clientes). La
  función solo buscaba `confirmed`: en esas organizaciones salía sin asiento y
  sin rastro.
- 2335 existía en 1 de 85 planes; 5235 en 83.
- `booking_reservation_details` y `expedia_reservation_details`: 0 filas. No hay
  asientos históricos que corregir.

## Implementación

1. `fn_asegurar_cuentas_comision_ota`: siembra 2335 «Costos y gastos por pagar» y
   5235 «Comisiones» en los 85 planes y en cada organización nueva.
2. Todas las reglas `ota_commission` quedan `confirmed` 5235 → 2335, y la plantilla
   COL de `fn_create_default_accounting_rules` también.
3. `fn_auto_journal_ota_commission` (sobre la versión de CRM) toma cualquier regla
   activa de comisión OTA y, si no hay, registra el rechazo en
   `journal_entry_failures`.
4. **Pago neto del canal**: `fn_liquidar_pago_ota(canal, detalle, bruto, cuenta
   bancaria, fecha, referencia)` → Dr Bancos (bruto − comisión) · Dr 2335
   (comisión) / Cr 1305 (bruto). Idempotente por
   `settlement:ota_payout:{detalle}`; permiso `finance.create`.
5. Modelo en que el hotel cobra y paga la comisión después: la comisión queda en
   2335 y se paga como una cuenta por pagar (Dr 2335 / Cr Bancos).

## Verificación (org 149, transacción revertida)

Reserva confirmada con comisión 15.000: `5235 D 15.000 / 2335 C 15.000`, un solo
asiento aunque la comisión se actualice. Pago neto de 100.000:
`1110 D 85.000 · 2335 D 15.000 / 1305 C 100.000`; 2335 queda en 0; repetir la
liquidación devuelve el mismo asiento.

## Pendiente

La pantalla de PMS que llame a `fn_liquidar_pago_ota` cuando el canal pague.
