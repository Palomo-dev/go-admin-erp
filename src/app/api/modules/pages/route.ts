import { NextRequest, NextResponse } from 'next/server';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { createClient } from '@supabase/supabase-js';

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

// GET /api/modules/pages?organizationId=123
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

    const supabaseServer = getServiceRoleClient();
    if (!supabaseServer) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const orgId = parseInt(organizationId);
    const pages = await moduleManagementService.getActiveModulePages(orgId, supabaseServer);

    return NextResponse.json({
      success: true,
      data: pages
    });
  } catch (error) {
    console.error('Error fetching module pages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/modules/pages - Toggle individual page
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, moduleCode, pageHref, pageName, isActive } = body;

    if (!organizationId || !moduleCode || !pageHref || !pageName) {
      return NextResponse.json(
        { error: 'organizationId, moduleCode, pageHref, and pageName are required' },
        { status: 400 }
      );
    }

    const supabaseServer = getServiceRoleClient();
    if (!supabaseServer) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const orgId = parseInt(organizationId.toString());
    if (isNaN(orgId)) {
      return NextResponse.json(
        { error: 'Organization ID must be a valid number' },
        { status: 400 }
      );
    }

    const result = await moduleManagementService.toggleModulePage(
      orgId,
      moduleCode,
      pageHref,
      pageName,
      isActive,
      supabaseServer
    );

    return NextResponse.json({
      success: result.success,
      message: result.message
    }, {
      status: result.success ? 200 : 400
    });
  } catch (error) {
    console.error('Error toggling module page:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
