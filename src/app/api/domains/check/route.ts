/**
 * API para verificar disponibilidad y precio de dominios usando Vercel Registrar API
 */

import { NextRequest, NextResponse } from 'next/server';

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

export async function POST(request: NextRequest) {
  try {
    if (!VERCEL_API_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'VERCEL_API_TOKEN no configurado' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { domain } = body;

    if (!domain) {
      return NextResponse.json(
        { success: false, error: 'El dominio es requerido' },
        { status: 400 }
      );
    }

    // Normalizar dominio
    const normalizedDomain = domain.toLowerCase().trim();

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
    console.error('Error en check domain:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
