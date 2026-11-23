# Logística Fase 1 — cimientos (base de datos y servicios)

Fecha: 2026-11-23. Fase aprobada por el dueño ese día: **Colombia, domiciliario propio**.
Antecedentes: `D:\logistica-diagnostico-v1.md` y `D:\logistica-transporte-multipais.md` (22-nov-2026).

Este documento es el contrato para quienes construyan las pantallas. La base manda: todo lo que
mueve estado o dinero es una RPC transaccional `logistica_*`; las pantallas no escriben
`shipments`, cuadres ni códigos a mano.

## Punto de partida (verificado por MCP el 2026-11-23, proyecto `taqjemqjtumhwptchcxk`)

| Dato | Valor |
| --- | --- |
| Envíos | 1.423 (1.407 `pending`, 16 `cancelled`), todos de pedido web |
| Domiciliarios / vehículos | 0 / 0 |
| Intentos fallidos / pruebas de entrega | 0 / 0 |
| `shipping_rates` | 0 filas (no hubo nada que migrar a zonas) |
| Pedidos web contraentrega | 0 en 60 días (todo lo pagado fue por pasarela) |
| Conductor | vivía en `shipments.metadata.driver_id`; `assignVehicleAndDriver` reemplazaba `metadata` entero |
| `createShipmentFromPOSSale` | sí la llama `CheckoutDialog` (el diagnóstico decía que no) |

## Migraciones aplicadas

Las cinco están en `supabase/migrations/` con la versión real de
`supabase_migrations.schema_migrations` y su reversión en `supabase/rollbacks/<versión>_<nombre>_rollback.sql`.
Todas se probaron antes en seco (bloque `DO … RAISE EXCEPTION`, sin dejar datos).

| Versión | Nombre | Qué hace |
| --- | --- | --- |
| 20261123145040 | `logistica_f1_domiciliarios_envios` | Domiciliario externo, conductor en columna propia, modo de despacho, estados nuevos, recaudo y código de entrega |
| 20261123145549 | `logistica_f1_zonas_tarifas_reglas` | Zonas, cobertura, reglas de despacho y `logistica_cotizar_envio` |
| 20261123150003 | `logistica_f1_rpc_envios` | Asignar, cambiar estado, entregar, novedad, código de entrega |
| 20261123150416 | `logistica_f1_cuadres_domiciliario` | Cuadre del domiciliario contra la caja |
| 20261123150641 | `logistica_f1_pos_rastreo_avisos` | Envío desde venta POS, rastreo público, aviso «novedad» |

## Tablas y columnas

### Domiciliarios — `driver_credentials` (ampliada)

Un domiciliario puede ser **externo**, sin contrato en Recursos humanos. Forma aditiva elegida:
ampliar la misma tabla (no una nueva) para que Transporte, POS y Mis envíos sigan viendo un solo
«conductor».

- `employment_id`, `license_number`, `license_category`, `license_expiry` pasan a admitir NULL
  (la tabla tenía 0 filas; un domiciliario en bicicleta no tiene licencia).
- Nuevas: `organization_id` (obligatoria por CHECK), `branch_id`, `user_id` (para «Mis envíos»;
  NULL = sin cuenta), `full_name`, `phone`, `document_type`, `document_number`,
  `is_external` (default false), `vehicle_type` (`motorcycle | bicycle | car | van | on_foot | other`).
- CHECK `driver_credentials_identidad_check`: o tiene empleo o tiene nombre.
- Disparador `trg_driver_credentials_completar`: con empleo, completa `organization_id` y
  `user_id` y rechaza un empleo de otra organización; sin empleo marca `is_external = true`.
- Único: un domiciliario por usuario y organización.

### Envíos — `shipments` (ampliada)

| Columna | Tipo | Uso |
| --- | --- | --- |
| `driver_id` | uuid → `driver_credentials` | Domiciliario asignado. Backfill desde `metadata.driver_id` (0 filas válidas). `metadata` se conserva como espejo |
| `vehicle_id` | uuid → `vehicles` | Opcional. Asignar ya no exige vehículo |
| `assigned_at` | timestamptz | Momento de la asignación |
| `fulfillment_mode` | text, default `own` | `own · last_mile · national_carrier · marketplace` |
| `exception_reason`, `exception_detail` | text | Motivo de la última novedad (lista abajo) |
| `failed_attempts` | smallint, default 0 | Intentos fallidos |
| `cod_collected_amount`, `cod_collected_method`, `cod_collected_at` | | Lo que cobró el domiciliario (`cash · card · transfer · qr`) |
| `cod_remitted_at` | timestamptz | Cuándo se entregó el dinero en el cuadre |
| `delivery_code_required` | boolean | Lo calcula un disparador: contraentrega propia |
| `shipping_zone_id` | uuid → `shipping_zones` | Zona con que se cotizó |

