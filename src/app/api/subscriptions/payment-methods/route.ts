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
 *
 * `create-setup-intent` y `confirmar-tarjeta` vinculan una tarjeta desde Plan
 * cuando el alta no la guardó. El cliente de Stripe es el de la organización
 * de la sesión (se crea y se persiste si faltaba). No se cobra ni se abre
 * otra suscripción. El SetupIntent tiene que ser de ese cliente: un id ajeno
 * responde 404.
 */

import { NextResponse } from 'next/server';
import {
  getCustomerPaymentMethods,
  deletePaymentMethod,
  updateSubscriptionPaymentMethod,
} from '@/lib/stripe/subscriptionService';
import { contextoDeFacturacion } from '@/lib/stripe/contextoFacturacion';
import { requireStripe } from '@/lib/stripe/server';
import { parametrosSetupIntent, MedioDePagoAjenoError, idDe } from '@/lib/stripe/medioDePagoSuscripcion';
import {
  ORIGEN_VINCULAR_PLAN,
  SetupIntentAjenoError,
  TarjetaNoConfirmadaError,
  confirmarTarjetaDelPlan,
  conPredeterminada,
  esRecursoInexistente,
  idSetupIntentValido,
  parametrosClienteDePlan,
} from '@/lib/stripe/vincularTarjetaPlan';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { checkRateLimits } from '@/lib/security/rateLimit';
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';

const RUTA = 'subscriptions/payment-methods';
const LIMITE_VINCULAR = { limit: 15, windowMs: 15 * 60 * 1000 };

type FilaSuscripcion = {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

/** Suscripción más reciente de la organización (service role tras validar la sesión). */
async function filaSuscripcion(organizationId: number): Promise<FilaSuscripcion | null> {
  const { data, error } = await getServiceClient()
    .from('subscriptions')
    .select('id, stripe_customer_id, stripe_subscription_id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[${RUTA}] suscripción`, error.message);
    throw new Error('No se pudo leer la suscripción');
  }
  return (data as FilaSuscripcion | null) ?? null;
}

async function clienteVivo(customerId: string): Promise<boolean> {
  try {
    const cliente = await requireStripe().customers.retrieve(customerId);
    return !('deleted' in cliente && cliente.deleted === true);
  } catch (error: unknown) {
    if (esRecursoInexistente(error)) return false;
    throw error;
  }
}

/**
 * Cliente de Stripe de la organización. Si la fila no tiene uno (o el id ya
 * no existe), se crea y se escribe en ESA fila. No pisa un id que otra
 * petición haya guardado en el medio.
 */
async function asegurarCliente(ctx: ServerOrgContext, fila: FilaSuscripcion): Promise<string> {
  if (fila.stripe_customer_id && (await clienteVivo(fila.stripe_customer_id))) {
    return fila.stripe_customer_id;
  }

  const { data: org, error: orgError } = await getServiceClient()
    .from('organizations')
    .select('name, email')
    .eq('id', ctx.organizationId)
    .maybeSingle();
  if (orgError) {
    console.error(`[${RUTA}] organización`, orgError.message);
    throw new Error('No se pudo leer la organización');
  }

  const customer = await requireStripe().customers.create(
    parametrosClienteDePlan({
      organizationId: ctx.organizationId,
      name: (typeof org?.name === 'string' && org.name) || ctx.organizationName,
      email: (typeof org?.email === 'string' && org.email) || ctx.userEmail,
    }),
  );

  let escritura = getServiceClient()
    .from('subscriptions')
    .update({ stripe_customer_id: customer.id })
    .eq('id', fila.id)
    .eq('organization_id', ctx.organizationId);
  escritura = fila.stripe_customer_id
    ? escritura.eq('stripe_customer_id', fila.stripe_customer_id)
    : escritura.is('stripe_customer_id', null);

  const { data: escrita, error: errorEscritura } = await escritura.select('id').maybeSingle();
  if (errorEscritura) {
    console.error(`[${RUTA}] guardar cliente`, errorEscritura.message);
    throw new Error('No se pudo guardar el cliente de facturación');
  }
  if (escrita) return customer.id;

  const deNuevo = await filaSuscripcion(ctx.organizationId);
  if (deNuevo?.stripe_customer_id && (await clienteVivo(deNuevo.stripe_customer_id))) {
    console.warn(`[${RUTA}] el cliente ya estaba guardado; se usa ese`, { organizationId: ctx.organizationId });
    return deNuevo.stripe_customer_id;
  }
  throw new Error('No se pudo guardar el cliente de facturación');
}

function sinSuscripcion() {
  return NextResponse.json({ error: 'No hay suscripción para vincular la tarjeta', code: 'SIN_SUSCRIPCION' }, { status: 404 });
}

function ajena() {
  return NextResponse.json({ error: 'Método de pago no encontrado', code: 'TARJETA_AJENA' }, { status: 404 });
}

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get('organizationId');
    const ctx = await contextoDeFacturacion(organizationId, RUTA);

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe no está configurado', paymentMethods: [] }, { status: 200 });
    }

    const fila = await filaSuscripcion(ctx.organizationId);
    if (!fila?.stripe_customer_id) {
      return NextResponse.json({ success: true, paymentMethods: [] });
    }

    const result = await getCustomerPaymentMethods(fila.stripe_customer_id);
    let predeterminada: string | undefined;
    try {
      const cliente = await requireStripe().customers.retrieve(fila.stripe_customer_id);
      if (!('deleted' in cliente && cliente.deleted === true)) {
        predeterminada = idDe(cliente.invoice_settings?.default_payment_method);
      }
    } catch (error: unknown) {
      console.warn(`[${RUTA}] no se pudo leer la tarjeta predeterminada`, error instanceof Error ? error.message : String(error));
    }

    return NextResponse.json({
      success: true,
      paymentMethods: conPredeterminada(result.paymentMethods || [], predeterminada),
    });
  } catch (err) {
    return routeErrorResponse(RUTA, err);
  }
}

