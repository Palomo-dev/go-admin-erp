# Tracking de Conversiones: Meta y Google Ads

## Cumplimiento Ley 1581 de Colombia

Este módulo implementa el tracking de conversiones para Meta (Facebook/Instagram) y Google Ads cumpliendo estrictamente con la Ley 1581 de 2006 sobre protección de datos personales en Colombia.

**Principio fundamental:** Solo se envían datos a Meta y Google si el usuario dio consentimiento explícito de marketing en el momento del registro.

## Arquitectura

### 1. Consentimiento (Cookie `goadmin_consent`)

- **Dominio:** `.goadmin.io` (compartida entre sitio y ERP)
- **Formato:** JSON: `{"v":1,"analytics":boolean,"marketing":boolean,"ts":epoch}`
- **Duración:** 180 días
- **Consent Mode v2:** Estado por defecto `denied`, actualizado a `granted` solo con consentimiento

### 2. Píxel y Tags (Solo en Auth Layout)

- **Ubicación:** `src/app/auth/layout.tsx`
- **Componente:** `src/components/marketing/MarketingTags.tsx`
- **Comportamiento:**
  - Sin consentimiento de marketing → No carga ningún script
  - Con consentimiento → Carga píxel de Meta y gtag de GA4/Google Ads
  - Escucha cambios de consentimiento para activarse sin recargar

### 3. Tabla `signup_attribution` (Dependencia)

⚠️ **NOTA:** Esta tabla es creada en paralelo por otro agente. Si no existe, el módulo de conversiones retorna sin hacer nada.

**Columnas requeridas:**
- `user_id` (uuid, FK a profiles.id)
- `organization_id` (bigint, FK a organizations.id)
- `marketing_consent` (boolean) - **CRÍTICO**: controla si se envían eventos
- `consent_ts` (timestamptz)
- `fbp` (text) - Cookie `_fbp` de Meta
- `fbc` (text) - Cookie `_fbc` construida con `fbclid`
- `ga_client_id` (text) - Client ID de GA4
- `utm_*`, `gclid`, `fbclid`, etc. (atribución)

### 4. Eventos Implementados

#### E6: CompleteRegistration
- **Cuándo:** Al terminar el registro exitosamente
- **Dónde:**
  - Cliente: Automático (píxel cargado en auth/layout.tsx)
  - Servidor: `src/app/auth/callback/route.ts` en `completeSignupAfterEmailConfirmation`
- **Deduplicación:** `event_id = user.id`

#### E7: StartTrial
- **Cuándo:** Al crear la suscripción de prueba
- **Dónde:**
  - Servidor: `src/app/api/stripe/create-subscription/route.ts`
  - Cliente: (pendiente) Disparar gtag en pantalla siguiente al crear suscripción
- **Deduplicación:** `event_id = subscription.id`
- **Valor:** Precio mensual del plan en USD
- **Google Ads:** Conversión `prueba_creada` con conversiones mejoradas (email, teléfono)

#### E8: Purchase
- **Cuándo:** Primer `invoice.paid` con monto > 0 de suscripción SaaS
- **Dónde:** `src/app/api/stripe/webhook/route.ts`
- **Deduplicación:** `event_id = invoice.id` + tabla `conversion_events_sent`
- **Valor:** Monto cobrado en USD
- **Idempotencia:** Usa tabla `conversion_events_sent` para no enviar dos veces el mismo invoice

## Variables de Entorno

### Requeridas en Vercel (NO en el código)

```bash
# Meta
NEXT_PUBLIC_META_PIXEL_ID=123456789012345
META_CAPI_TOKEN=EAAbc123...

# GA4
NEXT_PUBLIC_GA4_ID=G-XXXXXXXXXX
GA4_API_SECRET=abc123XYZ...

# Google Ads
NEXT_PUBLIC_GADS_ID=AW-123456789
NEXT_PUBLIC_GADS_TRIAL_LABEL=abc123XYZ
```

### Validación

El código valida que las variables:
- No sean placeholders (`your-*`)
- Tengan longitud mínima (16 caracteres para tokens)
- Si faltan, el módulo retorna sin hacer nada (fail-safe)

## Archivos Modificados/Creados

### Nuevos
- `src/lib/marketing/conversionTracking.ts` - Módulo servidor CAPI/GA4 MP
- `src/lib/marketing/clientTracking.ts` - Utilidades cliente para eventos
- `src/components/marketing/MarketingTags.tsx` - Píxel y gtag condicionados
- `supabase/migrations/20260929220000_conversion_events_idempotencia.sql`
- `supabase/rollbacks/20260929220000_conversion_events_idempotencia.sql`