Ya existían y ahora se llenan: `cod_amount`, `cod_status` (`pending → collected → remitted`),
`shipping_fee`, `payment_status` (`cod` cuando hay contraentrega).

**Estados** (`shipments_status_check`, solo se amplió): `draft, pending, assigned, ready,
ready_for_pickup, picked, dispatched, in_transit, out_for_delivery, failed_attempt, delivered,
failed, returned, cancelled`. Nuevos: `ready_for_pickup` y `failed_attempt`.

**Estados canónicos** (`transport_events.canonical_status`): `created, ready_for_pickup, assigned,
picked, in_transit, out_for_delivery, failed_attempt, delivered, exception, returned, cancelled`.
Los 1.411 eventos `created` viejos sin canónico se completaron.

**Motivos de novedad** (`shipments.exception_reason`, `transport_events.reason_code`,
`delivery_attempts.failure_reason_code`): `not_home, wrong_address, incomplete_address, rejected,
damaged, lost, access_denied, business_closed, weather, vehicle_issue, customer_request, other`
(se sumó `lost`).

Índice único nuevo `idx_shipments_sale_unique`: una venta POS, un envío (igual que el pedido web).

### Otras ampliaciones

- `transport_events.reason_code` (motivo de cada novedad).
- `delivery_attempts.courier_id` y `proof_of_delivery.courier_id` → `driver_credentials`
  (el `driver_id` de esas tablas es un usuario de auth y el externo puede no tener).
- `proof_of_delivery.delivery_code_verified`, `cod_collected_amount`, `cod_collected_method`.
- `web_order_notices.moment` suma `novedad` (`en_camino` y `entregado` ya estaban).

### Código de entrega — `shipment_delivery_codes` (nueva)

`shipment_id` (PK), `organization_id`, `code` (4 dígitos), `failed_tries`, `verified_at`.
Solo en **contraentrega propia** (`cod_amount > 0` y `fulfillment_mode = 'own'`): lo emite el
disparador `trg_shipments_codigo_entrega` al crear el envío o al poner `cod_amount`.
Tabla aparte porque `shipments` la leen todos los miembros, incluido el domiciliario; el código no.

### Zonas — `shipping_zones` (nueva)

Por organización y, opcionalmente, sede (`branch_id` NULL = todas). Campos: `name`,
`description`, `is_active`, `is_fallback` (= **tarifa general** fuera de zona, una por sede),
`priority` (menor gana), `fee`, `currency` (moneda base por disparador),
`promise_min_minutes`, `promise_max_minutes`, `promise_text`, `min_order_amount`,
`free_shipping_from`, `free_shipping_applies_to` (`web` por defecto · `pos` · `both`; el pedido
manual cuenta como `pos`), `cutoff_time`, `delivery_days` (ISO 1 = lunes … 7), `metadata`.

### Cobertura — `shipping_zone_locations` (nueva)

`location_type`: `municipality` (código DANE de 5 dígitos), `neighborhood` (barrio, acotado o no a
un municipio; se compara por `neighborhood_key`, generado: minúsculas, sin tildes, espacios
simples), `postal_code` o `polygon` (GeoJSON `Polygon | MultiPolygon | Feature`, orden
`[lng, lat]`; huecos respetados). FK compuesta `(zone_id, organization_id)`.

### Reglas de despacho — `delivery_rules` (nueva)

`priority`, condiciones (`zone_ids`, `channels`, `payment_methods`, `min/max_order_value`,
`min/max_weight_kg`, `weekdays`, `time_from`, `time_to`) y `action`. CHECK
`delivery_rules_fase1_solo_propio`: en Fase 1 solo `own` (la Fase 2 lo retira).

### Cuadres — `courier_settlements` y `courier_settlement_lines` (nuevas)

