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

#### Frente INT · cierre de pendientes (2026-11-07, segunda vuelta)

Sin commit en ninguno de los dos repositorios. La caracterización de Wompi sigue pasando (jest de
`src/lib/services/integrations/conexiones`: 10 suites en verde con las de la UI de Conexiones).

1. **Lector dual en la tienda (goadmin-websites).** La copia local estaba 502 commits detrás de
   `origin/main` y sin cambios: se avanzó con `git merge --ff-only` antes de tocarla. Nuevo
   `lib/payments/secretosConexion.ts` (`resolverCredenciales`, `valorDeCredencial`): un valor en claro
   se devuelve igual y sin RPC; un uuid se lee con `fn_get_provider_secret`; un uuid sin valor queda
   vacío (nunca se cobra ni se firma con el uuid). Lo usan `app/api/checkout/init`, los webhooks
   de Bold, Mercado Pago, Meta, PayPal, PayU y Stripe, `app/api/meta/send-event`,
   `lib/meta/send-capi-event` y `lib/google-ads/upload-conversion` (Wompi ya era dual en
   `wompi-firma.ts`). Se retiró la llamada a `get_decrypted_secret`, que no existe en la base
   (siempre caía al valor crudo: el resultado de hoy no cambia). Prueba: `npm run verify:secretos`
   (6 casos). `tsc` de la tienda: solo los 2 errores de módulos sin instalar que ya estaban.
   No se mudó ningún secreto.
2. **Secretos solo en el servidor.** Migración SIN aplicar `20261108093000_integraciones_secretos_solo_servidor.sql`
   (+ rollback; aplicar DESPUÉS de `20261108090000`): `authenticated` pierde el SELECT de
   `integration_credentials.secret_ref`, `webhook_endpoints.secret` e `integration_webhooks.secret_ref`
   (SELECT por columnas sin ellas; INSERT/UPDATE/DELETE se conservan), `anon` pierde todo en esas
   tablas, y la RLS de `integration_webhooks` deja de decidir por nombre de rol (rol 1/2, super admin
   o `admin.full_access`). Probada en `begin … rollback`. Antes de escribirla se revisaron con grep
   los dos repositorios: la tienda lee con service role; en el ERP se ajustaron los lectores del
   navegador (`integrationsService` sin `select('*')` en esas tablas; `getCredentials`, webhooks y
   endpoints devuelven el secreto vacío; se retiraron `duplicateCredential` y `duplicateWebhook`, sin
   uso y que copiaban secretos), `integracionesDashboardService`, el panel de Tripadvisor (leía un
   `credential_type` que el CHECK no admite: código muerto) y el formulario avanzado (`nueva`): ya no
   precarga secretos; en edición, campos vacíos = conservar las llaves, y si se escribe alguna hay que
   escribirlas todas (antes, con el lector cerrado, habría guardado llaves vacías). «Rotar» una
   credencial sin valor nuevo ya no la vacía. `syncPaymentMethodFromConnection` deja de sobrescribir
   `settings` y de robar un método enlazado a otra conexión.
3. **«Reintentar trabajo».** No existe ejecutor de `integration_jobs` (grep en `src`, Edge Functions y
   `vercel.json`). Se quitaron «Reintentar», «Duplicar» y «Nuevo job» de Trabajos, con un aviso que lo
   dice, y «Reprocesar» del detalle de evento (encolaba un trabajo que nadie corría, con una columna
   `metadata` que `integration_jobs` no tiene). «Probar» de los webhooks de conexión dice que no hay
   envío automático en vez de registrar un evento falso.
4. **Meta 85-42/43** en el asistente nuevo (`asistentes/PasosMeta.tsx`): al volver del OAuth
   existente (el callback ahora redirige con `?conectar=meta&conexion=<id>`) se abren «Activos»
   (portafolio, cuenta publicitaria, catálogo y píxel, existentes o nuevos) y «Qué se envía» (catálogo,
   compras; prospectos del CRM deshabilitado «en construcción»: no existe ese envío). Servidor:
   `conexiones/metaActivos.server.ts` + `GET/POST /api/integrations/conexiones/meta`, sobre los métodos
   existentes de `metaMarketingService` (Graph API real; el token nunca sale del servidor; cada id se
   valida contra lo que Meta devuelve). «Qué se envía» queda en `settings.meta_envios` y lo respetan
   `product-sync`, `catalog-sync` y `send-event` del ERP y `send-capi-event`/`meta/send-event` de la
   tienda (que además filtraban `status = 'active'`, valor que el CHECK no admite: nunca enviaban).
   Corregido `credential_type: 'oauth2'` (inválido) en el guardado de Meta: ninguna credencial de Meta
   llegaba a guardarse. Sus propósitos (`business_id`, `pixel_id`…) necesitan `20261108090000`.
