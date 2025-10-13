# 🧪 Guía de Testing - Stripe Integration

Esta guía cubre cómo probar la integración de Stripe en GO Admin ERP.

---

## 📋 Tabla de Contenidos

1. [Configuración de Testing](#configuración-de-testing)
2. [Tarjetas de Prueba](#tarjetas-de-prueba)
3. [Escenarios de Prueba](#escenarios-de-prueba)
4. [Testing de Webhooks](#testing-de-webhooks)
5. [Herramientas de Debug](#herramientas-de-debug)

---

## 🔧 Configuración de Testing

### Modo de Prueba (Test Mode)

Para realizar pruebas, usa las credenciales de **Test Mode** de Stripe:

```bash
# .env.local para testing
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_TEST_KEY
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_SECRET
STRIPE_WEBHOOK_SECRET=whsec_test_YOUR_WEBHOOK_SECRET
```

### Diferencias entre Test y Live Mode

| Aspecto | Test Mode | Live Mode |
|---------|-----------|-----------|
| Claves | `pk_test_...`, `sk_test_...` | `pk_live_...`, `sk_live_...` |
| Pagos reales | ❌ No | ✅ Sí |
| Tarjetas | Solo tarjetas de prueba | Tarjetas reales |
| Dashboard | https://dashboard.stripe.com/test | https://dashboard.stripe.com |

---

## 💳 Tarjetas de Prueba

### Tarjetas de Éxito

#### Visa - Pago Exitoso
```
Número: 4242 4242 4242 4242
CVC: Cualquier 3 dígitos
Fecha: Cualquier fecha futura
ZIP: Cualquier código
```

#### Mastercard - Pago Exitoso
```
Número: 5555 5555 5555 4444
CVC: Cualquier 3 dígitos
Fecha: Cualquier fecha futura
```

#### American Express - Pago Exitoso
```
Número: 3782 822463 10005
CVC: Cualquier 4 dígitos
Fecha: Cualquier fecha futura
```

### Tarjetas de Fallo

#### Tarjeta Rechazada
```
Número: 4000 0000 0000 0002
CVC: Cualquier 3 dígitos
Fecha: Cualquier fecha futura
Resultado: Pago rechazado (generic_decline)
```

#### Fondos Insuficientes
```
Número: 4000 0000 0000 9995
CVC: Cualquier 3 dígitos
Fecha: Cualquier fecha futura
Resultado: Pago rechazado (insufficient_funds)
```

#### Tarjeta Perdida
```
Número: 4000 0000 0000 9987
CVC: Cualquier 3 dígitos
Fecha: Cualquier fecha futura
Resultado: Pago rechazado (lost_card)
```

#### Tarjeta Robada
```
Número: 4000 0000 0000 9979
CVC: Cualquier 3 dígitos
Fecha: Cualquier fecha futura
Resultado: Pago rechazado (stolen_card)
```

### Tarjetas con 3D Secure

#### Requiere Autenticación (Exitosa)
```
Número: 4000 0025 0000 3155
CVC: Cualquier 3 dígitos
Fecha: Cualquier fecha futura
Resultado: Requiere autenticación, luego exitoso
```

#### Requiere Autenticación (Fallida)
```
Número: 4000 0000 0000 0341
CVC: Cualquier 3 dígitos
Fecha: Cualquier fecha futura
Resultado: Requiere autenticación, falla autenticación
```

### Tarjetas Internacionales

#### Brasil (Real)
```
Número: 4000 0076 4000 0002
Moneda: BRL
```

#### México (Peso)
```
Número: 4000 0048 4000 0008
Moneda: MXN
```

#### Colombia (Peso)
```
Número: 4000 0017 0000 0010
Moneda: COP
```

---

## 🎯 Escenarios de Prueba

### 1. Pago Exitoso en POS

**Pasos:**
1. Agregar productos al carrito
2. Ir a Checkout
3. Seleccionar método de pago "Tarjeta"
4. Usar tarjeta: `4242 4242 4242 4242`
5. Completar pago

**Resultado Esperado:**
- ✅ Pago procesado exitosamente
- ✅ Venta creada en BD con `status: 'paid'`
- ✅ Factura creada correctamente
- ✅ Balance actualizado a $0
- ✅ Registro de pago con referencia de Stripe

### 2. Pago Rechazado

**Pasos:**
1. Agregar productos al carrito
2. Ir a Checkout
3. Seleccionar método de pago "Tarjeta"
4. Usar tarjeta: `4000 0000 0000 0002`
5. Intentar completar pago

**Resultado Esperado:**
- ❌ Error: "Tu tarjeta fue rechazada"
- ❌ No se crea venta ni factura
- ❌ No se actualiza inventario
- ✅ Usuario puede intentar con otra tarjeta

### 3. Pago con 3D Secure

**Pasos:**
1. Usar tarjeta: `4000 0025 0000 3155`
2. Sistema solicita autenticación
3. Completar autenticación (en test mode siempre exitosa)

**Resultado Esperado:**
- ✅ Modal de autenticación aparece
- ✅ Después de autenticar, pago exitoso
- ✅ Venta y factura creadas

### 4. Abono a Cuenta por Cobrar

**Pasos:**
1. Ir a Cuentas por Cobrar
2. Seleccionar una cuenta con balance pendiente
3. Clic en "Aplicar Abono"
4. Seleccionar método "Tarjeta"
5. Ingresar monto del abono
6. Usar tarjeta de prueba

**Resultado Esperado:**
- ✅ Pago procesado
- ✅ Balance de cuenta actualizado
- ✅ Payment registrado con `source: 'account_receivable'`
- ✅ Trigger actualiza `accounts_receivable` y `invoice_sales`

### 5. Pago Parcial

**Pasos:**
1. Venta con total $100
2. Ingresar monto de pago: $50
3. Procesar con tarjeta

**Resultado Esperado:**
- ✅ Pago de $50 procesado
- ✅ Balance restante: $50
- ✅ Status: 'partial'
- ✅ Se puede aplicar segundo pago después

### 6. Reembolso

**Pasos:**
1. Tener una venta pagada con Stripe
2. Ir a Devoluciones
3. Seleccionar la venta
4. Procesar devolución total

**Resultado Esperado:**
- ✅ Reembolso procesado en Stripe
- ✅ Nota de crédito creada
- ✅ Balance de venta actualizado
- ✅ Webhook `charge.refunded` recibido

---

## 🔌 Testing de Webhooks

### Configurar Webhook Local con Stripe CLI

1. **Instalar Stripe CLI:**
   ```bash
   # Windows
   scoop install stripe
   
   # macOS
   brew install stripe/stripe-cli/stripe
   
   # Linux
   # Descargar de https://github.com/stripe/stripe-cli/releases
   ```

2. **Login en Stripe:**
   ```bash
   stripe login
   ```

3. **Escuchar webhooks localmente:**
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

4. **Disparar eventos de prueba:**
   ```bash
   # Pago exitoso
   stripe trigger payment_intent.succeeded
   
   # Pago fallido
   stripe trigger payment_intent.payment_failed
   
   # Reembolso
   stripe trigger charge.refunded
   ```

### Verificar Webhooks

En el Stripe Dashboard:
1. Ir a **Developers > Webhooks**
2. Ver eventos recientes
3. Revisar detalles de cada evento
4. Verificar respuesta del servidor

---

## 🛠️ Herramientas de Debug

### 1. Stripe Dashboard

**Logs de API:**
- https://dashboard.stripe.com/test/logs
- Ver todas las peticiones API
- Revisar errores y respuestas

**Eventos de Webhook:**
- https://dashboard.stripe.com/test/webhooks
- Ver todos los webhooks enviados
- Reintentar webhooks fallidos

**Payment Intents:**
- https://dashboard.stripe.com/test/payments
- Ver todos los Payment Intents
- Ver timeline de cada pago

### 2. Console Logs

Buscar en la consola del navegador y servidor:

```typescript
// Frontend
console.log('✅ Stripe loaded')
console.log('✅ Payment Intent created:', clientSecret)
console.log('✅ Payment succeeded:', paymentIntent.id)

// Backend
console.log('✅ Payment Intent creado:', paymentIntent.id)
console.log('✅ Webhook verificado:', event.type)
console.log('✅ Pago guardado en BD:', payment.id)
```

### 3. Logs de Vercel

Si estás en producción:
```bash
vercel logs
```

O ver logs en: https://vercel.com/tu-proyecto/logs

### 4. Supabase Logs

Ver logs de base de datos:
```sql
-- Ver pagos recientes
SELECT * FROM payments 
WHERE payment_method = 'card' 
ORDER BY created_at DESC 
LIMIT 10;

-- Ver Payment Intents de Stripe
SELECT reference, amount, status, created_at 
FROM payments 
WHERE reference LIKE 'pi_%' 
ORDER BY created_at DESC;
```

---

## ✅ Checklist de Testing

### Testing Básico
- [ ] Pago exitoso con tarjeta de prueba
- [ ] Pago rechazado con tarjeta de prueba
- [ ] Pago cancelado por usuario
- [ ] Manejo de errores visualizado correctamente

### Testing Avanzado
- [ ] Pago con 3D Secure
- [ ] Pago parcial
- [ ] Múltiples pagos en una venta
- [ ] Abono a cuenta por cobrar
- [ ] Reembolso completo
- [ ] Reembolso parcial

### Testing de Integración
- [ ] Webhook recibido correctamente
- [ ] Pago guardado en base de datos
- [ ] Balance actualizado correctamente
- [ ] Factura creada correctamente
- [ ] Estados sincronizados (venta, factura, cuenta)

### Testing de UI
- [ ] Formulario de pago se muestra correctamente
- [ ] Loader mientras se procesa
- [ ] Mensajes de error claros
- [ ] Mensajes de éxito claros
- [ ] Responsive en móvil y desktop
- [ ] Tema claro y oscuro funcionan

---

## 🚨 Problemas Comunes

### "Stripe is not loaded"
- Verificar que `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` esté configurada
- Verificar que no haya errores de CORS

### "Webhook signature verification failed"
- Verificar que `STRIPE_WEBHOOK_SECRET` sea correcto
- Verificar que el body del webhook no sea parseado antes de verificar
- Usar Stripe CLI para testing local

### "Payment failed with no error message"
- Revisar Stripe Dashboard > Logs
- Ver detalles del Payment Intent
- Verificar que el monto sea mayor al mínimo permitido

### "Balance not updated"
- Verificar que el webhook fue recibido
- Revisar logs del servidor
- Verificar que los triggers de BD estén activos

---

## 📚 Recursos Adicionales

- [Stripe Testing Cards](https://stripe.com/docs/testing)
- [Stripe CLI Docs](https://stripe.com/docs/stripe-cli)
- [Webhook Testing](https://stripe.com/docs/webhooks/test)
- [3D Secure Testing](https://stripe.com/docs/testing#regulatory-cards)
- [Error Codes](https://stripe.com/docs/error-codes)