- Cuadre: `branch_id`, `driver_id`, `cash_session_id` (la caja abierta de la sede), `status`
  (`open · closed · cancelled`; uno abierto por domiciliario), totales esperado/recibido/diferencia,
  totales por medio, `difference_reason`, `difference_responsible`
  (`courier · cashier · customer · other`), `accounting_status`
  (`not_required · pending_accountant · resolved`).
- Línea: un envío contraentrega (`expected_amount` = `cod_amount`; `reported_*` = lo que reportó el
  domiciliario), lo recibido y su medio, `payment_id` del cobro, `status`
  (`pending · received · shortage · cancelled`), diferencia y motivo. Un envío solo está en un
  cuadre vigente.

## RLS

| Tabla | Leer | Escribir |
| --- | --- | --- |
| `driver_credentials` | quien «ve todo» en la organización; un domiciliario sin permiso, solo su fila (20261123165617) | solo `fn_logistica_gestiona` (= `fn_caja_puede` 'pos.create'); el fin de jornada va por `logistica_fin_jornada` |
| `shipments` (y por herencia `proof_of_delivery`, `delivery_attempts`, `shipment_items`) | quien «ve todo»; un domiciliario sin permiso, solo los envíos con su `driver_id` (20261123165617) | quien «ve todo»; el domiciliario escribe solo por las RPC `logistica_*` |
| `transport_events` (lectura) | quien «ve todo»; el domiciliario, solo los eventos de sus envíos (los de viajes y rutas, como antes) | sin cambios |
| `shipment_delivery_codes` | miembro activo **y** `fn_caja_puede(org, 'logistica.codigo_entrega.ver')` (en la práctica, administradores) | nadie: solo disparadores y RPC |
| `shipping_zones`, `shipping_zone_locations`, `delivery_rules` | miembro activo | `fn_caja_puede(org, 'organization_settings')`; políticas separadas por comando |
| `courier_settlements`, `courier_settlement_lines` | quien «ve todo»; el domiciliario, solo sus cuadres (20261123165617) | nadie: solo RPC |

Patrón en todas: `organization_id IN (SELECT om.organization_id FROM organization_members om
WHERE om.user_id = (select auth.uid()) AND om.is_active)`. Sin `EXISTS` anidado. Anon no tiene
acceso a ninguna tabla nueva.

## RPC

Todas `SECURITY DEFINER`, `search_path = public`, `REVOKE EXECUTE … FROM PUBLIC, anon` y
`GRANT` a `authenticated, service_role`, salvo el rastreo público (solo `service_role`).
Guarda: miembro activo de la organización del objeto (`fn_assert_acceso_org`) y acceso a su sede
(`app_branch_access`). Los errores son `RAISE` con código en el mensaje.

