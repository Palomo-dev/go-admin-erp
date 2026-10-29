import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { aplicarCambio, respuestaError } from '@/lib/services/webOrderChanges/webOrderChangesServer';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, rp) => {
  try {
    const { cid } = (await rp!.params) as { cid: string };
    return NextResponse.json(await aplicarCambio(ctx, cid, await req.json().catch(() => ({}))));
  } catch (e) { return respuestaError(e); }
});
