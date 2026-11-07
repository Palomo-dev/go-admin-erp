# Ronda 4 de Finanzas e Integraciones en código

Fecha: 2026-11-07. Orden del dueño: construir lo que sigue después de la ronda 3: el tributario, las
consignaciones, el dinero de terceros y los anticipos a proveedores, más Integraciones según el diseño
aprobado.

## Reglas comunes (las de la ronda 3, más estas)

- Mismas reglas de `docs/implementacion/FINANZAS-R3-PLAN.md`:
  - `main` compartido, sin commit ni push (los hace el coordinador);
  - kit primero y 4 idiomas;
  - la organización sale de la sesión y los permisos se resuelven en el servidor;
  - **una pieza para varias páginas**;
  - limpieza de navegación;
  - nada que hoy funciona deja de funcionar.
- **Base de datos:** las tablas y funciones nuevas se escriben en `supabase/migrations/` con su reversión,
  **sin aplicar**. El dueño las aprueba y el coordinador las aplica. Mientras no se apliquen, cada pantalla
  dice «pendiente de activar», nunca muestra cero.
- **Contabilidad:**
  - nada de asientos ni saldos escritos a mano;
  - las reglas contables y las RPC transaccionales son las existentes;
  - no se publica, revierte ni cierra nada real para probar.
- **Figma:**
  - busca primero la captura en `docs/design/figma/`;
  - si no está, pide solo los frames que construyes, de uno en uno, con `get_screenshot` sin base64, y
    descárgalos con curl a `docs/design/figma/88-<frente>-<nombre>.png`;
  - el cupo de Figma se comparte entre los tres frentes.

## Frentes

| Frente | Alcance | Figma (página «07 Finanzas» salvo que se diga otra) |
|---|---|---|
| R4-A · Tributario | Perfil tributario de la empresa (responsabilidades, régimen, autorretenedor, gran contribuyente, ICA por municipio). Centro tributario (calendario de vencimientos y obligaciones del período). Borrador del formulario 300 de IVA (renglones desde los libros, sin presentar ante la DIAN). Certificados de retención (generar y descargar por tercero y período) | `2335:136222`, `2335:136794`, `2335:137440`, `2335:138003` |
| R4-B · Terceros y anticipos | Consignaciones: mercancía de terceros en consignación (lista, nueva nota, liquidación). Dinero de terceros: recaudos para terceros que no son ingreso propio. Anticipos a proveedores: registrar, aplicar a la factura de compra, saldo. Si el saldo a favor de clientes ya resuelve algo, se reutiliza | `2335:138595`, `2335:139248`, `2335:139356`, `2335:139939`, `2335:140495` |
| INT · Integraciones | Sección 8 de la página «10 Configuración» (`2364:15823`), capturas `docs/design/figma/85-integraciones-*.png`. Detalle en `docs/design/INTEGRACIONES-CONEXIONES-ANALISIS-2026-11-07.md` | ver abajo |

### Frente INT: lo que no se puede romper

El dueño tiene pasarelas integradas y funcionando. Por eso:

1. **Las credenciales que existen no se tocan.** Las pasarelas, la tienda, el POS y los webhooks siguen
   leyéndolas igual. Nada de mudar secretos a la bóveda en esta ronda.
2. **Las conexiones nuevas** se guardan por route handler y en la bóveda (el patrón de `/conexiones/logistica`).
   Cada lector de credenciales debe poder leer las dos formas: la bóveda y lo de hoy.
3. **Antes de reemplazar** el asistente o el detalle de conexión, se escriben pruebas de caracterización de
   cómo se lee una conexión de Wompi existente. Esas pruebas deben seguir pasando.
4. **Estados honestos:**
   - un proveedor sin conector real se muestra «En construcción»;
   - «Probar» solo dice «Correcta» si de verdad llamó al proveedor;
   - la URL de webhook que se muestra debe existir.
5. **Errores conocidos que se corrigen en esta ronda** (`INTEGRACIONES-CONEXIONES-ANALISIS-2026-11-07.md`):
   - la URL de webhook que no existe;
   - «Probar» que finge éxito;
   - Booking y Expedia escribiendo `value_encrypted`, una columna que no existe;
   - las llaves de API generadas con `Math.random`;
   - el asistente que sobrescribe todo `settings` del método de pago.

   Si alguno exige migración, se escribe sin aplicar.
6. **Conectores con el proveedor real** (Booking.com como proveedor de conectividad, Rappi y Uber Eats para
   aliados, Meta, TikTok y Google Ads por OAuth): se construye el flujo de pantallas sobre lo que ya existe en
   `src/app/api/integrations/**`. Donde falte la cuenta de socio o la API del proveedor, la pantalla lo dice;
   no se simula.

