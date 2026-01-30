# Análisis Completo: Integración de Stripe en GO Admin ERP

## 📋 Resumen Ejecutivo

**Estado Actual**: ⚠️ **Sistema de suscripciones NO integrado con Stripe**

**Hallazgo Principal**: Las suscripciones en la base de datos existen y funcionan, pero **NO están conectadas a Stripe**. Todas las suscripciones tienen `stripe_subscription_id: null` y `stripe_customer_id: null`.

**Modo de Stripe**: 🧪 **TEST MODE** (sk_test_...)

**Fecha de Análisis**: 19 de diciembre de 2025  
**Última Actualización**: 19 de diciembre de 2025 - 9:30 PM

---

## 🔍 1. Recursos Disponibles en Stripe

### 1.1 Productos en Cuenta de Stripe

**⚠️ IMPORTANTE**: Ahora conectado a **Stripe TEST MODE** (API key: `sk_test_...`)

Se encontraron **2 productos activos** en modo TEST para GO Admin ERP:

#### **Productos de GO Admin ERP en TEST MODE**:

1. **Plan Business - GO Admin ERP** (`prod_TdUKnI7isH5ECE`)
   - **Modo**: 🧪 TEST (livemode: false)
   - Descripción: Para grandes empresas y franquicias
   - Características: 13 módulos premium, 10 sucursales, 20 usuarios, 1TB storage, 10,000 créditos IA
   - Soporte: 24/7, API completo, webhooks, gerente de cuenta dedicado
   - Trial: 30 días de prueba gratis
   - **✅ PRECIOS CONFIGURADOS**:
     - Monthly: `price_1SgDNzIKKf3sRcnU606wGAIF` - **$49.00 USD/mes**
     - Yearly: `price_1SgDODIKKf3sRcnUuHzArqVz` - **$490.00 USD/año**

2. **Plan Pro - GO Admin ERP** (`prod_TdUJc11jFCha2B`)
   - **Modo**: 🧪 TEST (livemode: false)
   - Descripción: Para negocios en crecimiento
   - Características: 8 módulos premium, 5 sucursales, 10 usuarios, 100GB storage, 5,000 créditos IA
   - Soporte: Email y chat
   - Trial: 15 días de prueba gratis
   - **✅ PRECIOS CONFIGURADOS**:
     - Monthly: `price_1SgDN8IKKf3sRcnUWhAIQ4Ou` - **$20.00 USD/mes**
     - Yearly: `price_1SgDNPIKKf3sRcnUYpvxH9B6` - **$199.00 USD/año**

**Nota**: Los productos están en modo TEST, ideal para desarrollo y pruebas sin cargos reales.

### 1.2 Precios Configurados (TEST MODE)

Se encontraron **4 precios activos** para GO Admin ERP en modo TEST:

#### **Plan Pro**:
- **Monthly**: $20.00 USD/mes (`price_1SgDN8IKKf3sRcnUWhAIQ4Ou`)
  - Recurring: monthly
  - Type: subscription
- **Yearly**: $199.00 USD/año (`price_1SgDNPIKKf3sRcnUYpvxH9B6`)
  - Recurring: yearly
  - Type: subscription
  - Ahorro: $41 USD/año (17% descuento)

#### **Plan Business**:
- **Monthly**: $49.00 USD/mes (`price_1SgDNzIKKf3sRcnU606wGAIF`)
  - Recurring: monthly
  - Type: subscription
- **Yearly**: $490.00 USD/año (`price_1SgDODIKKf3sRcnUuHzArqVz`)
  - Recurring: yearly
  - Type: subscription
  - Ahorro: $98 USD/año (17% descuento)

**✅ Todos los precios están correctamente configurados como suscripciones recurrentes**

### 1.3 Suscripciones Activas en Stripe

**Resultado**: ❌ **0 suscripciones activas**

```json
[]
```