5. **Importar CSV y borrar** en la página nueva: `ImportarCsvDialogo` + `importarCsvLogica.ts` y
   `POST /api/integrations/conexiones/importar` (máx. 200 filas; solo BORRADORES, sin llaves; valida
   conector, sucursal, ambiente y nombres). Los borradores ya se listan en «Mis conexiones».
   `DELETE /api/integrations/conexiones/[id]` con confirmación en el detalle: 409 `EN_USO` si un
   método de pago la usa (el botón queda deshabilitado y explica que hay que desenlazar primero) y
   409 `CON_HISTORIA` si ya tiene cobros QR o guías (se ofrece «Desconectar»).
6. **DNS rebinding.** El envío real de webhooks salientes usa `https.request` con un `lookup` propio
   (`crearLookupSeguro`) que resuelve una vez y solo entrega IP públicas: la conexión va a la IP
   validada, así que un DNS que cambie entre la validación y el envío no la lleva a una IP interna.

**Pendiente:** aplicar `20261108090000` y luego `20261108093000`; secretos huérfanos en Vault al
borrar una conexión de la bóveda (no hay RPC de borrado: hoy solo OTA y logística viven ahí); filtro
de productos por categoría o etiqueta para Meta; envío de prospectos del CRM a Meta; ejecutor de
`integration_jobs`; mudar las pasarelas a la bóveda (la tienda ya lee las dos formas).

#### Frente INT · credenciales visibles (decisión del dueño, 2026-11-07)

El dueño decidió no cifrar por ahora las llaves de las pasarelas y poder VER las credenciales.
- Nada se mueve a la bóveda: las pasarelas siguen guardando en claro (como ya hacía el frente).
- La propuesta que cerraba la lectura al navegador NO se aplicará: quedó como
  `supabase/migrations/PROPUESTA_NO_APLICAR_20261108093000_integraciones_secretos_solo_servidor.sql.txt`
  (y su reversión en `supabase/rollbacks/` con el mismo nombre), con la línea «No aplicar».
- Lo independiente se separó en `20261108094000_integraciones_anon_y_rls_webhooks.sql` (+ rollback),
  SIN aplicar y probada en `begin … rollback`. No quita ninguna lectura a usuarios autenticados:
  - `anon` (clave pública, sin sesión) pierde los privilegios de tabla que hoy tiene sobre
    `webhook_endpoints` e `integration_webhooks` (incluido TRUNCATE, que no pasa por RLS). Ningún
    lector usa `anon`;
  - la RLS de `integration_webhooks` deja de decidir por nombre de rol (regla 6) y usa la misma
    regla que `integration_credentials`: rol 1/2, super admin o `admin.full_access`.
- «Ver» / «Ocultar» / «Copiar» en el detalle de conexión y en el asistente de «Reemplazar llave»
  (`conexiones-v2/CredencialRevelable.tsx`). El valor se pide a
  `POST /api/integrations/conexiones/[id]/credenciales/revelar`:
  - exige administración resuelta en el servidor (`withOrg({ admin: true })`);
  - devuelve el valor en claro, o el de la bóveda vía `fn_get_provider_secret` (OTA, logística);
  - antes de responder deja auditoría en `ops_audit_log` (`entity_type = 'integration_credential'`,
    `action = 'credential_revealed'`, usuario, credencial, propósito, IP). Si la auditoría falla,
    no revela nada (503).
  Los listados y el HTML no precargan secretos.
- La lectura actual no cambia: la caracterización de Wompi sigue pasando y los lectores del
  servidor leen igual.

#### Frente INT · corrección (2026-11-07, misma tarde): la lectura se cierra, con «Ver»

Esta nota corrige la anterior («credenciales visibles»). El dueño, ya con la diferencia clara, APRUEBA cerrar la lectura directa
de secretos desde el navegador, junto con el botón «Ver».
- `20261108093000_integraciones_secretos_solo_servidor.sql` vuelve a su nombre original, sin la
  línea «No aplicar», y sigue SIN aplicar. La aplica el coordinador después de probar un cobro con
  Wompi en el navegador.
