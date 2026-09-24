// ============================================================
// POST /api/integrations/google-ads/upload-conversion
// Sube una conversión offline a la cuenta de Google Ads de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes NO tenía autenticación en el handler:
// cualquiera subía conversiones a la cuenta de otra organización con solo
// conocer el id de su conexión. Ahora sesión validada (`withOrg`),
// organización ajena en body o query → 403 y registro, permiso
// `integrations.edit` y la conexión tiene que ser `google_ads` de la
// organización (404 si no).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { googleAdsService } from '@/lib/services/integrations/google-ads';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_INTEGRACIONES_EDITAR,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/google-ads/upload-conversion';

type Conversion = Parameters<typeof googleAdsService.uploadSingleConversion>[1];

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_INTEGRACIONES_EDITAR, RUTA);

    const conversion = body.conversion as Partial<Conversion> | undefined;
    if (!conversion || typeof conversion !== 'object') {
      return NextResponse.json({ error: 'conversion es requerido' }, { status: 400 });
    }

    // Validar campos mínimos
    const { conversionDateTime, conversionValue, currencyCode } = conversion;
    if (!conversionDateTime || conversionValue === undefined || !currencyCode) {
      return NextResponse.json(
        { error: 'conversionDateTime, conversionValue y currencyCode son requeridos' },
        { status: 400 }
      );
    }

    // Al menos gclid o userIdentifiers
    if (!conversion.gclid && (!conversion.userIdentifiers || conversion.userIdentifiers.length === 0)) {
      return NextResponse.json(
        { error: 'Se requiere gclid o userIdentifiers (hashedEmail/hashedPhoneNumber)' },
        { status: 400 }
      );
    }

    const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.googleAds, RUTA);
    const result = await googleAdsService.uploadSingleConversion(conexion.id, {
      conversionDateTime,
      conversionValue,
      currencyCode,
      gclid: conversion.gclid,
      orderId: conversion.orderId,
      userIdentifiers: conversion.userIdentifiers,
    } as Conversion);

    return NextResponse.json({ success: true, result });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
});
