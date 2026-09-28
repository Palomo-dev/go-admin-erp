# ADR-CC-002 · Una venta POS nueva solo se guarda por `pos_checkout_v1`

**Fecha:** 2026-09-23 · **Estado:** aplicada en código (`posService.checkout`)

## Contexto

`POSService.checkout` tenía dos caminos para una venta nueva: la RPC atómica
`pos_checkout_v1` (una transacción) y un respaldo de N inserts desde el cliente
(varias transacciones) que se activaba si la RPC respondía `PGRST202`.

La hipótesis del prompt era que las orgs 137 y 145 seguían en el respaldo. La
medición dice otra cosa. La firma de la RPC es `issue_date = sales.created_at =
sale_date`; de las facturas con venta desde el 22-sep que no la cumplen:

| Org | Qué eran | Filas |
|---|---|---:|
| 137, 145 | **pedidos web** pagados por pasarela (`webOrderServerConfirmation`) | 20 |
| 144 | POS de contado, todas antes de las 02:18 UTC del 22-sep (despliegue) | 32 |
| 144 | ventas fiadas (`hold_with_debt`, venta `pending` + factura `issued`) | 38 |

Desde el despliegue, ninguna venta POS nueva ha usado el respaldo.

## Opciones

1. Mantener el respaldo como red para entornos sin la RPC.
2. Retirar el respaldo para ventas nuevas: sin RPC la venta falla con un error
   visible, no se degrada en silencio.
3. Retirar además el camino del cobro de deudas y llevarlo a una RPC.

## Decisión

Opción 2. Una venta nueva sin RPC lanza
«No se pudo registrar la venta: el servicio de cobro no está disponible. La
venta NO se guardó». El carrito sigue abierto y no se escribe nada.

El tramo de N inserts queda **solo** para el cobro de una deuda
(`cart.sale_id` + `cart.invoice_id`), que actualiza una venta y una factura que
ya existen. Se retiraron las ramas de venta nueva (inserción de venta, líneas,
stock, seriales, factura y líneas de factura, reanudación por `saleId`,
carrera 23505): unas 400 líneas inalcanzables.

La opción 3 queda como deuda: el cobro de deudas no crea venta nueva ni
devengo (el devengo lo hizo la factura al fiar), así que no afecta al
invariante de un asiento por hecho.

## Consecuencias

- La idempotencia por id de cliente la da la RPC (`replayed`); los tests del
  respaldo se sustituyeron por el contrato nuevo
  (`src/lib/offline/__tests__/checkoutIdempotente.test.ts`, `checkoutRpc.test.ts`).
- Los caminos que siguen escribiendo venta y factura en transacciones separadas
  —pedido web, mesas, venta fiada— quedan cubiertos por la red del servidor:
  con `accrual:sale:{id}` compartido y ADR-CC-001, el asiento es el mismo sin
  importar qué disparador gane. Verificado en la org 149 (camino B).