- Se le añadió una nota de compatibilidad con «Ver»: la ruta de «Ver» lee con service role tras
  exigir administración y registrar la auditoría, así que estos privilegios no la afectan.
- La migración mínima `20261108094000_integraciones_anon_y_rls_webhooks.sql` se retiró: su
  contenido (anon y RLS de `integration_webhooks`) ya está dentro de `20261108093000`.
- Las llaves siguen guardadas en claro: no se cifra nada. El navegador puede crear, editar y rotar
  credenciales, pero no leer `secret_ref` ni `secret`.

Barrido final de lecturas con la sesión del usuario o con el cliente del navegador
(`secret_ref`, `webhook_endpoints.secret`, `integration_webhooks.secret_ref`): **cero**.
- go-admin-erp: todas las lecturas que quedan van con service role, tras validar la organización.
  Se corrigieron tres que usaban el cliente del navegador por defecto:
  - `sendgrid/send` ahora pasa el cliente del servidor;
  - `NotificationService.processEmailNotifications` / `sendEmailViaSendGrid` reciben el cliente del
    servidor;
  - `whatsappClientService.getCredentials` se retiró (sin uso).
- goadmin-websites: todas las lecturas están en route handlers con `createAdminClient()` (service
  role).

### Consignación en dos sentidos (2026-11-07)

Sin commit. Diseño, decisiones del dueño y del Contador (con «Correcciones del Contador 2»):
`docs/design/CONSIGNACION-RECIBIDA-Y-ENTRE-ORGANIZACIONES.md`. Capturas `docs/design/figma/89-consignacion-recibida-*.png`.

**Migraciones, SIN aplicar (con reversión):**
- `20261108120500_organization_links.sql` (va antes): vínculo genérico entre organizaciones (`organization_links`,
  `organization_link_parties`, `organization_shared_documents`, `organization_link_product_map`), token de un solo uso con
  sha-256, RLS para las dos partes, documentos por copia. Listo para órdenes de compra y facturas (sin construirlas).
- `20261108121000_consignaciones.sql` (reescrita; nunca se aplicó): entregada y recibida; clasificación del contrato
  obligatoria (`intermediacion` | `estimatorio`; `compra` va por la factura); precio fijo o mínimo; remuneración por porcentaje
  (base pactado o venta) o precio de liquidación; productos de consignación siempre aparte (`consignment_products`); riesgos,
  facturación y obligación «al vender | al cobrar» por nota; disparador del kardex que asigna lo vendido en el POS y la factura
  de siempre (sin segunda implementación de la venta); liquidación por dueño, anulación de la última; documentos entre
  organizaciones. IVA y retenciones: hechos + pendiente contable, no elección.

**Prueba en seco** (dos corridas en `begin … rollback`, bloque DO con usuarios simulados de dos organizaciones; nada quedó):
recibir, vender por el kardex, devolver, liquidar parcial dos veces, devolución después de pagar (saldo a favor bloqueado),
anular la no última (bloqueado) y la última (contra-asiento), estimatorio, entregada (1465 dentro del grupo 14), invitación →
aceptación → nota compartida → aceptada como recibida → liquidación compartida → aceptada por el dueño con su flujo de siempre.
0 asientos descuadrados; RLS: ninguna organización ve las notas de la otra; `token_hash` no se puede leer.

**Pantallas** (Inventario › Consignaciones, `/app/inventario/consignaciones`; `/app/finanzas/consignaciones` redirige):
pestañas Entregadas · Recibidas · Por aceptar, recibir a mano, detalle de la recibida, liquidación al consignante (enlaza a
Dinero de terceros y a Facturas de compra), nota por aceptar, liquidación recibida por el consignante, vincular, invitación
(`/app/vincular/[token]`), vacío, sin permiso y menú del celular. Namespace `consignacionesR4` (374 claves × 4) y
`nav.paginas.inventario_consignaciones`.

**Verificación:** jest de consignaciones, R4-B, navegación e i18n: 1101 de 1101; guardrails 206 de 208 (los 2 preexistentes);
`tsc` con 14 GB: 34 errores, la línea base; `eslint` limpio en lo tocado. Ninguna pantalla recorrida con sesión real.

**Pendiente:** aplicar `20261108120500` y luego `20261108121000`; crear en el PUC de cada organización 911520, el auxiliar de
281510 por consignante y el de 413512; liquidación del dueño en intermediación (entregada); devolución en el POS de mercancía en
intermediación (queda como pendiente contable); reglas de IVA y retenciones para estos conceptos; productos con seriales o
variantes; crear el producto de consignación desde el diálogo; notificaciones (campana y correo) de documentos por aceptar;
PDF de la nota y de la liquidación.

