import { NextRequest, NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { supabase } from '@/lib/supabase/config';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Helper function to create authenticated Supabase client
async function createAuthenticatedSupabaseClient() {
  const cookieStore = await cookies();
  
  // Debug: Log all available cookies
  console.log('Available cookies:', Array.from(cookieStore.getAll()).map(c => ({ name: c.name, value: c.value?.substring(0, 50) + '...' })));
  
  // Try different cookie patterns
  const authTokenCookie = cookieStore.get('sb-jgmgphmzusbluqhuqihj-auth-token');
  const authCookie = cookieStore.get('supabase-auth-token');
  const sessionCookie = cookieStore.get('sb-jgmgphmzusbluqhuqihj-auth-token-code-verifier');
  
  console.log('Auth cookies found:', {
    authToken: !!authTokenCookie,
    authCookie: !!authCookie,
    sessionCookie: !!sessionCookie
  });
  
  // Try to parse the session from the main auth cookie
  let accessToken = null;
  
  if (authTokenCookie?.value) {
    try {
      // The cookie might contain a JSON string with the session
      const sessionData = JSON.parse(decodeURIComponent(authTokenCookie.value));
      console.log('Parsed session data keys:', Object.keys(sessionData));
      
      if (sessionData.access_token) {
        accessToken = sessionData.access_token;
      } else if (sessionData.session?.access_token) {
        accessToken = sessionData.session.access_token;
      }
    } catch (error) {
      console.log('Failed to parse auth cookie as JSON, trying as direct token:', (error as Error).message);
      // If it's not JSON, maybe it's the token directly
      accessToken = authTokenCookie.value;
    }
  }
  
  console.log('Extracted access token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'null');
  
  if (!accessToken) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const client = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
  
  return client;
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

    // Crear cliente de Supabase con contexto de servidor para autenticación
    const supabaseServer = await createAuthenticatedSupabaseClient();
    
    if (!supabaseServer) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
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

    // Crear cliente de Supabase con contexto de servidor para autenticación
    const supabaseServer = await createAuthenticatedSupabaseClient();
    
    console.log('POST /api/modules - Auth check:', { hasClient: !!supabaseServer });
    
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
