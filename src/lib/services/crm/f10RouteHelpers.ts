/**
 * F10 — helpers comunes de las rutas de propuesta/contrato/pago/demo.
 * Regla dura 5: la organización sale de la sesión; si el body trae otra → 403
 * y se registra (`foreignOrganizationInBody`, la misma decisión que Voces).
 */

import { NextResponse } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContext';
import { foreignOrganizationInBody } from '@/lib/services/crm/voiceLibrary';

export function foreignOrgResponse(tag: string, body: unknown, sessionOrg: number): NextResponse | null {
  const claimed = foreignOrganizationInBody((body as { organization_id?: unknown } | null)?.organization_id, sessionOrg);
  if (claimed === null) return null;
  console.warn(`[${tag}] organization_id ajeno en el body`, { session: sessionOrg, body: claimed });
  return NextResponse.json({ success: false, error: 'Organización no permitida' }, { status: 403 });
}

export function failResponse(tag: string, error: unknown): NextResponse {
  if (error instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`[${tag}]`, message);
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identificador aceptable para filtrar (uuid real o id de prueba corto sin caracteres raros). */
export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 && /^[A-Za-z0-9_-]+$/.test(value);
}