#### Frente INT · Métodos de pago abría el asistente viejo (fallo del dueño, 2026-11-07)

Síntoma: «Configurar integración» de Mercado Pago, desde Métodos de pago y en el celular, abría
`/conexiones/nueva` (País → ambiente → sucursal), con el logo de Mastercard.

**Entradas que ahora llevan al asistente nuevo** (`conexiones/rutaAsistente.ts`), con el proveedor
elegido y `?return=`:
- Métodos de pago: lista (`PaymentMethodsList`) y formulario (`PaymentMethodForm`);
- PMS › Channel Manager (Booking, Expedia);
- Onboarding y la documentación de Integraciones (al catálogo).

En Conexiones, `?conectar=<id>&return=<ruta interna>` abre directo el asistente. Al terminar o
cerrar vuelve a la ruta de origen. `&sucursal=` llega al guardado de las llaves.

**`/app/integraciones/conexiones/nueva`** es ahora un componente de servidor que redirige al
asistente nuevo. Resuelve el uuid del proveedor con la sesión y conserva proveedor, sucursal y
regreso.
- Editar una conexión cubierta lleva a su detalle («Reemplazar llave»).
- Sin proveedor, lleva al catálogo.
- El formulario viejo (`nueva/AsistenteViejo.tsx`) queda SOLO para lo que el nuevo no cubre: Bold
  (datáfonos por sucursal), Bancolombia QR, Bre-B, Redeban, WhatsApp, Twilio y los proveedores de la
  base que el catálogo no conozca.

**Logo:** Mercado Pago mostraba el de Mastercard, que estaba como URL externa en
`StepProviderConnector` y en `AvailableProviders`. Se retiró esa URL. El formulario viejo pinta los
logos del catálogo (`conexiones-v2/logos`).

**Pruebas:**
- `rutaAsistente.test.ts` (13): rutas y redirección en el servidor.
- `metodos-pago/__tests__/conectarPasarelaNueva.test.tsx`: render a 390 y 1440 px; el enlace de
  Mercado Pago va al asistente nuevo.

### Consignación: Ronda 2 del Contador (2026-11-07)

Sin commit. `20261108121000_consignaciones.sql` reescrita (v3) y su reversión, **sin aplicar**; `20261108120500` sin cambios.
Detalle punto por punto en `docs/design/CONSIGNACION-RECIBIDA-Y-ENTRE-ORGANIZACIONES.md`, «Ronda 2 del Contador».
Contrato con modalidad, condición contable y tratamiento tributario separados; contrapartida del grupo 94 definida
(`consignment_account_settings`); valoración de custodia por contrato; estimatorio bloqueado hasta los arts. 438 y 455; sin
compra ni costo automáticos; remuneración al devengarse; retenciones por pago o abono como pendiente; anticipo cruzado con
281510; faltantes y daños con evidencia y sin gasto; derechos frente al dueño solo con acuerdo; entregada sin 1465 ni asiento.
UI: Cuentas de consignación, Registrar faltante o daño, Cruzar anticipo, derechos con acuerdo, valoración al recibir y al
aceptar. Prueba en seco en las organizaciones 137 y 138: todos los bloqueos y cifras esperados, 0 asientos descuadrados.

**Pendiente (nuevo):** el listado de anticipos a proveedores calcula lo aplicado desde `supplier_advance_applications`; los
cruces de consignación bajan el saldo y quedan en `consignment_advance_crossings`: ese listado debe sumarlos. Cargar las reglas
del estimatorio cuando el Contador las apruebe. Lo demás, como arriba.


### Consignación: Ronda 3 del Contador (2026-11-08)

Migración sigue SIN aplicar (v4, md5 `db50d761…`). Detalle en `docs/design/CONSIGNACION-RECIBIDA-Y-ENTRE-ORGANIZACIONES.md`,
«Ronda 3 del Contador». Comisión: fuera `al_liquidar`; se reconoce al vender o, si el contrato documenta una obligación
posterior real, al cumplirse con evidencia («Reconocer remuneración»). Retenciones: operación (calidad del mandante, por
grupo de compradores) y remuneración (calidad del intermediario), por separado, con las reglas configuradas de
`organization_taxes`; sin regla, calidad, UVT o norma municipal quedan pendientes y conciliables, nunca 0. Estimatorio
bloqueado. Prueba en seco 15: 79/79. Listado de Consignaciones arreglado a 390 px (buscador en su fila, pestañas debajo).

