# Integraciones y conexiones: análisis del código y propuesta

Fecha: 2026-11-07. Lectura del código y de la base `taqjemqjtumhwptchcxk` (solo SELECT). La base es nueva
desde el 2026-11-03: los conteos son bajos (34 organizaciones con configuración).
Propuesta de diseño en Figma, página «10 Configuración», sección «8. Integraciones — Conexiones
(propuesta 2026-11-07)».

## Resumen

- El módulo Integraciones tiene 17 pantallas; la mitad son decorativas.
- La única pasarela conectada de verdad es **Wompi, en 4 organizaciones**, y sus secretos están **en
  texto plano** en `integration_credentials.secret_ref`, escritos y leídos desde el navegador.
- Métodos de pago y el asistente de Integraciones configuran lo mismo en dos sitios; el mapeo contable
  de Métodos de pago no lo lee nadie.
- WhatsApp se configura en cuatro lugares.

## Pantallas actuales

| Ruta | Qué hace | ¿Funciona? |
|---|---|---|
| `/integraciones/conexiones` | Catálogo de 27 proveedores + conexiones: probar, pausar, revocar, borrar, importar CSV | Parcial. «Probar» solo es real en Wompi y logística |
| `/conexiones/nueva` | Asistente proveedor → país y ambiente → credenciales → ajustes | Guarda en texto plano desde el navegador; muestra una URL de webhook que no existe |
| `/conexiones/[id]` | Detalle | Lee y guarda; «Reintentar trabajo» no lo procesa nadie |
| `/conexiones/[id]/credenciales` | CRUD de credenciales | Secreto en texto plano |
| `/conexiones/[id]/webhooks` | CRUD de `integration_webhooks` | Decorativa: ningún receptor lee la tabla |
| `/conexiones/logistica` | Transportadoras, Effi, Dropi | **Modelo bueno**: route handler + Vault |
| `/integraciones/eventos` | `integration_events` | Real (lo escriben los webhooks) |
| `/integraciones/jobs` | `integration_jobs` | Decorativa: ningún proceso la lee |
| `/integraciones/mapeos` | `integration_object_mappings` | CRUD sin consumidor |
| `/integraciones/api-keys` | Llaves `goak_` | Rota (generador inseguro) |
| `/integraciones/webhooks-salientes` | `webhook_endpoints` | Decorativa: no se envía nada; «Probar» simulado |
| `/integraciones/onboarding` | Pasos de proveedores QR | Fuera del menú; la lista no guarda |
| `/integraciones/twilio` | Créditos de la plataforma | Lectura |
| `/integraciones/payfac/*` | Operación de PayFac | Es de la plataforma (`withPlatformAdmin`) montada en la app del cliente |
| Configuración › Integraciones | 19 ajustes | Decorativo |
| `/finanzas/metodos-pago` | Lista y formulario | Guarda métodos; `AccountMappingForm` no lo lee nadie |

Código muerto: `PaymentGatewaysSection`, `PaymentMethodGatewayConfig`, `gateways/*`, y en `integraciones/`
`StatsCards`, `TopProblems`, `QuickActions`, `RecentConnections`, `RecentEvents`,
`IntegrationConnectionCard`, `ChatChannelsSection`.

## Integraciones

| Integración | Se configura en | La consume | Estado | Orgs |
|---|---|---|---|---|
| Wompi | Asistente | POS (QR), tienda web, webhook `/api/integrations/wompi/webhook` | Conectada, webhook real | 4 (16 credenciales, 0 en Vault) |
| MercadoPago, PayU, Stripe, PayPal | Asistente | Rutas `/api/integrations/*` con `withOrg` | Código protegido | 0 |
| Bold, QR Bancolombia, Bre-B, Redeban | Asistente | POS y PMS vía `cobroQrServidor.ts` | Credenciales del cliente; Tesorería v2 dice que son servicio de GO Admin | 0 |
| WhatsApp | Asistente, Chat › Canales, Configuración › CRM › WhatsApp, CRM › Proveedores | Chat, CRM, campañas | 4 lugares | 0 |
| Facebook / Instagram (chat) | Chat › Canales | Chat | — | 0 |
| Meta Marketing, TikTok, Google Ads | Asistente / OAuth | Eventos y catálogo | — | 0 |
| SendGrid | Asistente | `/api/integrations/sendgrid/*` | Choca con «Correo = Resend» | 0 |
| Twilio | `/integraciones/twilio` + CRM › Proveedores | CRM, notificaciones | Cuenta de la plataforma | 34 con fila |
| Booking / Expedia | PMS › Channel Manager | PMS | **Roto**: escriben `value_encrypted`, columna inexistente | 0 |
| Logística | `/conexiones/logistica` | Transporte | Vault correcto; adaptadores en construcción | 0 |
| Factus | Configuración › Facturación | Cola `process-pending` | Servicio de la plataforma; sin consola en go-admin-super | 0 activas |
| Open Finance | `/finanzas/open-finance` | Tesorería | Rutas aseguradas | 0 |
| PayFac | `/integraciones/payfac/*` | Plataforma | Cascarón | 0 |
| Proveedores e IA del CRM | Configuración › CRM › Proveedores | CRM, asistente | **Patrón bueno** (route handler, no devuelve secretos) | 34 |
| Dominios | Organización › Dominios | Tienda web | Real | 26 |