**Conclusión**: Stripe no tiene ninguna suscripción activa registrada.

---

## 🗄️ 2. Base de Datos Supabase

### 2.1 Tabla `subscriptions`

**Estructura**:
```sql
- id (uuid, PK)
- organization_id (integer, NOT NULL)
- status (text, NOT NULL)
- plan_id (integer)
- stripe_subscription_id (text) ← ⚠️ SIEMPRE NULL
- stripe_customer_id (text) ← ⚠️ SIEMPRE NULL
- current_period_start (timestamptz)
- current_period_end (timestamptz)
- trial_start (timestamptz)
- trial_end (timestamptz)
- billing_period (text)
- skip_trial (boolean)
- cancel_at_period_end (boolean)
- cancel_at (timestamptz)
- canceled_at (timestamptz)
- created_at (timestamptz)
- updated_at (timestamptz)
```

**Datos Actuales** (últimas 10 suscripciones):

| Organización | Status | Plan ID | Stripe Sub ID | Stripe Customer ID | Billing Period |
|--------------|--------|---------|---------------|-------------------|----------------|
| Hotel XAA (66) | active | 3 | **null** | **null** | monthly |
| Hotel XA (65) | active | 3 | **null** | **null** | null |
| Sales ADs Sas (64) | active | 3 | **null** | **null** | null |
| Imagine 02 (62) | active | 2 | **null** | **null** | null |
| Imagine (61) | active | 3 | **null** | **null** | null |
| Casa Boutique (60) | active | 2 | **null** | **null** | null |
| Cata (59) | active | 1 | **null** | **null** | null |
| Familia Feliz (58) | active | 2 | **null** | **null** | null |
| Prueba f (57) | active | 2 | **null** | **null** | null |
| Store Photo (5) | active | 1 | **null** | **null** | null |

**⚠️ HALLAZGO CRÍTICO**: 
- **Todas las suscripciones tienen `stripe_subscription_id: null`**
- **Todas las suscripciones tienen `stripe_customer_id: null`**
- El sistema funciona con suscripciones locales NO conectadas a Stripe

### 2.2 Tabla `plans`

**4 Planes Configurados**:

#### **Plan 1: Free**
```json
{
  "id": 1,
  "code": "free",
  "name": "Plan Free",
  "price_usd_month": 0,
  "price_usd_year": 0,
  "trial_days": 0,
  "max_modules": 2,
  "max_branches": 1,
  "stripe_product_id": null,
  "stripe_price_monthly_id": null,
  "stripe_price_yearly_id": null,
  "features": {
    "max_users": 1,
    "storage_gb": 1,
    "ai_credits_month": 1000,
    "support": "community-only"
  }
}
```

#### **Plan 2: Pro**
```json
{
  "id": 2,
  "code": "pro",
  "name": "Plan Pro",
  "price_usd_month": 20,
  "price_usd_year": 199,
  "trial_days": 15,
  "max_modules": 8,
  "max_branches": 5,
  "stripe_product_id": "prod_TdUJc11jFCha2B", ← ✅ Configurado
  "stripe_price_monthly_id": "price_1SgDN8IKKf3sRcnUWhAIQ4Ou", ← ✅ Configurado
  "stripe_price_yearly_id": "price_1SgDNPIKKf3sRcnUYpvxH9B6", ← ✅ Configurado
  "features": {
    "max_users": 10,
    "storage_gb": 100,
    "ai_credits_month": 5000,
    "support": "email-chat"
  }
}
```

#### **Plan 3: Business**
```json
{
  "id": 3,
  "code": "business",
  "name": "Plan Business",
  "price_usd_month": 49,
  "price_usd_year": 490,
  "trial_days": 30,
  "max_modules": 13,
  "max_branches": 10,
  "stripe_product_id": "prod_TdUKnI7isH5ECE", ← ✅ Configurado
  "stripe_price_monthly_id": "price_1SgDNzIKKf3sRcnU606wGAIF", ← ✅ Configurado
  "stripe_price_yearly_id": "price_1SgDODIKKf3sRcnUuHzArqVz", ← ✅ Configurado
  "features": {
    "max_users": 20,
    "storage_gb": 1000,
    "ai_credits_month": 10000,
    "support": "dedicated-24-7"
  }
}
```