## Estado

El coordinador añade aquí el resultado de cada frente.

### Frente R4-A · Tributario (2026-11-07)

Sin commit. Capturas de Figma descargadas: `docs/design/figma/88-tributario-{perfil,centro,iva-300,certificados}.png`.
Namespace i18n `finanzasTributarioR4` (239 claves × 4, fusionado con el script) registrado en `traduccionesModulos.test.ts`.
Ninguna pantalla se recorrió en el navegador con sesión real.

**Lo que ya existía y se reutiliza (verificado por MCP):** `organizations.nit/dv/fiscal_responsibilities`,
`dian_fiscal_responsibilities`, `municipalities`; retenciones de compras (`invoice_purchase_withholdings`,
`fn_reporte_retenciones_practicadas`), certificados (`withholding_certificates`, serie CR, `fn_certificado_retenciones_expedir`,
`POST /api/proveedores/[id]/certificado-retenciones`, motor de documentos y `CertificadoRetencionesDialog`). No se usó
`fn_reporte_impuestos` para el borrador: lee facturas, no libros, y su desglose por código repite el subtotal de la factura.

**Pantallas (Finanzas › grupo «Tributario» en `catalog.ts`; las cuatro son páginas de trabajo):**
- Centro tributario `/app/finanzas/tributario` (`centro/CentroTributarioPage.tsx`): obligaciones del último periodo cerrado
  al mes de corte (`?corte=`), derivadas del perfil vigente; vencimiento del calendario cargado o «Calendario {año} sin
  cargar» / «Falta el NIT» / «Confirmar con el municipio» (ICA); valor del IVA desde el borrador y de la retención desde el
  reporte; «Ver borrador» (Finanzas) o «Ver reporte» (Reportes). Excel (CSV).
- Perfil tributario `/tributario/perfil` (`perfil/PerfilTributarioPage.tsx`, `VigenciaDialogo.tsx`): vigencias con régimen,
  responsabilidades del RUT, agente de retención, INC, periodicidad del IVA e ICA por municipio; banda «Faltan datos».
  Figma lo ubica en Configuración › Organización; queda en Finanzas por la regla del encargo (página de trabajo tributaria).
- Borrador de IVA `/tributario/iva?desde=&hasta=` (`iva/BorradorIvaPage.tsx`, fuera del menú: se abre desde el Centro):
  renglones por tarifa desde los asientos (2408), cada uno abre sus asientos; «Revisar» con el valor de los libros cuando
  no se puede repartir. Excel (CSV).
- Certificados de retención `/tributario/certificados` (`certificados/CertificadosRetencionPage.tsx`): por tercero y
  periodo (año o bimestre), retefuente · reteIVA · reteICA, estado Expedido · Cambió · Sin expedir · Falta tercero;
  vista previa, expedición y PDF con el diálogo y el motor existentes; «Expedir certificados» en lote con la ruta existente.
- Informes que siguen solo en Reportes (enlazados): Impuestos y Retenciones practicadas.

**Servidor:** `src/lib/services/tributario/tributario.server.ts` y rutas `GET/POST /api/finanzas/tributario/perfil`,
`GET …/centro`, `…/iva`, `…/certificados`, `…/municipios` (`withOrg` + `readOrgBody`; `finance.view`, y `finance.approve`
para guardar). Lógica sin React en `src/lib/finanzas/tributario/` (`periodos`, `perfil`, `obligaciones`, `borradorIva`,
`certificados`).

**Migraciones propuestas, SIN aplicar (cada una con rollback):**
- `20261108100000_tributario_perfil.sql`: tablas `organization_tax_profiles` (vigencia, régimen, responsabilidades,
  agente de retención, INC, periodicidad del IVA) y `organization_tax_profile_ica`; RLS de lectura por pertenencia, sin
  escritura directa; `fn_perfil_tributario_guardar` (definer, pertenencia + `finance.approve`/`admin.full_access`, cierra la
  vigencia anterior, sincroniza `organizations.fiscal_responsibilities` si es la de hoy). Sin anon.
- `20261108100500_tributario_calendario.sql`: `tax_calendar_dates` (año, obligación, periodo, cuota, dígitos del NIT,
  fecha, norma), dato de plataforma: lectura `authenticated`, escritura solo `service_role`. Sin datos: el calendario
  oficial lo carga la plataforma con su decreto.
- `20261108101000_tributario_borrador_iva.sql`: `fn_tributario_borrador_iva` (definer, `finance.view`, solo lectura).
  Probada en seco sobre la org 333 (sep–nov 2026): 106 documentos, IVA generado de libros 638.346; 73 ventas POS caen en
  «tarifa sin identificar» porque sus líneas guardan IVA con tarifa 0, y lo muestran como «Revisar».