| RPC | Firma | Devuelve / errores |
| --- | --- | --- |
| `logistica_cotizar_envio` | `(p_organization_id int, p_branch_id int, p_direccion jsonb, p_canal text, p_subtotal numeric, p_opciones jsonb default '{}')` | Ver «Cotizar». `CANAL_INVALIDO`, `SEDE_INVALIDA` |
| `logistica_asignar_domiciliario` | `(p_shipment_id uuid, p_driver_id uuid, p_vehicle_id uuid default null, p_fecha_estimada date default null)` | `{ok, status, driver_id, vehicle_id, assigned_at}`. `ESTADO_NO_ASIGNABLE`, `DOMICILIARIO_INVALIDO`, `VEHICULO_INVALIDO` |
| `logistica_cambiar_estado` | `(p_shipment_id uuid, p_estado text, p_nota text default null, p_lat numeric default null, p_lng numeric default null)` | `{ok, status, aviso}` (`aviso = 'en_camino'` al salir). `ESTADO_NO_PERMITIDO`, `TRANSICION_INVALIDA` |
| `logistica_marcar_entregado` | `(p_shipment_id uuid, p_prueba jsonb, p_codigo text default null, p_cobro jsonb default null)` | `{ok:true, proof_id, cod_status, aviso:'entregado'}` o `{ok:false, error:'CODIGO_INVALIDO', intentos_restantes}`. `RECEPTOR_REQUERIDO`, `COBRO_REQUERIDO`, `CODIGO_BLOQUEADO`, `YA_ENTREGADO` |
| `logistica_registrar_novedad` | `(p_shipment_id uuid, p_motivo text, p_detalle text default null, p_reprogramar date default null, p_fotos text[] default null, p_lat numeric default null, p_lng numeric default null)` | `{ok, intento, aviso:'novedad'}`. `MOTIVO_INVALIDO`, `ESTADO_SIN_NOVEDAD` |
| `logistica_codigo_entrega` | `(p_shipment_id uuid)` | `{requerido, codigo, intentos_fallidos, verificado_en}`. Solo administradores o service role |
| `logistica_codigo_entrega_reiniciar` | `(p_shipment_id uuid)` | Código nuevo y contador en 0. Solo administradores |
| `logistica_crear_envio_venta_pos` | `(p_sale_id uuid, p_entrega jsonb, p_driver_id uuid default null)` | `{ok, ya_existia, shipment_id, cod_amount, shipping_fee, shipping_fee_source, cotizacion}`. `DIRECCION_REQUERIDA`, `VENTA_ANULADA` |
| `logistica_cuadre_abrir` | `(p_organization_id int, p_branch_id int, p_driver_id uuid, p_notas text default null)` | Cuadre con líneas. `NO_OPEN_CASH_SESSION`, `SIN_PERMISO` |
| `logistica_cuadre_recibir_linea` | `(p_line_id uuid, p_metodo text, p_monto numeric, p_referencia text default null, p_factura jsonb default null, p_motivo_diferencia text default null)` | Cuadre + `cobro`. `MONTO_MAYOR_AL_ESPERADO`, `MOTIVO_REQUERIDO`, `METODO_INVALIDO`, los de `fn_cobrar_pedido_web_en_caja` |
| `logistica_cuadre_cerrar` | `(p_settlement_id uuid, p_motivo text default null, p_responsable text default null, p_detalle_responsable text default null, p_notas text default null)` | Cuadre cerrado. `LINEAS_PENDIENTES`, `MOTIVO_Y_RESPONSABLE_REQUERIDOS` |
| `logistica_cuadre_anular` | `(p_settlement_id uuid, p_motivo text)` | Solo sin dinero recibido. `CUADRE_CON_RECIBOS` |
| `logistica_rastreo_publico` | `(p_organization_id int, p_web_order_id uuid)` | Solo `service_role`. Estado, eventos canónicos, fecha estimada, nombre de pila del domiciliario, contraentrega y su código mientras está en curso |

`p_prueba`: `{nombre*, tipo_documento, documento, relacion, firma_url, fotos[], notas, lat, lng, tipo_lugar}`.
`p_cobro`: `{metodo: cash|card|transfer|qr, monto}` (obligatorio si hay contraentrega).
`p_entrega` (POS): `{direccion*, ciudad, municipio_dane, barrio, codigo_postal, lat, lng,
contacto_nombre, contacto_telefono, instrucciones, costo_envio, tarifa_id}`.

Transiciones de `logistica_cambiar_estado` (`fn_logistica_transicion_valida`, copiada en
`src/lib/logistica/estadosEnvio.ts` y verificada por prueba):

```
draft|pending      → ready_for_pickup, assigned*, cancelled
ready              → ready_for_pickup, assigned*, picked, out_for_delivery, cancelled
ready_for_pickup   → assigned*, picked, out_for_delivery, cancelled
assigned           → ready_for_pickup, picked, out_for_delivery, cancelled
picked|dispatched  → in_transit, out_for_delivery, returned
in_transit         → out_for_delivery, returned
out_for_delivery   → returned            (+ delivered** / failed_attempt***)
failed_attempt     → assigned*, out_for_delivery, returned, cancelled
* logistica_asignar_domiciliario  ** logistica_marcar_entregado  *** logistica_registrar_novedad
```

### Cotizar envío — el único cálculo

`p_direccion = {municipio_dane, barrio, codigo_postal, lat, lng}`, `p_canal = web | pos | manual`,
`p_opciones = {metodo_pago, peso_kg}` (para las reglas). Elige la zona activa: primero las de la
sede, luego prioridad, luego la coincidencia más precisa (polígono > barrio > código postal >
municipio), luego la tarifa más baja. Respuesta:

