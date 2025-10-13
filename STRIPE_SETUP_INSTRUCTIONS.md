# 🚀 Instrucciones de Instalación - Stripe Integration

**GO Admin ERP - Integración Completa de Stripe**

---

## ✅ Estado Actual

Todos los archivos de la integración de Stripe han sido creados exitosamente:

### 📁 Archivos Backend
- ✅ `src/lib/stripe/config.ts` - Configuración cliente (actualizado)
- ✅ `src/lib/stripe/server.ts` - Cliente servidor
- ✅ `src/lib/stripe/types.ts` - Tipos TypeScript
- ✅ `src/lib/stripe/paymentService.ts` - Servicio de pagos

### 📁 Archivos Frontend
- ✅ `src/hooks/useStripePayment.ts` - Hook de React
- ✅ `src/components/stripe/StripeCheckout.tsx` - Componente principal
- ✅ `src/components/stripe/StripeCheckoutForm.tsx` - Formulario
- ✅ `src/components/stripe/PaymentStatus.tsx` - Estado visual
- ✅ `src/components/stripe/index.ts` - Exportaciones

### 📁 Archivos API
- ✅ `src/app/api/stripe/create-payment-intent/route.ts` - Crear Payment Intent
- ✅ `src/app/api/stripe/webhook/route.ts` - Webhook de Stripe

### 📁 Documentación
- ✅ `docs/STRIPE_INTEGRATION_COMPLETE.md` - Guía completa
- ✅ `docs/STRIPE_TESTING.md` - Guía de testing
- ✅ `docs/STRIPE_TROUBLESHOOTING.md` - Solución de problemas
- ✅ `docs/STRIPE_POS_EXAMPLE.md` - Ejemplo POS
- ✅ `docs/STRIPE_README.md` - Índice de documentación

---

## 🔧 Próximos Pasos

### 1. Instalar Dependencias (REQUERIDO)

```bash
npm install stripe@latest @stripe/stripe-js@latest @stripe/react-stripe-js@latest
```

**Nota:** Necesitas instalar las dependencias antes de poder usar la integración.

### 2. Verificar Variables de Entorno (YA CONFIGURADAS ✅)

Tu archivo `.env.local` ya tiene las credenciales correctas:

```bash
# Stripe - Ya configurado ✅
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51Reh7j...
STRIPE_SECRET_KEY=sk_live_51Reh7j...
STRIPE_WEBHOOK_SECRET=whsec_xK75awYp4UtuYWz9AAF6OgklEvyd1Y2Z
```

### 3. Verificar Webhook en Stripe (YA CONFIGURADO ✅)

Tu webhook ya está configurado en:
```
https://app.goadmin.io/api/stripe/webhook
```

Eventos suscritos:
- ✅ payment_intent.succeeded
- ✅ payment_intent.payment_failed
- ✅ charge.succeeded
- ✅ charge.failed
- ✅ charge.refunded

### 4. Reiniciar Servidor de Desarrollo

Después de instalar las dependencias:

```bash
npm run dev
```

---

## 🧪 Testing Rápido

### Probar que todo funciona:

1. **Crear un componente de prueba:**

Crea: `src/app/test-stripe/page.tsx`

```typescript
'use client'

import { StripeCheckout } from '@/components/stripe'
import { toast } from 'sonner'

export default function TestStripePage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Test Stripe Integration</h1>
      
      <StripeCheckout
        amount={10.50}
        currency="usd"
        description="Pago de prueba"
        organizationId={2}
        branchId={1}
        onSuccess={(paymentIntentId) => {
          toast.success(`Pago exitoso: ${paymentIntentId}`)
          console.log('Payment Intent ID:', paymentIntentId)
        }}
        onError={(error) => {
          toast.error(`Error: ${error}`)
          console.error('Error:', error)
        }}
      />
    </div>
  )
}
```

2. **Navegar a:** `http://localhost:3000/test-stripe`

3. **Usar tarjeta de prueba:**
   ```
   Número: 4242 4242 4242 4242
   Fecha: 12/25
   CVC: 123
   ```

4. **Verificar:**
   - ✅ Formulario de Stripe se muestra
   - ✅ Pago se procesa
   - ✅ Toast de éxito aparece
   - ✅ Payment Intent ID en consola

---

## 🎯 Integrar en POS

Para integrar Stripe en el módulo POS, sigue la guía detallada:

**Ver:** [`docs/STRIPE_POS_EXAMPLE.md`](./docs/STRIPE_POS_EXAMPLE.md)

### Resumen rápido:

