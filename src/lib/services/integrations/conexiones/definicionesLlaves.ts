/**
 * Proveedores que se conectan pegando llaves (asistente «llaves» del diseño 85-03…12).
 * Módulo puro: lo usan el asistente (navegador) y el route handler (servidor).
 *
 * - `proposito`: el `integration_credentials.purpose` que LEE el servicio del proveedor hoy
 *   (verificado contra `*Config.ts` de cada uno el 2026-11-07). No se inventa ninguno.
 * - `guardado`:
 *     · 'como_hoy': el valor va en `secret_ref`, escrito por el SERVIDOR (service role) tras validar
 *       la organización. Es la forma que leen la tienda web (repositorio goadmin-websites:
 *       `app/api/checkout/init` y `app/api/webhooks/*` leen `secret_ref` en claro) y el POS. Mudar
 *       estas pasarelas a la bóveda rompería la tienda: queda para cuando ese lector sea dual.
 *     · 'boveda': `fn_set_provider_secret`; todos sus lectores están en este repositorio y son duales.
 * - `webhook`: ruta REAL de este repositorio (prueba: urlsWebhook.test.ts comprueba el archivo).
 * - `metodoPago`: `payment_methods.code` que se enlaza en «Dónde se usa». Stripe → 'stripe', nunca
 *   'card' (la tienda usa 'card' para Wompi).
 */
export type Ambiente = 'sandbox' | 'production';
export type ProveedorLlaves = 'wompi' | 'mercadopago' | 'payu' | 'stripe' | 'paypal' | 'sendgrid';

export interface CampoLlave {
  proposito: string;
  tipoCredencial: 'api_key' | 'secret' | 'private_key' | 'webhook_secret' | 'custom';
  secreto: boolean;
  requerido: boolean;
  /** Prefijo esperado por ambiente; vacío = sin validación de forma. */
  prefijos?: Partial<Record<Ambiente, string[]>>;
}

export interface DefinicionLlaves {
  proveedor: ProveedorLlaves;
  conector: string;
  ambientes: Ambiente[];
  campos: CampoLlave[];
  guardado: 'como_hoy' | 'boveda';
  webhook: string | null;
  metodoPago: string | null;
  /** Dónde puede usarse: tienda web y/o punto de venta. */
  usos: ('tienda' | 'pos')[];
}