export async function POST(request: Request) {
  try {
    let body: { organizationId?: unknown; action?: unknown; paymentMethodId?: unknown; setupIntentId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const ctx = await contextoDeFacturacion(body.organizationId, RUTA);
    const action = typeof body.action === 'string' ? body.action : '';
    const paymentMethodId = typeof body.paymentMethodId === 'string' ? body.paymentMethodId : '';
    const setupIntentId = typeof body.setupIntentId === 'string' ? body.setupIntentId : '';

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe no está configurado' }, { status: 503 });
    }

    const fila = await filaSuscripcion(ctx.organizationId);

    if (action === 'create-setup-intent') {
      if (!fila) return sinSuscripcion();
      const cupo = await checkRateLimits([{ key: `subscriptions:vincular:org:${ctx.organizationId}`, opts: LIMITE_VINCULAR }]);
      if (!cupo.allowed) {
        return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta en unos minutos.', code: 'DEMASIADAS' }, { status: 429 });
      }
      const customerId = await asegurarCliente(ctx, fila);
      const setupIntent = await requireStripe().setupIntents.create(
        parametrosSetupIntent(customerId, {
          source: ORIGEN_VINCULAR_PLAN,
          organizationId: String(ctx.organizationId),
        }),
      );
      if (!setupIntent.client_secret) {
        return NextResponse.json({ error: 'Error procesando la solicitud' }, { status: 500 });
      }
      return NextResponse.json({ success: true, clientSecret: setupIntent.client_secret });
    }

    if (action === 'confirmar-tarjeta') {
      if (!idSetupIntentValido(setupIntentId)) {
        return NextResponse.json({ error: 'setupIntentId es requerido' }, { status: 400 });
      }
      if (!fila?.stripe_customer_id) return sinSuscripcion();
      try {
        await confirmarTarjetaDelPlan(requireStripe(), {
          customerId: fila.stripe_customer_id,
          organizationId: ctx.organizationId,
          subscriptionId: fila.stripe_subscription_id,
          setupIntentId,
        });
      } catch (error: unknown) {
        if (error instanceof SetupIntentAjenoError || error instanceof MedioDePagoAjenoError || esRecursoInexistente(error)) {
          console.warn(`[${RUTA}] tarjeta ajena → 404`, { organizationId: ctx.organizationId, userId: ctx.userId });
          return ajena();
        }
        if (error instanceof TarjetaNoConfirmadaError) {
          return NextResponse.json({ error: 'La tarjeta no quedó confirmada', code: 'TARJETA_NO_CONFIRMADA' }, { status: 409 });
        }
        throw error;
      }
      return NextResponse.json({ success: true });
    }

    const customerId = fila?.stripe_customer_id;
    if (!fila || !customerId) {
      return NextResponse.json({ error: 'No hay información de facturación disponible' }, { status: 404 });
    }

    /** El método debe ser del cliente de Stripe de la organización de la sesión. */
    const esDeLaOrganizacion = async (): Promise<boolean> => {
      const propios = await getCustomerPaymentMethods(customerId);
      return (propios.paymentMethods ?? []).some((pm) => pm.id === paymentMethodId);
    };

    let result: { success: boolean; error?: string; [k: string]: unknown };

    switch (action) {
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
        if (!paymentMethodId || !fila.stripe_subscription_id) {
          return NextResponse.json({ error: 'paymentMethodId y suscripción son requeridos' }, { status: 400 });
        }
        if (!(await esDeLaOrganizacion())) {
          console.warn(`[${RUTA}] método de pago ajeno → 404`, { organizationId: ctx.organizationId, userId: ctx.userId });
          return NextResponse.json({ error: 'Método de pago no encontrado' }, { status: 404 });
        }
        result = await updateSubscriptionPaymentMethod(fila.stripe_subscription_id, paymentMethodId);
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
