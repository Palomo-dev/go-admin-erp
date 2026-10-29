import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { crearCambio, listarCambios, respuestaError } from '@/lib/services/webOrderChanges/webOrderChangesServer';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, _req, rp) => {
  try {
    const { id } = (await rp!.params) as { id: string };
    return NextResponse.json(await listarCambios(ctx, id));
  } catch (e) { return respuestaError(e); }
});

/** Crea (o solo cotiza con `soloCotizar`) un cambio de productos del pedido. */
export const POST = withOrg(async (ctx, req, rp) => {
  try {
    const { id } = (await rp!.params) as { id: string };
    return NextResponse.json(await crearCambio(ctx, id, await req.json().catch(() => ({}))));
  } catch (e) { return respuestaError(e); }
});
