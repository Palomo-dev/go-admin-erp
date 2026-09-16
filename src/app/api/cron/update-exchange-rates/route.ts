import { NextRequest, NextResponse } from 'next/server';
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
    // 1. Verificar autorización
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;
    
    // Si no hay CRON_SECRET configurado, rechazar por seguridad
    if (!expectedToken) {
      console.error('❌ CRON_SECRET no configurado en variables de entorno');
      return NextResponse.json(
        { 
          success: false,
          error: 'Servicio no configurado correctamente' 
        },
        { status: 500 }
      );
    }
    
    // Verificar que el token coincida
    if (authHeader !== `Bearer ${expectedToken}`) {
      console.warn('⚠️ Intento de acceso no autorizado al cron job');
      return NextResponse.json(
        { 
          success: false,
          error: 'No autorizado' 
        },
        { status: 401 }
      );
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
    
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error('❌ Error en actualización automática de tasas:', error);
    console.error('Stack trace:', error.stack);
    
    return NextResponse.json(
      { 
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
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
    // Verificar autorización
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;
    
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { 
          success: false,
          error: 'No autorizado' 
        },
        { status: 401 }
      );
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
    
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error('❌ Error en actualización manual:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error.message,
        execution_time_ms: executionTime,
        date: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
