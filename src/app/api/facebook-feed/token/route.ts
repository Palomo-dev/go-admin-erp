import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  regenerateFeedToken,
  getFeedConfig,
  getFeedCurrencies,
  getOrCreateFeedToken,
  setDefaultFeedCurrency,
  InvalidCurrencyError,
} from '@/lib/services/facebookFeedService';

/**
 * POST /api/facebook-feed/token
 * Body: { organization_id: number, action: 'get' | 'get_token' | 'get_currencies' | 'regenerate' | 'set_default_currency', currency?: string }
 *
 * - get: devuelve token + currencies + rate_date + default_currency (completo)
 * - get_token: devuelve SOLO el token (path rápido — solo membresía + token)
 * - get_currencies: devuelve SOLO currencies + rate_date + default_currency (sin token)
 * - regenerate: regenera el token y devuelve lo mismo que get
 * - set_default_currency: guarda la moneda por defecto del feed (requiere `currency`)
 *
 * `get_token` existe para que el dialog pueda renderizar la URL principal (legacy,
 * sin parámetro currency) lo antes posible, sin esperar a las 3 queries RLS de
 * monedas/tasas/preferencias. Las monedas se piden aparte con `get_currencies`.
 *
 * Usa el Supabase client del navegador (cookies de sesión) para que RLS aplique.
 * Valida explícitamente la membresía del usuario en la organización antes de
 * ejecutar cualquier acción con service role.
 */

/**
 * Valida que el usuario autenticado pertenezca a la organización indicada.
 * Consulta `organization_members` con el cliente de sesión (RLS aplica).
 */
async function validateOrgMembership(
  supabase: SupabaseClient,
  organizationId: number
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organization_id, action, currency } = body;

    if (!organization_id) {
      return NextResponse.json(
        { error: 'organization_id es requerido' },
        { status: 400 }
      );
    }

    const orgId = parseInt(organization_id, 10);
    if (isNaN(orgId)) {
      return NextResponse.json(
        { error: 'organization_id debe ser un número válido' },
        { status: 400 }
      );
    }

    // Cliente Supabase con cookies de sesión (RLS aplica automáticamente)
    const supabase = createRouteHandlerClient({ cookies });

    // Validar membresía del usuario en la organización antes de cualquier acción.
    // Esto aplica a TODAS las acciones (get, regenerate, set_default_currency).
    const isMember = await validateOrgMembership(supabase, orgId);
    if (!isMember) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes acceso a esta organización',
          },
        },
        { status: 403 }
      );
    }

    // ─── set_default_currency ───
    if (action === 'set_default_currency') {
      if (!currency || typeof currency !== 'string') {
        return NextResponse.json(
          { error: 'currency es requerido para set_default_currency' },
          { status: 400 }
        );
      }

      // Validar que sea un código de 3 letras
      if (!/^[A-Za-z]{3}$/.test(currency)) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_CURRENCY',
              message: `El código de moneda "${currency}" no es válido (debe ser 3 letras)`,
            },
          },
          { status: 400 }
        );
      }

      const normalizedCurrency = currency.toUpperCase();

      try {
        const result = await setDefaultFeedCurrency(
          orgId,
          normalizedCurrency,
          supabase
        );
        return NextResponse.json(result);
      } catch (error: unknown) {
        if (error instanceof InvalidCurrencyError) {
          return NextResponse.json(
            {
              error: {
                code: 'INVALID_CURRENCY',
                message: `La moneda ${normalizedCurrency} no está configurada para esta organización`,
              },
            },
            { status: 400 }
          );
        }
        throw error;
      }
    }

    // ─── get_token (path rápido: solo token, sin monedas) ───
    // Devuelve únicamente { success, token } para que el dialog pueda mostrar
    // la URL principal (legacy, sin currency) lo antes posible.
    if (action === 'get_token') {
      const token = await getOrCreateFeedToken(orgId);
      return NextResponse.json({ success: true, token });
    }

    // ─── get_currencies (monedas/tasas/default, sin token) ───
    // Devuelve { success, currencies, rate_date, default_currency }.
    // Se pide aparte del token para no bloquear la URL principal.
    if (action === 'get_currencies') {
      const cfg = await getFeedCurrencies(orgId, supabase);
      return NextResponse.json({
        success: true,
        currencies: cfg.currencies,
        rate_date: cfg.rateDate,
        default_currency: cfg.defaultCurrency,
      });
    }

    // ─── regenerate ───
    if (action === 'regenerate') {
      await regenerateFeedToken(orgId);
      // Devolver lo mismo que get (token nuevo + currencies + rate_date + default_currency)
      const config = await getFeedConfig(orgId, supabase);
      return NextResponse.json({
        success: true,
        token: config.token,
        currencies: config.currencies,
        rate_date: config.rateDate,
        default_currency: config.defaultCurrency,
      });
    }

    // ─── get (default) ───
    const config = await getFeedConfig(orgId, supabase);
    return NextResponse.json({
      success: true,
      token: config.token,
      currencies: config.currencies,
      rate_date: config.rateDate,
      default_currency: config.defaultCurrency,
    });
  } catch (error: unknown) {
    console.error('Error in POST /api/facebook-feed/token:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { error: 'Error interno del servidor', details: message },
      { status: 500 }
    );
  }
}
