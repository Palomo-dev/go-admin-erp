import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { webOrderServerConfirmation } from '@/lib/services/webOrderServerConfirmation';

/**
 * GET /api/cron/reconcile-web-orders
 *
 * Reconcilia pedidos web que fueron marcados como pagados/confirmados por el
 * website pero que NO dispararon la auto-confirmación del ERP (quedaron con
 * `payment_status = 'paid'` y `sale_id IS NULL`). Esto puede ocurrir cuando el
 * webhook de la pasarela de pago del website actualiza `web_orders` directamente
 * sin llamar a `/api/web-orders/[id]/auto-confirm`.
 *
 * Para cada pedido huérfano encontrado, ejecuta
 * `webOrderServerConfirmation.autoConfirmPaidOrder`, que crea:
 * - sale + sale_items (venta POS)
 * - decremento de stock (RPC decrement_stock_with_recipe)
 * - liberación de reserva (qty_reserved)
 * - invoice_sales + invoice_items (factura de venta)
 * - payments (registro de pago)
 * - accounts_receivable (cuenta por cobrar, si hay customer_id)
 * - shipment (envío, si es delivery)
 * - actualiza web_orders con sale_id + status=confirmed
 *
 * Es idempotente: `autoConfirmPaidOrder` no hace nada si el pedido ya tiene
 * sale_id, así que este cron se puede ejecutar de forma segura repetidas veces.
 *
 * Debe ser llamado por Vercel Cron cada 5 minutos.
 *
 * Seguridad: Requiere el header `Authorization: Bearer CRON_SECRET`.
 *
 * Query params:
 *   - limit: máximo de pedidos a procesar por ejecución (default: 25).
 *     Evita timeouts si se acumulan muchos huérfanos de golpe.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Verificar autorización
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken) {
      console.error('[Reconcile Web Orders] CRON_SECRET no configurado');
      return NextResponse.json(
        { success: false, error: 'Servicio no configurado correctamente' },
        { status: 500 }
      );
    }

    const token = authHeader?.replace('Bearer ', '');
    if (token !== expectedToken) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    // 2. Límite de pedidos por ejecución
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);

    // 3. Crear cliente service_role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { success: false, error: 'Variables de entorno no configuradas' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 4. Buscar pedidos huérfanos: pagados pero sin sale_id.
    //    Se excluyen los cancelados/rechazados/expirados para no procesarlos.
    //    Orden ascendente por created_at para recuperar primero los más antiguos.
    const { data: orphanOrders, error: queryError } = await supabase
      .from('web_orders')
      .select('id, order_number, organization_id, created_at')
      .eq('payment_status', 'paid')
      .is('sale_id', null)
      .not('status', 'in', '("cancelled","rejected","expired","refunded")')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (queryError) {
      console.error('[Reconcile Web Orders] Error consultando huérfanos:', queryError);
      return NextResponse.json(
        { success: false, error: queryError.message },
        { status: 500 }
      );
    }

    if (!orphanOrders || orphanOrders.length === 0) {
      return NextResponse.json({
        success: true,
        processedCount: 0,
        succeededCount: 0,
        failedCount: 0,
        failures: [],
        timestamp: new Date().toISOString(),
      });
    }

    // 5. Confirmar cada pedido huérfano
    const failures: { orderId: string; orderNumber: string; error: string }[] = [];
    let succeededCount = 0;

    for (const orphan of orphanOrders) {
      try {
        const result = await webOrderServerConfirmation.autoConfirmPaidOrder(orphan.id);
        // Si result.saleId viene vacío o sin stockErrors, igual consideramos éxito
        // mientras se haya asignado sale_id.
        console.log(
          `[Reconcile Web Orders] ✅ ${orphan.order_number} → sale ${result.saleId}` +
          (result.stockErrors.length ? ` (stock errors: ${result.stockErrors.length})` : '')
        );
        succeededCount += 1;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        console.error(
          `[Reconcile Web Orders] ❌ ${orphan.order_number} (${orphan.id}): ${message}`
        );
        failures.push({
          orderId: orphan.id,
          orderNumber: orphan.order_number,
          error: message,
        });
      }
    }

    const failedCount = failures.length;

    return NextResponse.json({
      success: true,
      processedCount: orphanOrders.length,
      succeededCount,
      failedCount,
      failures,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[Reconcile Web Orders] Error inesperado:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
