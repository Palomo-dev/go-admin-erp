# 🎯 Sistema de Suscripciones con Stripe - GO Admin ERP

## ✅ Archivos Creados

### Backend
1. ✅ **`src/lib/stripe/subscriptionService.ts`** - Servicio de suscripciones
2. ✅ **`src/app/api/stripe/create-subscription/route.ts`** - API para crear suscripciones
3. ✅ **`src/app/api/stripe/setup-subscription-products/route.ts`** - API para setup inicial
4. ✅ **`src/app/api/stripe/webhook/route.ts`** - Webhook actualizado con eventos de suscripciones

---

## 📋 Pasos Pendientes para Completar

### Paso 1: Crear Productos y Precios en Stripe

Ejecuta estos comandos para configurar los productos en Stripe:

```bash
# En tu terminal o Postman

# 1. Crear producto y precios para Plan Básico
curl -X POST https://app.goadmin.io/api/stripe/setup-subscription-products \
  -H "Content-Type: application/json" \
  -d '{"planCode": "basic"}'

# 2. Crear producto y precios para Plan Pro
curl -X POST https://app.goadmin.io/api/stripe/setup-subscription-products \
  -H "Content-Type: application/json" \
  -d '{"planCode": "pro"}'
```

**Resultado esperado:**
```json
{
  "success": true,
  "product": {
    "id": "prod_...",
    "name": "Plan Básico - GO Admin ERP"
  },
  "prices": {
    "monthly": {
      "id": "price_...",
      "amount": 2000
    },
    "yearly": {
      "id": "price_...",
      "amount": 19200
    }
  }
}
```

---

### Paso 2: Actualizar Tabla `plans` con IDs de Stripe

Después de crear los productos, actualiza la tabla `plans` con los IDs generados:

```sql
-- Plan Básico (code: 'pro')
UPDATE plans
SET 
  stripe_product_id = 'prod_XXX', -- ID del producto creado
  stripe_price_monthly_id = 'price_XXX', -- ID del precio mensual
  stripe_price_yearly_id = 'price_XXX' -- ID del precio anual
WHERE code = 'pro';

-- Plan Pro (code: 'enterprise')
UPDATE plans
SET 
  stripe_product_id = 'prod_YYY',
  stripe_price_monthly_id = 'price_YYY',
  stripe_price_yearly_id = 'price_YYY'
WHERE code = 'enterprise';
```

---

### Paso 3: Actualizar Nombres de Planes (Opcional)

Los nombres actuales están invertidos. Corrígelos:

```sql
-- Actualizar nombres correctos
UPDATE plans SET name = 'Plan Básico' WHERE code = 'pro';
UPDATE plans SET name = 'Plan Pro' WHERE code = 'enterprise';
```

---

### Paso 4: Verificar Tabla `subscriptions`

Asegúrate de que la tabla `subscriptions` exista con esta estructura:

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL, -- 'trialing', 'active', 'canceled', 'past_due', etc.
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancel_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_organization ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

---

### Paso 5: Actualizar SubscriptionStep Component

El componente `src/components/auth/SubscriptionStep.tsx` necesita actualizarse para incluir:

#### Opciones a Mostrar:

1. **Con Trial (15 días gratis):**
   - Botón: "Empezar con 15 días gratis"
   - No requiere tarjeta inmediata
   - Se facturará después del trial

2. **Sin Trial (Pagar ahora):**
   - Botón: "Empezar ahora y pagar"
   - Requiere ingresar tarjeta
   - Se cobra inmediatamente
   - Opción para pago anual con 20% descuento

#### Código de Referencia:

```typescript
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'

interface SubscriptionStepProps {
  formData: {
    subscriptionPlan?: string
    billingPeriod?: 'monthly' | 'yearly'
    useTrial?: boolean
  }
  updateFormData: (data: any) => void
  onNext: () => void
  onBack: () => void
  loading?: boolean
}

export default function SubscriptionStep({
  formData,
  updateFormData,
  onNext,
  onBack,
  loading,
}: SubscriptionStepProps) {
  const [selectedPlan, setSelectedPlan] = useState(formData.subscriptionPlan || 'basic')
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(formData.billingPeriod || 'monthly')
  const [useTrial, setUseTrial] = useState(formData.useTrial !== false)

  const plans = {
    basic: {
      name: 'Plan Básico',
      monthlyPrice: 20,
      yearlyPrice: 192,
      features: [
        'Hasta 10 módulos',
        'Hasta 5 sucursales',
        '50GB de almacenamiento',
        'Soporte por email',
        '15 días de prueba gratis',
      ],
    },
    pro: {
      name: 'Plan Pro',
      monthlyPrice: 40,
      yearlyPrice: 384,
      features: [
        'Hasta 100 módulos',
        'Hasta 50 sucursales',
        '1TB de almacenamiento',
        'Soporte prioritario 24/7',
        'Gerente de cuenta dedicado',
        '15 días de prueba gratis',
      ],
    },
  }

  const handleContinue = () => {
    updateFormData({
      subscriptionPlan: selectedPlan,
      billingPeriod,
      useTrial,
    })
    onNext()
  }

  const currentPlan = plans[selectedPlan as keyof typeof plans]
  const price = billingPeriod === 'monthly' ? currentPlan.monthlyPrice : currentPlan.yearlyPrice

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Selecciona tu Plan</h2>
        <p className="text-gray-600 mt-2">
          Todos los planes incluyen 15 días de prueba gratis
        </p>
      </div>

      {/* Selector de periodo de facturación */}
      <div className="flex justify-center gap-2 p-1 bg-gray-100 rounded-lg inline-flex mx-auto">
        <button
          onClick={() => setBillingPeriod('monthly')}
          className={\`px-4 py-2 rounded-md \${billingPeriod === 'monthly' ? 'bg-white shadow' : ''}\`}
        >
          Mensual
        </button>
        <button
          onClick={() => setBillingPeriod('yearly')}
          className={\`px-4 py-2 rounded-md \${billingPeriod === 'yearly' ? 'bg-white shadow' : ''}\`}
        >
          Anual <span className="text-green-600 text-xs ml-1">-20%</span>
        </button>
      </div>

      {/* Planes */}
      <div className="grid md:grid-cols-2 gap-4">
        {Object.entries(plans).map(([key, plan]) => (
          <Card
            key={key}
            onClick={() => setSelectedPlan(key)}
            className={\`cursor-pointer \${selectedPlan === key ? 'ring-2 ring-blue-500' : ''}\`}
          >
            <CardContent className="p-6">
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <div className="mt-4">
                <span className="text-3xl font-bold">
                  \${billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice}
                </span>
                <span className="text-gray-600">
                  /{billingPeriod === 'monthly' ? 'mes' : 'año'}
                </span>
              </div>
              <ul className="mt-6 space-y-2">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Opción de trial */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <input
            type="checkbox"
            checked={useTrial}
            onChange={(e) => setUseTrial(e.target.checked)}
            className="h-4 w-4"
          />
          <label className="text-sm">
            Usar 15 días de prueba gratis (no se requiere tarjeta)
          </label>
        </div>

        {!useTrial && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-800">
              💳 Se te cobrará inmediatamente \${price} {billingPeriod === 'monthly' ? 'USD/mes' : 'USD/año'}
            </p>
          </div>
        )}
      </div>

      {/* Botones */}
      <div className="flex justify-between">
        <Button onClick={onBack} variant="outline">
          Atrás
        </Button>
        <Button onClick={handleContinue} disabled={loading}>
          {useTrial ? 'Empezar con 15 días gratis' : 'Continuar al pago'}
        </Button>
      </div>
    </div>
  )
}
```

