import { NextRequest, NextResponse } from 'next/server';
import { googleAdsService } from '@/lib/services/integrations/google-ads';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connection_id, conversion } = body;

    if (!connection_id) {
      return NextResponse.json(
        { error: 'connection_id es requerido' },
        { status: 400 }
      );
    }

    if (!conversion) {
      return NextResponse.json(
        { error: 'conversion es requerido' },
        { status: 400 }
      );
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

    const result = await googleAdsService.uploadSingleConversion(connection_id, {
      conversionDateTime,
      conversionValue,
      currencyCode,
      gclid: conversion.gclid,
      orderId: conversion.orderId,
      userIdentifiers: conversion.userIdentifiers,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('[GoogleAds] Error subiendo conversión:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
