# 🔧 Troubleshooting - Stripe Integration

Guía de solución de problemas comunes con la integración de Stripe en GO Admin ERP.

---

## 📋 Tabla de Contenidos

1. [Errores de Configuración](#errores-de-configuración)
2. [Errores de Payment Intent](#errores-de-payment-intent)
3. [Errores de Webhook](#errores-de-webhook)
4. [Errores de Base de Datos](#errores-de-base-de-datos)
5. [Errores de UI](#errores-de-ui)
6. [Performance Issues](#performance-issues)

---

## ⚙️ Errores de Configuración

### Error: "STRIPE_SECRET_KEY no está configurada"

**Síntoma:**
```
Error: STRIPE_SECRET_KEY no está configurada
```

**Causa:**
La variable de entorno no está disponible en el servidor.

**Solución:**
1. Verificar `.env.local`:
   ```bash
   STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY
   ```

2. Si está en Vercel:
   - Ir a Settings > Environment Variables
   - Agregar `STRIPE_SECRET_KEY`
   - Redesplegar la aplicación

3. Reiniciar servidor de desarrollo:
   ```bash
   npm run dev
   ```

---

### Error: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY no está configurada"

**Síntoma:**
Warning en consola, Stripe no se carga.

**Causa:**
Variable de entorno pública no configurada.

**Solución:**
1. Verificar `.env.local`:
   ```bash
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51Reh7j...
   ```

2. **Importante:** Las variables `NEXT_PUBLIC_*` se leen en build time.

3. Reconstruir la aplicación:
   ```bash
   npm run build
   npm run dev
   ```

---

### Error: "STRIPE_WEBHOOK_SECRET no está configurado"

**Síntoma:**
```
Error: STRIPE_WEBHOOK_SECRET no está configurado
```

**Causa:**
Secret del webhook no está en las variables de entorno.

**Solución:**
1. Obtener el secret del Stripe Dashboard:
   - Ir a Developers > Webhooks
   - Clic en el webhook
   - Copiar "Signing secret"

2. Agregar a `.env.local`:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xK75awYp4UtuYWz9AAF6OgklEvyd1Y2Z
   ```

3. En Vercel, agregar la variable y redesplegar.

---

## 💳 Errores de Payment Intent

### Error: "Amount must be at least $0.50 usd"

**Síntoma:**
```
Error: Amount must be at least $0.50 usd
```

**Causa:**
El monto es menor al mínimo permitido por Stripe.

**Solución:**
Verificar que el monto sea mayor al mínimo:

| Moneda | Mínimo |
|--------|--------|
| USD | $0.50 |
| EUR | €0.50 |
| GBP | £0.30 |
| MXN | $10.00 |
| COP | $1,500 |

**Código:**
```typescript
// En paymentService.ts
if (!isValidAmount(amount, currency)) {
  throw new Error('Monto inválido')
}
```

---

### Error: "Your card was declined"

**Síntoma:**
El pago es rechazado por el banco.

**Causas Comunes:**
- Fondos insuficientes
- Tarjeta vencida
- CVC incorrecto
- Tarjeta reportada como perdida/robada
- Límite de transacciones excedido

**Solución:**
1. Verificar detalles de la tarjeta
2. Contactar al banco emisor
3. Intentar con otra tarjeta

**En Test Mode:**
- Usar tarjetas de prueba correctas
- Ver [STRIPE_TESTING.md](./STRIPE_TESTING.md)

---

### Error: "Payment requires authentication"

**Síntoma:**
El pago requiere autenticación 3D Secure pero no se muestra el modal.

**Causa:**
Configuración incorrecta de `confirmPayment`.

**Solución:**
Verificar en `useStripePayment.ts`:
```typescript
const { error, paymentIntent } = await stripe.confirmPayment({
  elements,
  confirmParams: {
    return_url: options.returnUrl || `${window.location.origin}/app/pos`,
  },
  redirect: 'if_required', // ← Importante
})
```

---

### Error: "Invalid API Key provided"

**Síntoma:**
```
Error: Invalid API Key provided: sk_live_****
```

**Causa:**
La clave API es incorrecta o está mezclada (test/live).

**Solución:**
1. Verificar que las claves sean del mismo ambiente:
   - **Test:** `pk_test_...` y `sk_test_...`
   - **Live:** `pk_live_...` y `sk_live_...`

2. Copiar claves directamente del Stripe Dashboard
3. No mezclar test y live mode

---

## 🔌 Errores de Webhook

### Error: "Webhook signature verification failed"

**Síntoma:**
```
Error: Webhook signature verification failed
```

**Causa:**
El webhook secret no coincide o el body fue modificado.

**Solución:**

1. **Verificar el secret:**
   ```bash
   # En .env.local
   STRIPE_WEBHOOK_SECRET=whsec_xK75awYp4UtuYWz9AAF6OgklEvyd1Y2Z
   ```

2. **No parsear el body antes de verificar:**
   ```typescript
   // ❌ INCORRECTO
   const body = await request.json()
   
   // ✅ CORRECTO
   const body = await request.text()
   ```

3. **Regenerar el webhook secret:**
   - Stripe Dashboard > Developers > Webhooks
   - Eliminar webhook existente
   - Crear nuevo webhook
   - Copiar nuevo secret

4. **Testing local con Stripe CLI:**
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

---

### Error: "Webhook endpoint returned error 401"

**Síntoma:**
Webhook recibido pero retorna 401 Unauthorized.

**Causa:**
La verificación de autenticación está bloqueando el webhook.

**Solución:**
Los webhooks de Stripe **no deben** requerir autenticación de usuario.

**Verificar en `route.ts`:**
```typescript
// ❌ NO hacer esto
const user = await supabase.auth.getUser()
if (!user) return 401

// ✅ Solo verificar la firma de Stripe
const event = constructWebhookEvent(body, signature)
```

---

### Error: "Webhook timeout"

**Síntoma:**
Webhook tarda más de 5 segundos y Stripe lo marca como fallido.

**Causa:**
Procesamiento lento en el webhook handler.

**Solución:**

1. **Responder rápido a Stripe:**
   ```typescript
   // Procesar de forma asíncrona
   processWebhookAsync(event) // No await aquí
   
   // Responder inmediatamente
   return NextResponse.json({ received: true })
   ```

2. **Usar cola de trabajos:**
   - Guardar evento en BD
   - Procesar después con un worker

3. **Optimizar queries a BD:**
   - Usar índices
   - Minimizar consultas

---

## 💾 Errores de Base de Datos

### Error: "Error guardando pago en BD"

**Síntoma:**
El pago se procesa en Stripe pero no se guarda en Supabase.

**Causa:**
Faltan campos requeridos o hay violación de constraints.

**Solución:**

1. **Verificar campos requeridos:**
   ```typescript
   const paymentData = {
     organization_id, // ✅ Requerido
     branch_id,       // ✅ Requerido
     amount,          // ✅ Requerido
     payment_method,  // ✅ Requerido
     source,          // ✅ Requerido
     created_by,      // ✅ Requerido
     reference,       // Stripe Payment Intent ID
     status: 'completed',
   }
   ```

2. **Ver error específico:**
   ```typescript
   if (paymentError) {
     console.error('❌ Error guardando pago:', paymentError)
     console.error('Datos enviados:', paymentData)
   }
   ```

3. **Verificar RLS policies:**
   - Supabase Dashboard > Authentication > Policies
   - Verificar que la policy permita INSERT

---

### Error: "Balance not updating"

**Síntoma:**
El pago se registra pero el balance no se actualiza.

**Causa:**
Los triggers de BD no están funcionando o hay error en la lógica.

**Solución:**

1. **Verificar trigger:**
   ```sql
   -- En Supabase SQL Editor
   SELECT * FROM pg_trigger 
   WHERE tgname = 'update_accounts_receivable_on_payment';
   ```

2. **Verificar función del trigger:**
   ```sql
   SELECT prosrc FROM pg_proc 
   WHERE proname = 'update_accounts_receivable_on_payment';
   ```

3. **Activar logging:**
   ```sql
   -- Agregar logs en la función
   RAISE NOTICE 'Actualizando balance: %', NEW.amount;
   ```

4. **Actualizar manualmente si es necesario:**
   ```typescript
   await updateSaleBalance(saleId, paymentAmount)
   await updateInvoiceBalance(invoiceId, paymentAmount)
   ```

---

## 🎨 Errores de UI

### Error: "Stripe Elements not loading"

**Síntoma:**
El formulario de pago no se muestra.

**Causa:**
Problema cargando Stripe.js o falta el clientSecret.

**Solución:**

1. **Verificar que Stripe se carga:**
   ```typescript
   const stripe = await getStripe()
   if (!stripe) {
     console.error('❌ Stripe no se pudo cargar')
   }
   ```

2. **Verificar clientSecret:**
   ```typescript
   if (!clientSecret) {
     console.error('❌ No hay client secret')
   }
   ```

3. **Ver errores en consola:**
   - Abrir DevTools > Console
   - Buscar errores de red o CORS

---

### Error: "Elements instance already created"

**Síntoma:**
```
Error: You cannot create multiple Elements instances with the same clientSecret
```

**Causa:**
Intentando crear múltiples instancias de Elements con el mismo clientSecret.

**Solución:**

1. **Limpiar el estado al cerrar:**
   ```typescript
   const handleCancel = () => {
     setShowForm(false)
     setClientSecret(null) // ← Limpiar
   }
   ```

2. **Usar key en Elements:**
   ```typescript
   <Elements 
     key={clientSecret}
     stripe={stripePromise}
     options={{ clientSecret }}
   >
   ```

---

### Error: "Payment form is disabled"

**Síntoma:**
El botón de pago está deshabilitado y no se puede enviar.

**Causa:**
El estado `isReady` es false.

**Solución:**

```typescript
const { isReady, isProcessing } = useStripePayment()

<Button 
  disabled={!isReady || isProcessing}
>
  Pagar
</Button>
```

**Verificar:**
- Que Stripe esté cargado
- Que Elements esté montado
- Que no haya errores en el formulario

---

## ⚡ Performance Issues

### Problema: "Stripe takes too long to load"

**Síntoma:**
La página tarda mucho en cargar Stripe.

**Solución:**

1. **Cargar Stripe solo cuando sea necesario:**
   ```typescript
   // No cargar en todas las páginas
   // Solo en checkout
   ```

2. **Usar lazy loading:**
   ```typescript
   const StripeCheckout = dynamic(
     () => import('@/components/stripe/StripeCheckout'),
     { ssr: false }
   )
   ```

---

### Problema: "Multiple Payment Intents created"

**Síntoma:**
Se crean múltiples Payment Intents para el mismo pago.

**Causa:**
El usuario hace clic múltiples veces o hay re-renders.

**Solución:**

1. **Deshabilitar botón mientras se crea:**
   ```typescript
   <Button 
     onClick={handleInitiatePayment}
     disabled={isLoading}
   >
     {isLoading ? 'Iniciando...' : 'Pagar'}
   </Button>
   ```

2. **Prevenir doble clic:**
   ```typescript
   const [isCreating, setIsCreating] = useState(false)
   
   const handleCreate = async () => {
     if (isCreating) return // ← Prevenir
     setIsCreating(true)
     // ... crear Payment Intent
     setIsCreating(false)
   }
   ```

---

## 🔍 Debugging Tips

### Ver logs de Stripe

1. **Dashboard > Developers > Logs:**
   - Ver todas las peticiones API
   - Ver errores y respuestas
   - Filtrar por tipo de petición

2. **Dashboard > Developers > Events:**
   - Ver todos los eventos
   - Ver webhooks enviados
   - Verificar respuestas

### Logs del Servidor

```bash
# Ver logs en tiempo real
npm run dev

# Ver logs de Vercel
vercel logs --follow
```

### Logs del Frontend

```typescript
// Agregar logs temporales
console.log('🔍 Stripe:', await getStripe())
console.log('🔍 Client Secret:', clientSecret)
console.log('🔍 Payment Intent:', paymentIntent)
```

---

## 📞 Soporte

### Stripe Support

- **Email:** support@stripe.com
- **Chat:** https://support.stripe.com/contact
- **Documentation:** https://stripe.com/docs

### GO Admin ERP

1. Revisar [STRIPE_INTEGRATION_COMPLETE.md](./STRIPE_INTEGRATION_COMPLETE.md)
2. Revisar [STRIPE_TESTING.md](./STRIPE_TESTING.md)
3. Ver logs de Stripe Dashboard
4. Ver logs de Vercel
5. Revisar código en GitHub

---

## ✅ Checklist de Debug

- [ ] Variables de entorno configuradas correctamente
- [ ] Claves del mismo ambiente (test/live)
- [ ] Webhook secret correcto
- [ ] Logs revisados (Stripe + Vercel)
- [ ] Base de datos funcionando
- [ ] RLS policies correctas
- [ ] Triggers de BD activos
- [ ] Network requests exitosos (DevTools)
- [ ] No hay errores en consola
- [ ] Versión de dependencias correcta

```bash
# Verificar versiones
npm list stripe @stripe/stripe-js @stripe/react-stripe-js
```