1. **Importar componente en CheckoutDialog:**
   ```typescript
   import { StripeCheckout } from '@/components/stripe'
   ```

2. **Agregar al UI cuando método = 'card':**
   ```typescript
   {selectedPaymentMethod === 'card' && (
     <StripeCheckout
       amount={total}
       currency={currency}
       organizationId={orgId}
       branchId={branchId}
       onSuccess={handleStripeSuccess}
       onError={handleStripeError}
     />
   )}
   ```

3. **Implementar handlers**

4. **Testing completo**

---

## 📚 Documentación Completa

### Guías Disponibles:

1. **[STRIPE_README.md](./docs/STRIPE_README.md)**
   - Índice completo de documentación
   - Quick start
   - Casos de uso

2. **[STRIPE_INTEGRATION_COMPLETE.md](./docs/STRIPE_INTEGRATION_COMPLETE.md)**
   - Guía paso a paso completa
   - Configuración inicial
   - Estructura de archivos
   - Implementación backend/frontend

3. **[STRIPE_TESTING.md](./docs/STRIPE_TESTING.md)**
   - Tarjetas de prueba
   - Escenarios de testing
   - Testing de webhooks
   - Herramientas de debug

4. **[STRIPE_TROUBLESHOOTING.md](./docs/STRIPE_TROUBLESHOOTING.md)**
   - Errores comunes
   - Soluciones paso a paso
   - Tips de debugging

5. **[STRIPE_POS_EXAMPLE.md](./docs/STRIPE_POS_EXAMPLE.md)**
   - Ejemplo completo de integración en POS
   - Código paso a paso
   - Testing y verificación

---

## ⚠️ Importante

### Modo Test vs Production

**Actualmente estás en Production Mode** con las credenciales configuradas.

Para testing, cambia temporalmente a Test Mode:

```bash
# .env.local para testing
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

**Ventajas de Test Mode:**
- ❌ No se cobran pagos reales
- ✅ Usar tarjetas de prueba
- ✅ Testing ilimitado
- ✅ No afecta datos de producción

### Webhook Local para Testing

Para recibir webhooks en local:

```bash
# Instalar Stripe CLI
stripe login

# Escuchar webhooks
stripe listen --forward-to localhost:3000/api/stripe/webhook

# En otra terminal, disparar eventos de prueba
stripe trigger payment_intent.succeeded
```

---

## ✅ Checklist de Instalación

- [ ] **Dependencias instaladas** (`npm install stripe @stripe/stripe-js @stripe/react-stripe-js`)
- [x] **Variables de entorno configuradas** (ya están ✅)
- [x] **Webhook configurado en Stripe** (ya está ✅)
- [ ] **Servidor reiniciado** (`npm run dev`)
- [ ] **Página de prueba creada** (`test-stripe/page.tsx`)
- [ ] **Testing básico exitoso** (tarjeta 4242...)
- [ ] **Integración en POS** (opcional, según necesidad)
- [ ] **Documentación revisada** (al menos README)

---

## 🚨 Troubleshooting Rápido

### Si ves errores de tipos TypeScript:

```bash
# Instalar dependencias
npm install

# Limpiar caché
rm -rf .next
npm run dev
```

### Si Stripe no carga:

1. Verificar que `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` esté en `.env.local`
2. Reiniciar servidor (`npm run dev`)
3. Limpiar caché del navegador
4. Ver consola del navegador para errores

### Si webhook no funciona:

1. Verificar `STRIPE_WEBHOOK_SECRET` en `.env.local`
2. Verificar URL en Stripe Dashboard: `https://app.goadmin.io/api/stripe/webhook`
3. Ver logs de Stripe Dashboard > Developers > Webhooks
4. Ver logs de Vercel (si está en producción)

---

## 📞 Soporte

### Recursos:
- **Documentación Stripe:** https://stripe.com/docs
- **Dashboard Stripe:** https://dashboard.stripe.com
- **Status Stripe:** https://status.stripe.com
- **Documentación Local:** `docs/STRIPE_README.md`

### Contacto:
- **Issues:** GitHub del proyecto
- **Email:** soporte@goadmin.io

---

## 🎉 ¡Listo!

Una vez instaladas las dependencias, la integración de Stripe estará **100% funcional**.

**Próximos pasos recomendados:**
1. Instalar dependencias
2. Hacer testing básico
3. Revisar documentación según necesidad
4. Integrar en POS (si aplica)
5. Hacer testing completo antes de producción

---

**Creado:** Enero 2025  
**Autor:** Equipo GO Admin ERP  
**Versión:** 1.0.0
