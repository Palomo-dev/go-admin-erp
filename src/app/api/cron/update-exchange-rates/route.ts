import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, webhookErrorResponse } from '@/lib/security/webhookSignatures';
import { actualizarTasasDeCambioGlobal } from '@/lib/services/openexchangerates';
import { getServiceClient } from '@/lib/supabase/server-service';

/**
 * API Route para actualización automática de tasas de cambio
 * 
 * Esta ruta debe ser llamada por un cron job (Vercel Cron, GitHub Actions, etc.)
 * para actualizar las tasas de cambio diariamente.
 * 
 * Seguridad: Requiere un token de autorización en el header
 * 
 * Uso:
 * GET /api/cron/update-exchange-rates
 * Headers: Authorization: Bearer YOUR_CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 1. Verificar autorización. GO-sec (2026-09-24): `verifyCronSecret`
    //    (Bearer o x-cron-secret, fail-closed sin CRON_SECRET real y en tiempo
    //    constante), en lugar de una comparación `!==` propia.
    try {
      verifyCronSecret(request);
    } catch (err) {
      return webhookErrorResponse(err);
    }

    console.log('🔄 Iniciando actualización programada de tasas de cambio...');
    console.log('📅 Fecha/Hora:', new Date().toISOString());
    
    // 2. Ejecutar actualización de tasas
    // Cron sin sesión: service role (catálogo global `currency_rates`, sin organización).
    const result = await actualizarTasasDeCambioGlobal(getServiceClient());
    
    const executionTime = Date.now() - startTime;
    
    if (result.success) {
      console.log('✅ Actualización completada exitosamente');
      console.log(`📊 Tasas actualizadas: ${result.updated_count || 0}`);
      console.log(`⏱️ Tiempo de ejecución: ${executionTime}ms`);
      
      return NextResponse.json({
        success: true,
        message: 'Tasas de cambio actualizadas correctamente',
        data: {
          updated_count: result.updated_count,
          base_currency: result.base_currency,
          timestamp: result.timestamp,
          execution_time_ms: executionTime,
          date: new Date().toISOString()
        }
      }, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      });
    } else {
      throw new Error(result.message || 'Error desconocido en actualización');
    }
    
  } catch (error: unknown) {
    const executionTime = Date.now() - startTime;
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error('❌ Error en actualización automática de tasas:', mensaje);

    return NextResponse.json(
      {
        success: false,
        error: mensaje,
        execution_time_ms: executionTime,
        date: new Date().toISOString()
      },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    );
  }
}

/**
 * Método POST para permitir triggers manuales con más opciones
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 1. Verificar autorización. GO-sec (2026-09-24): `verifyCronSecret`
    //    (Bearer o x-cron-secret, fail-closed sin CRON_SECRET real y en tiempo
    //    constante), en lugar de una comparación `!==` propia.
    try {
      verifyCronSecret(request);
    } catch (err) {
      return webhookErrorResponse(err);
    }

    // Leer opciones del body (si las hay)
    let options = {};
    try {
      const body = await request.json();
      options = body;
    } catch {
      // Si no hay body o no es JSON válido, usar opciones por defecto
    }

    console.log('🔄 Iniciando actualización manual de tasas de cambio...');
    console.log('📅 Fecha/Hora:', new Date().toISOString());
    console.log('⚙️ Opciones:', options);
    
    // Ejecutar actualización
    const result = await actualizarTasasDeCambioGlobal();
    
    const executionTime = Date.now() - startTime;
    
    if (result.success) {
      console.log('✅ Actualización completada exitosamente');
      
      return NextResponse.json({
        success: true,
        message: 'Tasas de cambio actualizadas correctamente',
        data: {
          updated_count: result.updated_count,
          base_currency: result.base_currency,
          timestamp: result.timestamp,
          execution_time_ms: executionTime,
          date: new Date().toISOString()
        }
      });
    } else {
      throw new Error(result.message || 'Error en actualización');
    }
    
  } catch (error: unknown) {
    const executionTime = Date.now() - startTime;
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error('❌ Error en actualización manual:', mensaje);

    return NextResponse.json(
      {
        success: false,
        error: mensaje,
        execution_time_ms: executionTime,
        date: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
