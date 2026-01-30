/**
 * API Route: Gestión de Jobs de Facturación Electrónica
 * GET /api/factus/jobs - Lista jobs
 * POST /api/factus/jobs - Reintentar job
 * DELETE /api/factus/jobs - Cancelar job
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase/config';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Se requiere organizationId' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient();

    let query = supabase
      .from('electronic_invoicing_jobs')
      .select(`
        *,
        invoice:invoice_sales(
          id,
          number,
          total,
          customer:customers(first_name, last_name, company_name)
        )
      `, { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Error obteniendo jobs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      total: count,
      limit,
      offset,
    });

  } catch (error: any) {
    console.error('Error obteniendo jobs:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, action } = body;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Se requiere jobId' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient();

    if (action === 'retry') {
      // Marcar job para reintento
      const { data, error } = await supabase
        .from('electronic_invoicing_jobs')
        .update({
          status: 'pending',
          next_retry_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: 'Error actualizando job' },
          { status: 500 }
        );
      }

      // Registrar evento
      await supabase
        .from('electronic_invoicing_events')
        .insert({
          job_id: jobId,
          event_type: 'retry_scheduled',
          event_message: 'Reintento manual programado',
        });

      return NextResponse.json({
        success: true,
        data,
        message: 'Job programado para reintento',
      });
    }

    return NextResponse.json(
      { error: 'Acción no válida' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Error en acción de job:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Se requiere jobId' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from('electronic_invoicing_jobs')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Error cancelando job' },
        { status: 500 }
      );
    }

    // Registrar evento
    await supabase
      .from('electronic_invoicing_events')
      .insert({
        job_id: jobId,
        event_type: 'cancelled',
        event_message: 'Job cancelado manualmente',
      });

    return NextResponse.json({
      success: true,
      data,
      message: 'Job cancelado',
    });

  } catch (error: any) {
    console.error('Error cancelando job:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