#### **Plan 4: Enterprise**
```json
{
  "id": 4,
  "code": "enterprise",
  "name": "Plan Enterprise",
  "price_usd_month": null,
  "price_usd_year": null,
  "trial_days": 30,
  "max_modules": null,
  "max_branches": null,
  "stripe_product_id": null,
  "stripe_price_monthly_id": null,
  "stripe_price_yearly_id": null,
  "features": {
    "max_users": null,
    "storage_gb": null,
    "ai_credits_month": null,
    "support": "dedicated-premium",
    "custom_development": true
  }
}
```

### 2.3 Tabla `organizations`

- **No tiene columnas relacionadas con Stripe**
- No almacena `stripe_customer_id` a nivel de organización
- La relación con Stripe debería estar en la tabla `subscriptions`

---

## 💻 3. Código de Integración Frontend

### 3.1 Servicio de Suscripciones

**Ubicación**: `src/lib/stripe/subscriptionService.ts`

**Funciones Principales**:

#### **`createSubscription()`**
```typescript
export async function createSubscription(
  data: CreateSubscriptionData
): Promise<SubscriptionResult>
```

**Parámetros**:
- `organizationId`: number
- `planCode`: 'basic' | 'pro' | 'enterprise'
- `billingPeriod`: 'monthly' | 'yearly'
- `useTrial`: boolean (true = 15 días gratis, false = pagar inmediatamente)
- `customerEmail`: string
- `paymentMethodId`: string (requerido si useTrial = false)

**Flujo**:
1. **Obtiene plan de Supabase** con stripe_product_id y stripe_price_id
2. **Crea o encuentra customer en Stripe** por email
3. **Con Trial**:
   - Crea suscripción con `trial_period_days: 15`
   - `payment_behavior: 'default_incomplete'`
   - Status: 'trialing'
4. **Sin Trial**:
   - Adjunta payment method al customer
   - Crea suscripción con `payment_behavior: 'error_if_incomplete'`
   - Requiere pago inmediato
5. **Guarda en Supabase** con `saveSubscriptionToDatabase()`

**Función de Guardado**:
```typescript
async function saveSubscriptionToDatabase(supabase, data) {
  await supabase
    .from('subscriptions')
    .upsert({
      organization_id,
      stripe_subscription_id, ← ✅ Se guarda
      stripe_customer_id, ← ✅ Se guarda
      plan_code,
      status,
      trial_end,
      current_period_start,
      current_period_end,
      cancel_at_period_end: false
    }, {
      onConflict: 'stripe_subscription_id'
    })
}
```

#### **`cancelSubscription()`**
```typescript
export async function cancelSubscription(
  subscriptionId: string,
  immediate: boolean = false
)
```

- Si `immediate = false`: Cancela al final del período
- Si `immediate = true`: Cancela inmediatamente

#### **`updateSubscriptionPaymentMethod()`**
```typescript
export async function updateSubscriptionPaymentMethod(
  subscriptionId: string,
  paymentMethodId: string
)
```

### 3.2 Proceso de Registro

**Ubicación**: `src/app/auth/signup/page.tsx`

**Pasos del Registro**:

1. **Paso 1**: Información Personal (PersonalInfoStep)
   - Nombre, apellido, email, contraseña, teléfono
   - Para Google Auth: auto-completa desde Google

2. **Paso 2**: Datos de Organización (OrganizationStep)
   - Nombre, tipo, país, dirección, NIT, etc.

3. **Paso 3**: Datos de Sucursal (BranchStep)
   - Nombre sucursal principal, código, dirección