**Pendiente (nuevo):** cuando se aplique 20261108170000 (anticipos), reemplazar la lectura de calidades de consignación por su
evaluador. Sigue pendiente que el listado de anticipos sume `consignment_advance_crossings`.

#### Frente INT · pedidos del dueño del 2026-11-08 (asistente de llaves)

**Ojo en los campos secretos.**
- Se añadió al kit `CampoSecreto`, con botón «Mostrar» / «Ocultar»:
  - accesible: `aria-label`, `aria-pressed`, `aria-controls`;
  - con el ratón el foco y el cursor se quedan en el campo;
  - `autoComplete="off"`, `spellCheck={false}`, ignorado por los gestores de contraseñas.
- No es `CampoContrasena` del acceso: aquel pide al navegador que guarde la contraseña.
- Se usa en el asistente de llaves (Wompi, Mercado Pago, PayU, Stripe, PayPal, SendGrid y
  «Reemplazar llave»), en logística (`ConexionLogistica`) y en los diálogos de credencial y de
  webhook de conexión.
- El formulario avanzado (Bold y otros) ya tenía su propio ojo.
- Textos en `kit.campoSecreto` (4 idiomas). Prueba: `kit/__tests__/campoSecreto.test.tsx`.

**«Conectado como …».** Al probar llaves correctas se muestra lo que el proveedor dice de la cuenta,
como hacía el asistente viejo con Wompi («Conexión verificada: {nombre}»):

| Proveedor | De dónde sale | Qué se muestra |
|---|---|---|
| Wompi | `GET /merchants/{llave pública}` | nombre, razón social, documento, correo, ambiente y métodos aceptados |
| Mercado Pago | `/users/me` | nickname, país, id |
| Stripe | `/v1/account` (antes `/v1/balance`) | nombre del negocio, país, modo |
| PayPal | token | id de la app (no trae nombre del negocio) |
| PayU | PING | id de comercio (no trae nombre) |
| SendGrid | `/v3/user/profile` | perfil, si la llave lo permite |

- Se guarda en `settings.cuenta_verificada` (fusionado, sin secretos) al guardar llaves y con
  «Probar».
- Se ve en el paso del webhook, al terminar, en «Mis conexiones» y en el detalle.
- Una llave del otro ambiente (p. ej. `pub_test_` con «Producción») da un error propio de ambiente.
- Prueba: `cuentaVerificada.test.ts`.

**URL del webhook de Wompi: investigación, sin cambiar nada.** Hay dos receptores y cada uno cubre
flujos distintos:

| Receptor | Qué procesa |
|---|---|
| ERP `/api/integrations/wompi/webhook` | sesiones QR del POS y del folio, links de pago y pagos pendientes del ERP. Nada de `web_orders` |
| Tienda `https://{dominio}/api/webhooks/wompi_co` (goadmin-websites) | depósitos, abonos de mesa, reservas, membresías, tiquetes, parqueo, facturas y pedidos web |

- La ruta de la tienda responde 404 a cualquier otra referencia (`route.ts:245`), así que no cubre
  el POS.
- Wompi admite UNA URL de eventos por comercio y ambiente: ninguna de las dos cubre todo.

Evidencia de la base (solo SELECT):
- Las 5 conexiones Wompi tienen dominio propio verificado y principal.
- No hay ningún evento entrante de Wompi registrado desde la base nueva (2026-11-03), en ninguna de
  las dos rutas.
- Los pedidos web se confirman en `app/checkout/resultado/page.tsx` consultando la API de Wompi.
- `payment_qr_sessions` de Wompi: 0.

Propuesta, sin implementar:
- Que la ruta del dominio de la tienda REENVÍE al ERP, con el cuerpo crudo y la firma, todo evento
  cuya referencia no sea de la tienda.
- Entonces el asistente mostraría `https://{dominio principal verificado}/api/webhooks/wompi_co`.
- Mientras tanto, la URL configurada hoy en Wompi no se toca.

#### Frente INT · Conexiones en celular (Figma, 2026-11-09)

Solo diseño, sin código. El dueño vio la página mal en celular (el buscador distinto al de las demás
listas y sin encontrar Webhooks ni Llaves de API) porque no existía diseño de celular. Se añadió la
fila «Celular» dentro de la sección `2364:15823` (página «10 Configuración», intro `2431:20519`),
frames de 390 px con anotación cada uno. Capturas en `docs/design/figma/85-integraciones-5*-movil-*.png`.

