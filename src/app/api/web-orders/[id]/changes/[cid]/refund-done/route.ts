import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { marcarReembolsoHecho, respuestaError } from '@/lib/services/webOrderChanges/webOrderChangesServer';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, _req, rp) => {
  try {
    const { cid } = (await rp!.params) as { cid: string };
    return NextResponse.json(await marcarReembolsoHecho(ctx, cid));
  } catch (e) { return respuestaError(e); }
});
