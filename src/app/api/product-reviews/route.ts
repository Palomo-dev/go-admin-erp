import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/product-reviews?organizationId=X&status=pending&productId=Y
 *
 * Lista las reseñas de producto para moderación en el ERP.
 * Filtros opcionales: status (pending|approved|rejected), productId.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const status = searchParams.get('status');
    const productId = searchParams.get('productId');

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId requerido' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('product_reviews')
      .select(`
        id,
        product_id,
        author_name,
        author_city,
        rating,
        title,
        content,
        images,
        is_verified_purchase,
        status,
        rejection_reason,
        reply_text,
        reply_at,
        helpful_count,
        created_at,
        products!inner (id, name, slug, uuid )
      `)
      .eq('organization_id', Number(organizationId))
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (productId && productId !== 'all') {
      query = query.eq('product_id', Number(productId));
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching reviews:', error);
      return NextResponse.json({ error: 'Error al obtener reseñas' }, { status: 500 });
    }

    return NextResponse.json({ reviews: data || [] });
  } catch (error: any) {
    console.error('GET /api/product-reviews:', error?.message || error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/**
 * PATCH /api/product-reviews
 *
 * Actualiza el estado de una reseña (aprobar, rechazar, responder).
 * Body: { reviewId, status?, rejectionReason?, replyText? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { reviewId, status, rejectionReason, replyText } = body;

    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId requerido' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const updates: Record<string, any> = {};

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      updates.status = status;
    }
    if (rejectionReason !== undefined) {
      updates.rejection_reason = rejectionReason;
    }
    if (replyText !== undefined) {
      updates.reply_text = replyText;
      updates.reply_at = new Date().toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('product_reviews')
      .update(updates)
      .eq('id', reviewId)
      .select('id, status')
      .single();

    if (error) {
      console.error('Error updating review:', error);
      return NextResponse.json({ error: 'Error al actualizar reseña' }, { status: 500 });
    }

    return NextResponse.json({ success: true, review: data });
  } catch (error: any) {
    console.error('PATCH /api/product-reviews:', error?.message || error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
