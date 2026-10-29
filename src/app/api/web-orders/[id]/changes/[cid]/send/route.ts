import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { enviarCorreoCambio, respuestaError } from '@/lib/services/webOrderChanges/webOrderChangesServer';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, _req, rp) => {
  try {
    const { cid } = (await rp!.params) as { cid: string };
    return NextResponse.json(await enviarCorreoCambio(ctx, cid));
  } catch (e) { return respuestaError(e); }
});
