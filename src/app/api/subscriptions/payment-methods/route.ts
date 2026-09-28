/**
 * Métodos de pago (Stripe) de la suscripción de una organización.
 *
 * GO-sec (auditoría 2026-09-24):
 *  - GET no comprobaba nada y leía con service role: cualquier usuario con
 *    sesión listaba las tarjetas (marca, últimos 4, vencimiento) de CUALQUIER
 *    organización. Ahora exige membresía activa y permiso de facturación.
 *  - POST decidía el permiso con `role_id !== 2` (dejaba fuera al rol 1 y a
 *    los cargos con permiso) y con `auth.getSession()` (sin verificar). Ahora
 *    usa `contextoDeFacturacion` (sesión verificada, admin o
 *    `billing_management` resuelto en la base).
 *  - `delete` y `set-default` desasociaban o fijaban el `paymentMethodId` que
 *    mandara el cliente, fuera de quien fuera. Ahora solo se aceptan métodos
 *    del cliente de Stripe de ESA organización (404 si no).
 */

import { NextResponse } from 'next/server';
import {
  getCustomerPaymentMethods,
  createSetupIntent,
  deletePaymentMethod,
  updateSubscriptionPaymentMethod,
} from '@/lib/stripe/subscriptionService';
import { contextoDeFacturacion } from '@/lib/stripe/contextoFacturacion';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { getServiceClient } from '@/lib/supabase/server-service';

const RUTA = 'subscriptions/payment-methods';

/** Suscripción más reciente con cliente de Stripe (service role tras validar la organización). */
async function suscripcionDe(organizationId: number) {
  const { data } = await getServiceClient()
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('organization_id', organizationId)
    .not('stripe_customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { stripe_customer_id: string; stripe_subscription_id: string | null } | null;
}

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get('organizationId');
    const ctx = await contextoDeFacturacion(organizationId, RUTA);

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe no está configurado', paymentMethods: [] }, { status: 200 });
    }

    const subscription = await suscripcionDe(ctx.organizationId);
    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({ success: true, paymentMethods: [] });
    }

    const result = await getCustomerPaymentMethods(subscription.stripe_customer_id);
    return NextResponse.json({ success: true, paymentMethods: result.paymentMethods || [] });
  } catch (err) {
    return routeErrorResponse(RUTA, err);
  }
}

export async function POST(request: Request) {
  try {
    let body: { organizationId?: unknown; action?: unknown; paymentMethodId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const ctx = await contextoDeFacturacion(body.organizationId, RUTA);
    const action = typeof body.action === 'string' ? body.action : '';
    const paymentMethodId = typeof body.paymentMethodId === 'string' ? body.paymentMethodId : '';

    const subscription = await suscripcionDe(ctx.organizationId);
    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({ error: 'No hay información de facturación disponible' }, { status: 404 });
    }

    /** El método debe ser del cliente de Stripe de la organización de la sesión. */
    const esDeLaOrganizacion = async (): Promise<boolean> => {
      const propios = await getCustomerPaymentMethods(subscription.stripe_customer_id);
      return (propios.paymentMethods ?? []).some((pm) => pm.id === paymentMethodId);
    };

    let result: { success: boolean; error?: string; [k: string]: unknown };

    switch (action) {
      case 'create-setup-intent':
        result = await createSetupIntent(subscription.stripe_customer_id);
        break;

      case 'delete':
        if (!paymentMethodId) {
          return NextResponse.json({ error: 'paymentMethodId es requerido para eliminar' }, { status: 400 });
        }
        if (!(await esDeLaOrganizacion())) {
          console.warn(`[${RUTA}] método de pago ajeno → 404`, { organizationId: ctx.organizationId, userId: ctx.userId });
          return NextResponse.json({ error: 'Método de pago no encontrado' }, { status: 404 });
        }
        result = await deletePaymentMethod(paymentMethodId);
        break;

      case 'set-default':
        if (!paymentMethodId || !subscription.stripe_subscription_id) {
          return NextResponse.json({ error: 'paymentMethodId y suscripción son requeridos' }, { status: 400 });
        }
        if (!(await esDeLaOrganizacion())) {
          console.warn(`[${RUTA}] método de pago ajeno → 404`, { organizationId: ctx.organizationId, userId: ctx.userId });
          return NextResponse.json({ error: 'Método de pago no encontrado' }, { status: 404 });
        }
        result = await updateSubscriptionPaymentMethod(subscription.stripe_subscription_id, paymentMethodId);
        break;

      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }

    if (!result?.success) {
      console.error(`[${RUTA}] ${action} falló:`, result?.error);
      return NextResponse.json({ error: 'Error procesando la solicitud' }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    return routeErrorResponse(RUTA, err);
  }
}
