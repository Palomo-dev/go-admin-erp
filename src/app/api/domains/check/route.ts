/**
 * API para verificar disponibilidad y precio de dominios usando Vercel Registrar API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { routeErrorResponse } from '@/lib/security/orgGuards';

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_frIu9xHSNGKf7olF1x4Fsvfh';

interface DomainCheckResult {
  domain: string;
  available: boolean;
  price: number | null;
  renewalPrice: number | null;
  currency: string;
  years: number;
  error?: string;
}

/**
 * Nombre de dominio estricto. El valor va en la RUTA de la API de Vercel con
 * el token de la plataforma: sin esta validación, `../..` o `?` en el dominio
 * apuntaban la llamada autenticada a otro endpoint de la cuenta.
 */
const DOMINIO_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * GO-sec (2026-09-24): sesión y organización activa (`getServerOrgContext`,
 * 401/403) antes de gastar el token de Vercel de la plataforma, y dominio
 * validado antes de meterlo en la URL.
 */
export async function POST(request: NextRequest) {
  try {
    await getServerOrgContext(request);

    if (!VERCEL_API_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'VERCEL_API_TOKEN no configurado' },
        { status: 500 }
      );
    }

    let body: { domain?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
    }

    // Normalizar dominio
    const normalizedDomain = typeof body.domain === 'string' ? body.domain.toLowerCase().trim() : '';

    if (!DOMINIO_RE.test(normalizedDomain)) {
      return NextResponse.json(
        { success: false, error: 'El dominio es requerido y debe ser válido' },
        { status: 400 }
      );
    }

    // Verificar disponibilidad
    const availabilityResponse = await fetch(
      `https://api.vercel.com/v1/registrar/domains/${normalizedDomain}/availability?teamId=${VERCEL_TEAM_ID}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${VERCEL_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!availabilityResponse.ok) {
      const errorData = await availabilityResponse.json().catch(() => ({}));
      console.error('Error verificando disponibilidad:', errorData);
      
      // Manejar errores específicos
      if (availabilityResponse.status === 400) {
        return NextResponse.json({
          success: true,
          data: {
            domain: normalizedDomain,
            available: false,
            price: null,
            renewalPrice: null,
            currency: 'USD',
            years: 1,
            error: errorData.message || 'TLD no soportado o dominio inválido',
          } as DomainCheckResult,
        });
      }
      
      return NextResponse.json(
        { success: false, error: errorData.message || 'Error verificando disponibilidad' },
        { status: availabilityResponse.status }
      );
    }

    const availabilityData = await availabilityResponse.json();

    // Si no está disponible, retornar resultado
    if (!availabilityData.available) {
      return NextResponse.json({
        success: true,
        data: {
          domain: normalizedDomain,
          available: false,
          price: null,
          renewalPrice: null,
          currency: 'USD',
          years: 1,
        } as DomainCheckResult,
      });
    }

    // Si está disponible, obtener precio
    const priceResponse = await fetch(
      `https://api.vercel.com/v1/registrar/domains/${normalizedDomain}/price?years=1&teamId=${VERCEL_TEAM_ID}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${VERCEL_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let priceData = { purchasePrice: null, renewalPrice: null };
    
    if (priceResponse.ok) {
      priceData = await priceResponse.json();
    } else {
      console.error('Error obteniendo precio:', await priceResponse.text());
    }

    return NextResponse.json({
      success: true,
      data: {
        domain: normalizedDomain,
        available: true,
        price: priceData.purchasePrice,
        renewalPrice: priceData.renewalPrice,
        currency: 'USD',
        years: 1,
      } as DomainCheckResult,
    });

  } catch (error: unknown) {
    return routeErrorResponse('domains/check', error);
  }
}
