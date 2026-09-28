/**
 * POST /api/finanzas/tasas-cambio/sincronizar
 *
 * Sincronización manual del catálogo GLOBAL de tasas (`currency_rates`).
 * GO-sec (2026-09-28): el catálogo no tiene organización y lo leen todas, así
 * que solo lo escribe la plataforma: sesión + `fn_is_platform_admin()`
 * (`withPlatformAdmin`). La escritura va con service role, que es lo único que
 * la RLS de `currency_rates` deja escribir; la clave de OpenExchangeRates es la
 * variable de servidor `OPENEXCHANGERATES_API_KEY`.
 *
 * Body: `{ modo?: 'hoy' | 'faltantes' }`. Nada del body decide a quién se escribe.
 */
import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/security/platformAdmin';
import { getServiceClient } from '@/lib/supabase/server-service';
import { actualizarTasasDeCambioGlobal, llenarFechasFaltantesConDatosReales } from '@/lib/services/tasasCambio.server';

const SIN_CACHE = { 'Cache-Control': 'no-store, max-age=0' };

export const POST = withPlatformAdmin(async (admin, request) => {
  const body = (await request.json().catch(() => ({}))) as { modo?: unknown };
  const modo = body.modo === 'faltantes' ? 'faltantes' : 'hoy';
  try {
    const db = getServiceClient();
    if (modo === 'faltantes') {
      const r = await llenarFechasFaltantesConDatosReales(db);
      console.info('[tasas-cambio] relleno de fechas', { userId: admin.userId, llenadas: r.fechas_llenadas, errores: r.errores.length });
      return NextResponse.json({ success: true, updated_count: r.fechas_llenadas, message: r.message, errores: r.errores }, { headers: SIN_CACHE });
    }
    const r = await actualizarTasasDeCambioGlobal(db);
    console.info('[tasas-cambio] sincronización manual', { userId: admin.userId, actualizadas: r.updated_count });
    return NextResponse.json(r, { headers: SIN_CACHE });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error('[tasas-cambio] error en la sincronización', mensaje);
    return NextResponse.json({ success: false, error: mensaje }, { status: 502, headers: SIN_CACHE });
  }
});