### Modificados
- `src/app/auth/layout.tsx` - Incluye `<MarketingTags />`
- `src/app/auth/callback/route.ts` - Envía CompleteRegistration
- `src/app/api/stripe/create-subscription/route.ts` - Envía StartTrial
- `src/app/api/stripe/webhook/route.ts` - Envía Purchase
- `.env.example` - Documenta nuevas variables

## Verificación

### 1. Consent Mode

1. Abrir DevTools → Red
2. Visitar `/auth/signup`
3. Sin consentimiento: No debe cargar scripts de Meta ni Google
4. Aceptar cookies → Debe cargar píxel y gtag
5. Verificar en consola: `[MarketingTags] Meta Pixel cargado` y `[MarketingTags] gtag cargado`

### 2. Eventos en Meta "Probar eventos"

1. Ir a Administrador de eventos → Píxel → Probar eventos
2. Ingresar URL: `https://app.goadmin.io/auth/signup`
3. Hacer un registro de prueba completo
4. Verificar en "Probar eventos":
   - **PageView** (automático del píxel)
   - **CompleteRegistration** - debe aparecer **1 evento** (deduplicado navegador + servidor)
   - Verificar que `event_id` sea el `user.id`

### 3. Eventos en Google Ads

1. Crear suscripción de prueba
2. Google Ads → Herramientas → Conversiones
3. Verificar conversión `prueba_creada`:
   - Estado: "Registrando conversiones"
   - Valor: precio mensual del plan en USD
   - Transaction ID: `subscription.id`

### 4. Deduplicación (CRÍTICO)

**El objetivo es que navegador + servidor = 1 evento, no 2.**

En "Probar eventos" de Meta:
- Sin deduplicación: aparecerían 2 eventos CompleteRegistration
- Con deduplicación: aparece 1 evento (el servidor usa el mismo `event_id` que el navegador)

Verificar en logs del servidor:
```
[conversionTracking] Evento Meta CAPI enviado: { eventName: 'CompleteRegistration', eventId: '<user-id>', eventsReceived: 1 }
```

### 5. Verificar que NO se envíen sin consentimiento

1. Registro sin marcar consentimiento de marketing
2. Verificar logs del servidor:
```
[conversionTracking] Usuario sin consentimiento de marketing - omitiendo Meta CAPI
[conversionTracking] Usuario sin consentimiento de marketing - omitiendo GA4 MP
```
3. En "Probar eventos" de Meta: NO debe aparecer CompleteRegistration

## Seguridad y Privacidad

### ✅ Cumplimiento Ley 1581

1. **Consentimiento explícito:** Solo envía datos si `marketing_consent = true`
2. **Minimización de datos:** Solo se envían datos necesarios para medición
3. **Hash de PII:** Email, teléfono, nombre, ciudad y país se envían hasheados (SHA-256)
4. **Transparencia:** Usuario sabe qué se recopila (banner menciona Meta y Google)
5. **Derecho de oposición:** Usuario puede rechazar cookies de marketing

### ⚠️ Nunca hacer

- ❌ Enviar datos sin consentimiento
- ❌ Enviar IDs de clic (fbclid, gclid) sin consentimiento
- ❌ Cargar píxel en toda la app (solo en auth/layout.tsx)
- ❌ Inventar valores de consentimiento
- ❌ Hardcodear variables de entorno en el código
- ❌ Enviar nombres de clientes u organizaciones en eventos
- ❌ Usar fingerprinting o identificación por IP sin consentimiento

## Troubleshooting

### "signup_attribution no existe aún"
La tabla aún no ha sido creada por el otro agente. El módulo retorna sin hacer nada. No es un error crítico.

### "Meta CAPI no configurado"
Falta alguna variable de entorno o tiene un placeholder. Verificar en Vercel.

### "Usuario sin consentimiento de marketing"
El usuario no marcó consentimiento en el registro. Esto es correcto y esperado.

### Eventos no aparecen en Meta
1. Verificar que el píxel se cargó (DevTools → Red)
2. Verificar que hay consentimiento de marketing
3. Verificar variables de entorno en Vercel
4. Revisar logs del servidor para errores

### Deduplicación no funciona
Verificar que el `event_id` sea el mismo en navegador y servidor:
- Navegador: `fbq('track', 'CompleteRegistration', {}, { eventID: userId })`
- Servidor: `eventId: userId` en el payload a Meta CAPI

## Referencias

- [Meta Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api/)
- [Google Ads Conversiones Mejoradas](https://support.google.com/google-ads/answer/11062876)
- [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [Consent Mode v2](https://support.google.com/analytics/answer/9976101)
- [Ley 1581 de 2006 (Colombia)](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981)