```json
{ "en_zona": true, "zona": {"id": "…", "nombre": "Centro", "es_tarifa_general": false, "coincidencia": "neighborhood"},
  "precio": 5000, "tarifa": 5000, "moneda": "COP", "envio_gratis": false,
  "envio_gratis_desde": 100000, "falta_para_envio_gratis": 50000,
  "pedido_minimo": 20000, "cumple_minimo": true, "falta_para_minimo": 0,
  "tiempo": {"min_minutos": 30, "max_minutos": 60, "texto": null},
  "despacho": {"fecha": "2026-11-23", "hoy": true, "corte": "18:00:00", "dias_reparto": [1,2,3,4,5,6,7], "zona_horaria": "America/Bogota"},
  "modo": "own", "regla_id": null, "motivo": null, "alternativa": null, "canal": "web", "subtotal": 50000 }
```

Fuera de zona: `motivo = 'fuera_de_zona'` (o `'sin_zonas_configuradas'`), y `alternativa =
'tarifa_general'` (con su precio) o `'transportadora'` (si la organización tiene una de tercero
activa) o `null` (sin cobertura). `despacho.fecha` es un `date` en la zona de la sede: se muestra
con `formatPlainDate`, no se convierte.

## Contraentrega y código de entrega

- **Pedido web**: es contraentrega si NO está pagado y NO es de pasarela (misma regla que el cobro
  en caja, `pedidoEsDePasarela`). `cod_amount` = total del pedido; `cod_status = 'pending'`;
  `payment_status = 'cod'`. Lo calcula `contraentregaDePedidoWeb` al crear el envío.
- **Venta POS**: `cod_amount` = **saldo** de la venta, leído en la base. Nunca un monto del navegador.
- **Código**: 4 dígitos, solo contraentrega propia. El cliente lo ve en el rastreo público y lo
  dicta; el domiciliario lo digita al entregar. 5 errores bloquean; un administrador reinicia.
- Al entregar: `cod_status = 'collected'` con monto y medio. Al recibir en el cuadre: `remitted`.

## Cuadre del domiciliario (dinero)

1. **Abrir** (`logistica_cuadre_abrir`): exige caja abierta en la sede (`fn_caja_abierta_para`,
   la misma regla del POS) y trae los envíos `collected` del domiciliario en esa sede.
2. **Recibir cada línea** (`logistica_cuadre_recibir_linea`): **no reimplementa cobros**; en la
   misma transacción llama a lo que ya existe:
   - pedido web → `fn_cobrar_pedido_web_en_caja` (factura si falta, pago en la caja, venta pagada);
     la factura la arma `webOrderConfirmationService.facturaParaCobroEnCaja`, la misma de «Cobrar»;
   - venta POS → `fn_registrar_pago` sobre la factura de la venta (origen `pos_cxc`).
   Contabilidad por las reglas vigentes: **efectivo** a la caja; **datáfono** (`card`) a la CxC del
   procesador **13802001** (`fn_procesador_de_pago` + `fn_cuenta_cobro`, migración
   20261121094157); transferencia/QR a la cuenta que les asigna hoy `fn_cuenta_cobro` (ver TODO).
   Si llega menos de lo esperado, la línea queda `shortage` y exige motivo.
3. **Cerrar** (`logistica_cuadre_cerrar`): sin líneas pendientes; si no cuadra, exige motivo y
   responsable. El faltante queda registrado y `accounting_status = 'pending_accountant'`,
   **sin asiento** (ver TODO del Contador).

Permisos: miembro activo, acceso a la sede y `fn_caja_puede(org, 'pos.create')` (cajeros y
administradores).

## Rastreo público

Se **reutiliza** el token de la tienda (`goadmin-websites/lib/orders/tokenSeguimiento.ts`, HMAC
sin estado): el ERP tiene una copia exacta en `src/lib/logistica/tokenSeguimiento.server.ts`
(`tokenSeguimiento`, `tokenSeguimientoValido`, `urlRastreo`) para poner el enlace en los avisos.
No hay token en la base. La tienda valida `?t=` y llama `logistica_rastreo_publico` con service role.

## Servicios (TypeScript)

Lógica pura (con pruebas) en `src/lib/logistica/`:

