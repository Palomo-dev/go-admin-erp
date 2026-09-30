/**
 * API endpoint para verificar acceso a módulo según plan (GO-156)
 * 
 * Verifica si un módulo está permitido para la organización actual.
 * Usa moduleManagementService.checkModulePlanCompliance().
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { getServerUserClient } from '@/lib/supabase/server-user';

export async function POST(request: NextRequest) {
  try {
    const orgContext = await getServerOrgContext();
    if (!orgContext) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { module_code } = body;

    if (!module_code) {
      return NextResponse.json({ error: 'module_code requerido' }, { status: 400 });
    }

    const supabase = getServerUserClient();

    // Verificar si el módulo existe y si es core
    const { data: module } = await supabase
      .from('modules')
      .select('is_core')
      .eq('code', module_code)
      .maybeSingle();

    if (!module) {
      return NextResponse.json({ error: 'Módulo no encontrado' }, { status: 404 });
    }

    // Verificar compliance con el plan
    const compliance = await moduleManagementService.checkModulePlanCompliance(
      orgContext.organizationId,
      module_code,
      module.is_core,
      supabase
    );

    return NextResponse.json({
      allowed: compliance.allowed,
      should_block: compliance.should_block,
      warning_message: compliance.warning_message,
      enforcement_mode: compliance.enforcement_mode
    });

  } catch (error) {
    console.error('Error checking module access:', error);
    // Fail open: en caso de error, permitir acceso
    return NextResponse.json({
      allowed: true,
      should_block: false
    });
  }
}