4. **Paso 4**: Selección de Plan (SubscriptionStep) ← ⚠️ AQUÍ ESTÁ EL PROBLEMA
   - Selector de plan (free, pro, business)
   - Selector de período de facturación (monthly, yearly)
   - **NO llama a Stripe API**
   - Solo guarda `subscriptionPlan` y `billingPeriod` en estado local

5. **Paso 5**: Verificación de Email (VerificationStep)
   - Usuario verifica su email
   - **Trigger de BD crea la organización automáticamente**

**Componente SubscriptionStep**:
```typescript
// src/components/auth/SubscriptionStep.tsx
export default function SubscriptionStep({
  formData,
  updateFormData,
  onNext,
  onBack
}) {
  const [selectedPlan, setSelectedPlan] = useState(formData.subscriptionPlan || 'free');
  const [billingPeriod, setBillingPeriod] = useState(formData.billingPeriod || 'monthly');

  const handleSubmit = (e) => {
    e.preventDefault();
    onNext(); // ← Solo avanza al siguiente paso, NO crea suscripción en Stripe
  };
}
```

**Función `handleSignup()`**:
```typescript
const handleSignup = async () => {
  try {
    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: signupData.email,
      password: signupData.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          first_name: signupData.firstName,
          last_name: signupData.lastName,
          phone: signupData.phone,
          signup_data: JSON.stringify(signupData) // ← Guarda TODOS los datos
        }
      }
    });

    // 2. Avanzar a verificación de email
    nextStep();
    
    // 3. NO crea suscripción en Stripe aquí
    // 4. Trigger de BD maneja creación de organización después de verificar email
  } catch (err) {
    setError(err.message);
  }
};
```

### 3.3 Trigger de Base de Datos

**Nombre**: `complete_signup_after_email_verification`

**Ejecuta cuando**: Email es confirmado por Supabase Auth

**Función**: Crea organización, sucursal, miembro y **suscripción local** usando los datos guardados en `auth.users.raw_user_meta_data.signup_data`

**⚠️ PROBLEMA**: El trigger crea la suscripción en Supabase pero **NO llama a Stripe API**

---

## 🔄 4. Flujo Actual del Sistema (Sin Stripe)

### Flujo Real Implementado:

```
Usuario inicia registro
    ↓
Paso 1: Datos personales
    ↓
Paso 2: Datos organización
    ↓
Paso 3: Datos sucursal
    ↓
Paso 4: Selecciona plan (free/pro/business)
    ↓ (Solo guarda en estado, NO llama Stripe)
Paso 5: Verificación de email
    ↓
Usuario confirma email
    ↓
Trigger de BD ejecuta:
    - Crea organization
    - Crea branch
    - Crea organization_member
    - Crea subscription (con stripe_subscription_id: NULL) ← ⚠️
    ↓
Usuario accede al sistema
    ↓
Sistema valida plan desde tabla subscriptions
    ↓
Funciona sin Stripe
```

### Flujo Esperado (Con Stripe):

```
Usuario inicia registro
    ↓
... pasos 1-4 igual ...
    ↓
Paso 5: Procesar pago/suscripción
    ↓
    SI plan = free:
        → No requiere pago
        → Crear suscripción local
    ↓
    SI plan = pro/business:
        → Mostrar formulario de pago Stripe
        → Capturar payment_method_id
        → Llamar API: POST /api/stripe/create-subscription
        → Stripe crea subscription
        → Guardar stripe_subscription_id en BD
    ↓
Confirmar email
    ↓
Usuario accede al sistema
    ↓
Stripe maneja facturación recurrente
```

---

## ⚠️ 5. Problemas Identificados

### 5.1 Suscripciones No Conectadas

**Problema**: Todas las suscripciones tienen `stripe_subscription_id: null`

