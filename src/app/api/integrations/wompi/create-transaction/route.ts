// ============================================================
// POST /api/integrations/wompi/create-transaction
// Crea una transacción en Wompi con la conexión de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes solo comprobaba `auth.getSession()`,
// cobraba con el `connectionId` del body (cualquier organización) y generaba
// la referencia con la organización de ESA conexión. Ahora: sesión validada
// (`withOrg`), organización ajena en body o query → 403 y registro, permiso de
// cobro resuelto en el servidor, la conexión tiene que ser de la organización
// y de Wompi (404 si no) y la referencia se genera con la organización de la
// sesión. Las llaves (privada, integridad) salen de la conexión.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { wompiService } from '@/lib/services/integrations/wompi/wompiService';
import type {
  WompiPaymentMethod,
  WompiPaymentMethodType,
} from '@/lib/services/integrations/wompi/wompiTypes';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_COBRO,
  registrarError,
  textoDe,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/wompi/create-transaction';
const REFERENCIA_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,79}$/;
const CORREO_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

interface CreateTransactionBody {
  amountInCents?: unknown;
  customerEmail?: unknown;
  reference?: unknown;
  paymentMethod?: WompiPaymentMethod;
  paymentMethodType?: WompiPaymentMethodType;
  customerData?: {
    phone_number?: string;
    full_name?: string;
    legal_id?: string;
    legal_id_type?: string;
  };
  redirectUrl?: string;
  expirationTime?: string;
  connectionId?: unknown;
}

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<CreateTransactionBody>(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_COBRO, RUTA);

    const amountInCents = body.amountInCents;
    const customerEmail = textoDe(body.customerEmail);
    if (typeof amountInCents !== 'number' || !Number.isInteger(amountInCents) || !CORREO_RE.test(customerEmail) || !body.paymentMethod) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: connectionId, amountInCents (entero), customerEmail, paymentMethod' },
        { status: 400 },
      );
    }
    if (amountInCents < 100) {
      return NextResponse.json({ error: 'El monto mínimo es 100 centavos (1 COP)' }, { status: 400 });
    }
    const referenciaPedida = textoDe(body.reference);
    if (referenciaPedida && !REFERENCIA_RE.test(referenciaPedida)) {
      return NextResponse.json({ error: 'Referencia inválida' }, { status: 400 });
    }

    const conexion = await conexionDelProveedor(ctx, body.connectionId, CONECTORES.wompi, RUTA);
    const credentials = await wompiService.getCredentials(conexion.id, getServiceClient());
    if (!credentials) {
      return NextResponse.json(
        { error: 'La conexión de Wompi no tiene credenciales activas', code: 'CREDENCIALES_NO_CONFIGURADAS' },
        { status: 412 },
      );
    }

    // Tokens de aceptación (requeridos por ley colombiana)
    const acceptanceTokens = await wompiService.getAcceptanceTokens(credentials);
    if (!acceptanceTokens) {
      return NextResponse.json({ error: 'No se pudieron obtener tokens de aceptación de Wompi' }, { status: 502 });
    }

    const reference = referenciaPedida || wompiService.generateReference(ctx.organizationId);
    const signature = wompiService.generateIntegritySignature(
      reference,
      amountInCents,
      'COP',
      credentials.integritySecret,
      body.expirationTime,
    );

    const result = await wompiService.createTransaction(credentials, {
      acceptance_token: acceptanceTokens.acceptanceToken,
      accept_personal_auth: acceptanceTokens.acceptPersonalAuth,
      amount_in_cents: amountInCents,
      currency: 'COP',
      customer_email: customerEmail,
      reference,
      signature,
      payment_method: body.paymentMethod,
      payment_method_type: body.paymentMethodType,
      customer_data: body.customerData,
      redirect_url: body.redirectUrl,
      expiration_time: body.expirationTime,
    });

    if (!result) {
      return NextResponse.json({ error: 'Error al crear transacción en Wompi' }, { status: 502 });
    }

    return NextResponse.json({ success: true, transaction: result.data, reference });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
