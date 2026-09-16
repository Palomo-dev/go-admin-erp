# ADR-004 — GO Assistant, fases 2 a 5: decisiones que no salen del código

Fecha: 2026-09-14. Estado: aplicado. Contexto previo: ADR-002 (F0), ADR-003 (F1).

## 1. Las herramientas de escritura son RPC, no los servicios existentes

`posService`, `adjustmentService`, `purchaseOrderService` y compañía importan el
cliente de navegador y guardan estado en `localStorage`. No se pueden invocar
desde un route handler sin recaer en el bug C4. Cada herramienta con impacto
multi-tabla es una función `plpgsql` SECURITY INVOKER (la RLS del usuario sigue
aplicando), con EXECUTE revocado de PUBLIC y concedido a `authenticated` y
`service_role`. Las FK de este esquema no llevan organización: cada referencia
se comprueba a mano dentro de la función.

## 2. Orden de compra y traslado crean DOCUMENTOS, no movimientos

- `crear_orden_compra` deja la orden en `draft`. No recibe mercancía. La
  recepción es un paso aparte del ERP, con conteo físico; saltárselo es como
  se descuadra un inventario.
- `crear_traslado` deja el traslado en `pending`. No mueve stock: lo confirma
  la sucursal destino. Sí se exige stock en el origen.

Aun así son `risk: high` / `write_full` / no disponibles por voz: comprometen
dinero con un proveedor o ponen en marcha a dos sucursales.

**Deshacer = cancelar, nunca borrar**, y solo mientras el documento siga en su
estado inicial. Si alguien ya lo avanzó, se remite al módulo.

## 3. El precio lo pone el catálogo; el costo también

La IA no inventa precios de venta (`product_prices`) ni de compra
(`product_costs`: primero el del proveedor, luego el general). Si el usuario
dicta uno distinto, la tarjeta lo dice.

## 4. Carga masiva: determinista y por composición

Interpretar un CSV/Excel no pasa por ningún modelo: `xlsx` + cabeceras humanas
+ números colombianos. La RPC `assistant_bulk_load_products` no duplica lógica:
cada fila nueva es `assistant_create_product`; el stock de los existentes es un
ajuste documentado por `assistant_create_adjustment` (con movimiento y
asiento); los precios por `assistant_set_product_price`. Todo o nada. Política
de duplicados dicha en la tarjeta: SKU → código de barras → nombre.

`stock_mode`: `add` (entra mercancía, por defecto) o `set` (conteo). Se eligió
`add` por defecto porque un "set" silencioso puede mandar a pérdida medio
inventario por una columna mal leída.

Deshacer compensa: precios al anterior, ajustes con el ajuste contrario,
productos nuevos eliminados solo sin movimientos (si no, inactivos).

## 5. La tarjeta pinta lo que la herramienta calculó

`PendingAction.preview` (líneas con nombres reales, avisos, totales, tabla de
carga masiva). Sin esto la tarjeta decía "producto 51814 × 3": no se puede
confirmar con criterio.

## 6. F5 se corta donde dice el plan

Sin `ws-server` desplegado, F5 = "audio entra y sale": nota de voz por la
cadena STT del ERP (con confianza) y respuesta en audio con ElevenLabs, solo
si `tts_enabled`. La voz en vivo espera a la infraestructura y a
`voice_enabled`. Las herramientas `high` siguen bloqueadas en voz.

## 7. Toda migración deja `.sql` y rollback

Las siete aplicadas por MCP antes de la política se reconstruyeron desde
`supabase_migrations.schema_migrations.statements`, byte a byte.

## 8. Conversión entre monedas: tasa del día, nunca fija

Decisión del usuario (2026-09-15): la tasa es la de openexchangerates del día
de la operación, leída de `currency_rates` (base USD). El asistente convierte
con `convertir_moneda` antes de proponer cualquier escritura y enseña la tasa
y su fecha; la base solo recibe importes en la moneda de la organización. Si
no hay tasa ese día se usa la última anterior y se dice.