**Pendiente de activar hasta aplicar:** perfil (no se puede guardar), Centro (sin filas), vencimientos (todos «pendiente»),
borrador del IVA y su valor en el Centro. Los certificados funcionan ya (no necesitan migración).

**Pendiente:** PDF del borrador del IVA (falta el tipo en el motor de documentos; hoy solo CSV); carga del calendario
DIAN desde la consola de la plataforma; borradores de 350, ICA, INC, renta y exógena (quedan «Por confirmar»);
autorretención; persona natural en renta; la columna «Base» por tercero del Figma de certificados (el reporte no la da
por tercero; está en el diálogo); POS: guardar la tarifa por línea para que el IVA de caja no caiga en «Revisar».

**Verificación R4-A:** jest `src/lib/finanzas/tributario` + `src/lib/services/tributario`: 30 de 30. Guardrails, navegación
e i18n: 1.199 de 1.201 (los 2 fallos son los preexistentes de la regla 36 del CRM y del Paquete E). `tsc` completo con
14 GB: 38 errores, ninguno del tributario (33 de `.next-desktop`, `useConfiguracionState.ts` de la línea base y 4 de
`integraciones/conexiones-v2` y `desarrolladores.server.ts`, del frente INT en curso). `eslint` limpio en lo tocado.

### Frente R4-B · Consignaciones, dinero de terceros y anticipos a proveedores (2026-11-07)

Sin commit. Namespace i18n `finanzasTercerosR4` (`anticipos`, `dinero`, `consignaciones`; 340 claves × 4), registrado en
`traduccionesModulos.test.ts`. Capturas `docs/design/figma/88-terceros-*.png` (5 frames). Ninguna pantalla se recorrió en el
navegador con sesión real; no se movió dinero, kardex ni asientos reales.

**Anticipos a proveedores** (`/app/finanzas/anticipos-proveedores`, menú Tesorería tras Cuentas por pagar): espejo del saldo a
favor de clientes. **Los diálogos son los mismos** (`saldos-a-favor/RegistrarAnticipoDialog`, `AplicarSaldoDialog`,
`DevolverSaldoDialog`) con un adaptador (`adaptadorSaldos.ts`: tercero, textos y servicio; el del cliente es el de siempre);
anular con `DialogoMotivo`. Rutas `/api/anticipos-proveedor/**` (`withOrg`, `finance.create` / `finance.void`). No bastaba con
«habilitar la dirección proveedor»: `credit_notes.customer_id` es NOT NULL y `fn_registrar_pago` rechaza `anticipo_solo_cobro`.

**Dinero de terceros** (`/app/finanzas/tesoreria/dinero-de-terceros`): sin tablas nuevas. Propinas desde `tips`; recaudos desde
el auxiliar por tercero de la cuenta de recaudos (`fn_auxiliar_tercero`, 2815 si la clave `recaudos_terceros` no está
configurada). Registrar y «Liquidar» abren el formulario ÚNICO de Movimientos (prop nueva `preseleccion`: categoría de recaudos y
tercero obligatorio); si falta la categoría se crea con la misma alta de Categorías. Aviso «Falta definir la cuenta» mientras la
propina vaya a gasto (5105): la decide el Contador.

**Consignaciones** (`/app/finanzas/consignaciones` y `/[id]`, menú Documentos; el Figma la pone bajo Inventario en las migas):
según el Figma aprobado es mercancía PROPIA entregada a un consignatario (cliente). Lista con KPIs, nueva nota y liquidación
«Facturar y cerrar» con la factura de venta de siempre (`guardarFactura` + `emitirFactura` + envío a la DIAN existente).

**Migraciones propuestas, SIN aplicar** (con rollback):
- `20261108120000_anticipos_proveedores.sql`: `supplier_advances` y `supplier_advance_applications` (RLS de lectura por
  pertenencia, sin escritura directa, sin anon); `fn_anticipo_proveedor_crear|aplicar|devolver|anular` (definer, guarda de
  organización, sucursal y permiso, idempotentes); reemplaza con el mismo contrato `fn_invoice_purchase_paid` y
  `fn_cxp_recalcular` (suman lo aplicado; hoy 0 filas) y `fn_trg_tercero_linea_asiento` (tercero = proveedor del anticipo).
  Asientos: crear D anticipos (clave `anticipos_proveedores`, respaldo 1330) / C caja o banco; aplicar D CxP (regla
  `purchase_payment`) / C anticipos; devolver D caja o banco / C anticipos; anular = contra-asiento.