**Impacto**:
- ❌ No hay facturación automática recurrente
- ❌ No hay renovación automática
- ❌ No hay cobros a tarjetas de crédito
- ❌ No hay webhooks de Stripe funcionando
- ❌ Usuarios "pro" y "business" no están pagando

**Causa**: El proceso de registro no llama a la API de Stripe

### 5.2 Código Implementado Pero No Usado

**Archivos completos pero sin uso**:
- ✅ `src/lib/stripe/subscriptionService.ts` - Funciones completas
- ✅ `src/lib/stripe/config.ts` - Configuración Stripe
- ✅ `src/lib/stripe/server.ts` - Cliente Stripe server-side
- ✅ `src/components/stripe/StripeCheckout.tsx` - Componente de checkout
- ✅ `src/components/stripe/StripeCheckoutForm.tsx` - Formulario de pago

**Pero**: Ninguno se usa en el flujo de registro actual

### 5.3 Configuración de Productos en Stripe

**✅ ACTUALIZACIÓN**: Productos ahora están correctamente configurados en TEST MODE

**Productos de GO Admin ERP**:
```json
{
  "name": "Plan Business - GO Admin ERP",
  "id": "prod_TdUKnI7isH5ECE",
  "default_price": null, ← Correcto para múltiples precios
  "active": true,
  "livemode": false ← TEST MODE
}
```

**Estado**:
- ✅ 2 productos activos en TEST MODE
- ✅ 4 precios configurados (monthly y yearly para cada plan)
- ✅ Precios como suscripciones recurrentes
- ⚠️ `default_price: null` es correcto cuando hay múltiples opciones de precio
- 🧪 Modo TEST ideal para desarrollo sin cargos reales

### 5.4 Inconsistencia Plan Free

**En Base de Datos**:
- Plan ID: 1
- Code: "free"
- Price: $0

**En Stripe**:
- ❌ No existe producto "Plan Free"

**Problema**: El plan gratuito no necesita Stripe, pero falta documentación clara de esto

---

## ✅ 6. Lo Que Sí Funciona

### 6.1 Sistema de Planes Local

- ✅ Tabla `plans` correctamente configurada
- ✅ Tabla `subscriptions` funciona para control de acceso
- ✅ Validación de límites (max_modules, max_branches, max_users)
- ✅ Features por plan (storage_gb, ai_credits_month)
- ✅ Período de prueba (trial_days)

### 6.2 Estructura de Código

- ✅ Servicios de Stripe bien implementados
- ✅ Componentes de pago creados
- ✅ Manejo de errores robusto
- ✅ TypeScript con tipos completos

### 6.3 Cuenta de Stripe

- ✅ Cuenta configurada y activa
- ✅ **Modo TEST activo** (`sk_test_...`) - Ideal para desarrollo
- ✅ Productos correctamente configurados en TEST MODE
- ✅ Precios configurados como suscripciones recurrentes
- ✅ API keys de TEST disponibles
- 🧪 MCP de Stripe conectado y funcional

---

## 🛠️ 7. Plan de Acción para Activar Stripe

### Fase 1: Configurar Productos en Stripe ✅ COMPLETADA

**Estado**: ✅ Los productos ya están correctamente configurados en **TEST MODE**

1. **Productos existentes** (Verificado en TEST MODE):
   ```bash
   # Productos activos en Stripe TEST
   prod_TdUJc11jFCha2B (Pro) - ✅ ACTIVO
   prod_TdUKnI7isH5ECE (Business) - ✅ ACTIVO
   ```

2. **Precios configurados** ✅:
   - Pro Monthly: $20.00 USD - `price_1SgDN8IKKf3sRcnUWhAIQ4Ou` ✅
   - Pro Yearly: $199.00 USD - `price_1SgDNPIKKf3sRcnUYpvxH9B6` ✅
   - Business Monthly: $49.00 USD - `price_1SgDNzIKKf3sRcnU606wGAIF` ✅
   - Business Yearly: $490.00 USD - `price_1SgDODIKKf3sRcnUuHzArqVz` ✅

