# 💳 Stripe Integration - GO Admin ERP

Documentación completa de la integración de Stripe para procesar pagos con tarjeta en GO Admin ERP.

---

## 📚 Documentación Disponible

### 🚀 [Guía de Integración Completa](./STRIPE_INTEGRATION_COMPLETE.md)
Guía paso a paso para implementar Stripe desde cero, incluyendo:
- Configuración de variables de entorno
- Estructura de archivos
- Instalación de dependencias
- Implementación backend y frontend
- Configuración de webhooks
- Despliegue a producción

### 🧪 [Guía de Testing](./STRIPE_TESTING.md)
Cómo probar la integración de Stripe:
- Configuración de test mode
- Tarjetas de prueba para diferentes escenarios
- Escenarios de testing (éxito, fallo, 3D Secure)
- Testing de webhooks con Stripe CLI
- Herramientas de debugging

### 🔧 [Troubleshooting](./STRIPE_TROUBLESHOOTING.md)
Solución de problemas comunes:
- Errores de configuración
- Errores de Payment Intent
- Errores de Webhook
- Errores de base de datos
- Errores de UI
- Performance issues

### 💡 [Ejemplo: Integración en POS](./STRIPE_POS_EXAMPLE.md)
Ejemplo práctico paso a paso para integrar Stripe en el módulo POS:
- Actualizar CheckoutDialog
- Implementar handlers
- Actualizar POSService
- Testing completo
- Personalización avanzada

---

## ⚡ Quick Start

### 1. Verificar Configuración

Las variables de entorno ya están configuradas en `.env.local`:

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY_HERE
STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
```

### 2. Instalar Dependencias

```bash
npm install stripe @stripe/stripe-js @stripe/react-stripe-js
```

### 3. Usar el Componente

```typescript
import { StripeCheckout } from '@/components/stripe'

<StripeCheckout
  amount={100.50}
  currency="usd"
  organizationId={2}
  branchId={1}
  onSuccess={(paymentIntentId) => {
    console.log('Pago exitoso:', paymentIntentId)
  }}
  onError={(error) => {
    console.error('Error:', error)
  }}
/>
```

---

## 📁 Estructura de Archivos

```
src/
├── lib/
│   └── stripe/
│       ├── config.ts              # Configuración cliente
│       ├── server.ts              # Cliente servidor
│       ├── types.ts               # Tipos TypeScript
│       └── paymentService.ts      # Lógica de pagos
│
├── hooks/
│   └── useStripePayment.ts        # Hook React
│
├── components/
│   └── stripe/
│       ├── StripeCheckout.tsx     # Componente principal
│       ├── StripeCheckoutForm.tsx # Formulario interno
│       ├── PaymentStatus.tsx      # Estado visual
│       └── index.ts               # Exportaciones
│
└── app/
    └── api/
        └── stripe/
            ├── create-payment-intent/
            │   └── route.ts       # API crear pago
            └── webhook/
                └── route.ts       # API webhook
```

---

## 🔑 Características Principales

### ✅ Payment Intents
- Creación segura de intenciones de pago
- Soporte para múltiples monedas
- Metadata personalizable

### ✅ Webhooks
- Verificación de firma
- Procesamiento automático de eventos
- Actualización de base de datos

### ✅ Componentes UI
- Formulario seguro de Stripe Elements
- Soporte para tema claro/oscuro
- Estados visuales claros
- Responsive design

### ✅ Integración con BD
- Registro automático de pagos
- Actualización de balances
- Triggers de sincronización

### ✅ Seguridad
- Cifrado SSL
- Verificación de firma de webhook
- RLS policies de Supabase
- No almacenamiento de datos de tarjeta

---

## 💡 Casos de Uso

### 1. POS - Punto de Venta
Procesar pagos con tarjeta en el checkout del POS.

**Ver:** [STRIPE_POS_EXAMPLE.md](./STRIPE_POS_EXAMPLE.md)

### 2. Cuentas por Cobrar
Aplicar abonos a cuentas por cobrar usando tarjeta.

```typescript
<StripeCheckout
  amount={cuenta.balance}
  currency="usd"
  accountReceivableId={cuenta.id}
  customerId={cuenta.customer_id}
  // ...