| Frame | id | Captura |
|---|---|---|
| 50 · Catálogo | `2426:18841` | `50-movil-catalogo` |
| 50b · Catálogo — menú «⋯» del encabezado | `2430:20362` | `50b-movil-catalogo-menu` |
| 51 · Mis conexiones | `2426:19313` | `51-movil-mis-conexiones` |
| 51b · Mis conexiones — vacío | `2426:19678` | `51b-movil-mis-conexiones-vacio` |
| 52 · Actividad | `2427:19266` | `52-movil-actividad` |
| 53 · Desarrolladores (pantalla larga) | `2427:20345` | `53-movil-desarrolladores` |
| 53b · Desarrolladores — menú «⋯» de una llave | `2427:20697` | `53b-movil-desarrolladores-menu-fila` |
| 53c · Desarrolladores — hoja «Llave creada» | `2427:21125` | `53c-movil-llave-creada` |
| 54 · Detalle de conexión (Wompi, pantalla larga) | `2429:20124` | `54-movil-detalle` |
| 55 · Asistente — pegar credenciales | `2429:20587` | `55-movil-asistente-credenciales` |
| 56 · Asistente — prueba correcta, «conectado como» | `2429:20743` | `56-movil-conectado-como` |
| 57 · Actividad — hoja de filtros | `2427:19702` | `57-movil-filtros` |

Decisiones de celular:
- Misma estructura que las demás listas en celular (Facturas de venta `421:171523`, Cuentas por
  cobrar `449:214437`): barra de estado, `MobileHeader` (`48:2550`, Mode=page, «⋯» en la acción de
  icono), fila `SearchBar` (`104:3468`, md) + `FilterButton` (`104:3514`), contenido con relleno 16 y
  separación 12, `MobileTabBar` (`57:3101`) abajo.
- Las cuatro pestañas (Catálogo · Mis conexiones · 5 · Actividad · Desarrolladores) van en una fila
  con desplazamiento horizontal: en 390 px «Desarrolladores» queda cortada a propósito para que se
  note que hay más a la derecha; en la pestaña activa (53) la fila aparece desplazada al final. Los
  chips por grupo (`Chip` `103:3013`, Variant=toggle) también se desplazan.
- Una tarjeta por fila en todas las listas (servicio, conexión, evento, llave, webhook): logo
  (`2367:16785`), título, `Badge` (`7:70`, suave sm) de estado, «Conectado como …», ambiente y uso.
  El menú «⋯» por fila (`IconButton` `9:384` con MoreVertical) abre una hoja inferior
  (`BottomSheet` `113:4774` + `MenuItem` `10:239`), igual que la hoja de acciones de Impuestos.
- Filtros en hoja inferior con el mismo `FilterPanel` Layout=sheet (`105:3450`) de las demás listas:
  Conexión, Resultado, Sentido, Periodo y casillas.
- Desarrolladores: aviso (`Aviso` `978:605724`), «Llaves de API» y «Webhooks salientes» como listas
  de filas con «Nueva llave» / «Nuevo webhook» (`Button` `9:343`) y menú por fila (editar, probar,
  revocar o pausar, eliminar). La hoja «Llave creada» muestra la llave completa una sola vez con
  botón de copiar; en la lista solo quedan los últimos 4 caracteres.
- Detalle de conexión en celular en una sola columna y pantalla larga: estado y acciones, aviso del
  error vigente, «Conectado como» (`FilaDato` `680:406357`), credenciales con ojo, webhook con copiar,
  dónde se usa, actividad reciente y zona de peligro. Se adaptó sobre Wompi (no sobre Booking como
  `2382:17`) porque es la conexión que tiene credenciales y webhook.
- Asistente de conexión como hoja a pantalla completa (sin barra de pestañas), con pasos como
  círculos y la etiqueta del paso actual, `FormField` (`50:2685`) y `PasswordField` (`351:137843`)
  con ojo, y botones fijos abajo. El bloque «Conectado como» y los tres chequeos son clones del
  diálogo de escritorio `2413:17`.
- Dudas para el dueño: si en celular el buscador debe ser md (como facturas) o sm (como impuestos);
  si el detalle debe conservar las pestañas de escritorio (Resumen · Habitaciones · Credenciales ·
  Actividad) en vez de una sola columna; y si la hoja «⋯» del encabezado del catálogo debe traer
  «Importar CSV» o solo «Conectar».
