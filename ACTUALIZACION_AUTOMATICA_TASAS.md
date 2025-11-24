# Configuración de Actualización Automática de Tasas de Cambio

## 📋 Resumen

Este documento explica cómo configurar la actualización automática diaria de tasas de cambio desde OpenExchangeRates API hacia la base de datos de Supabase.

## ✅ Estado Actual

- ✅ Servicio `actualizarTasasDeCambioGlobal()` funcionando correctamente
- ✅ Función RPC `log_exchange_rates_execution` para registrar ejecuciones
- ✅ Tabla `currency_rates` para almacenar tasas históricas
- ✅ Tabla `exchange_rates_logs` para logs de actualización
- ⚠️ **Falta**: Automatización diaria (cron job o edge function)

## 🎯 Opciones de Implementación

### Opción 1: Cron Job de Supabase (Recomendado)

Ya se creó la migración para habilitar pg_cron en Supabase:
- ✅ Función `auto_update_exchange_rates()` creada
- ✅ Cron job programado para las 2:00 AM UTC diariamente
- ✅ Job name: `daily-exchange-rates-update`

**Verificar el cron job:**
```sql
-- Ver cron jobs activos
SELECT * FROM cron.job WHERE jobname = 'daily-exchange-rates-update';

-- Ver historial de ejecuciones
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-exchange-rates-update')
ORDER BY start_time DESC
LIMIT 10;
```

**Importante**: El cron job actual solo registra la ejecución. Para que funcione completamente, necesitas una de las siguientes opciones:

### Opción 2: Edge Function Manual (Vercel/Netlify)

Si no puedes desplegar directamente en Supabase, puedes crear un endpoint en tu aplicación:

**Crear archivo**: `src/app/api/cron/update-exchange-rates/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { actualizarTasasDeCambioGlobal } from '@/lib/services/openexchangerates';

// Esta ruta solo debe ser accesible por cron jobs autorizados
export async function GET(request: NextRequest) {
  // Verificar token de autorización
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.CRON_SECRET;
  
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401 }
    );
  }

  try {
    console.log('🔄 Iniciando actualización programada de tasas de cambio...');
    
    const result = await actualizarTasasDeCambioGlobal();
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Tasas actualizadas correctamente',
        updated_count: result.updated_count,
        timestamp: result.timestamp
      });
    } else {
      throw new Error(result.message || 'Error en actualización');
    }
    
  } catch (error: any) {
    console.error('❌ Error en cron job:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message 
      },
      { status: 500 }
    );
  }
}
```

### Opción 3: Vercel Cron Jobs

Si usas Vercel, configura en `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/update-exchange-rates",
      "schedule": "0 2 * * *"
    }
  ]
}
```

### Opción 4: GitHub Actions (Gratis)

Crea `.github/workflows/update-exchange-rates.yml`:

```yaml
name: Update Exchange Rates Daily

on:
  schedule:
    # Ejecutar diariamente a las 2:00 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch: # Permitir ejecución manual

jobs:
  update-rates:
    runs-on: ubuntu-latest
    steps:
      - name: Call update endpoint
        run: |
          curl -X GET \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://tu-dominio.vercel.app/api/cron/update-exchange-rates
```

### Opción 5: Servicio Externo (EasyCron, cron-job.org)

Configura un cron job gratuito en:
- **EasyCron**: https://www.easycron.com
- **cron-job.org**: https://cron-job.org

**Configuración:**
- URL: `https://tu-dominio.vercel.app/api/cron/update-exchange-rates`
- Método: GET
- Header: `Authorization: Bearer TU_CRON_SECRET`
- Schedule: `0 2 * * *` (2:00 AM diariamente)

## 🔐 Variables de Entorno Requeridas

Asegúrate de tener configuradas:

```env
# OpenExchangeRates API Key
NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY=tu_api_key_aqui

# Cron Secret (genera uno aleatorio)
CRON_SECRET=genera_un_token_secreto_seguro
```

## 📊 Monitoreo

### Ver últimas actualizaciones

```sql
SELECT 
  execution_date,
  success,
  error_message,
  organizations_total,
  details
FROM exchange_rates_logs
ORDER BY execution_date DESC
LIMIT 10;
```

### Ver tasas actuales

```sql
SELECT 
  code,
  rate,
  rate_date,
  source,
  base_currency_code
FROM currency_rates
WHERE rate_date = CURRENT_DATE
ORDER BY code;
```

## 🧪 Prueba Manual

Puedes probar la actualización manualmente desde la aplicación:
1. Ve a **Finanzas > Monedas > Tasas de Cambio**
2. Haz clic en **"Actualizar tasas"** o **"Sincronizar"**
3. Verifica que las tasas se actualicen correctamente

## 🚀 Despliegue Recomendado

1. **Crear el endpoint API** (Opción 2)
2. **Configurar Vercel Cron** (Opción 3) o **GitHub Actions** (Opción 4)
3. **Configurar variables de entorno** en Vercel/Netlify
4. **Probar manualmente** el endpoint
5. **Verificar logs** después de la primera ejecución automática

## 📝 Notas Importantes

- Las tasas se actualizan para todas las monedas con `auto_update = true` en la tabla `currencies`
- La moneda base siempre es USD (según OpenExchangeRates API gratuita)
- Los datos se guardan en `currency_rates` con fecha actual
- Se usa `upsert` para evitar duplicados
- Los logs se registran automáticamente en `exchange_rates_logs`

## 🔍 Troubleshooting

### Error: "API key no configurada"
- Verifica que `NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY` esté en las variables de entorno

### Error: "No se encontraron monedas con auto_update=true"
- Actualiza la tabla `currencies` para marcar monedas como `auto_update = true`

### Error: "Failed to fetch"
- Verifica conectividad a internet
- Confirma que la API key de OpenExchangeRates sea válida
- Revisa límites de uso de la API (1000 requests/mes en plan gratuito)

### El cron job no ejecuta
- Verifica que el cron esté activo en Supabase/Vercel
- Revisa los logs de ejecución
- Confirma que el token de autorización sea correcto

## 📞 Soporte

Para más información sobre OpenExchangeRates API:
- Documentación: https://docs.openexchangerates.org/
- Límites: https://openexchangerates.org/signup

Para configuración de pg_cron en Supabase:
- Documentación: https://supabase.com/docs/guides/database/extensions/pg_cron
