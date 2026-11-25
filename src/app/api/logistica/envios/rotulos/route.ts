/**
 * POST /api/logistica/envios/rotulos — lo que el rótulo de envío solo puede saber en el servidor
 * (Figma «21 Logística» 3223:15627): el enlace de seguimiento de la tienda para el QR
 * (`/pedido/<n>?t=<token>`, el mismo HMAC con que la tienda valida; el secreto vive solo aquí) y si
 * el anticipo de la contraentrega está pagado (para decir «Saldo después del anticipo…»).
 *
 * - Sesión + organización (`withOrg`); un body con otra organización responde 403 (`readOrgBody`).
 * - Los envíos se leen con el cliente de la SESIÓN (RLS) y filtrados por la organización: un id
 *   que la persona no ve simplemente no vuelve. Después, service role solo para el pedido web de
 *   esos envíos ya validados y los dominios de la organización (mismo patrón que
 *   `/api/web-orders/[id]/enlace-pago`).
 * - Sin sitio publicado o sin pedido web, `seguimiento` es null y el QR lleva la guía.
 *
 * Body: `{ ids: string[] }` (hasta 200). Respuesta: `{ rotulos: { [envioId]: { seguimiento, anticipoPagado } } }`.
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { hostSitio, type DominioDelSitio } from '@/lib/website/hostSitio';
import { urlSeguimiento } from '@/lib/services/orderStatusEmailService';
import type { DatosServidorRotulo } from '@/lib/logistica/rotuloEnvio';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 200;
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<{ ids?: unknown }>(ctx, request, { route: 'logistica/envios/rotulos' });
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((v): v is string => typeof v === 'string' && UUID.test(v)))].slice(0, MAX_IDS) : [];
  if (ids.length === 0) return NextResponse.json({ rotulos: {} }, { headers: SIN_CACHE });

  const { data: envios, error } = await ctx.supabase
    .from('shipments')
    .select('id, source_type, source_id')
    .eq('organization_id', ctx.organizationId)
    .in('id', ids);
  if (error) {
    console.error('[logistica/rotulos] lectura de envíos falló', { organizationId: ctx.organizationId, message: error.message });
    return NextResponse.json({ error: 'Error interno', code: 'ERROR' }, { status: 500 });
  }

  const filas = (envios ?? []) as { id: string; source_type: string | null; source_id: string | null }[];
  const pedidosIds = [...new Set(filas.filter((e) => e.source_type === 'web_order' && e.source_id).map((e) => e.source_id as string))];
  const rotulos: Record<string, DatosServidorRotulo> = {};
  for (const e of filas) rotulos[e.id] = { seguimiento: null, anticipoPagado: false };
  if (pedidosIds.length === 0) return NextResponse.json({ rotulos }, { headers: SIN_CACHE });

  const db = getSupabaseAdmin();
  const [pedidosRes, orgRes, dominiosRes] = await Promise.all([
    db.from('web_orders').select('id, order_number, advance_amount, advance_status').eq('organization_id', ctx.organizationId).in('id', pedidosIds),
    db.from('organizations').select('subdomain').eq('id', ctx.organizationId).maybeSingle(),
    db.from('organization_domains').select('host, domain_type, status, is_primary, is_active').eq('organization_id', ctx.organizationId),
  ]);
  if (pedidosRes.error) {
    console.error('[logistica/rotulos] lectura de pedidos falló', { organizationId: ctx.organizationId, message: pedidosRes.error.message });
    return NextResponse.json({ rotulos }, { headers: SIN_CACHE });
  }
  const host = hostSitio((dominiosRes.data ?? []) as DominioDelSitio[], (orgRes.data as { subdomain?: string | null } | null)?.subdomain ?? null);
  const pedidos = new Map(
    ((pedidosRes.data ?? []) as { id: string; order_number: string | null; advance_amount: number | string | null; advance_status: string | null }[]).map((p) => [p.id, p]),
  );
  for (const e of filas) {
    const p = e.source_id ? pedidos.get(e.source_id) : undefined;
    if (!p) continue;
    rotulos[e.id] = {
      seguimiento: p.order_number ? urlSeguimiento({ id: ctx.organizationId, host }, { id: p.id, order_number: p.order_number }) : null,
      anticipoPagado: p.advance_status === 'paid' && Number(p.advance_amount) > 0,
    };
  }
  return NextResponse.json({ rotulos }, { headers: SIN_CACHE });
});