## Métodos de pago ↔ pasarela ↔ cuenta contable

- Manda `organization_payment_methods` (106 filas). El enlace es `integration_connection_id` (4 filas).
- El cobro resuelve la conexión en el servidor: sucursal → método → única general (`cobroQrServidor.ts`).
- `AccountMappingForm` escribe `settings.account_mapping` y nadie lo lee; los asientos salen de
  `accounting_rules`.
- Al enlazar una pasarela, el asistente sobrescribe todo `settings` del método (`nueva/page.tsx:1017`) y
  enlaza Stripe al método `card` (`:990`).

## Riesgos de seguridad

1. Secretos de pasarela en claro, escritos y leídos desde el navegador (`wompiService.ts:39-53, 77-124`,
   `nueva/page.tsx:199`, `CredentialDialog.tsx:139-142`). La RLS deja leerlos a los roles 1/2, al super
   admin y a `admin.full_access`. Afecta hoy a 4 organizaciones con Wompi.
2. `webhook_endpoints.secret` en claro y legible por cualquier miembro.
3. RLS de `integration_webhooks` por nombre de rol (viola la regla 6).
4. Llaves API con `Math.random` y huella de 32 bits (`integrationsService.ts:2548-2567`).
5. Webhook de Slack en claro en `organization_settings`.
6. `channel_credentials.credentials` en jsonb en claro.

## Fallos funcionales

- `StepSettings.tsx:125-126`: URL de webhook inexistente (15 conectores).
- `integrationsService.ts:1120-1141`: «Probar» devuelve éxito sin llamar al proveedor.
- `integrationsService.ts:2945-2958`: prueba de webhook saliente simulada.
- `integrationsService.ts:399-415`: «Reintentar trabajo» sin proceso.
- `bookingConnectionService.ts:96-108`, `expediaConnectionService.ts:98-110`: columna inexistente.
- `nueva/page.tsx:884-905`: Booking/Expedia colapsan sus 3 credenciales en una al editar.
- `nueva/page.tsx:1049`: ignora `return`.
- `AccountMappingForm.tsx:143`: `console.log` y toast sobre datos que no se usan.
- `onboarding/page.tsx:463`: la lista no persiste.

## Propuesta de arquitectura

1. **Integraciones › Conexiones** = cuentas del cliente con terceros, siempre por route handler y
   Vault. Pestañas: Catálogo · Mis conexiones · Actividad · Desarrolladores. Estados honestos
   (Disponible · En construcción · Servicio de GO Admin). Detalle con URL de webhook real, credenciales
   que solo muestran prefijo y fecha, «Reemplazar», «Probar» real y «Usada por».
2. **Métodos de pago** = qué acepta la organización y a qué cuenta de dinero entra; «Procesado por» es
   un enlace a la conexión, no un formulario de llaves. Se retiran `AccountMappingForm` y la
   configuración de pasarela del formulario.
3. **Servicios de la plataforma** (Factus, Cobros QR/PayFac, Open Finance, Twilio, créditos): tarjetas
   de estado en su módulo nativo; en el catálogo aparecen como «Servicio de GO Admin» con enlace.
4. **Comunicación**: un solo dueño por canal (WhatsApp en Configuración › Comunicación).
5. **Fuera de la app del cliente**: PayFac (operación), límites del módulo y onboarding de QR.