| Archivo | Qué exporta |
| --- | --- |
| `estadosEnvio.ts` | Listas de estados, canónicos, motivos y modos; `transicionValida`, `siguientesEstados`, `puedeAsignarse`, `puedeEntregarse`, `admiteNovedad`, `canonicoDeEstado`, `momentoAvisoDeEstado` |
| `contraentrega.ts` | `contraentregaDePedidoWeb`, `esCodigoEntregaValido`, `MEDIOS_COBRO_CONTRAENTREGA`, `MAX_INTENTOS_CODIGO` |
| `cotizacion.ts` | Tipos `CotizacionEnvio`, `DireccionCotizacion`; `normalizarBarrio`, `normalizarCodigoDane`, `direccionParaCotizar`, `leerCotizacion`, `cotizacionPermiteDomicilio` |
| `zonas.ts` | Tipos de zona, ubicación y regla; `validarZona`, `prepararUbicacion` |
| `cuadre.ts` | Tipos `Cuadre`, `LineaCuadre`; `diferenciaLinea`, `lineaRequiereMotivo`, `montoLineaValido`, `totalesCuadre`, `puedeCerrarCuadre` |
| `tokenSeguimiento.server.ts` | Token y URL de rastreo (solo servidor) |

Servicios en `src/lib/services/` (reciben el cliente Supabase: navegador o sesión del servidor;
nunca service role, salvo el checkout de la tienda):

| Servicio | Funciones |
| --- | --- |
| `deliveryIntegrationService.ts` (corregido) | `createShipmentFromWebOrder` (modo, flete, contraentrega, evento canónico) · `assignVehicleAndDriver(id, vehiculo\|null, domiciliario, fecha?)` · `changeStatus` · `markAsPickedUp(id, ubicación?)` · `markAsDelivered(id, prueba, {codigo, cobro})` · `registerFailedAttempt(id, {reasonCode, …})` · `createShipmentFromPOSSale` (RPC; mismos parámetros que ya manda `CheckoutDialog`, más `municipio_dane/barrio/codigo_postal/lat/lng` opcionales) · `getAvailableDrivers` (incluye externos) · `getDriverForUser(userId, org?)` · `getAllShipmentsForDriver` (por `driver_id`) · `updateShipmentStatusByDriver` · `EnvioError` |
| `logistica/zonasEnvioService.ts` | `listarZonas`, `obtenerZona`, `crearZona`, `actualizarZona`, `eliminarZona`, `agregarUbicaciones`, `eliminarUbicacion`, `listarReglas`, `crearRegla`, `actualizarRegla`, `eliminarRegla` |
| `logistica/cotizacionEnvioService.ts` | `cotizarEnvio(client, {organizationId, branchId, direccion, canal, subtotal, opciones})` |
| `logistica/cuadresDomiciliarioService.ts` | `abrirCuadre`, `recibirLinea`, `cerrarCuadre`, `anularCuadre`, `listarCuadres`, `obtenerCuadre`, `pendientesPorCuadrar`, `codigoErrorCuadre` |
| `webOrderConfirmationService.ts` | nuevo público `facturaParaCobroEnCaja(order)` (envuelve el privado de «Cobrar») |

## Qué usará cada pantalla

| Pantalla | Lee | Escribe |
| --- | --- | --- |
| **Por despachar** | `shipments` (status en `pending, ready_for_pickup, assigned, failed_attempt`; `fulfillment_mode = 'own'`), `delivery_code_required`, `cod_amount`, `exception_reason` | `changeStatus(…'ready_for_pickup')`, `assignVehicleAndDriver` |
| **Detalle del envío** | `shipments` + `transport_events` (canónico y `reason_code`) + `delivery_attempts` + `proof_of_delivery` + `siguientesEstados` | `changeStatus`, `registerFailedAttempt`, `logistica_codigo_entrega` (admin) |
| **Asignar** | `getAvailableDrivers` (con externos), `getAvailableVehicles` (opcional) | `assignVehicleAndDriver(id, null, domiciliario)` — **quitar la obligación de vehículo** en `AssignDeliveryDialog` |
| **Mis envíos** | `getDriverForUser(user.id, org)`, `getAllShipmentsForDriver` | `markAsPickedUp`, `markAsDelivered` (código + cobro en contraentrega), `registerFailedAttempt`. La página aún filtra por `metadata.driver_id` (sigue funcionando por el espejo): pasar a `driver_id` |
| **Cuadres** | `listarCuadres`, `obtenerCuadre`, `pendientesPorCuadrar` | `abrirCuadre`, `recibirLinea`, `cerrarCuadre`, `anularCuadre` |
| **Zonas y tarifas** | `listarZonas`, `listarReglas` | CRUD de `zonasEnvioService` (validación en `zonas.ts`) |
| **Seguimiento** | `transport_events` por `canonical_status` y `reason_code` | — |
| **Rastreo público** (tienda) | `logistica_rastreo_publico` con service role tras validar el token | — |
| **Checkout / POS** | `cotizarEnvio` (canal `web` o `pos`); el servidor recalcula al guardar | POS: `createShipmentFromPOSSale` con barrio/municipio para que el flete salga de la zona |

