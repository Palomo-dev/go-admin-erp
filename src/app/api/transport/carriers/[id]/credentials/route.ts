/**
 * GET/PUT /api/transport/carriers/[id]/credentials
 *
 * Credenciales de API de una transportadora. Sustituye al camino anterior, en el que el
 * navegador escribía la `api_key` en claro dentro de `transport_carriers.metadata`.
 *
 * - Sesión obligatoria; la `organization_id` sale SIEMPRE de `getServerOrgContext()`,
 *   nunca del body ni de la URL. El `id` de la transportadora sí viene del cliente, y por
 *   eso el servicio comprueba que pertenezca a esa organización.
 * - PUT: sólo admin de la organización. Los secretos van a Vault por
 *   `fn_set_provider_secret`; lo que no es secreto (usuario, número de cuenta) va a
 *   `integration_connections.settings`.
 * - GET: estado de la conexión y prefijo de cada secreto. **Nunca devuelve un secreto.**
 *
 * Sigue el patrón de `src/app/api/crm/config/providers/route.ts`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import {
  saveCarrierCredentials,
  getCarrierCredentialsSafe,
  CarrierCredentialsError,
} from '@/lib/services/integrations/carriers/carrierCredentials.server';

export const dynamic = 'force-dynamic';

const uuidSchema = z.string().uuid();

const putSchema = z.object({
  environment: z.enum(['production', 'sandbox']),
  username: z.string().max(200).nullish(),
  accountNumber: z.string().max(200).nullish(),
  apiKey: z.string().max(4096).nullish(),
  webhookSecret: z.string().max(4096).nullish(),
});

function orgError(err: unknown): NextResponse | null {
  if (err instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
  }
  return null;
}

function serviceError(err: unknown, etiqueta: string): NextResponse {
  if (err instanceof CarrierCredentialsError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
  // Nunca se propaga el detalle: podría arrastrar contexto del secreto.
  console.error(etiqueta, err);
  return NextResponse.json(
    { success: false, error: 'No se pudieron procesar las credenciales' },
    { status: 500 }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    const res = orgError(err);
    if (res) return res;
    throw err;
  }

  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) {
    return NextResponse.json({ success: false, error: 'Id de transportadora inválido' }, { status: 400 });
  }

  try {
    const item = await getCarrierCredentialsSafe(ctx.organizationId, id.data);
    return NextResponse.json({ success: true, item, can_edit: isOrgAdmin(ctx) });
  } catch (err) {
    return serviceError(err, '[transport/carriers/credentials GET]');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    const res = orgError(err);
    if (res) return res;
    throw err;
  }

  if (!isOrgAdmin(ctx)) {
    return NextResponse.json(
      { success: false, error: 'Solo administradores pueden guardar credenciales' },
      { status: 403 }
    );
  }

  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) {
    return NextResponse.json({ success: false, error: 'Id de transportadora inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Body inválido', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const item = await saveCarrierCredentials(ctx.organizationId, id.data, {
      environment: parsed.data.environment,
      username: parsed.data.username ?? null,
      accountNumber: parsed.data.accountNumber ?? null,
      apiKey: parsed.data.apiKey ?? null,
      webhookSecret: parsed.data.webhookSecret ?? null,
    });
    return NextResponse.json({ success: true, item });
  } catch (err) {
    return serviceError(err, '[transport/carriers/credentials PUT]');
  }
}
