# ⚡ Configuración Rápida - Actualización Automática de Tasas

## 🎯 Objetivo
Configurar la actualización automática diaria de tasas de cambio a las 2:00 AM UTC.

## ✅ Ya Completado

1. ✅ Endpoint API creado: `/api/cron/update-exchange-rates`
2. ✅ Configuración Vercel Cron en `vercel.json`
3. ✅ Migración de Supabase ejecutada
4. ✅ Servicio de actualización funcionando

## 🚀 Pasos para Activar (5 minutos)

### Paso 1: Generar Token de Seguridad

Ejecuta en tu terminal:

```bash
# En Linux/Mac
openssl rand -base64 32

# En Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Copia el resultado (ejemplo: `aB3dE5fG7hI9jK1lM2nO3pQ4rS5tU6vW7xY8zA9bC0dE1fG==`)

### Paso 2: Configurar Variable en Vercel

1. Ve a tu proyecto en Vercel: https://vercel.com/dashboard
2. Selecciona tu proyecto **go-admin-erp**
3. Ve a **Settings** → **Environment Variables**
4. Agrega nueva variable:
   - **Name**: `CRON_SECRET`
   - **Value**: El token que generaste en Paso 1
   - **Environment**: Production, Preview, Development (todos)
5. Click **Save**

### Paso 3: Redeploy

```bash
# Opción A: Desde tu terminal
git add .
git commit -m "feat: configurar actualización automática de tasas"
git push

# Opción B: Desde Vercel Dashboard
# Ve a Deployments → ... (3 puntos) → Redeploy
```

### Paso 4: Verificar que Funciona

**Prueba Manual (Inmediata):**

```bash
# Reemplaza con tu dominio y token
curl -X GET \
  -H "Authorization: Bearer TU_CRON_SECRET_AQUI" \
  https://tu-app.vercel.app/api/cron/update-exchange-rates
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Tasas de cambio actualizadas correctamente",
  "data": {
    "updated_count": 150,
    "base_currency": "USD",
    "timestamp": 1697832000,
    "execution_time_ms": 2456,
    "date": "2024-10-20T14:30:00.000Z"
  }
}
```

**Verificar Cron Automático:**

1. Espera hasta las 2:00 AM UTC (o 24 horas después del deploy)
2. Ve a Vercel Dashboard → tu proyecto → **Cron Jobs**
3. Verifica el historial de ejecuciones

### Paso 5: Verificar en la Aplicación

1. Abre tu aplicación: https://tu-app.vercel.app
2. Ve a **Finanzas → Monedas → Tasas de Cambio**
3. Verifica que aparezcan tasas para la fecha actual
4. Ve a **Histórico** para ver los logs de actualización

## 📊 Monitoreo

### Ver logs en tiempo real (Development)

```bash
vercel logs --follow
```

### Ver ejecuciones del cron en Vercel

```
Dashboard → Your Project → Cron Jobs → Executions
```

### Ver logs en Supabase

```sql
-- Últimas 10 actualizaciones
SELECT 
  execution_date,
  success,
  details->0->>'rates_updated' as rates_updated,
  details->0->>'execution_time_ms' as execution_time_ms
FROM exchange_rates_logs
ORDER BY execution_date DESC
LIMIT 10;
```

## 🔧 Troubleshooting

### Error: "No autorizado"
- Verifica que el `CRON_SECRET` en Vercel coincida con el token usado
- Asegúrate de incluir `Bearer` antes del token en el header

### Error: "API key no configurada"
- Verifica que `NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY` esté configurada en Vercel
- La API key debe ser del plan gratuito o de pago de OpenExchangeRates

### El cron no ejecuta automáticamente
- Verifica que `vercel.json` contenga la configuración de crons
- Confirma que has hecho redeploy después de agregar el cron
- Los crons de Vercel solo funcionan en **Production**

### Error: "Failed to fetch"
- Problema de conectividad o límite de API alcanzado
- OpenExchangeRates plan gratuito: 1000 requests/mes
- Verifica en: https://openexchangerates.org/account/usage

## 🎓 Información Adicional

**Horario del Cron:**
- `0 2 * * *` = 2:00 AM UTC todos los días
- Para cambiar horario, edita `vercel.json` → `crons.schedule`

**Cron Expression Format:**
```
┌───────────── minuto (0 - 59)
│ ┌───────────── hora (0 - 23)
│ │ ┌───────────── día del mes (1 - 31)
│ │ │ ┌───────────── mes (1 - 12)
│ │ │ │ ┌───────────── día de la semana (0 - 6) (Domingo=0)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

**Ejemplos:**
- `0 2 * * *` - 2:00 AM diario
- `0 */6 * * *` - Cada 6 horas
- `0 0 * * 0` - Domingos a medianoche

## 📞 Recursos

- **Vercel Cron Docs**: https://vercel.com/docs/cron-jobs
- **OpenExchangeRates**: https://openexchangerates.org/
- **Supabase Docs**: https://supabase.com/docs

## ✨ ¡Listo!

Una vez completados los 5 pasos, tus tasas de cambio se actualizarán automáticamente cada día a las 2:00 AM UTC. 🎉
