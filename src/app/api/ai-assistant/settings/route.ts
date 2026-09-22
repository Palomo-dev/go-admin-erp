import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';
import { readOrgBody } from '@/lib/security/organizationBody';
import { checkRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

const capabilityLevel = z.enum(['off', 'read', 'write_low', 'write_full']);
const settingsPatch = z.object({
  capability_level: capabilityLevel,
}).strict();

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status, headers: { 'Cache-Control': 'private, no-store', ...headers },
  });
}

function failure(error: unknown) {
  if (error instanceof OrgContextError) {
    return json({ code: error.code, error: error.message }, error.statusCode);
  }
  // No exponer detalles de Postgres ni preferencias de la organización.
  console.error('[assistant/settings] No se pudo completar la operación');
  return json({ code: 'SETTINGS_FAILED', error: 'No se pudo guardar o consultar la configuración. Inténtalo de nuevo.' }, 500);
}

async function limit(organizationId: number, userId: string, method: string) {
  const result = await checkRateLimit(`assistant:settings:${method}:${organizationId}:${userId}`, {
    limit: method === 'PATCH' ? 10 : 60, windowMs: 60_000,
  });
  return result.allowed ? null : json({ code: 'RATE_LIMITED', error: 'Demasiadas solicitudes. Espera un momento.' }, 429, {
    'Retry-After': String(Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))),
  });
}

/** Sin fila, write_full; una elección explícita se conserva. Errores no conceden acceso. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    const blocked = await limit(ctx.organizationId, ctx.userId, 'GET');
    if (blocked) return blocked;
    const { data, error } = await ctx.supabase.from('ai_assistant_settings')
      .select('capability_level').eq('organization_id', ctx.organizationId).maybeSingle();
    if (error) return failure(error);
    const level = capabilityLevel.safeParse(data === null ? 'write_full' : data?.capability_level);
    if (!level.success) return failure(level.error);
    return json({ capability_level: level.data, can_manage: isOrgAdminLike(ctx) });
  } catch (error) {
    return failure(error);
  }
}

/** Solo nivel; sin service role, sin valores de tenant/rol aceptados del body. */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const blocked = await limit(ctx.organizationId, ctx.userId, 'PATCH');
    if (blocked) return blocked;
    const body: unknown = await readOrgBody(ctx, request);
    // Mismo criterio que la política RLS verificada de ai_assistant_settings.
    if (!isOrgAdminLike(ctx)) {
      return json({ code: 'FORBIDDEN', error: 'Solo un administrador de esta organización puede cambiar el nivel.' }, 403);
    }
    const parsed = settingsPatch.safeParse(body);
    if (!parsed.success) {
      return json({ code: 'INVALID_SETTINGS', error: 'Envía únicamente capability_level: off, read, write_low o write_full.' }, 400);
    }
    // ON CONFLICT actualiza solo estas columnas: conserva voz, modelos,
    // herramientas habilitadas y todas las demás preferencias existentes.
    const { data, error } = await ctx.supabase.from('ai_assistant_settings').upsert({
      organization_id: ctx.organizationId,
      capability_level: parsed.data.capability_level,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' }).select('capability_level').single();
    if (error?.code === '42501') {
      return json({ code: 'FORBIDDEN', error: 'No tienes permiso para modificar esta configuración.' }, 403);
    }
    if (error || !data) return failure(error);
    console.info('[assistant/settings] Nivel actualizado', {
      organizationId: ctx.organizationId, userId: ctx.userId, capabilityLevel: data.capability_level,
    });
    return json({ capability_level: data.capability_level, can_manage: true });
  } catch (error) {
    return failure(error);
  }
}