- `20261108121000_consignaciones.sql`: cuatro tablas `consignment_*`; `fn_consignacion_entregar` (kardex por `fn_inv_int_mover`
  como `transfer_out`, sin tocar el CHECK de `stock_movements`; asiento D mercancía en consignación (clave
  `inventario_consignacion`, respaldo 1465) / C inventario), `fn_consignacion_liquidar` (lo vendido y lo devuelto vuelven como
  `transfer_in`; D inventario / C consignación) y `fn_consignacion_cerrar` (comisión = saldo a favor del consignatario con débito
  a comisiones, aplicado a la factura con `fn_apply_customer_credit`). Ingreso, IVA, costo y cartera: los de la factura.

**Pendiente de activar hasta aplicar:** anticipos a proveedores y consignaciones completas (lista con aviso, botones
deshabilitados, escrituras 501). Dinero de terceros funciona ya.

**Pendiente:** prueba en seco de las dos migraciones (escritas, no ejecutadas); cuentas por confirmar con el Contador
(1465 para mercancía en consignación, 2815 para recaudos, pasivo de propinas); anticipos en el estado de cuenta y el historial
de la CxP; consignación de productos con seriales o variantes padre; anular una nota entregada; consignación recibida (mercancía
de un tercero en tu poder); PDF de la liquidación; acceso a Anticipos desde la ficha de la CxP. Hallazgo: `fn_saldo_favor_anular`
llama a `fn_anular_pago`, que no admite `source = 'customer_credit'`: anular un anticipo de cliente responde siempre
`pago_no_anulable` (no se tocó).

**Verificación R4-B:** jest `src/__tests__/finanzas/tercerosR4`, `saldosAFavor`, `tesoreriaCompartido` y
`src/lib/navigation/__tests__`: 253 de 253; i18n de módulos 900 de 900; guardrails 206 de 208 (los 2 preexistentes: regla 36
del CRM y Paquete E). `tsc` completo con 14 GB: 35 errores, ninguno de R4-B
(33 de `.next-desktop`, `useConfiguracionState.ts` de la línea base y `desarrolladores.server.ts` del frente INT). `eslint`
limpio en lo tocado.

### Frente INT · Integraciones › Conexiones (2026-11-07)

Sin commit. Namespace i18n `integracionesConexiones` (810 claves × 4, fusionado con el script) registrado en
`traduccionesModulos.test.ts`. Ninguna pantalla se recorrió en el navegador con sesión real.

**Lo que no se rompió y cómo se garantiza.** Pruebas de caracterización escritas ANTES de reemplazar el asistente y
el detalle (`src/lib/services/integrations/conexiones/__tests__/caracterizacionWompi.test.ts` y
`caracterizacionWebhookWompi.test.ts`): `wompiService.getCredentials` devuelve las 4 llaves tal cual de `secret_ref`
sin llamar a la bóveda; `resolverConexionDeCobro` elige sucursal → vinculada al método → única general, nunca la de
otra sucursal ni de otra organización (409/412 iguales); el webhook de Wompi identifica la conexión por el
`events_secret` en claro y responde 401 sin registrar si no valida. Los lectores de Wompi (servicio y webhook) solo
añaden una rama: un `secret_ref` con forma de uuid se resuelve con `fn_get_provider_secret` (`secretosConexion.ts`);
las 16 filas actuales no tienen esa forma (verificado por MCP). Ningún secreto existente se mudó.

**Hallazgo que cambia el plan:** la tienda web (repositorio goadmin-websites, `app/api/checkout/init` y
`app/api/webhooks/*`) lee `secret_ref` en claro. Guardar pasarelas nuevas en la bóveda la rompería. Por eso las
pasarelas (Wompi, Mercado Pago, PayU, Stripe, PayPal) y SendGrid se guardan «como hoy» pero SIEMPRE desde el servidor
(route handler + service role tras `withOrg`), y solo tras una prueba real correcta. Van a la bóveda: Booking/Expedia
(todos sus lectores están aquí y ya son duales) y logística (ya lo estaba). Mudar pasarelas exige primero un lector
dual en goadmin-websites.