---

### Paso 6: Actualizar Flujo de Signup

En `src/app/auth/signup/page.tsx`, actualizar el método `handleAuthSignup` para crear la suscripción:

```typescript
const handleAuthSignup = async () => {
  setLoading(true)
  setError(null)

  try {
    // ... código existente de creación de usuario ...

    // Después de crear el usuario y ANTES de avanzar al paso de verificación
    // Si eligió un plan de pago (no free)
    if (signupData.subscriptionPlan !== 'free' && signupData.useTrial) {
      // Crear suscripción con trial
      const subscriptionResponse = await fetch('/api/stripe/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: organizationId, // Del signup
          planCode: signupData.subscriptionPlan,
          billingPeriod: signupData.billingPeriod,
          useTrial: true,
        }),
      })

      if (!subscriptionResponse.ok) {
        throw new Error('Error creando suscripción')
      }

      console.log('✅ Suscripción con trial creada')
    }

    // Avanzar al paso de verificación
    nextStep()
    
  } catch (err: any) {
    console.error('Error en registro:', err)
    setError(err.message || 'Error al crear la cuenta')
  } finally {
    setLoading(false)
  }
}
```

---

### Paso 7: Configurar Webhook en Stripe Dashboard

1. Ir a: https://dashboard.stripe.com/webhooks
2. Agregar endpoint: `https://app.goadmin.io/api/stripe/webhook`
3. Seleccionar eventos:
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `customer.subscription.trial_will_end`
   - ✅ `invoice.payment_succeeded`
   - ✅ `invoice.payment_failed`
   - ✅ `payment_intent.succeeded`
   - ✅ `payment_intent.payment_failed`
4. Copiar el **Signing secret** y agregarlo a `.env.local`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

---

## 🧪 Testing

### 1. Con Trial (15 días gratis)

```bash
# Usuario se registra y selecciona plan con trial
# No ingresa tarjeta
# Se crea suscripción con status: 'trialing'
# Después de 15 días, Stripe intentará cobrar
```

### 2. Sin Trial (Pago inmediato)

```bash
# Usuario se registra y desmarca opción de trial
# Ingresa datos de tarjeta
# Se cobra inmediatamente
# Suscripción status: 'active'
```

### Tarjetas de Prueba

```
Éxito: 4242 4242 4242 4242
Fallo: 4000 0000 0000 0002
3D Secure: 4000 0025 0000 3155
```

---

## 📊 Flujo Completo

```
1. Usuario en signup selecciona plan ($20/mes o $40/mes)
2. Usuario elige:
   a) CON TRIAL: 15 días gratis → No paga ahora
   b) SIN TRIAL: Ingresar tarjeta → Pagar ahora
3. Se crea suscripción en Stripe
4. Webhook actualiza BD
5. Después de trial (si aplica), Stripe cobra automáticamente
6. Usuario puede cancelar o cambiar plan desde app
```

---

## ✅ Checklist Final

- [ ] Productos y precios creados en Stripe
- [ ] Tabla `plans` actualizada con IDs de Stripe
- [ ] Tabla `subscriptions` creada
- [ ] SubscriptionStep actualizado con opciones
- [ ] Webhook configurado en Stripe Dashboard
- [ ] Variables de entorno configuradas
- [ ] Testing con tarjetas de prueba exitoso

---

## 🚀 Próximos Pasos

1. Crear página de gestión de suscripción en `/app/organizacion/plan`
2. Permitir cambio de plan
3. Permitir cancelación de suscripción
4. Enviar emails de recordatorio antes de finalizar trial
5. Implementar webhooks para suspension por falta de pago

---

**Fecha de creación:** Enero 2025  
**Autor:** GO Admin ERP Team
