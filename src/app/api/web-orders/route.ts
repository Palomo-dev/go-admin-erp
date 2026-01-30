import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface WebOrderItemInput {
  product_id?: number;
  product_name: string;
  product_sku?: string;
  quantity: number;
  unit_price: number;
  tax_amount?: number;
  discount_amount?: number;
  modifiers?: any[];
  notes?: string;
}

interface CreateWebOrderRequest {
  organization_id: number;
  branch_id: number;
  customer_id?: string;
  source?: 'website' | 'mobile_app' | 'whatsapp' | 'phone';
  delivery_type: 'pickup' | 'delivery_own' | 'delivery_third_party';
  delivery_partner?: string;
  delivery_address?: {
    address?: string;
    city?: string;
    neighborhood?: string;
    instructions?: string;
    lat?: number;
    lng?: number;
  };
  delivery_fee?: number;
  is_scheduled?: boolean;
  scheduled_at?: string;
  payment_method?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_notes?: string;
  items: WebOrderItemInput[];
}

async function generateOrderNumber(organizationId: number): Promise<string> {
  const { data, error } = await supabase.rpc('generate_web_order_number', { 
    org_id: organizationId 
  });
  
  if (error || !data) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `WO-${today}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  }
  
  return data;
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateWebOrderRequest = await request.json();

    // Validaciones básicas
    if (!body.organization_id || !body.branch_id) {
      return NextResponse.json(
        { error: 'organization_id y branch_id son requeridos' },
        { status: 400 }
      );
    }

    if (!body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: 'El pedido debe tener al menos un producto' },
        { status: 400 }
      );
    }

    if (!body.delivery_type) {
      return NextResponse.json(
        { error: 'delivery_type es requerido' },
        { status: 400 }
      );
    }

    // Generar número de pedido
    const orderNumber = await generateOrderNumber(body.organization_id);

    // Calcular totales
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    const itemsWithTotals = body.items.map(item => {
      const itemTotal = item.quantity * item.unit_price;
      const taxAmount = item.tax_amount || 0;
      const discountAmount = item.discount_amount || 0;
      
      subtotal += itemTotal;
      taxTotal += taxAmount * item.quantity;
      discountTotal += discountAmount * item.quantity;

      return {
        ...item,
        total: itemTotal - (discountAmount * item.quantity) + (taxAmount * item.quantity),
        tax_amount: taxAmount,
        discount_amount: discountAmount,
      };
    });

    const deliveryFee = body.delivery_fee || 0;
    const total = subtotal + taxTotal - discountTotal + deliveryFee;

    // Crear pedido
    const { data: order, error: orderError } = await supabase
      .from('web_orders')
      .insert({
        organization_id: body.organization_id,
        branch_id: body.branch_id,
        customer_id: body.customer_id,
        order_number: orderNumber,
        status: 'pending',
        source: body.source || 'website',
        subtotal,
        tax_total: taxTotal,
        discount_total: discountTotal,
        delivery_fee: deliveryFee,
        total,
        delivery_type: body.delivery_type,
        delivery_partner: body.delivery_partner,
        delivery_address: body.delivery_address || {},
        is_scheduled: body.is_scheduled || false,
        scheduled_at: body.scheduled_at,
        payment_status: 'pending',
        payment_method: body.payment_method,
        customer_name: body.customer_name,
        customer_email: body.customer_email,
        customer_phone: body.customer_phone,
        customer_notes: body.customer_notes,
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      return NextResponse.json(
        { error: 'Error al crear el pedido', details: orderError.message },
        { status: 500 }
      );
    }

    // Crear items del pedido
    const orderItems = itemsWithTotals.map(item => ({
      web_order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      product_sku: item.product_sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_amount: item.tax_amount,
      discount_amount: item.discount_amount,
      total: item.total,
      modifiers: item.modifiers || [],
      notes: item.notes,
      status: 'pending',
    }));

    const { error: itemsError } = await supabase
      .from('web_order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Error creating order items:', itemsError);
      // Revertir pedido si falla la creación de items
      await supabase.from('web_orders').delete().eq('id', order.id);
      return NextResponse.json(
        { error: 'Error al crear los items del pedido', details: itemsError.message },
        { status: 500 }
      );
    }

    // Obtener pedido completo con items
    const { data: fullOrder } = await supabase
      .from('web_orders')
      .select(`
        *,
        items:web_order_items(*)
      `)
      .eq('id', order.id)
      .single();

    return NextResponse.json({
      success: true,
      message: 'Pedido creado exitosamente',
      order: fullOrder,
    }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/web-orders:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const status = searchParams.get('status');
    const limit = searchParams.get('limit') || '50';

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organization_id es requerido' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('web_orders')
      .select(`
        *,
        items:web_order_items(*)
      `)
      .eq('organization_id', parseInt(organizationId))
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Error al obtener pedidos', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orders: data,
      count: data?.length || 0,
    });

  } catch (error) {
    console.error('Error in GET /api/web-orders:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