/>
```

### 3. Facturas
Pagar facturas pendientes con tarjeta.

```typescript
<StripeCheckout
  amount={factura.balance}
  currency={factura.currency}
  invoiceId={factura.id}
  customerId={factura.customer_id}
  // ...
/>
```

### 4. Pagos Manuales
Procesar pagos independientes.

```typescript
<StripeCheckout
  amount={monto}
  currency="usd"
  description="Pago manual"
  metadata={{ tipo: 'manual', referencia: '...' }}
  // ...
/>
```

---

## 🌍 Monedas Soportadas

Stripe soporta más de 135 monedas. Las más comunes:

| Código | Moneda | Mínimo |
|--------|--------|--------|
| USD | Dólar estadounidense | $0.50 |
| EUR | Euro | €0.50 |
| GBP | Libra esterlina | £0.30 |
| CAD | Dólar canadiense | $0.50 |
| MXN | Peso mexicano | $10.00 |
| COP | Peso colombiano | $1,500 |
| BRL | Real brasileño | R$0.50 |
| ARS | Peso argentino | $0.50 |

---

## 🔐 Seguridad

### Best Practices Implementadas

1. **Variables de entorno:**
   - Claves secretas en servidor
   - Claves públicas en cliente
   - No hardcodear credenciales

2. **Verificación de webhook:**
   - Firma verificada con STRIPE_WEBHOOK_SECRET
   - Body raw sin parsear antes de verificar

3. **No almacenar datos de tarjeta:**
   - Stripe maneja todos los datos sensibles
   - Solo guardamos Payment Intent ID

4. **Autenticación:**
   - Usuario autenticado con Supabase
   - Verificación de pertenencia a organización
   - RLS policies activas

5. **PCI Compliance:**
   - Stripe es PCI DSS Level 1 compliant
   - No necesitas certificación PCI

---

## 📊 Monitoreo

### Stripe Dashboard

- **Payments:** https://dashboard.stripe.com/payments
- **Logs:** https://dashboard.stripe.com/logs
- **Webhooks:** https://dashboard.stripe.com/webhooks
- **Events:** https://dashboard.stripe.com/events

### Logs de Aplicación

```bash
# Desarrollo
npm run dev

# Producción (Vercel)
vercel logs --follow
```

### Base de Datos

```sql
-- Pagos con Stripe
SELECT * FROM payments 
WHERE payment_method = 'card' 
AND reference LIKE 'pi_%'
ORDER BY created_at DESC;

-- Ventas pagadas con tarjeta
SELECT * FROM sales 
WHERE payment_method = 'card'
ORDER BY created_at DESC;
```

---

## 🚀 Roadmap

### Implementado ✅
- [x] Payment Intents básicos
- [x] Webhooks
- [x] Componentes UI
- [x] Integración con POS
- [x] Soporte múltiples monedas
- [x] Testing completo
- [x] Documentación

### Por Implementar 🔄
- [ ] Pagos recurrentes (subscripciones)
- [ ] Stripe Connect (para marketplace)
- [ ] Apple Pay / Google Pay
- [ ] Link payment method
- [ ] Reembolsos automáticos
- [ ] Reportes financieros con Stripe data

---

## 📞 Soporte

### Documentación Interna
- [Guía Completa](./STRIPE_INTEGRATION_COMPLETE.md)
- [Testing](./STRIPE_TESTING.md)
- [Troubleshooting](./STRIPE_TROUBLESHOOTING.md)
- [Ejemplo POS](./STRIPE_POS_EXAMPLE.md)

### Stripe
- **Documentación:** https://stripe.com/docs
- **API Reference:** https://stripe.com/docs/api
- **Support:** https://support.stripe.com
- **Status:** https://status.stripe.com

### GO Admin ERP
- **GitHub:** https://github.com/Palomo-dev/go-admin-erp
- **Email:** soporte@goadmin.io

---

## 📄 Licencia

Esta integración es parte de GO Admin ERP y sigue la misma licencia del proyecto principal.

---

## 🙏 Créditos

- **Stripe:** Por proporcionar una excelente plataforma de pagos
- **Next.js:** Framework usado para la aplicación
- **Supabase:** Backend y base de datos
- **Vercel:** Hosting y deployment

---

**Última actualización:** Enero 2025  
**Versión:** 1.0.0  
**Autor:** Equipo GO Admin ERP
