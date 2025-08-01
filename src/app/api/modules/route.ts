import { NextRequest, NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { supabase } from '@/lib/supabase/config';

// GET /api/modules - Obtener módulos activos de una organización
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const orgId = parseInt(organizationId);
    const status = await moduleManagementService.getOrganizationModuleStatus(orgId);
    
    return NextResponse.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Error fetching modules:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/modules - Activar un módulo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, moduleCode, action } = body;

    if (!organizationId || !moduleCode || !action) {
      return NextResponse.json(
        { error: 'Organization ID, module code, and action are required' },
        { status: 400 }
      );
    }

    let result;
    if (action === 'activate') {
      result = await moduleManagementService.activateModule(organizationId, moduleCode);
    } else if (action === 'deactivate') {
      result = await moduleManagementService.deactivateModule(organizationId, moduleCode);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "activate" or "deactivate"' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: result.data
    }, {
      status: result.success ? 200 : 400
    });

  } catch (error) {
    console.error('Error managing module:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
