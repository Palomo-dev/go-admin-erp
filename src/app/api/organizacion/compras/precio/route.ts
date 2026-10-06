/**
 * GET /api/organizacion/compras/precio — precio unitario de las compras de cupo
 * de la organización de la sesión, para el desglose del diálogo «Comprar
 * usuarios / sucursales / créditos de IA» (Figma 08, sección 9).
 *
 * Mismo cálculo que el cobro (`src/lib/stripe/preciosCompras.ts`). Solo lee
 * precios de catálogo y el plan de la propia organización; no requiere permiso
 * de facturación para MIRAR (el cobro sí lo exige).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { precioComplemento, precioCreditosIa } from '@/lib/stripe/preciosCompras';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  const servicio = getServiceClient();
  try {
    const [usuarios, sucursales, creditos] = await Promise.all([
      precioComplemento(servicio, ctx.organizationId, 'extra_users'),
      precioComplemento(servicio, ctx.organizationId, 'extra_branches'),
      precioCreditosIa(servicio),
    ]);
    return NextResponse.json(
      {
        usuarios: { unitarioCentavos: usuarios.unitarioCentavos, moneda: usuarios.moneda, minimo: usuarios.minimo, maximo: usuarios.maximo },
        sucursales: { unitarioCentavos: sucursales.unitarioCentavos, moneda: sucursales.moneda, minimo: sucursales.minimo, maximo: sucursales.maximo },
        creditos: { unitarioCentavos: creditos.unitarioCentavos, moneda: creditos.moneda, minimo: 100, maximo: null },
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/organizacion/compras/precio]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudo leer el precio' }, { status: 500 });
  }
});
