/**
 * GET /api/inicio/tienda-web?periodo=…&sucursal= — tarjeta «Tienda web» del
 * inicio (Figma 445:137185): visitantes, pedidos y conversión del periodo
 * frente al anterior, y pedidos pendientes ahora.
 *
 * Organización de la sesión (`withOrg`); cifras de `fn_inicio_tienda_web`
 * (permiso de ventas resuelto en la base). Caché de 60 s por organización,
 * sucursal y periodo: las visitas son la tabla más grande del inicio y la
 * home no debe recalcularlas en cada visita (CLAUDE.md de los sitios:
 * «la tienda puede tumbar la base»).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { rangoDelPeriodo, tiendaWeb, type TiendaWeb } from '@/lib/dashboard/inicio.server';
import { queryPeriodo } from '@/lib/dashboard/periodo';
import { manejarError, pedidoPanel, SIN_CACHE } from '@/lib/dashboard/rutasInicio.server';

export const dynamic = 'force-dynamic';

const TTL_MS = 60_000;
const MAX_ENTRADAS = 500;
const cache = new Map<string, { hasta: number; datos: TiendaWeb }>();

export const GET = withOrg(async (ctx, req) => {
  const p = await pedidoPanel(ctx, req);
  if (p instanceof NextResponse) return p;
  // La clave incluye al usuario: la sucursal «Todas» depende de sus sucursales.
  const clave = `${ctx.organizationId}|${ctx.userId}|${queryPeriodo({ ...p.pedido, sucursal: p.sucursal })}`;
  const guardado = cache.get(clave);
  if (guardado && guardado.hasta > Date.now()) {
    return NextResponse.json(guardado.datos, { headers: SIN_CACHE });
  }
  try {
    const rango = await rangoDelPeriodo(ctx, p.pedido, p.sucursal);
    const datos = await tiendaWeb(ctx, rango, p.sucursal);
    if (cache.size >= MAX_ENTRADAS) cache.clear();
    cache.set(clave, { hasta: Date.now() + TTL_MS, datos });
    return NextResponse.json(datos, { headers: SIN_CACHE });
  } catch (err) {
    return manejarError('tienda-web', ctx, err);
  }
});