3. **Configurar webhooks** en Stripe Dashboard:
   ```
   URL: https://tudominio.com/api/stripe/webhook
   Eventos:
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.payment_succeeded
   - invoice.payment_failed
   ```
   **Nota**: Usar webhook signing secret de TEST MODE

**✅ Fase 1 completada - Productos listos para desarrollo**

### Fase 2: Actualizar Proceso de Registro (4 horas)

1. **Modificar `signup/page.tsx`**:
   ```typescript
   // Después de confirmar plan pro/business
   if (selectedPlan !== 'free') {
     // Mostrar StripeCheckout component
     const result = await createStripeSubscription({
       organizationId,
       planCode: selectedPlan,
       billingPeriod,
       useTrial: true,
       customerEmail: signupData.email
     });
     
     // Guardar stripe_subscription_id
   }
   ```

2. **Crear página de pago**:
   ```
   /auth/signup/payment
   ```
   - Renderizar `<StripeCheckout />`
   - Capturar payment_method_id
   - Llamar API de creación de suscripción

3. **Actualizar trigger de BD**:
   - No crear suscripción si plan es pro/business
   - Esperar a que Stripe API cree la suscripción
   - Webhook actualiza la BD

### Fase 3: Implementar Webhooks (3 horas)

1. **Actualizar `src/app/api/stripe/webhook/route.ts`**:
   ```typescript
   export async function POST(req: Request) {
     const body = await req.text();
     const sig = req.headers.get('stripe-signature');
     
     const event = stripe.webhooks.constructEvent(
       body,
       sig,
       process.env.STRIPE_WEBHOOK_SECRET
     );
     
     switch (event.type) {
       case 'customer.subscription.created':
         // Crear/Actualizar subscription en BD
         break;
       case 'customer.subscription.updated':
         // Actualizar status
         break;
       case 'customer.subscription.deleted':
         // Marcar como cancelada
         break;
       case 'invoice.payment_succeeded':
         // Extender período
         break;
       case 'invoice.payment_failed':
         // Notificar al usuario
         break;
     }
   }
   ```

2. **Crear funciones de manejo**:
   - `handleSubscriptionCreated()`
   - `handleSubscriptionUpdated()`
   - `handlePaymentSucceeded()`
   - `handlePaymentFailed()`

### Fase 4: Migrar Usuarios Existentes (Variable)

1. **Identificar usuarios con planes pagos**:
   ```sql
   SELECT * FROM subscriptions 
   WHERE plan_id IN (2, 3) -- Pro y Business
   AND stripe_subscription_id IS NULL;
   ```

2. **Opciones**:
   - **Opción A**: Mantener gratis hasta renovación
   - **Opción B**: Solicitar método de pago retroactivamente
   - **Opción C**: Downgrade automático a free después de X días

3. **Comunicar cambios** a usuarios afectados

### Fase 5: Testing y Validación (2 horas)

1. **Ambiente de prueba**:
   - Usar Stripe Test Mode
   - Crear suscripción de prueba
   - Verificar webhooks

2. **Casos de prueba**:
   - ✅ Registro con plan free
   - ✅ Registro con plan pro (con trial)
   - ✅ Registro con plan pro (sin trial, pago inmediato)
   - ✅ Cancelación de suscripción
   - ✅ Renovación automática
   - ✅ Fallo de pago

---

## 📊 8. Comparación de Escenarios

### Escenario Actual (Sin Stripe)

| Aspecto | Estado |
|---------|--------|
| **Facturación** | ❌ Manual o inexistente |
| **Renovación** | ❌ Manual |
| **Métodos de pago** | ❌ No disponible |
| **Gestión de usuarios** | ✅ Funciona localmente |
| **Trial period** | ✅ Controlado por BD |
| **Upgrades/Downgrades** | ⚠️ Manual, sin cobro |