export const LLAVES: Record<ProveedorLlaves, DefinicionLlaves> = {
  wompi: {
    proveedor: 'wompi',
    conector: 'wompi_co',
    ambientes: ['sandbox', 'production'],
    campos: [
      { proposito: 'public_key', tipoCredencial: 'api_key', secreto: false, requerido: true, prefijos: { sandbox: ['pub_test_'], production: ['pub_prod_'] } },
      { proposito: 'private_key', tipoCredencial: 'api_key', secreto: true, requerido: true, prefijos: { sandbox: ['prv_test_'], production: ['prv_prod_'] } },
      { proposito: 'events_secret', tipoCredencial: 'secret', secreto: true, requerido: true, prefijos: { sandbox: ['test_events_'], production: ['prod_events_'] } },
      { proposito: 'integrity_secret', tipoCredencial: 'secret', secreto: true, requerido: true, prefijos: { sandbox: ['test_integrity_'], production: ['prod_integrity_'] } },
    ],
    guardado: 'como_hoy',
    webhook: '/api/integrations/wompi/webhook',
    metodoPago: 'wompi',
    usos: ['tienda', 'pos'],
  },
  mercadopago: {
    proveedor: 'mercadopago',
    conector: 'mp_checkout',
    ambientes: ['sandbox', 'production'],
    campos: [
      { proposito: 'public_key', tipoCredencial: 'api_key', secreto: false, requerido: true, prefijos: { sandbox: ['TEST-'], production: ['APP_USR-'] } },
      { proposito: 'access_token', tipoCredencial: 'api_key', secreto: true, requerido: true, prefijos: { sandbox: ['TEST-'], production: ['APP_USR-'] } },
      { proposito: 'webhook_secret', tipoCredencial: 'webhook_secret', secreto: true, requerido: false },
    ],
    guardado: 'como_hoy',
    webhook: '/api/integrations/mercadopago/webhook',
    metodoPago: 'mp',
    usos: ['tienda'],
  },
  payu: {
    proveedor: 'payu',
    conector: 'payu_co',
    ambientes: ['sandbox', 'production'],
    campos: [
      { proposito: 'api_key', tipoCredencial: 'api_key', secreto: true, requerido: true },
      { proposito: 'api_login', tipoCredencial: 'custom', secreto: true, requerido: true },
      { proposito: 'merchant_id', tipoCredencial: 'custom', secreto: false, requerido: true },
      { proposito: 'account_id', tipoCredencial: 'custom', secreto: false, requerido: true },
    ],
    guardado: 'como_hoy',
    webhook: '/api/integrations/payu/webhook',
    metodoPago: 'payu',
    usos: ['tienda'],
  },
  stripe: {
    proveedor: 'stripe',
    conector: 'stripe_payments',
    ambientes: ['sandbox', 'production'],
    campos: [
      { proposito: 'publishable_key', tipoCredencial: 'api_key', secreto: false, requerido: true, prefijos: { sandbox: ['pk_test_'], production: ['pk_live_'] } },
      { proposito: 'secret_key', tipoCredencial: 'secret', secreto: true, requerido: true, prefijos: { sandbox: ['sk_test_', 'rk_test_'], production: ['sk_live_', 'rk_live_'] } },
      { proposito: 'webhook_secret', tipoCredencial: 'webhook_secret', secreto: true, requerido: false, prefijos: { sandbox: ['whsec_'], production: ['whsec_'] } },
    ],
    guardado: 'como_hoy',
    webhook: '/api/integrations/stripe/webhook',
    metodoPago: 'stripe',
    usos: ['tienda'],
  },
  paypal: {
    proveedor: 'paypal',
    conector: 'paypal_checkout',
    ambientes: ['sandbox', 'production'],
    campos: [
      { proposito: 'client_id', tipoCredencial: 'api_key', secreto: false, requerido: true },
      { proposito: 'client_secret', tipoCredencial: 'secret', secreto: true, requerido: true },
      { proposito: 'webhook_id', tipoCredencial: 'custom', secreto: false, requerido: false },
    ],
    guardado: 'como_hoy',
    webhook: '/api/integrations/paypal/webhook',
    metodoPago: 'paypal',
    usos: ['tienda'],
  },
  sendgrid: {
    proveedor: 'sendgrid',
    conector: 'sendgrid_email',
    ambientes: ['production'],
    campos: [
      { proposito: 'api_key', tipoCredencial: 'api_key', secreto: true, requerido: true, prefijos: { production: ['SG.'] } },
      { proposito: 'from_email', tipoCredencial: 'custom', secreto: false, requerido: true },
      { proposito: 'from_name', tipoCredencial: 'custom', secreto: false, requerido: false },
    ],
    guardado: 'como_hoy',
    webhook: '/api/integrations/sendgrid/webhook',
    metodoPago: null,
    usos: [],
  },
};

export function esProveedorLlaves(v: unknown): v is ProveedorLlaves {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(LLAVES, v);
}

export type ErrorFormato = { proposito: string; motivo: 'requerido' | 'prefijo' | 'largo' | 'ambiente' };

/** Validación de forma (sin red). Los mensajes los pone la UI por `motivo`. */
export function validarFormatoLlaves(proveedor: ProveedorLlaves, ambiente: Ambiente, valores: Record<string, string>): ErrorFormato[] {
  const def = LLAVES[proveedor];
  const errores: ErrorFormato[] = [];
  for (const c of def.campos) {
    const v = (valores[c.proposito] ?? '').trim();
    if (!v) {
      if (c.requerido) errores.push({ proposito: c.proposito, motivo: 'requerido' });
      continue;
    }
    if (v.length > 500) errores.push({ proposito: c.proposito, motivo: 'largo' });
    const prefijos = c.prefijos?.[ambiente];
    if (prefijos && prefijos.length > 0 && !prefijos.some((p) => v.startsWith(p))) {
      // Llave del OTRO ambiente (p. ej. pub_test_ con «Producción»): error propio, más claro.
      const otro: Ambiente = ambiente === 'production' ? 'sandbox' : 'production';
      const delOtro = (c.prefijos?.[otro] ?? []).some((p) => v.startsWith(p) && !prefijos.some((q) => v.startsWith(q)));
      errores.push({ proposito: c.proposito, motivo: delOtro ? 'ambiente' : 'prefijo' });
    }
  }
  return errores;
}

/** Primer prefijo esperado (para el texto de ayuda «Empieza por …»). */
export function prefijoEsperado(campo: CampoLlave, ambiente: Ambiente): string | null {
  return campo.prefijos?.[ambiente]?.[0] ?? null;
}
