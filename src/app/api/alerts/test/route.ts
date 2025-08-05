/**
 * API para pruebas del sistema de alertas
 * SCRUM-1220: Endpoint de testing y diagnóstico
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/config';
import { testAlertAutomation } from '@/lib/services/alertAutomationService';
import Logger from '@/lib/utils/logger';

/**
 * POST /api/alerts/test - Probar funciones del sistema de alertas
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    Logger.info('ALERT_API', `🧪 Ejecutando prueba: ${action}`, params);

    switch (action) {
      case 'test_sql_condition': {
        const { condition_sql, organization_id } = params;
        
        if (!condition_sql) {
          return NextResponse.json(
            { error: 'condition_sql es requerido' }, 
            { status: 400 }
          );
        }

        // Probar la función RPC directamente
        const { data, error } = await supabase
          .rpc('test_alert_condition', {
            condition_sql,
            organization_id: organization_id || null
          });

        if (error) {
          Logger.error('ALERT_API', '❌ Error en prueba SQL:', error);
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        Logger.info('ALERT_API', '✅ Prueba SQL exitosa:', data);
        return NextResponse.json({ success: true, result: data });
      }

      case 'test_automation': {
        const { organization_id } = params;
        
        if (!organization_id) {
          return NextResponse.json(
            { error: 'organization_id es requerido' }, 
            { status: 400 }
          );
        }

        const result = await testAlertAutomation(organization_id);
        
        Logger.info('ALERT_API', '✅ Prueba de automatización exitosa:', result);
        return NextResponse.json({ success: true, result });
      }

      case 'check_database': {
        // Verificar conexión a la base de datos
        const { data: rules, error: rulesError } = await supabase
          .from('alert_rules')
          .select('id, name, is_active')
          .limit(5);

        if (rulesError) {
          Logger.error('ALERT_API', '❌ Error consultando reglas:', rulesError);
          return NextResponse.json({ error: rulesError.message }, { status: 500 });
        }

        const { data: alerts, error: alertsError } = await supabase
          .from('system_alerts')
          .select('id, title, severity, status')
          .limit(5);

        if (alertsError) {
          Logger.error('ALERT_API', '❌ Error consultando alertas:', alertsError);
          return NextResponse.json({ error: alertsError.message }, { status: 500 });
        }

        const result = {
          database_connection: 'OK',
          alert_rules_count: rules?.length || 0,
          system_alerts_count: alerts?.length || 0,
          sample_rules: rules,
          sample_alerts: alerts
        };

        Logger.info('ALERT_API', '✅ Verificación de base de datos exitosa:', result);
        return NextResponse.json({ success: true, result });
      }

      default:
        return NextResponse.json(
          { error: `Acción no reconocida: ${action}` }, 
          { status: 400 }
        );
    }

  } catch (error) {
    Logger.error('ALERT_API', '💥 Error en endpoint de pruebas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' }, 
      { status: 500 }
    );
  }
}

/**
 * GET /api/alerts/test - Obtener información del sistema de alertas
 */
export async function GET() {
  try {
    Logger.info('ALERT_API', '📊 Obteniendo información del sistema de alertas');

    // Obtener estadísticas básicas
    const { data: rulesCount, error: rulesError } = await supabase
      .from('alert_rules')
      .select('id', { count: 'exact' });

    const { data: alertsCount, error: alertsError } = await supabase
      .from('system_alerts')
      .select('id', { count: 'exact' });

    if (rulesError || alertsError) {
      Logger.error('ALERT_API', '❌ Error obteniendo estadísticas:', { rulesError, alertsError });
      return NextResponse.json(
        { error: 'Error consultando estadísticas' }, 
        { status: 500 }
      );
    }

    const systemInfo = {
      timestamp: new Date().toISOString(),
      alert_rules_total: rulesCount?.length || 0,
      system_alerts_total: alertsCount?.length || 0,
      available_tests: [
        'test_sql_condition',
        'test_automation', 
        'check_database'
      ],
      rpc_functions: [
        'execute_alert_condition',
        'test_alert_condition'
      ]
    };

    Logger.info('ALERT_API', '✅ Información del sistema obtenida:', systemInfo);
    return NextResponse.json({ success: true, result: systemInfo });

  } catch (error) {
    Logger.error('ALERT_API', '💥 Error obteniendo información del sistema:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' }, 
      { status: 500 }
    );
  }
}
