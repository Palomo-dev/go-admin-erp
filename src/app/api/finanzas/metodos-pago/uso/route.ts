/**
 * GET /api/finanzas/metodos-pago/uso — cuántos pagos (`payments.method`) tiene
 * cada código de método en la organización de la sesión.
 *
 * Alimenta el aviso «N métodos usados y sin configurar» de Métodos de pago:
 * hay códigos que llegan por la tienda web o por facturas sin tener fila en
 * `organization_payment_methods`. Solo lectura y con la sesión del usuario
 * (RLS de `payments`: miembro de la organización y sus sucursales).
 *
 * Los candidatos son los códigos del catálogo que la persona puede leer más
 * los de su organización; un conteo `head` por código (sin traer filas).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';

export const dynamic = 'force-dynamic';

const EN_PARALELO = 8;

export const GET = withOrg(async (ctx) => {
  const [catalogo, propios] = await Promise.all([
    ctx.supabase.from('payment_methods').select('code'),
    ctx.supabase.from('organization_payment_methods').select('payment_method_code').eq('organization_id', ctx.organizationId),
  ]);
  if (catalogo.error || propios.error) {
    console.error('[api/finanzas/metodos-pago/uso] códigos', catalogo.error?.message ?? propios.error?.message);
    return NextResponse.json({ error: 'No se pudieron leer los métodos de pago' }, { status: 500 });
  }

  const codigos = Array.from(
    new Set(
      [
        ...((catalogo.data ?? []) as Array<{ code: string | null }>).map((r) => r.code),
        ...((propios.data ?? []) as Array<{ payment_method_code: string | null }>).map((r) => r.payment_method_code),
      ].filter((c): c is string => typeof c === 'string' && c.trim() !== ''),
    ),
  );

  const porMetodo: Record<string, number> = {};
  try {
    for (let i = 0; i < codigos.length; i += EN_PARALELO) {
      await Promise.all(
        codigos.slice(i, i + EN_PARALELO).map(async (codigo) => {
          const { count, error } = await ctx.supabase
            .from('payments')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', ctx.organizationId)
            .eq('method', codigo);
          if (error) throw error;
          if (count && count > 0) porMetodo[codigo] = count;
        }),
      );
    }
  } catch (error) {
    console.error('[api/finanzas/metodos-pago/uso] conteo', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'No se pudieron contar los pagos por método' }, { status: 500 });
  }

  return NextResponse.json(
    { organizationId: ctx.organizationId, porMetodo },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
