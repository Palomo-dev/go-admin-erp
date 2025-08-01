import { NextRequest, NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';

// GET /api/modules/audit - Ejecutar auditoría de módulos
export async function GET(request: NextRequest) {
  try {
    const auditResults = await moduleManagementService.auditOrganizationModules();
    
    return NextResponse.json({
      success: true,
      data: auditResults
    });

  } catch (error) {
    console.error('Error running module audit:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/modules/audit - Corregir inconsistencias de una organización
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const result = await moduleManagementService.fixInconsistencies(organizationId);
    
    return NextResponse.json({
      success: result.success,
      message: result.message,
      data: result.data
    }, {
      status: result.success ? 200 : 400
    });

  } catch (error) {
    console.error('Error fixing inconsistencies:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