Avisos al cliente: las RPC devuelven `aviso` (`en_camino`, `entregado`, `novedad`); quien llama
dispara el envío con `avisosClienteService` y el enlace de `urlRastreo`.

## Verificación (2026-11-23)

- Pruebas en seco de las cinco migraciones (flujo completo: crear domiciliario externo →
  contraentrega con código → asignar sin vehículo → en camino → novedad → reintento → código
  errado (4 intentos restantes) → cobro requerido → entregado → cuadre con faltante → cierre con
  motivo y responsable → `pending_accountant`; cotización por barrio, municipio, polígono y tarifa
  general; envío POS idempotente con contraentrega = saldo y código emitido; rastreo público).
- `get_advisors`: seguridad, solo los 12 avisos esperados `authenticated_security_definer_function_executable`
  de las RPC públicas nuevas (misma categoría que las 762 RPC existentes; es intencional: las llama
  la sesión). Rendimiento: solo `unused_index` de los índices nuevos (cubren FK; aún sin tráfico).
  Desapareció el `auth_rls_initplan` de `driver_credentials`.
- Jest: 7 suites, 92+ pruebas (`src/lib/logistica/__tests__`, `src/__tests__/logistica`,
  `src/lib/services/__tests__/deliveryIntegration*`). Guardarraíles: ver informe de la entrega.

## TODO

1. **Contador — faltantes del domiciliario.** Hoy quedan en `courier_settlements` con
   `accounting_status = 'pending_accountant'`, motivo y responsable, **sin asiento**. Definir:
   cuenta (¿CxC al domiciliario, 1365/1330?, gasto, castigo), tercero (domiciliario externo sin
   NIT en terceros) y si se descuenta de su pago. Lo cobrado sí queda en la factura; el saldo que
   falta sigue como cartera del cliente hasta esa decisión.
2. **Contador — transferencia y QR en el cuadre.** El pedido aprobado decía «datáfono y
   transferencia a 138020xx». Para no duplicar la regla del Contador (2026-11-21: 138020xx es por
   **procesador**), se usa `fn_cuenta_cobro`: datáfono → 13802001; transferencia y QR → la cuenta
   bancaria que ya les asigna. Si la transferencia del domiciliario (Nequi/Bre-B a la cuenta del
   negocio) debe ir a un 138020xx propio, el Contador define el auxiliar y se cambia en
   `fn_cuenta_procesador_cobro`, no aquí.
3. **Contador — regla `delivered_cod`.** `fn_auto_journal_shipment` asienta `delivered_cod` al
   entregar con `cod_amount > 0` **si** existe esa regla en `accounting_rules` (hoy 0
   organizaciones la tienen). Con el cuadre, el cobro ya se asienta por `payments`: si alguien
   crea esa regla habrá doble asiento. Recomendación: no crearla.
4. **Pantallas** (Figma primero): todas las de la tabla anterior; `AssignDeliveryDialog` aún exige
   vehículo; `Mis envíos` aún escribe `shipments` directo para administradores sin credencial y
   filtra por `metadata`.
5. **Aviso «novedad»**: la base ya lo acepta; falta sumarlo a `MOMENTOS_AVISO`
   (`src/lib/pos/pedidosWeb/avisosCliente.ts`) con su texto y su interruptor en 4 idiomas
   (pantalla de avisos → Figma).
6. **Checkout de la tienda** (`goadmin-websites`): llamar `logistica_cotizar_envio` en el servidor
   y guardar ese precio en `web_orders.delivery_fee`; hoy no se verificó si `/api/orders` acepta
   el flete del navegador. Y usar `logistica_rastreo_publico` en `/pedido/<n>`.
7. **POS**: `CheckoutDialog` aún calcula el flete con `shipping_rates` (0 filas): pasar a
   `cotizarEnvio` y mandar barrio/municipio en `deliveryInfo`.
8. **Permisos**: no existen códigos de logística en `permissions`. Hoy: zonas y reglas =
   `organization_settings`; cuadres = `pos.create`; ver código de entrega = administradores.
   Si el dueño quiere roles finos (`logistica.despachar`, `logistica.cuadres`), se crean y se
   cambian las guardas.