**Pantallas:** `conexiones/page.tsx` → `conexiones-v2/ConexionesPagina.tsx` (pestañas Catálogo, Mis conexiones,
Actividad, Desarrolladores; `?tab=`, `?conectar=`, avisos de los callbacks OAuth); catálogo de 30 servicios desde
`integration_providers`/`integration_connectors` + servicios de GO Admin (`catalogoConexiones.ts`); logos SVG en
`conexiones-v2/logos/`; asistentes en `conexiones-v2/asistentes/` (llaves, OTA, iCal, domicilios, OAuth); detalle
`conexiones/[id]/page.tsx`. Rutas nuevas: `/api/integrations/conexiones` (+ `llaves`, `[id]`, `[id]/probar`,
`[id]/uso`, `[id]/estado`, `eventos`, `ical`, `ota`, `ota/habitaciones`) y `/api/integrations/desarrolladores/{llaves,
llaves/[id], webhooks, webhooks/[id]/probar}`. Menú: Eventos, Trabajos, Mapeos, Llaves de API y Webhooks quedan
`enMenu: false` (las páginas siguen vivas).

**Fallos corregidos:** URL de webhook inexistente (`StepSettings.tsx`, ahora solo rutas reales: `urlsWebhook.ts`,
con prueba que comprueba cada `route.ts`); «Probar» que fingía (`integrationsService.healthCheck` llama a la ruta,
que prueba contra el proveedor y nunca cambia `status`: antes Wompi pasaba a `error` ante un fallo de red y el POS
dejaba de encontrarla); prueba de webhook saliente simulada (envío real firmado HMAC, HTTPS público, anti-SSRF);
Booking/Expedia con `value_encrypted`, `is_active` y `config` inexistentes (bóveda con propósitos admitidos, ids en
`settings`); llaves API con `Math.random` (servidor, `crypto.randomBytes`, solo SHA-256 y `goak_··xxxx`; secreto de
webhook con Web Crypto); `settings` del método de pago sobrescrito (`nueva/page.tsx` y `deleteConnection` fusionan o
solo desenlazan) y Stripe enlazado a `card` (ahora `stripe`); `?return=` ignorado; Booking/Expedia del formulario
viejo redirigen al asistente nuevo. Código muerto retirado (sin importadores): `PaymentGatewaysSection`,
`PaymentMethodGatewayConfig`, `metodos-pago/gateways/*` y en `integraciones/` `StatsCards`, `TopProblems`,
`QuickActions`, `RecentConnections`, `RecentEvents`, `IntegrationConnectionCard`, `ChatChannelsSection` e `index.ts`.

**Conectores reales vs en construcción:** reales: Wompi, Mercado Pago, PayU, Stripe, PayPal, SendGrid (prueba real
por proveedor), iCal de Airbnb, Booking, Expedia, Tripadvisor y Google Vacation Rentals, OAuth de Meta/TikTok/Google
Ads (si el servidor tiene la app configurada; si no, «En construcción»), logística según su registro de adaptadores.
En construcción: Rappi, Uber Eats e iFood (sin conector en la base ni cuenta de aliado; el asistente lo dice y no
guarda); modo API de Booking/Expedia (sin cuenta de proveedor de conectividad responde 409 `CUENTA_SOCIO`); Bold
sigue en el formulario avanzado (datáfonos por sucursal); WhatsApp/Instagram/Facebook enlazan a Chat › Canales.

**Migración propuesta, SIN aplicar:** `20261108090000_integraciones_conexiones_int.sql` (+ rollback): el CHECK de
`integration_credentials.purpose` pasa de 11 valores a forma snake_case (hoy impide guardar Stripe, PayPal, PayU,
Bold, SendGrid y logística; 0 filas afectadas, probada en `begin … rollback`); `webhook_endpoints` gana
`last_delivery_at`, `last_response_status`, `consecutive_failures`. Hasta aplicarla: esas pasarelas responden
«pendiente de activar» y «Último envío» muestra lo mismo. Sin funciones nuevas ni grants a anon.

**Pendiente:** lector dual en goadmin-websites para poder mudar pasarelas a la bóveda; RLS de
`integration_credentials`/`webhook_endpoints.secret`/`integration_webhooks` (análisis §Riesgos 1-3); «Reintentar
trabajo» sin proceso; pasos de Meta 85-42/43 (siguen en las rutas `setup`); listar habitaciones de la OTA (sin
cuenta de socio se escriben a mano); la importación CSV y el borrado directo de la lista vieja no pasaron a la nueva;
los componentes viejos de `integraciones/conexiones/` siguen exportados por el barril que usa `nueva/page.tsx`.

**Verificación INT:** jest `src/lib/services/integrations/conexiones` 66/66 (caracterización incluida) y
`src/components/integraciones` + `src/lib/navigation` en verde; guardrails: 2 fallos preexistentes (regla 36 del CRM y
Paquete E), ninguno de este frente. `tsc` completo con 14 GB: ningún error en archivos del frente (resto: 33 de
`.next-desktop`, `useConfiguracionState.ts` y 6 de la prueba de R4-B).
