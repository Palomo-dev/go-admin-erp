import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

type WebOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'in_delivery' | 'delivered' | 'cancelled' | 'rejected';

interface UpdateOrderRequest {
  status?: WebOrderStatus;
  payment_status?: 'pending' | 'paid' | 'partial' | 'refunded' | 'failed';
  payment_reference?: string;
  internal_notes?: string;
  cancellation_reason?: string;
  estimated_ready_at?: string;
  estimated_delivery_at?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('web_orders')
      .select(`
        *,
        items:web_order_items(*),
        customer:customers(id, full_name, email, phone),
        branch:branches(id, name, address, phone)
      `)
      .eq('id', orderId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Pedido no encontrado' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Error al obtener pedido', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order: data,
    });

  } catch (error) {
    console.error('Error in GET /api/web-orders/[id]:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    const body: UpdateOrderRequest = await request.json();

    const updateData: any = {};
    const now = new Date().toISOString();

    // Actualizar estado si se proporciona
    if (body.status) {
      updateData.status = body.status;

      // Campos específicos según el estado
      switch (body.status) {
        case 'confirmed':
          updateData.confirmed_at = now;
          if (body.estimated_ready_at) {
            updateData.estimated_ready_at = body.estimated_ready_at;
          }
          break;
        case 'ready':
          updateData.ready_at = now;
          break;
        case 'delivered':
          updateData.delivered_at = now;
          break;
        case 'cancelled':
        case 'rejected':
          updateData.cancelled_at = now;
          if (body.cancellation_reason) {
            updateData.cancellation_reason = body.cancellation_reason;
          }
          break;
      }
    }

    // Otros campos actualizables
    if (body.payment_status) {
      updateData.payment_status = body.payment_status;
    }
    if (body.payment_reference) {
      updateData.payment_reference = body.payment_reference;
    }
    if (body.internal_notes) {
      updateData.internal_notes = body.internal_notes;
    }
    if (body.estimated_delivery_at) {
      updateData.estimated_delivery_at = body.estimated_delivery_at;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No hay campos para actualizar' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('web_orders')
      .update(updateData)
      .eq('id', orderId)
      .select(`
        *,
        items:web_order_items(*)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Pedido no encontrado' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Error al actualizar pedido', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Pedido actualizado',
      order: data,
    });

  } catch (error) {
    console.error('Error in PATCH /api/web-orders/[id]:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    const supabase = getSupabaseClient();

    // Primero verificar que el pedido existe y su estado permite eliminación
    const { data: existingOrder, error: fetchError } = await supabase
      .from('web_orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (fetchError || !existingOrder) {
      return NextResponse.json(
        { error: 'Pedido no encontrado' },
        { status: 404 }
      );
    }

    // Solo permitir eliminar pedidos cancelados o rechazados
    if (!['cancelled', 'rejected'].includes(existingOrder.status)) {
      return NextResponse.json(
        { error: 'Solo se pueden eliminar pedidos cancelados o rechazados' },
        { status: 400 }
      );
    }

    // Los items se eliminan automáticamente por ON DELETE CASCADE
    const { error } = await supabase
      .from('web_orders')
      .delete()
      .eq('id', orderId);

    if (error) {
      return NextResponse.json(
        { error: 'Error al eliminar pedido', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Pedido eliminado',
    });

  } catch (error) {
    console.error('Error in DELETE /api/web-orders/[id]:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
