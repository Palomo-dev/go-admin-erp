/**
 * API para transferir método de pago entre customers de Stripe
 * Útil cuando se crearon múltiples customers para el mismo usuario
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';

/**
 * POST: Transferir método de pago de un customer a otro
 */
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe no está configurado. Verifica STRIPE_SECRET_KEY.' },
        { status: 500 }
      );
    }

    const { sourceCustomerId, targetCustomerId } = await request.json();

    if (!sourceCustomerId || !targetCustomerId) {
      return NextResponse.json(
        { success: false, error: 'Se requieren sourceCustomerId y targetCustomerId' },
        { status: 400 }
      );
    }

    console.log('🔄 Transfiriendo métodos de pago de', sourceCustomerId, 'a', targetCustomerId);

    // 1. Obtener métodos de pago del customer origen
    const paymentMethods = await stripe.paymentMethods.list({
      customer: sourceCustomerId,
      type: 'card',
    });

    if (paymentMethods.data.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'El customer origen no tiene métodos de pago',
        sourceCustomerId,
      });
    }

    console.log('📋 Métodos encontrados:', paymentMethods.data.length);

    const transferredMethods = [];

    // 2. Transferir cada método de pago
    for (const pm of paymentMethods.data) {
      try {
        // Desasociar del customer origen
        await stripe.paymentMethods.detach(pm.id);
        console.log('✅ Método', pm.id, 'desasociado de', sourceCustomerId);

        // Asociar al customer destino
        await stripe.paymentMethods.attach(pm.id, {
          customer: targetCustomerId,
        });
        console.log('✅ Método', pm.id, 'asociado a', targetCustomerId);

        transferredMethods.push({
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
        });
      } catch (err: any) {
        console.error('❌ Error transfiriendo método', pm.id, ':', err.message);
      }
    }

    // 3. Establecer el primer método como default
    if (transferredMethods.length > 0) {
      await stripe.customers.update(targetCustomerId, {
        invoice_settings: {
          default_payment_method: transferredMethods[0].id,
        },
      });
      console.log('✅ Método', transferredMethods[0].id, 'establecido como default');
    }

    return NextResponse.json({
      success: true,
      transferred: transferredMethods.length,
      methods: transferredMethods,
    });

  } catch (error: any) {
    console.error('❌ Error transfiriendo métodos de pago:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET: Verificar métodos de pago de múltiples customers por email
 */
export async function GET(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe no está configurado. Verifica STRIPE_SECRET_KEY.' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Se requiere email' },
        { status: 400 }
      );
    }

    // Buscar todos los customers con este email
    const customers = await stripe.customers.list({
      email: email,
      limit: 10,
    });

    const result = [];

    for (const customer of customers.data) {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customer.id,
        type: 'card',
      });

      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 5,
      });

      result.push({
        customerId: customer.id,
        email: customer.email,
        name: customer.name,
        created: new Date(customer.created * 1000).toISOString(),
        paymentMethods: paymentMethods.data.map(pm => ({
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
        })),
        subscriptions: subscriptions.data.map(sub => ({
          id: sub.id,
          status: sub.status,
        })),
        metadata: customer.metadata,
      });
    }

    return NextResponse.json({
      success: true,
      email,
      customers: result,
    });

  } catch (error: any) {
    console.error('❌ Error verificando customers:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