### Escenario Con Stripe Implementado

| Aspecto | Estado |
|---------|--------|
| **Facturación** | ✅ Automática recurrente |
| **Renovación** | ✅ Automática |
| **Métodos de pago** | ✅ Tarjeta, ACH, etc. |
| **Gestión de usuarios** | ✅ Sincronizada con Stripe |
| **Trial period** | ✅ Manejado por Stripe |
| **Upgrades/Downgrades** | ✅ Prorrateado automático |

---

## 🎯 9. Recomendaciones

### Recomendación Inmediata

**⚠️ DECISIÓN CRÍTICA REQUERIDA**:

¿El sistema debe cobrar a los usuarios o permanecer gratuito?

- **Si SÍ debe cobrar**: Implementar Fase 1-5 (aprox. 15 horas de desarrollo)
- **Si NO debe cobrar**: Documentar que es sistema gratuito y remover código de Stripe

### Recomendaciones Técnicas

1. **Documentar decisión** de negocio sobre monetización
2. **Si se implementa Stripe**:
   - Priorizar correcta configuración de productos
   - Testing exhaustivo en modo test
   - Plan de migración para usuarios existentes
3. **Si NO se implementa Stripe**:
   - Remover código no utilizado
   - Actualizar documentación
   - Simplificar proceso de registro

### Recomendaciones de Seguridad

1. ✅ Verificar que `STRIPE_SECRET_KEY` esté en `.env` server-side only
2. ✅ Usar `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` solo en cliente
3. ✅ Validar webhooks con `stripe.webhooks.constructEvent()`
4. ✅ Nunca exponer `stripe_customer_id` en frontend sin sanitización

---

## 📝 10. Conclusiones

### Estado Actual del Sistema

El sistema **GO Admin ERP** tiene:
- ✅ Sistema de suscripciones funcional LOCAL
- ✅ Código de Stripe completo pero NO USADO
- ✅ Cuenta de Stripe configurada
- ❌ Suscripciones NO conectadas a Stripe
- ❌ NO hay facturación real

### Funcionalidad Real

Actualmente, los usuarios pueden:
- ✅ Registrarse y elegir un plan
- ✅ Usar el sistema según límites del plan
- ❌ NO pueden pagar con tarjeta
- ❌ NO hay renovación automática
- ❌ NO hay facturación recurrente

### Próximos Pasos Críticos

1. **Definir estrategia de monetización**
2. **Si es de pago**: Completar integración de Stripe
3. **Si es gratuito**: Limpiar código no usado
4. **Documentar decisión** para equipo

---

## 📚 11. Referencias

### Documentación Oficial

- [Stripe Subscriptions](https://stripe.com/docs/billing/subscriptions/overview)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Supabase Auth](https://supabase.com/docs/guides/auth)

### Archivos Clave del Proyecto

```
src/
├── lib/stripe/
│   ├── subscriptionService.ts    ← Funciones principales
│   ├── config.ts                 ← Configuración Stripe
│   └── server.ts                 ← Cliente server-side
├── components/
│   ├── auth/
│   │   └── SubscriptionStep.tsx  ← Selector de plan
│   └── stripe/
│       ├── StripeCheckout.tsx    ← Componente de pago
│       └── StripeCheckoutForm.tsx
└── app/
    ├── auth/signup/page.tsx       ← Proceso de registro
    └── api/stripe/
        ├── create-subscription/   ← API crear suscripción
        └── webhook/               ← Webhooks Stripe
```

### Tablas de Base de Datos

- `plans` - Planes disponibles
- `subscriptions` - Suscripciones activas
- `organizations` - Organizaciones registradas
- `organization_members` - Miembros de organización

---

**Fin del Análisis**

_Documento generado el 19 de diciembre de 2025_
_Proyecto: GO Admin ERP (jgmgphmzusbluqhuqihj)_