### WhatsApp: por qué fallan los avisos (diagnóstico, sin arreglar canales)

En `web_order_notices` hay 434 avisos WhatsApp `failed` con detalle **`NO_CHANNEL`** (del
2026-11-04 al 2026-11-23, 6 organizaciones) y 32 `no_data` con `sin_telefono` (1 organización,
hasta el 2026-11-11). `avisosClienteService` envía por `sendWhatsApp` del CRM →
`resolveChannel` (`src/lib/services/crm/whatsapp/channelService.ts`) → como la organización no
tiene canal de WhatsApp activo lanza `WhatsAppError('NO_CHANNEL')`.

**Causa:** en el proyecto `taqjemqjtumhwptchcxk` la tabla `channels` no tiene **ningún** canal
`whatsapp` (solo 6 de tipo `website`, creados el 2026-11-04) y `channel_credentials` no tiene
credenciales de WhatsApp. Los canales y sus credenciales no pasaron al proyecto nuevo cuando
reemplazó al anterior (2026-11-03); el primer aviso fallido es del día siguiente. El correo sí
sale porque no depende de `channels`. Arreglo (fuera de esta fase): reconectar el WhatsApp de cada
organización (o definir un canal de la plataforma) en Integraciones; los avisos vuelven a salir
sin cambiar código.

## Endurecimiento antes de subir (2026-11-23)

Tres migraciones más, con su reversión en `supabase/rollbacks/`:

| Versión | Nombre | Qué hace |
| --- | --- | --- |
| 20261123165515 | `logistica_f1_bucket_pod_privado` | `shipment-pod` pasa a **privado**. Subir y leer: miembro activo de la organización de la carpeta **y** que vea el envío de la segunda carpeta (RLS de `shipments`) |
| 20261123165617 | `logistica_f1_rls_domiciliarios_envios` | `fn_logistica_gestiona` / `fn_logistica_ve_todo`; RLS de domiciliarios, envíos, eventos y cuadres (tabla de arriba); `fn_logistica_envio_bloquear` rechaza `ENVIO_AJENO`; asignar exige «ve todo» y respeta «¿Cobra contraentrega?» (`DOMICILIARIO_NO_COBRA`); venta POS con domiciliario que no cobra crea el envío sin asignar (`asignacion`); `logistica_fin_jornada` |
| 20261123165634 | `logistica_f1_cuadre_recibir_y_cerrar` | `logistica_cuadre_recibir_y_cerrar(p_settlement_id, p_recibos jsonb, p_motivo, p_responsable, p_detalle_responsable, p_notas)`: varias líneas y el cierre en una transacción; si el cuadre ya está cerrado devuelve su resumen con `ya_cerrado` (idempotente); líneas ya recibidas se omiten. Error nuevo `RECIBOS_INVALIDOS` |

- **Fotos y firmas**: lo guardado en `proof_of_delivery.photo_urls / signature_url` y
  `delivery_attempts.photo_urls` es la **ruta** en el bucket (`subirImagenEnvio`). Para verlas, las
  pantallas usan `useEvidenciasEnvio`, que llama `GET /api/logistica/envios/[id]/evidencias`: el
  servidor lee las rutas de la base con la sesión y firma solo las de `{organización}/{envío}/`
  (`src/lib/logistica/evidencias.ts`), enlaces de 5 minutos. El rastreo público no muestra fotos.
- **«Ve todo»** = miembro activo que no es domiciliario en la organización, o que lo es pero tiene
  `fn_logistica_gestiona`. Si se crean códigos `logistica.*` (TODO 8), se cambia solo esa función;
  la ruta de domiciliarios ya la consulta (`permisosDomiciliarios.server.ts`).
- **Seguimiento**: «sin movimiento» usa `horasSinMovimiento()` con los ajustes de la organización
  (por defecto 2 h propio, 24 h transportadora), ya no 24 h fijas.
- **Aviso «novedad»**: `avisarCliente(envio, 'novedad')` manda `{ momento: 'novedad' }` a
  `/api/web-orders/[id]/aviso-estado`; la ruta solo lo envía si el envío está en `failed_attempt`.
  Lo llaman el detalle del envío, la app del domiciliario y «Avisar» de Seguimiento.
