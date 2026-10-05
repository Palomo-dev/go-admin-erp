import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';

/**
 * Retirada (2026-10-05, seguridad de organización bloque 1): cambiaba el plan de la
 * suscripción y los módulos sin pasar por el pago. Ninguna pantalla la usaba. Los
 * cambios de plan van por Stripe (`/api/stripe/create-checkout-session` y el webhook).
 */
export const POST = withOrg(async () =>
  NextResponse.json(
    { error: 'Esta ruta ya no existe. Cambia de plan desde Organización › Plan y facturación.', code: 'RUTA_RETIRADA' },
    { status: 410 },
  ),
);
