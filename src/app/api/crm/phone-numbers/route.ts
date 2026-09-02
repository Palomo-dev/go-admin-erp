import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getPhoneNumbers,
  createPhoneNumber,
  type PhoneNumberCreateInput,
} from '@/lib/services/crm/callManagementService';

/**
 * GET /api/crm/phone-numbers — Lista los números telefónicos de la organización.
 */
export async function GET() {
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

  try {
    const numbers = await getPhoneNumbers(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: numbers }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Phone Numbers] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/phone-numbers — Registra un número telefónico.
 *
 * Body: { e164, provider, provider_sid?, capabilities?, assigned_user_id?, label?, is_primary?, is_active? }
 */
export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json();

    if (!body?.e164 || !body?.provider) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: e164, provider' },
        { status: 400 }
      );
    }

    const phoneNumber = await createPhoneNumber(
      ctx.organizationId,
      body as PhoneNumberCreateInput,
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: phoneNumber }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Phone Numbers] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
