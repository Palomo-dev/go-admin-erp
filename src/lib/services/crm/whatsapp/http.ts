/**
 * Helpers HTTP para las rutas `/api/crm/whatsapp/*` y `/api/crm/campaigns/*`:
 * sesión + org (`getServerOrgContext`), admin opcional, `WhatsAppError` →
 * JSON `{error, code, details}` con su status. SOLO servidor.
 */

import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin, type ServerOrgContext } from '@/lib/utils/orgContext';
import { WhatsAppError } from './types';

export function whatsappErrorResponse(err: unknown): NextResponse {
  if (err instanceof WhatsAppError) {
    return NextResponse.json({ error: err.message, code: err.code, details: err.details ?? null }, { status: err.status });
  }
  if (err instanceof OrgContextError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
  const message = err instanceof Error ? err.message : 'Error interno';
  console.error('[crm/whatsapp]', message);
  return NextResponse.json({ error: message, code: 'INTERNAL' }, { status: 500 });
}

type Params = { params: Promise<Record<string, string>> };
export type WaHandler = (ctx: ServerOrgContext, req: Request, params: Record<string, string>) => Promise<Response>;

export function withWhatsAppRoute(handler: WaHandler, opts: { admin?: boolean } = {}) {
  // El validador de rutas de Next exige el segundo parametro no opcional
  return async (req: Request, route: Params): Promise<Response> => {
    try {
      const ctx = await getServerOrgContext(req);
      if (opts.admin) requireOrgAdmin(ctx);
      const params = route?.params ? await route.params : {};
      return await handler(ctx, req, params);
    } catch (err) {
      return whatsappErrorResponse(err);
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
