// ============================================================
// /api/integrations/open-finance/links/[id]/login
// Realiza login al banco con credenciales del usuario
// POST - login bancario (body: { username, password, documentNumber?, type? })
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';

// POST - login al banco con credenciales del usuario
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { error: 'ID de link requerido' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { username, password, documentNumber, type } = body;

    // Validar campos requeridos
    if (!username || !password) {
      return NextResponse.json(
        { error: 'username y password son requeridos' },
        { status: 400 },
      );
    }

    // Obtener provider e institution_code del link
    const { data: link } = await supabase
      .from('open_finance_links')
      .select('provider, institution_code')
      .eq('id', id)
      .single();

    if (!link) {
      return NextResponse.json(
        { error: 'Link no encontrado' },
        { status: 404 },
      );
    }

    // Ejecutar login contra el banco via proveedor
    const result = await openFinanceService.loginToBank(
      supabase,
      id,
      link.provider,
      {
        provider: link.institution_code,
        username,
        password,
        document_number: documentNumber,
        type,
      },
    );

    // El servicio guarda session_key en el link internamente
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Open Finance Login POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
