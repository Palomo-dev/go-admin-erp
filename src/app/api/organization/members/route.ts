import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getOrganizationUserLimits } from '@/lib/services/organizationLimitsService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId requerido' },
        { status: 400 }
      );
    }

    const limits = await getOrganizationUserLimits(Number(organizationId));

    return NextResponse.json({
      success: true,
      limits,
    });
  } catch (error: any) {
    console.error('Error getting organization limits:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, userId, roleId } = body;

    if (!organizationId || !userId) {
      return NextResponse.json(
        { error: 'organizationId y userId requeridos' },
        { status: 400 }
      );
    }

    // Verificar límite de usuarios
    const limits = await getOrganizationUserLimits(organizationId);
    
    if (!limits.canAddUser) {
      return NextResponse.json(
        { 
          error: 'Límite de usuarios alcanizado',
          limits,
          message: `Has alcanzado el límite de ${limits.maxUsers} usuarios de tu plan.`
        },
        { status: 403 }
      );
    }

    // Crear el miembro
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: member, error } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        role_id: roleId || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating member:', error);
      return NextResponse.json(
        { error: 'Error al agregar miembro' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      member,
      limits: {
        ...limits,
        currentUsers: limits.currentUsers + 1,
        remainingSlots: limits.maxUsers 
          ? limits.maxUsers - (limits.currentUsers + 1) 
          : null,
      },
    });
  } catch (error: any) {
    console.error('Error adding organization member:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
