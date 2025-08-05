/**
 * API Routes para Automatización de Alertas
 * GET: Obtener estado del scheduler
 * POST: Ejecutar automatización manual
 * PUT: Actualizar configuración del scheduler
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAlertScheduler, AlertSchedulerControl } from '@/lib/automation/alertScheduler';
import { testAlertAutomation } from '@/lib/services/alertAutomationService';
import Logger from '@/lib/utils/logger';

/**
 * GET /api/alerts/automation
 * Obtiene el estado actual del scheduler
 */
export async function GET() {
  try {
    const status = AlertSchedulerControl.status();
    
    return NextResponse.json({
      success: true,
      data: status,
      message: 'Estado del scheduler obtenido correctamente'
    });
    
  } catch (error) {
    Logger.error('ALERT_API', 'Error obteniendo estado del scheduler:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor'
    }, { status: 500 });
  }
}

/**
 * POST /api/alerts/automation
 * Ejecuta la automatización manualmente
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, organization_id } = body;
    
    switch (action) {
      case 'start':
        AlertSchedulerControl.start();
        return NextResponse.json({
          success: true,
          message: 'Scheduler iniciado correctamente'
        });
        
      case 'stop':
        AlertSchedulerControl.stop();
        return NextResponse.json({
          success: true,
          message: 'Scheduler detenido correctamente'
        });
        
      case 'run_now':
        Logger.info('ALERT_API', '🔧 Ejecutando automatización manual vía API');
        
        const result = organization_id 
          ? await testAlertAutomation(organization_id)
          : await AlertSchedulerControl.runNow();
        
        return NextResponse.json({
          success: true,
          data: result,
          message: 'Automatización ejecutada correctamente'
        });
        
      case 'test':
        // Ejecutar solo para organización 2 como prueba
        Logger.info('ALERT_API', '🧪 Ejecutando test de automatización');
        const testResult = await testAlertAutomation(2);
        
        return NextResponse.json({
          success: true,
          data: testResult,
          message: 'Test de automatización completado'
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Acción no válida. Usar: start, stop, run_now, test'
        }, { status: 400 });
    }
    
  } catch (error) {
    Logger.error('ALERT_API', 'Error en automatización de alertas:', error);
    return NextResponse.json({
      success: false,
      error: 'Error ejecutando automatización',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

/**
 * PUT /api/alerts/automation
 * Actualiza la configuración del scheduler
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { intervalMinutes, enabled, runOnStart } = body;
    
    // Validar parámetros
    const config: any = {};
    
    if (typeof intervalMinutes === 'number' && intervalMinutes > 0) {
      config.intervalMinutes = intervalMinutes;
    }
    
    if (typeof enabled === 'boolean') {
      config.enabled = enabled;
    }
    
    if (typeof runOnStart === 'boolean') {
      config.runOnStart = runOnStart;
    }
    
    if (Object.keys(config).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No se proporcionaron parámetros válidos para actualizar'
      }, { status: 400 });
    }
    
    // Actualizar configuración
    AlertSchedulerControl.configure(config);
    
    const newStatus = AlertSchedulerControl.status();
    
    return NextResponse.json({
      success: true,
      data: newStatus,
      message: 'Configuración actualizada correctamente'
    });
    
  } catch (error) {
    Logger.error('ALERT_API', 'Error actualizando configuración:', error);
    return NextResponse.json({
      success: false,
      error: 'Error actualizando configuración'
    }, { status: 500 });
  }
}
