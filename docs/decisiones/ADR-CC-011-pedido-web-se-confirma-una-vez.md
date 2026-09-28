# ADR-CC-011 · Un pedido web se confirma una sola vez, y lo garantiza la base

**Fecha:** 2026-09-23 · **Estado:** aplicada (`20260923175006`, `20260923175318`) · **Hallazgo:** F-67

## Contexto

Dos caminos confirman un pedido web: el servidor (webhook de la pasarela, cron de
reconciliación, `/api/web-orders/[id]/auto-confirm`) y el botón «Confirmar
pedido» de Pedidos online. Los dos creaban la venta tras leer `sale_id`, sin
bloqueo. Corrieron a la vez y crearon dos ventas del mismo pedido (F-67).

## Decisión

1. **Un solo punto crea la venta:** `fn_confirmar_pedido_web(pedido, cliente,
   usuario, pagado)`, `SECURITY INVOKER`. Toma el pedido con `FOR UPDATE`; si ya
   tiene venta (o hay una venta viva con su `web_order_id`), la devuelve con
   `creada = false` y no crea nada. Si no, crea la venta con los importes del
   propio pedido, la liga (`sales.web_order_id`, `web_orders.sale_id`) y devuelve
   `creada = true`. Con sesión, el usuario sale de `auth.uid()`, nunca del
   parámetro; el cliente debe ser de la organización del pedido.
2. **Red estructural:** `sales.web_order_id` con índice único parcial
   `uq_sales_web_order_viva` (`status <> 'void'`). Aunque alguien inserte una
   venta por otro camino, no puede haber dos vivas por pedido.
3. **Protección inmediata del código desplegado:** un disparador `BEFORE INSERT`
   llena `web_order_id` desde la nota `Pedido web: <número>` que escriben los dos
   caminos (verificado en las 628 ventas web). Así el índice protege también la
   versión en producción, que aún inserta la venta directo.
4. **Los dos caminos llaman a la función.** El que llega segundo recibe la venta
   existente: el servidor sale sin error; el navegador avisa «El pedido ya estaba
   confirmado». La referencia de la pasarela queda en el pago que sobrevive.

## Opciones descartadas

- **Solo un chequeo en el cliente:** no protege del webhook.
- **Toda la confirmación en una RPC** (venta, líneas, stock con recetas, factura,
  pago, comanda, envío, cupón, propina): sería lo ideal, pero reescribe dos
  implementaciones de cientos de líneas. Queda como siguiente paso; con esta
  decisión ya no hay duplicados, aunque la cadena posterior no es atómica.

## Consecuencias

- `web_orders.sale_id` se escribe al crear la venta, no al final de la cadena.
- Un pedido cuya cadena falle a medias queda con venta y sin el resto; se ve en
  el pedido. Antes se reintentaba y se duplicaba.
- Mientras el código nuevo no llegue a producción, el camino que pierde la
  carrera recibe un error de índice único en vez de la venta existente: no se
  duplica nada, pero el operario ve un error.
