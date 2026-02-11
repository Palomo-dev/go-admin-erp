import { NextRequest, NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { createClient } from '@supabase/supabase-js';

// Cliente Service Role para bypass de RLS en operaciones del servidor
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getServiceRoleClient() {
  if (!serviceRoleKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY no está configurado');
    return null;
  }
  
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

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

    // Usar cliente con service role para bypass de RLS
    const supabaseServer = getServiceRoleClient();
    
    if (!supabaseServer) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const orgId = parseInt(organizationId);
    const status = await moduleManagementService.getOrganizationModuleStatus(orgId, supabaseServer);
    
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

    console.log('POST /api/modules - Request body:', { organizationId, moduleCode, action });

    if (!organizationId || !moduleCode || !action) {
      console.log('POST /api/modules - Missing required fields');
      return NextResponse.json(
        { error: 'Organization ID, module code, and action are required' },
        { status: 400 }
      );
    }

    // Usar cliente con service role para bypass de RLS
    const supabaseServer = getServiceRoleClient();
    
    console.log('POST /api/modules - Service role client:', { hasClient: !!supabaseServer });
    
    if (!supabaseServer) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validar que organizationId sea un número
    const orgId = parseInt(organizationId.toString());
    if (isNaN(orgId)) {
      console.log('POST /api/modules - Invalid organizationId:', organizationId);
      return NextResponse.json(
        { error: 'Organization ID must be a valid number' },
        { status: 400 }
      );
    }

    let result;
    if (action === 'activate') {
      console.log(`POST /api/modules - Activating module ${moduleCode} for org ${orgId}`);
      result = await moduleManagementService.activateModule(orgId, moduleCode, supabaseServer);
    } else if (action === 'deactivate') {
      console.log(`POST /api/modules - Deactivating module ${moduleCode} for org ${orgId}`);
      result = await moduleManagementService.deactivateModule(orgId, moduleCode, supabaseServer);
    } else {
      console.log('POST /api/modules - Invalid action:', action);
      return NextResponse.json(
        { error: 'Invalid action. Use "activate" or "deactivate"' },
        { status: 400 }
      );
    }

    console.log('POST /api/modules - Service result:', result);

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
