import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  updatePhoneNumber,
  deletePhoneNumber,
  type PhoneNumberUpdateInput,
} from '@/lib/services/crm/callManagementService';

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

  try {
    const { id } = await params;
    const body = await request.json();

    const phoneNumber = await updatePhoneNumber(
      id,
      ctx.organizationId,
      body as PhoneNumberUpdateInput,
      ctx.supabase
    );

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'Número telefónico no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: phoneNumber }, { status: 200 });
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
