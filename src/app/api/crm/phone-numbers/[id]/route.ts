import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  updatePhoneNumber,
  deletePhoneNumber,
  type PhoneNumberUpdateInput,
} from '@/lib/services/crm/callManagementService';
import { isOrgAdmin } from '@/lib/utils/rbac';
import { syncNumberWebhooks } from '@/lib/services/crm/phoneNumberService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_PATCH_KEYS = ['label', 'assigned_user_id', 'is_primary', 'is_active'] as const;

/**
 * PATCH /api/crm/phone-numbers/[id] — Actualiza un número telefónico.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  if (!isOrgAdmin(ctx) && !ctx.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Solo un administrador puede editar números' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // F3: solo label/assigned_user_id/is_primary/is_active (e164/provider_sid vienen de Twilio).
    const body: PhoneNumberUpdateInput = {};
    for (const k of ALLOWED_PATCH_KEYS) if (raw[k] !== undefined) (body as Record<string, unknown>)[k] = raw[k];
    if (body.assigned_user_id) {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .eq('user_id', body.assigned_user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (!member) return NextResponse.json({ success: false, error: 'El usuario no es miembro activo de la organización' }, { status: 400 });
    }
    if (body.is_primary === true) {
      await ctx.supabase.from('phone_numbers').update({ is_primary: false }).eq('organization_id', ctx.organizationId).neq('id', id);
    }

    const phoneNumber = await updatePhoneNumber(id, ctx.organizationId, body, ctx.supabase);

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'Número telefónico no encontrado' },
        { status: 404 }
      );
    }

    // Al activar/asignar, cablea VoiceUrl/StatusCallback en Twilio (best-effort).
    let webhooksSynced = false;
    if (phoneNumber.is_active && phoneNumber.provider_sid && (body.is_active === true || body.assigned_user_id !== undefined)) {
      try {
        await syncNumberWebhooks(ctx.organizationId, phoneNumber.provider_sid);
        webhooksSynced = true;
      } catch (err) {
        console.warn('[CRM Phone Numbers] syncNumberWebhooks:', err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ success: true, data: phoneNumber, webhooks_synced: webhooksSynced }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Phone Numbers] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/phone-numbers/[id] — Elimina un número telefónico.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  if (!isOrgAdmin(ctx) && !ctx.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Solo un administrador puede eliminar números' }, { status: 403 });
  }

  try {
    const { id } = await params;

    await deletePhoneNumber(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Phone Numbers] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
