/**
 * Helpers HTTP para las rutas /api/email/* (respuesta {success,error,code}).
 */

import { NextResponse } from 'next/server';
import { OrgContextError, getServerOrgContext, type ServerOrgContext } from '@/lib/utils/orgContext';
import { InsufficientCreditsError } from '@/lib/services/crm/aiCostService';
import { EmailError } from './types';

export function emailErrorResponse(err: unknown, tag = 'email'): NextResponse {
  if (err instanceof OrgContextError) return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.statusCode });
  if (err instanceof EmailError) return NextResponse.json({ success: false, error: err.message, code: err.code, details: err.details ?? undefined }, { status: err.status });
  if (err instanceof InsufficientCreditsError) return NextResponse.json({ success: false, error: err.message, code: 'NO_CREDITS' }, { status: 402 });
  const message = err instanceof Error ? err.message : 'Error desconocido';
  console.error(`[${tag}]`, message);
  return NextResponse.json({ success: false, error: message, code: 'INTERNAL' }, { status: 500 });
}

export function ok(data: unknown, status = 200, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ success: true, data, ...extra }, { status });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new EmailError('VALIDATION', 'Body JSON inválido', 400);
  }
}

export type Ctx = ServerOrgContext;
export { getServerOrgContext };
