# Diseño previo — RPC transaccional para checkout POS

**Estado:** propuesta para revisión; no implementada.
**Motivo:** F-48 demostró que `sales` e `invoice_sales` publican el mismo hecho
contable en operaciones separadas.

## Objetivo

Convertir el cierre del checkout en una sola transacción de Postgres, manteniendo
la factura como documento contable canónico cuando exista y la ruta `sales` como
respaldo únicamente cuando la venta termine sin factura.

La primera versión no debe abarcar impresión, correo, pasarela de pago ni otros
efectos externos. Esos trabajos ocurren después del commit o mediante outbox.

## Entrada propuesta

RPC versionada `finalize_pos_checkout_v1` con parámetros tipados o un JSON validado:

- `p_client_sale_id`: UUID idempotente generado por el cliente offline o el
  servidor;
- `p_organization_id`: obtenido por `getServerOrgContext()`, nunca del body
  aceptado sin validar;
- `p_branch_id`, validado como sucursal de la organización y accesible al usuario;
- `p_customer_id`, opcional y validado dentro de la organización;
- líneas del carrito: producto, cantidad, precio solicitado, descuento y datos
  fiscales necesarios;
- pagos: método, importe, referencia e identificador idempotente;
- configuración de factura: emitir o no, cliente, forma de pago, vencimiento y
  datos electrónicos ya validados;
- datos opcionales de vendedor, propina, entrega, seriales y cupón;
- marca temporal del cliente para reintentos offline, sin usarla como autoridad
  contable.

La RPC valida `auth.uid()`, membresía activa, organización, sucursal y pertenencia
de cada referencia. Los totales, impuestos, descuentos y saldo se recalculan en
servidor; no se confían importes finales enviados por el navegador.

## Orden transaccional

1. Tomar un bloqueo idempotente por `(organization_id, client_sale_id)`.
2. Si la venta ya existe, devolver el resultado existente y completar solamente
   hijos ausentes bajo las mismas claves únicas.
3. Resolver precios, impuestos, descuentos, total, pagos y saldo mediante un único
   contabilizador compartido.
4. Insertar `sales` siempre con `status='pending'`. Esa es la señal segura para
   que `trg_auto_journal_sale_pos` todavía no contabilice; no se introduce una
   bandera controlable por el cliente.
5. Insertar `sale_items`.
6. Registrar movimientos de inventario y seriales mediante funciones internas
   transaccionales e idempotentes.
7. Si corresponde factura, reservar el consecutivo e insertar `invoice_sales` e
   `invoice_items`. El asiento canónico se produce por la ruta de factura una sola
   vez y solo para un estado contabilizable; `draft` queda excluido por F-49.
8. Insertar pagos, propina, comisión, cupón y cuenta por cobrar cuando apliquen,
   cada uno con clave idempotente y sin duplicar lógica contable.
9. Actualizar `sales.balance`, `payment_status` y por último `status` al estado
   definitivo.
10. Al procesar ese último `UPDATE`, `fn_auto_journal_sale_pos` consulta la factura:
    si existe una factura contabilizable, retorna sin publicar; si no existe,
    publica el asiento de respaldo usando la corrección F-52.
11. Insertar eventos de outbox para impresión, correo, facturación electrónica o
    sincronizaciones externas.
12. Devolver IDs, número de factura, totales resueltos y estado idempotente.

## Señal al trigger

La señal es un estado persistente válido, `sales.status='pending'`, durante la
construcción de la transacción. No se propone un GUC de sesión, una variable global
ni una columna `skip_accounting`: cualquiera de esas opciones podría ser manipulada
o quedar olvidada.

El último cambio de `status` ocurre cuando la factura y los pagos ya son visibles
en la misma transacción. Así el trigger puede decidir con información completa.

## Fallo a mitad

Cualquier excepción revierte venta, líneas, factura, pagos, inventario, asiento y
outbox. No queda una venta pagada sin factura ni una factura sin sus líneas.

Los efectos externos nunca ocurren dentro de la RPC. Tras commit, un consumidor
procesa el outbox. Si ese consumidor falla, reintenta por clave idempotente sin
repetir la venta.

Los consecutivos basados en secuencias pueden dejar huecos tras rollback; se acepta
el hueco técnico o se usa el mecanismo fiscal vigente, pero nunca se reutiliza un
número ya expuesto externamente.

## Reintentos y concurrencia

- `p_client_sale_id` es único por organización.
- Dos reintentos concurrentes serializan con bloqueo y obtienen el mismo resultado.
- Cada hijo tiene una restricción o comprobación idempotente por organización y
  venta.
- El asiento tiene una clave estable del hecho contable; no depende solo del memo.
- La respuesta distingue `created`, `resumed` y `already_completed`.

## Cambios previos obligatorios

1. F-49: la factura no contabiliza `draft`.
2. F-50/F-51: un único resolver para código fiscal y redondeo. Regla F-51:
   `base = round(bruto / (1 + tasa / 100), 2)` e impuesto por resta.
3. F-48: el trigger POS omite la publicación cuando ya existe una factura
   contabilizable vinculada.
4. Pruebas de contrato del checkout actual para contado, crédito, pago mixto,
   deuda, reintento offline, seriales, propina, cupón y falla inducida en cada paso.

La implementación solo debe empezar después de aprobar este diseño y ejecutar la
prueba de compra con IVA que cierra F-45.
