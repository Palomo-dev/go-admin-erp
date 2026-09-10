/**
 * GET/PUT /api/crm/config/providers — registry de proveedores por organización.
 *
 * - Sesión obligatoria; organization_id SIEMPRE desde `getServerOrgContext()`.
 * - GET: lista por categoría con `configured`, `platform_available`, `settings`.
 *   NUNCA devuelve credenciales (ni sus valores). Siembra perezosa si 0 filas.
 * - PUT: solo admin (`isOrgAdmin`); upsert por (org, category, provider) con
 *   service role; valida shape por categoría/proveedor contra el catálogo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import { PROVIDER_CATEGORIES, type ProviderCategory } from '@/lib/crm/providerCatalog';
import {
  listProviderConfigsSafe,
  upsertProviderConfig,
  ProviderValidationError,
} from '@/lib/services/providerCredentials.server';

export const dynamic = 'force-dynamic';

const categorySchema = z.enum(PROVIDER_CATEGORIES as [ProviderCategory, ...ProviderCategory[]]);

const putSchema = z.object({
  category: categorySchema,
  provider: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
  settings: z.record(z.string(), z.unknown()).optional(),
  credentials: z.record(z.string().max(64), z.union([z.string().max(4096), z.null()])).optional(),
  is_active: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

function orgError(err: unknown): NextResponse | null {
  if (err instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
  }
  return null;
}

export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    const res = orgError(err);
    if (res) return res;
    throw err;
  }

  const raw = request.nextUrl.searchParams.get('category');
  const parsed = raw ? categorySchema.safeParse(raw) : null;
  if (raw && parsed && !parsed.success) {
    return NextResponse.json({ success: false, error: 'Categoría inválida' }, { status: 400 });
  }

  try {
    const items = await listProviderConfigsSafe(ctx.organizationId, parsed?.success ? parsed.data : undefined);
    return NextResponse.json({ success: true, items, can_edit: isOrgAdmin(ctx) });
  } catch (err) {
    console.error('[config/providers GET]', err);
    return NextResponse.json({ success: false, error: 'No se pudo listar la configuración' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    const res = orgError(err);
    if (res) return res;
    throw err;
  }

  if (!isOrgAdmin(ctx)) {
    return NextResponse.json({ success: false, error: 'Solo administradores pueden modificar proveedores' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Body inválido', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const item = await upsertProviderConfig(ctx.organizationId, parsed.data);
    return NextResponse.json({ success: true, item });
  } catch (err) {
    if (err instanceof ProviderValidationError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error('[config/providers PUT]', err);
    return NextResponse.json({ success: false, error: 'No se pudo guardar la configuración' }, { status: 500 });
  }
}
