import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/web-orders/observability
 *
 * Panel de observabilidad de comercio web (F11.7 — Ronda 2).
 *
 * Devuelve:
 *  1. Stock reservado vs disponible por sucursal (solo productos con
 *     qty_reserved > 0), con alerta de reservas huérfanas (>24h sin moverse).
 *  2. Pedidos pendientes próximos a expirar (siguientes 30 min por defecto),
 *     con el tiempo efectivo de expiración por organización.
 *
 * Requiere service_role (es un endpoint interno del ERP).
 */

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Variables de entorno no configuradas' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const withinMinutes = parseInt(searchParams.get('within_minutes') || '30', 10);

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organization_id es requerido' },
        { status: 400 }
      );
    }

    const orgId = parseInt(organizationId, 10);

    // ── 0. Obtener sucursales de la organización para filtrar stock ──
    const { data: orgBranches, error: branchesError } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', orgId);

    if (branchesError) {
      console.error('[Observability] Error branches:', branchesError);
      return NextResponse.json(
        { error: branchesError.message },
        { status: 500 }
      );
    }

    const branchIds = (orgBranches || []).map((b: any) => b.id);

    // ── 1. Stock reservado vs disponible por sucursal ──
    // Solo productos con qty_reserved > 0 (los que tienen reserva activa).
    // Filtrado por las sucursales de la organización actual.
    const stockQuery = supabase
      .from('stock_levels')
      .select(
        `id, product_id, branch_id, qty_on_hand, qty_reserved, updated_at,
         products ( id, name, sku, track_stock ),
         branches ( id, name )`
      )
      .gt('qty_reserved', 0)
      .is('lot_id', null);

    if (branchIds.length > 0) {
      stockQuery.in('branch_id', branchIds);
    } else {
      // Sin sucursales → devolver vacío
      stockQuery.eq('branch_id', -1);
    }

    const { data: stockRows, error: stockError } = await stockQuery.order(
      'updated_at',
      { ascending: true }
    );

    if (stockError) {
      console.error('[Observability] Error stock:', stockError);
      return NextResponse.json(
        { error: stockError.message },
        { status: 500 }
      );
    }

    const now = Date.now();
    const ORPHAN_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

    const reservedStock = (stockRows || [])
      .filter((row: any) => row.products?.track_stock)
      .map((row: any) => ({
        productId: row.product_id,
        productName: row.products?.name || `Producto ${row.product_id}`,
        sku: row.products?.sku || null,
        branchId: row.branch_id,
        branchName: row.branches?.name || `Sucursal ${row.branch_id}`,
        qtyOnHand: Number(row.qty_on_hand) || 0,
        qtyReserved: Number(row.qty_reserved) || 0,
        qtyAvailable: (Number(row.qty_on_hand) || 0) - (Number(row.qty_reserved) || 0),
        updatedAt: row.updated_at,
        // Reserva huérfana: lleva más de 24h sin moverse (síntoma de pedido
        // abandonado cuyo stock no se liberó)
        isOrphan:
          row.updated_at && now - new Date(row.updated_at).getTime() > ORPHAN_THRESHOLD_MS,
      }));

    // ── 2. Pedidos pendientes próximos a expirar ──
    // Traemos los pendientes y calculamos cuáles expiran en los próximos
    // `withinMinutes` minutos según el tiempo efectivo por organización.
    const { data: pendingOrders, error: ordersError } = await supabase
      .from('web_orders')
      .select(
        `id, order_number, organization_id, branch_id, status, payment_status,
         payment_method, total, customer_name, customer_email, created_at,
         branches ( id, name )`
      )
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .eq('payment_status', 'pending')
      .is('stock_released_at', null)
      .order('created_at', { ascending: true })
      .limit(100);

    if (ordersError) {
      console.error('[Observability] Error pedidos:', ordersError);
      return NextResponse.json(
        { error: ordersError.message },
        { status: 500 }
      );
    }

    // Leer configuración de expiración por organización
    const orgIds = [...new Set((pendingOrders || []).map((o: any) => o.organization_id))];
    const { data: orgSettings } = await supabase
      .from('organization_settings')
      .select('organization_id, settings')
      .eq('key', 'web_commerce')
      .in('organization_id', orgIds.length > 0 ? orgIds : [-1]);

    const expirationMap = new Map<number, number>();
    for (const s of orgSettings || []) {
      const mins = (s.settings as any)?.order_expiration_minutes;
      if (typeof mins === 'number' && mins > 0) {
        expirationMap.set(s.organization_id, mins);
      }
    }

    const MANUAL_METHODS = ['transfer', 'cash', 'bancolombia_transfer', 'bancolombia_collect', 'pse'];
    const DEFAULT_MINUTES = 30;

    const ordersNearExpiry = (pendingOrders || [])
      .map((o: any) => {
        const orgMinutes = expirationMap.get(o.organization_id);
        const effectiveMinutes =
          orgMinutes ??
          (MANUAL_METHODS.includes(o.payment_method) ? 1440 : DEFAULT_MINUTES);

        const createdAt = new Date(o.created_at).getTime();
        const expiresAt = createdAt + effectiveMinutes * 60 * 1000;
        const minutesUntilExpiry = Math.round((expiresAt - now) / 60000);

        return {
          id: o.id,
          orderNumber: o.order_number,
          organizationId: o.organization_id,
          branchId: o.branch_id,
          branchName: o.branches?.name || null,
          paymentMethod: o.payment_method,
          total: Number(o.total) || 0,
          customerName: o.customer_name || null,
          createdAt: o.created_at,
          expiresAt: new Date(expiresAt).toISOString(),
          minutesUntilExpiry,
          effectiveExpirationMinutes: effectiveMinutes,
          isNearExpiry: minutesUntilExpiry <= withinMinutes,
        };
      })
      .filter((o: any) => o.minutesUntilExpiry <= withinMinutes)
      .sort((a: any, b: any) => a.minutesUntilExpiry - b.minutesUntilExpiry);

    // ── Resumen ──
    const summary = {
      totalReservedItems: reservedStock.length,
      totalReservedUnits: reservedStock.reduce(
        (sum, r) => sum + r.qtyReserved,
        0
      ),
      orphanReservations: reservedStock.filter((r) => r.isOrphan).length,
      pendingOrdersCount: (pendingOrders || []).length,
      ordersNearExpiryCount: ordersNearExpiry.length,
    };

    return NextResponse.json({
      summary,
      reservedStock,
      ordersNearExpiry,
      withinMinutes,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[Observability] Error inesperado:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
