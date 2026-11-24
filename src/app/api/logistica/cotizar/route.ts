/**
 * POST /api/logistica/cotizar — «¿Cuánto cuesta enviar a…?» para el POS, el pedido manual de
 * Pedidos online y el simulador de Logística › Configuración (logística Fase 1).
 *
 * - La organización sale de la sesión (`withOrg`); un body con otra organización responde 403
 *   (`readOrgBody`).
 * - El cálculo es el único que existe: `cotizarEnvio` → `logistica_cotizar_envio`, con el cliente
 *   de la sesión (la RPC exige miembro activo y acceso a la sede). Aquí solo se completa el código
 *   DANE cuando la dirección trae la ciudad escrita a mano.
 * - Devuelve además si la persona puede cambiar el cargo que llenó la zona (resuelto aquí, nunca
 *   en el navegador).
 *
 * Body: { branchId, canal: 'pos' | 'manual' | 'web', subtotal, direccion: { ciudad, municipio_id,
 *         municipio_dane, barrio, codigo_postal, lat, lng }, opciones?: { metodo_pago, peso_kg,
 *         items: [{ product_id, cantidad }] } } — con `items` la base suma el peso del pedido.
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { CANALES_COTIZACION, itemsParaCotizar, type CanalCotizacion, type DireccionCotizacion } from '@/lib/logistica/cotizacion';
import { cotizarEnvio, CotizacionEnvioError } from '@/lib/services/logistica/cotizacionEnvioService';
import { resolverMunicipioDane } from '@/lib/services/logistica/municipioDaneService';
import { puedeEditarCargoDomicilio } from '@/lib/logistica/permisosLogistica.server';

export const dynamic = 'force-dynamic';

interface CuerpoCotizar {
  branchId?: unknown;
  canal?: unknown;
  subtotal?: unknown;
  direccion?: {
    ciudad?: unknown;
    municipio_id?: unknown;
    municipio_dane?: unknown;
    barrio?: unknown;
    codigo_postal?: unknown;
    lat?: unknown;
    lng?: unknown;
  } | null;
  opciones?: { metodo_pago?: unknown; peso_kg?: unknown; items?: unknown } | null;
}

const texto = (v: unknown, max = 120): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<CuerpoCotizar>(ctx, request, { route: 'logistica/cotizar' });
  const canal = (CANALES_COTIZACION as readonly string[]).includes(String(body?.canal)) ? (body!.canal as CanalCotizacion) : null;
  if (!canal) return NextResponse.json({ error: 'Canal inválido', code: 'CANAL_INVALIDO' }, { status: 400 });
  const branchId = numero(body?.branchId);
  const subtotal = Math.max(numero(body?.subtotal) ?? 0, 0);
  const d = body?.direccion ?? {};

  const municipioDane =
    texto(d.municipio_dane, 10) ??
    (await resolverMunicipioDane(ctx.supabase, { municipioId: texto(d.municipio_id, 40), ciudad: texto(d.ciudad) }));
  const direccion: DireccionCotizacion = {
    municipio_dane: municipioDane,
    barrio: texto(d.barrio),
    codigo_postal: texto(d.codigo_postal, 12),
    lat: numero(d.lat),
    lng: numero(d.lng),
  };
  const pesoKg = numero(body?.opciones?.peso_kg);

  try {
    const [cotizacion, puedeEditarCargo] = await Promise.all([
      cotizarEnvio(ctx.supabase, {
        organizationId: ctx.organizationId,
        branchId: branchId !== null && Number.isInteger(branchId) ? branchId : null,
        direccion,
        canal,
        subtotal,
        opciones: {
          metodo_pago: texto(body?.opciones?.metodo_pago, 40),
          peso_kg: pesoKg !== null && pesoKg > 0 ? pesoKg : null,
          // Productos del pedido: la base suma su peso (solo ids y cantidades; nada más del cliente).
          items: itemsParaCotizar(Array.isArray(body?.opciones?.items) ? (body.opciones.items as { product_id?: unknown; cantidad?: unknown }[]) : []),
        },
      }),
      puedeEditarCargoDomicilio(ctx),
    ]);
    return NextResponse.json(
      { cotizacion, municipioDane, puedeEditarCargo },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    if (err instanceof CotizacionEnvioError) {
      const status = err.codigo === 'SIN_ACCESO' ? 403 : err.codigo === 'ERROR' ? 500 : 400;
      if (status === 500) console.error('[logistica/cotizar] la cotización falló', { organizationId: ctx.organizationId, message: err.message });
      return NextResponse.json({ error: err.codigo, code: err.codigo }, { status });
    }
    throw err;
  }
});
